# Audit: Lantern PC and NPC Leveling, Advancement, XP, and Progression

Status: **Read-only implementation audit.** No code, schema, migration, or test was modified. No pull request opened.
Audited runtime: **Lantern** (`F:\Github\rpg mcp live`), branch `main` (working tree; the repo currently has no committed history — every path is untracked on disk).
Comparison material: **reference engine** (`F:\Github\mnehmos.rpg.mcp`), commit `2a34f7f0` (2026-07-25).
Date: 2026-08-07.

> **Headline finding (read this first).** Lantern has a real, transactional, exactly-once **XP-accrual** path and a real **rest / hit-die economy**, but it has **no level-up engine at all.** `character.level` is fixed at creation (level 1) and is never advanced by XP. There is no XP-threshold table, no eligibility check, no pending advancement, no level-up command, no choice enumeration, no ASI, no feat execution, no subclass, no multiclassing, and no NPC/monster progression. The only way the test suite can exercise a level above 1 is to hand-mutate the persisted JSON (`engine.test.ts:1468-1469`). Monsters are immutable pinned statblocks; CR and XP are independently-imported display fields that are never auto-awarded and never consistency-checked. Progression, as a coherent *earn → become eligible → choose → recalculate → commit* lifecycle, **does not exist**; only the earn (XP) and recover (rest) halves do.

---

## 0. Audit method and verification

### 0.1 Environment

```
Lantern repo:  F:\Github\rpg mcp live   (branch main; no commits yet; all paths untracked)
Reference repo: F:\Github\mnehmos.rpg.mcp  commit 2a34f7f0 (2026-07-25)
Node: 20.18.x   Build: open5e:verify-pack && tsc   Test: vitest run --pool=forks
```

### 0.2 Commands run (read-only)

| Command | Result |
| --- | --- |
| `git status --short` (Lantern) | all paths untracked (`??`); `git log` reports branch `main` has no commits yet |
| `git log -1` (reference) | `2a34f7f0 2026-07-25 10:30:48 -0700` |
| `npm run build` (Lantern) | **PASS** (exit 0); pack hash `56bdfbda…b07f`, rulesVersion pinned |
| `npm test` (Lantern) | **PASS — 86 tests, 14 files** (0 failures, 0 skips) |
| Focused greps for `levelUp / level_up / threshold / XP_TABLE / proficiencyBonus / hitDice / subclass / feat / advancement / milestone / cr` across `src` | see Part A |

### 0.3 Evidence sources inspected

Runtime entry / contracts / domain: `src/engine-server.ts`, `src/engine-contracts.ts`, `src/engine-domain.ts` (4422 lines), `src/engine-store.ts`, `src/engine-tools.ts`, `src/engine-dm.ts`, `src/engine-turn-plan.ts`, `src/open5e-rules.ts`. Content subsystem: `src/content/schema.ts`, `src/content/catalog.ts`, `src/content/rules-kernel.ts`, `src/content/effect-compiler.ts`, `src/content/resolve.ts`, `src/content/open5e-import.ts` (4535 lines). Compiled pack: `content/open5e/open5e-v2-full-corpus-s8/compiled/*.ndjson`. Tests: `src/engine.test.ts` (30), `src/engine-dm.test.ts` (3), `src/game.test.ts` (4), `src/store.test.ts` (4), and content tests. Design: `docs/GDD.md`, ADRs `docs/ADR-H1*`..`H24`, prior audits in this folder.

### 0.4 Status vocabulary (used throughout)

`LANTERN_IMPLEMENTED` · `LANTERN_PARTIAL` · `LANTERN_STUB` · `CONTENT_ONLY` · `REFERENCE_ONLY` · `ABSENT` · `BROKEN` · `UNKNOWN`

**Convention used below:** a field/interface/imported record/feature name is *never* counted as runtime behavior. Only active resolver code reachable from a command and backed by a test counts as `LANTERN_IMPLEMENTED`.

---

## Part A — Progression vocabulary and sources of truth

### A.1 Every progression-like field found in the Lantern runtime

| Term | Where it lives | Runtime authority | Status |
| --- | --- | --- | --- |
| `level` (PC) | `EngineCharacter.level` (`engine-contracts.ts:764`); set at creation, read by `hydrateCharacter` (`engine-domain.ts:3760,3775`) | **Stored scalar, fixed at 1.** Never derived from XP. | `LANTERN_PARTIAL` (field + readers exist; no writer past 1) |
| `xp` (PC) | `EngineCharacter.xp` (`engine-contracts.ts:783`); mutated by loot/quest (`engine-domain.ts:741,2793`) | Stored accumulator; advanced by exactly-once rewards | `LANTERN_IMPLEMENTED` (accrual only) |
| `proficiencyBonus` (PC) | `EngineCharacter.proficiencyBonus` (`engine-contracts.ts:767`); derived `open5eProficiencyBonus(level)` (`open5e-rules.ts:338-340`) at create/hydrate (`engine-domain.ts:3405,3569,3785`) | **Derived from stored level, then persisted.** | `LANTERN_PARTIAL` (derived but persisted; see A.4) |
| `hitDie` / `hitDiceRemaining` (PC) | `engine-contracts.ts:772-773`; `hitDie` from class profile, `hitDiceRemaining` consumed/restored by `rest` (`engine-domain.ts:2864-2879`) | Runtime economy | `LANTERN_IMPLEMENTED` (rest economy) |
| `milestone` | **No field.** The string `milestone` appears only as (a) an *improvise effect title* in a test (`engine.test.ts:1529,1542`) and (b) embedded in feature prose. | None | `ABSENT` |
| `characterLevel` / `classLevel` / `classLevels` | No multiclass concept. `characterLevel` appears only inside the *content importer* parsing the class table (`open5e-import.ts:2551-2568`) and as a spell-progression row key (`schema.ts:555`). | N/A | `CONTENT_ONLY` |
| `subclass` | **No field on `EngineCharacter`** (confirmed: `engine-contracts.ts:764-788` has no subclass). Not in class profile (`open5e-rules.ts:51-60`). | None | `ABSENT` |
| `abilityScoreIncrease` / ASI | **No symbol anywhere in `src`.** | None | `ABSENT` |
| `feat` / `featRefs` | `EngineCharacter.featRefs` exists but is **always `[]`** (`engine-domain.ts:3395`); 91 feats imported, **0 compiled** (`build` output: `feats raw 91 normalized 91 compiled 0`); import manifest states feat prose "remains reference-only" (`open5e-import.ts:4486,4626`). | None | `CONTENT_ONLY` |
| `pendingLevel` / `pendingChoices` / `levelUpPlan` | **None.** | None | `ABSENT` |
| `levelUp` / `level_up` / `gainLevel` / `addXp` | **No command, no function.** `engineToolNameSchema` (`engine-contracts.ts:128-166`) has no such tool. | None | `ABSENT` |
| `challengeRating` (monster) | `NormalizedCreature.challengeRating` (`schema.ts:359`), imported (`open5e-import.ts:2265`), surfaced read-only on `EngineCombatantView` (`engine-contracts.ts:896`) | Display only; never recomputed, never enters budget math | `CONTENT_ONLY` |
| `experiencePoints` (monster) | `NormalizedCreature.experiencePoints` (`schema.ts:361`), imported independently of CR (`open5e-import.ts:2267`) | Display only; **never read at award time** | `CONTENT_ONLY` |
| `proficiencyBonus` (monster) | `NormalizedCreature.proficiencyBonus` (`schema.ts:360`, nullable, imported). **No CR→proficiency function exists.** Monster to-hit parsed verbatim from statblock prose (`open5e-import.ts:3824`). | Reference only | `CONTENT_ONLY` |
| `rank` / `tier` (NPC/faction) | `tier` appears only as content-fidelity vocabulary (tier 0/1/2) and spell-school text — **not** as a play-progression tier. NPC model `EngineNpc` (`engine-contracts.ts:591-600`) has `disposition`, `goals`, `socialDc`, `relationshipScore`, `memories` — no rank/tier/level. | None | `ABSENT` |
| `ruleset` / content-pack version | `contentPolicy` (`engine-contracts.ts:182-210`), pack hash pinned; `sourceTableSha256` on spell progression (`schema.ts:558`). | Per-campaign pinned | `LANTERN_IMPLEMENTED` (pinning; not per-actor — see Part Q) |

### A.2 Is there one canonical source for PC level?

Yes, but trivially: `EngineCharacter.level` is the single scalar. There is exactly one class (no multiclass), so total level == class level. Set once at creation to `1` and never rewritten by any command. **Risk:** because nothing writes it, the *concept* of canonical level is untested past 1.

### A.3 Is proficiency derived or persisted?

**Both, and they can diverge.** It is *derived* from level via `open5eProficiencyBonus` (`open5e-rules.ts:338`) inside `hydrateCharacter` (`engine-domain.ts:3785`) and at creation (`3405`), then *persisted* onto `EngineCharacter.proficiencyBonus` (`engine-contracts.ts:767`). Critically:

- The **basic `combat_action` attack** uses a **module-level hardcoded `const proficiencyBonus = 2`** (`engine-domain.ts:92`) at the attack roll (`engine-domain.ts:1743`), **not** `character.proficiencyBonus`.
- The **spell save DC / spell attack** path derives proficiency from level inside its own formula (see Part I).
- `savingThrows`/`skills` use the persisted derived value (`buildSavingThrows`/`buildSkillSheet`, `open5e-rules.ts:374-401`).

So a single character already has **two proficiency values in play** (`+2` hardcoded for the improvised melee attack vs the derived sheet value). If level ever advanced, the sheet would update but the basic attack would stay at +2. This *confirms and localizes* the action-economy audit's "hardcoded Strength/d8" divergence (`engine-domain.ts:92,1743-1756`) and shows progression would **compound** it.

### A.4 Can persisted values drift from derived values?

