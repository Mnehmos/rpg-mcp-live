# ADR-H16: Verified Open5e runtime content boundary

Status: Accepted  
Date: 2026-08-06

## Context

ADR-H14 established deterministic Open5e pack artifacts, but a checked-in pack alone does not make runtime resolution safe. The engine needs to reject damaged packs before serving traffic, keep immutable definitions out of campaign JSON, enforce campaign and deployment policy, and expose source text to the DM without turning reads into game mutations.

## Decision

The engine loads one explicitly selected local pack at boot. Loading first runs the full manifest verifier, then validates every normalized and compiled NDJSON record and constructs immutable in-memory indexes by `contentKey` and collection. Any checksum, count, schema, provenance, ordering, or pack-hash failure prevents the engine from starting.

`rulesVersion` is `open5e-pack@<packHash>`. New campaigns and every committed event carry that exact identity. The SQLite `engine_content_packs` table records installed pack metadata separately from `engine_campaigns.state_json`; campaign instances may retain content keys and instance overrides, never copied definitions.

All reads pass through one resolver with an explicit policy:

- exact installed `rulesVersion`;
- exact game-system partition;
- allowed document keys;
- at least one allowed license key;
- explicit minimum fidelity tier for mechanical resolution.

The model-facing `content_search` and `content_get` tools are read-only. They return the pinned record and provenance, append no event, and leave `campaignVersion` unchanged. Search hides disallowed records; exact lookup rejects with a stable policy code. A tier-0 record can be displayed or narrated but `resolveAtTier` rejects attempts to use it as mechanics.

The hosted default policy is `5e-2014`, documents `core`, `elderberry-inn-icons`, and `srd-2014`, with licenses `cc-by-40` and `cc0`. OGL-only or other-system material requires an explicit deployment-policy change and a separately reviewed pack.

## S1 evidence

The historical S1 pack is `open5e-v2-srd-2014-s1`, hash:

`7a30c58868cb9dfd87124582a26f95cfa43577d948f3bfc5311e7ab52eb03bf3`

It contains the S0 taxonomy/provenance records, 18 normalized SRD-2014 skills, and one tier-2 currency table compiled only after its five source rows exactly match the reviewed values. Two independent imports were byte-identical. Focused tests cover pack verification/loading, immutable indexes, policy rejection, tier rejection, version-neutral reads, idempotent pack registration, event rules identity, and currency-source drift.

## S2 evidence

The S2 evidence pack is `open5e-v2-srd-2014-s2`, hash:

`83769faa5856c783ebdba7c8cefaa343906060014299a18d98f30cdbf76eda77`

It adds the six equipment collections and verifies all item-to-weapon, item-to-armor, magic-item-to-rarity, weapon-to-property, and weapon-to-damage-type references. ADR-H17 applies the content boundary to runtime instances. S9 supplies the explicit re-pin path; the S8 boundary and four reviewed legacy migrations are now hosted and audited.

## Consequences

Runtime request handlers have no Open5e network dependency. Pack damage is a boot failure, not a late player-turn surprise. License and game-system boundaries are centralized. Historical events have an unambiguous content identity. Later item, creature, spell, and character-option slices can add typed records without changing the read vocabulary or copying source definitions into each campaign.

ADR-H21 extends this decision with a verified multi-pack registry. S1 and S7 remain installed beside active S8; campaigns and events resolve by exact identity and never fall back by name or recency.

## Rejected alternatives

- Lazy verification on first lookup: allows traffic before integrity is known.
- One content table mixed into campaign state: duplicates immutable records and obscures pack identity.
- License filtering only in the browser or prompt: bypassable and not authoritative.
- Resolving a missing or tier-0 record from model memory: nondeterministic and permits invented mechanics.
- Falling back to a similarly named record in another game system or document: silently changes rules.
