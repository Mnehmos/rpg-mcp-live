# ADR-H14: Deterministic, provenance-complete Open5e content packs

Status: Accepted  
Date: 2026-08-06

## Context

Lantern currently resolves against a small hand-written rules module. Open5e serves the target rules and content corpus, but a live API dependency would allow an upstream change or outage to alter a campaign turn. Open5e also mixes game systems, publishers, documents, and license families in shared endpoints. Its conditions and damage types use a shared `core` container while individual descriptions identify the actual source document and game system.

Content definitions are not campaign state. A campaign must eventually reference a content key and pack hash without copying the definition into `state_json`.

## Decision

Import Open5e only through an offline CLI. Runtime request handlers never call `api.open5e.com`.

Each pack is versioned and contains:

- untouched upstream records as raw NDJSON;
- schema-validated normalized NDJSON sorted by key;
- tier-2 compiled NDJSON, empty when no reviewed compilation exists;
- per-artifact SHA-256 values and one canonical rollup pack hash;
- source URLs, API version, pinned source timestamp, document roles, game-system partition, publishers, licenses, and permalinks;
- generated coverage and attribution reports.

The first pack targets `srd-2014` and `5e-2014`. It fetches shared taxonomies through `core`, selects only the `srd-2014` description variants, and imports every document needed to attribute bytes present in raw shared-taxonomy payloads. Those additional document records are attribution metadata, not playable cross-system content.

Every normalized record declares its actual fidelity tier. Tier 0 is reference-only, tier 1 exposes typed fields, and tier 2 requires a reviewed executable effect program. A runtime resolver may never silently promote a record.

`sourceFetchedAt` is a pinned reproducibility input rather than a wall-clock side effect. Two imports with the same source snapshot inputs must produce identical artifacts and pack hash. Upstream content changes still change artifact hashes and therefore the pack hash.

## S0 evidence

Two independent, paginated Open5e API v2 imports on 2026-08-06 produced the same pack hash:

`4ab7eb54947841957f63c468dfbf266306779db470ceb7aacbd3eecf11aa2f95`

S0 contains 15 SRD-2014 conditions at tier 0, 13 SRD-2014 damage types at tier 1, 6 core sizes at tier 1, and 5 provenance documents at tier 0. All compiled collections are intentionally empty. A fresh second verification run after implementation again produced this hash in both independent output directories, and the checked-in 15-file pack was byte-identical to that fresh output.

`npm run open5e:verify-pack` validates the checked-in manifest, safe artifact paths, byte hashes, NDJSON counts, normalized schemas, key ordering and uniqueness, pinned provenance, document inventory, empty S0 compiled artifacts, generated report hashes, and canonical rollup hash. The same verifier runs before both type-check/build acceptance paths.

## S1 evidence

S1 extends the same deterministic artifact with skills and the exact SRD-2014 coin-exchange rule. Two independent live imports produced byte-identical directories and pack hash:

`7a30c58868cb9dfd87124582a26f95cfa43577d948f3bfc5311e7ab52eb03bf3`

The raw skills evidence contains 20 records; normalization accepts the 18 `core` skills with an SRD-2014 description and reports the two A5E-only skills as excluded. The one currency rule compiles to a tier-2 five-denomination table only when every source row matches the reviewed copper ratios exactly. A malformed or drifted row fails import. ADR-H16 defines how this pack becomes the runtime rules identity and read path.

## Consequences

Pack upgrades become explicit, reviewable changes. Historical events can retain their original pack hash. License and game-system policy can reject content before runtime resolution. Raw payloads remain available for audit while normalized records remain deterministic and safe to index.

The importer must fail on pagination cycles, duplicate keys, missing source variants, missing publisher/license/permalink provenance, schema drift, or nondeterministic output.

## Rejected alternatives

- Runtime Open5e fetches: nondeterministic and outage-sensitive.
- Copying definitions into campaign JSON: duplicates immutable content and breaks historical identity.
- Treating shared `core` records as if all descriptions were SRD 2014: mixes systems and misstates provenance.
- Hashing only normalized records: fails to attest the raw evidence and generated reports.
- LLM-generated normalization or effect compilation: not reproducible or mechanically trustworthy.