`hydrateCharacter` runs **only** on `character_update` (`engine-domain.ts:568`) and the legacy create path (`3603`). It is **not** invoked on campaign load — `engine-store.ts:7` imports `cloneCampaign, normalizeCampaignState, toSessionView`, not `hydrateCharacter`. Persisted derived fields (`proficiencyBonus`, `maxHp`, `abilityModifiers`, `savingThrows`, `skills`) are therefore whatever was computed at create/update time. Today there is **no observed drift** because nothing changes level and the pack is pinned; but there is also **no load-time recalculation guarantee** that would catch a future inconsistency (e.g. a pack repin changing a class profile, or a manual DB edit to level).

### A.5 Is CR ever mistaken for level? Are Hit Dice mistaken for level?

- **CR↔level:** No code path confuses them, but only because **neither feeds the other**. CR is display-only; level never feeds encounter math. There is no place where a creature's CR is read as a "level" or vice versa. Status: clean by absence.
- **Hit Dice↔level:** `hitDie` (singular, the class die size) and `hitDiceRemaining` (the per-rest pool) are distinct fields (`engine-contracts.ts:772-773`). At creation `hitDiceRemaining = level` (`engine-domain.ts:3411,3791`), so at level 1 the pool is 1. The pool is bounded by `Math.min(level, …)` on long rest (`2879`). No confusion observed, but note the pool is *defined in terms of stored level*, so it too never grows past 1 at runtime.

### A.6 Can the caller directly supply level, XP, CR, or proficiency?

| Value | Caller-suppliable? | Evidence |
| --- | --- | --- |
| `level` | **No** via any tool. `character_update` schema (`engine-tools.ts:587`, `engine-contracts.ts:284`) accepts name/background/alignment/description/abilityScores(legacy)/details — **no `level`**. | Safe by absence |
| `xp` | **Indirectly, as a reward amount.** `loot.rewardXp` / `quest_create.rewardXp` are caller values (`engine-contracts.ts:324,478`; `engine-tools.ts:268,510`), bounded `0..1_000_000`. The DM/LLM authors the amount; the creature's stored XP is ignored. | See Part O |
| `cr` | **No.** Creatures are referenced by `contentKey`+`packHash`; CR is read from pinned content, not accepted as input. | Safe |
| `proficiencyBonus` | **No direct input.** The hardcoded `+2` for the basic attack is a code constant, not caller input. | Safe (but see A.3) |

### A.7 Does the LLM ever decide that an actor leveled up?

**No** — because there is no level-up action to invoke. The LLM's only progression-adjacent power is choosing the **XP reward amount** in `loot`/`quest_create` (bounded, exactly-once). It cannot change level, proficiency, HP maximum, or grant features. See Part O.

---

## Part B — Advancement model

### B.1 Which models exist?

| Model | Status | Evidence |
| --- | --- | --- |
| Experience-point *accrual* | `LANTERN_IMPLEMENTED` | `xp +=` in `resolveLoot` (`engine-domain.ts:2793`) and `resolveQuestUpdate` (`741`) |
| Experience-point *leveling* (XP→level) | `ABSENT` | No threshold table, no conversion function, no level writer |
| Milestone leveling | `ABSENT` | No `milestone` tool/field |
| Story/quest advancement of *mechanics* | `ABSENT` | `quest_update` flips `status`/`progress` and pays a *reward*; it does **not** advance level. A quest reaching `completed` only credits `reward.xp`/`reward.copper` (`engine-domain.ts:736-742`) |
| Training-based advancement | `ABSENT` | — |
| Admin-granted level | `ABSENT` | No admin/DM level tool |
| Automatic level scaling | `ABSENT` | — |
| Static no-progression actors | `LANTERN_IMPLEMENTED` | All monsters/NPCs are static (Parts J–K) |
| Monster template advancement | `ABSENT` | No template/scale/advance code (monster audit, §5) |
| Faction/rank progression | `ABSENT` | NPCs have no rank/tier (A.1) |
| Relationship progression | `LANTERN_PARTIAL` | `social_check` adjusts `npc.relationshipScore` (`engine-domain.ts:591-618`); narrative-only, no mechanical capability change |
| Equipment-based power | `LANTERN_PARTIAL` | Equip/unequip re-derives AC (`deriveArmorClass`); this is *gear*, not *progression* |

### B.2 Policy answers

- **Authoritative for PCs:** Neither XP nor milestones *level*. The character is created at level 1 and stays there. XP is a score that accumulates with no mechanical consequence.
- **Multiple models coexist?** No — only accrual + rest.
- **Per-campaign advancement policy?** No advancement policy field exists. `contentPolicy` pins the ruleset/documents/licenses (`engine-contracts.ts:182-210`), not an XP-vs-milestone switch.
- **Switch between XP and milestones?** Impossible — neither mechanism levels.
- **What prevents double advancement?** N/A for levels. For *rewards*: `combat.lootClaimed` (`engine-contracts.ts:929`; checked `engine-domain.ts:2782`) and `quest.rewardClaimed` (`engine-contracts.ts:943`; checked `engine-domain.ts:736,2800`) are exactly-once flags.
- **Immediate or pending?** XP is applied *immediately* on commit (no pending state). There is no pending-advancement concept at all.
- **Leveling during combat / rest required / training time?** Moot — no leveling.

---

## Part C — XP and milestone acquisition

### C.1 Sources capable of granting XP

| Source | Grants XP? | Exactly-once? | Evidence |
| --- | --- | --- | --- |
| Creature defeat (loot) | Yes — DM-authored `rewardXp` | Yes (`lootClaimed`) | `resolveLoot` `engine-domain.ts:2774-2838`; `combat.status==="ended"` gate `2781` |
| Quest completion | Yes — `quest.reward.xp` | Yes (`rewardClaimed`) | `resolveQuestUpdate` `engine-domain.ts:720-754`; paid at `741` |
| Objective/exploration/social/discovery/traps/downtime/training | **No** | — | No such XP source exists |
| DM-awarded XP (free) | Only via `loot`/`quest` payloads | via those flags | — |
| Content-scripted rewards | None | — | No scripted reward hooks |
| Admin/test overrides | None in the tool surface | — | — |

**Key:** the *creature's own* `experiencePoints` (`schema.ts:361`) is **never read** at award time. XP is always the DM-authored `rewardXp`. A 3541-creature bestiary with imported XP/CR values contributes **zero** to actual XP granting.

### C.2 Who receives the reward; anti-farming

- **Recipient:** always `next.character.xp` — the single PC. There is no party, no split, no per-actor attribution (the product is one-player; `GDD.md:134` lists multiplayer as a non-goal).
- **Companions/NPC allies:** do not receive XP (they have no `xp`/`level`; Part J).
- **Tie to an event/objective:** loot is tied to `combat.lootClaimed`; quest XP to `quest.id` + `rewardClaimed`. Quest identity is a server-generated UUID (`engine-domain.ts:701`).
- **Retries / duplication:** safe. A retried `clientCommandId` replays the stored result without re-applying (`store.ts` idempotency; proven by `engine.test.ts:271` "replays a command without rerolling and rejects stale writes"). A *new* command ID that re-loots is blocked by `lootClaimed`; a new command re-completing a quest is blocked by `rewardClaimed`. Reward uniqueness is therefore tied to the underlying encounter/quest state, **not** merely the request — exactly the property the action-economy audit praised.
- **Respawn farming:** a defeated encounter cannot be re-looted (`lootClaimed`). A *new* `combat_start` wholly replaces `next.combat` (`engine-domain.ts:1118`), so the DM *can* spawn the same creature key again and award XP again via a fresh `loot` — this is **DM-authored and intentional**, not an engine exploit, but it means the engine imposes **no global per-creature-key XP cap**.

### C.3 Bounds and edge cases (inspect, not exhaustive runtime test)

| Case | Behavior | Evidence |
| --- | --- | --- |
| Negative XP | Rejected — `rewardXp: z.number().int().nonnegative()` (`engine-contracts.ts:324,478`) | Safe |
| Fractional XP | Rejected — `.int()` | Safe |
| Very high XP | Capped at `1_000_000` per award (`.max(1_000_000)`) | Bounded, but 1M×N awards unbounded |
| Integer overflow | JS numbers; no explicit guard. Practical risk low (sum of bounded awards) | UNKNOWN |
| XP above level cap | **N/A — no level cap mechanic exists** (no cap to exceed) | — |
| Multi-level jump | N/A — XP never levels | — |
| XP after level 20 | N/A — level never reaches 20 | — |
| XP loss / level drain | Impossible (no subtract path, no drain) | — |
| XP retained after milestone | N/A — no milestone leveling | — |

**Net:** XP is a safe, exactly-once, bounded *accumulator*. It is also, mechanically, a **trophy counter** — it currently changes nothing about the character.

---

## Part D — XP thresholds and eligibility

### D.1 Authoritative threshold source

**There is none.** A focused grep for `XP_TABLE | xpToNext | nextLevelXp | threshold | levelUp | level_up | gainLevel` across all of Lantern `src` returns **no leveling code** (only `effect-compiler.ts:218` "recharge threshold" and unrelated string constraints). There is no XP-by-level table, no max-supported-level constant, no tier-boundary logic, and no level-cap behavior in the runtime.

(Note: the *reference* engine has a hardcoded `XP_TABLE` to 20 — see Part T. **Lantern has none.**)

### D.2 Threshold tests

There are **no** threshold tests. The closest level-sensitive assertions are *eligibility* checks that read `character.level` for **spell access** (cantrip/known-spell limits, slot availability, upcast scaling — `engine-domain.ts:1209-1288,1422,4108-4113`), and those are exercised only at level 1 (and once at a hand-set level 9 in `engine.test.ts:1468-1469`).

### D.3 Boundary table

| Boundary | Result |
| --- | --- |
| 1 XP below threshold | Untestable — no threshold |
| exact threshold | Untestable |
| multi-threshold crossing | Untestable |
| level-cap | No cap logic exists |

---

## Part E — PC level-up lifecycle

The full lifecycle the brief asks for — *earn → eligible → plan → choices → validate → calculate → commit → recalc → event → result* — **does not exist.** Only *earn* and *commit* (for XP) exist.

### E.1 What is present

