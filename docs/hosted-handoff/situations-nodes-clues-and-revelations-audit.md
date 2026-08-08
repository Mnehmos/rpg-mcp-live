# Audit: Situations, Nodes, Clues, and Revelation Architecture for Open-Ended Play

Scope: **read-only audit** for GitHub issue `Mnehmos/rpg-mcp-live#19` `[P1][Scenario] Situation, node, clue, and revelation architecture for open-ended play`. No code modified; no implementation.
Repo: Lantern (`F:\Github\rpg mcp live`), branch `main` (untracked working tree). Build PASS; tests PASS 86/86. Date: 2026-08-07.
Parent: #1.

Status vocabulary: `LANTERN_IMPLEMENTED` · `LANTERN_PARTIAL` · `LANTERN_STUB` · `CONTENT_ONLY` · `REFERENCE_ONLY` · `ABSENT` · `BROKEN` · `UNKNOWN`.

> **Bottom line.** Lantern stores **one current scene** (`worldContext`: title/description/exits/features/NPCs/merchants) that the DM replaces wholesale on travel, plus **flat quests** (one free-text objective), **NPC goals as prose**, and a **`campaign_beat`** (title/description/pressure/choices). There is **no situation model, no stable node graph, no clue/secret/revelation typing, no redundant clue paths, no pressure clocks, no default-when-ignored developments, and no outcome predicates.** Two facts cut both ways: (1) the engine is **already non-linear by absence** — nothing encodes a required next step, so no hook is strictly blocking; but (2) it is **also non-structured** — a failed check is simply *inert* (writes `lastRoll`, no consequence, no alternate path), and ignored threats **never advance** (no time #12, no off-screen #14, no clock). Open-ended play "works" only because the DM improvises everything in real time; there is no authored situation architecture to be robust against.

---

## 1. Method and verification

Code inspected (`file:line`): `src/engine-contracts.ts` (`EngineWorldContext` `:581-589` incl. `exits[{id,label}]`, `EngineNpc.goals:string[]` `:596`, `EngineQuest` `:937-947`, `EngineCampaignBeat` `:961-968`, `LanternCampaignState.worldContext/currentBeat/quests/improvEffects` `:988,993-995`), `src/engine-domain.ts` (`resolveWorldContext` replaces `worldContext`, `resolveCampaignBeat` sets `currentBeat`, `resolveQuestCreate/Update` `:697-754`, `resolveCheck` writes only `lastRoll` `:1086`, `resolveImprovise` `:762-799`), `src/engine-dm.ts` (DM authors situations freely `:279`). Grep for `clue|revelation|node|situation|pressure|clock|secret|discovery|alternate` across `src` finds **no** situation architecture (only `currentBeat.pressure` prose and `improvise` `effectType` tokens). Tests: none. Observed fact unless labeled inference.

## 2. Current state by the issue's "Audit first" checklist

| Checklist item | Status | Evidence |
| --- | --- | --- |
| World contexts, scenes, exits, NPC goals, quests, clues, secrets, campaign beats | `LANTERN_PARTIAL` | `worldContext` (scene + `exits[{id,label}]` + `features[]` + NPCs/merchants, `engine-contracts.ts:581-589`); `EngineNpc.goals` prose (`:596`); flat `EngineQuest` (`:937-947`); `EngineCampaignBeat` (`:961-968`). **No clue/secret/revelation entities.** |
| Whether adventures encode a required next step | No (by absence) | There is no step/sequence graph at all — nothing forces a next action. (This satisfies EPIC rule #9 trivially, but for the wrong reason: absence of structure, not authored multi-route design.) |
| How hidden facts become discovered | `ABSENT` | No hidden-fact or discovery model (see #7). NPC `memories`/`relationshipScore` and player notes are the closest, all prose. |
| Whether a failed check can dead-end progress | No — but it's inert | A failed `roll_check` writes only `lastRoll` (`engine-domain.ts:1086`) — it neither dead-ends *nor* produces a complication/alternate path. There is no "fail-forward." |
| How ignored threats or opportunities advance | `ABSENT` | Nothing advances autonomously: no game time (#12), no off-screen NPC agency (#14), no pressure clock. `currentBeat.pressure` is static prose until the DM replaces it. |
| Whether locations/nodes have stable identity | `LANTERN_PARTIAL` | `worldContext.id` + `exits[{id,label}]` exist (`:582,585`), but `worldContext` is **replaced wholesale on travel** — there is no persistent node graph or stable cross-scene location identity to revisit. |
| What the DM can invent or mutate directly | **Broad** | `world_context` (replace the scene), `campaign_beat` (new pressure/choices), `quest_create/update`, `improvise` (authored effects), NPC authoring. The DM is the situation author; the engine stores, not structures. |
| How quest state, world truth, and transcript narration interact | `LANTERN_PARTIAL` | Quest state is a flat record mutated by the DM (`quest_update`); world truth is the authored `worldContext`; narration is post-commit prose. They are **loosely coupled** — narration does not drive state, but neither do quests/world derive from typed predicates (see #15). |

## 3. The "robust by absence vs. robust by design" gap

The issue's goal — situations with redundant clue paths, fail-forward, multiple outcomes, and pressures that advance if ignored — requires **authored structure the engine currently lacks**. Today:
- **Redundant clues** cannot exist (no clue entity).
- **Fail-forward** cannot exist (failed checks are inert; #21).
- **Pressure-on-ignore** cannot exist (no clock; #12).
- **Multiple typed outcomes** cannot exist (no predicate model; #15/#19).

The engine's current "open-endedness" is **DM improvisation over a thin scene/quest/beat store**, not a resilient situation model. The issue is the right corrective: build typed situations so robustness does not depend on the DM remembering to offer an alternate clue.

## 4. First-slice feasibility (issue's KISS slice)

Issue slice: *three connected locations; three revelations; ≥3 independent clue links to the central revelation; one actor concealing truth; one pressure advancing if ignored; any visit order; one failed check → complication/alternate path (not dead-end); solve/expose/bargain/walk-away; coherent under every outcome.*

**What exists:** a persistent, versioned campaign record; `worldContext` + `exits` as a scene primitive; `campaign_beat.pressure` as a pressure *placeholder*; the transactional kernel; the #6/#21 check primitive (for clue attempts) and #7 knowledge model (for discovery) once those land.

**What must be built (all new):**
- A typed **`Situation`** model: stable ID + status; actor/faction/location/resource refs; active problems/opportunities; objective **truths/secrets**; **revelations + clue links**; **pressures/clocks** with default-when-ignored developments; terminal **predicates** + committed outcome; provenance.
- **Stable location/node identity** + a real traversal graph (replace the wholesale-`worldContext`-on-travel pattern for situation nodes).
- **Redundant clue paths** for essential revelations (no single failed roll blocks completion).
- **Fail-forward transition** for a clue attempt (via #21 outcome classes).
- **Discovery** actor-scoped through #7 (hidden facts never enter player-facing DM context early).
- **Pressure/default-development** advancement exactly once at a time boundary (via #12).
- **Multiple outcomes** derived from authoritative predicates (not narration).

## 5. Acceptance-criteria → current-state mapping

| AC | Met? | Note |
| --- | --- | --- |
| Situation stores forces in motion, not one mandatory next action | No | only currentBeat prose; no situation entity |
| Locations/actors/truths/secrets/clues/revelations/pressures have stable IDs | Partial | worldContext/exits have IDs; the rest absent |
| Central revelation has redundant independent clue paths; no single failed roll blocks | No | no clues |
| Discovery actor-scoped via #7; hidden facts never enter DM context early | No | #7 absent |
| Failed clue attempt follows #21 policy; changes situation without inventing the answer | No | #21 absent; failed checks inert |
| Ignoring advances one reviewed pressure/default exactly once at time boundary | No | no clock (#12) |
| Player may refuse hook and continue in a coherent world | Partial | no hook is forced (absence), but no structure guarantees a path forward |
| Multiple outcomes derived from authoritative predicates, not narration | No | no predicate model |
| LLM may frame/portray but cannot mark truths discovered/clocks advanced/outcomes complete | Partial | DM authors world truth/beat directly today — authority must narrow |
| Rejected transitions preserve situation/world state byte-for-byte | Yes (kernel) | inherited |
| Replay does not duplicate clues/discoveries/pressure advances/outcomes | Yes (kernel) | inherited, once they exist |
| Refresh/restart preserves every node/clue/discovery/pressure/outcome | Partial | worldContext/quests persist; nodes/clues new |
| Tests (out-of-order, failed clue, alternate clue, ignored hook, pressure advance, four outcomes, stale version, idempotency) | No | none exist |

## 6. Dependencies and risks

- **#6 + #21** supply checks/stakes/retry/fail-forward outcomes.
- **#7** supplies secrets, actor knowledge, discovery filtering.
- **#12** supplies authoritative time and pressure advancement.
- **#13/#14** supply faction and NPC consequences.
- **#15** may wrap a situation outcome in formal quest objectives/rewards (do not duplicate a quest engine — #15 stays the quest/reward owner).
- **#20** frames/paces the current scene within a situation.
- **Risk (duplication):** #19 must not become a second quest engine. Keep quests/rewards in #15; #19 owns truths/clues/revelations/pressures/outcomes. Agree the boundary before building.
- **Risk (authority):** the DM currently authors world truth/pressure directly (`world_context`/`campaign_beat`); #19 must move "truth discovered / clock advanced / outcome complete" from DM-authorable to engine-derived.
- **Risk (hidden leakage):** secrets must never reach the player-facing DM context before discovery — the #7 filter is a hard prerequisite; build it with or after #7.

## 7. Recommendation

Sequence per EPIC Phase 3: **#6/#7/#12/#13/#14/#15/#21 → #19**, then **#19 → #20**. Build the **typed `Situation` + stable node identity + redundant clue paths first** (the resilience core), with pressure advancement delegated to #12 and discovery/filtering to #7. Keep the clue-as-evidence-not-truth distinction explicit (a clue supports/raises a fact; it does not become world truth by being found). Do not implement a visual editor or procedural mystery logic — reviewed fixtures only (EPIC rule #8).
