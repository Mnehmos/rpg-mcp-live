# Coverage Plan — Scoping and Current-Status Report

Scope: **read-only documentation.** No code, schema, migration, or test was modified. No issue was implemented.
Audited runtime: **Lantern** (`F:\Github\rpg mcp live`), branch `main` (working tree, untracked; no committed history).
Source issues: GitHub `Mnehmos/rpg-mcp-live` #1–#17 (EPIC #1 + 16 children, all `OPEN`).
Date: 2026-08-07.

This document is the **master scope/status index for EPIC #1** (`[EPIC] Lantern emergent tabletop engine coverage plan`). It independently verifies each child issue's "Verified starting point" against live runtime code, states the delta each issue's first slice must close, surfaces cross-cutting contract conflicts and sequencing risks, and consolidates the open product decisions. It is **not** a substitute for the per-issue audits each issue prescribes (`docs/hosted-handoff/<name>-audit.md`); it is the map that orders and de-conflicts them.

> **Verification basis.** Build PASS (exit 0), tests PASS 86/86. Findings below are grounded in cited `file:line` evidence from this session's reads of `engine-domain.ts`, `engine-contracts.ts`, `open5e-rules.ts`, the `content/` subsystem, and the test suite — not inferred from issue text, schemas, or imported prose. Status vocabulary matches the EPIC: `LANTERN_IMPLEMENTED` · `LANTERN_PARTIAL` · `LANTERN_STUB` · `CONTENT_ONLY` · `REFERENCE_ONLY` · `ABSENT` · `BROKEN` · `UNKNOWN`.

---

## 0. Headline findings (read first)

