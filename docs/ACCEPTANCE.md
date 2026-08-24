# Lantern Acceptance Model

Status: local S0-S9 release gate  
Date: 2026-08-07

## Player vertical slice

The hosted Lantern slice is complete only when the same deployed web/engine pair proves all of the following:

1. A Clerk-authenticated player creates or selects a campaign they own.
2. Campaign setup records a valid source policy beneath the deployment ceiling and shows its attribution.
3. The player creates a source-backed character and receives the complete engine-owned sheet and inventory.
4. The player completes the tutorial and enters a sandbox with no universal opening room or identity.
5. The player submits natural language; the DM reads context and proposes an ordered typed plan.
6. The engine validates and commits one authoritative event and version increment, or rejects without mutation.
7. The DM narrates only the committed result.
8. Refresh/resume returns the same state, ordered player/DM log, notes, dossier, and attribution.
9. A provider failure never repeats a roll or effect.
10. A second account cannot read, mutate, or infer the campaign even when it knows the ID.
11. The player can take the next legal action from the resulting state.
12. The campaign manager can open, create, and explicitly delete an owned campaign; deletion is version-checked, account-scoped, and cascades only that campaign's records.

## Command acceptance contract

Every successful result must be mechanically verifiable without prose. It includes request/client IDs, tenant/actor/event IDs, previous/resulting versions, normalized command or turn plan, rules version, content keys, rolls/modifiers/targets where relevant, outcome, state changes, and narration status.

Every rejection carries a stable code. Automated evidence must show unchanged campaign JSON, resources, event count, and version where the rejected operation could otherwise mutate state.

## Invariants

- Account, campaign, and actor context is explicit on every read and write.
- Client or model input cannot set arbitrary source-backed HP, AC, attacks, damage, spell effects, or derived values.
- Multiple ordered effects commit once and atomically; one failed effect rejects the entire plan.
- Idempotent retries never reroll or duplicate effects.
- Off-turn, ended-encounter, action-economy, range, target, resource, concentration, condition, recharge, and source-tier rules fail closed.
- Quest objective/reward, commerce, loot, consumables, rest, and rule-of-cool typed effects commit atomically.
- Merchant actions resolve immediately as a concrete trade/counteroffer/refusal; no hidden passive deliberation state exists.
- Currency is canonical integer copper with deterministic denomination projections.
- Campaigns have no preset room, opening scene, or placeholder player identity.
- The DM owns creative facts and forward motion; the engine owns mechanical authority and persistence.
- Content definitions never enter `engine_campaigns.state_json`.
- Every source-backed state reference and event carries a pack identity and content key.
- Runtime requests never call Open5e.
- Cross-game-system, cross-document, cross-license, and insufficient-tier requests reject stably.
- Historical events resolve under their original pack and are never rewritten during migration.

## Local test matrix

| Area | Required proof | Current label |
| --- | --- | --- |
| Tenancy/context | Wrong account, actor, token, missing context and known-ID probing reject | verified |
| Campaign manager | Owned list, open/create flow, confirmation-gated delete, stale-version rejection, and command/event cascade | verified |
| Command lifecycle | Atomic commit, stale version, idempotent retry and no-mutation rejection | verified |
| DM loop | Ordered reads/effects, schema validation, provider fallback and committed-result narration | verified |
| Character | Policy-filtered options, source-backed creation, derived sheet and starting inventory | verified |
| Inventory/commerce | Buy/equip/AC/unequip/sell, use/drop/loot and exact currency reconciliation | verified |
| Combat | Source-backed spawn, initiative/turns, action economy, attacks, saves, defenses, bounded boss windows and encounter end | verified |
| Spells | Access, preparation, slots, range/area, target count, attack/save, typed damage, concentration and recovery | verified |
| S7 effects | Multiattack, recharge, usage, area, save damage, condition application/expiry and illegal action | verified |
| World/quests | Nullable context, movement edges, authored NPC/merchant/quest/beat, notes and atomic rewards | verified |
| Content policy | Pack identity, system/document/license ceiling, tier rejection and read-only lookups | verified |
| Replay/re-pin | S1/S7/S8 registry, strict legacy seam, deterministic reviews, compatibility plan, exact-hash apply and unchanged old events | verified |
| Built services | Public/private health, 41 tools, S8 catalog, character options and authoritative HTTP turn | verified |

## Open5e S0-S9 evidence