- **Earn:** XP accrual (Part C).
- **Eligibility:** absent.
- **Level-up plan / preview / legal-choice enumeration:** absent.
- **Player confirmation / cancel / multi-step / pending state:** absent.
- **Atomic final commit:** the *reward* commit is atomic (`commit()` writes state+version+events together — reused from the action-economy kernel), but there is no *level* to commit.
- **Idempotent replay / version conflict rejection:** present and reused (proven by tests).
- **Derived-state recalculation:** `hydrateCharacter` exists but is only triggered by `character_update`, not by any level change.

### E.2 Critical answers

- *Does gaining enough XP immediately mutate level?* **No** — it never mutates level at all.
- *Can choices be silently assigned?* There are no level-up choices to assign.
- *Can the LLM choose subclass/feat/spell/ASI?* It cannot choose subclass/feat/ASI (none exist). It *can* choose which spell to `learn_spell`/`prepare_spell` — but that is the spell-subsystem, decoupled from leveling, and gated by the engine (class list, level limit, capacity — `engine-dm.ts:288`, `engine-tools.ts:648,660`).
- *Can the player preview before confirming?* No level-up to preview.
- *Can a failed selection half-apply advancement?* No advancement to half-apply.
- *Can the same level be applied twice / two concurrent requests level twice?* Moot — no level application exists. Concurrent *reward* requests are serialized by `expectedCampaignVersion` (`store.ts:376-377`) and exactly-once flags.

---

## Part F — PC level-up consequences

Because no level-up exists, **none of the F1–F8 consequences have a runtime trigger.** Each subsystem is characterized at its *level-1 resting state* and by whether its *formula* would handle a higher level if one were ever supplied.

### F1. Level and proficiency
- `level` scalar exists; no writer. `proficiencyBonus(level)` formula is correct (`open5e-rules.ts:338-340`). No tier/feature-prereq/spell-access gating beyond spell-slot availability. **Not exercised past 1.** Status: `LANTERN_PARTIAL`.

### F2. Hit points and Hit Dice
- Level-1 max HP = `classProfile.hitDie + conMod` (`engine-domain.ts:3380`). A *multi-level* HP formula exists **only inside `hydrateCharacter`** (`3774`: `hitDie*level + conMod*level`) — reachable only via `character_update`, which cannot set level. So the per-level HP formula is `LANTERN_PARTIAL` (code present, unreachable by normal play).
- Rolled HP: none. Fixed/average only. No stored roll, no reproducibility concern.
- Hit-die pool: consumed/restored by `rest` (`engine-domain.ts:2864-2879`); bounded by level. At level 1 the pool is 1. **Working subsystem**, but capped at 1 die by the fixed level.
- Leveling while damaged/unconscious/dead, temp HP, max-HP reductions: moot.

### F3. Saving throws, skills, proficiencies
- Built at create from class profile saving throws + chosen skills (`buildSavingThrows`/`buildSkillSheet`, `open5e-rules.ts:374-401`). `expertise: false` is hardcoded (`384`) — **no expertise model**. Weapon/armor/tool/language proficiencies come from class/species/background profiles (`engine-domain.ts:3412-3416`). No proficiency *replacement* or multiclass grants. Status: `LANTERN_PARTIAL` (level-1 correct; no growth path; no expertise).

### F4. Class features
- **Only level-1 features are materialized** — `classProfile.levelOneFeatures` (`open5e-import.ts:3014` filters `feature.gainedAt.level===1`; `engine-domain.ts:3798-3803`). Features are stored as **name strings** in `EngineCharacter.features` (`engine-contracts.ts:775`) and as `featureRefs`. There is **no per-level feature table applied on level-up** (no level-up exists). Feature *prose* for levels >1 is imported but "remains reference-only and cannot mutate character state by implication" (`open5e-import.ts:4626`). 
- Classification: class features are **narration/content-only** mechanically; the only *executable* class-derived capability is spellcasting (Part F7). No Rage resource, no Ki, no Sneak Attack dice, no Action Surge, no Channel Divinity, no Wild Shape, no Superiority dice, no Metamagic, no Invocation, no Fighting-Style effect — none are modeled as executable resources. Status: `CONTENT_ONLY` (text) / `LANTERN_STUB` (mechanics).

### F5. ASI and feats
- ASI: `ABSENT` (no symbol). Ability cap (20) not enforced by any ASI path. Feats: `CONTENT_ONLY` (91 imported, 0 compiled, `featRefs` always `[]`). No half-feats, no feat-granted actions/spells/proficiencies. Status: `ABSENT` (ASI) / `CONTENT_ONLY` (feats).

### F6. Subclasses
- `ABSENT`. No subclass field on the character; no subclass selection level; no subclass feature progression; no patron/oath/domain/etc. The engine cannot block progression on an unresolved mandatory choice because there is no progression and no subclass. No risk of dual-subclass — because there is no subclass at all.

### F7. Spell progression
This is the **most developed** progression-adjacent subsystem (coordinate with the magic audit). Spell *progression data* for levels 1–20 exists as content (`NormalizedSpellProgression`, `schema.ts:538-565`: `slotMode` standard/pact, `selectionMode` known/prepared/spellbook, `knownSpellLimits[20]`, `cantripsKnown[20]`, `preparedFormula`, `spellbook{initialSpellCount,spellsGainedPerLevel}`, `levels[20].slots`). `open5eSpellSlots(className, characterLevel)` (`open5e-rules.ts:839-846`) reads the row for the level and clamps 1–20.

But: **the only level ever passed is 1**, so only the level-1 row, the level-1 cantrip limit, and the base known-spell count are ever used at runtime. The level-9 *test* (`engine.test.ts:1468-1469`) hand-sets level to exercise a 5th-level spell's eligibility — confirming the *formulas* are level-aware but the *runtime* never supplies a higher level. Pact Magic (`slotRecovery:"short-or-long-rest"`) is modeled and restored on short rest (`engine-domain.ts:2858-2875`). Status: `LANTERN_PARTIAL` — correct formulas, level-locked at 1, never advanced.

### F8. Equipment and wealth
- Starting equipment granted at creation from class/background profiles (`createOpen5eStarterInventory`, `engine-domain.ts:3381`). Leveling grants no equipment (no leveling). Multiclass second starting package: N/A (no multiclass). Status: `LANTERN_PARTIAL` (creation only).

---

## Part G — Class-by-class progression

Build output: `classes raw 151 normalized 151 compiled 12` and `spellprogressions raw 12 normalized 8 compiled 0` (the "compiled 0" for spellprogressions means no *tier-2 effect program* is compiled for them; the slot tables themselves are tier-1 typed content). The 12 compiled base classes are the SRD-2014 set. Legacy hardcoded `OPEN5E_CLASS_PRESETS` exist for barbarian/fighter/rogue/wizard (`open5e-rules.ts:70-114+`); the compiled class *profiles* extend this to all 12 via content.

**Uniform status for all 12 classes** — because progression mechanics do not exist, every class is identical at the *advancement* level:

| Concern | Status | Evidence |
| --- | --- | --- |
| Hit Die | `LANTERN_IMPLEMENTED` (level-1 value) | class profile `hitDie` |
| Level progression table (per-level) | `CONTENT_ONLY` | importer parses rows (`open5e-import.ts:2551-2568`); never applied |
| Feature grants (per level) | `CONTENT_ONLY` | only level-1 features materialized (`open5e-import.ts:3014`) |
| Feature upgrades | `ABSENT` | — |
| Resource maximums (Rage/Ki/Sneak/Action Surge/Channel Divinity/Superiority/Lay on Hands/Sorcery Points/Metamagic/Invocations) | `ABSENT` | no resource pool modeling for class features |
| Resource recovery | `ABSENT` (except spell slots + hit dice) | — |
| ASI/feat levels | `ABSENT` | — |
| Subclass selection | `ABSENT` | no subclass field |
| Subclass features | `ABSENT` | — |
| Extra Attack | `ABSENT` (as a class feature) | basic `combat_action` is a single hardcoded attack (`engine-domain.ts:1741-1769`) |
| Spell progression | `LANTERN_PARTIAL` (F7) | `open5eSpellSlots` level-aware, level-locked at 1 |
| Capstone | `ABSENT` | — |
| Executable through active runtime | **No class feature is executable**; only the class's *spellcasting eligibility* and *level-1 statblock* are | — |
| Tests | No class-specific level-up test; one level-9 wizard spell-eligibility test (`engine.test.ts:1458`) | — |

**Per-class note:** the only differentiation at runtime is the level-1 *profile* (hit die, saves, proficiencies, starting equipment, starting features as strings, spellcasting mode/ability). The 8 casters (bard, cleric, druid, sorcerer, warlock[pact], wizard, paladin[half], ranger[half]) additionally carry a spell progression row set; the 4 non-/half-casters' combat identity is **not** mechanically modeled beyond the generic `combat_action` attack. **Do not mark any class "implemented" because `character_create` accepts its name** — creation accepts the name and seeds level-1 stats only.

---

## Part H — Multiclassing

**Out of scope and cleanly absent.** Evidence:

- `EngineCharacter` has one `level` scalar and one `classRef`/`className` (`engine-contracts.ts:764,724-727`). No `classLevels` array.
- No command can add a second class. `character_update` cannot set class or level.
- No multiclass proficiency grants, no slot-combination, no Extra-Attack stacking, no Unarmored-Defense interaction code.

Because there is no path to create multiclass state, the engine cannot *accidentally* create it. Status: `ABSENT` (correctly).

---

## Part I — Derived-state recalculation

### I.1 Canonical recalculation path

The single recompute function is **`hydrateCharacter`** (`engine-domain.ts:3747-3810`): given a stored character it re-derives `abilityModifiers`, `proficiencyBonus`, `savingThrows`, `skills`, `size`, `speed`, `hitDie`, `hitDiceRemaining`, `proficiencies`, `features` (fallback), and `spellcasting` (via `buildSpellcastingState`). It is invoked on `character_update` (`568`) and legacy create (`3603`), **not** on load.

### I.2 What leveling *could* alter (formula presence vs. runtime reachability)

