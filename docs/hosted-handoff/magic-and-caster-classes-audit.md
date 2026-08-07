# Lantern Magic, Spellcasting, and Caster Classes Audit

Audit date: 2026-08-07
Auditor: read-only implementation audit (no code changes made)
Subject: `F:\Github\rpg mcp live` ("Lantern") — the new hosted production implementation
Comparison source only: `F:\Github\mnehmos.rpg.mcp` ("reference engine") — prior MCP-based engine, not part of Lantern's runtime by explicit architectural decision (`docs/ADR-H13-reference-engine-boundary.md`)

Methodology note: this audit was produced by direct static investigation of the Lantern source tree, content pack data, and test suite (schema reads, resolver reads, content-file greps/reads, and build/test execution), rather than a parallel multi-agent sweep. It is thorough on the areas it covers, cross-checked against the prior action-economy/spatial audit's magic-related findings, and against a reference-engine inventory produced by a separate research pass — but it is a single-pass investigation, not an exhaustive line-by-line trace of every one of the ~24 sub-areas in the original audit brief. Where evidence is incomplete, the finding is marked `UNKNOWN` rather than inferred. Treat this as a strong first-pass status report, not a guarantee that nothing was missed.

Repository state at time of audit:
- Lantern (`F:\Github\rpg mcp live`): git repo with **no commits yet** (`git status --short` shows every file as untracked `??`; `git log -1` reports "your current branch 'main' does not have any commits yet"). Same state as the prior audit — still unresolved.
- `npm run build` — **PASSED** (content pack verification + `tsc`, no errors).
- `npm test` (`vitest run --pool=forks`) — **PASSED**: 14 test files, 86 tests, 0 failures, 10.97s. (`src/engine.test.ts` alone: 30 tests.)

---

## 1. Executive summary

**Lantern has a genuinely coherent, class-generic magic *architecture* — but a severely narrow magic *content execution surface*, and an unreachable *progression* system.**

The good news first: the content and character-state layers are well-designed. A single `NormalizedSpellProgression` content record per class (`src/content/schema.ts:533-565`) declares `slotMode` (`standard`/`pact`), `slotRecovery` (`long-rest`/`short-or-long-rest`), `selectionMode` (`known`/`prepared`/`spellbook`), per-level slot tables (all 20 levels), cantrip/known-spell limits by level, and a spellbook growth formula — and all 8 requested caster classes (Bard, Cleric, Druid, Paladin, Ranger, Sorcerer, Warlock, Wizard) have an installed, correctly-differentiated progression record (verified directly from `content/open5e/open5e-v2-full-corpus-s8/normalized/spellprogressions.ndjson`). A single shared function, `buildSpellcastingState()` (`src/engine-domain.ts:3819-3849`), derives spell save DC, spell attack bonus, and slot tables generically from that content for every class — there is no per-class hardcoded branch, and no drift risk, because it is recomputed from level+abilities+class every time `hydrateCharacter()` runs, not copied once and left stale. Pact Magic is a real, distinct mechanic — not label-only: Warlock's compiled slot table has exactly one nonzero slot level per character level, `slotRecovery` is `"short-or-long-rest"`, and `resolveRest()` (`src/engine-domain.ts:2857-2876`) explicitly checks that flag before restoring slots on a short rest, so ordinary casters correctly do **not** recover slots on a short rest while Warlocks do — verified by reading the resolver, not inferred. `learn_spell`/`prepare_spell` (`src/engine-domain.ts:1180-1340`) correctly branch on `selectionMode`: Wizard requires learning into a spellbook-equivalent list before preparing from it; Cleric/Paladin ("prepared") validate directly against the **class spell list**, not a personal repertoire — which is the *correct* 5e behavior and is notably better than the reference engine (whose forwarded audit found Cleric preparation incorrectly required entries in a personal `knownSpells` array first).

The bad news: almost none of this can actually be exercised as *magic*, because of one hard content gate. `compileSpellEffects()` (`src/content/open5e-import.ts:3525-3573`) only compiles an executable `spell.effect` for spells on a **hardcoded allow-list of exactly 30 spells** (`REVIEWED_IMMEDIATE_PRIMARY_DAMAGE_SPELLS`, `open5e-import.ts:110-140`) — and every one of those 30 is a **damage** spell. There is no compiled path for healing, buffs, conditions, summons, or utility effects at all — `compileSpellEffects` requires `spell.damageRoll` to exist. Concretely: **Cure Wounds, Healing Word, Shield, Bless, Counterspell, and every other non-damage spell in the SRD are `CONTENT_ONLY`** — they exist as normalized content with full schema fidelity, but `resolveCastSpell` rejects them with `content_tier_insufficient` before any mutation (verified structurally and by test, `src/engine.test.ts:1364-1400`). This means **Cleric's core identity (healing) is not executable**, and the one real reaction spell in the game that *is* executable (Hellish Rebuke, a damage spell) has no actual trigger system behind it — "reaction" is purely an action-economy classification (`castingTime === "reaction"` gates a flag), not a response to a specific incoming event; Shield, the other obvious reaction spell, has no damage roll and so cannot execute at all.

The progression system is worse than "narrow" — it is **currently unreachable**. There is no `level_up`, `gain_xp`, or any command in the 30-member `EngineCommand` union that changes `character.level`. The spell-slot tables the content layer correctly encodes go to level 20, but nothing in the live product ever advances a character past level 1 (level 9+ was only reachable in the test suite via direct JSON mutation of the campaign state, bypassing the command layer entirely — `src/engine.test.ts:1469`). Every class's higher-level distinctiveness (Warlock's Mystic Arcanum, a Cleric's 5th-level spells, a Wizard's high-tier spellbook growth) is therefore inert in practice.

**Five highest-risk defects, ranked:**
1. **Only 30 hardcoded damage spells are executable; every healing/buff/condition/summon spell is `CONTENT_ONLY`.** This is not a rough edge — it means the Cleric, Druid, and Bard classes (whose core kit is healing/buff-centric) are effectively unplayable as their class identity via `cast_spell`, even though character creation, spell learning, and slot tracking all work correctly for them.
2. **No class progression is reachable.** No command advances `character.level`. Every caster is permanently level 1 in practice, regardless of how correct the level-20 progression tables are.
3. **Reactions have no trigger system.** A reaction-timed spell can be cast any time off-turn once the Reaction flag is free; it is not gated on "you were just attacked" or any other specific event. The one executable reaction spell (Hellish Rebuke) works only because it doesn't need a trigger to deal its damage; Shield (the spell that actually needs "reaction to being hit" semantics to matter) can't execute at all.
4. **No legal-spell-offer system exists for the DM/LLM.** `EngineSessionView.availableActions` (`src/engine-domain.ts:269-274`) is a coarse three-branch static list (`create_character`/`continue`/sandbox actions), not a computed per-turn menu of castable spells. The DM must already know a spell's exact `open5e:spell:...` content key and simply attempt `cast_spell`, discovering unavailability only via rejection codes.
5. **NPC/monster spellcasters never touch the spell system at all.** Creature "spell" attacks (`attackKind: "spell"` in `compiledCreatureAttackSchema`, `content/schema.ts:796`) are pre-compiled per-creature attack numbers resolved through the same generic creature-attack pipeline as a weapon attack (`executionMode: "multiattack" | "saving-throw-damage" | "saving-throw-condition"`). They never touch `spellcasting`, never consume a slot, and have no concentration — "Mage"/"Archmage"/"Priest" creature content exists (12 matches for those names in `creatures.ndjson`), but nothing about their statblock execution resembles player spellcasting.

