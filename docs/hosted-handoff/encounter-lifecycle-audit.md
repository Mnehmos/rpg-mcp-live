# Audit: Encounter Lifecycle — Surprise, Initiative, Morale, Surrender, Retreat, Chases, Hazards, and Objectives

Scope: **read-only audit** for GitHub issue `Mnehmos/rpg-mcp-live#11` `[P1][Encounter] Surprise, initiative, morale, surrender, retreat, chases, hazards, and objectives`. No code modified; no implementation.
Repo: Lantern (`F:\Github\rpg mcp live`), branch `main` (untracked working tree). Build PASS; tests PASS 86/86. Date: 2026-08-07.
Parent: #1.

Status vocabulary: `LANTERN_IMPLEMENTED` · `LANTERN_PARTIAL` · `LANTERN_STUB` · `CONTENT_ONLY` · `REFERENCE_ONLY` · `ABSENT` · `BROKEN` · `UNKNOWN`.

> **Bottom line.** An "encounter" in Lantern is a flat `none → active → ended` shell: spawn creatures, alternate attacks until all enemies are dead, then loot once. There is **no surprise/detection, no rolled initiative (turn order is implicit player-then-enemies), no morale, no surrender/retreat/capture/nonlethal, no objectives beyond killing, no reinforcements/waves/hazards, and no distinct terminal outcomes.** Legendary/lair/mythic action data is imported but **structurally non-executable.** Almost the entire lifecycle the issue describes is greenfield; the only inherited assets are the combat-turn kernel, exactly-once loot, and content-tier honesty.

---

## 1. Method and verification

Code inspected (`file:line`): `src/engine-contracts.ts` (`EngineCombat` `:919-931`, `EngineCombatant` `:873-882`, `combat_action` enum `:455`), `src/engine-domain.ts` (`resolveCombatStart` `:1099-1144`, `resolveSpawnCreature` `:1146-1178`, `resolveCombatAction` `:1730-1810` incl. auto-advance `:1777,1781,1797`, `resolveAdvanceTurn` enemy turn `:1821+`, round rollover `:2026-2031`, encounter-end on all-dead `:1768-1769`, `resolveLoot` `:2777-2841`), `src/content/schema.ts` (legendary/lair `actionType` `:418,420`), `src/content/open5e-import.ts` (action compile filter `:3815`; non-executable legend `:4599,4482`), `src/engine-dm.ts` (legendary-rejection contract `:286`). Tests: `engine.test.ts:377` (turn ownership), `:441` (combatants/multiattack), `:549` (multiattack), `:597` (save/recharge), `:789` (spawn), `:829` (loot). Observed fact unless labeled inference.

## 2. Current state by the issue's "Audit first" checklist

