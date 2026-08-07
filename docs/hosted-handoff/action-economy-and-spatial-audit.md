# Lantern Action-Economy and 3D Spatial Movement Audit

Audit date: 2026-08-07
Auditor: read-only implementation audit (no code changes made)
Subject: `F:\Github\rpg mcp live` ("Lantern") — the new hosted production implementation
Comparison source only: `F:\Github\mnehmos.rpg.mcp` ("reference engine") — prior MCP-based engine, 2214 tests, not part of Lantern's runtime by explicit architectural decision (`docs/ADR-H13-reference-engine-boundary.md`)

Repository state at time of audit:
- Lantern (`F:\Github\rpg mcp live`): git repo with **no commits yet** — `main` has "no commits yet"; all files show as untracked (`git status --short`). This audit reflects the working tree as it exists on disk.
- Reference engine (`F:\Github\mnehmos.rpg.mcp`): HEAD `2a34f7f051efaa666cef46626ec850f7f191c051`, 2026-07-25.

---

## 1. Executive summary

**Lantern has a real, narrow, transactionally-sound action-economy kernel for one specific shape of combat (one player character vs. a queue of enemies, turn-alternating, distance-abstracted). It does not have a general typed action-economy model (no Bonus Action slot separate from the Action, no Movement pool, no Reaction triggers beyond spell-casting-time gates, no Ready, no legendary/lair action execution), and it has effectively no noncombat action economy at all beyond ad-hoc single checks and a rest command.**

**Lantern has no 3D spatial movement system, and no 2D spatial system either.** There is no coordinate representation of any kind (no x/y/z, no grid, no map). Position is represented only as (a) a scene-graph of narrative "world contexts" connected by DM-authored `exits` (id + label, traversed by `move`), and (b) a single scalar `distanceFeet` per combatant used only to gate spell range against a flat number. There is no pathfinding, no collision, no line of sight, no navigable-volume distinction between walking/flying/swimming, and no body/footprint model. This matches the project's own design docs (`docs/GDD.md:135`: "A map renderer or 3D client" is explicitly out of scope).

**What exists only in the reference engine:** 3D-capable A* (`Point.z?: number`, `DistanceMetric` euclidean/manhattan/chebyshev, alternating 5-10-5 diagonal cost), 2D footprint collision for multi-cell creatures, line-of-sight/line-of-effect helpers, a genuinely typed per-combatant action-economy record (`movementRemaining`, `actionUsed`, `bonusActionUsed`, `reactionUsed`, `hasDashed`, `hasDisengaged`, legendary actions/resistances, lair actions, death saves), and a much larger combat/spatial test suite (`tests/combat/`, `tests/spatial/`, `tests/engine/spatial/`, `tests/server/consolidated/{combat-action,combat-manage,combat-map,spatial-manage}.test.ts`). None of this is wired into Lantern; it is reference material only, and per ADR-H13 it is deliberately not on Lantern's production request path.

**Highest-risk gaps in Lantern today, ranked:**
1. The player's own basic "attack" (`combat_action` with `action: "attack"`) is **hardcoded** to `STR modifier + proficiency bonus` to-hit and `1d8 + STR` damage, completely ignoring the character's equipped weapon, its damage die, its properties (finesse/ranged), and whether the character is even proficient with that specific weapon. Enemy attacks, by contrast, correctly use compiled, content-pinned `attack.toHit` / `attack.damage`. This is an authoritative-derivation defect, not a caller-override vulnerability (the caller cannot inject a bonus), but it means the mechanical result is wrong relative to the character sheet for anyone not using a bare STR-based 1d8 weapon.
2. Bonus Action and Reaction are state fields that exist (`EngineCombat.bonusActionUsed`, `.reactionUsed`) but are **only ever set by spell casting-time checks**; there is no bonus-action or reaction path in `combat_action` at all, and nothing ever triggers a reaction mechanically (no opportunity attacks, because there is no movement/positioning to leave).
3. There is no movement/positioning system in combat at all — Dash, Disengage, and Help are narrated strings with **zero mechanical effect** (Dodge is the one exception: it sets a `dodging` condition that is checked and imposes disadvantage on the next incoming attack roll).
4. Legendary actions and lair actions are recognized as *content* (`content/schema.ts:418-420`, `actionType` enum includes `LEGENDARY_ACTION` / `LAIR_ACTION` / `MYTHIC_ACTION`) but are **never executed** by the combat resolver — no mechanism triggers a legendary action on another creature's turn, and no lair-action initiative-20 slot exists.
5. Noncombat "action economy" (exploration, searching, travel, downtime, crafting, research, progress clocks, hazards) is **absent** as a structured system. The tool catalog has no such tools; `rest` is the only noncombat command that consumes/restores a tracked resource (hit dice, spell slots), and it has no in-world clock separate from `updatedAt`.

**Is either subsystem ready to build gameplay on?**
- The **action-economy kernel that exists** (single-PC-vs-queue combat, turn ownership, action-spend gating, atomic commit, idempotent replay, version-conflict rejection) is a trustworthy **foundation primitive** — the transactional/persistence machinery is solid and well-tested — but the **combat vocabulary it exposes is too narrow** to be "the action economy" the audit brief describes (no typed Action/Bonus Action/Reaction/Movement pools, no Ready, no OA, no legendary/lair execution). Build on it cautiously: extend the same transactional pattern, don't assume the combat rules layer above it is complete.
- The **3D (or even 2D) spatial system does not exist** in Lantern. It is not partially built; it is not started. Nothing should be assumed "close" here — this is a from-scratch build if the product needs positional movement, reach, AoE geometry, or verticality.

---

## 2. Status matrix