| Stat | Recomputed by `hydrateCharacter`? | Runtime-triggered by level change? |
| --- | --- | --- |
| maxHp | yes (`3774`, multi-level formula) | No (no level change) |
| hitDiceRemaining | yes (`3791`) | No |
| proficiencyBonus | yes (`3785`) | No |
| AC | `deriveArmorClass` (called at create `3432`, and on equip/unequip) | Only via gear, not level |
| abilityModifiers | yes | No |
| savingThrows / skills | yes (`3786-3787`) | No |
| spell slots / known / prepared limits | `buildSpellcastingState` (`3804`) | No (level-locked at 1) |
| Initiative / passive perception / carry capacity | computed in the *view* (`EngineCharacterView.derived`, `engine-contracts.ts:861-869`) | Derived on read |
| Attack bonus (basic attack) | **NOT recomputed** — hardcoded `+2` (`engine-domain.ts:92,1743`) | Never tracks level |
| Spell attack / save DC | computed in spell-cast path from level | Level-locked at 1 |
| Feature DCs / resource maximums | Not modeled | — |

### I.3 Divergence confirmed and localized

The action-economy audit found that "player attacks used a hardcoded Strength/d8 path while armor and enemy attacks had canonical derivation." This audit **confirms** it precisely: `engine-domain.ts:92 const proficiencyBonus = 2;` drives the `combat_action` attack roll and d8 damage (`1741-1756`), while `character.proficiencyBonus` (derived) drives saves/skills and the spell-cast DC. **Progression would compound this:** a future level-up would raise the *sheet* proficiency but leave the basic attack at +2. There is **no single source of truth** for the character's proficiency bonus across all attack/stat paths.

### I.4 Cache invalidation / displayed vs. mechanical state

No caching layer observed (state is recomputed or read from the single persisted record). Displayed state is the committed state (no separate projection that can drift), *except* that persisted derived fields are not re-derived on load (A.4), so a pack repin or manual edit could leave the sheet inconsistent with no recalculating load. Old events record `stateChanges` with before/after paths (`engine-domain.ts:753,2830-2836`) but **do not record which formula/version produced them** — there is no per-stat formula provenance.

---

## Part J — NPC progression taxonomy

### J.0 Models that actually exist

Of the requested taxonomy (`STATIC_STATBLOCK, CLASSED_NPC, TEMPLATE_SCALED, COMPANION, HIRELING, SUMMON, PROCEDURAL_NPC, LEGENDARY_BOSS, FACTION_ACTOR, NARRATIVE_ONLY`), Lantern realizes exactly **two**:

- **STATIC_STATBLOCK** — `LANTERN_IMPLEMENTED` (monsters; thin combatant shell + pinned content).
- **NARRATIVE_ONLY** — `LANTERN_PARTIAL` (social NPCs with `relationshipScore`/`memories`; no mechanics).

Everything else is **ABSENT**.

### J.1 Static stat blocks
- Pinned to content via `contentKey`+`packHash` (`EngineCombatant`, `engine-contracts.ts:873-882`). Combatants store only mutable `hp/alive/distanceFeet/conditions/actionResources`; the full stat block is re-hydrated from content on every view (`materializeCombatant`, `open5e-rules.ts:889-923`). 
- Have CR and XP (display). Fixed proficiency (baked into imported to-hit). Fixed attacks/DCs.
- **Cannot gain XP, cannot level, cannot be permanently altered, cannot be upgraded to a variant.** A Goblin is always the same pinned stat block (monster audit §4–5). Status: `LANTERN_IMPLEMENTED` (as static), correctly **not** progressing.

### J.2 Classed NPCs
- `ABSENT`. `EngineNpc` (`engine-contracts.ts:591-600`) has no HP/AC/abilities/class/level/CR/attacks — it is a social entity (`disposition, goals, socialDc, relationshipScore, memories`). NPCs live in `worldContext.npcs`, never in `combat.enemies`. `social_check` is the only NPC mechanic (`engine-domain.ts:591-618`).

### J.3 Template-scaled creatures
- `ABSENT`. No elite/veteran/minion/champion/boss/legendary template code. `combat_start`/`spawn_creature` create identical copies of the base creature (monster audit §5). Multiattack *is* executable (S7, `resolveCompiledMultiattack`), but that is a compiled creature action, not a template.

### J.4 Companions and hirelings
- `ABSENT`. No companion/hireling concept. The product is single-PC (`GDD.md:134`).

### J.5 Summoned creatures
- `ABSENT` as a mechanic. The token `"summoning"` exists only as an `improvise` effect type (`engine-contracts.ts:953`) that appends a fictional log entry and applies **no** mechanical effect (`engine-domain.ts:763-796`). No combatant is created, no scaling from caster/slot level. Temporary summons trivially cannot accumulate XP (there are none). Status: `REFERENCE_ONLY` (fictional token).

### J.6 Legendary, lair, and mythic creatures
- `CONTENT_ONLY`. Legendary/Lair/Mythic action data is imported (`schema.ts:418,420`; `open5e-import.ts:2347,2349`) but **structurally non-executable**: compilation keeps only plain `ACTION`s (`open5e-import.ts:3815`), and the runtime rejects fragment/deferred/legendary-timing programs with `content_tier_insufficient` (`engine-domain.ts:1897-1931,2107-2113`; DM contract `engine-dm.ts:286`; tool contract `engine-tools.ts:701`). No progression code treats these as playable capabilities. Status: `CONTENT_ONLY`.

---

## Part K — Challenge Rating and monster advancement

### K.1 Distinction audit

| Concept | Representation | Authority | Status |
| --- | --- | --- | --- |
| PC level | `character.level` | stored, fixed at 1 | `LANTERN_PARTIAL` |
| NPC class level | none | — | `ABSENT` |
| Monster Hit Dice | not modeled (monsters use imported fixed HP) | — | `ABSENT` |
| Challenge Rating | `creature.challengeRating` | imported, display | `CONTENT_ONLY` |
| Monster XP value | `creature.experiencePoints` | imported **separately** from CR | `CONTENT_ONLY` |
| Encounter difficulty | none | — | `ABSENT` |

### K.2 Authoritative source for CR/XP and whether they are used

- CR is imported verbatim (`open5e-import.ts:2265`) and **never recalculated**. No CR calculator exists (the product does not claim to scale/generate creatures, so this is honest scope, not a defect).
- CR is **never read** for encounter building, XP budgeting, or reward derivation (monster audit §1).
- Monster XP is **never auto-awarded**; loot XP is DM-authored.
- **CR and XP can become inconsistent** with no check: they are two independently-imported fields with no cross-validation (monster audit §2). In practice they come from the same source row so they agree, but the engine enforces nothing.

### K.3 Progression-sensitive monster values
All are imported, fixed, and read from pinned content on each view (`materializeCombatant`). None change at runtime. Adding HP/attacks/etc. to a creature is impossible through the engine.

### K.4 Answers
- *Does increasing HP alone increase CR?* You cannot increase HP at runtime. N/A.
- *Is CR used to build encounters or only displayed?* **Only displayed** (and only on the combatant view). `combat_start` accepts any creature keys/counts the DM picks, capped at 20 instances (`engine-domain.ts:1108`); no difficulty estimate is computed or returned.
- *Are XP rewards derived from CR or stored separately?* **Neither** — rewards are DM-authored; the creature's stored XP is ignored.

---

## Part L — Encounter and party-level progression

- **Party level / average party level / encounter XP budget / difficulty categories:** `ABSENT`. No such code (monster audit §8).
- **Does the world scale to the player?** **No.** Player level feeds only the player's own derived stats; it is never read when spawning creatures or building encounters.
- **Old areas static?** There are no "areas" as stateful entities; encounters are DM-authored per turn.
- **Revisit scaling?** None.
- **Level-1-appropriate content?** The DM *chooses* content; the engine provides no appropriateness check. A DM could spawn an Ancient Red Dragon against a level-1 PC — the engine would not object (only the 20-instance cap applies).
- **Difficulty computed or DM-discretion?** Entirely DM-discretion. The DM model can request any creature within the campaign's enabled source documents.

---

## Part M — NPC narrative and world progression

- **Mechanical progression:** `ABSENT` for NPCs.
- **Narrative/social progression:** `LANTERN_PARTIAL` — `EngineNpc.relationshipScore` adjusts via `social_check`; `memories[]` accumulate; `disposition`/`goals` are free text. This is **structured but narrative-only state**: it does not alter any legal action or combat capability.
- **Economic/faction progression:** `ABSENT`. No faction, wealth, rank, or office model on NPCs.
- **Event-sourced?** NPC changes ride the same atomic turn/event log as everything else, but NPC capability never changes, so there is no "NPC became more powerful" event to trace.
- **Off-screen simulation:** `ABSENT`. NPCs change only when a `social_check`/DM action touches them.
- A remembered conversation is **not** mechanical progression — confirmed: `memories` are prose.

---

## Part N — Rewards and progression transactionality

### N.1 Traces

**1. Combat XP reward** (`resolveLoot`, `engine-domain.ts:2774-2838`):
```
loot command (rewardXp, rewardCopper, items, questId?)
 → require combat.status === "ended"            (2781)  else encounter_active
 → require !combat.lootClaimed                   (2782)  else loot_claimed
 → resolve quest (if questId)                    (2783-2884)
 → totalXp = rewardXp + questReward.xp           (2788)
 → clone + inventory add + currency += + xp +=   (2789-2793)
 → lootClaimed = true; quest.rewardClaimed=true  (2794,2800)
 → commit(state, version++, events, stateChanges) atomic
```
Atomic, exactly-once, version-bumped. ✓

**2. Quest XP** (`resolveQuestUpdate`, `engine-domain.ts:720-754`): status→completed triggers `rewardClaimed`-gated `xp += reward.xp` (`736-742`). Atomic. ✓

**3. Level eligibility:** **does not exist** — trace stops after XP accrual.

**4. PC level-up:** **trace impossible** — no command, no handler. (This is the central gap.)

**5. NPC advancement:** **trace impossible** — no model.

**6. Monster-template upgrade:** **trace impossible** — no templates.

**7. Duplicate reward attempt:** rejected by `lootClaimed`/`rewardClaimed` (proven: `engine.test.ts:271` replay, `829` loot-authored-once). ✓

**8. Invalid level-up attempt:** there is no level-up action to be invalid. N/A.

