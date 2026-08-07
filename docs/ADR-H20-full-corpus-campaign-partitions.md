# ADR-H20: One full-corpus pack, campaign-scoped rules partitions

Status: accepted and implemented locally in S8  
Date: 2026-08-07

## Context

S0-S7 intentionally pinned one `srd-2014` document and one `5e-2014` rules kernel. Open5e serves 24 documents in the same API, including mutually incompatible rules families and content under different licenses. A process-wide resolver would either hide most of that corpus or permit one campaign to see records that belong to another game system or license policy.

The live Open5e v2 catalog currently reports three game-system keys: `5e-2014`, `5e-2024`, and `a5e`. The Black Flag SRD is a distinct document (`bfrd`) but Open5e currently classifies it under `5e-2014`; Lantern records that upstream fact and does not manufacture a fourth API game-system key.

## Decision

S8 produces one immutable, hash-addressed corpus pack. Its manifest has corpus scope, a complete document/license/game-system inventory, and discovered collection counts. The pack remains the replay identity: campaign state and events use `open5e-pack@<packHash>`.

Each campaign persists a small content policy alongside its creative profile:

- one exact game-system key;
- one base document that defines the campaign's rules family;
- an explicit set of enabled source documents from that same game system;
- an explicit set of allowed license keys.

The deployment policy is a ceiling. A campaign may choose only systems, documents, and licenses enabled by the deployment; it cannot widen that policy. The hosted default remains CC-BY/CC0 and starts with the 2014 SRD. OGL documents are opt-in and are never enabled merely because they exist in the installed pack.

Resolvers and rules kernels are campaign-scoped and cached by canonical policy. A lookup must satisfy the campaign rules version, game system, document set, and license set. A content key from a different partition returns a stable rejection; there is no name-based or cross-system fallback.

Open5e taxonomies that the upstream API explicitly shares are represented as shared taxonomy records, not silently relabeled as campaign rules. Only reviewed taxonomy kinds may cross a partition boundary. Creatures, spells, classes, species, backgrounds, feats, items, rules, and executable programs always retain an exact game-system and document partition.

The browser receives a read-only content catalog generated from the verified pack and deployment ceiling. Campaign setup shows valid base/source choices and their licenses. The campaign dossier exposes attribution for every enabled source document. Attribution is derived from the pack inventory, not copied into campaign state.

## Import boundary

- v2 remains canonical wherever a collection exists in v2.
- v1-only `spelllist`, `sections`, and `planes` are captured as separately identified source artifacts.
- Every v2 endpoint used by game content is captured raw. Catalog endpoints such as licenses, publishers, and game systems are also pinned so policy and attribution are reproducible.
- Source collection counts are discovered from pagination and written to the manifest and coverage report; they are not acceptance constants.
- Cross-document source keys remain globally unambiguous through Open5e's document-prefixed key and Lantern's `open5e:<kind>:<gamesystem>:<document>:<sourceKey>` identity.
- Unsupported prose remains tier 0. A full-corpus import is not a silent claim that every record is executable.

## Consequences

One pack hash is enough to replay any campaign created under that corpus snapshot, while campaign policy prevents incompatible content from mixing. Adding a source book does not copy definitions into `state_json`. Attribution can be shown accurately for the campaign's actual enabled sources.

The rules kernel can stay simple for a campaign because it sees one policy-filtered partition, even though the installed pack is broad. A rules family is playable only to the fidelity its partition reached; missing compilers fail closed and remain visible in coverage.

S9 can install old and new corpus packs together and resolve historical events by hash. Campaign migration changes the pack identity only after a reviewed diff and content-key compatibility check.

## Rejected alternatives

- One process-wide document policy: prevents player-owned campaign source choices and cannot safely host multiple systems.
- One pack per document: duplicates shared taxonomies, multiplies deployment artifacts, and makes multi-book campaigns and replay migration harder.
- Treat Black Flag as a fabricated fourth Open5e game-system key: disagrees with the pinned upstream catalog.
- Put attribution or full source records in campaign JSON: duplicates immutable content and violates the content/state boundary.
- Let the model bridge missing systems or licenses from memory: bypasses deterministic authority and policy enforcement.