| Area | Status | Evidence | What works | What is missing | Confidence |
|---|---|---|---|---|---|
| Action definitions / command catalog | LANTERN_PARTIAL | `src/engine-contracts.ts:183-432` (`engineCommandSchema`, discriminated union, 30 command kinds); `src/engine-contracts.ts:79-121` (`engineToolNameSchema`, 36 tool names) | Every command is a Zod-validated discriminated union member with strict schemas; one command kind = one resolver function in `src/engine-domain.ts:340-424` | No generic "action definition" registry with traits/tags/prerequisites/costs as data — costs and legality are hardcoded per-resolver in TypeScript, not declared | High |
| Action offers ("what may I legally do now") | ABSENT | Grep of `src/engine-tools.ts`, `src/engine-contracts.ts` for "legal actions"/"available actions" found only `availableActions: string[]` in `EngineSessionView` (`src/engine-contracts.ts:954`), a static/derived list, not a per-turn generated legal-action set | Session view exposes a field | Field is not populated from turn state in the code paths inspected; no server-computed "here is what you may currently do" enumeration tied to actionUsed/bonusActionUsed/reactionUsed | Medium (did not trace every producer of `availableActions`) |
| Turn/state versioning & idempotency | LANTERN_IMPLEMENTED | `src/engine-store.ts:346-427` (`executeCommand`): SQLite transaction, `expectedCampaignVersion` check (`EngineVersionConflictError`, line 370-372), `clientCommandId` dedup with content-match (`EngineCommandIdReuseError`, line 364) and replay (`replayed: true`, line 366) | Atomic write-or-reject; idempotent retries return the stored result without re-executing; stale writes rejected | None material found | High |
| Combat: turn identity / off-turn rejection | LANTERN_IMPLEMENTED | `src/engine-domain.ts:1686-1689` (`resolveCombatAction`: `activeActorId !== state.actorId` → `off_turn` rejection); test `src/engine.test.ts:407-416` | Off-turn `combat_action` is rejected with `off_turn`, state/version unchanged | Model is single-PC-vs-enemy-queue; no multi-PC party turn order was found | High |
| Combat: post-encounter rejection | LANTERN_IMPLEMENTED | `src/engine-domain.ts:1686` (`status !== "active"` → `no_active_combat`) checked before any mutation in both `resolveCombatAction` and `resolveAdvanceTurn` (`:1811`) | Actions after `combat.status` becomes `"ended"` are rejected | None found | High |
| Combat: one Action per turn | LANTERN_IMPLEMENTED | `src/engine-domain.ts:1707` (`state.combat.actionUsed` → `action_already_used`) checked before cloning/mutating state | A second `attack`/`dodge`/`dash`/etc. in the same turn is rejected without state change | — | High |
| Combat: Bonus Action | LANTERN_STUB | `EngineCombat.bonusActionUsed` field exists (`src/engine-contracts.ts:845`); only set by `resolveCastSpell` when `castingTime === "bonus-action"` (`src/engine-domain.ts:1381,1443`) | Spells with bonus-action casting time correctly gate on/consume the flag | `combat_action` has no bonus-action option at all; no non-spell bonus actions (e.g., off-hand attack, class features) exist | High |
| Combat: Reaction | LANTERN_STUB | Same pattern as Bonus Action, for `castingTime === "reaction"` (`src/engine-domain.ts:1384,1444`) | Reaction-timing spells (e.g., Shield-like) gate/consume the flag | No opportunity attacks, no "Ready" trigger, nothing else ever sets or consumes `reactionUsed`; reset only happens on round rollover (`:2012-2013`, `:2585-2586`) | High |
| Combat: Movement allowance | ABSENT | No `movementRemaining`/`speed`-consumption field anywhere in `EngineCombat`/`EngineCombatant` (`src/engine-contracts.ts:792-850`); confirmed by repo-wide grep for `movementRemaining`, `position`, `coordinate` (no hits in Lantern `src`) | — | No movement pool, no split-movement, no Dash effect, no terrain cost | High |
| Combat: Dash / Dodge / Disengage / Help | LANTERN_PARTIAL | `src/engine-domain.ts:1769-1780` | Dodge sets `dodging` condition consumed at `:1946-1951` (imposes disadvantage on the next enemy attack) | Dash/Disengage/Help are narration-only strings with **no state change** (`:1773-1778`); nothing checks `hasDisengaged`-equivalent to suppress an opportunity attack (there is no OA system to suppress) | High |
| Combat: Ready | ABSENT | Not present in `combat_action` enum `["attack","dodge","dash","disengage","help"]` (`src/engine-contracts.ts:401`); no trigger/queued-reaction concept anywhere | — | No Ready action, no stored trigger condition, no deferred Reaction execution | High |
| Combat: Opportunity attacks | ABSENT | No matches for "opportunity" in `src/engine-domain.ts`/`engine-contracts.ts`; no movement to leave a threatened area exists | — | Cannot exist without positions/reach | High |
| Combat: Legendary / Lair actions | LANTERN_PARTIAL (content-typed, not executed) | `content/schema.ts:418-420` (`actionType` enum incl. `LEGENDARY_ACTION`, `LAIR_ACTION`, `MYTHIC_ACTION`; `legendaryActionCost` field) | Statblock data is imported/typed with these fields | `resolveAdvanceTurn`/`resolveCompiledCreatureProgram` only execute `multiattack`, `saving-throw-damage`, `saving-throw-condition` execution modes (`src/engine-domain.ts:1854-1858`); no legendary-action-on-another-turn or lair-action-at-initiative-20 execution path found | High |
| Combat: Death saves | LANTERN_IMPLEMENTED | `resolveDeathSave`, `src/engine-domain.ts:2703-2758` | d20 roll, 3 successes → stable, 3 failures → dead, gated on `unconscious` condition, persisted via `commit` | No crit rules (nat 20 = 2 successes / instant heal, nat 1 = 2 failures) in 5e sense — not evaluated as in scope for this audit but noted | High |
| Combat: Concentration | LANTERN_IMPLEMENTED | `src/engine-domain.ts:1985-1999` (concentration save on damage), `:1976-1981` (broken on 0 HP) | DC = max(10, floor(damage/2)), CON save, ends concentration on failure or downing | — | High |
| Combat: Spell timing (action/bonus/reaction) | LANTERN_IMPLEMENTED | `src/engine-domain.ts:1378-1444` | Gated against the correct flag per casting time; range gated against `distanceFeet` | Timing model doesn't interact with the (nonexistent) movement/position system | High |
| Player attack derivation (to-hit/damage) | **BROKEN relative to character sheet** | `src/engine-domain.ts:1727-1738`: `attackModifier = abilityModifier(str) + proficiencyBonus`; damage = `randomInt(1,9)` (d8) `+ abilityModifier(str)`, unconditionally | A roll happens and damage is dealt | Ignores equipped weapon entirely (no reference to `mainhand`/`inventory` items in the attack path — confirmed by grep for weapon/mainhand/finesse in `resolveCombatAction`, zero hits); always STR-based, always d8; caller cannot override it (it's not caller-supplied, it's simply wrong) | High |
| Enemy attack derivation (to-hit/damage) | LANTERN_IMPLEMENTED | `src/engine-domain.ts:1903-1972`: uses compiled, content-pinned `attack.toHit`, `attack.damage.{diceCount,dieSides,bonus,typeName}` from `CompiledCreatureAttack` | Canonically derived from the installed Open5e content pack, single source (`materializeCombatant`) | — | High |
| Armor Class | LANTERN_IMPLEMENTED | `deriveArmorClass`, `src/engine-domain.ts:3742-3762`, invoked from character creation and equip/unequip (`:932,952,3344,3500,3666`) | One server-owned function; accounts for equipped armor category, dex cap, shields; recalculated on every equip/unequip | — | High |
| Saving throw bonus / spell save DC / spell attack modifier | LANTERN_IMPLEMENTED (character); enemy equivalents pack-derived | `EngineCharacter.savingThrows`, `EngineSpellcasting.{spellSaveDc,spellAttackBonus}` computed at creation/level and surfaced in `characterData` (`:4152+`) | Canonical, single computation site | Not independently re-verified line-by-line for every ability; treat as High confidence based on structural pattern, not exhaustive proof | Medium-High |
| Caller override of authoritative values | ABSENT (i.e., callers cannot override) | `engineCommandSchema` entries are `.strict()` Zod objects with no `attackBonus`/`damage`/`ac`/`healing`/`speed` fields on mutating commands (e.g., `combat_action`, `cast_spell`, `use_item` — `src/engine-contracts.ts:336-411`) | Server computes all mechanical numbers itself | (See "player attack derivation" above — the risk is server-side miscalculation, not caller override) | High |
| Noncombat action economy (exploration/search/social/travel/downtime/crafting/research/hazards) | ABSENT (structured system); LANTERN_PARTIAL (ad hoc) | `engineToolNameSchema` (`src/engine-contracts.ts:79-121`) has no explore/search/travel/downtime/craft/research/hazard tool; `social_check`, `interact`, `roll_check` exist as single ad hoc checks with no repetition control, no activity limits, no time advancement | Single-shot ability/skill checks (`resolveCheck`, `:1037+`) are validated, rolled, and persisted | No structured multi-step noncombat economy of any kind; "time advances" only via `rest` | High |
| Rest (short/long) | LANTERN_IMPLEMENTED (as an ad hoc command, not part of a broader time system) | `resolveRest`, `src/engine-domain.ts:2826-2892` | HP/hit-dice/slot recovery correctly computed and persisted; short rest correctly requires available hit dice or pact slots | No in-world clock separate from `updatedAt`; nothing prevents narratively "spamming" rests other than resource exhaustion; no interruption mechanic | High |
| Transactionality / persistence | LANTERN_IMPLEMENTED | `src/engine-store.ts:346-427` (single SQLite transaction wraps read-current, idempotency check, resolve, write-state, write-event, write-command-result) | Atomic; rejected commands never call `writeState` for mechanical fields (`rejection()` returns the *same* state object, `src/engine-domain.ts:3032-3049`); before/after values stored per mutation (`stateChanges` arrays throughout resolvers); rolls/modifiers stored on the event (`EngineEvent.rolls/modifiers`, `src/engine-contracts.ts:934-935`) | Narration is generated and attached *after* mechanical commit (`updateCommandNarration`, `src/engine-store.ts:429-484`), so narration cannot retroactively rewrite already-committed mechanics, but it also means the very first response before an LLM narration pass can lag | High |
| Cross-campaign/account isolation | LANTERN_IMPLEMENTED | `LanternEngineStore.getCampaign` (`src/engine-store.ts:282-287`) requires `(account_id, campaign_id)` primary-key match plus `actorId` match (`EngineActorMismatchError`); SQL primary key is `(account_id, campaign_id)` (`:172`) | Structural isolation at the SQL layer | Engine-server auth relies on trusted headers set by the front-end (`x-lantern-account-id` etc., `src/engine-client.ts:196-200`) plus a shared secret (`src/engine-server.ts` — token check present); did not audit Clerk-side identity binding in `server.ts` in full depth | Medium-High |
| Coordinate representation (B1) | ABSENT | Repo-wide grep in Lantern `src` for `coordinate`, `position`, `x:\s*number`, `y:\s*number`, `z:\s*number`, `pathfind`, `grid`, `voxel`, `terrain` returned **zero** true positives (all matches were the unrelated word `disposition`) | — | No coordinate system of any kind, 2D or 3D | High |
| Navigation topology (B2) | ABSENT | `resolveMove`, `src/engine-domain.ts:426-462`, only checks `destinationId` against a DM-authored `exits` array (id+label) on the current `worldContext` | Graph-edge traversal between DM-declared narrative locations | No surfaces, floors, stairs, doors-as-geometry, air/water volumes, or region graph with actual adjacency/cost | High |
| Movement modes (B3) | ABSENT | No `movementMode` concept in `EngineCharacter`/`EngineCombatant`; `speed: number` exists on `EngineCharacter` (`src/engine-contracts.ts:690`) but is never consumed by any movement calculation | `speed` is stored/displayed | Walk/crawl/climb/swim/fly/hover/burrow/jump/fall/teleport/forced/carried/mounted/vehicle: none implemented, none tested | High |
| Pathfinding & distance (B4) | ABSENT | No A*, no distance-metric code in Lantern `src` (only `distanceFeet`, a flat number set at `combat_start`/`spawn_creature` and never recomputed by movement) | Range checks compare `distanceFeet` to a spell's flat range in feet (`src/engine-domain.ts:1430-1436`) | No pathfinding, no 2D/3D neighbor generation, no diagonal rules, no difficult terrain, no path storage | High |
| Body/collision model (B5) | ABSENT | No size-footprint, no width/depth/height, no clearance, no swept-volume, no creature-to-creature collision in Lantern `src` | — | Entirely absent; `size: string` exists on the character (display only) | High |
| Support/gravity/falling/jumping (B6) | ABSENT | No gravity, fall, or jump code found | — | Entirely absent | High |
| Reach/reactions/LOS/areas (B7) | ABSENT (LOS/areas); LANTERN_PARTIAL (reach as flat-number range gate) | Spell "area" resolution is a `distanceFeet <= rangeFeet` scalar comparison (`src/engine.test.ts:1381-1403`), not geometry | Range gating works as a 1D abstraction | No line of sight, no line of effect, no cover, no cones/spheres/cylinders as geometry — cone/AoE spells are resolved as "everyone within N feet," not shape-aware | High |
| Movement economy integration (B8) | ABSENT | `resolveMove` (`:426-462`) has no actor/turn validation beyond "not in active combat," no capability check, no path planning, no collision, no cost, no trigger discovery, no reaction handling, no budget spend, and persists only `worldContext`/log, not a position | — | The entire pipeline the audit asks about does not exist for movement | High |

