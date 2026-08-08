# ADR-H26: DM production room and public narration boundary

Status: Accepted
Date: 2026-08-08

## Context

Lantern's current DM adapter already keeps mechanics in the private engine and
uses ADR-H15 to stage several accepted effects before one atomic campaign
commit. It still runs planning, tool use, and final prose in one completed
OpenRouter loop, stores no private run trace, and publishes a small narration
envelope without a scene/revision/reference release gate. That shape cannot
prove that a hidden clue, a stale scene, a rejected draft, or a raw provider
fragment stayed backstage.

Issue #24 introduces a Clio-inspired trust boundary for interactive scenes. It
adapts the pattern to Lantern's authoritative campaign engine; it does not
import Clio's civic registry, media, or source systems.

## Decision

### Separate completed runs

Every production-room turn uses separate completed private runs:

- `scene_build` (planner): reads the permitted private situation/profile
  inputs and proposes a `SceneBlueprintIR` into run-scoped draft state;
- `narration` (narrator): reads only the committed actor-safe snapshot,
  approved dialogue intent, and committed event evidence and proposes a
  `NarrationSequenceIR`;
- optional `scene_extension`, `intent_interpretation`, and `world_reaction`
  runs follow the same draft-only/private rules.

The same provider, model, or persona may serve both roles. Run IDs, prompts,
tool permissions, inputs, outputs, completion status, and hashes remain
separate. A planner never addresses the player; a narrator never receives
unreleased private truth or a campaign-mutating tool.

### Owned artifacts and revisions

The engine owns the following typed records:

- `DmRun`: kind, lifecycle status, account/campaign/actor, base campaign
  version, base scene revision, private/public event references, provider/model,
  token usage, latency, cost, output hash, idempotency key, and committed event
  IDs;
- `SceneBlueprintIR`: situation/location/mode/question, stable actor/object
  placement refs, exits, visible/hidden fact refs, clue/pressure/hazard
  bindings, affordances, optional encounter proposal, detail-promotion policy,
  source random-event ID, and base campaign version;
- `SceneSnapshot`: stable scene ID/revision, committed scene state, actor-safe
  projections, source run/blueprint hash, campaign version, and provenance;
- `NarrationSequenceIR`: scene/revision/event refs, ordered typed beats,
  public entity/fact/event refs, validated reveal requests, and interruptible
  playback boundaries.

The engine assigns stable IDs and increments scene revision on every committed
scene change. A blueprint or narration candidate whose base campaign version or
scene revision is no longer current is rejected as stale and cannot release.

### Tool permission matrix

Every model-facing tool registration declares:

```text
phase: private_planning | player_resolution | narration
visibility: private | public_result | engine_only
authority: read | propose | resolve
mutationScope: none | run_draft | campaign_transaction
```

The registry rejects any tool with both `authority = resolve` and
`mutationScope = campaign_transaction` when exposed to a model-facing private
planner or narrator. Planner tools may read approved inputs and write only the
current run draft. Narrators normally receive read-only projection tools;
engine-only resolvers are never model-callable. Player-resolution commands
remain engine-authoritative and use the ADR-H15 transaction.

### Commit-before-choice and anti-retcon

Before player input opens, the engine validates and commits every
consequence-bearing scene fact: actor/enemy presence, traps/hazards,
locks/open state, hidden clues/critical objects, exits/cover/interactables,
motives that affect a choice, encounter budgets, and pressure state. A
`SceneSnapshot` event is the boundary. Later changes require ordinary
authoritative commands/events; a planner, narrator, repair run, or player route
cannot move an ambush, relocate a clue, or mint a retroactive mechanic.

### Private trace and public release

Raw provider chunks, prompts, tool JSON, rejected drafts, repair logs,
hidden-fact refs, and private validation diagnostics remain private run data.
They are not copied into campaign log messages, public event payloads, browser
responses, TTS/captions, or recap/resume context. The first implementation may
retain bounded private traces for operational debugging, with an explicit
retention class and redacted account/campaign references; the public API exposes
only run status and released event IDs.

Public narration is released only after the completed `NarrationSequenceIR`
passes schema, stable-reference, actor-knowledge, profile, revision, and
mechanical-event checks. Every public mechanical claim points to a committed
event ID. Playback consumes the stored released beats sequentially; it never
consumes a live stream of provider tokens.

### Random-event authority

Random-event occurrence and table selection remain #12 engine transactions.
Planner input may contain a committed `sourceRandomEventId`, selected committed
entity/fact/situation/encounter IDs, public signs, and authorized pressure only.
It cannot call RNG, select an entry, reroll, or substitute an encounter. Repair
and narration inherit the same event ID and base revisions. A `triggered: false`
result cannot become a narrated event.

### Stale, replay, idempotency, and accounting

Run creation and candidate release use explicit idempotency keys. Duplicate
build/narration requests return the existing completed/released record without
another model call or campaign mutation. A stale candidate is retained as a
private rejected outcome for diagnostics but cannot commit or release. Reconnect
replays the released sequence and committed event refs without inference.

Each run records provider, model, request/response timestamps, latency, input,
cached, reasoning, and output token counts when supplied, plus bounded cost and
failure/fallback status. Missing provider usage is recorded as unavailable, not
invented. Accounting is per run, not inferred from campaign prose.

### Migration from the direct DM loop

The existing `LanternDungeonMaster` remains the compatibility entry point while
the production-room slice is introduced. Its atomic #15/#21/#23 engine commands
are reused as the only campaign mutation path. The migration wraps current
world/situation reads as planner input, validates a gatehouse blueprint into a
snapshot, then gives the narrator only the actor-safe snapshot and committed
result. Deterministic rules narration remains a safe failure path, but raw
provider text is not published by the new release gate. The old direct path is
removed only after replay, stale, privacy, and failure fixtures pass.

## Consequences

This adds run, draft, snapshot, sequence, and release metadata, but preserves
the existing campaign aggregate and atomic turn transaction. It makes privacy,
replay, and anti-retcon behavior inspectable and gives #22 a bounded production
room fixture. It also requires explicit migration work and may increase
latency/cost because planner and narrator are separate completed runs.

## Rejected alternatives

- One model loop for planning and narration: cannot prove context separation or
  prevent a rejected/private draft from reaching prose.
- Streaming raw prose to the UI and validating later: violates the public
  boundary and makes rollback impossible.
- Letting planner/narrator tools commit campaign state: duplicates or bypasses
  ADR-H15/#7/#19/#23 authority and breaks idempotent replay.
- Rebuilding a second situation, knowledge, quest, or object store: creates
  contradictory truth; the production room references existing engine state.
- Importing Clio's civic/source/media contracts wholesale: wrong product scope;
  only the private-run/validated-IR trust pattern is adopted.