### N.2 Atomicity answers
- Reward application atomic? **Yes** (single `commit`).
- Level-up atomic? N/A (none).
- Can XP commit without items/gold? They commit in the *same* `commit`, so no.
- Can level change without derived stats? N/A.
- Can derived values change without a level event? **Yes in principle** — `character_update` runs `hydrateCharacter` without any level event (`engine-domain.ts:568`); gear changes re-derive AC. So derived-state changes are **not** exclusively tied to leveling (good, since there is no leveling).
- Success = already committed? **Yes** (commit-then-narrate; `engine-dm.ts` narrates the committed result).
- Narration before commit? **No** — narration is generated from the committed event.
- Duplicate retry grants twice? **No**.
- Stale command applies a second level? N/A.

---

## Part O — Level-up choices and the AI boundary

### O.1 Server-owned (correct)
Eligibility (for *spells*), thresholds (none), legal class/feature grants (level-1 only), derived values, maximums, prerequisites, resource calculations, ruleset version — all server-owned where they exist.

### O.2 Player choices
At **creation**: species/class/background/alignment/skills/languages (from `character_options`), ability-score assignment (`character_roll_stats`, `engine.test.ts:920`). Post-creation: spell learn/prepare, equipment, rest. **No level-up choices** exist.

### O.3 LLM powers (actual)
- Authors the **XP amount** in `loot`/`quest_create`/`quest_update` (bounded 0..1,000,000; `engine-contracts.ts:324,478`). This is the **one place the LLM sets a progression number**, and it is bounded + exactly-once.
- Authors quest/loot *content* (items, titles, objectives).
- Narrates committed results.

### O.4 LLM prohibitions actually enforced
- Cannot change level/proficiency/HP-max/CR (no such tool).
- Cannot grant features or subclass (none exist).
- Cannot bypass spell prerequisites (`engine-dm.ts:288`; `content_tier_insufficient` rejections).
- DM system prompt explicitly forbids inventing source-backed mechanics and fixed demo loot (`engine-dm.ts:278,289`); "After an encounter, use loot with the items, currency, and XP you are awarding… The engine never supplies fixed demo loot."

### O.5 Residual risk
The LLM-authored XP amount is **not server-derived from CR**. Two DMs (or the same DM twice) can award different XP for identical encounters. There is **no CR→XP table** the server can fall back on. This is the single largest AI-boundary soft spot in progression: the *magnitude* of the reward is uncalibrated by the engine.

---

## Part P — Respec, deleveling, and correction

- **Respec / rebuild / change subclass / replace spells / rollback / XP loss / level drain / curses / restore:** **all ABSENT.** No respec tool; no delevel; no level drain model; curses exist only as applied conditions (no level-affecting curse). 
- **Spell replacement:** `learn_spell` adds; `prepare_spell` toggles; there is no "replace a known spell" path (and known-spell limits are level-locked at 1).
- **Correction path:** only `character_update` (sheet details) and the atomic turn replay/idimpotency. There is **no audited correction event** for "fix an invalid historical level" — partly because there are no historical levels to fix.
- Direct DB editing would be the only recourse today; **not recommended** (no provenance). Honest classification: correction tooling is `ABSENT`.

---

## Part Q — Content-pack and ruleset evolution

### Q.1 What is pinned per-campaign
- `contentPolicy` (`gamesystem, baseDocumentKey, allowedDocumentKeys, allowedLicenseKeys`, `engine-contracts.ts:182-210`) is set at campaign creation and gates all content reads.
- Pack hash pinned; `sourceTableSha256` on spell progression (`schema.ts:558`); repin machinery exists (`src/content/repin.ts`, `legacy-repin.ts`; ADRs H21 "reviewed pack-repin and historical replay").

### Q.2 What is NOT stored per-actor
- The character record stores **content references** (`speciesRef`, `classRef`, `backgroundRef`, `skillRefs`, `languageRefs`, `featureRefs` — `engine-contracts.ts:724-758`) with `packHash`, but **not** a progression-table revision or a formula version.
- **Risk:** if a class progression table changes, a feature key is renamed, or a subclass is removed on a pack upgrade, `hydrateCharacter` re-derives from the *current* pinned profile — there is **no freeze of the actor to its original ruleset revision** beyond the content-reference hash. A repin that changes a class profile could silently change a character's derived stats on the next `character_update`. ADR H21 addresses *historical replay* determinism but **not** per-actor progression-table freezing (because there is no per-actor progression).

### Q.3 Migration
- A repin is deterministic and hash-verified (`repin.ts`, `open5e-pack-verify.ts`); `docs/generated/LANTERN-LEGACY-S8-MIGRATION.md` documents the S7→S8 path. But because no actor stores its own feature/level history, "migrate an existing character to a new progression table" is a question that **cannot yet arise**. When leveling is built, per-actor ruleset/revision pinning becomes a hard requirement (Part 12).

---

## Part R — Exploit and invalid-state audit

| Vector | Protected? | Evidence / note |
| --- | --- | --- |
| Arbitrary XP amount | **Bounded** (≤1,000,000/award), not calibrated to CR | `engine-contracts.ts:324,478` |
| Arbitrary level / CR / proficiency | **Safe** — no input path | A.6 |
| Negative XP | Rejected (`.nonnegative()`) | safe |
| XP integer overflow | No guard; low practical risk | UNKNOWN |
| Repeated quest/monster XP | **Blocked** by `rewardClaimed`/`lootClaimed` | C.2 |
| Duplicate level-up / skip levels / level>cap / class-level>total / mismatched totals / wrong-class features / two subclasses / missing subclass / ability>cap / duplicate feat / unsupported feat / wrong hit die | **Moot** — no level-up, no subclass, no ASI, no feats, no multiclass. These cannot occur because the features that would enable them do not exist. | — |
| maxHp < current HP | Possible only via direct DB edit; engine sets `hp=maxHp` at create and clamps on rest/heal | low risk |
| current HP > max | Clamped on damage/heal (`engine-domain.ts:1754,2867`) | safe |
| Negative hit dice | `hitDiceRemaining` floor 0 (`engine-domain.ts:3791`); short rest rejected at 0 (`2861`) | safe |
| Spell slots inconsistent with level | Cannot occur (level-locked at 1; slots from level-1 row) | safe |
| Pact slots as ordinary slots | Separate `slotRecovery:"short-or-long-rest"` model | safe |
| Extra Attack stacking | N/A | — |
| NPC CR/XP mismatch | Monsters static; no mismatch path | safe |
| Static monster gaining PC levels | Impossible | safe |
| Temporary summon retaining XP | No summons | safe |
| Stale campaign version | **Rejected** (`CampaignVersionConflictError`, `store.ts:376-377`) | safe (confirmed by prior audit) |
| Reused command ID | **Rejected** (`CommandIdReuseError`, `store.ts:101`) | safe |
| Narration failure after commit | Narration is post-commit; failure cannot un-commit | safe |

**Net:** the *exploit surface for leveling is empty because leveling is absent.* The only live progression exploit surface is **uncalibrated, LLM-authored XP magnitude** and the theoretical (un-recomputed-on-load) persisted-derived-field drift.

---

## Part S — Test audit

### S.1 Progression-relevant tests (all 86 pass; none fail/skip)

| Test (`file:line`) | What it actually proves | Classification |
| --- | --- | --- |
| `engine.test.ts:829` "lets the DM author an encounter and its loot without engine-invented rewards" | loot pays DM-authored XP/copper once; `lootClaimed` gates; `character.xp` accrues (asserted `==80` at `:871`) | transaction + persistence proof |
| `engine.test.ts:1518` "gives the DM concrete quest, social, beat, and improv primitives" | quest reward (`xp:100`) accrues exactly-once; `rewardClaimed` set | transaction proof |
| `engine.test.ts:271` "replays a command without rerolling and rejects stale writes" | idempotent replay; version conflict rejection | idempotency proof |
| `engine.test.ts:1458` "rejects prose-only upcasting, then atomically resolves concentration and long-rest recovery" | **hand-mutates `leveled.character.level = 9`** (`:1468-1469`) to test a level-9 wizard's spell eligibility + rest recovery. Proves the *formulas* are level-aware; **does not** prove any level-up occurred (it can't). | resolver proof (not progression) |
| `engine.test.ts:707` condition duration; `:597` save/recharge; `:549` S7 multiattack; `:441` combatants | combat economy (coordinate with action-economy audit) | resolver/transaction proof |
| `engine.test.ts:972` "creates a fully pinned S5 character from validated Open5e choices" | level-1 creation correctness | schema + content proof |
| `engine-dm.test.ts:256-257,314` | DM authors `rewardXp:100` quest reward end-to-end through the LLM loop | end-to-end proof (reward accrual) |

### S.2 What is NOT tested (gaps)
No test asserts: XP threshold crossing, level increment on XP, HP increase on level-up, hit-dice increase on level, proficiency-boundary (levels 5/9/13/17), ASI, feat grant, subclass selection, per-level class-feature grant, resource-maximum increase, spell-slot progression beyond level 1, spells-known progression beyond level 1, prepared-spell progression, multiclassing, derived-stat recalculation *triggered by a level change*, static-monster CR correctness, template scaling, NPC class progression, companion progression, summon non-progression, encounter difficulty, content-pack migration of an *actor*, rejected-level-up immutability, concurrent level-up, or LLM-narration failure after advancement.

### S.3 Misleading-name risk
None of the test names overclaim *progression* — but the **absence** of any leveling test is itself the finding. The `:1458` test name ("…atomically resolves concentration and long-rest recovery") is accurate; it is *not* a level-up test despite mutating level.

---

## Part T — Reference-engine comparison

Reference engine: `F:\Github\mnehmos.rpg.mcp` (`src/`, `reference/`, `data/`, `tests/`). Two parallel, conflicting progression conceptions coexist there: a **live single-level path** (`character_manage` → `add_xp`/`level_up`/`XP_TABLE`) and a **dormant per-class multiclass data layer** (`class-progression.repo.ts` + `character_classes`/`class_definitions`), the latter with **no tool surface, no tests, no runtime consumers**.