---

## 3. Runtime traces

### 3.1 Attack (combat, mutating)

Entry point: `POST /api/campaigns/:campaignId/commands` (`src/server.ts:359`) → `engineClient.executeCommand` (`src/engine-client.ts:151-167`, HTTP call to the engine service) → engine-service route in `src/engine-server.ts` (parses body with `engineCommandRequestSchema`, builds `RequestContext` from trusted headers) → `LanternEngineStore.executeCommand` (`src/engine-store.ts:346-427`).

Inside the store transaction:
1. Idempotency check: look up `(account_id, client_command_id)` in `engine_commands`. If the stored request JSON differs → `EngineCommandIdReuseError`. If it matches and is already `resolved` → return the stored result with `replayed: true` (line 366), **no re-roll, no re-mutation**.
2. Version check: load current campaign row, compare `version` to `expectedCampaignVersion`; mismatch → `EngineVersionConflictError` (lines 369-372), nothing written.
3. Insert a `processing` row into `engine_commands` (lines 375-385) — this is what makes a genuinely concurrent duplicate request throw `EngineCommandInProgressError` (line 365) rather than double-execute, because the row already exists when the second request's `SELECT` runs inside its own transaction.
4. Call `input.resolve(current)` → `resolveEngineCommand(state, context, clientCommandId, { kind: "combat_action", action: "attack", targetId }, "combat_action")` (`src/engine-domain.ts:340-424`, dispatches to `resolveCombatAction`, line 1679).
5. `resolveCombatAction` (`:1679-1802`) validates, **in order, before any mutation**: encounter active (`:1686`), turn ownership (`:1687-1689`), not unconscious (`:1690-1692`), not incapacitated/paralyzed/petrified/stunned (`:1693-1706`), Action not already spent (`:1707`), target exists and is alive (`:1709-1712`). Any failure returns `rejection(state, ...)` which hands back the **same, unmutated `state` object** (`:3032-3049`) — no clone, no version bump, no event.
6. On success: `cloneCampaign(state)` (`:1714`), `next.combat.actionUsed = true` (`:1717`), attack roll `randomInt(1,21)` (`:1728`), **to-hit computed as `abilityModifier(STR) + proficiencyBonus`** (`:1729` — hardcoded, ignores equipped weapon), compared to `targetView.armorClass` (correctly, canonically derived). On hit: damage `randomInt(1,9) [+2x on crit] + abilityModifier(STR)` (`:1736-1738` — hardcoded d8, ignores weapon), `target.hp` reduced with a floor of 0, `target.alive` recomputed, and if all enemies are dead, `combat.status = "ended"`.
7. `commit(...)` (`:1784-1801` → `:2935-2985`) bumps `version += 1`, appends a log message, and constructs an `EngineEvent` with `rolls`, `modifiers`, `stateChanges` (`before`/`after` HP, `actionUsed`), `contentKeys`, `previousVersion`/`version`.
8. Back in the store transaction: `writeState(resolution.state)` (only because `accepted && !readOnly`, line 389-391) updates the single `engine_campaigns` row (whole-state JSON blob, `src/engine-store.ts:499-512`); `INSERT INTO engine_events` persists the event (`:392-407`); `UPDATE engine_commands SET status='resolved', result_json=...` persists the full result (`:418-422`) — all inside the **same SQLite transaction**, so this is atomic: either all three writes land or none do.
9. Response returned to `server.ts`, JSON to the client. Narration: a rules-authored message is embedded synchronously (`message` field, plain string, e.g. "Your attack hits X for N damage."); an LLM narration pass can later call `updateCommandNarration` (`src/engine-store.ts:429-484`) to replace/decorate the log text — but that function reads `stored.readOnly` and, for mutating commands, re-derives from `this.getCampaign(context)` (the *already-committed* state) rather than re-deriving mechanics, so it cannot retroactively invent unpersisted effects.