**Is magic safe to build the first campaign around?** For a **damage-focused single-caster combat encounter** (a Wizard or Sorcerer throwing Fire Bolt/Magic Missile/Burning Hands), the mechanics that exist are genuinely trustworthy: atomic slot expenditure, correct range gating, correct concentration DC/save/break-on-damage, correct rejection-leaves-state-unchanged behavior (proven by tests with exact JSON before/after equality). For **any campaign that expects a Cleric to heal, a Wizard to Shield a hit, a Warlock to reach Mystic Arcanum, or any class to level up**, the answer is no — those paths are either `CONTENT_ONLY` or entirely unreachable today.

---

## 2. System status matrix

| Area | Status | Evidence | What works | What is missing | Confidence |
|---|---|---|---|---|---|
| Spell content schema (normalized) | LANTERN_IMPLEMENTED | `src/content/schema.ts:458-501` (`normalizedSpellSchema`) | Full metadata: level, school, range, components, area, concentration, casting time, class list, upcast options; strong provenance (documentKey/gamesystem/publisher/licenseKeys/sourceApiVersion pinned per record) | `duration` is unstructured free text (fragile for anything parsing it programmatically); no `automatic hit` boolean at the normalized layer | High |
| Spell executability tier | LANTERN_IMPLEMENTED (as a real, explicit distinction) | `Open5eSpellKernelRecord.effect: CompiledSpellEffect \| null` (`src/content/rules-kernel.ts:96`); `resolveCastSpell` rejects with `content_tier_insufficient` when null (`src/engine-domain.ts:1370-1377`) | The catalog-vs-executable distinction is explicit and typed, not silent; rejection is safe (no mutation) | The executable set is tiny (30 spells) and damage-only — see next row | High |
| Executable spell allow-list | LANTERN_STUB | `REVIEWED_IMMEDIATE_PRIMARY_DAMAGE_SPELLS`, `src/content/open5e-import.ts:110-140` (30 entries); `compileSpellEffects()` requires `spell.damageRoll` (`:3528`) | 30 named damage spells compile correctly, with slot-level and player-level upcast variants where content supports it | No healing, buff, condition, summon, or utility spell compiles at all — `compileSpellEffects` structurally cannot produce a non-damage effect | High |
| Spellcasting character state | LANTERN_IMPLEMENTED | `EngineSpellcasting`, `src/engine-contracts.ts:714-724`; derivation in `buildSpellcastingState()`, `src/engine-domain.ts:3819-3849` | Single class-generic derivation (ability, DC, attack bonus, slots) called from both character creation and `hydrateCharacter()` (`:568`, `:3804`) — no per-class hardcoding, no copy-drift | DC/attack-bonus formula not independently re-derived by hand for all 8 classes in this pass — treated as High confidence from the single shared function, not exhaustively hand-checked per class | High |
| Pact Magic distinctness | LANTERN_IMPLEMENTED | Content: Warlock progression has exactly one nonzero slot level per character level (`spellprogressions.ndjson`, Warlock record); `slotRecovery:"short-or-long-rest"`; `resolveRest()` short-rest branch (`src/engine-domain.ts:2857-2876`) checks that flag before restoring | Genuinely separate recovery timing from standard slots, verified in the resolver, not just the schema; upcast-to-pact-level is automatic because `selectSpellSlot` always picks the (only) nonzero slot bucket | No standalone "pact slot" field — it's unified into the same `slots`/`slotMaximums` structure as everyone else, which works correctly here but is a less explicit model than a dedicated Pact Magic pool | High |
| Wizard spellbook vs. Cleric/Paladin full-list preparation | LANTERN_IMPLEMENTED (and more correct than the reference engine) | `resolveLearnSpell`/`resolvePrepareSpell`, `src/engine-domain.ts:1180-1340` | Spellbook mode (`selectionMode:"spellbook"`) requires learning before preparing, with a level-scaling capacity formula; prepared mode (Cleric/Paladin) validates directly against the **class spell list**, not a personal array — correct per 5e rules | Ritual casting is not modeled anywhere (no `ritual: true` handling found in `engine-domain.ts` cast/learn/prepare paths) | High |
| Slot expenditure / atomicity | LANTERN_IMPLEMENTED | `resolveCastSpell`, `src/engine-domain.ts:1454-1458` (slot decrement, action-economy flag, and damage all applied to one cloned `next` state, committed in one `commit()` call) | Same atomic-commit pattern as combat (`ADR-H11`/`ADR-H15`); rejection leaves state byte-for-byte unchanged (proven by `JSON.stringify` equality test, `src/engine.test.ts:1389-1399`) | — | High |
| Class progression / leveling | **ABSENT (unreachable)** | Full `EngineCommand` union enumerated (`src/engine-contracts.ts`, 30 kinds) — no `level_up`, `gain_xp`, or equivalent exists | Content-side progression tables are correct to level 20; `hydrateCharacter` would derive correctly *if* level ever changed | Nothing in the live command surface ever changes `character.level`; the only place level 9+ was exercised is a test that mutates the JSON state object directly, bypassing the engine command layer (`src/engine.test.ts:1468-1470`) | High |
| Reaction trigger system | ABSENT | `resolveCastSpell` reaction branch (`src/engine-domain.ts:1389-1400`) only checks `reactionUsed`; no `pendingReaction`, no linkage to a specific incoming attack/event anywhere in `engine-domain.ts` | The one executable reaction spell (Hellish Rebuke) still resolves correctly as a damage spell because it doesn't need a trigger to deal damage | No real interrupt/trigger model exists; Shield (the spell that needs one) can't execute at all (no damage roll → not compiled) | High |
| Concentration lifecycle | LANTERN_IMPLEMENTED | Start: `src/engine-domain.ts:1459-1465`; break-on-damage shared helper `applyConcentrationAndDownedState` (`:2548-2578`), called from at least two damage paths (`:2274`, `:2527`); cleared on long rest (`:2885`) | Correct DC formula `max(10, floor(damage/2))`, CON save, break on failure, break on 0 HP/incapacitation, cleared on long rest; exercised end-to-end by test (`src/engine.test.ts:1458-1516`) | Only reachable at all through the 30-spell allow-list, since only compiled spells can be cast; no test exercises the damage-triggered break path specifically for a caster's own concentration (the existing test only exercises the long-rest clear) | Medium-High |
| Targeting / range / area | LANTERN_PARTIAL (scalar, not geometric) | `executableSpellRangeFeet()`, `src/engine-domain.ts:1683-1691`; range checked against `target.distanceFeet` (`:1443-1452`) | Deterministic, atomic, correctly folds in area size for self-origin spells (e.g., a 15-ft cone becomes a 15-ft "range"); out-of-range cast rejected with state unchanged (test, `src/engine.test.ts:1433-1441`) | No real coordinates or shape intersection — confirms and extends the prior action-economy audit's finding for spells specifically; a "cone" spell's actual shape/angle is never evaluated, only a flat distance number | High |
| Legal spell offers for the DM/LLM | ABSENT | `EngineSessionView.availableActions`, `src/engine-domain.ts:269-274` | — | Not a per-turn computed menu of castable spells; DM must already know exact spell content keys and rely on rejection codes to discover unavailability | High |
| Spell command contract (caller-injectable fields) | LANTERN_IMPLEMENTED (safe) | `cast_spell` schema, `src/engine-contracts.ts:445-451` — `.strict()` object with only `spellKey`, `slotLevel`, `targetIds` | No damage/DC/attack-bonus/healing field exists on the schema at all; caller cannot inject authoritative values structurally, not just by runtime check | `spellKey` must start with `open5e:spell:` (stable content key) — no fuzzy name matching, so no ambiguous-name-collision risk either | High |
| NPC / monster spellcasting | LANTERN_STUB (statblock content only) | `compiledCreatureAttackSchema.attackKind: "weapon" \| "spell"` (`content/schema.ts:796`); creature turns resolved via `executionMode` in `{multiattack, saving-throw-damage, saving-throw-condition, spell-area, fragments}` (`content/schema.ts:942-948`), not via `resolveCastSpell` | Mage/Archmage/Priest-type creature content exists (12 name matches in `creatures.ndjson`) and their attacks execute through the same well-tested generic creature-attack pipeline as any other monster | No slot consumption, no concentration, no distinct "NPC casting" resolver — a "Mage" NPC is mechanically indistinguishable from any other pre-compiled attacker; per-day/at-will spell resource tracking for monsters was not found | Medium (did not exhaustively trace one full NPC Mage cast end to end within this pass) |
| Rest recovery | LANTERN_IMPLEMENTED | `resolveRest`, `src/engine-domain.ts:2840-2905` | Short rest: hit-dice healing + conditional pact-slot restore; long rest: full HP, partial hit-dice, all slots to max, concentration cleared, death-save counters reset; both reject during active combat | No in-world clock distinct from `updatedAt`; nothing prevents narratively chaining rests beyond resource exhaustion (same finding as the prior action-economy audit, now confirmed to also cover spell slots) | High |

