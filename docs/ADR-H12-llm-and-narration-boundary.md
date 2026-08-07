# ADR-H12: Private engine tools; model proposes, engine commits

Status: Accepted; mutation cardinality amended by ADR-H15  
Date: 2026-08-06

## Context

OpenRouter is valuable for natural-language interpretation and Dungeon Master prose. It must not become the database, dice roller, entitlement checker, or unrestricted rules authority.

The product is action-based even though the player speaks naturally. The model therefore needs a complete but bounded tool facade, while the private Lantern engine remains the only authority that can commit a mechanical result.

## Decision

Run the OpenRouter adapter inside the private engine service. The web service forwards player text and explicit context; it does not hold the OpenRouter key or run the rules loop.

The request path is:

~~~text
player text
  -> public web authenticates and proxies
  -> private engine DM interpreter
  -> read tools as needed
  -> ordered typed turn plan
  -> one atomic authoritative commit
  -> persisted event
  -> private engine DM narrator
  -> web returns structured result and prose
~~~

The engine can publish tools such as observe, move, interact, roll_check, combat_action, advance_turn, death_save, inventory, use_item, quest_progress, loot, and rest. It can use multiple read tools and assemble multiple ordered effects, but one player turn produces one atomic commit and one campaign-version increment. ADR-H15 defines this amended transaction boundary.

The server owns:

- authentication context and campaign ownership;
- tenant and actor scope;
- dice, modifiers, DCs, combat legality, action economy, and resource changes;
- persisted facts and campaign versioning;
- subscription entitlements and usage limits on the web boundary;
- output escaping and browser rendering on the web boundary.

The model may provide prose, clarification questions, suggested actions, and proposed narrative facts. Proposed facts are advisory until a semantic engine validator accepts them.

## Consequences

The browser never receives provider secrets and cannot bypass the engine. The game can swap models or providers without changing rules. Model downtime degrades to deterministic rules narration instead of losing a player action.

OpenRouter tool calling follows the standard assistant-tool-result loop. Mutating effects are ordered and validated against one working snapshot; they are never applied concurrently.

The current adapter implements ADR-H15: it validates an ordered turn plan on one working snapshot and commits one event/version transition. The superseded one-mutating-tool guard is no longer part of the runtime.

## Rejected alternatives

- Letting the model write campaign JSON: not authoritative or auditable.
- Letting prose imply state change: impossible to verify reliably.
- Giving the model the old broad MCP surface: excessive mutation authority and implicit context.
- Rolling in the model prompt: nondeterministic and not transaction-safe.
- Holding OpenRouter on the public web service: expands the public secret boundary and couples UI traffic to model execution.