1. **The runtime is a sound transactional kernel with a thin mechanical vocabulary.** Authority, versioning, idempotency, atomic commit, exactly-once rewards, content pinning, and honest tier-rejection are all real and reused by every issue. The work ahead is **vocabulary and derivation**, not infrastructure.
2. **#2 (canonical effects) is the keystone.** Today conditions are **string markers consumed by bespoke branches** (`dodging` `engine-domain.ts:1963`; `unconscious/dead/stable` `:2727-2750`), concentration is a **separate single-slot field** (`engine-contracts.ts:710-712`), and **AC reads equipment only** (`deriveArmorClass` `engine-domain.ts:3894-3914`). There is **no generic modifier, advantage/disadvantage-as-effect, or stacking system.** At least seven issues (#4, #6, #7, #9, #11, #16, and Dodge migration in #3) block on it.
3. **Three confirmed BROKEN spots** that the issues should fix, not paper over:
   - Player basic attack: hardcoded `proficiencyBonus = 2` (`engine-domain.ts:92`) and `1d8 + Str` (`:1753-1755`), ignoring equipped weapon, finesse/ranged, and the character's own proficiency — `BROKEN` (#3).
   - Healing-from-0: a potion raises HP but **does not clear `unconscious`** (`resolveUseItem` `engine-domain.ts:2911-2929` is not gated on the condition) — `BROKEN` (#9; refines #4).
   - Improvise: **5 of 8 declared effect types report "applied" with zero state mutation** (`advantage/disadvantage/movement/summoning/fictional`, plus all creature-targeted damage/healing/condition) (`engine-domain.ts:762-799`) — `REFERENCE_ONLY` masquerading as success (#6; confirms #2's stated defect).
4. **Several issues under-state the current gap.** Independent verification found: ability-check DC is **hardcoded** (`combat ? 14 : 12`, `engine-domain.ts:1068`) — the DM cannot set it; tool proficiency is stored but **never consulted** by any check; there is **no state-aware legal-action oracle** (`availableActions` is phase-only, `:272-277`); death-save **natural 1 / natural 20 are absent** (`:2730-2731`); and **Magic Missile is confirmed non-executable** (`pack.test.ts:58-63`, `engine.test.ts:1364-1400`) — closing #4's "disagreement."
5. **Large `CONTENT_ONLY` buckets** that must not be mistaken for capability: magic items (2,319 imported, tier-1 prose, **blocked from equip/use** `engine-domain.ts:932,2921`), legendary/lair/mythic actions (structurally non-executable), feats (0 compiled), monster CR/XP (display-only, never awarded), and spell healing/buff/summon (no compiled effect kind).
6. **One architectural hazard spans the plan:** persisted derived fields are **not recalculated on load** (`hydrateCharacter` runs only on `character_update`/create, `engine-domain.ts:568,3603`; `engine-store.ts:7`). Issues that add new derived dimensions (#5 progression, #2 effects-on-stats, #8 encumbrance) must each decide a load-time consistency policy, or drift will recur.

---

## 1. The dependency graph and recommended sequencing

The EPIC's own guides are correct and should be honored. This report **confirms** them against code and adds the *why*:

```
PHASE 0 (dependency spine — do not parallelize implementation across later phases)
  #2 effects ──► #3 action economy + weapon attacks ──► #4 magic (heal + Shield reaction)
                       │
                       └─► #5 progression (after canonical proficiency/recalc stable)

PHASE 1 (moment-to-moment play)
  #2 ──► #6 resolution ──► #7 perception
  #2/#3/#4 ──► #8 inventory ─► #9 life cycle
  #3 ──► #10 spatial ──► #11 encounter
  #7/#9/#10 ──► #11

PHASE 2 (living campaign world)
  #6/#7/#8/#12 ──► #13 social
  #7/#8/#9/#12/#13 ──► #14 npc agency
  #5/#7/#8/#11/#12/#13/#14 ──► #15 quests
  #2/#3/#7/#8/#9/#10/#11/#12 ──► #16 controlled actors
  #6/#7/#8/#10/#11/#15/#16 ──► #17 party
```

**Why #2 must land first (it is not optional ordering):** the compiled effect-operation union today contains only `usage-limit, saving-throw, damage, apply-condition, area, attack-sequence` (`schema.ts:865-919`). There is **no `heal`, `modifier`, `temp-hp`, `advantage/disadvantage`, or `summon` operation**. Therefore #4 (heal/Shield), #6 (advantage), and #9 (poison/exhaustion/max-HP) **literally cannot be expressed** until #2 adds operation kinds. Starting #4 before #2 forces another bespoke spell-name branch — exactly the failure mode #2 exists to prevent.

**Why #3 before #4/#5:** #4's Shield reaction needs the pending-reaction protocol #3 must create (there is currently **no seam between "hit confirmed" and "damage applied"** — `engine-domain.ts:1960-2019`). #5's canonical proficiency must remove the hardcoded `+2` that #3 owns (`engine-domain.ts:92`).

**Recommended critical path:** `#2 → #3 → (#4 ∥ #5) → (#6 → #7) ∥ (#8 → #9) ∥ #10 → #11`. Phase 2 issues may run **read-only audits** in parallel with Phase 0 implementation (the EPIC explicitly permits this), but must not invent contracts that conflict with #2/#3.

---

## 2. Per-issue scope and verified status

Each entry: **Verified state** (this session's code evidence) · **First-slice delta** · **Scope risks/decisions** · **Deps**.

---

### #2 — [P0][Foundation] Canonical effects, modifiers, durations, triggers, stacking  *(keystone)*

**Verified state.**
- Compiled effect ops: `usage-limit, saving-throw, damage, apply-condition, area, attack-sequence` only (`schema.ts:865-919`; emitted by `effect-compiler.ts:114-120,234-308`). **No heal/buff/modifier/temp-hp/summon/advantage op.**
- Conditions: dual store — `conditions: string[]` markers (`engine-contracts.ts:784`) + typed `conditionEffects: EngineAppliedCondition[]` (`:785`, fields incl. `duration`, `repeatSave`). Duration model **is** rich: `persistent / fixed(round·min·hr·day) / turn-boundary(start·end, source·target, offsetTurns) / source-lifetime` (`schema.ts:847-863`); expiry evaluated at turn boundaries (`engine-domain.ts:2619-2694`). Condition-duration is **tested** (`engine.test.ts:707-787`).
- **Dodge is bespoke**: adds string `"dodging"` (`:1786`), enforced by an inline second-d20-lower branch (`:1963-1965,2504-2506`), cleared on round rollover. **Not** a queryable effect.
- **Concentration is separate**: single-slot `EngineSpellcasting.concentration` (`engine-contracts.ts:710-712`), not in the effect list; no concentration-on-condition interaction.
- **AC reads equipment only** (`deriveArmorClass` `:3894-3914`) — never `conditions`/`conditionEffects`.
- **No generic modifier / advantage-as-effect / stacking-key system.** Improvise `advantage/disadvantage` are recorded (`engine-contracts.ts:953`) but **never consulted** by any resolver.

**First-slice delta.** Introduce one `EffectInstance` model; add the `advantage/disadvantage` roll-category op, additive-stat-mod op, and `apply/remove-condition` op; add source-linked cleanup and a stacking key/rule; make derived rolls/stats **query** active effects; migrate Dodge onto the substrate.

**Scope risks/decisions.**
- **Stacking policy must be decided before any consumer lands** (#4 Shield, #8 magic item, #6 advantage). Recommend: one stacking key per effect family; highest-wins for typed bonuses; non-stacking for same-source.
- **Concentration unification**: today concentration is outside the effect list; #2 must decide whether concentration becomes a source-dependency on the effect (issue's model suggests yes). This is the single most consequential design choice in the plan.
- Keep it a **small typed interpreter** (issue's design constraint) — resist a scripting VM.

**Deps.** None (it is the spine). Consumers: #3 (Dodge), #4 (Shield/heal-on-effect), #6 (advantage), #7 (invisible/unseen), #9 (poison/exhaustion/max-HP), #16 (source-linked cleanup).

---

### #3 — [P0][Combat] Typed action economy + equipped-weapon attacks

**Verified state.**
- Action/Bonus/Reaction are **independent booleans** (`engine-contracts.ts:925-927`), but **only spellcasting sets Bonus/Reaction** (`engine-domain.ts:1460-1461`); the typed `combat_action` never touches them → `LANTERN_PARTIAL`.
- **No explicit `end_turn`**: after any action the turn **auto-advances** to the first live combatant (`:1777,1781,1797`); `advance_turn` is the enemy-turn resolver and rejects on the player's own turn (`:1838`). `LANTERN_PARTIAL`.
- **Player attack is BROKEN**: `proficiencyBonus = 2` hardcoded (`:92`) drives `attackModifier` (`:1746`); damage is `randomInt(1,9) + str` (`:1753-1755`); **no weapon lookup at all**.
- Dodge **works** (`:1787,1963`); Dash/Disengage/Help are **narration-only** (`:1790-1795`); **no Ready**.
- **No state-aware legal-action oracle** (`availableActions` is phase-only, `:272-277`).

**First-slice delta.** Canonical weapon-attack derivation (selected weapon, str-vs-dex/finesse/ranged, proficiency from character value, damage dice/type, crit doubles dice not flat mods, reach/range); independent Action/Bonus/Reaction/movement resources; explicit `end_turn`; one real Bonus-Action consumer (Second Wind); pending-reaction protocol; honest rejection of Dash/Disengage/Help/Ready.

**Scope risks/decisions.**
- **Remove the hardcoded `+2`** (`:92`) — this is also #5's prerequisite (one canonical proficiency source). Coordinate ownership explicitly: #3 removes it, #5 guarantees recalc feeds it.
- Movement resource: defer the *allowance* to #10 but reserve the resource slot now (issue allows a deferred placeholder).
- The pending-reaction protocol is **shared infrastructure** — #4 (Shield) and #11 (opportunity attacks) both depend on its exact shape. Define it once in #3.

**Deps.** #2 (effect/duration for Dodge migration). Feeds: #4, #5, #10, #11, #16.

---

### #4 — [P0][Magic] Generalize spell effects + real reaction casting

**Verified state.**
- Compiled spell effect is **damage-only** (`compiledSpellEffectSchema` `schema.ts:831-845`: `baseDamage`, `saveOnSuccess`, upcast/cantrip scaling). Execution is solid: spell-attack/save/automatic, range, area targeting, affinity (`engine-domain.ts:1345-1585`). `LANTERN_IMPLEMENTED` for damage.
- **Spell healing: ABSENT** (no op kind; `resolveCastSpell` only subtracts HP). **Shield spell: ABSENT** (only the +2 AC *item* exists, `schema.ts:774-786`). **Reaction is a timing flag only** (`reactionUsed`, `:1461`) — **no trigger protocol, no pre-damage hook** (`engine-domain.ts:1960-2019` has no seam).
- **Magic Missile: confirmed non-executable** — tier-1, casting rejected `content_tier_insufficient`, state byte-identical before/after (`pack.test.ts:58-63`, `engine.test.ts:1364-1400`). The "disagreement" is resolved: it does not run.

**First-slice delta.** Add `heal` and `timed-stat-modifier` (AC) effect ops via #2; one `applyHealing` shared by spell/potion/rest/class-feature; Shield as an effect op fired by a persisted incoming-hit trigger from #3's reaction protocol; re-derive AC from equipment **plus active effects**; Magic Missile direct test (implement-or-honestly-unsupported).

**Scope risks/decisions.**
- **`applyHealing` must clear downed state** — this fixes the #9 BROKEN potion path (`resolveUseItem` leaves `unconscious`). #4 should own the canonical recovery function and #8/#9 adopt it. Make this an explicit cross-issue contract.
- **Reaction resumption across refresh**: the persisted pending-reaction must survive restart and resolve exactly once (issue AC). This is the hardest single requirement in #4.
- AC-from-effects depends on `deriveArmorClass` being extended to query #2 — coordinate the read surface with #2.

**Deps.** #2 (heal/modifier ops), #3 (reaction protocol + canonical proficiency).

---

### #5 — [P0][Progression] Exactly-once PC advancement + one NPC model

**Verified state (from the dedicated progression audit).**
- XP/loot/quest/rest/hit-die are atomic & exactly-once (`engine-domain.ts:741,2793,2864-2879`). But **`character.level` is fixed at 1**; no threshold table, no `level_up` command, no eligibility, no ASI/feat/subclass/multiclass. Spell progression rows exist to level 20 but are **unreachable past 1** (`open5e-rules.ts:839-846`). Monsters are correctly static. Reward XP is **LLM-authored, uncalibrated to CR**.
- `hydrateCharacter` (the recalc) runs **only on update/create, not on load** (`engine-domain.ts:568,3603`; `engine-store.ts:7`).

**First-slice delta.** Pending-advancement lifecycle (1→2); server-derived HP/hit-die/proficiency/slots/features in one atomic commit; **load-time recalc/validation under pinned formula revision**; advancement-policy field; one versioned NPC instance template (`veteran`/`elite`) with reviewed CR/XP metadata + provenance + duplicate rejection.

**Scope risks/decisions.**
- **Per-actor formula/ruleset revision must be persisted** before leveling ships — a pack repin that changes a class profile must not silently change a character on next update (Part Q of the progression audit). This is a hard prerequisite the issue lists as "load-time consistency."
- Coordinate with #3: who deletes the hardcoded `+2`? (#3 should; #5 must not re-introduce a second proficiency source.)
- NPC template: if it changes combat power, **revised CR/XP must be explicit and reviewed** (issue AC) — no silent inferred CR.

**Deps.** #3 (canonical proficiency). Coordinate with #2 once level-granted features produce active effects.

---

### #6 — [P1][Resolution] Skills, contests, retry, information, bounded improvisation

**Verified state.**
- `resolveCheck` (`engine-domain.ts:1054-1100`): d20 + skill/ability bonus; **DC hardcoded `combat ? 14 : 12`** (`:1068`) — DM cannot set it. `resolveSocialCheck` uses NPC `socialDc` (`:601`). Proficiency modeled; **`expertise: false` hardcoded** (`open5e-rules.ts:384`); tool proficiency stored but **never consulted**; passive scores = perception only (`:4354`).
- **Advantage/disadvantage, secret rolls, Help, opposed checks, retry policy: all ABSENT** on checks (the only live adv/disadv is enemy-attack-vs-`dodging`).
- `interact` is pure declaration (`:816-836`). **Improvise: 5/8 effect types are narration-only success**; damage/healing/condition mutate **only the player** (`:762-799`).

**First-slice delta.** Challenge/check definition with server-owned DC; expertise + tool proficiency + passives; adv/disadv cancellation; Help; opposed checks; retry policy (allowed/new-approach/state-change/once-per-scene); bounded improvisation selecting only reviewed effect classes, honest rejection otherwise.

**Scope risks/decisions.**
- **Retry policy is an anti-farming concern** with no existing infrastructure — needs an attempt-history store (scene-scoped). Decide scope: per-check, per-scene, or per-objective.
- Improvise must stop reporting success without mutation — this is both a #6 and a #2/#3 honesty fix.
- Secret-roll policy must preserve full event evidence for audit while hiding detail from the player-facing context (couples to #7's knowledge filtering).

**Deps.** #2 (effect-based adv/disadv + temporary mods), #3 (Action/turn cost when checking in combat).

---

### #7 — [P1][Perception] Stealth, senses, hidden state, knowledge, discovery, memory

**Verified state.**
- `worldContext` carries authored scene/NPC context; `EngineNpc.memories[]` and `relationshipScore` exist (`engine-contracts.ts:591-600`); player notes persist. **No structured hidden/secret field, no actor-knowledge model, no stealth/invisibility/light/senses model, no passive-Insight, no discovery provenance.** `passivePerception` is computed but **never checked** against anything.
- The DM-context builder does not filter facts by actor knowledge scope (inference from absence of any such model).

**First-slice delta.** Separate world-truth from actor-perceived/known/false-belief; one hidden/secret fact + one dark area + one special sense (darkvision); passive reveal + active search via #6; stealth contest; persistent actor-scoped discoveries; **DM prompt cannot receive unrevealed facts**.

**Scope risks/decisions.**
- **Prompt filtering is the security boundary** — the engine must guarantee unrevealed facts never enter the LLM context. This is the highest-stakes correctness requirement in #7 and must be tested adversarially.
- Knowledge staleness: altering a world fact must not silently rewrite historical knowledge (explicit staleness). Needs a discovery-version model.
- Keep scene/region-level visibility for the first slice (issue allows it); defer LOS to #10.

**Deps.** #2 (invisible/unseen as effect), #6 (checks/secret rolls/retry). #10 later adds LOS/cover geometry.

---

### #8 — [P1][Inventory] Ownership, equipment, containers, economy, consumables, magic items

**Verified state.**
- **Item instance model is solid**: `EngineInventoryItem` has `id, quantity, contentKey/packHash | authoredDefinition, slot, equipped, attuned` (`engine-contracts.ts:668-677`); `EngineItemDefinition` has weight/value/damage/armorClass/armorProfile/attunementRequired/isMagic/rarity/mechanicsTier (`:644-666`). Dual provenance enforced (`open5e-rules.ts:413`).
- equip/unequip/drop **work and recompute AC** (`:921-974`); merchant prices **server-owned** (`:625-694`); loot **exactly-once** (`:2777-2841`). `LANTERN_IMPLEMENTED` for the base loop.
- **Gaps**: attunement flag stored but **never enforced** on equip (`:932-939` has no check); **curse / identification / charges / containers ABSENT** (flat array `inventory: EngineInventoryItem[]`); two-handed/shield conflicts = same-slot only; **ammunition never decremented**; consumables apply **healing only**; encumbrance is **display-only** (`:4357`); **magic items are tier-1 prose, blocked from equip/use** (`:932,2921`; 2,319 imported).

**First-slice delta.** Containers + weight/capacity enforcement; two-handed/shield/duplicate-slot conflicts; ammunition consumption; consumables via canonical effect/healing (#4); merchant buy/sell atomicity; exactly-once loot; **one reviewed magic item reusing #2 charge/modifier primitives**.

**Scope risks/decisions.**
- **The equipped-weapon contract feeds #3**: `#3` weapon-attack derivation must read these equipped *instances*, not strings (issue AC #3). Define the read surface jointly.
- Magic-item effect cleanup on unequip/deplete must use #2 source-linked cleanup — do not build a bespoke item-effect path.
- Encumbrance: decide whether it stays display-only or gains a mechanical effect (speed penalty) — couples to #10 Speed if so.

**Deps.** #2 (effects/charges), #3 (equipped-weapon/AC derivation), #4 (canonical healing for potions), #6 (tool checks for crafting/lockpicking later).

---

### #9 — [P1][Life Cycle] Death, dying, injury, poison, disease, exhaustion, corpses, resurrection

**Verified state.**
- Death-save handler exists (`resolveDeathSave` `engine-domain.ts:2720-2775`): d20, `success = roll >= 10`, counters (`:786-787`), stabilize@3/death@3. **Natural 1 / natural 20 ABSENT** (`:2730-2731`). `unconscious/dead/stable` are bespoke string conditions.
- **Healing-from-0 is BROKEN**: `resolveUseItem` potion raises HP but is **not gated on `unconscious`** and does not clear it (`:2911-2929`). The three heal paths (potion/rest/improvise) **do not share a contract** — only long rest clears downed state.
- **ABSENT**: massive damage, corpse/remains entity (loot authors items directly), poison/disease stages, exhaustion, max-HP-reduction.

**First-slice delta.** Correct 0-HP transitions; damage-at-0 failures incl. crit; **nat-1/nat-20 per pinned rules**; stabilization; canonical healing-from-0 (clears incompatible downed state — fixes the BROKEN potion); corpse creation exactly-once with inventory ownership; one poison/exhaustion via #2.

**Scope risks/decisions.**
- **This issue must adopt #4's `applyHealing`** — the BROKEN potion path is really a missing shared recovery contract. Sequence #4 before (or with) #9.
- Corpse inventory separation couples to #8 ownership; decide whether a corpse is a lootable actor or an item-bearing remains record.
- Pinned ruleset nat-1/nat-20 behavior must be content/ruleset-pinned (SRD-2014: nat1 = two failures, nat20 = regain 1 HP).

**Deps.** #2 (poison/disease/exhaustion/max-HP), #4 (canonical healing), #8 (corpse inventory), #12 (time for resurrection windows/disease progression — later).

---

### #10 — [P1][Spatial] 2.5D-ready tactical position + movement substrate

**Verified state (from the action-economy/spatial audit).** No x/y/z, no movement pool, no pathfinding/collision/LOS; scene-exit movement only; scalar `distanceFeet` authored per combatant (`engine-contracts.ts:879`); no link between character Speed and movement. ADR-H24 exists.

**First-slice delta.** `{frameId,x,y,z}` with **z=0 validated/rejected-if-nonzero**; one distance metric (`five_e_simple`, Chebyshev); movement allowance from canonical Speed; bounded path around one blocker; split movement; range/reach from the same metric; ordered path triggers; migrate/deprecate scalar `distanceFeet` authority.

**Scope risks/decisions.**
- **`distanceFeet` deprecation is a cross-cutting change** — `cast_spell` range and creature reach currently read it (`engine-domain.ts` spell-range path). The migration must make `distanceFeet` *derived-only* from the new positions, or remove it. Coordinate with #4 (range) and #11 (reach/triggers).
- z=0 honesty: first slice must **reject nonzero z** rather than silently clamp (issue AC).
- Pathfinder vs. validator: a deterministic path *validator* (DM proposes path, engine validates cost/collision/corner-cut) fits the "LLM proposes, engine decides" rule better than autonomous A*.

**Deps.** #3 (movement resource + turn lifecycle). Feeds #11 (path triggers), #7 (LOS later).

---

### #11 — [P1][Encounter] Surprise, initiative, morale, surrender, retreat, chases, hazards, objectives

**Verified state.** Encounter has `none/active/ended` (`engine-contracts.ts:919-920`); initiative is implicit (player→enemies auto-order, `:1777`); loot exactly-once; legendary/lair are **content-only, non-executable**. No surprise/detection, no morale/surrender/retreat/capture/nonlethal, no objectives-beyond-kill, no reinforcements/waves/hazards.

**First-slice delta.** Pre-combat/active/resolving/terminal states; surprise from #7; server-rolled deterministic initiative (persisted, not rerolled on retry); one morale threshold; surrender/retreat/capture/nonlethal; typed outcomes; exactly-once termination+rewards; opportunity attacks via #10 triggers + #3 reactions.

**Scope risks/decisions.**
- **Initiative determinism across replay** is subtle: the roll must be persisted and replayed identically (issue AC) — reuse the existing replay idempotency kernel.
- "Continue attacking a surrendered target" legality/consequence needs an explicit rule (moral/mechanical) — a product decision.
- Morale must be **server-owned threshold**; the LLM cannot force surrender (issue AC).

**Deps.** #3, #7, #9, #10, #15 (quest/objective consequences).

---

### #12 — [P2][Time] World clock, travel, survival, rests, downtime, projects

**Verified state.** **No game-time.** Only wall-clock `updatedAt`; rest has no duration gate (long rest just sets HP=max, `engine-domain.ts:2878-2886`); no calendar, travel, pace, navigation, supplies, weather, watches, outside-combat durations, deadlines, or projects. Rest can be spammed (no time requirement).

**First-slice delta.** Campaign game-time + deterministic advance event; one-day travel (pace/distance/navigation/supplies/watch/weather/forced-march); rest duration + interruption; outside-combat effect-duration processing (depends on #2 durations); one downtime project; quest/NPC/world-clock integration points.

**Scope risks/decisions.**
- **Rest-spam is a real exploit** today (rest has no time cost). #12 closes it — but until then, balance assumes unlimited rests.
- "Scheduled effects process exactly once when due boundary crossed" needs an ordered due-queue; couple to #2's duration kinds.
- Real-time background workers are **explicitly out of scope** (EPIC rule #8) — time advances only on explicit commands.

**Deps.** #2 (durations/exhaustion), #6 (navigation/crafting checks), #8 (supplies), #9 (exhaustion/recovery). Feeds #13/#14/#15.

---

### #13 — [P2][Social] Disposition, trust, reputation, factions, law, promises, witnesses, rumors

**Verified state.** `social_check` adjusts `npc.relationshipScore` ±5/−2 (`engine-domain.ts:587-623`) and stores `memories[]` — **narrative-only, no mechanical capability change**. No factions, reputation, crimes/witnesses/evidence, promises/debts, leverage/secrets, rumors, or law. Merchant price is server-owned but does not read relationship state.

**First-slice delta.** Distinct relationship/disposition/faction-standing/public-reputation values with bounds; promises (IDs, parties, terms, status, deadlines); one witnessed crime + evidence; one rumor propagation step; bounded price/access consequence; social checks via #6; knowledge filtering via #7; time-delayed propagation via #12.

**Scope risks/decisions.**
- **Rumor ≠ truth**: propagation must not turn a rumor into world fact (issue AC). Needs an explicit truth-relation field.
- "Social checks cannot directly set arbitrary trust/reputation" — outcomes must map through reviewed consequence tables (issue AC). This is the LLM-boundary enforcement point.
- Crime/evidence must distinguish accusation from proven fact.

**Deps.** #6, #7, #8 (merchant/stolen-item provenance), #12 (time/propagation). Feeds #14.

---

### #14 — [P2][NPC] Goals, schedules, resources, event-driven off-screen agency

**Verified state.** NPCs are narrative-only (`EngineNpc` has no HP/inventory/class/level/location/schedule/goals beyond free-text `goals[]`); no off-screen simulation; NPC spellcasters use precompiled creature attacks, not the player spell system. No agent invocation budget/cost controls.

**First-slice delta.** Event-driven NPC tick (time advance / scene enter / witnessed event / quest clock / combat turn / operator batch — **not** continuous); finite legal-action menu + strict action/model budget; one archetype; schedule/location change; one social/world response; deterministic fallback on model failure; strict prompt/knowledge filtering; shared domain-service execution.

**Scope risks/decisions.**
- **This is the first issue that invokes the LLM as an actor, not a narrator** — it introduces model-usage/cost/timeout/circuit-breaker requirements (issue AC). No prior issue needs these. Scope the accounting carefully.
- "Strict prompt/knowledge filtering" depends hard on #7 — an NPC must not learn hidden/player-only facts.
- One major off-screen action per invocation in the first slice (issue KISS) — resist chain planning.

**Deps.** #7, #8, #9, #12, #13. #15 may later become a trigger source.

---

### #15 — [P2][Quests] Branching objectives, deadlines, consequences, predicates, progress clocks

**Verified state.** `EngineQuest` is `active/completed/failed/abandoned` + scalar `progress` + single `reward{xp,copper}` + `rewardClaimed` (`engine-contracts.ts:937-947`). No graph/stages, no ordered/optional/hidden objectives, no predicates, no deadlines, no branching, no irreversible consequences, no follow-up eligibility, no progress clocks. `quest_update` flips status and pays the reward once.

**First-slice delta.** Stable quest/objective IDs; graph with transition predicates over authoritative state (not narration); ordered/unordered/optional/hidden objectives; deadlines via #12; distinct terminal states; exactly-once reward/consequence bundles; follow-up eligibility; one progress clock.

**Scope risks/decisions.**
- **Predicates over authoritative state** is the core design — transitions must be typed predicates, not LLM text (issue AC). Define the predicate vocabulary with the first fixture (world-state/inventory/encounter/social/time).
- Hidden objectives must be filtered by #7 (no leakage through DM context/errors).
- Reward atomicity already exists (`rewardClaimed`); extend to consequence bundles.

**Deps.** #5 (advancement/reward), #7, #8, #11, #12, #13, #14.

---

### #16 — [P2][Actors] Companions, familiars, summons, mounts, vehicles, controlled creatures

**Verified state.** **ABSENT.** No party members/controlled actors; `"summoning"` is a fictional improvise token only (`engine-contracts.ts:953`); no ownership/controller/initiative/command-cost/persistence/dismissal model. Single-PC assumption is pervasive.

**First-slice delta.** One persistent familiar/companion as a first-class actor (independent id/state/senses/position); bounded command menu consuming the reviewed Action/Bonus cost; reviewed initiative policy; deterministic no-command fallback; death/dismissal lifecycle; one temporary summon with explicit duration + cleanup.

**Scope risks/decisions.**
- **Controlled actors are first-class actors, not items or narration** (issue AC) — this touches nearly every subsystem (state, combat, inventory, knowledge, position). It is the broadest-surface P2 issue; sequence it late.
- Source-linked cleanup (#2) is essential for summons: duration/concentration/dismissal/source-termination must each clean up exactly once.
- Summons must not accumulate permanent XP/loot unless an explicit policy says so (issue AC) — this is the "temporary becomes permanent" hazard.
- Controller/charm/rider/vehicle relationships need **typed seams** (not overloaded booleans) even if unimplemented in the first slice.

**Deps.** #2, #3, #7, #8, #9, #10, #11, #12.

---

### #17 — [P2][Party] Multiple allied actors, shared state, formation, split parties, coordination

**Verified state.** **Single-PC assumption is baked into every domain path** (campaign state, routes, prompts, combat, inventory, quests, rewards all assume exactly one actor). No party/membership/viewpoint/group-check/split concepts. (Confirmed across this and the prior audits.)

**First-slice delta.** Build on #16's controlled companion: one human controlling PC + companion; independent sheets/budgets; party membership + leader/viewpoint; shared quest membership + one shared container/currency; one group check; party split/rejoin across scenes; viewpoint-switch context filtering; reward-allocation policy.

**Scope risks/decisions.**
- **Removing the one-actor assumption is invasive** (issue AC: "no longer assumes exactly one actor in every domain path touched by the first slice"). This is the highest-blast-radius issue; it must come after #16 and should be scoped to a small, enumerated set of paths.
- A **typed authorization/consent seam for permanent choices** is required even for single-player, because it is the future-multiplayer boundary (issue AC + Future seam). Do not defer the seam.
- Reward/XP allocation policy must prevent cross-actor duplication.

**Deps.** #6, #7, #8, #10, #11, #15, #16.

---

## 3. Cross-cutting contract conflicts to resolve up front

These recur across issues and must be decided **once**, in Phase 0, to avoid N divergent implementations.

| Conflict | Current state | Must be unified by | Affects |
| --- | --- | --- | --- |
| **Proficiency source** | derived `open5eProficiencyBonus` vs hardcoded `+2` (`engine-domain.ts:92`) | #3 (remove `:92`; attack reads character value) | #3, #5, #6 (spell/attack mods) |
| **Healing contract** | 3 inline paths disagree; potion leaves `unconscious` (`:2911-2929`) | #4 `applyHealing`; #9 adopts it | #4, #8 (potions), #9 (from-0) |
| **AC source** | equipment-only (`deriveArmorClass` `:3894-3914`) | #2/#4 (query active effects) | #2, #4 (Shield), #8 (equip) |
| **Effect/condition representation** | string markers + bespoke branches + separate concentration | #2 (one `EffectInstance` substrate) | #2, #3 (Dodge), #4, #6, #7, #9, #16 |
| **Advantage/disadvantage** | only `dodging`-vs-enemy-attack; improvise records but ignores | #2 (effect op) + #6 (cancellation) | #2, #6, #7 |
| **Check DC** | hardcoded `combat?14:12` (`:1068`); social uses `socialDc` | #6 (server-owned challenge def) | #6, #7, #11 |
| **Load-time recalculation** | `hydrateCharacter` not called on load (`engine-store.ts:7`) | #5 (policy) | #2, #5, #8 |
| **Spatial authority** | scalar `distanceFeet` vs future `{x,y,z}` | #10 (derive-only migration) | #4 (range), #10, #11 (reach) |
| **Actor assumption** | one-PC baked everywhere | #16/#17 (first-class actors) | #11, #15, #16, #17 |

---

## 4. Consolidated status matrix

| # | Issue | First-slice reachable today? | Current status | Keystone blocker |
| --- | --- | --- | --- | --- |
| 2 | Canonical effects | No (need new op kinds) | `LANTERN_PARTIAL` (duration model exists; no modifier/adv/stack substrate) | — (is the keystone) |
| 3 | Typed action economy + weapon attacks | No | `BROKEN` (attack), `LANTERN_PARTIAL` (resources/end-turn) | #2 (Dodge) |
| 4 | Spell effects + reaction casting | No | `CONTENT_ONLY` (heal/Shield); damage `IMPLEMENTED` | #2, #3 |
| 5 | PC advancement + NPC model | No | `ABSENT` (no level-up); XP accrual `IMPLEMENTED` | #3 (proficiency) |
| 6 | Skills/contests/improvisation | Partially | `LANTERN_PARTIAL` (hardcoded DC, no adv/help/retry); improvise `REFERENCE_ONLY` | #2 |
| 7 | Perception/stealth/knowledge | No | `ABSENT` (no hidden/knowledge model) | #2, #6 |
| 8 | Inventory/economy/magic items | Mostly | `LANTERN_IMPLEMENTED` (base loop); gaps in containers/charges/attune-enforce/magic-items | #2, #3, #4 |
| 9 | Death/injury/recovery | Partially | `LANTERN_PARTIAL` (death saves); `BROKEN` (heal-from-0); nat1/20 `ABSENT` | #2, #4, #8 |
| 10 | 2.5D spatial movement | No | `ABSENT` | #3 |
| 11 | Encounter lifecycle | No | `LANTERN_PARTIAL` (encounter shell); no surprise/morale/surrender/objectives | #3, #7, #9, #10 |
| 12 | World time/travel/downtime | No | `ABSENT` (no game-time; rest-spammable) | #2, #6, #8 |
| 13 | Social/factions/reputation/law | No | `LANTERN_PARTIAL` (relationshipScore only, narrative) | #6, #7, #8, #12 |
| 14 | NPC off-screen agency | No | `ABSENT` (+ first LLM-as-actor accounting need) | #7, #8, #9, #12, #13 |
| 15 | Branching quests/clocks | No | `LANTERN_PARTIAL` (flat quest + reward) | #5, #7, #8, #11, #12, #13 |
| 16 | Companions/summons/controlled actors | No | `ABSENT` (summoning is fictional token) | #2, #3, #7–#12 |
| 17 | Party/multiple actors | No | `ABSENT` (one-PC assumption pervasive) | #6–#11, #15, #16 |

---

## 5. Open product decisions (consolidated across issues)

These require owner sign-off and currently block clean first-slice definition:

1. **Advancement model** (#5): milestone vs XP vs both; level cap; multi-level crossing; excess-XP retention.
2. **Stacking policy** (#2): per-family stacking keys; highest-wins vs add; same-source non-stacking.
3. **Concentration unification** (#2): does concentration become an effect source-dependency?
4. **Reaction protocol shape** (#3/#4): persisted pending-reaction contract shared by Shield and opportunity attacks.
5. **HP on level-up** (#5): fixed/average vs rolled (determinism favors fixed).
6. **Check DC authoring** (#6): server-owned challenge definitions; who proposes the DC band (LLM proposes, engine validates)?
7. **Retry policy scope** (#6): per-check / per-scene / per-objective.
8. **Encumbrance** (#8/#10): display-only vs mechanical speed penalty.
9. **Attacking a surrendered target** (#11): legality + consequence rule.
10. **Initiative determinism** (#11): persisted-and-replayed roll (confirm kernel reuse).
11. **Real-time workers** (#12/#14): confirmed out of scope — time/NPC-advance only on explicit commands.
12. **Rumor vs truth** (#13): explicit truth-relation field; propagation cannot mint world fact.
13. **NPC model invocation accounting** (#14): model budget/cost/timeout/circuit-breaker — first issue needing it.
14. **Quest predicate vocabulary** (#15): typed predicates over authoritative state for the first fixture.
15. **Summon XP/loot policy** (#16): default no permanent accumulation unless explicit.
16. **Permanent-choice consent seam** (#17): typed authorization boundary for future multiplayer.
17. **Per-actor ruleset/formula pinning** (#5): freeze actors to progression-table revision on pack updates.

---

## 6. Risk register (top items)

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Starting #4/#6/#9 before #2 → bespoke branches re-proliferate | High | High | Enforce #2-first ordering; gate PRs on shared `EffectInstance` |
| Healing-from-0 stays broken if #4 and #9 diverge | Medium | High | #4 owns `applyHealing`; #9/#8 adopt it in one coordinated change |
| Load-time drift after new derived dimensions added (#2/#5/#8) | High | Medium | #5 defines the load-recalc policy; all derived-state issues follow it |
| `distanceFeet` migration breaks spell range/creature reach (#10) | Medium | High | Make it derived-only in one PR; coordinate #4/#11 read surfaces |
| NPC-as-actor (#14) introduces unbounded model cost/loops | Medium | High | Strict per-invocation budget; deterministic fallback; no continuous loop |
| One-actor assumption removal (#17) touches every path | High | High | Late sequencing; scope to an enumerated path set; typed consent seam |
| Improvise "success without mutation" shipped as a feature | Medium | Medium | #6/#2 must make unsupported effect types reject honestly |
| Reward XP uncalibrated to CR (#5) | High | Medium | Decide CR→XP table (or keep DM-authored with documented bounds) |

---

## 7. Per-issue audit documents still required

Each P1/P2 issue prescribes writing `docs/hosted-handoff/<name>-audit.md` **before implementation**. None exist yet except the three completed audits. This report's per-issue "Verified state" sections provide the seed evidence for those audits, but each issue still owns its own focused audit deliverable (per the EPIC's "Audit before implementation" rule and definition of done):

- #6 `skills-checks-and-improvisation-audit.md`
- #7 `perception-stealth-and-knowledge-audit.md`
- #8 `inventory-ownership-and-economy-audit.md`
- #9 `death-injury-and-recovery-audit.md`
- #11 `encounter-lifecycle-audit.md`
- #12 `world-time-travel-survival-and-downtime-audit.md`
- #13 `social-factions-reputation-and-law-audit.md`
- #14 `npc-agency-and-offscreen-simulation-audit.md`
- #15 `quests-objectives-and-progress-clocks-audit.md`
- #16 `controlled-actors-companions-and-vehicles-audit.md`
- #17 `party-coordination-and-multiple-actors-audit.md`

(#2, #3, #4, #5 derive their verified starting points from the three existing committed audits + ADR-H23/H24/H25, so they do not require new audit files per their issue text — #2/#3/#4 cite existing audits; #5 cites the progression audit.)

---

## 8. Recommendation

Honor the EPIC's Phase-0 spine verbatim: **#2 → #3 → (#4 ∥ #5)**. Treat #2 as a hard gate — its `EffectInstance` model, stacking policy, and concentration decision are prerequisites for half the plan. Fix the three confirmed `BROKEN` spots as part of their owning issues (player attack in #3; heal-from-0 in #4/#9; improvise-honesty in #6). Before any Phase-1 implementation begins, decide the cross-cutting contracts in §3 — especially the shared reaction protocol (#3) and the load-time recalc policy (#5) — so later issues consume one canonical path rather than inventing nine.