| Capability | Reference evidence | Lantern evidence | Status | Safe to port? | Notes |
| --- | --- | --- | --- | --- | --- |
| XP storage | `characters.xp` (`schema/character.ts:48`); migration `migrations.ts:826` | `EngineCharacter.xp` (`engine-contracts.ts:783`); exactly-once accrual | Lantern ahead | n/a | Lantern's accrual is transactional & idempotent; reference's is not |
| XP→level conversion | `XP_TABLE` hardcoded to 20 (`character-manage.ts:35-39`); `add_xp` only sets `canLevelUp` flag, never levels (`:403-407`) | **ABSENT** | REFERENCE_ONLY | **Yes, as pure data** | Port the *table*; do not port the decoupled flag semantics |
| Level thresholds (max 20) | `XP_TABLE` + `.max(20)` caps (`character-manage.ts:145,152`) | ABSENT | REFERENCE_ONLY | Yes (table data) | — |
| Character leveling | `handleLevelUp` (`character-manage.ts:447-491`): caller-supplied `targetLevel`+`hpIncrease`; recomputes spell slots; **no** proficiency/hit-dice/features/ASI; **not transactional** | ABSENT | REFERENCE_ONLY | **No — re-architect** | Caller-supplied level/HP must become server-computed; must be atomic |
| Class progression data (SRD) | `class-starting-data.ts`: hit dice/saves/profs/starting equip + `slotsByLevel` only (no feature table, no ASI) | Lantern has equivalent profiles + level-1 features + spell-progression tables | both `CONTENT_ONLY` for features | Partially | Neither has per-level feature tables |
| Homebrew class features | `class_definitions.features` JSON seeded (`migrate-class-progression.cjs`); **never granted/executed** | ABSENT | REFERENCE_ONLY | No | No feature applier exists; advisory only |
| Subclasses | 5-value enum, display-only, not persisted (`schema/spell.ts:224-230`) | ABSENT | REFERENCE_ONLY | No | Display-only; would need redesign |
| ASI | **ABSENT** in reference | ABSENT | ABSENT | n/a | Build fresh |
| Feats | **ABSENT** in reference | CONTENT_ONLY (91 imported) | Lantern ahead (data) | n/a | — |
| Spell progression / slots | `FULL/HALF_CASTER_SLOTS` + `getSpellSlots` single-class (`class-starting-data.ts:496`); Pact Magic `pactMagicSlots` | `open5eSpellSlots(className,level)` + pact recovery (`open5e-rules.ts:839`; `engine-domain.ts:2858`) | Lantern comparable, level-locked | n/a | Lantern's is content-pinned & hash-verified |
| Multiclassing | dormant `character_classes`/effective-level (`class-progression.repo.ts:97-103`) **unused**; live code uses `character.level` | ABSENT (correctly) | REFERENCE_ONLY | **No** | Two divergent level sources; unsafe |
| Proficiency recalc | inline `Math.floor((level-1)/4)+2` in spell-validator/improvisation | `open5eProficiencyBonus(level)` (`open5e-rules.ts:338`); **+ hardcoded 2 for basic attack** | Lantern partial | n/a | Lantern must unify its own two proficiency paths |
| HP / Hit Dice | `level_up` takes caller `hpIncrease`; no hit-die pool model | Lantern has hit-die rest economy; multi-level HP formula in `hydrateCharacter` | Lantern ahead | n/a | — |
| NPC progression | NPCs share PC schema; no advancement loop; `npc_manage` is memory/relationship only | NPCs are narrative-only social entities | both ABSENT for advancement | n/a | — |
| Monster CR | `creature-presets.ts:50` `cr?`; stored on corpses for loot scaling | CR display-only | both CONTENT_ONLY | n/a | — |
| Monster XP | **not stored**; derived from CR at balance | stored, display-only, ignored | divergent | n/a | — |
| Encounter difficulty | `CombatEngine.encounterBalance` **stub**: CR 0-5 only, party levels 1-5 only, else "Trivial" (`math/combat.ts:115-174`) | ABSENT | REFERENCE_ONLY (stub) | **No** | Incomplete; do not port as-is |
| Encounter scaling | `scaleEncounter(_partyLevel,…)` — `partyLevel` **unused** (`encounter-presets.ts:602-633`) | ABSENT (no scaling) | REFERENCE_ONLY | No | Reserved param, unimplemented |
| Companion progression | role enum only (`schema/party.ts:8`) | ABSENT | both ABSENT | n/a | — |
| Quest rewards | `quest-manage.ts:347-411` **reports XP but never writes it** (defect); not idempotent | Lantern: exactly-once `rewardClaimed` accrual | **Lantern ahead** | n/a | Reference has a silent-XP-loss bug |
| Combat XP on end | none (`combat-handlers.ts:2146+`) | loot-gated accrual | Lantern ahead | n/a | — |
| Level-up events | none event-sourced | events recorded for XP/currency changes | Lantern ahead | n/a | — |
| Persistence | SQLite WAL; global handle; repos per-call; **no transactions** for level/XP | Lantern: atomic `commit()` per turn | **Lantern ahead** | n/a | — |
| Idempotency | `add_xp` not idempotent (no dedup) | Lantern: command-ID + flags | **Lantern ahead** | n/a | — |
| Admin overrides | **raw-SQL scripts** (`scripts/levelup-brawler3.cjs`, `levelup-deepsense2.cjs`) mutate production DB bypassing the gate, no provenance | No admin override surface | Reference **BROKEN** (anti-pattern) | **No** | Critical hazard; do not replicate |

**Reference-engine documented defects relevant here:** summon spell is a no-op returning success (`spell-resolver.ts:281-285`, `PROJECT_KNOWLEDGE.md:464`); scroll proficiency hardcoded 0 (`scroll.ts:98`); quest XP silently dropped (undocumented); `add_xp` non-idempotent (undocumented); no class-progression tests; production mutated by out-of-process SQL.

**Porting verdict:** the reference engine's *XP-threshold table* (pure data) is safe to lift. **Everything else** — `level_up` semantics, multiclass layer, encounter balance, quest-XP path, admin scripts — is unsafe to port (caller-supplied authoritative values, non-transactional, non-idempotent, global-state/SQLite/MCP coupling, missing provenance). Lantern should **build progression fresh** on its existing transactional kernel, reusing only the threshold table as data.

---

# Required final report

## 1. Executive summary

- **Real PC progression kernel?** No. Lantern has a trustworthy *XP-accrual* and *rest/hit-die* kernel, but **no progression lifecycle**. XP is a trophy counter: it accumulates exactly-once and changes nothing.
- **XP or milestones authoritative?** Neither levels. XP is the only accrual signal; milestones do not exist.
- **Level-up atomic and idempotent?** There is no level-up. The *reward* path (the only progression-adjacent mutation) is atomic and idempotent (confirmed; reuses the action-economy kernel).
- **Which classes have real progression?** None — beyond a correct **level-1** profile (hit die, saves, proficiencies, starting gear, level-1 features as strings, spellcasting eligibility). No class has a per-level feature/resource/ASI/subclass path.
- **Do class features become executable?** No. Features are name strings + reference prose. Only spellcasting is executable, and it is level-locked at 1.
- **NPC advancement?** Absent. NPCs are narrative-only social entities.
- **Monsters: level / CR / templates / static?** Static pinned statblocks only. CR and XP are display fields, never auto-awarded, never consistency-checked. No templates, no scaling.
- **Safe to build a campaign around?** For *moment-to-moment* play and reward attribution: **yes** — XP/loot/quest/rest are solid and exploit-resistant. For *long-term character growth*: **no** — there is no growth. A campaign run today will have a hero who never advances past level 1 regardless of XP earned.
- **Five highest-risk defects:**
  1. **No level-up engine at all** — XP accrual is disconnected from any advancement; the central promise of "progression" is unimplemented.
  2. **Two proficiency sources** (`+2` hardcoded for the basic attack vs derived sheet value, `engine-domain.ts:92,1743`) — progression would compound an already-existing divergence.
  3. **Uncalibrated, LLM-authored XP magnitude** with no CR→XP derivation — rewards are inconsistent by construction.
  4. **No load-time derived-state recalculation** (`hydrateCharacter` not called on load) — persisted derived fields can drift from content/pinned rules on repin or manual edit, undetected.
  5. **Monster CR/XP imported independently with no consistency check and never auto-awarded** — the 3541-creature bestiary's XP/CR data contributes nothing to actual rewards or balance, and can silently disagree.

## 2. Progression vocabulary matrix

| Concept | Current representation | Authority | Status | Risk |
| --- | --- | --- | --- | --- |
| Total character level | `EngineCharacter.level` (scalar) | stored, fixed at 1 | `LANTERN_PARTIAL` | no writer; untested past 1 |
| Individual class level | n/a (single class) | — | `ABSENT` | — |
| XP total | `EngineCharacter.xp` | stored accumulator | `LANTERN_IMPLEMENTED` | trophy counter; no consequence |
| XP needed / threshold | none | — | `ABSENT` | core gap |
| Proficiency bonus | derived→persisted; +hardcoded 2 for basic attack | split | `LANTERN_PARTIAL` | divergence |
| Hit Dice (pool) | `hitDiceRemaining` | runtime economy | `LANTERN_IMPLEMENTED` | capped at 1 by fixed level |
| Challenge Rating | `creature.challengeRating` | imported, display | `CONTENT_ONLY` | never used |
| Monster XP value | `creature.experiencePoints` | imported, display, ignored | `CONTENT_ONLY` | never awarded; can disagree w/ CR |
| NPC role/rank | none | — | `ABSENT` | — |
| Faction standing | none | — | `ABSENT` | — |
| Stat-block revision | content-ref `packHash` (not per-actor table rev) | pinned per campaign | `LANTERN_PARTIAL` | no per-actor progression-table freeze |
| Ruleset/content-pack version | `contentPolicy` + pack hash | per-campaign | `LANTERN_IMPLEMENTED` | good |

## 3. PC progression matrix

