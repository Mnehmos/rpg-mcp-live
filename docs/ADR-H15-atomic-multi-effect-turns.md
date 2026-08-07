# ADR-H15: One atomic commit may contain multiple ordered turn effects

Status: Accepted; implementation pending  
Date: 2026-08-06

## Context

ADR-H12 originally limited a player turn to one mutating tool. Playtesting disproved that design. A normal Dungeon Master turn can introduce an NPC, attach that NPC to a faction or caravan, resolve a player interaction, transfer an item, update a quest, and advance a threat as one coherent consequence.

The current limit forces the model to choose between resolving the action and persisting the canon it creates. Narrated facts then survive only in a short chat window. This produced a concrete continuity failure: Narin was introduced as a caravan master in prose, fell outside the recent-log window, and was replaced by a newly invented caravan master.

## Decision

The invariant is one atomic commit per accepted player turn, not one mutation per tool loop.

The DM adapter may assemble an ordered `TurnPlan` containing multiple typed effects against one versioned working snapshot. The engine:

1. authenticates and loads the campaign once;
2. verifies one idempotency key and expected campaign version;
3. resolves read dependencies;
4. validates every proposed effect and all cross-effect references;
5. applies effects in order to an isolated working copy;
6. commits the complete state change and event evidence in one database transaction;
7. increments the campaign version once;
8. returns the committed plan for narration.

If any required effect fails, the whole plan fails and no effect is persisted. The event records each effect, roll, modifier, outcome, and state change. Deterministic ordering is mandatory; mutating effects are never applied concurrently.

Content authoring and mechanical resolution may therefore coexist in one turn. For example, one plan may create Narin, establish her as leader of a caravan, add the player as a member, resolve the agreement, and advance departure time.

## Consequences

The engine needs a plan schema, provisional tool results, an atomic plan executor, and campaign-level canonical entity storage. Existing primitive commands remain useful as effect types. The current `committed` guard in the DM loop is technical debt and must not be treated as the target contract.

World-context updates must become patches with explicit deletion semantics. Canonical NPCs, factions, parties, and locations need stable campaign-level IDs; a location references which entities are present rather than owning their only copies.

## Rejected alternatives

- One mutating tool per turn: loses ordinary multi-effect consequences and forces canon into prose.
- Independently committing each tool call: permits partial turns and multiple version increments.
- Increasing the recent chat window: delays continuity failures without making facts authoritative.
- Letting the model edit campaign JSON directly: bypasses schemas, rules, and event evidence.