| Claim | Label | Evidence |
| --- | --- | --- |
| S0 import spine is deterministic | verified | Independent imports, canonical NDJSON, checksums, attribution and coverage produce the same hash; installed verification fails on drift. |
| S1 runtime boundary is pinned | verified | Exact resolver policy, read-only content tools, pack-backed skills/currency and `engine_content_packs` registration are covered. Historical S1 hash is `7a30c58868cb9dfd87124582a26f95cfa43577d948f3bfc5311e7ab52eb03bf3`. |
| S2 equipment is reference-backed | verified | State stores pack references plus instance fields; buy/equip/AC/unequip/sell is one reconciled golden path. |
| S3 creatures are authoritative | verified | The caller supplies only identity/count/placement; 325 reviewed SRD statblocks and 317 exact attacks drive mechanics. |
| S4 spells fail closed | verified | 319 reviewed SRD spells, seven lists, eight progressions and 33 primary programs cover legal use and no-resource-loss rejection. |
| S5 character options are source-backed | verified | Compiled species/class/background profiles, policy-filtered option reads, creation, inventory and full sheet projections pass. |
| S6 rules reference is pinned/read-only | verified | Rules, rulesets, v1 sections and planes are indexed and returned with source evidence without a version bump. |
| S7 compiler is deterministic | verified | 291 creature and 49 spell effect programs reproduce exactly; source prose hashes and schemas round-trip. Runtime tests cover multiattack, recharge, area, damage and conditions. |
| S8 full corpus is deterministic | verified | Two independent 114-file imports are byte-identical at `56bdfbda9d59a398f3c9cb0e02aaf2b411e4280e99fb32c550cf158b38f7b07f`; coverage includes 24 documents, 3,541 creatures, 1,955 spells, and 27 compiled 5e-2014 backgrounds. |
| S8 policy and attribution are live locally | verified | Campaign setup/catalog enforce game-system/document/license ceilings, OGL is opt-in, and enabled-source attribution is projected in-product. |
| S9 S7-to-S8 review is deterministic | verified | Generated review SHA is `4400d8a1109150d4fc7adfa410fabaec12c79eda3c465b26cc7eb7e2897f0056`; 26 reviewed background profiles were added and no compiled record changed or disappeared. |
| S9 S1-to-S8 review is deterministic | verified | Generated review SHA is `7f8fdf0e0716b8cd9d26325a78a2718b5b7af3052154543130bc30b7f9076970`; no compiled record changed or disappeared. |
| Legacy-to-S8 review is deterministic | verified | Generated review SHA is `1c7e72b9b6d57e2ca9de10e6bed524e2ba62272ef09adc1e4cffbceb86c8f38d`; any source-content marker blocks migration. |
| S9 campaign migration is atomic | verified | Tests prove pack and legacy re-pin, exact review confirmation, blocked wrong hash, unchanged state/version/events on rejection, and byte-for-byte preservation/resolution of old events. |
| Production-copy migration dry-run | verified | A consistent live backup passed `quick_check`; 4/4 legacy campaigns migrated exactly once; 38 original events retained SHA-256 `c5b66fe9185be3021d437107ee204028fe3a9fdc4b565e789e03c86e15e9a344`; all 42 resulting events resolved. |
| Complete local gate | verified | `npm run check`, `npm test`, `npm run build`, and `npm run smoke:http` pass; the regression suite contains 83 tests and the HTTP smoke deletes its disposable campaign. |

## Hosted evidence

| Claim | Label | Evidence or blocker |
| --- | --- | --- |
| Railway web/private-engine split | verified | Engine deployment `a4a50b7f-53ed-4bae-8c62-473b0b92e033` and web deployment `11c55560-3d12-4815-9b13-eced61300469` reached `SUCCESS`; public health reaches the private engine. |
| Hosted campaign manager | verified | Public health is `ok`, the served bundle contains the open/delete actions, and unauthenticated deletion is rejected with `401`; no production campaign was deleted during deployment. |
| Hosted pack identity | verified | Public `https://rpg-mcp-live-production.up.railway.app/api/health` reports S8 hash `56bdfbda9d59a398f3c9cb0e02aaf2b411e4280e99fb32c550cf158b38f7b07f`, OpenRouter `openai/gpt-5.6-luna`, 41 engine tools, and healthy Clerk/Stripe/engine integrations. |
| Production database backup/read proof | verified | Online SQLite backup completed at 220 pages and 901,120 bytes; remote and downloaded SHA-256 matched `60f76afd220fd9fbbc5d0eda9a6d349020f11b8fc221368e2d853f79a758f727`; the copy opened and migrated cleanly. |
| Scheduled backup/restore operation | blocked | A durable scheduled backup policy and full Railway-volume restoration drill remain outstanding. |
| Hosted S8 dual-pack registry | verified | Legacy reads/events succeeded before migration; mutation rejected with `campaign_repin_required`; all probes left 4 campaigns, 42 commands, and 38 events unchanged. |
| Production campaign re-pin | verified | Four exact-hash applies advanced versions once to 22, 18, 1, and 1. Post-audit reports 4 S8 campaigns, 38 legacy events, 4 migration events, zero failures, and `quick_check: ok`. |
| Authenticated Clerk campaign/character/tutorial path | blocked | Must be rerun against the promoted pair with an attached signed-in browser. |
| Real OpenRouter tool turn and refresh/resume | blocked | Must be observed against the promoted engine and then checked against persisted event/state. |
| Stripe test subscription entitlement | observed | A test purchase was reported earlier; webhook-backed status and cancellation still need a fresh deployed proof. |
| Usage limits and cost controls | local | Account-bound token/USD ledger, pre-call reservations, per-user/global ceilings, and `GET /api/usage` are implemented locally; hosted proof and production price/credential configuration remain required before charging real customers. |
| Production dependency audit | verified | `npm audit --omit=dev --json` reports zero production vulnerabilities; Railway's four audit findings are confined to build/dev dependencies. |

## Evidence labels

- `verified`: focused automated or deployed evidence proves the claim.
- `observed`: seen or previously reported, but not covered by durable current evidence.
- `designed`: specified but not implemented.
- `blocked`: required proof cannot currently be completed because an external prerequisite is missing.

Never promote a claim across evidence classes. Reference play, importer success, local tests, Railway health, authenticated browser play, and billing proof are distinct gates.