**Reconstructability after restart:** the campaign's `state_json` is the full, current `LanternCampaignState`; the `engine_events` table stores every historical `EngineEvent` (rolls, modifiers, stateChanges, contentKeys) keyed by version — so the exact numeric result of a past attack is reconstructable from `engine_events`, and the live state is reconstructable from `engine_campaigns.state_json` alone (observed: `LanternEngineStore.mapState`, `:514-516`, just deserializes the stored JSON — no derived/cached state is required to reboot).

**Defect found in this trace:** the to-hit/damage numbers computed in step 6 do not reflect the character's equipped weapon (see status matrix, "Player attack derivation").

### 3.2 Movement (there is no 3D movement; traced the actual `move` command instead)

Entry point: same HTTP path as above, `command.kind === "move"` → `resolveMove` (`src/engine-domain.ts:426-462`).

1. Guard: `state.combat.status === "active"` → reject `combat_active` (`:433-435`) — this is the **only** legality check. No actor/turn validation is meaningful here because `move` is not a combat action; no capability check (no movement-mode concept exists to check); no path planning (no coordinates exist); no collision; no cost calculation; no trigger discovery; no reaction handling; no budget spend (no movement budget field exists to spend).
2. Destination validation: `state.worldContext?.exits.find(e => e.id === command.destinationId)` (`:437`). If the current world context has no matching exit id, reject `invalid_move` (`:438-447`) with the **unmutated state** (confirmed by test `src/engine.test.ts:311-330`: `rejected.state.version` stays `0`, `store.getCampaign(...).worldContext` stays `null`).
3. On success: `commit(...)` (`:448-461`) bumps version, logs "You move toward `<label>`. The DM must establish the next context." and returns `{ exit, worldContext: state.worldContext }` as data. **No position field of any kind is written** — the campaign has no `x/y/z`, no room id, nothing beyond the pre-existing `worldContext` object (which the DM must subsequently replace with a new `world_context` command to actually "arrive" anywhere).
4. Persistence: same atomic SQLite transaction/event pattern as the attack trace.

**Conclusion:** this is a scene-graph edge traversal gated only by "does this exit id exist on the current DM-declared context," not a spatial movement system. There is no 3D-aware (or 2D-aware) ground route, no distance consumed, no terrain, no collision, and no persisted position to resume from — "resuming after restart" trivially works because there was never any spatial state to lose, but that is a statement about the feature's absence, not its robustness.

### 3.3 Noncombat state-changing action: Rest

Entry point: same HTTP path, `command.kind === "rest"` → `resolveRest` (`src/engine-domain.ts:2826-2892`).

1. Guards, checked before mutation: not in active combat (`:2833`), character not dead (`:2834`).
2. `cloneCampaign(state)` (`:2835`); capture `before` values for HP, hit dice, spell slots, concentration.
3. Short rest: requires `hitDiceRemaining > 0` **or** a pact-magic-style short/long recovery slot available, else reject `no_short_rest_resources` (`:2847-2849`, unmutated state). Rolls a hit die (`randomInt(1, hitDie+1)`), heals `die + CON modifier` (floor 0), decrements `hitDiceRemaining`, restores short-rest-recoverable slots to max.
4. Long rest: full HP restore, partial hit-dice recovery (`floor(level/2)`, min 1), clears `stable` condition only (other conditions untouched — not evaluated further), resets death save counters, restores all spell slots to max, clears concentration.
5. `commit(...)` persists `stateChanges` for `hp`, `hitDiceRemaining`, `slots`, `concentration` (`:2885-2889`) and bumps version, same atomic transaction as above.

