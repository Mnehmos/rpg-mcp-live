# Open5e Rules Translation

Status: S0-S9 implemented, locally verified, and hosted on Railway; browser acceptance pending  
Date: 2026-08-07

## Canonical source and active identity

Lantern uses Open5e as a pinned content source, never as a runtime dependency. API v2 is canonical where available; v1 is retained only for the v1-only `spelllist`, `sections`, and `planes` collections and for explicitly documented cross-checks. The importer is the only code path allowed to contact Open5e.

Primary references:

- [Open5e API documentation](https://open5e.com/api-docs)
- [Open5e SRD 2014 source](https://open5e.com/sources/srd-2014)
- [Open5e API repository](https://github.com/open5e/open5e-api)

The active local artifact is:

| Field | Value |
| --- | --- |
| Pack | `open5e-v2-full-corpus-s8` |
| Pack hash | `56bdfbda9d59a398f3c9cb0e02aaf2b411e4280e99fb32c550cf158b38f7b07f` |
| Rules identity | `open5e-pack@56bdfbda9d59a398f3c9cb0e02aaf2b411e4280e99fb32c550cf158b38f7b07f` |
| Pinned source timestamp | `2026-08-07T06:16:36.932Z` |
| Default partition | `5e-2014` / `srd-2014` |
| Historical packs installed at boot | S1 and S7 |

Two independent S8 imports produced byte-identical manifests, coverage, attribution, and artifact files with the same rollup hash. Runtime boot verifies checksums, schemas, ordering, provenance, and cross-references before serving requests.

Railway now serves the exact S8 package and hash above with S1 and S7 installed for historical resolution. Before promotion, database inspection found four aggregates that predated pack identity and used `lantern-rules-0.1`. All four passed the strict plan and migrated exactly once. Hosted audit reports four active S8 campaigns, 38 unchanged legacy events, four modern migration events, and zero resolution failures.

## Fidelity contract

Open5e contains both structured fields and natural-language rules. Each normalized record declares the highest fidelity the engine may use:

| Tier | Meaning | Permitted behavior |
| --- | --- | --- |
| 0 - reference | Pinned source text and provenance | Search, display, cite, and narrate only |
| 1 - structured | Upstream-typed fields reviewed into Lantern schema | Resolve only those typed fields |
| 2 - executable | Deterministic reviewed effect program | Execute the exact compiled operations |

The engine resolves a record only at the tier it reached. A tier-0 ability may inform narration, but a request to execute it returns `content_tier_insufficient` and leaves state, event count, resources, and campaign version unchanged. No model-generated statblock, damage number, condition, recharge rule, or spell effect can cross this boundary.

## S8 corpus coverage

S8 captures the complete corpus discovered during the pinned import: 24 documents across the upstream `5e-2014`, `5e-2024`, and `a5e` game-system keys. Black Flag is a separate `bfrd` document that Open5e currently classifies under `5e-2014`; Lantern preserves that upstream classification rather than inventing another key.

| Collection | Raw | Reviewed typed | Tier-0 source variants | Compiled programs |
| --- | ---: | ---: | ---: | ---: |
| creatures | 3,541 | 325 | 3,216 | 608 |
| spells | 1,955 | 319 | 1,636 | 82 |
| items | 440 | 237 | 203 | 1 |
| magic items | 2,319 | 499 | 1,820 | 0 |
| species | 63 | 13 | 50 | 13 |
| classes | 151 | 24 | 127 | 12 |
| backgrounds | 58 | 27 | 31 | 27 |
| feats | 91 | 1 | 90 | 0 |
| rules | 283 | 227 | 56 | 1 |
| sections / planes | 53 | 53 | 0 | 0 |

The complete per-collection and per-document matrix is generated at [COVERAGE.md](../content/open5e/open5e-v2-full-corpus-s8/COVERAGE.md). The 608 creature programs comprise 317 exact basic attacks plus 291 S7 effect programs. The 82 spell programs comprise 33 earlier primary-damage programs plus 49 S7 effect programs. Counts measure reviewed coverage, not general 5e completeness.

## Delivered slices

| Slice | Delivered contract | Local evidence |
| --- | --- | --- |
| S0 | Retryable paginated import, verbatim raw NDJSON, normalized/compiled layers, checksums, coverage, attribution, deterministic rollup | Independent import equality and installed-pack verification |
| S1 | Verified immutable loader, pack registration, rules identity, policy resolver, `content_search` and `content_get`, pack-sourced skills and currency | Read-only/version invariants and stable policy rejections |
| S2 | Pack-backed items, weapons, armor, magic items, starting kits, merchant stock, equipment AC, exact copper values | Atomic buy/equip/unequip/sell golden path |
| S3 | Pack-backed combatants, full typed SRD statblocks, saves, senses, defenses, typed attacks, authoritative spawn | Caller cannot supply creature stats; tier-0 actions fail closed |
| S4 | Spell lists, level 1-20 slot progressions, known/prepared state, range, targeting, attack/save damage, concentration and recovery | Slot/resource/range/area/defense/recovery tests |
| S5 | Pack-backed character options and compiled level-one class/species/background profiles | Open character creation, option filtering, full sheet and starting inventory projections |
| S6 | Pinned rules, rulesets, sections, and planes exposed through `rules_reference` | Read-only exact/search lookup with source evidence |
| S7 | Offline rule-based effect compiler and atomic multi-effect turn execution | Multiattack, save damage, recharge, area, condition duration, rejection and source-hash tests |
| S8 | Full-corpus capture, campaign content partitions, deployment ceiling, OGL opt-in, catalog and in-product attribution | Cross-system/license tests and deterministic full-corpus pack |
| S9 | Multi-pack registry, deterministic diff/review hash, strict pre-pack legacy seam, compatibility plan, atomic campaign re-pin, historical event resolution | S1/S7/legacy history tests, unchanged old event bytes, wrong-hash no-mutation test |

## Rules, DM, and engine boundary

Open5e supplies source definitions. The DM supplies the world, situations, NPC choices, prices, rewards, quests, tactics, pacing, and prose. The engine supplies authority over mechanical state.

| Concern | Engine authority | DM authority |
| --- | --- | --- |
| Character | Source-backed legal options, scores, modifiers, saves, skills, HP, AC, speed, slots, load | Concept, identity, description, goals, choices |
| Inventory and money | Pack identity, quantities, slots, attunement, transfer, exact integer copper | Availability, original authored goods, price and barter terms |
| Creatures and combat | Pack stats, turns, action economy, attacks, saves, defenses, damage, conditions | Encounter choice, count, placement, tactics and motives |
| Spells | Access, known/prepared state, slots, range, targets, attacks/saves, typed effects | Spell choice, target intent and narration |
| World and quests | Typed persistence and atomic rewards/progress | Places, people, stakes, objectives and consequences |
| Improvisation | Validated typed mechanical effects and duration evidence | Stunt, fictional permission and rule-of-cool framing |

The engine does not decide creative content, and the DM does not provide authoritative numbers that should come from a pinned definition or rules calculation. A turn may combine authored content and several ordered mechanical effects. The engine validates the complete plan against one working snapshot and commits all of it—or none of it—in one transaction and one version increment.

## Campaign partitions and attribution

Every campaign persists a content policy containing:

- one exact game-system key;
- one base document;
- an explicit enabled-document set;
- an explicit allowed-license set.

The deployment environment provides the maximum allowed systems, base documents, documents, and licenses. A campaign may narrow that ceiling but cannot widen it. The hosted default is `5e-2014` with `srd-2014`, `cc-by-40`, and `cc0`; OGL content is explicit opt-in. Resolvers reject cross-system, cross-document, and cross-license lookups without fallback.

The browser reads the verified content catalog during campaign setup and displays attribution for enabled documents in the dossier. Attribution is derived from the installed pack rather than copied into campaign state. The complete generated inventory is [ATTRIBUTION.md](../content/open5e/open5e-v2-full-corpus-s8/ATTRIBUTION.md).

## Runtime storage and replay

- Content definitions live only in immutable pack files and in-memory indexes.
- `engine_content_packs` records installed pack identities.
- `engine_campaigns.state_json` stores content keys, pack hashes, campaign policy, and mutable instance overrides—not source definitions.
- Every modern committed event stores its exact rules version and sorted content keys.
- S1, S7, and S8 can coexist in one process. Campaign reads use the campaign's pack; event evidence uses the event's pack.
- Historical campaigns reject mutation with `campaign_repin_required` until explicitly migrated.
- A pre-pack event may remain unversioned only when it claims no content keys; the engine labels it legacy evidence and never infers a source pack.

S9 generates a deterministic review before any campaign changes. The current review artifacts are:

- [S1 to S8 review](generated/OPEN5E-S1-S8-DIFF.md), SHA-256 `7f8fdf0e0716b8cd9d26325a78a2718b5b7af3052154543130bc30b7f9076970`;
- [S7 to S8 review](generated/OPEN5E-S7-S8-DIFF.md), SHA-256 `4400d8a1109150d4fc7adfa410fabaec12c79eda3c465b26cc7eb7e2897f0056`;
- [legacy Lantern to S8 review](generated/LANTERN-LEGACY-S8-MIGRATION.md), SHA-256 `1c7e72b9b6d57e2ca9de10e6bed524e2ba62272ef09adc1e4cffbceb86c8f38d`.

`plan` inventories every persisted content reference and classifies it as identical, provenance-only, changed, missing-source, or missing-target. Missing references block migration. Changed references require explicit key approval. `apply` also requires the exact current review hash, rewrites matching pack hashes and `rulesVersion` atomically, increments the campaign once, and appends a `content_repin` event. Existing events are never rewritten.

Legacy `lantern-rules-0.1` has no provable source pack, so its plan is intentionally stricter: any content or pack marker rejects, changed-key approval is unavailable, and an accepted migration changes only policy/rules identity plus the audit log/event. A consistent production copy proved all four current campaigns satisfy that contract and preserve all 38 original event bytes.

## Rebuild and re-pin commands

~~~powershell
npm run open5e:import -- --slice s8 --source-fetched-at 2026-08-07T06:16:36.932Z --page-size 100
npm run open5e:verify -- --slice s8 --source-fetched-at 2026-08-07T06:16:36.932Z --page-size 100
npm run open5e:verify-pack

npm run open5e:repin -- diff --from open5e-v2-srd-2014-s1 --to open5e-v2-full-corpus-s8 --out docs/generated/OPEN5E-S1-S8-DIFF.md
npm run open5e:repin -- plan --from open5e-v2-srd-2014-s1 --to open5e-v2-full-corpus-s8 --database <database> --account <account-id> --campaign <campaign-id>
npm run open5e:repin -- apply --from open5e-v2-srd-2014-s1 --to open5e-v2-full-corpus-s8 --database <database> --account <account-id> --campaign <campaign-id> --confirm-review-sha 7f8fdf0e0716b8cd9d26325a78a2718b5b7af3052154543130bc30b7f9076970

npm run open5e:repin -- diff --from lantern-rules-0.1 --to open5e-v2-full-corpus-s8 --out docs/generated/LANTERN-LEGACY-S8-MIGRATION.md
npm run open5e:repin -- plan --from lantern-rules-0.1 --to open5e-v2-full-corpus-s8 --database <database> --account <account-id> --campaign <campaign-id>
npm run open5e:repin -- apply --from lantern-rules-0.1 --to open5e-v2-full-corpus-s8 --database <database> --account <account-id> --campaign <campaign-id> --confirm-review-sha 1c7e72b9b6d57e2ca9de10e6bed524e2ba62272ef09adc1e4cffbceb86c8f38d
npm run open5e:audit-migration -- --database <database>
~~~

Never reuse a review hash after pack bytes, migration code, or target identity changes. Regenerate the diff and rerun `plan` against the exact production database snapshot.

## Known limits

- Full-corpus capture is complete; full-corpus mechanical translation is not. Non-SRD variants are deliberately tier 0 until separately reviewed.
- Complex uncompiled spell and creature prose remains readable but non-executable.
- Conditions are executed only when an exact reviewed program applies them; the corpus condition descriptions themselves remain reference material.
- The current persistent store is SQLite on a Railway volume. That is acceptable for the single-player launch shape but requires backup/restore evidence before public charging.
- S8 and S9 are promoted and server-verified on Railway; authenticated browser play and a real OpenRouter tool turn remain to be observed.
