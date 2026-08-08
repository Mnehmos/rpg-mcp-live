# Audit: World Time, Travel, Survival, Rests, Downtime, and Long-Term Projects

Scope: **read-only audit** for GitHub issue `Mnehmos/rpg-mcp-live#12` `[P2][Time] World clock, travel, survival, rests, downtime, and long-term projects`. No code modified; no implementation.
Repo: Lantern (`F:\Github\rpg mcp live`), branch `main` (untracked working tree). Build PASS; tests PASS 86/86. Date: 2026-08-07.
Parent: #1.

Status vocabulary: `LANTERN_IMPLEMENTED` · `LANTERN_PARTIAL` · `LANTERN_STUB` · `CONTENT_ONLY` · `REFERENCE_ONLY` · `ABSENT` · `BROKEN` · `UNKNOWN`.

> **Bottom line.** Lantern has **no game time whatsoever.** There is no campaign clock distinct from the wall-clock `updatedAt`; rest has **no duration or time requirement** (a long rest simply sets HP to max); there is no calendar, travel, pace, navigation, supplies, weather, watches, outside-combat durations, deadlines, or projects. Concrete consequences today: **rest is spammable** (no time cost), long-duration effects cannot expire outside combat, `EngineQuest.deadline` is a free-text string with **nothing to advance it**, and NPCs cannot act off-screen (#14). This issue is entirely greenfield and is a hard dependency for #13/#14/#15.

---

## 1. Method and verification

Code inspected (`file:line`): `src/engine-domain.ts` (`resolveRest` `:2843-2909` — no time gate; long rest sets HP=max `:2878-2889`), `src/engine-contracts.ts` (`EngineQuest.deadline?: string` `:946` — free text, no clock), `src/engine-store.ts` (`CampaignRow.updated_at` `:26` — wall-clock only), condition duration kinds `src/content/schema.ts:847-863` (combat turn-boundary only; minute/hour/day `fixed` durations exist as *data* but nothing advances them outside combat — see #2). Grep for `calendar|gameTime|game_time|day|hour|travel|pace|navigate|ration|weather|watch|downtime|project|deadline` across `src` finds **no** world-time model (hits are prose/labels only). Tests: none cover time. Observed fact unless labeled inference.

## 2. Current state by the issue's "Audit first" checklist

| Checklist item | Status | Evidence |
| --- | --- | --- |
| Campaign/world timestamps vs. wall-clock `updatedAt` | `ABSENT` (game time) | Only `CampaignRow.updated_at` (`engine-store.ts:26`) exists — a wall-clock write timestamp, not an in-fiction clock. No `gameTime`/`currentDay`/`currentHour` field on campaign state. |
| Rest duration and repeatability | `LANTERN_PARTIAL` | `resolveRest` `:2843-2909` enforces only `combat.status!=="active"` and `!dead` (`:2847-2848`); short rest requires a hit die / pact slot (`:2861-2862`); **no minimum elapsed time**. Long rest is freely repeatable → **rest-spam exploit.** |
| Scene / exploration turns | `ABSENT` | No exploration-turn or time-passage concept; exploration is narrative (`observe`/`interact`/`move`). |
| Travel distance and pace | `ABSENT` | No route/pace/distance model. |
| Navigation / getting lost | `ABSENT` | No navigation check (couples to #6). |
| Food, water, exhaustion, forced march, camping, watches | `ABSENT` | No supplies/resource tracking; no exhaustion (see #9). |
| Weather and light-source duration | `ABSENT` | No weather or light-source state. |
| Spell/condition duration outside combat | `ABSENT` (advance mechanism) | Duration *kinds* include `fixed` minute/hour/day (`schema.ts:849-853`) and `turn-boundary` (`:854-859`), but expiry is only evaluated at combat turn boundaries (`engine-domain.ts:2619-2694`). **Nothing advances minutes/hours/days outside combat**, so an out-of-combat `fixed` duration never expires. |
| Scheduled events and world/faction clocks | `ABSENT` | No scheduler; no faction/world clock (couples to #13/#14). |
| Crafting, research, training, spell copying, recuperation, downtime | `ABSENT` | No project/downtime model. |
| Progress / project state | `ABSENT` | — |

## 3. The rest-spam and deadline void

Two concrete, observable gaps:

1. **Rest has no time cost.** `resolveRest` requires no elapsed game time (`engine-domain.ts:2847-2856`); a player can long-rest back to full HP repeatedly between any two actions. Any combat balance assumption is therefore defeated by unlimited rests. #12 closes this by requiring authoritative time advancement before a rest.
2. **`EngineQuest.deadline` is unreachable.** The quest schema carries `deadline?: string` (`engine-contracts.ts:946`), but with no game clock nothing can evaluate or expire it. Deadlines are inert text until #12 exists — which in turn gates #15's deadline-processing AC.

## 4. First-slice feasibility (issue's KISS slice)

Issue slice: *one-day journey: choose pace → engine derives distance/time → navigate → consume food/water → assign a watch → one weather/event check → forced-march/navigation consequence → camp + long rest require sufficient elapsed time, interruptible → arrival advances a quest deadline and one NPC/world clock.* Then one downtime project.

**What exists:** transactional commit; #6 check primitive (for navigation/watches); #2 duration *kinds* (for outside-combat expiry); #8 supplies (once items exist). 

**What must be built (all new):**
- A **campaign game-time** field (calendar + current time) separate from `updatedAt`.
- A **deterministic time-advancement event** recording before/after time + reason.
- A **scheduled-effect/event queue** processing exactly once when a due boundary is crossed (closes the outside-combat-duration gap; reuses #2 duration kinds).
- A **travel plan** (route, pace, distance, roles, supplies, watches) with server-derived distance/time (not model-authored).
- **Survival resources** (rations/water) + exhaustion seam (#9).
- **Rest duration + interruption** state (closes rest-spam).
- A **project clock** (work units, cost, prerequisites, completion event) for one downtime activity.
- **Quest/NPC/world-clock integration points** (feeds #13/#14/#15).

## 5. Acceptance-criteria → current-state mapping

| AC | Met? | Note |
| --- | --- | --- |
| Game time explicit and separate from wall-clock | No | absent |
| Every time-advancing command records before/after time + reason | No | absent |
| Scheduled effects/events process exactly once at due boundary | No | queue absent |
| Rest requires correct elapsed time, paused in invalid states, interruptible | No | no time gate |
| Repeated rests cannot restore resources without time advance | No | **rest-spam** today |
| Travel distance derives from route/pace/time, not model numbers | No | absent |
| Navigation/pace/supplies/watches/weather/forced-march server-owned + #6 checks | No | absent |
| Food/water/ammo/light consumption atomic with travel time | No | absent |
| One outside-combat spell/condition duration expires correctly | No | no advance mechanism |
| One deadline or world/NPC clock advances on arrival | No | `deadline` inert |
| One downtime project persists progress/cost/elapsed/completion exactly once | No | absent |
| Rejected travel/rest/project commands preserve time + resources byte-for-byte | Yes (kernel) | inherited, once ops exist |
| Replay does not consume a day/ration/rest/project twice | Yes (kernel) | inherited |
| Refresh/restart preserves current time/route/interrupted rest/schedules/projects | No | none exist |
| Focused tests (pace, nav success/fail, supply shortage, rest interruption, deadline crossing, scheduled effect, project completion, stale version, idempotency) | No | none exist |

## 6. Dependencies and risks

- **#2** — duration/exhaustion effects; the outside-combat expiry queue reuses #2's duration kinds.
- **#6** — navigation, watch, crafting, research checks.
- **#8** — supplies and project materials.
- **#9** — exhaustion/disease/recovery.
- **#13/#14/#15** — consume the clock for social propagation, NPC schedules, and quest deadlines.
- **Risk (policy):** real-time background workers are **explicitly out of scope** (EPIC rule #8). Time must advance only on explicit commands — no timers, no cron, no autonomous ticks. This constrains the design to a "time-passes-when-you-do-X" model.
- **Risk:** the scheduled-effect queue must be **ordered and exactly-once**; replaying a time-advancing command must not re-fire past-due events. Reuse the idempotent command kernel.

## 7. Recommendation

Sequence: after **#2/#6/#8/#9** (EPIC guide `#2,#6,#8,#9 → #12`). Build the **game-clock + deterministic time-advance event first**, then the **scheduled-effect queue** (which simultaneously fixes outside-combat duration expiry and unblocks #2's `fixed` durations), then rest-duration gating (closes rest-spam). Travel and downtime come after the clock is trustworthy. Keep it strictly event-driven — no background workers.
