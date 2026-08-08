# Hosted handoff audit — DM production room and narration IR (#24)

Status: complete read-only audit; implementation is intentionally deferred to a
follow-up after the dedicated ADR is accepted.

Date: 2026-08-08

## Scope and sources

This audit covers the hosted Lantern runtime on `origin/main` at the #19 merge
head. It inspected the current engine/web request path, the DM adapter, tool
catalogue, campaign store, projection/redaction helpers, atomic turn planner,
AI contracts, focused DM tests, and the accepted boundaries in:

- `docs/ADR-H12-llm-and-narration-boundary.md`;
- `docs/ADR-H15-atomic-multi-effect-turns.md`;
- `docs/ADR-H31-knowledge-projection-boundary.md`.

The Clio comparison was read from the referenced private `Mnehmos/clio`
`develop` revision. Its useful pattern is a private production room that
records private events, validates an intermediate representation, and releases
only typed public events. Its civic registry, source/citation, and media
contracts are not imported into Lantern.

## Observed runtime path

The public web service authenticates the user and proxies campaign reads,
commands, opening, and event reads to the private engine. The browser receives
JSON from `/api/session`, campaign endpoints, and command responses; it does
not call OpenRouter directly. The engine service owns the OpenRouter key and
constructs `LanternDungeonMaster`.

`LanternDungeonMaster.resolveTurn` and `startOpening` currently run one
`runToolLoop`. Each non-read tool call is parsed, resolved against a cloned
working state, and staged. `compileAtomicTurnResolution` then commits the
ordered accepted effects as one `turn_plan`, one event, and one campaign-version
increment through `LanternEngineStore`. This is the accepted ADR-H15 boundary.

The OpenRouter request is a completed, non-streaming chat-completion request.
The response is parsed as either tool calls or a final string/JSON narration.
There is no persisted planner run, narrator run, private event stream, raw
token trace, completed IR, scene snapshot, release gate, or playback cursor.
`parseNarration` validates only the small `NarrationEnvelope` shape; it does
not validate references to committed scene facts or events. The accepted
narration is written into the campaign log and stored command result by
`updateCommandNarration`.

Retries are bounded by a client-command idempotency row and the campaign
expected-version check. A resolved command is returned without a second model
call. A provider failure after a committed plan falls back to rules narration;
a failure before commit uses the deterministic fallback command. The 25-second
provider timeout is bounded, but the failure has no private run record or usage
ledger.

## Current authority and privacy findings

| Boundary | Observed current behavior | #24 consequence |
| --- | --- | --- |
| Tool authority | `lanternToolDefinitions` describes names and JSON arguments; mutability is inferred by `commandForTool`. There is no runtime phase/visibility/authority/mutation-scope registry. | A model-facing tool cannot currently be proven safe by a single forbidden-combination check. |
| Planner/narrator split | One model loop reads, proposes tool calls, receives tool results, and emits final prose. | Must become separate completed private planner and narrator runs, even when using the same model/persona. |
| Draft mutation | Staged effects mutate only a cloned working state until the atomic plan commits. | Reuse this transaction boundary for a run-scoped draft; no planner command may call a campaign transaction. |
| Hidden knowledge | #7 projection filters `worldFacts` and `actorKnowledge`, and situation context is actor-safe. However `projectStateForActor` does not yet replace the raw persisted `situation` with its actor-safe projection, and generic state/event payloads are not a SceneSnapshot contract. | Scene/narrator projections must be explicit and tested; do not rely on field-by-field redaction by accident. |
| Narration | Final text is persisted after mechanics and returned in the same command result. `NarrationEnvelope` has no scene revision, event refs, beat IDs, release status, or hidden-fact validator. | Introduce `NarrationSequenceIR` and release validation before public log/UI publication. |
| Public events | `engine_events` stores command/effect evidence; web campaign/event endpoints project selected fields. There is no public sequence stream separate from private command evidence. | Public playback must consume validated released beats, not raw model messages or private tool JSON. |
| Replay | Stored command results replay without another model call. | Preserve this invariant at run/sequence level; replay must not reroll or re-infer. |
| Stale work | Store rejects a stale campaign version. There is no scene revision or unreleased narration invalidation. | Add base campaign version plus scene revision to every build/narration run and discard stale candidates. |
| Cost/accounting | OpenRouter request metadata has model/reasoning/max tokens, but response usage, latency, provider outcome, and cost are not persisted per turn. | Add bounded usage accounting to each private run; never infer cost from prose. |
| Failure safety | Rules narration is deterministic and theme-filtered after provider failure. Plain final text is accepted as narration fallback. | Safe templates remain the fallback, but only validated public IR may release in the new path. |
| Random events | Travel resolves and persists `EngineRandomEventResolution` before returning. The DM context does not expose raw table rolls/weights; the production-room planner must receive only the committed result and actor-safe signs. | A blueprint may reference `sourceRandomEventId` and committed IDs only; it cannot roll or select an entry. |

## Ruined-gatehouse fixture boundary

The first implementation will use one reviewed gatehouse fixture, not a second
general world or situation engine. The engine-owned fixture will commit stable
IDs for the guard, chest, lever, exits, hidden clue, partial guard truth, and
pressure before any player-facing narration. A planner draft may choose an
active presentation and propose only bounded placements/extensions against
those references. The engine will reject unknown IDs, hidden facts outside the
planner scope, budget overflow, contradictory placements, and any change that
would move an already committed consequence-bearing detail after input opens.

The public projection will contain only the actor-safe gatehouse snapshot,
approved profile fields, committed event refs, and released public facts. The
guard's partial truth and chest clue remain withheld until #7 discovery records
authorize them. The broken lever, locked chest, exits, and pressure are
authoritative before narration and can change only through later engine events.

## Addendum: random-event ordering

The engine must commit a travel/watch/time random event first. A private
`SceneBuildRun` may then read the committed result and reference its event ID,
selected entity IDs, public signs, and authorized pressure. It may not reroll,
choose a different table entry, invent an encounter when `triggered` is false,
or expose table weights and hidden motives. Repair and narrator runs inherit the
same committed event and base revisions.

## Reconciled implementation plan

1. Land this audit and `ADR-H26-dm-production-room-and-public-narration-boundary.md`
   as a documentation gate. No production implementation belongs in that gate.
2. Add typed run records, private trace retention policy, phase/visibility/
   authority/mutation-scope tool metadata, and a draft-only tool router.
3. Add the reviewed gatehouse `SceneBlueprintIR`, atomic `SceneSnapshot`,
   actor-safe projection, and validation/release gates. Reuse #7/#19/#23
   references; do not duplicate their truth, situation, or object stores.
4. Add completed `NarrationSequenceIR` validation and sequential playback
   records. Persist the released sequence so reconnect is deterministic.
5. Migrate the current direct DM loop behind the new boundary with a bounded
   compatibility fallback; remove raw final-text publication only after the
   new release path proves equivalent behavior.
6. Add #22 fixtures for secret/raw-token isolation, forbidden tool authority,
   commit-before-input, stale invalidation, replay, duplicate runs, timeout,
   invalid refs, and benign-versus-retroactive detail promotion.

## Explicit deferrals

This audit does not add production code, expose chain-of-thought, create a
general scripting language, build a visual editor/VTT, or authorize Railway,
workflow dispatch, live OpenRouter, or a second situation/knowledge engine.

## Verification note

The first hosted CI run for this documentation gate passed typecheck, tests,
and build, then timed out in the unchanged two-service smoke while the engine
was starting. No audit or ADR path was exercised by that failure; the hosted
gate must still pass on the next exact head before this documentation gate is
accepted.
