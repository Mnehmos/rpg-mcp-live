# ADR-H19: The spell kernel uses v2 definitions and reviewed v1 SRD table evidence

Status: accepted, locally verified, and hosted on S8  
Date: 2026-08-06

## Context

Open5e v2 is the canonical structured spell definition source, but its class feature data does not currently provide a trustworthy complete slot progression. In the pinned payload, the full-caster second-level slot feature duplicates character level 4 and omits level 3. Open5e v1 still exposes the WotC SRD class markdown tables and class spell-list endpoints.

## Decision

S4 uses a mixed, explicitly recorded evidence boundary:

- v2 `spells`, filtered to `document__key__in=srd-2014`, supplies spell definitions;
- v2 `spellschools`, filtered to the `core` taxonomy, supplies schools;
- v1 `spelllist` corroborates the seven class memberships present in v2;
- v1 `classes?document__slug=wotc-srd` supplies hashed level 1-20 slot tables, selection mode, cantrip/known limits, and Pact Magic recovery.

Every collection records its own source API version and URLs. The importer rejects class-list disagreement, malformed or incomplete tables, provenance drift, and reference gaps. It does not repair the v2 class-feature defect silently.

Campaign state persists only pinned spell references, remaining and maximum slots, known/prepared selections, and concentration. The engine exposes `learn_spell`, `prepare_spell`, and `cast_spell`. A cast atomically validates class access, level, preparation, slot and action resources, persisted range, structured target count or area geometry, attack or save, typed damage defenses, concentration, hit points, and turn ownership.

Tier-2 compilation is intentionally narrow. A spell is executable only when its immediate primary damage expression and attack/save wording exactly match a reviewed pattern. Structured slot/player-level variants are accepted. A prose-only effect or unstructured upcast returns `content_tier_insufficient` without consuming a slot, action, HP, or campaign version. Secondary prose remains deferred even when primary damage compiles.

## Consequences

- The S4 pack contains 319 normalized spells, 8 schools, 7 corroborated lists, 8 normalized caster progressions from 12 raw class records, and 33 reviewed primary-damage programs.
- Paladin slot progression is present, but v2 exposes no paladin spell membership in this pinned corpus; the engine fails closed until a reviewed source closes that gap.
- Area geometry takes precedence over misleading source `target_count=1` fields for cones, cubes, cylinders, lines, and spheres.
- Range is checked against persisted encounter distance. `Self` area spells use structured shape size; `Touch` resolves to 5 feet. Missing geometry permits only the conservative structured subset.
- Runtime play has no Open5e network dependency.

## Rejected alternatives

- Use the defective v2 class-feature rows: would silently produce incorrect slot tables.
- Transcribe remembered D&D tables into code: loses source evidence and reproducibility.
- Execute every spell description through the model: lets narration invent rules and makes retries non-deterministic.
- Treat all higher-level slots as base damage: incorrectly resolves spells whose upcast changes damage or target count.
