# Hosted handoff audit - scene pacing and session orchestration (#20)

Status: read-only audit gate; no production implementation in this change.
Date: 2026-08-08
Repository: `Mnehmos/rpg-mcp-live`
Base inspected: `origin/main` at `7c187db` (merged #24 production-room boundary)
Parent: #1

This audit reconciles issue #20 after #19 and #24 shipped. It records observed
runtime behavior and a bounded implementation plan. It does not authorize a
plot engine, hidden dice changes, private-trace access, or model work outside
the #24 release boundary.

## Evidence and current runtime

The inspection covered `src/engine-contracts.ts`, `src/engine-domain.ts`,
`src/engine-store.ts`, `src/engine-dm.ts`, `src/engine-server.ts`,
`src/engine-production-room.ts`, and their focused tests. The accepted
dependencies are represented by the following current contracts:

- #7 actor knowledge is filtered by `actorKnowledgeProjection`, situation
  projections omit hidden clue fact IDs, and `projectStateForActor` now removes
  private production-room state entirely.
- #12 owns time, scheduled events, and committed random-event resolutions in
  `state.time.randomEvents`. The orchestration layer has no RNG/table access.
- #18 owns the persisted `EngineExperienceProfile`; `projectExperienceProfile`
  is the presentation-safe view.
- #19 owns situation truth, clues, pressure, fallback, and outcome state. A
  situation carries a revision and optional `sourceRandomEventId`; its actor
  projection hides undiscovered facts.
- #24 owns `DmRun`, `SceneBlueprintIR`, `SceneSnapshot`,
  `ActorSceneProjection`, `NarrationSequenceIR`, release validation, ordered
  playback, and persisted private-room state. The engine/web routes expose an
  actor-safe projection and replayable released sequences.

The existing direct DM adapter still has a compatibility path:

- `buildDmContext` supplies `currentBeat`, `suggestedActions`, actor-safe
  world/situation context, profile data, and only the last twelve log entries.
- The model can currently propose `campaign_beat` and `world_context` through
  the legacy loop. Those commands can author pressure or replace context, so
  #20 must not use that loop as orchestration authority.
- Opening is a one-time DM operation. It is not a typed scene lifecycle and
  does not count no-change turns.

The authoritative store already supplies the foundations needed by #20:

- each committed command event has a monotonically increasing campaign version,
  `stateChanges`, command ID, and replay-safe persistence;
- expected-version checks and client-command IDs make stale and duplicate
  orchestration decisions reject or replay without a second commit;
- read-only results do not write campaign state;
- released #24 narration is persisted and can replay without another model
  request.

## Checklist status

| Issue #20 concern | Status | Observed evidence |
| --- | --- | --- |
| Stable scene identity/mode/purpose/status/revision | Partial | #24 has a stable snapshot ID/revision and mode, but campaign state has no general `SceneState` with purpose/status/transition reason. |
| Immediate question | Partial | #24 gatehouse snapshot has an immediate question; ordinary `currentBeat` has title/description/pressure/choices but no neutral question contract. |
| Opening and validated playback | Implemented for bounded slice | #24 commits a snapshot before input and releases ordered `NarrationSequenceIR` beats; #20 must consume this, not raw DM text. |
| Turns without authoritative change | Absent | Events expose `stateChanges`, but no consecutive no-change counter or scene-scoped derivation exists. Prose/log length is not authority. |
| Stall response | Absent | No orchestrator exists. Legacy `campaign_beat` can mint pressure, which is expressly forbidden for #20. |
| Existing pressure/clue/consequence eligibility | Partial | #19 situation pressure/clue/outcome and #12 due events exist; no separate eligibility record or bounded surface/clarify decision exists. |
| Scene transitions/resolution | Partial | Campaign phase and #19 situation outcomes exist; there is no versioned scene transition record with idempotency. |
| Recap and resume context | Absent | DM context uses recent log entries. No committed-event/public-fact recap distinguishes resolved facts from unresolved threads. |
| Character hooks | Absent | Character details and NPC goals are prose fields; no typed goal/person/place/debt/promise/enemy/mystery/belief/fear/temptation status/last-use state exists. |
| Preference-aware presentation | Implemented as input contract | #18 profile is persisted and projected; #20 must pass style/guidance to #24 narration without changing mechanics. |
| Random-event framing | Constrained dependency | #12 commits `RandomEventResolution` first. #20 may frame its authorized public projection once and may not roll, reroll, relocate, or turn quiet time into combat. |
| Private/public isolation | Implemented by dependency | #24 filters private runs, hidden facts, rejected drafts, and unreleased sequences; #20 must only consume its public projection. |
| Stale/replay/restart behavior | Implemented by dependency, missing orchestration records | Store and #24 provide the primitives; scene/recap/hook records still need to be persisted and replay-safe. |

## Boundary decisions

1. **Facilitation only.** An orchestration decision can select an existing
   authorized pressure, clue, consequence, committed due event, or a
   clarification. It cannot change HP, dice, resources, facts, discoveries,
   clocks, outcomes, or situation truth.
2. **No RNG in #20.** A random event is a valid input only after #12 commits
   it. A non-triggered/quiet result remains quiet. The selected event ID and
   released entity IDs are references, not invitations to reroll.
3. **Events, not prose, count stalls.** A turn counts as authoritative only
   when its committed event has a meaningful state-change delta for the active
   scene. A declaration with an empty delta can advance the no-change counter;
   the counter must not inspect narration wording.
4. **Model work remains #24 work.** A reframe request contains the current
   actor-safe scene projection, profile projection, authorized pressure/clue/
   consequence refs, and committed event IDs. It produces a draft and a
   validated released sequence through #24. #20 never reads private traces.
5. **Reframe is not forced choice.** The immediate question is a neutral
   framing of what is at stake. A surfaced pressure or clarification may offer
   meaningful options but may not encode one required answer.
6. **Recap is derived state.** Recaps contain only committed event refs,
   released public fact refs, resolved consequences, unresolved threads, and
   authorized hook refs. Raw model text and private notes are never recap
   input.

## KISS implementation plan after this gate

1. Add a compact typed `SceneState` to campaign persistence: stable ID and
   revision, mode/purpose, immediate question, situation/pressure refs,
   actors/viewpoint, tension band, no-change counter, opening/active/resolved
   status, transition reason, discovered/event refs, released sequence refs,
   recap/unresolved-thread refs, and hook refs.
2. Add pure event-derived stall accounting and an idempotent orchestration
   decision record. The decision can be `surface_existing`, `clarify`,
   `reframe`, or `transition`; it cannot carry a mechanic mutation.
3. Add an authorization selector that reads #12/#19 committed refs and
   rejects invented, hidden, stale, superseded, or already surfaced pressure/
   clue/consequence refs. Include the random-event ordering fixtures from the
   issue addendum.
4. Add scene transition and recap records. Build the compact recap from
   actor-safe event projections and released #24 beats; distinguish resolved
   facts from unresolved threads and preserve it across restart.
5. Add explicit character-hook records with status and last meaningful use.
   Hook resurfacing is eligibility metadata, never an automatic scene demand.
6. Add a resume projection containing current scene/question, known facts,
   active pressures, unresolved hooks, last released sequence, recap, profile
   presentation settings, and no private production-room fields.
7. Add focused #22-style tests for strong opening, three no-change turns,
   legitimate existing-pressure reframe, no-pressure clarification, no RNG,
   transition/replay/idempotency, recap filtering, hook eligibility,
   stale/restart behavior, preference-only presentation, and zero-model-call
   reconnect playback.

## Explicit deferrals

This gate does not implement a general story planner, predetermined plot,
screenwriting system, continuous/background inference, engagement optimization,
hidden dice manipulation, new threats, private trace access, or a replacement
for the legacy DM loop. Any direct-loop migration beyond the bounded
orchestration boundary is a follow-up issue.

## Verification boundary

This document is read-only evidence. Production implementation begins only on
a separate branch after this audit PR is accepted and merged. No DevWiki,
Railway, workflow dispatch, live OpenRouter call, or unrelated issue work is
authorized by this audit.