**Structured noncombat economy:** absent beyond this single command. There is no in-world time counter distinct from `updatedAt` (an ISO timestamp on the campaign row, not a game-clock), so nothing prevents narratively chaining rests, and there is no "downtime day," "travel," "search," or "craft" tool at all — confirmed by the full 30-member `engineCommandSchema` discriminated union (`src/engine-contracts.ts:183-431`) and 36-member `engineToolNameSchema` (`:79-121`), neither of which contains any such verb.

---

## 4. Invariants currently enforced (proven by code and tests)

1. **Off-turn combat actions are rejected**, state and version unchanged. Code: `src/engine-domain.ts:1687-1689`. Test: `src/engine.test.ts:407-416` (`offTurn.accepted === false`, `code === "off_turn"`, `offTurn.state.version === attack.state.version`).
2. **Post-encounter combat actions are rejected.** Code: `:1686` (checked before ownership/action checks). Not independently exercised by a dedicated test beyond the encounter-ending path in the same test file, but the guard is unconditional and precedes all mutation.
3. **One Action per turn** — a second `combat_action` in the same turn is rejected (`action_already_used`) before any state clone. Code: `:1707`.
4. **Rejected commands do not mutate mechanical state.** `rejection()` returns the literal input `state` object unchanged (`:3032-3049`); proven for `move` by `src/engine.test.ts:311-330` (version stays `0`, `worldContext` stays `null`) and for combat by the off-turn test above.
5. **Idempotent replay does not re-roll or re-mutate.** `src/engine-store.ts:363-367`; proven by `src/engine.test.ts:271-309` (`replay.event` deep-equals `first.event`; a genuinely different command reusing the same `clientCommandId` throws `EngineCommandIdReuseError`; a stale `expectedCampaignVersion` throws `EngineVersionConflictError`).
6. **Budget/effect commit is atomic.** All state, event, and command-result writes happen inside one `better-sqlite3` transaction (`src/engine-store.ts:356-427`); no code path was found that writes state without writing the corresponding event when `resolution.event` is non-null, or vice versa.
7. **Cross-campaign isolation at the storage layer.** `engine_campaigns` primary key is `(account_id, campaign_id)` (`:172`); every read/write is scoped by both columns; `getCampaign` additionally checks `state.actorId === context.actorId` (`EngineActorMismatchError`, `:282-287`).
8. **AC is canonically derived from equipped gear**, recalculated on creation/equip/unequip from one function (`deriveArmorClass`, `:3742-3762`); a caller cannot supply an AC value directly (no such field exists on any mutating command schema).
9. **Concentration is checked and can be broken** on damage via a CON save with DC `max(10, floor(damage/2))`, and is cleared on 0 HP. Code: `:1976-1999`. Exercised by `src/engine.test.ts:1406+` region ("...atomically resolves concentration and long-rest recovery").
10. **Death saves gate correctly on the `unconscious` condition** and transition to `stable` (3 successes) or `dead` (3 failures). Code: `:2703-2758`.

---

## 5. Invariants not enforced / material gaps

- **Illegal extra actions via untyped economy:** because there is no separate Bonus Action slot exposed through `combat_action`, and no movement pool, there is no way to *test* "can a character take two actions" beyond the single Action flag — the flag itself is sound, but the economy it guards is thin (only one resource, "the Action," is meaningfully modeled for the player).
- **Off-turn / post-encounter enforcement is combat-only.** Noncombat commands (`social_check`, `interact`, `roll_check`, `merchant_trade`, etc.) have **no turn concept at all** — there is nothing to be "off-turn" of outside combat, so no invariant exists (or is needed) there; this is a scope gap, not a bug, but it means "who may act, when" is entirely undefined outside combat.
- **State mutation after rejection:** mechanically, none was found (see Section 4, item 4). One nuance: if a rejected command is submitted **with** `playerText`, `LanternEngineStore.executeCommand` still calls `writeState` (`:389`, the `|| input.playerText` branch) because `appendPlayerTurn` (`:118-154`) clones the (rejected, unchanged) state and appends the player's chat text + a narration line to the **log** only. Game-mechanical fields (HP, `actionUsed`, position, etc.) are not touched — this is a log/chat side effect, not a mechanical exploit, but it does mean the campaign's `updatedAt`/log can advance on a rejected command, which a caller reading `version` alone would not detect (version is unchanged; log length is not compared by the audited tests).
- **Cross-campaign state:** not found to be violable in the code paths inspected, but the engine-service trusts `x-lantern-account-id`/`x-lantern-actor-id` headers (`src/engine-client.ts:196-200`) plus a shared secret; this audit did not trace the Clerk-auth binding in `server.ts` that is presumably responsible for setting those headers correctly, so the *end-to-end* (browser → Clerk session → header) chain is **UNKNOWN**, only the *storage-layer* isolation (once headers are trusted) is LANTERN_IMPLEMENTED.
- **Position clipping / unsupported vertical movement:** not applicable — there is no position to clip and no vertical axis to violate. This is an absence, not a passing invariant.
- **Duplicate actions via retry:** prevented for commands sharing a `clientCommandId` (idempotency, Section 4 item 5). A retry that generates a **new** `clientCommandId` for the same logical action is indistinguishable from a legitimately new command and **would** execute twice (roll twice, spend the Action twice if still available) — this is expected/standard for an idempotency-key design (the client is responsible for reusing the key), not a defect, but it means the invariant is "same key ⇒ no duplicate," not "same logical action ⇒ no duplicate."
- **Narrative/mechanical disagreement:** the architecture (mechanics commit synchronously, LLM narration attaches afterward via `updateCommandNarration`) structurally prevents narration from *fabricating an unpersisted mechanical effect* in the normal flow, because the mechanical event already exists before narration is requested. It does **not** prevent the opposite failure mode — a mechanically-correct-but-narratively-misleading description (e.g., narrating a called shot or a specific weapon swing when the underlying roll used the hardcoded STR/d8 path regardless of what was narrated) — because the LLM DM is free to describe an attack however it wants while the engine always resolves it the same hardcoded way.
- **Noncombat activity limits:** entirely absent (see Status Matrix). Nothing prevents unlimited repeated `roll_check`/`social_check`/`interact` calls in a scene; there is no fatigue, no time cost, no DC escalation on retry.
- **Legendary/lair actions:** typed in content, not executable — a DM/LLM attempting to trigger one via `advance_turn` with an `actionKey` matching a legendary action would hit the `content_tier_insufficient` or `unknown_creature_action` rejection paths (`:1916-1920`, `:1928` region) rather than actually resolving it, since `resolveAdvanceTurn`/`resolveCompiledCreatureProgram` only recognize `multiattack`/`saving-throw-damage`/`saving-throw-condition` execution modes (`:1854-1858`).

