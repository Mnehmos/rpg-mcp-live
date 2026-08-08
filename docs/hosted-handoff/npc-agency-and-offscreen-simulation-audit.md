# Audit: NPC Agency — Goals, Schedules, Resources, and Event-Driven Off-Screen Simulation

Scope: **read-only audit** for GitHub issue `Mnehmos/rpg-mcp-live#14` `[P2][NPC] Goals, schedules, resources, and event-driven off-screen agency`. No code modified; no implementation.
Repo: Lantern (`F:\Github\rpg mcp live`), branch `main` (untracked working tree). Build PASS; tests PASS 86/86. Date: 2026-08-07.
Parent: #1.

Status vocabulary: `LANTERN_IMPLEMENTED` · `LANTERN_PARTIAL` · `LANTERN_STUB` · `CONTENT_ONLY` · `REFERENCE_ONLY` · `ABSENT` · `BROKEN` · `UNKNOWN`.

> **Bottom line.** NPCs are **narrative-only**: an `EngineNpc` carries name/description/disposition/free-text `goals[]`/`socialDc`/`relationshipScore`/`memories[]` and **nothing else** — no HP, no inventory/wealth, no class/level, no location, no schedule, no resource budget, no legal-action menu. There is **no off-screen simulation, no NPC-as-actor invocation, and no model-usage accounting.** Critically, **this is the first issue in the plan that would invoke the LLM as an actor rather than a narrator**, which introduces budget/cost/timeout/circuit-breaker requirements no prior issue needs. The entire model is greenfield.

---

## 1. Method and verification

Code inspected (`file:line`): `src/engine-contracts.ts` (`EngineNpc` `:591-600`, `EngineWorldContext.npcs` `:587`), `src/engine-domain.ts` (`resolveSocialCheck` `:587-623`, `normalizeNpc` `:3913-3922`), `src/ai-contracts.ts` (`introduce_npc` narrative action `:56-57`), `src/engine-dm.ts` (DM loop; NPC not invoked as actor), `src/openrouter.ts` (model adapter). Grep for `schedule|offscreen|off_screen|npcTurn|npc_action|budget|circuit` across `src` finds **no** agency model. Tests: none. Observed fact unless labeled inference.

## 2. Current state by the issue's "Audit first" checklist