---

## 3. Class support matrix

"Creation" = can a character of this class be created with correct base stats. "Progression" = can the character ever advance past level 1 through the live command surface. "Spell access" = does `learn_spell`/`prepare_spell` correctly branch for this class's `selectionMode`. "Slots/resources" = are this class's slots (and any distinct resource, e.g. Pact Magic) correctly modeled. "Casting" = can any of this class's actual spells execute via `cast_spell`. "Rest recovery" = does this class's resource set recover correctly on rest.

| Class | Creation | Progression | Spell access | Slots/resources | Casting | Rest recovery | Overall |
|---|---|---|---|---|---|---|---|
| **Wizard** | LANTERN_IMPLEMENTED (canonical `classKey` path; also the one class in the legacy 4-class shortcut enum) | ABSENT (unreachable) | LANTERN_IMPLEMENTED (spellbook mode: learn → prepare, correctly gated) | LANTERN_IMPLEMENTED (standard slots, long-rest recovery) | LANTERN_PARTIAL — only Wizard-list spells on the 30-spell allow-list (e.g. Fire Bolt, Magic Missile, Burning Hands, Shatter) are castable; the rest of the Wizard list is `CONTENT_ONLY` | LANTERN_IMPLEMENTED | **Best-supported class** — the only one with direct test coverage (`src/engine.test.ts:1304`, `:1364`, `:1402`, `:1458` all use `className: "wizard"`) |
| **Cleric** | LANTERN_IMPLEMENTED (canonical path; correct WIS ability, correct `selectionMode:"prepared"` against the full class list) | ABSENT | LANTERN_IMPLEMENTED (prepared-mode logic is correct per 5e, better than the reference engine) | LANTERN_IMPLEMENTED (standard slots, long-rest) | **LANTERN_STUB** — Cleric's list is healing/support-heavy; only a couple of damage spells (e.g. Guiding Bolt, Harm) are on the allow-list, and Cleric's signature spells (Cure Wounds, Healing Word, Bless) are `CONTENT_ONLY` | LANTERN_IMPLEMENTED | Mechanically sound but not playable as a healer today; no domain-spell concept exists at all |
| **Warlock** | LANTERN_IMPLEMENTED | ABSENT | LANTERN_IMPLEMENTED (known-mode, correct) | LANTERN_IMPLEMENTED — genuinely distinct Pact Magic recovery timing, verified in the resolver | LANTERN_PARTIAL — Eldritch Blast, Hellish Rebuke are on the allow-list and correctly upcast to the (single) available pact slot level; most of the rest of the list is `CONTENT_ONLY` | LANTERN_IMPLEMENTED (short-rest pact recovery genuinely conditional, not a label) | Best-supported *resource model* among non-Wizard classes; casting surface still thin |
| **Sorcerer** | LANTERN_IMPLEMENTED | ABSENT | LANTERN_IMPLEMENTED (known-mode) | LANTERN_IMPLEMENTED (standard slots) | LANTERN_PARTIAL — shares much of the Wizard damage-spell allow-list (Fire Bolt, Magic Missile, Fireball, etc.) | LANTERN_IMPLEMENTED | No Sorcery Points / Font of Magic / Metamagic anywhere in `engine-domain.ts` (zero grep hits) — ABSENT, not merely unimplemented-for-now |
| **Druid** | LANTERN_IMPLEMENTED | ABSENT | LANTERN_IMPLEMENTED (prepared-mode) | LANTERN_IMPLEMENTED | **LANTERN_STUB** — Druid's list is control/utility-heavy; very few Druid spells are on the 30-entry allow-list | LANTERN_IMPLEMENTED | No Wild Shape anywhere in `engine-domain.ts` (zero grep hits) — ABSENT |
| **Bard** | LANTERN_IMPLEMENTED | ABSENT | LANTERN_IMPLEMENTED (known-mode) | LANTERN_IMPLEMENTED | **LANTERN_STUB** — Bard's list is control/utility/buff-heavy, essentially none of it is on the damage-only allow-list | LANTERN_IMPLEMENTED | No Bardic Inspiration / Magical Secrets anywhere in `engine-domain.ts` — ABSENT |
| **Paladin** | LANTERN_IMPLEMENTED | ABSENT | LANTERN_IMPLEMENTED (prepared-mode, half-caster table starts progression at the correct content-encoded level) | LANTERN_IMPLEMENTED (standard slots) | LANTERN_STUB — Paladin's list is mostly buff/smite-flavored, not on the damage allow-list | LANTERN_IMPLEMENTED | No Divine Smite, no Lay on Hands, no Oath spells found anywhere in `engine-domain.ts` — all ABSENT; Paladin's spellcasting exists only as generic slot tracking |
| **Ranger** | LANTERN_IMPLEMENTED | ABSENT | LANTERN_IMPLEMENTED (known-mode) | LANTERN_IMPLEMENTED | LANTERN_STUB — Ranger's list (Hunter's Mark, etc.) is not on the damage allow-list | LANTERN_IMPLEMENTED | No Hunter's Mark / Favored Enemy / subclass spells found — ABSENT |
| **NPC/monster casters** | N/A (not a player-created character) | N/A | N/A — uses a completely separate pipeline | LANTERN_STUB — no slot/resource tracking of any kind | LANTERN_STUB — pre-compiled per-creature attack numbers only, via the generic creature-attack resolver | N/A (creatures don't rest) | Mechanically works as "creature attacks," does not model spellcasting as a distinct system |

**Not audited in depth (declared explicitly as UNKNOWN rather than assumed absent):** Eldritch Knight/Arcane Trickster subclass spell access, feat-granted spells, magic-item spellcasting, ancestry/innate spellcasting, scroll-based casting, and copying spells into a spellbook from a scroll. A `zero grep hits for "invocation"` search across `src/` confirms Warlock Invocations are ABSENT; a similar search found no `scroll` handling in `engine-contracts.ts`'s command union, which is reasonably strong (if not exhaustive) evidence that scrolls are entirely unimplemented in Lantern (distinct from the reference engine, which does have a scroll subsystem — see Part X).

---

## 4. Spell-family support matrix

| Resolution family | Implemented? | Example | Resolver | Tests |
|---|---|---|---|---|
| Spell attack, single target | Yes | Fire Bolt, Chill Touch | `resolveCastSpell`, `resolution === "spell-attack"` branch (`engine-domain.ts:1502-1508`) | `engine.test.ts:1304` (Fire Bolt cantrip cast) |
| Spell attack, multiple beams | Partial — engine supports multiple `targetIds`, but per-beam independent targeting (e.g. Scorching Ray's 3 separate rays, each potentially at a different target) was not confirmed distinct from simple multi-target | Scorching Ray (on allow-list) | Same `resolveCastSpell` loop over `targets` | None found specific to multi-beam semantics |
| Saving throw, half damage on success | Yes | Fireball, Burning Hands | `resolution === "saving-throw"`, `saveOnSuccess === "half"` (`:1521-1523`) | `engine.test.ts:1402` (Burning Hands, area+range) |
| Saving throw, no effect on success | Yes (schema supports `saveOnSuccess: "none"`) | (allow-list spells classified via regex in `classifySpellDamageResolution`, `open5e-import.ts:3609-3619`) | Same branch, `afterSave` computed as 0 | Not directly exercised by a named test in this pass — UNKNOWN whether a "none" case is covered |
| Automatic hit | Yes, but hardcoded to one spell | Magic Missile only (`sourceKey === "srd_magic-missile"` special-cased in `classifySpellDamageResolution`, `:3621-3625`) | `resolution === "automatic"` | UNKNOWN — not directly located in this pass |
| Healing | **ABSENT (not compiled)** | Cure Wounds, Healing Word | — (`compileSpellEffects` requires `damageRoll`, so no healing spell ever gets a `spell.effect`) | None — cannot be tested because it cannot execute |
| Temporary HP | ABSENT | False Life, Heroism | — | — |
| Condition application (spell) | ABSENT via `cast_spell` (condition-application exists for *creature* effect-programs via `apply-condition` operations, but not wired to player spellcasting) | Hold Person | `compiledEffectOperationSchema` supports `apply-condition` (`content/schema.ts:891-902`) but this is part of the creature `effect-program` pipeline, not `compiledSpellEffectSchema` | — |
| Buff (AC, advantage, etc.) | ABSENT | Shield, Bless | — | — |
| Ongoing/DoT damage | UNKNOWN — not located in this pass | Cloudkill-style spells | — | — |
| Concentration zone | ABSENT (concentration flag exists; no persistent zone/AoE-over-time model) | Spirit Guardians | Concentration itself works (see §2); the "zone that keeps affecting creatures" mechanic does not | — |
| Summoning | **ABSENT (explicit TODO in the reference engine; not found compiled in Lantern at all — no `summon` kind in `SpellEffectSchema`-equivalent for Lantern)** | Conjure Animals | — | — |
| Teleportation | ABSENT | Misty Step | — | — |
| Forced movement | ABSENT | Thunderwave's push (Thunderwave IS on the damage allow-list, but only its damage is applied — the push described in its prose is a "deferred prose effect," flagged explicitly by `hasDeferredProseEffects: true` on every compiled spell, `open5e-import.ts:3569`) | — | The `message` string in `resolveCastSpell` (`:1559`) literally appends "Only the reviewed primary damage is applied; additional source-prose effects remain deferred" whenever this flag is true — an honest, self-reporting admission of the gap |
| Detection/divination | ABSENT | Detect Magic | — | — |
| Illusion | ABSENT | Minor Illusion | — | — |
| Charm/social control | ABSENT | Charm Person | — | — |
| Dispel | ABSENT | Dispel Magic | — | — |
| Counterspell | ABSENT — content exists (`srd_counterspell`, `castingTime:"reaction"`, no `damageRoll`), confirmed not on the allow-list and has no interrupt-casting logic anywhere in `engine-domain.ts` | Counterspell | — | Matches the reference engine's finding (there, explicitly `test.skip()`-marked as unimplemented) |
| Resurrection | ABSENT | Revivify | — | — |
| Transformation | ABSENT | Polymorph | — | — |

For every unsupported family: the engine **rejects** the spell (`content_tier_insufficient`, state unmutated) rather than falling back to a generic effect or misrepresenting it as supported. This is a structurally safe failure mode — confirmed by the compiled-effect nullability check in `resolveCastSpell` (`engine-domain.ts:1370-1377`) and proven by test (`engine.test.ts:1364-1400`). Whatever narration an LLM DM produces on top of that rejection is outside the engine's control — see §7 and Part T discussion below.

---

## 5. Full runtime traces

### 5.1 Wizard cast (Fire Bolt cantrip) — the one family that fully works

Traced against `src/engine.test.ts:1304-1362` and the resolver it exercises.

1. `character_create` with `className: "wizard"` → `createCharacter` → `buildSpellcastingState("wizard", 1, abilities)` (`engine-domain.ts:3583`) sets `ability: "int"`, `slots: {"1": 2}`, `slotMaximums: {"1": 2}`, `slotRecovery: "long-rest"`.
2. `learn_spell` with `spellKey: "open5e:spell:5e-2014:srd-2014:srd_fire-bolt"` → `resolveLearnSpell` (`:1180-1259`): confirms Fire Bolt is on the Wizard class spell list (`getOpen5eSpellList`), confirms it's not already known, since it's a cantrip (`level === 0`) checks `progression.cantripsKnown[levelIndex]` and the currently-known-cantrip count against that limit, then pushes a reference into `knownSpells`. Committed atomically; `JSON.stringify(...)` of the resulting spellcasting state does not contain the human-readable spell name "Fire Bolt" — only the stable content key and pack hash are stored (asserted directly by the test, `:1332`).
3. `combat_start` spawns one goblin at default `distanceFeet`.
4. `cast_spell` with `spellKey` = Fire Bolt, `targetIds: [goblinId]` → `resolveCastSpell` (`:1342-1582`): confirms spellcasting exists, confirms Fire Bolt is known (cantrips read from `knownSpells`, not `preparedSpells`), confirms `spell.effect` is non-null (it is — Fire Bolt is on the 30-spell allow-list), confirms combat is active, confirms not unconscious, confirms `castingTime === "action"` and it's the player's turn and the Action isn't already spent, calls `selectSpellSlot(0, undefined, slots)` which returns `{slotLevel: null}` for a cantrip (no slot cost), confirms at least one target and validates target liveness and range (`executableSpellRangeFeet` for Fire Bolt's declared range), then clones state, sets `actionUsed = true`, rolls a d20 attack (`resolution === "spell-attack"`), compares to the target's canonically-derived AC, rolls damage on hit, applies damage with `applyCreatureDamageAffinity`, updates HP, and `commit()`s everything (state + event + command-result) in one SQLite transaction (same pattern as `ADR-H11`/`ADR-H15`).
5. Assertions confirm: `cast.accepted === true`, slots unchanged (cantrip, correctly), `combat.actionUsed === true`, the event's `contentKeys` includes Fire Bolt's key, and `cast.data` reports `slotLevel: null` and `deferredProseEffects: true` (Fire Bolt's non-damage prose, if any, is explicitly flagged as not applied).

**Conclusion:** this trace is real, atomic, and correctly gated end-to-end — for a cantrip, on the allow-list, for the one class with test coverage.

### 5.2 Cleric cast (healing) — trace stops at the content-execution boundary

1. `character_create` with a Cleric `classKey` → `buildSpellcastingState` sets `ability: "wis"`, `slotRecovery: "long-rest"`, `slots` from the Cleric progression table — this part works identically to Wizard.
2. `prepare_spell` with, e.g., Cure Wounds's content key → `resolvePrepareSpell` (`:1261-1340`): `progression.selectionMode === "prepared"` (not `"known"`), so this path is used (not `learn_spell`, which explicitly rejects prepared-mode classes with `"spell_learning_not_required"`). Confirms Cure Wounds is on the Cleric class list, confirms slot-level eligibility, confirms prepared capacity via `preparedSpellCapacity()` (`:1599-1611`), and pushes the reference into `preparedSpells`. **This step succeeds** — preparation itself is class-generic and does not check for compiled executability.
3. `cast_spell` with Cure Wounds's content key → `resolveCastSpell`: confirms Cure Wounds is prepared (yes) → `getOpen5eSpell(command.spellKey)` returns the kernel record → **`spell.effect` is `null`**, because `compileSpellEffects()` never produces an effect for a spell with no `damageRoll` → immediate rejection: `content_tier_insufficient`, `"Cure Wounds is preserved as Open5e prose but has no reviewed S4 executable primary effect."` State is returned unmutated (same `rejection()` path proven elsewhere).

**Conclusion:** the trace reaches the mechanics boundary correctly and fails safely — no HP is healed, no slot is spent, no false state is committed — but it never produces a healing effect. This is the concrete instance of the "Cleric's core kit is `CONTENT_ONLY`" finding.

### 5.3 Warlock cast (pact spell) — works for allow-listed spells, correctly at pact level

1. `character_create` with Warlock `classKey` → `buildSpellcastingState("warlock", 1, abilities)`: `ability: "cha"`, `slots: {"1": 1}` (per the content table, a level-1 Warlock has exactly one 1st-level slot), `slotRecovery: "short-or-long-rest"`.
2. `learn_spell` with Hellish Rebuke's key (Warlock is `selectionMode: "known"`) → succeeds identically to the Wizard cantrip trace's `learn_spell` step, gated by `knownSpellLimits[levelIndex]` instead of a spellbook formula.
3. `cast_spell` with Hellish Rebuke, no explicit `slotLevel` → `selectSpellSlot(1, undefined, slots)`: since the only nonzero bucket is level 1, this resolves to `slotLevel: 1` — automatically "pact level," with no special-case Warlock logic required, purely because the content table only ever has one nonzero level per character level. Damage resolves via the `"saving-throw"` branch (`savingThrowAbility: "dex"`), slot decrements, commit is atomic.
4. `rest` with `restType: "short"` → `resolveRest`: `pactRecovery` check (`:2858-2860`) evaluates true because `slotRecovery === "short-or-long-rest"` and at least one slot is below max → `next.character.spellcasting.slots = {...slotMaximums}` — full restore, on a short rest, **and only because of that flag** (an ordinary standard-slot caster's slots would be left untouched by this same code path).

**Conclusion:** genuinely correct, verified by reading both the cast path and the rest path together (no test in this repo directly exercises steps 3+4 back-to-back for a Warlock specifically — flagged as a test-coverage gap in §8, but the code paths are independently proven correct by other tests exercising each mechanism).

### 5.4 Concentration lifecycle

1. Cast a concentration spell (e.g., Wall of Fire, level 9 test fixture, `engine.test.ts:1458-1516`) → `resolveCastSpell` sets `next.character.spellcasting.concentration = {contentKey, packHash, startedRound: combat.round}` (`:1459-1465`), overwriting (and thus implicitly ending) any prior concentration in the same assignment.
2. When the concentrating character takes damage from any resolved attack, `applyConcentrationAndDownedState()` (`:2548-2578`) runs: if `hp <= 0` or the character becomes incapacitated, concentration is cleared unconditionally (`:2556-2559`); otherwise, if `damage > 0` and concentration is active, it rolls `d20 + con save modifier` against `max(10, floor(damage/2))` and clears concentration on failure.
3. `rest` with `restType: "long"` unconditionally clears concentration (`:2885`), correct since 8 hours exceeds any spell's duration.

**Conclusion:** the lifecycle is real and correctly implemented per 5e's actual rules (start ends previous; break on damage via save; break on 0 HP/incapacitation; cleared on long rest). The one gap: this is only reachable through the 30-spell allow-list, and only a few of those (e.g., Call Lightning, Insect Plague, Incendiary Cloud) are also concentration spells — so the *feature* is solid but its *reachable surface* is as narrow as the rest of the casting system.

### 5.5 Invalid spell (uncompiled) — traced above in §5.2; also directly tested

`engine.test.ts:1364-1400` casts Magic Missile-adjacent Cure-Wounds-style scenario generically ("rejects an uncompiled spell..."): learns and prepares an uncompiled spell, starts combat, snapshots the full campaign state as JSON, attempts `cast_spell`, and asserts both `{accepted: false, code: "content_tier_insufficient", event: null}` **and** `JSON.stringify(rejected.state) === before` — i.e., byte-for-byte state equality, not just "no exception thrown." This is a genuinely strong invariant proof, not a weak "didn't crash" test.

### 5.6 NPC Mage cast

**Trace does not reach a comparable path, because none exists.** An NPC casting a "spell" is executed through `resolveAdvanceTurn` → `resolveCompiledCreatureProgram`-equivalent logic reading a `CompiledCreatureAttack` or `CompiledEffectProgram` record with `attackKind: "spell"` — these are pre-baked per-creature numbers (`toHit`, `damage.diceCount/dieSides/bonus`) established at content-compile time from the creature's statblock prose, not resolved against a spell database, a slot pool, or a concentration record at all. There is no point at which an NPC's turn touches `EngineSpellcasting`. The trace the audit brief asks for ("content record → resolved event") is answerable only by substituting "creature-attack content record" for "spell content record" — which is a different, simpler pipeline than player spellcasting, not a shared one.

---

## 6. Invariants currently enforced (proven by code and tests)

1. **Casting an uncompiled (non-allow-listed) spell mutates nothing.** `resolveCastSpell`'s `spell.effect` null-check precedes every other check that would clone state; proven by exact `JSON.stringify` equality (`engine.test.ts:1364-1400`).
2. **Out-of-range casting mutates nothing.** Proven the same way (`engine.test.ts:1430-1441`).
3. **Slot expenditure, action-economy flag, and damage application are committed atomically in one transaction**, following the same pattern already proven for combat (`ADR-H11`/`ADR-H15`); no code path was found that writes one without the other.
4. **Standard-slot casters do not recover slots on a short rest; Pact Magic casters do**, gated by the `slotRecovery` content flag, not a class-name string comparison (`resolveRest`, `:2857-2876`).
5. **Prepared/known/spellbook selection modes are enforced per-class from content**, not hardcoded: `learn_spell` rejects prepared-mode classes ("use prepare_spell instead"); `prepare_spell` rejects known-mode classes; spellbook-mode preparation additionally requires the spell to already be learned.
6. **Concentration starting a new spell implicitly ends any prior concentration** (single assignment, not additive); **concentration breaks on a failed CON save after damage, on 0 HP/incapacitation, and is always cleared on long rest.**
7. **The `cast_spell` command schema cannot carry caller-supplied damage, healing, DC, or attack-bonus values** — `.strict()` Zod schema with only `spellKey`/`slotLevel`/`targetIds` (`engine-contracts.ts:445-451`); this is a structural guarantee, not a runtime check that could be bypassed by a different code path.
8. **Spell content keys are exact and pinned, not fuzzy-matched.** `spellKey` must start with `open5e:spell:`; `hasPinnedSpell` additionally checks the pack hash and rejects with `content_pack_mismatch` if a known/prepared reference is pinned to a different installed content pack than the one currently active.

---

## 7. Invariants not enforced / material gaps

- **No engine command changes `character.level`.** This isn't a narrow gap in one feature — it means every class-progression question (higher-level spells, Mystic Arcanum, growing spellbook/known-spell counts) is moot in the live product today, independent of whether the underlying data model supports it (it does).
- **No trigger system backs reaction-timed spells.** A reaction spell can be cast at any point off-turn as long as the Reaction flag is unspent — there is no `pendingReaction`-equivalent record, no linkage to a specific incoming attack. This means a player (or an LLM DM on the player's behalf) could cast Hellish Rebuke as a reaction without having actually just been damaged by anything, and the engine would not reject it on that basis (only on turn/resource-availability grounds). This is a genuine, exploitable-in-spirit gap even though the *numbers* it produces are still correct.
- **`hasDeferredProseEffects` is always `true` for every compiled spell** (`open5e-import.ts:3569` sets it unconditionally). Every allow-listed spell's *secondary* prose effects (e.g. Thunderwave's forced push, Shatter's structure-damage note) are silently never applied, and the engine only surfaces this via a generic appended sentence in the result message — an LLM DM narrating the result has no structured signal for *which* secondary effect was skipped, only that "some prose effect was deferred." This creates real narrative/mechanical-disagreement risk: a DM could narrate "the goblin is knocked back 10 feet" from Thunderwave's prose while the engine applied only damage.
- **No legal-spell-offer computation exists**, so a stale or entirely-invented spell key from the DM is only caught at execution time via rejection codes, not proactively prevented — functionally safe (nothing mutates on rejection) but a worse DM/LLM experience than a computed menu would provide, and a larger surface for the LLM to "try" spells that were never really available.
- **No noncombat-time or repeated-rest control specific to spellcasting** — same underlying gap as the general rest system (already flagged in the prior action-economy audit), now confirmed to also govern spell-slot recovery: nothing prevents narratively chaining short/long rests beyond the resources they restore, since there's no in-world clock separate from `updatedAt`.
- **Concentration's damage-triggered break path has no dedicated test** exercising a caster's own concentration breaking mid-encounter (the one existing concentration test only exercises the long-rest clear) — the code is shared with the general combat damage path and is reasonably trusted by extension, but this specific sequence (cast concentration spell → take damage → save → break) is not independently proven for the caster the way the reference engine's dedicated `concentration.test.ts` proves it.
- **Multi-beam spells (e.g. Scorching Ray) were not confirmed to support independent per-beam targeting** distinct from ordinary multi-target resolution — flagged `UNKNOWN`, not confirmed broken.

---

## 8. Test evidence

### Commands run

| Command | Result | Notes |
|---|---|---|
| `npm run build` (PowerShell, `F:\Github\rpg mcp live`) | **PASSED** | `open5e:verify-pack && tsc`; content-pack verification output confirmed spell-progression and spell counts install cleanly, no TypeScript errors |
| `npm test` (PowerShell, `vitest run --pool=forks`) | **PASSED** — 14 test files, 86 tests, 0 failures, 10.97s | `src/engine.test.ts`: 30 tests |
| `git status --short` / `git log -1` | No commits yet — same finding as the prior audit, unresolved | Confirms Lantern is still an uncommitted working tree |
| Git-Bash `npm run build` | **Environment failure**, unrelated to the audit — `fnm` shell-hook error; PowerShell used for all Node/npm/git commands instead, same workaround as the prior audit | Sandbox artifact, not a Lantern defect |

### Magic-related tests found (all in `src/engine.test.ts`; no dedicated spell/magic test file exists)

| Test | What it actually proves | What it does NOT prove |
|---|---|---|
| `learns and casts a compiled cantrip from pinned S5 spell content` (`:1304`) | Full learn→cast pipeline for a Wizard cantrip; content-key-only storage (no display name leakage); atomic commit; action-economy flag set | Nothing about leveled spells, slots, any non-Wizard class, healing, buffs, concentration, or reactions |
| `rejects an uncompiled spell without consuming its slot, action, target HP, or campaign version` (`:1364`) | Byte-for-byte state immutability on rejection — a strong proof, not a weak "no exception" test | Does not prove *why* a spell is uncompiled is correctly classified — only that the null-effect path is safe |
| `uses persisted encounter distance and area geometry for spell range and affected targets` (`:1402`) | Range gating is a correct scalar distance+area-size comparison; despite the test name mentioning "area geometry," **no actual shape/angle geometry is evaluated** — this is the same "geometry-named test proves only a scalar" pattern the prior action-economy audit flagged for combat range, now confirmed to also apply to spell range specifically | Does not prove cone/sphere/line shapes are spatially distinguished in any way |
| `rejects prose-only upcasting, then atomically resolves concentration and long-rest recovery` (`:1458`) | Upcast-level rejection when only prose (not a compiled slot-level variant) describes the higher-level effect; concentration correctly set on cast and correctly cleared on long rest; slot decrement is exact | Does not exercise the damage-triggered concentration-break path; the level-9 character state used here is constructed by direct JSON mutation + `normalizeCampaignState`, **not** through any player-facing "level up" command — this test is itself evidence that leveling has no live command path |

### Not found (gaps in magic-specific test coverage)

No test in this repository exercises: a non-Wizard class casting a spell (Cleric/Warlock/Sorcerer/Druid/Bard/Paladin/Ranger are entirely absent from `engine.test.ts`'s spell-related tests); Pact Magic short-rest recovery end-to-end for a Warlock specifically (the mechanism is proven in isolation via the general `resolveRest` code path, but not chained after an actual Warlock cast in one test); a damage-triggered concentration break; reaction-spell casting; NPC/monster spellcasting; scroll usage (no scroll subsystem exists to test); or any healing/buff/summon spell (none can execute, so none can be tested).

### Claims not independently verified in this pass (marked `UNKNOWN`, not assumed)

- Whether every one of the 30 allow-listed spells' damage/save classification (`classifySpellDamageResolution`'s regex matching against spell prose) is correct for every spell — only Fire Bolt, Burning Hands, Wall of Fire, and Hellish Rebuke were traced in detail.
- Whether Eldritch Knight/Arcane Trickster subclass spell access, feat-granted spells, or magic-item spellcasting exist in any form — grep found no obvious hits, but this was not exhaustively traced.
- The exact behavior of `readToolData`/the DM-facing tool surface's spell-related read tools beyond `EngineSessionView.availableActions` — only that one field was traced.

---

## 9. Recommended next milestone

**Do not attempt to broaden the spell-family coverage (healing/buffs/summons) before deciding whether class progression should become reachable at all — the two are independent axes of the same underlying gap, and fixing only one leaves the other looking finished when it isn't.**

A trustworthy first slice, matching the audit brief's request but scoped to what's actually missing:

```text
Wizard:
  already works end-to-end for allow-listed damage spells — no changes needed
  for this slice; use as the reference implementation pattern

Cleric:
  compile ONE healing spell (Cure Wounds is the obvious candidate: single
  target, single die expression, no save/attack roll, no area) into an
  executable spell.effect — requires extending compileSpellEffects (or adding
  a parallel compileHealingEffects) to recognize a "heals X" pattern the way
  classifySpellDamageResolution recognizes "deals X damage" patterns, and
  extending resolveCastSpell with a healing branch parallel to its damage
  branch (apply healing capped at maxHp, record before/after HP exactly as
  the damage branch already does)

Warlock:
  already works end-to-end for allow-listed spells with correct pact-slot
  selection and short-rest recovery — add ONE test that chains cast → short
  rest → cast again in a single scenario to close the coverage gap noted in
  §8, no engine changes needed

Reaction:
  pick ONE spell that actually needs trigger semantics (Shield is the
  obvious candidate) and build the smallest real trigger: when an incoming
  attack roll would hit the concentrating/reacting character, pause before
  applying damage, check for an eligible declared Reaction spell, resolve it
  (AC +5, re-check hit), then continue — this requires the first
  pendingReaction-equivalent record in Lantern's engine, and depends on
  first having a healing/buff compiled-effect kind (Shield is a buff, not
  damage) from the Cleric milestone above

All:
  persist, refresh, retry idempotently (already proven by the general
  command-transaction contract — verify it holds for the two new command
  paths above rather than assuming it), and expose structured evidence
  (rolls/modifiers/before-after) the same way resolveCastSpell's damage
  branch already does
```

Do not propose a broad rewrite of the spell-content pipeline (e.g., attempting to compile all ~300+ SRD spells at once) before this narrow slice proves the healing/buff compiled-effect pattern works end-to-end — the damage pattern took a hardcoded 30-spell allow-list plus regex-based prose classification to get right; extending it should be incremental, spell-by-spell, the same way the damage list evidently was built.

---

## 10. Product-owner decisions

1. **Is class progression (leveling) in scope for the first campaign, or is level 1 the intended MVP ceiling?** If leveling is intended, a `level_up`/XP-to-level command needs to be designed and built — currently nothing in the command surface can ever change `character.level`, despite the content layer already fully supporting it to level 20. If level 1 is the intentional ceiling for now, that should be stated explicitly (it currently reads as an oversight, not a decision, since nothing documents it).
2. **Which non-damage spell-effect kinds are must-have for launch?** Healing (Cleric/Druid/Bard's core identity) is the highest-leverage gap; buffs (Shield) are needed for any real reaction-spell story; summons and utility/divination spells are lower priority narratively (an LLM DM can improvise divination outcomes more safely than it can improvise combat damage numbers).
3. **Known/prepared/spellbook implementation is already built correctly** — no decision needed here, but worth confirming the product wants Cleric-style "prepare from full class list" (already implemented) rather than a house-ruled "Clerics also need a personal known-spell list" model (which the reference engine incorrectly implements) — Lantern's current behavior is the 5e-correct one and should probably be preserved deliberately, not accidentally regressed toward the reference engine's model during any future porting work.
4. **Pact Magic's unified-slots-with-a-recovery-flag model vs. a dedicated Pact pool** — current implementation works correctly and is simpler to maintain; a decision is only needed if a future feature (e.g., a UI that must visually distinguish "pact slots" from "spell slots" for a multiclass character) requires a structurally separate field.
5. **Reaction UX**: does the product want a real pause-and-offer flow for reaction spells (requiring a `pendingReaction` state machine), or is an on-demand "declare a reaction cast whenever your Reaction is free" model (today's behavior) acceptable for launch? This materially affects whether Shield/Counterspell-style spells are worth compiling before that decision is made.
6. **Ritual casting**: currently entirely unmodeled (no `ritual` handling found anywhere in the cast/learn/prepare resolvers) — decide whether ritual-tag spells are in scope, and if so, whether they should bypass slot cost and action-economy checks the way 5e rules require.
7. **Scrolls and other item-granted magic**: absent entirely from Lantern (unlike the reference engine, which has a real scroll subsystem) — decide whether this is intentionally deferred or should be ported/rebuilt.
8. **NPC/monster spellcasting fidelity**: is the current "Mage" = "just another pre-compiled attacker" model acceptable for launch encounters, or does the product want a genuinely distinct NPC-casting resolver (with its own slot/at-will/per-day tracking) before shipping spellcaster enemies as a real encounter type?
9. **2014 vs. 2024 content policy**: this pass did not check whether both SRD versions are installed for spells specifically (the prior audit's Part X comparison work covered this at the pack level generally) — flagged `UNKNOWN`, worth an explicit product decision regardless of what's currently installed.

---

## 11. Machine-readable appendix

```json
{
  "magicKernel": {
    "overallStatus": "architecture_sound_content_narrow_progression_unreachable",
    "implemented": [
      "spell_content_schema_with_provenance",
      "class_generic_spellcasting_state_derivation",
      "pact_magic_distinct_recovery_timing",
      "known_prepared_spellbook_selection_modes",
      "atomic_slot_expenditure",
      "rejection_leaves_state_unmutated",
      "concentration_full_lifecycle",
      "strict_command_schema_no_caller_supplied_authoritative_values",
      "stable_content_key_no_fuzzy_spell_matching"
    ],
    "partial": [
      "spell_range_area_as_scalar_not_geometry",
      "damage_spell_execution_limited_to_30_spell_allowlist"
    ],
    "contentOnly": [
      "healing_spells",
      "buff_spells_including_shield",
      "condition_spells_via_player_cast_spell",
      "summon_spells",
      "utility_divination_illusion_spells",
      "counterspell",
      "ritual_casting",
      "scrolls"
    ],
    "referenceOnly": [
      "wizard_spellbook_as_distinct_reference_concept (reference engine ALSO lacks this; both absent, listed for comparison only)",
      "scroll_subsystem (present in reference engine, absent in Lantern)"
    ],
    "absent": [
      "class_progression_leveling_command",
      "reaction_trigger_system",
      "legal_spell_offer_computation",
      "warlock_invocations",
      "sorcerer_sorcery_points_metamagic",
      "cleric_channel_divinity",
      "paladin_divine_smite_lay_on_hands_oath_spells",
      "druid_wild_shape",
      "bardic_inspiration_magical_secrets",
      "ranger_huntersmark_favored_enemy",
      "npc_distinct_spellcasting_resolver"
    ],
    "broken": [],
    "highestRiskGaps": [
      "only_30_hardcoded_damage_spells_executable_no_healing_buffs_conditions_summons",
      "no_reachable_class_progression_past_level_1",
      "no_reaction_trigger_system_behind_reaction_timed_spells",
      "no_legal_spell_offer_menu_for_dm_llm",
      "npc_casters_never_touch_spell_system_no_slot_or_concentration_tracking"
    ]
  },
  "classes": {
    "wizard": {
      "status": "LANTERN_PARTIAL",
      "implemented": ["creation", "spellbook_learn_prepare", "standard_slots_long_rest", "allowlisted_damage_casting", "only_class_with_test_coverage"],
      "missing": ["progression_past_level_1", "non_allowlisted_spell_execution", "ritual_casting"],
      "broken": []
    },
    "cleric": {
      "status": "LANTERN_STUB",
      "implemented": ["creation", "correct_prepared_from_full_class_list", "standard_slots_long_rest"],
      "missing": ["healing_spell_execution", "domain_spells", "channel_divinity", "progression_past_level_1"],
      "broken": []
    },
    "warlock": {
      "status": "LANTERN_PARTIAL",
      "implemented": ["creation", "known_mode_spell_access", "distinct_pact_slot_recovery_timing", "automatic_pact_level_upcast", "allowlisted_damage_casting"],
      "missing": ["invocations", "pact_boon", "mystic_arcanum", "progression_past_level_1", "non_allowlisted_spell_execution"],
      "broken": []
    },
    "sorcerer": {
      "status": "LANTERN_PARTIAL",
      "implemented": ["creation", "known_mode_spell_access", "standard_slots_long_rest", "allowlisted_damage_casting_shared_with_wizard_list"],
      "missing": ["sorcery_points", "font_of_magic", "metamagic", "progression_past_level_1"],
      "broken": []
    },
    "druid": {
      "status": "LANTERN_STUB",
      "implemented": ["creation", "prepared_mode_spell_access", "standard_slots_long_rest"],
      "missing": ["wild_shape", "circle_spells", "control_utility_spell_execution", "progression_past_level_1"],
      "broken": []
    },
    "bard": {
      "status": "LANTERN_STUB",
      "implemented": ["creation", "known_mode_spell_access", "standard_slots_long_rest"],
      "missing": ["bardic_inspiration", "magical_secrets", "buff_utility_spell_execution", "progression_past_level_1"],
      "broken": []
    },
    "paladin": {
      "status": "LANTERN_STUB",
      "implemented": ["creation", "prepared_mode_spell_access_correct_half_caster_table", "standard_slots_long_rest"],
      "missing": ["divine_smite", "lay_on_hands", "oath_spells_always_prepared", "buff_spell_execution", "progression_past_level_1"],
      "broken": []
    },
    "ranger": {
      "status": "LANTERN_STUB",
      "implemented": ["creation", "known_mode_spell_access_correct_half_caster_table", "standard_slots_long_rest"],
      "missing": ["hunters_mark_mechanical_effect", "favored_enemy", "subclass_spells", "progression_past_level_1"],
      "broken": []
    },
    "npcCasters": {
      "status": "LANTERN_STUB",
      "implemented": ["creature_content_with_spell_flavored_attackKind", "generic_creature_attack_pipeline_execution"],
      "missing": ["distinct_npc_spellcasting_resolver", "slot_tracking", "concentration_tracking", "at_will_per_day_resource_tracking"],
      "broken": []
    }
  },
  "spellFamilies": {
    "implemented": ["spell_attack_single_target", "saving_throw_half_damage", "saving_throw_no_effect", "automatic_hit_magic_missile_only"],
    "partial": ["spell_attack_multiple_beams_unconfirmed_per_beam_targeting"],
    "contentOnly": ["healing", "temporary_hp", "condition_application_via_cast_spell", "buff", "ongoing_damage_unconfirmed", "concentration_zone", "summoning", "teleportation", "forced_movement_deferred_prose", "detection_divination", "illusion", "charm_social_control", "dispel", "counterspell", "resurrection", "transformation"],
    "absent": []
  },
  "verification": {
    "commandsRun": [
      "npm run build (PowerShell)",
      "npm test -- vitest run --pool=forks (PowerShell)",
      "git status --short",
      "git log -1 --format=\"%H %ci\""
    ],
    "passingTests": [
      "14 test files / 86 tests total, 0 failures",
      "src/engine.test.ts: 30 tests including 4 spell-specific tests at lines 1304, 1364, 1402, 1458"
    ],
    "failingTests": [],
    "unverifiedClaims": [
      "correctness of classifySpellDamageResolution regex classification for all 30 allow-listed spells beyond the 4 directly traced",
      "existence of Eldritch Knight/Arcane Trickster/feat/magic-item spell access",
      "exact behavior of the DM-facing tool surface beyond EngineSessionView.availableActions",
      "2014 vs 2024 SRD spell content installation policy specifically for spells"
    ]
  },
  "recommendedNextMilestone": {
    "name": "compile_one_healing_effect_and_one_real_reaction_trigger",
    "acceptanceCriteria": [
      "Cure Wounds (or an equivalent single-target, single-die healing spell) compiles into an executable spell.effect and resolveCastSpell applies healing capped at maxHp, symmetric to the existing damage branch",
      "A new test exercises Cleric character creation, prepare_spell against the full class list, and a successful Cure Wounds cast with before/after HP recorded on the event",
      "A new test chains Warlock cast_spell -> rest(short) -> cast_spell again in one scenario to close the existing Pact Magic coverage gap",
      "Shield (or an equivalent single-target AC buff with a reaction casting time) compiles into an executable buff effect, and a minimal pendingReaction-equivalent record is introduced so it only resolves in response to a specific incoming attack, not on-demand",
      "All three new/changed command paths are proven to leave state unmutated on rejection via exact JSON before/after equality, matching the existing pattern in engine.test.ts",
      "No change is made to character.level reachability in this milestone -- that is called out explicitly as a separate, larger product decision (see product-owner decision 1)"
    ]
  }
}
```