| Area | Status | Evidence | What works | Missing/broken |
| --- | --- | --- | --- | --- |
| XP accrual | `LANTERN_IMPLEMENTED` | `engine-domain.ts:741,2793` | exactly-once, atomic, bounded | no consequence; LLM-authored magnitude |
| Milestones | `ABSENT` | — | — | entire concept |
| Level-up lifecycle | `ABSENT` | no command | — | eligibility, plan, choices, commit, recalc |
| Thresholds/eligibility | `ABSENT` | no table | — | table, cap, tier boundaries |
| HP/Hit Dice | `LANTERN_PARTIAL` | `3380,3774,2864-2879` | level-1 HP; rest economy | no growth; rolled HP |
| Proficiency/skills/saves | `LANTERN_PARTIAL` | `open5e-rules.ts:338,374-401` | level-1 correct | no expertise; hardcoded +2 attack path |
| Class features | `CONTENT_ONLY`/`STUB` | `open5e-import.ts:3014,4626` | level-1 names | no executable features, resources, upgrades |
| ASI/feats | `ABSENT`/`CONTENT_ONLY` | no ASI symbol; feats 0 compiled | feat data | no execution |
| Subclasses | `ABSENT` | no field | — | entire concept |
| Spell progression | `LANTERN_PARTIAL` | `open5e-rules.ts:839`; `schema.ts:538` | level-aware formulas, pact magic | level-locked at 1 |
| Multiclassing | `ABSENT` (correct) | single `level`/`classRef` | cannot be mis-created | — |
| Derived-state recalc | `LANTERN_PARTIAL` | `hydrateCharacter 3747` | recompute on update | not on load; not level-triggered |
| Respec/correction | `ABSENT` | — | — | no audited correction |

## 4. Class support matrix

| Class | Levels supported | Features | Subclass | ASI/feats | Magic progression | Runtime execution | Overall |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| Barbarian | 1 only | level-1 names | no | no | none | basic attack only | `CONTENT_ONLY` |
| Bard | 1 only | level-1 names | no | no | row exists, level-locked | spellcasting@1 | `LANTERN_PARTIAL` |
| Cleric | 1 only | level-1 names | no | no | row exists, level-locked | spellcasting@1 | `LANTERN_PARTIAL` |
| Druid | 1 only | level-1 names | no | no | row exists, level-locked | spellcasting@1 | `LANTERN_PARTIAL` |
| Fighter | 1 only | level-1 names | no | no | none | basic attack only | `CONTENT_ONLY` |
| Monk | 1 only | level-1 names | no | no | none | basic attack only | `CONTENT_ONLY` |
| Paladin | 1 only | level-1 names | no | no | half-caster row | spellcasting@1 | `LANTERN_PARTIAL` |
| Ranger | 1 only | level-1 names | no | no | half-caster row | spellcasting@1 | `LANTERN_PARTIAL` |
| Rogue | 1 only | level-1 names | no | no | none | basic attack only | `CONTENT_ONLY` |
| Sorcerer | 1 only | level-1 names | no | no | row exists, level-locked | spellcasting@1 | `LANTERN_PARTIAL` |
| Warlock | 1 only | level-1 names | no | no | pact row | spellcasting@1 | `LANTERN_PARTIAL` |
| Wizard | 1 only | level-1 names | no | no | row exists, level-locked | spellcasting@1; tested@9 by hand-mutation | `LANTERN_PARTIAL` |

(All "Levels supported = 1 only" because no level-up exists. Spell-progression *rows* exist to 20 but are unreachable past 1.)

## 5. NPC progression matrix

| NPC model | Exists | Progression method | Persists | Affects mechanics | Overall |
| --- | --- | --- | --- | --- | --- |
| Static statblock (monster) | yes | none | hp/conditions only (thin shell) | combat hp/conditions | `LANTERN_IMPLEMENTED` (static) |
| Narrative/social NPC | yes | `relationshipScore`/`memories` via `social_check` | yes | no capability change | `LANTERN_PARTIAL` (narrative) |
| Classed NPC | no | — | — | — | `ABSENT` |
| Template-scaled | no | — | — | — | `ABSENT` |
| Companion/hireling | no | — | — | — | `ABSENT` |
| Summon | no (fictional token) | — | — | — | `REFERENCE_ONLY` |
| Procedural/legendary/faction | no | — | — | — | `ABSENT` |

## 6. CR and encounter-scaling matrix

| Actor type | CR source | XP source | Used for balance? | Used for reward? | Scaling | Overall |
| --- | --- | --- | --- | --- | --- | --- |
| Static creature | imported, fixed | imported, fixed, separate from CR | no | no (DM-authored) | none | `CONTENT_ONLY` |
| Generated monster | n/a (no generator) | n/a | no | no | none | `ABSENT` |
| Companion | n/a | n/a | no | no | none | `ABSENT` |
| Boss/legendary | imported data, non-executable | imported | no | no | none | `CONTENT_ONLY` |
| Summon | n/a | n/a | no | no | none | `ABSENT` |

No encounter difficulty, party-level, XP-budget, or auto-scaling code exists anywhere.

## 7. Complete runtime traces

See **Part N** for the two that succeed (combat XP; quest XP — both atomic & exactly-once) and the **impossible** traces (PC level-up; NPC advancement; monster-template scaling — they stop at "no such command/handler"). Duplicate-reward rejection trace succeeds (Part N.7). Invalid-level-up rejection is N/A (no action to reject).

## 8. Invariants currently enforced (proven by code + tests)

1. XP/currency accrual is **atomic** with the turn (single `commit`; `engine-domain.ts:2811,2888`).
2. Rewards are **exactly-once** (`lootClaimed`, `rewardClaimed`; tests `:829,:1518`).
3. Command replay is **idempotent** and stale versions are **rejected** (`store.ts:101,376-377`; test `:271`).
4. Level-1 character creation is **content-pinned & hash-verified** (test `:972`).
5. Monsters are **immutable** pinned statblocks; combatants cannot gain XP/level.
6. Spell eligibility is **server-gated** by class list, level, and capacity (`engine-dm.ts:288`).
7. Narration is **post-commit** (cannot claim an uncommitted result).

## 9. Invariants NOT enforced (gaps / exploits)

1. **No XP→level invariant.** XP has no mechanical consequence; a character with 100,000 XP is identical to one with 0.
2. **No threshold / cap / tier boundaries.**
3. **No single proficiency source** (basic attack ignores derived proficiency).
4. **No load-time recalculation** — persisted derived fields can drift silently.
5. **No CR↔XP consistency** for monsters; creature XP never auto-awarded.
6. **No encounter-balance invariant** — any creature can face any PC.
7. **No per-actor progression-table/ruleset freeze** (relevant once leveling exists).
8. **No ASI/feat/subclass/multiclass/expertise invariants** (features absent).
9. **Reward magnitude uncalibrated** (LLM-authored, no CR derivation).

## 10. Test evidence

- **Commands run:** `git status/log` (both repos); `npm run build` (PASS, exit 0); `npm test` (PASS, 86/86, 14 files, 0 fail/0 skip); focused greps.
- **Passing tests relevant to progression:** loot XP accrual+once (`:829`); quest XP accrual+once (`:1518`); replay/idempotency (`:271`); level-9 spell eligibility via hand-mutation (`:1458`); DM reward end-to-end (`engine-dm.test.ts:256-314`).
- **Failing/skipped:** none.
- **Misleading names:** none overclaim; the gap is the *absence* of leveling tests.
- **Unverified claims:** any implication that characters can advance, gain features, or that monster CR/XP influence rewards — none are verified (because none are true at runtime).

## 11. Recommended next milestone

**Name:** *"One exactly-once PC level-up, fully derived, with one explicit NPC advancement template."*

**Acceptance criteria (smallest trustworthy slice):**

PC:
1. Award one quest **milestone** (exactly-once) that creates a **pending level-up** (new `pendingAdvancement` on the character, version-bumped, event-recorded).
2. A **level-up command** consumes the pending state, validates the single legal class advancement (no subclass/ASI/feat yet), and **computes** (never accepts from caller): new HP (average die + con), +1 hit die, proficiency bonus via `open5eProficiencyBonus`, level-1→2 features (initially: none beyond what the table says), and re-derived saves/skills/spell-slots — all in **one atomic `commit`**.
3. **Unify proficiency**: remove `const proficiencyBonus = 2` (`engine-domain.ts:92`); the basic attack must read `character.proficiencyBonus`.
4. Run `hydrateCharacter` (or a new `recalcCharacter`) **on load** so persisted state can never drift from pinned content.
5. Reject: level above cap (start cap configurable, default 20), XP below threshold, duplicate level-up, stale version, reused command ID.
6. **Refresh and resume identically** after the level-up.
7. Tests: threshold-exact, 1-below, 1-above, cap, duplicate rejection, HP/proficiency/hit-dice deltas, derived-stat recalc, restart persistence.

NPC (parallel, decoupled from PC leveling):
8. One **explicit, versioned advancement template** (e.g. "veteran") that, when applied to a static creature *instance*, recomputes HP/attack/DC **and** records a revised CR/XP (no silent number change without CR/XP update), persists provenance (template id + version), and **rejects duplicate application**.

Do not broaden scope (no multiclass, no ASI, no feats, no subclasses, no encounter balancer) until this slice is green.

## 12. Product-owner decisions required

1. **XP vs milestones** as the authoritative PC model (or both, switchable per campaign).
2. **Level cap** (20? lower for first slice?).
3. Whether **one XP award can cross multiple levels** and whether excess XP is retained.
4. Whether advancement is **immediate or pending** (recommend pending, to preserve the player-choice boundary).
5. **Initial supported classes** for real per-level features (recommend starting with the 4 legacy presets: barbarian/fighter/rogue/wizard).
6. **Subclass policy** and selection level (defer for first slice).
7. **ASI vs feats** (defer; decide data model early).
8. **Multiclassing** (out of scope for first slice; keep the clean rejection).
9. **Fixed vs rolled HP** on level-up (recommend fixed/average for determinism).
10. **NPC progression models** to support (recommend: static + one template only).
11. **Dynamic monster scaling** (out of scope; confirm world stays DM-authored).
12. **Companion progression** (out of scope; single-PC product).
13. **Encounter scaling / difficulty** (decide whether to build a CR→XP→budget calculator at all).
14. **Respec policy** (defer; decide whether correction is an audited event).
15. **Ruleset/content migration policy** for actors (require per-actor progression-table + formula-version pinning before leveling ships).

