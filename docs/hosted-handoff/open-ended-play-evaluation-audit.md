# Audit: Open-Ended-Play Evaluation — Gauntlet and Fun/Trust/Continuity/Cost Regression Harness

Scope: **read-only audit** for GitHub issue `Mnehmos/rpg-mcp-live#22` `[P1][Evaluation] Open-ended-play gauntlet and fun, trust, continuity, cost regression harness`. No code modified; no implementation.
Repo: Lantern (`F:\Github\rpg mcp live`), branch `main` (untracked working tree). Build PASS; tests PASS 86/86. Date: 2026-08-07.
Parent: #1. Cross-cutting from the beginning (EPIC: establish the deterministic baseline early).

Status vocabulary: `LANTERN_IMPLEMENTED` · `LANTERN_PARTIAL` · `LANTERN_STUB` · `CONTENT_ONLY` · `REFERENCE_ONLY` · `ABSENT` · `BROKEN` · `UNKNOWN`.

> **Bottom line.** Lantern has **mechanical-correctness and content-determinism tests, plus one HTTP integration smoke** — but **no open-ended-play evaluation harness.** There is no behavioral gauntlet, no replayable-RNG/model fixtures for playthroughs, no hidden-information leak test, no cost/latency/token telemetry, no human-review scorecard, no self-scoring guard, and no regression comparison. The single best news: `EngineEvent` already records **rich structured traces** (rolls, modifiers, `stateChanges` before/after, versions, content keys) for every committed turn — so the *evidence substrate* for a harness exists; only the harness is missing. #22 is explicitly allowed to **start immediately with current behavior** and grow alongside every subsystem (EPIC rule #12).

---

## 1. Method and verification

Commands/artifacts inspected: `npm test` (86 tests / 14 files, PASS), `npm run smoke:http` (`tools/s5-http-smoke.ts`, 376 lines — spins up engine+web in a temp dir with empty `OPENROUTER_API_KEY`), `package.json` scripts (`smoke:http`, `open5e:audit-migration`, `open5e:verify-pack`). Code (`file:line`): test files inventory (`engine.test.ts` 30, `engine-dm.test.ts` 3, `store.test.ts` 4, `game.test.ts` 4, `content/*` 45), `src/engine-contracts.ts` (`EngineEvent` structured evidence `:1002-1022`), `src/engine-dm.ts` / `src/openrouter.ts` (model fetch with `AbortSignal.timeout` `:554,108`; `max_tokens` `:548,102` — **no usage/cost/latency recorded**), `src/content/open5e-import.test.ts` (content-import `fixture.*` URLs — content fixtures, not playthroughs). Grep for `scorecard|benchmark|self.score|leak|telemetry|latency|prompt_tokens` across `src` finds **no** evaluation harness. Observed fact unless labeled inference.

## 2. Current state by the issue's "Audit first" checklist