---

## 6. Test evidence

### Commands run

| Command | Result | Notes |
|---|---|---|
| `cd "f:\Github\rpg mcp live"; npm run build` (PowerShell) | **PASSED**, exit implied 0 (no `error`/`Error` lines in output; ran `open5e:verify-pack` then `tsc`) | `npm run build` = `npm run open5e:verify-pack && tsc` (`package.json:13`) |
| `cd "f:\Github\rpg mcp live"; npm test` (PowerShell, `vitest run --pool=forks`) | **PASSED** — `Test Files 14 passed (14)`, `Tests 83 passed (83)`, duration 10.98s | Full output captured below |
| `git log -1 --format="%H %ci"` in Lantern | No commits yet (`fatal: your current branch 'main' does not have any commits yet`) | Confirms Lantern is an uncommitted working tree at audit time |
| `git log -1 --format="%H %ci"` in reference repo | `2a34f7f051efaa666cef46626ec850f7f191c051 2026-07-25 10:30:48 -0700` | |
| Bash tool `node -v`/`ls`/`find` in Lantern | **Environment failure**, unrelated to the audit: the Bash (Git Bash) shell in this sandbox errors with `We can't find the necessary environment variables to replace the Node version` (an `fnm` shell-hook issue) on some invocations; PowerShell was used instead for all Node/npm/test commands, and it worked without issue | Recorded for completeness — this is a shell-tooling artifact of the sandbox, not a Lantern defect |

Full `npm test` output:
```
> rpg-mcp-live@0.1.0 test
> vitest run --pool=forks

 RUN  v1.6.1 F:/Github/rpg mcp live

 ✓ src/game.test.ts  (4 tests) 18ms
 ✓ src/ai-contracts.test.ts  (2 tests) 14ms
 ✓ src/openrouter.test.ts  (2 tests) 10ms
 ✓ src/store.test.ts  (4 tests) 700ms
 ✓ src/content/rules-kernel.test.ts  (2 tests) 620ms
 ✓ src/content/effect-compiler.test.ts  (1 test) 886ms
 ✓ src/engine-dm.test.ts  (2 tests) 599ms
 ✓ src/content/installed-open5e-pack.test.ts  (9 tests) 1356ms
 ✓ src/content/open5e-import.test.ts  (10 tests) 1400ms
 ✓ src/content/legacy-repin.test.ts  (4 tests) 1952ms
 ✓ src/engine.test.ts  (29 tests) 3625ms
 ✓ src/content/corpus-pack.test.ts  (3 tests) 4651ms
 ✓ src/content/repin.test.ts  (4 tests) 4168ms
 ✓ src/content/pack.test.ts  (7 tests) 10019ms

 Test Files  14 passed (14)
      Tests  83 passed (83)
```

### What the tests in `src/engine.test.ts` actually prove (29 tests total; the action-economy/spatial-relevant subset)

