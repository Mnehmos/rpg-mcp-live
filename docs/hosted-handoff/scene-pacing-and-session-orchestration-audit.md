# Audit: Scene Pacing and Session Orchestration — Framing, Recaps, Hooks, and Continuity

Scope: **read-only audit** for GitHub issue `Mnehmos/rpg-mcp-live#20` `[P2][Orchestration] Scene framing, pacing, recaps, character hooks, and session continuity`. No code modified; no implementation.
Repo: Lantern (`F:\Github\rpg mcp live`), branch `main` (untracked working tree). Build PASS; tests PASS 86/86. Date: 2026-08-07.
Parent: #1.

Status vocabulary: `LANTERN_IMPLEMENTED` · `LANTERN_PARTIAL` · `LANTERN_STUB` · `CONTENT_ONLY` · `REFERENCE_ONLY` · `ABSENT` · `BROKEN` · `UNKNOWN`.

> **Bottom line.** Lantern's "orchestration" is a **three-phase lifecycle** (`character_creation → tutorial → sandbox`), a **proactive opening** authored once before play, a **`currentBeat`** (title/description/pressure/choices) the DM sets at will, and an LLM-authored **0–5 `suggestedActions`** invitation list. There is **no scene mode/purpose/status, no immediate-question field, no tension band, no stall detection, no structured recap (only the last 12 log messages), and no character-hook state.** The DM system prompt already encodes *pacing guidance as prose* ("end a quiet turn with a development/pressure/choice"), but **nothing is measured or state-driven.** #20 is a thin facilitation layer over committed state — greenfield, but with a strict non-requirement: it must **never choose outcomes, manipulate dice, or invent pressure that wasn't already authorized.**

---

## 1. Method and verification

Code inspected (`file:line`): `src/engine-contracts.ts` (`EngineCampaignPhase` `:169`, `EngineCampaignBeat` `:961-968`, `LanternCampaignState.phase/currentBeat/suggestedActions/log` `:985,995-997`, `EngineMessage` `:970-975`), `src/engine-domain.ts` (phase transitions `:904,1024`, `resolveCampaignBeat` sets `currentBeat`, `availableActions` is phase-only `:272-277`), `src/engine-dm.ts` (system-prompt pacing guidance `:281`, opening `:103-116`, final-response `suggestedActions` `:300`, user-message `recentLog = log.slice(-12)` `:323`), `src/engine-server.ts` (opening endpoint `:284,446`; one opening per campaign `opening_already_exists`). Grep for `recap|pacing|stall|tension|hook|immediate` across `src` finds **no** orchestration model (only prompt prose). Tests: `engine-dm.test.ts:146` (proactive opening). Observed fact unless labeled inference.

## 2. Current state by the issue's "Audit first" checklist

| Checklist item | Status | Evidence |
| --- | --- | --- |
| Scene identity, mode, status, purpose, transitions | `LANTERN_PARTIAL` | Only `phase` (character_creation/tutorial/sandbox, `engine-contracts.ts:169`) and `currentBeat` (a beat, not a scene). **No scene mode** (freeplay/exploration/social/encounter/travel/downtime), **no purpose** (decision/discovery/conflict/...), **no opening/active/resolved scene status.** |
| Current dramatic question / immediate decision | `ABSENT` | No immediate-question field. `currentBeat.choices[]` (`:966`) is the closest — DM-authored options, not a framed question. |
| Campaign beats and tutorial state | `LANTERN_IMPLEMENTED` | `EngineCampaignBeat` `:961-968`; `tutorialStep` advances through the tutorial chapter (`engine-domain.ts:1004-1048`). |
| Response-length and pacing guidance in the DM prompt | `LANTERN_PARTIAL` | System prompt instructs concise/immersive responses (`engine-dm.ts:298`) and proactive pacing (`:281`) — **prose guidance, not measured or enforced.** |
| Turns without state change | `ABSENT` | Not tracked. The kernel records state changes per event (`EngineEvent.stateChanges`), but **no counter** of consecutive no-state-change turns exists. |
| Opening scenes, recaps, and resume context | `LANTERN_PARTIAL` / `ABSENT` / `ABSENT` | Opening: proactive, one per campaign, persisted via `world_context` (`engine-dm.ts:103-116`; `engine-server.ts:284`). **Recap: ABSENT** — only `recentLog = log.slice(-12)` (`:323`) is passed as resume context; no structured recap distinguishing resolved facts from unresolved threads. |
| Character goals, bonds, hooks, unresolved threads, callbacks | `LANTERN_PARTIAL`(prose) / `ABSENT` | Character details (allies/bonds/flaws/backstory) are prose via `character_update` (`engine-tools.ts:587`); NPC `goals[]` are prose (`:596`). **No structured character-hook state** (goal/person/place/debt/promise/enemy/mystery/belief/fear/temptation with status/last-use). |
| Scene variety and encounter-length controls | `ABSENT` | No scene-type tracking; no variety/length controls. |
| Whether the DM can arbitrarily advance pressure or rewrite scene state | **Yes** | `campaign_beat` lets the DM introduce arbitrary `pressure`/`choices` (`engine-tools.ts:537`); `world_context` replaces the scene wholesale. The DM fully controls pacing/pressure — #20 must bound this to *surfacing already-authorized* pressures, not minting new ones. |