## 13. Machine-readable appendix

```json
{
  "progressionKernel": {
    "overallStatus": "LANTERN_PARTIAL — transactional XP accrual + rest/hit-die economy exist; no level-up lifecycle, thresholds, choices, or NPC/monster progression",
    "implemented": [
      "exactly-once XP accrual (loot + quest)",
      "atomic, versioned, idempotent reward commit",
      "rest / hit-die recovery economy",
      "level-1 character creation (content-pinned, hash-verified)",
      "static monster statblocks (immutable, thin combatant shell)",
      "per-campaign content-policy + pack-hash pinning"
    ],
    "partial": [
      "proficiency bonus (derived+persisted; +hardcoded 2 for basic attack)",
      "hit dice pool (capped at 1 by fixed level)",
      "spell progression (level-aware formulas, level-locked at 1)",
      "multi-level HP formula (in hydrateCharacter, unreachable)",
      "derived-state recalculation (on update only, not on load)"
    ],
    "contentOnly": [
      "monster challengeRating (display)",
      "monster experiencePoints (display, never awarded, can disagree with CR)",
      "monster proficiencyBonus (baked into source numbers)",
      "class per-level feature tables (imported, level-1 only materialized)",
      "feats (91 imported, 0 compiled, reference-only)",
      "legendary / lair / mythic actions (non-executable)"
    ],
    "referenceOnly": ["reference-engine XP_TABLE (hardcoded to 20)"],
    "absent": [
      "XP threshold table / level cap / tier boundaries",
      "level-up command, lifecycle, pending advancement, choices",
      "ASI, ability-score increase",
      "subclass selection and progression",
      "multiclassing (correctly)",
      "expertise",
      "executable class features and resources (Rage/Ki/Sneak/Action Surge/Channel Divinity/Superiority/Lay on Hands/Sorcery Points/Metamagic/Invocations/Extra Attack)",
      "milestone advancement",
      "classed NPCs, companion/hireling progression, summons",
      "template scaling (elite/veteran/minion/boss)",
      "encounter difficulty / party level / XP budget / world scaling",
      "CR->XP derivation; auto-award of creature XP",
      "respec / delevel / level drain / correction tooling",
      "per-actor progression-table/ruleset-revision freeze"
    ],
    "broken": [],
    "highestRiskGaps": [
      "no level-up engine: XP is a trophy counter with no consequence",
      "two proficiency sources (hardcoded +2 basic attack vs derived sheet value)",
      "uncalibrated LLM-authored XP magnitude (no CR->XP)",
      "no load-time derived-state recalculation (drift risk on repin/edit)",
      "monster CR/XP imported independently, never consistency-checked, never auto-awarded"
    ]
  },
  "pcProgression": {
    "xp": {
      "status": "LANTERN_IMPLEMENTED (accrual only; no consequence)",
      "implemented": ["bounded 0..1,000,000", "exactly-once (lootClaimed/rewardClaimed)", "atomic commit"],
      "missing": ["threshold crossing", "level increment", "multi-level handling", "cap behavior"],
      "broken": []
    },
    "milestones": {
      "status": "ABSENT",
      "implemented": [],
      "missing": ["entire concept"],
      "broken": []
    },
    "levelUp": {
      "status": "ABSENT",
      "implemented": [],
      "missing": ["command", "eligibility", "pending state", "choices", "validation", "atomic commit", "derived recalc", "event"],
      "broken": []
    },
    "derivedState": {
      "status": "LANTERN_PARTIAL",
      "implemented": ["hydrateCharacter recompute on update", "level-1 correct stats", "view-level derived (initiative/passive/carry)"],
      "missing": ["load-time recalc", "level-triggered recalc", "unified proficiency source"],
      "broken": ["basic attack uses hardcoded +2, not character.proficiencyBonus"]
    },
    "multiclassing": {
      "status": "ABSENT (correctly)",
      "implemented": [],
      "missing": ["entire concept"],
      "broken": []
    }
  },
  "classes": {
    "barbarian": { "status": "CONTENT_ONLY", "missing": ["per-level features", "Rage resource", "subclass", "ASI"], "broken": [] },
    "bard": { "status": "LANTERN_PARTIAL", "missing": ["per-level features", "subclass", "ASI", "slot progression past 1"], "broken": [] },
    "cleric": { "status": "LANTERN_PARTIAL", "missing": ["per-level features", "Channel Divinity", "domain subclass", "ASI"], "broken": [] },
    "druid": { "status": "LANTERN_PARTIAL", "missing": ["per-level features", "Wild Shape", "circle subclass", "ASI"], "broken": [] },
    "fighter": { "status": "CONTENT_ONLY", "missing": ["per-level features", "Action Surge", "Second Wind resource", "subclass", "ASI"], "broken": [] },
    "monk": { "status": "CONTENT_ONLY", "missing": ["per-level features", "Ki", "subclass", "ASI"], "broken": [] },
    "paladin": { "status": "LANTERN_PARTIAL", "missing": ["per-level features", "Channel Divinity", "oath subclass", "ASI"], "broken": [] },
    "ranger": { "status": "LANTERN_PARTIAL", "missing": ["per-level features", "subclass", "ASI"], "broken": [] },
    "rogue": { "status": "CONTENT_ONLY", "missing": ["per-level features", "Sneak Attack scaling", "subclass", "ASI"], "broken": [] },
    "sorcerer": { "status": "LANTERN_PARTIAL", "missing": ["per-level features", "Sorcery Points/Metamagic", "origin subclass", "ASI"], "broken": [] },
    "warlock": { "status": "LANTERN_PARTIAL", "missing": ["per-level features", "Invocations", "Mystic Arcanum", "patron subclass", "ASI"], "broken": [] },
    "wizard": { "status": "LANTERN_PARTIAL", "missing": ["per-level features", "school subclass", "ASI", "slot progression past 1"], "broken": [] }
  },
  "npcProgression": {
    "staticStatblocks": {
      "status": "LANTERN_IMPLEMENTED (immutable; no progression by design)",
      "implemented": ["pinned statblock reference", "mutable hp/conditions/actionResources"],
      "missing": ["cannot gain XP/level/variant (intentional)"],
      "broken": []
    },
    "classedNpcs": {
      "status": "ABSENT",
      "implemented": [],
      "missing": ["NPC class-level model", "NPC combat stats"],
      "broken": []
    },
    "templates": {
      "status": "ABSENT",
      "implemented": [],
      "missing": ["elite/veteran/minion/boss templates", "CR/XP recalc on change"],
      "broken": []
    },
    "companions": {
      "status": "ABSENT",
      "implemented": [],
      "missing": ["companion/hireling model"],
      "broken": []
    },
    "summons": {
      "status": "REFERENCE_ONLY (fictional improvise token only)",
      "implemented": [],
      "missing": ["summon combatant", "caster/slot scaling", "persistence rules"],
      "broken": []
    },
    "legendaryBosses": {
      "status": "CONTENT_ONLY (data imported, structurally non-executable)",
      "implemented": [],
      "missing": ["legendary/lair/mythic execution", "phase transitions"],
      "broken": []
    }
  },
  "verification": {
    "commandsRun": [
      "git status --short (Lantern: all untracked; no commits)",
      "git log -1 (reference: 2a34f7f0 2026-07-25)",
      "npm run build -> exit 0 (pack hash 56bdfbda...b07f)",
      "npm test -> 86 passed / 14 files / 0 fail / 0 skip",
      "grep progression vocabulary across src (level/xp/threshold/proficiency/hitDice/subclass/feat/advancement/milestone/cr)"
    ],
    "passingTests": [
      "engine.test.ts:829 loot XP accrual + lootClaimed once",
      "engine.test.ts:1518 quest XP accrual + rewardClaimed once",
      "engine.test.ts:271 idempotent replay + version conflict rejection",
      "engine.test.ts:972 pinned level-1 creation",
      "engine.test.ts:1458 level-9 (hand-mutated) spell eligibility + rest recovery",
      "engine-dm.test.ts:31/146/220 DM reward end-to-end + idempotent version"
    ],
    "failingTests": [],
    "unverifiedClaims": [
      "characters can advance past level 1 (false at runtime)",
      "monster CR/XP influence rewards or balance (false)",
      "class features are executable (false; only spellcasting)"
    ]
  },
  "recommendedNextMilestone": {
    "name": "One exactly-once PC level-up (fully derived) + one explicit versioned NPC advancement template",
    "acceptanceCriteria": [
      "quest milestone -> pending level-up (atomic, versioned, event-recorded)",
      "level-up command computes (never accepts) HP/hit-die/proficiency/features/spell-slots in one atomic commit",
      "unify proficiency: remove hardcoded +2 in basic attack path",
      "run derived-state recalc on campaign load",
      "reject: above-cap, below-threshold, duplicate level-up, stale version, reused command id",
      "refresh/resume identical after level-up",
      "tests: threshold-exact/1-below/1-above/cap/duplicate/deltas/recalc/restart",
      "NPC: one versioned advancement template recomputes stats + CR/XP metadata, persists provenance, rejects duplicate application"
    ]
  }
}
```

---

## Appendix: relationship to prior audits

- **Confirms (action-economy-and-spatial-audit):** the authoritative transactional kernel, version checks, idempotent replay, atomic state/event persistence, and commit-then-narrate ordering — all reused unchanged by the XP/reward path. Also **confirms and precisely localizes** the derived-state divergence: player basic attack uses hardcoded `proficiencyBonus = 2` (`engine-domain.ts:92`) at the attack roll (`:1743`), while armor/enemy/spell paths use canonical derivation.
- **Confirms (magic-and-caster-classes-audit):** spell progression is the most-developed progression-adjacent subsystem; class-list eligibility, level limits, slots, concentration, and tier rejections are server-owned. Adds: all of it is **level-locked at 1** because the level never advances; the only >1 evidence is a hand-mutated test.
- **Revises/adds:** the prior audits did not state that **XP accrues but never levels** — i.e., there is no progression lifecycle at all. They also did not characterize that **monster CR/XP are display-only, independently imported, never auto-awarded, and never consistency-checked**, and that **reward magnitude is LLM-authored with no CR derivation.** These are the core new findings of this audit.
