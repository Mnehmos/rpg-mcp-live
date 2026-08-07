# ADR-H21: Reviewed pack re-pin and historical replay

Status: accepted, deployed, and verified through live legacy-to-S8 migration  
Date: 2026-08-07

## Context

Modern campaign aggregates and events carry `open5e-pack@<sha256>` as their rules identity. Fresh Railway inspection found a still older persisted shape: all four production campaigns use `lantern-rules-0.1`, all 38 existing events omit `rulesVersion` and `contentKeys`, and no campaign or event contains a source-content marker. The deployed executable registers S1, while the local runtime now uses the S8 full-corpus pack. Silently loading old state under S8 would make prior outcomes depend on new bytes, and rewriting old events would destroy the evidence needed to audit them.

A pack upgrade must therefore solve two different problems:

1. old campaigns and events must remain readable under their original pack;
2. moving a live aggregate to a new pack must be an explicit, reviewed, atomic state transition.

## Decision

The engine installs an immutable pack registry containing the active S8 pack and the historical S1 and S7 packs. Registry lookup is exact by `rulesVersion` or pack hash. Pack-backed campaign projections use the campaign's pack; pack-backed event evidence uses the event's recorded pack.

`lantern-rules-0.1` is not treated as a content pack. A legacy aggregate remains readable through its persisted projection, and ordinary mutation rejects with `campaign_repin_required`. An event with no rules identity is accepted as legacy evidence only when it also claims no content keys. An unversioned event that claims content keys fails closed because no source pack can be proven.

Only the active pack accepts ordinary mutations. A campaign pinned to a historical pack remains readable, including content tools and hydrated event evidence, but mutating requests fail with `campaign_repin_required` and no version or state change.

Pack migration is an administrative workflow, not a DM tool. Pack-to-pack migration has three explicit stages:

1. `diff` compares normalized and compiled records, collection coverage, and pack identities, then emits a deterministic review SHA-256.
2. `plan` scans the exact persisted campaign for `{ packHash, contentKey }` references and classifies each key as identical, provenance-only, changed, missing-source, or missing-target.
3. `apply` requires the current review SHA-256 and explicit approval for every referenced changed key.

Missing source or target keys block migration. Unapproved changed keys block migration. A review-hash mismatch blocks migration. Every rejection leaves the aggregate, version, and event table unchanged.

An accepted migration executes through the existing SQLite command transaction. It:

- rewrites only matching persisted pack hashes;
- changes `rulesVersion` to the target pack;
- increments the aggregate version once;
- appends one system log entry;
- commits one `content_repin` event containing source identity, target identity, review hash, approved changed keys, and referenced content keys.

Existing event rows are never modified. The migration event is resolved under the target pack; older events continue to resolve under their own historical pack.

Legacy-to-pack migration uses the same transaction and confirmation boundary but cannot perform a source-pack diff. Its deterministic review pins the source identity, exact target pack, preconditions, transforms, and historical-event policy. `plan` recursively rejects any `contentKey`, `conditionContentKey`, `sourceContentKey`, `packHash`, or character source marker. An accepted legacy migration normalizes the content policy, changes only the aggregate rules identity, appends one system log entry and one target-pack `content_repin` event, and increments the aggregate once. It never invents source provenance or accepts `--approve-changed`.

## Deterministic compatibility rules

Records are compared by canonical serialized bytes and content key.

- `identical`: the bytes match exactly.
- `provenance-only`: bytes differ only in `sourceFetchedAt`.
- `changed`: the key exists in both packs but other canonical bytes differ.
- `missing-source`: persisted state claims a source reference absent from the source pack.
- `missing-target`: a source key has no target counterpart.

Compiled records are included in the same review. Source effect programs referenced through `sourceContentKey` and condition records referenced through `conditionContentKey` are collected alongside ordinary `contentKey` fields.

The review hash covers the full deterministic diff, not only keys currently used by one campaign. Campaign-specific approval still depends on the `plan` output so an unrelated corpus change does not require a state rewrite.

## Operational workflow

For the current hosted legacy-to-S8 upgrade:

~~~powershell
npm run open5e:repin -- diff --from lantern-rules-0.1 --to open5e-v2-full-corpus-s8 --out docs/generated/LANTERN-LEGACY-S8-MIGRATION.md

npm run open5e:repin -- plan --from lantern-rules-0.1 --to open5e-v2-full-corpus-s8 --database <database> --account <account-id> --campaign <campaign-id>

npm run open5e:repin -- apply --from lantern-rules-0.1 --to open5e-v2-full-corpus-s8 --database <database> --account <account-id> --campaign <campaign-id> --confirm-review-sha 1c7e72b9b6d57e2ca9de10e6bed524e2ba62272ef09adc1e4cffbceb86c8f38d
~~~

The legacy plan must report zero source-content markers and does not permit changed-key approval. Back up the Railway volume before the first production `apply`. Future pack-to-pack upgrades still require reviewing changed keys and regenerating the deterministic diff whenever either pack changes.

The pre-release dry-run used a consistent copy of the live SQLite database. All four campaigns were accepted and advanced exactly once; SQLite `quick_check` remained `ok`; 38 original event rows retained the same aggregate SHA-256 before and after; and the resulting 38 legacy plus four migration events all resolved without error.

The same workflow has now run live. The four campaigns advanced from versions 21, 17, 0, and 0 to 22, 18, 1, and 1. Commands increased from 42 to 46 and events from 38 to 42. A before/after digest over every original `(event_id, event_json)` pair remained `0597dbc4edf1007f766e10af164b8f89b5fb4addb98d01a043f1b7fd567b0c3d`. The independent auditor reports four active S8 aggregates, 38 legacy-unversioned events, four modern events, zero failures, and `quick_check: ok`.

## Consequences

- Deploying S8 code does not silently reinterpret old campaigns.
- Old campaigns remain usable for inspection while migration is reviewed.
- Historical events remain independently auditable.
- Legacy evidence remains readable without invented pack provenance.
- Migration is retry-safe through the existing idempotent command store.
- Every future active-pack change must keep its source pack installed for as long as persisted events reference it.
- Pack retirement requires a separate archival decision and proof that no aggregate or event references the pack.

## Rejected alternatives

- Treat every installed campaign as if it used the newest pack: violates deterministic replay.
- Rewrite old event `rulesVersion` values: destroys historical evidence.
- Automatically migrate at engine boot: couples availability to an irreversible state change and provides no review boundary.
- Permit mutations under arbitrary historical packs: multiplies active rule kernels and makes bug fixes impossible to reason about.
- Copy content definitions into migration events or campaign JSON: violates the immutable content/state boundary.