| Checklist item | Status | Evidence |
| --- | --- | --- |
| Existing smoke tests, playtests, acceptance fixtures, model-evaluation scripts, telemetry | `LANTERN_PARTIAL` / `ABSENT` | HTTP smoke `tools/s5-http-smoke.ts`; 86 unit tests (mechanics + content determinism). **No playtests, no acceptance fixtures, no model-eval scripts, no telemetry.** |
| Replayable RNG / model fixtures | `LANTERN_PARTIAL` | `engine-dm.test.ts` mocks `fetch` with canned tool-call sequences (`engine-dm.test.ts:31,146,220`) — the closest thing to deterministic stubbed model output, but only 3 narrow scenarios. RNG itself is not seeded/replayable at the harness level (engine uses `randomInt` internally; idempotent *replay* of a stored command works, but generating a reproducible *new* run is not exposed). |
| Mechanical/narrative agreement checks | `ABSENT` | Nothing asserts "narration only states committed facts" or "no narration-only mechanics" across a run, though the DM prompt instructs it (`engine-dm.ts:296-297`). |
| Cost, latency, token, timeout, provider-failure recording | `ABSENT` | Model calls have a `AbortSignal.timeout` (`engine-dm.ts:554`, `openrouter.ts:108`) and `max_tokens` cap, but **no usage/tokens/cost/latency is recorded or surfaced.** Provider-failure handling exists functionally (timeout → error) but is not measured. |
| Hidden-information leak tests | `ABSENT` | No test asserts unrevealed facts stay out of the player-facing context (the model doesn't exist yet — see #7). |
| Campaign continuity and restart tests | `LANTERN_PARTIAL` | `store.test.ts` + `engine.test.ts:271` cover replay/idempotency and version conflict; the HTTP smoke restarts services. No long-gap "return after many sessions" continuity test. |
| Player feedback collection | `ABSENT` | No feedback contract (see #18). |
| Any self-scoring by the same model being evaluated | `ABSENT` (good) | No self-score exists — the issue's "same-DM-model self-score is not sufficient" guard is vacuously satisfied today; must be enforced when a scorecard is built. |
| Whether tests measure only correctness or also agency/clarity/pacing/discovery/trust | Correctness-only | Existing tests assert mechanics, content hashes, and idempotency — **none** measure agency/fairness/clarity/discovery/trust. |

## 3. The "evidence substrate exists, harness does not" opportunity

`EngineEvent` (`engine-contracts.ts:1002-1022`) records, per committed turn: tool, command, `effects`, `rolls`, `modifiers`, `outcome`, `stateChanges` (before/after), `previousVersion`/`version`, `rulesVersion`, `contentKeys`, timestamps. Combined with the player text and interpreted intent already in the turn loop, this is **exactly the structured trace** the issue's "Required evaluation layers" ask for. The harness's job is therefore mostly **collection + assertion + scorecard**, not new instrumentation — the per-turn evidence is already emitted and persisted.

## 4. First-slice feasibility (issue's KISS slice)

Issue slice: a **deterministic ten-scenario gauntlet** (ignore hook; creative environmental action; avoid combat by negotiation; fail essential clue; repeat identical search; change approach after failure; surrender instead of fight; probe hidden info; duplicate submission; model timeout after commit), each producing a structured trace + hard assertions + a small human-review scorecard.

**What exists and is directly reusable:** per-turn `EngineEvent` traces; idempotent replay + version-conflict machinery (proven by `engine.test.ts:271`); exactly-once reward/loot flags; content-tier honest rejection; the mocked-fetch pattern in `engine-dm.test.ts` as a template for deterministic stubbed model output; the HTTP smoke as a template for service-level runs.

**What must be built:**
- **Versioned scenario fixtures** (player text + expected intent + expected command families + invariants), runnable from one documented command.
- **Seeded/stubbed deterministic model outputs** for hard CI assertions (extend the `engine-dm.test.ts` mock-fetch pattern); **opt-in live-provider** runs recorded separately and cost-capped.
- **Trace collection** linking player text → interpreted intent → legal offers → commands → events → narration → state deltas → versions → latency/tokens/cost → final state (mine `EngineEvent`).
- **Hard invariant assertions**: state/version/idempotency correctness; no unauthorized hidden-fact disclosure; no narration-only mechanics; no duplicate rolls/costs/rewards/effects; valid continuity; deterministic replay; recovery after timeout/restart; token/cost/latency budgets.
- **Experience scorecard** (agency, fairness, clarity, discovery, character relevance, pacing, continuity, trust, next-affordance usefulness, boundary respect) — stored **separately** from mechanical pass/fail; human or independent review, never same-model self-score as sole evidence.
- **Baseline + regression comparison** across commits without silently changing inputs/rubric.
- **Failure categorization** linking to the owning subsystem issue (not normalized away).

## 5. Acceptance-criteria → current-state mapping

| AC | Met? | Note |
| --- | --- | --- |
| First ten scenarios versioned, reproducible, one documented command | No | none exist |
| Each scenario records player text, intent, commands/events, narration, state deltas, versions, latency, tokens, cost | Partial | events/state/versions recorded (`EngineEvent`); intent/narration/latency/tokens/cost not collected into a trace |
| Hard assertions fail on secret leak, duplicate mutation, narration-only mechanics, corruption, unrecoverable continuation | No | no such harness |
| Ignoring a hook leaves ≥1 coherent path + advances only authorized pressures | No | #19 absent |
| Creative intent resolves via existing primitives / bounded adjudication / clarification / honest impossibility — not fabricated effect | No | #21 absent; improvise is an open authoring channel |
| Failed clue resolution does not dead-end | No | #19/#21 absent |
| Repeated identical attempts follow retry policy; changed approach adjudicated distinctly | No | #6/#21 retry absent |
| Surrender produces typed continuation, not auto game-over | No | #11 absent |
| Duplicate command + post-commit timeout prove exactly-once | Partial | idempotent replay proven (`engine.test.ts:271`); not wrapped in a scenario |
| Human-review scorecard stored separately from mechanical results | No | absent |
| #18 preference/boundary compliance in ≥1 fixture | No | #18 absent |
| Baseline comparable across commits without silent input/rubric changes | No | absent |
| Failures create/reference owning subsystem issue, not normalized away | No | absent |
| CI deterministic; live-model opt-in and cost-capped | Partial | CI is unit/deterministic today; no live-model path to cap |

## 6. Dependencies and risks

- This harness **can begin immediately** with current behavior (EPIC) and grow alongside every issue.
- **#18** (preference/boundary assertions), **#19** (situation resilience/clue redundancy), **#20** (pacing/recap/continuity), **#21** (fair adjudication) each supply their own invariants/fixtures.
- **#2–#17** contribute focused fixtures and invariants.
- **Risk (subjectivity):** the scorecard must never override hard engine failures (EPIC delivery policy). Keep mechanical pass/fail and experience scores in **separate evidence layers**; never collapse them into one "fun" number (EPIC: do not optimize for compulsive engagement).
- **Risk (cost):** live paid model calls in every CI run is forbidden (EPIC). CI must use deterministic stubbed outputs; live runs are opt-in and cost-capped. Build the cost cap *with* the live path.
- **Risk (self-score):** the same DM model judging its own output is not sufficient evidence — use human review or an independent evaluator.
- **Risk (determinism):** to make scenarios reproducible, the harness needs **seeded/stubbed model output** and ideally **seeded RNG** for new runs (replay of *stored* commands is already deterministic). Confirm whether `randomInt` can be seeded for harness runs.

## 7. Recommendation

Sequence per EPIC: **start #22 now** (establish the deterministic baseline), audit #18/#21 alongside Phase 0. Build the **trace collector over `EngineEvent` + the ten-scenario deterministic gauntlet (stubbed model) + hard invariant assertions first** — this is high-value and mostly orchestration over evidence that already exists. Add the **separate experience scorecard** (never merged with mechanics) and the **opt-in cost-capped live path** next. Wire each subsystem's new invariants back into #22 as they land (EPIC rule #12: every major slice updates a #22 fixture). Keep the scorecard diagnostic (agency/fairness/clarity/continuity/trust), not an engagement target.