| Checklist item | Status | Evidence |
| --- | --- | --- |
| NPC identity, memory, goals, disposition, relationship state, location | `LANTERN_PARTIAL` | `EngineNpc` `engine-contracts.ts:591-600` has id/name/description/disposition(enumerator)/`goals:string[]`/socialDc/relationshipScore/`memories:string[]`. **No location field** — NPCs live inside `worldContext.npcs` (`:587`), not in a spatial scene (#10); **goals are free-text prose**, not structured/prioritized. |
| Resources, inventory, wealth, health, capabilities | `ABSENT` | NPC has no HP, no inventory, no currency, no class/level, no attacks. (NPC spellcasters, where they exist, are modeled as precompiled *creature* attacks — `EngineCombatantView` — not via the player spell system; see magic audit.) |
| Schedules and time awareness | `ABSENT` | No schedule; no game time (#12) to be aware of. |
| Off-screen actions or event processing | `ABSENT` | No tick; NPCs change only when a `social_check`/DM action touches them. |
| Plan / goal persistence | `ABSENT` | `goals[]` are prose; no plan/action state. |
| Flee, surrender, heal, recruit, report crime, trade, travel, learn, die behavior | `ABSENT` | None modeled (flee/surrender also absent in #11). |
| Agent/provider invocation and cost controls | `ABSENT` | No NPC model invocation exists; no budget/cost/timeout/circuit-breaker anywhere. |
| Whether NPC actions use the same domain services as player/DM actions | N/A | No NPC actions exist. |
| Whether NPC prompt context leaks hidden/player-only knowledge | `UNKNOWN`(risk) | No NPC prompt is built today; **when one is, it must filter to NPC-known facts only (#7).** This is the boundary hazard. |

## 3. The LLM-as-actor frontier

Every prior issue uses the LLM as a **narrator** (prose over committed state) or an **intent interpreter** (selecting among player-facing tools). #14 is the first that would have the **LLM choose actions for a non-player actor**. This demands infrastructure that does not exist: a per-invocation action/model budget, a timeout, a deterministic fallback on model failure, and an audit trail of usage/cost/latency. The issue's KISS policy ("no continuous autonomous loop"; "one major off-screen action per invocation"; "strict action/model budget") is the correct constraint — but the *accounting substrate* is new and must be scoped deliberately so #14 does not accidentally become a general agent framework (the issue explicitly forbids that).

## 4. First-slice feasibility (issue's KISS slice)

Issue slice: *one recurring merchant/guard with location, schedule, inventory/resource budget, goal, and knowledge → player creates a promise/crime/rumor → time advances → engine computes legal NPC action offers → model or deterministic policy selects one bounded action → engine validates and commits movement/report/trade/rest → NPC is found in the new state on return.*

**What exists:** transactional/idempotent commit; `social_check`/`memories`; the content pack (for a creature stat block if the NPC must fight). 

**What must be built (all new):**
- **NPC actor identity + type** with real state: current location (#10), schedule (#12), goals (structured, prioritized), resource budget + owned items/currency (#8), health/effects (#9), relationships/faction (#13), actor-scoped knowledge (#7).
- **Legal-action offers** with prerequisites/costs (finite enum per invocation).
- **Event-driven tick** at explicit boundaries only (time advance / scene enter-leave / witnessed event / quest-faction clock / NPC combat turn / operator batch).
- **Model invocation accounting**: budget, timeout, deterministic fallback, usage/cost/latency record.
- **Strict prompt/knowledge filtering** — NPC context contains only NPC-known/perceivable facts.
- **Shared domain-service execution** — NPC actions commit through the same transactional path as player actions.

## 5. Acceptance-criteria → current-state mapping

| AC | Met? | Note |
| --- | --- | --- |
| NPC actions only at explicit authoritative triggers | No | no triggers/tick |
| Each invocation: finite legal-action menu + strict action/model budget | No | absent |
| NPC location/schedule/goals/resources/health/relationships/knowledge explicit | No | only disposition/goals(prose)/relationshipScore/memories |
| Model selects offer + ordinary params; cannot mutate state or invent resources | No | no offers |
| NPC prompt contains only NPC-known/perceivable facts | No | no NPC prompt (boundary risk when built) |
| One off-screen action commits through same transactional/idempotent path | No | absent |
| Model failure uses deterministic no-op/fallback; cannot corrupt/partially apply | No | absent |
| NPC cannot spend resources it lacks / know hidden facts / teleport / act while dead | No | no resource/location/life state to enforce |
| Time/schedule transitions driven by #12 | No | no clock |
| Social/crime/faction responses read #13 not free-text memory | No | absent |
| Duplicate trigger processing does not repeat the action | Yes (kernel) | inherited, once triggers exist |
| Refresh/restart preserves schedule/pending plan/completed-action evidence | No | absent |
| Usage/cost/latency recorded for any NPC model invocation | No | no accounting |
| Tests (legal offers, hidden-knowledge filtering, resource rejection, model timeout, fallback, duplicate trigger, stale version, off-screen location change) | No | none exist |

## 6. Dependencies and risks

- **#7** (knowledge/perception — the prompt-filter boundary), **#8** (inventory/resources), **#9** (life-cycle), **#12** (time/schedules), **#13** (social/faction/crime). #15 quest/world clocks may later become triggers.
- **Risk (scope):** this is the easiest issue to over-build. Enforce the KISS constraints: one archetype, one major action per invocation, no continuous loop, no agent-framework rewrite.
- **Risk (cost):** unbounded model calls are a real cost/latency/stability hazard. The budget/timeout/fallback must be in the *first* sub-slice, not deferred.
- **Risk (boundary):** NPC prompt leakage of hidden/player-only facts would break stealth/mystery (#7). Co-design the NPC context filter with #7.

## 7. Recommendation

Sequence: **#7/#8/#9/#12/#13 → #14** (EPIC guide — the latest P2 dependency). Build the **accounting substrate + deterministic fallback first** (so a model failure can never corrupt state), then the **legal-action-offer enum + event-driven tick**, then one archetype. Keep NPC actions on the **same transactional domain path** as player actions — never a parallel mutation channel.