| Test (line) | What it proves | What it does NOT prove |
|---|---|---|
| `enforces combat turn ownership and atomic consumable effects` (`:377`) | Off-turn `combat_action` is rejected with unchanged version; `use_item` atomically heals and removes the consumed item in one commit | Does not test Bonus Action, Reaction, movement, Dash/Ready/Help, or multi-creature initiative order |
| `replays a command without rerolling and rejects stale writes` (`:271`) | Idempotent replay (no re-roll) and version-conflict rejection on stale `expectedCampaignVersion` | Does not test duplicate submission under a *new* `clientCommandId` (expected to execute twice by design — see Section 5) |
| `rejects graph-invalid movement without changing state or version` (`:311`) | `move` to a nonexistent exit id is rejected, state/version unchanged | Does not test (and cannot test, because it doesn't exist) any spatial/geometric movement property — "movement" here is a scene-graph edge, not a coordinate |
| `stores pack-backed combatants, queues every foe, and rejects uncompiled creature actions` (`:441`) | Multiple enemies are queued in turn order; content-tier-insufficient creature actions are rejected without mutation | Does not test legendary/lair actions (content exists, execution does not) |
| `executes exact S7 multiattack as one authoritative creature turn` (`:549`) | Compiled multiattack resolves deterministically as one committed event | Only covers enemy-side compiled programs, not the player's hardcoded attack path |
| `applies, enforces, and expires a compiled condition duration` (`:707`) | Condition duration bookkeeping (apply/tick/expire) is correct and persisted | Does not test movement-based or reach-based condition triggers (none exist) |
| `uses persisted encounter distance and area geometry for spell range and affected targets` (`:1350`) | Spell "range"/"area" is a flat `distanceFeet` scalar compared to a flat range number; an out-of-range cast is rejected with state provably unchanged (`JSON.stringify` before/after equality check, `:1378-1389`) | Despite the test's name including "area geometry," no actual geometry (angle, shape, position) is tested or exists — this is exactly the "no exception ≠ correctness" trap the audit brief warns about: the test proves the *distance gate* works, not that any spatial/geometric reasoning occurs |
| `rejects an uncompiled spell without consuming its slot, action, target HP, or campaign version` (`:1312`) | Rejected spell cast leaves slot/action/HP/version untouched | Confirms the "rejected action spends nothing" invariant for a second command type beyond `move`/`combat_action` |

### Tests that exist but do not prove what their name might suggest

- `uses persisted encounter distance and area geometry for spell range and affected targets` (`:1350`) — as noted above, "area geometry" in this codebase means "compare a scalar to a scalar," not shape-aware area-of-effect. Anyone reading only the test name would over-credit the system with real geometric AoE.

### Tests NOT found (gaps in coverage, because the underlying feature doesn't exist)

Bonus Action restriction tests, Reaction consumption/reset tests, split-movement tests, Dash/Ready/Help mechanical-effect tests, opportunity-attack tests, any 3D/2D spatial test (position persistence, stairs/ladder, flying, swimming, body clearance, multi-cell collision, corner-cut prevention, diagonal cost, difficult terrain, forced movement, falling, jumping, teleport validation, 3D reach, 3D LOS, 3D area effects, stale-geometry detection), and noncombat activity-limit tests. None of these exist in `f:\Github\rpg mcp live\src\**\*.test.ts` — confirmed by the full `describe`/`it` listing of `src/engine.test.ts` (29 tests, enumerated above and in Section 3) and by the absence of any spatial/coordinate code for such tests to exercise.

---

## 7. Recommended next milestone

**Do not attempt the full "actor begins turn → moves along a validated 3D-aware ground route → attacks with server-derived stats → spends the Action → moves with remaining movement → triggers one authoritative Reaction → ends turn → persists and resumes identically" slice in one step.** Lantern currently has zero spatial substrate and a thin combat-action vocabulary; the reference engine has rich spatial/action code that is explicitly not to be imported wholesale (ADR-H13). The smallest trustworthy shared foundation is narrower than the full brief's vertical slice, and should be sequenced as two small milestones rather than one broad one:

**Milestone A — Fix and generalize the action-economy kernel Lantern already has (no spatial dependency):**
1. Replace the hardcoded STR/d8 player attack (`src/engine-domain.ts:1727-1738`) with derivation from the equipped `mainhand`/`offhand` item (damage die, properties, finesse ability choice, proficiency check against `character.proficiencies.weapons`), mirroring the pattern already proven correct for `deriveArmorClass`.
2. Add a real Bonus Action slot to `combat_action` (or a sibling command) independent of spell casting time, and at least one real consumer of it (even a single class feature) so `bonusActionUsed` is exercised outside `cast_spell`.
3. Add one real Reaction trigger independent of spell casting time — the cheapest is "opportunity attack on Disengage-less movement," but since there is no movement yet, an acceptable substitute is a Ready-style "reaction to an enemy's declared attack" using the existing turn-alternation model.
4. Give Dash and Disengage a mechanical effect once (2) exists to modify (Dash should double whatever movement value Milestone B introduces; Disengage should suppress whatever OA Milestone B introduces).

**Milestone B — Introduce the smallest real spatial substrate (after A, or in parallel by a different owner):**
1. Add a mandatory, integer, foot-denominated `{x, y}` (2D first — see Section 8 decision on whether z is MVP-required) position per combatant, replacing/augmenting the scalar `distanceFeet`.
2. Add a `movementRemaining` field to `EngineCombatant`/the player's combat state, reset at start of turn from `character.speed`/`combatant.speed`.
3. Implement one authoritative distance metric (Chebyshev, matching 5e's 5-10-5 rule, is the cheapest to make consistent with the reference engine's proven `getDistance`/A* pattern) used for **both** movement cost and spell range — replacing the current flat `distanceFeet` comparison.
4. A `move` (or new `combat_move`) command that validates remaining movement, updates position, and decrements `movementRemaining`, rejecting on insufficient budget with state unchanged (reusing the exact `rejection()`/`commit()` pattern already proven in Section 4).
5. One authoritative Reaction: an opportunity attack triggered when a path segment leaves a hardcoded "reach" distance of an enemy, using the enemy's already-correctly-derived `attack.toHit`/`attack.damage`.

**Acceptance criteria for "trustworthy shared foundation" (combining both milestones' minimum bar):**
- A turn cannot spend more than one Action, one Bonus Action, and one Reaction, each independently trackable and independently tested (unit tests mirroring `src/engine.test.ts:377-439`'s off-turn/atomic pattern).
- A rejected move/attack/reaction leaves position, movement remaining, and campaign version byte-for-byte unchanged (reuse the `JSON.stringify` before/after pattern from `src/engine.test.ts:1378-1389`).
- The player's own attack uses the same "one server-owned derivation function" pattern already proven for AC (`deriveArmorClass`) — no hardcoded ability score/die.
- Movement, range, and reach all read from the same distance metric and the same position representation — no second, competing "distanceFeet" abstraction left alive alongside real coordinates.
- Every new mutating command follows the existing `LanternEngineStore.executeCommand` transaction/idempotency contract without modification to that contract.

---

## 8. Blockers and decisions required (product-owner level)

1. **Is 2D sufficient for launch, or is z mandatory?** The current design doc (`docs/GDD.md:135`) explicitly excludes "a map renderer or 3D client" from scope. If that remains true, Milestone B above should stay 2D (`{x,y}` + abstracted "elevated"/"flying" flags) rather than building a 3D coordinate/volume system the reference engine has but Lantern's product scope may not need. This is a scope decision, not an engineering one.
2. **Distance metric and 5e-compatibility vs. pure Euclidean geometry.** The reference engine supports Euclidean/Manhattan/Chebyshev with a 5e "5-10-5" alternating diagonal option. Lantern needs one authoritative choice used everywhere (movement, spell range, reach) — mixing metrics (as the current flat-`distanceFeet` design implicitly does, since it has no geometry at all) is itself a source of "billed cost doesn't match derived cost" bugs.
3. **Typed action pools vs. a single generic "Action" resource.** Lantern's current model only meaningfully tracks one resource (the Action); Bonus Action/Reaction exist as flags gated solely by spell casting time. Decide whether to invest in a fully typed, data-declared action-pool system (traits/costs/prerequisites as data, closer to what Part A1 describes as the ideal) or to keep hardcoding each new action type in TypeScript as done today — the latter is faster short-term but is exactly what produced the hardcoded-attack defect in Section 1.
4. **Explicit end-turn policy.** `resolveAdvanceTurn` currently advances turn order automatically after most actions (e.g., after an attack resolves, `activeActorId` moves to the next combatant) rather than requiring an explicit "end turn" command from the player when they still have unspent resources (e.g., unused Bonus Action or, once it exists, movement). Decide whether a player should be able to end their turn early with resources unspent, or whether the system should always auto-advance once the Action is spent — this materially affects Milestone A's Bonus-Action design.
5. **Optional-reaction UX.** Once a real Reaction exists (Milestone A/B), decide whether the engine will actually pause resolution mid-movement/mid-turn to offer an optional reaction (real "pause and resume," as the audit brief asks about) or whether reactions will be resolved deterministically/automatically without a UX pause. This is a substantial architecture decision — pausing implies a new "awaiting reaction" campaign state and a new class of partially-resolved, resumable event, which does not exist anywhere in the current `EngineResolution`/`EngineEvent` model.
6. **How much noncombat structure belongs in MVP.** The current design (`docs/GDD.md:71`) treats movement/combat/inventory/quests/rest/death-saves/loot/context/NPCs/merchants/beats/notes as "separate engine capabilities the DM composes," i.e., noncombat structure is intentionally left to LLM-DM composition rather than engine-enforced economy. Decide whether that remains the product bet (in which case Part A3's "noncombat economy" gaps are working as intended, not defects) or whether structured downtime/travel/exploration mechanics are now in scope.

---

## 9. Machine-readable JSON appendix

```json
{
  "actionEconomy": {
    "overallStatus": "LANTERN_PARTIAL",
    "implemented": [
      "command schema validation (engineCommandSchema, 30 kinds)",
      "turn ownership enforcement (off-turn rejection)",
      "post-encounter rejection",
      "one Action per turn",
      "atomic transactional commit (SQLite, single transaction)",
      "idempotent replay via clientCommandId",
      "expectedCampaignVersion optimistic concurrency",
      "death saves",
      "concentration checks",
      "armor class canonical derivation",
      "enemy attack canonical derivation (compiled content)",
      "rest (short/long) resource recovery",
      "cross-campaign/account storage isolation"
    ],
    "partial": [
      "bonus action (flag exists, only spell-casting-time gated, no combat_action path)",
      "reaction (flag exists, only spell-casting-time gated, no OA/Ready trigger)",
      "dodge (mechanically persisted); dash/disengage/help (narration only, no effect)",
      "legendary/lair actions (typed in content schema, never executed)"
    ],
    "referenceOnly": [
      "typed per-combatant EngineCombatant with movementRemaining/hasDashed/hasDisengaged (mnehmos.rpg.mcp src/engine/combat/engine.ts)",
      "legendary action / legendary resistance / lair action execution (mnehmos.rpg.mcp src/engine/combat/engine.ts)",
      "opportunity attack detection tied to movement (mnehmos.rpg.mcp, multiple files)"
    ],
    "absent": [
      "movement allowance / movement pool",
      "Ready action",
      "opportunity attacks",
      "structured noncombat action economy (exploration/search/travel/downtime/crafting/research/hazards)",
      "per-turn 'legal action offers' enumeration"
    ],
    "broken": [
      "player's own attack to-hit/damage is hardcoded to STR modifier + proficiency bonus and 1d8, ignoring the equipped weapon entirely (src/engine-domain.ts:1727-1738)"
    ],
    "highestRiskGaps": [
      "player attack derivation ignores equipped weapon (mechanically wrong results for any non-default loadout)",
      "no movement pool means Dash/Disengage/Help/Ready/opportunity attacks cannot exist even though Dodge does",
      "legendary/lair actions are imported as data but silently unexecutable, which will surface as confusing rejections mid-encounter for high-CR creatures",
      "no structured noncombat economy means 'who may act, when, at what cost' is entirely undefined outside combat"
    ]
  },
  "spatial3d": {
    "overallStatus": "ABSENT",
    "implemented": [],
    "partial": [
      "distanceFeet scalar per combatant used to gate spell range (not a coordinate system)"
    ],
    "referenceOnly": [
      "optional z on Point (mnehmos.rpg.mcp src/engine/spatial/engine.ts:3-7)",
      "euclidean/manhattan/chebyshev distance metrics (engine.ts:11,105-116)",
      "3D-capable A* with alternating 5-10-5 diagonal cost (engine.ts:317-460 region)",
      "line of sight (engine.ts:651, hasLineOfSight)",
      "2D footprint collision for multi-cell creatures (combat-grid.ts:182-280 region)"
    ],
    "absent": [
      "coordinate representation (x/y/z) of any kind",
      "navigation topology (surfaces/floors/stairs/doors/volumes)",
      "movement modes (walk/crawl/climb/swim/fly/hover/burrow/jump/fall/teleport/forced/carried/mounted/vehicle)",
      "pathfinding and distance metrics",
      "body/collision model",
      "support/gravity/falling/jumping",
      "reach/opportunity-attack geometry",
      "line of sight / line of effect / cover",
      "3D or 2D area-of-effect geometry (current spell 'area' is a flat scalar compare)",
      "movement economy integration pipeline"
    ],
    "broken": [],
    "highestRiskGaps": [
      "product scope explicitly excludes a 3D/map client today (docs/GDD.md:135), so this is a from-scratch decision point, not a bug backlog",
      "the existing distanceFeet abstraction and any future coordinate system will need an explicit migration/decommission plan so two competing distance models don't coexist"
    ]
  },
  "verification": {
    "commandsRun": [
      "npm run build (PowerShell, f:\\Github\\rpg mcp live) - PASSED",
      "npm test (PowerShell, vitest run --pool=forks, f:\\Github\\rpg mcp live) - PASSED, 14 files / 83 tests",
      "git log -1 (Lantern) - no commits yet",
      "git log -1 (reference engine) - HEAD 2a34f7f051efaa666cef46626ec850f7f191c051"
    ],
    "passingTests": [
      "src/engine.test.ts (29 tests)",
      "src/game.test.ts (4 tests)",
      "src/ai-contracts.test.ts (2 tests)",
      "src/openrouter.test.ts (2 tests)",
      "src/store.test.ts (4 tests)",
      "src/content/rules-kernel.test.ts (2 tests)",
      "src/content/effect-compiler.test.ts (1 test)",
      "src/engine-dm.test.ts (2 tests)",
      "src/content/installed-open5e-pack.test.ts (9 tests)",
      "src/content/open5e-import.test.ts (10 tests)",
      "src/content/legacy-repin.test.ts (4 tests)",
      "src/content/corpus-pack.test.ts (3 tests)",
      "src/content/repin.test.ts (4 tests)",
      "src/content/pack.test.ts (7 tests)"
    ],
    "failingTests": [],
    "unverifiedClaims": [
      "end-to-end Clerk-auth-to-engine-header binding (server.ts) was not traced in full depth; only storage-layer (account_id/campaign_id/actor_id) isolation was confirmed",
      "EngineSessionView.availableActions population logic was not traced to its producer(s); unclear whether it reflects live per-turn legality",
      "exhaustive correctness of every derived stat (saving throws, spell attack modifier, spell save DC) was not independently re-derived line-by-line; the single-owned-function pattern was confirmed structurally, not exhaustively"
    ]
  },
  "recommendedNextMilestone": {
    "name": "Fix player attack derivation and add a real Bonus Action + Reaction to the existing combat kernel (Milestone A); defer any spatial substrate to a follow-on Milestone B",
    "acceptanceCriteria": [
      "Player attack to-hit and damage are derived from the equipped weapon (mainhand/offhand item, its damage die/properties, proficiency check) via one server-owned function, mirroring deriveArmorClass",
      "combat_action (or a new sibling command) supports a Bonus Action independent of spell casting time, with at least one real consumer",
      "A real Reaction trigger exists independent of spell casting time (minimum: a Ready-style reaction to a declared enemy action)",
      "Dash and Disengage have a measurable mechanical effect once any movement/OA concept exists",
      "A rejected action of every new kind leaves state byte-for-byte unchanged, proven by a JSON.stringify before/after test in the style of src/engine.test.ts:1378-1389",
      "All new mutating commands go through the existing LanternEngineStore.executeCommand transactional/idempotent contract unmodified"
    ]
  }
}
```