| Checklist item | Status | Evidence |
| --- | --- | --- |
| Encounter creation/start/end state | `LANTERN_PARTIAL` | `EngineCombat.status: none|active|ended` (`:919-920`). `combat_start` wholly replaces `next.combat` (`:1118`), caps instances at 20 (`:1108-1110`), sets `active` (`:1118`). Ends when no enemy is alive → `status="ended"` (`:1768-1769`). **No pre-combat/resolving/escaped/negotiated states.** |
| Surprise and detection | `ABSENT` | No surprise round, no detection-to-combat transition (couples to #7). |
| Initiative and tie-breaking | `ABSENT` (as a roll) | Turn order is **implicit**: player acts, then enemies auto-advance (`activeActorId = firstLiveCombatantId`, `:1777,1781,1797`); `advance_turn` resolves the enemy turn and rejects on the player's own turn (`:1838`). **No initiative roll, no tie-break, no persisted order.** |
| Reinforcements / waves | `ABSENT` | `spawn_creature` adds to an *active* encounter (`:1146-1178`) but there is no wave/trigger model. |
| Morale, surrender, flee, capture, nonlethal damage | `ABSENT` | `combat_action` enum is `["attack","dodge","dash","disengage","help"]` (`:455`) — no surrender/flee/grapple/shove/nonlethal. No morale state. |
| Retreat and pursuit/chases | `ABSENT` | No retreat mechanic; `disengage` is narration-only (`:1792-1793`); no pursuit/chase. |
| Environmental hazards | `ABSENT` | No hazard entities or area-hazard resolution. |
| Encounter objectives other than killing | `ABSENT` | Win condition is "all enemies dead" (`:1768`); no protect/escape/hold/capture objective. |
| Active/ended/escaped/negotiated states | `LANTERN_PARTIAL` | Only `active`/`ended`. No escaped/negotiated/surrendered terminal. |
| Loot/XP/reward uniqueness | `LANTERN_IMPLEMENTED` | `lootClaimed` exactly-once (`:929,2782,2794`); reward accrual atomic (see progression audit). |
| Legendary/lair/mythic content vs. execution | `CONTENT_ONLY` | Action types `LEGENDARY_ACTION/LAIR_ACTION/MYTHIC_ACTION` imported (`schema.ts:418`); `legendaryActionCost` (`:420`). **Structurally non-executable**: compilation keeps only plain `ACTION`s (`open5e-import.ts:3815`); runtime rejects fragment/legendary timing with `content_tier_insufficient` (`engine-domain.ts:1897-1931,2107-2113`); DM contract states narrate no mechanical result (`engine-dm.ts:286`). |
| What the DM may author vs. what the engine derives | `LANTERN_PARTIAL` | DM authors creatures/counts/loot/XP; engine owns HP, AC, attacks, saves, slots, turn order, rewards. But engine derives **no** difficulty, no morale, no initiative. |

## 3. The implicit-initiative problem

There is no initiative roll and no persisted turn order — the engine hardcodes the player-acts-first-then-enemies loop. This blocks several issue ACs at once: surprise eligibility, deterministic initiative/tie handling, persisted-and-not-rerolled-on-retry initiative, and multi-actor initiative (needed by #16/#17). Initiative is therefore a **foundational new contract**, not an extension.

## 4. First-slice feasibility (issue's KISS slice)

Issue slice: *player approaches guards undetected → surprise from #7 → initiative starts once → one guard hits morale threshold after an ally falls → attempts surrender/retreat → player accepts surrender / pursues / captures / continues → encounter ends with a typed outcome → rewards/objectives resolve exactly once.*

**What exists:** combat-turn kernel (action/bonus/reaction budgets via #3), spawn, exactly-once loot/reward, creature stat blocks, content-tier honesty.

**What must be built:**
- **Pre-combat / active / resolving / terminal** encounter phase machine.
- **Surprise eligibility** derived from #7 perception/stealth, consumed once.
- **Server-rolled, deterministic, persisted initiative** (not rerolled on retry) — new contract.
- **Morale** threshold (server-owned; LLM cannot force surrender) for one reviewed fixture.
- **Surrender / retreat / pursuit / capture / nonlethal** as distinct state transitions.
- **Typed terminal outcomes** (kill/surrender/escape/capture/objective) with exactly-once rewards.
- **Opportunity attacks** via #10 path triggers + #3 reactions.
- **One hazard or reinforcement** trigger after the core lifecycle.

## 5. Acceptance-criteria → current-state mapping

| AC | Met? | Note |
| --- | --- | --- |
| Explicit pre-combat/active/resolving/terminal states | No | only active/ended |
| Surprise derived from #7, consumed once | No | absent |
| Initiative server-rolled, deterministic, persisted, not rerolled on retry | No | no initiative roll |
| Morale server-owned; LLM cannot force surrender/flee | No | absent |
| Surrender/retreat/capture/nonlethal distinct transitions | No | absent |
| Attacking a surrendered/incapacitated target follows explicit legality/consequence | No | absent |
| Retreat uses #10; opportunity attacks consume #3 Reaction once | No | absent |
| Objectives may succeed/fail without all enemies dying | No | win = all dead only |
| Terminal outcome immutable except via audited correction | Partial | `ended`+`lootClaimed` is immutable; richer outcomes new |
| Loot/XP/quest/reputation applied once by outcome | Partial | loot/XP once; reputation (#13) absent |
| Post-encounter attacks reject without mutation | Yes | `combat.status!=="active"` gating (e.g. `:2781`) |
| Refresh/restart preserves phase/initiative/morale/objectives/pending reactions/outcome | Partial | turn state persists; the new fields new |
| Focused tests (surprise, initiative replay, surrender accept/reject, retreat, capture, nonlethal, reward uniqueness, stale version, narration failure) | No | none exist |

## 6. Dependencies and risks

- **#3** (action/reaction/end-turn lifecycle; pending-reaction protocol for opportunity attacks).
- **#7** (detection/stealth/hidden knowledge → surprise).
- **#9** (dying/death/corpse transitions).
- **#10** (tactical movement + ordered path triggers → opportunity attacks, pursuit).
- **#15** (quest/objective consequences).
- **Risk:** initiative determinism across replay is subtle — the roll must be persisted and replayed identically; reuse the existing replay/idempotency kernel rather than a fresh random source.
- **Risk:** "attacking a surrendered target" needs an explicit moral/mechanical rule — a product decision (issue AC).

## 7. Recommendation

Sequence: **#3 → #10 → #11**, with **#7/#9/#10 → #11** (EPIC guide). Build the **encounter phase machine + server-rolled persisted initiative first** — it is the foundation every other encounter feature stacks on. Defer legendary/lair execution entirely (it remains honestly-rejected content). Treat morale/surrender as a reviewed server-owned fixture, never an LLM decision.