## 3. The "facilitation, not authorship" boundary

The issue's hardest constraint is a non-requirement: the orchestrator **must not** change dice/HP/resources/discoveries/clocks/outcomes, and **must not** generate arbitrary new threats to force progress (EPIC rules #8, #11). Lantern's current DM *already* advances pressure arbitrarily via `campaign_beat` — so #20's first job is to **constrain** that authority: stall-handling may surface only **existing authorized** pressures/clues/consequences (from #19/#12), or request a clarification. This is an authority-narrowing issue layered on a DM that currently improvises freely.

## 4. First-slice feasibility (issue's KISS slice)

Issue slice: *strong situation + clear immediate question → several meaningful decisions → three consecutive no-state-change turns → stall detected → one already-existing pressure/clue/consequence becomes eligible → DM reframes the question without forcing an answer → typed resolution/transition → compact recap records discoveries/consequences/hooks/unresolved pressures → next session resumes with a clear current situation.*

**What exists:** the proactive opening + `world_context`; `currentBeat`; `suggestedActions`; `recentLog`; per-event `stateChanges` (a basis for stall detection); the transactional kernel.

**What must be built (all new):**
- A compact **`SceneState`**: stable scene ID; mode; purpose; **immediate question**; active pressure/situation refs; active actors + viewpoint; tension band; **turns-without-state-change counter** (derived from committed events, not prose); opening/active/resolved status + transition reason; discovered-fact/meaningful-event refs; recap + unresolved-thread refs; character-hook refs.
- **Stall detection** from committed `stateChanges` (count consecutive turns with empty deltas).
- **Bounded pacing responses**: surface *existing* authorized pressures/clues/consequences, or a clarification — never new threats.
- **Typed scene transitions/resolutions** (versioned, idempotent).
- **Structured recap** assembled from committed events, distinguishing resolved facts from unresolved threads.
- **Character hooks** as explicit state (status, last meaningful use) — resurfacing must not force a hook into an inappropriate scene.
- **Resume context** from stored state (current situation + immediate question + known facts + active pressures + unresolved hooks), secret-filtered via #7.
- **Preference-aware presentation** via #18.

## 5. Acceptance-criteria → current-state mapping

| AC | Met? | Note |
| --- | --- | --- |
| Every active scene has stable mode/purpose/status/immediate question | No | only phase + currentBeat |
| Immediate question frames without encoding one required answer | No | absent |
| No-state-change turns counted from committed events, not prose | No | not tracked |
| Stall handling surfaces only existing authorized pressures/clues/consequences or clarification | No | DM mints pressure via campaign_beat today |
| Orchestrator cannot change dice/HP/resources/discoveries/clocks/outcomes directly | Vacuously yes | no orchestrator exists; must stay true when built |
| Scene transitions/resolution reasons explicit, versioned, idempotent | Partial | phase transitions are; scene transitions new |
| Recaps derived from committed events; distinguish resolved vs unresolved | No | only recentLog prose |
| Character hooks explicit state with status/last-use; resurfacing not forced | No | prose details only |
| Preference settings alter response style/guidance, not mechanics | No | #18 absent |
| Resume context: situation + question + known facts + active pressures + unresolved hooks, no secret leak | Partial | recentLog only; secrets unfiltered (#7) |
| Rejected/stale orchestration commands preserve scene/campaign state byte-for-byte | Yes (kernel) | inherited |
| Replay does not repeat transition/pressure-surfacing/hook-activation/recap | Yes (kernel) | inherited |
| Tests (strong start, stall detection, legitimate reframe, no-pressure clarification, transition, recap fidelity, hidden-fact filtering, refresh/restart, stale version, idempotency) | No | none exist |

## 6. Dependencies and risks

- **#7** actor-known facts and secret filtering (resume/recap must not leak secrets).
- **#12** time and scheduled pressures (the *authorized* pressures stall-handling may surface).
- **#18** player experience preferences (presentation/guidance).
- **#19** situation/clue/pressure/outcome references (the substance pacing acts on).
- **#22** evaluates pacing/clarity/agency/continuity.
- **Risk (scope creep into authorship):** the easiest failure mode is the orchestrator *inventing* pressure to "fix" a stall. Enforce: **only surface already-authorized state, or ask a clarification.** No new threats.
- **Risk (prose vs. state):** stall detection and recap must derive from **committed events** (`EngineEvent.stateChanges`), not LLM prose heuristics, or they will be unreliable.
- **Risk (secrets in recap):** a recap assembled from raw events can leak undiscovered facts; route recap through #7's knowledge filter.

## 7. Recommendation

Sequence per EPIC Phase 3: **#7/#12/#18/#19 → #20**. Build the **stall counter (from committed state changes) + bounded "surface-or-clarify" response + structured recap** first — these are the highest-value, lowest-authority-risk pieces. Keep the orchestrator strictly **facilitative**: it reads authorized state and frames; it never authors pressure, mutates mechanics, or forces an outcome. Derive recaps and resume context from committed events, filtered by #7, never from transcript summarization alone.
