# Reference Engine Boundary

Status: accepted boundary  
Date: 2026-08-06

## Purpose

F:\Github\mnehmos.rpg.mcp is the reference engine for Lantern. It tells the team what the game can feel like, which rules behaviors are worth preserving, and which edge cases must not be repeated. It is not the Lantern backend.

The relationship is:

~~~text
mnehmos.rpg.mcp
  REFERENCE ENGINE
        informs
Lantern Live Engine
  NEW PRODUCTION IMPLEMENTATION
~~~

## What may be reused

- Pure rules algorithms after they are isolated and independently tested.
- Behavioral examples and golden-path fixtures.
- Content shapes and import ideas derived from Open5e.
- Names and semantics that make the player experience coherent.
- Negative requirements discovered during playtesting.

## What must not be reused as production architecture

- Global current-session, current-world, or current-party state.
- A broad MCP surface that lets an agent mutate arbitrary game objects.
- Process-local state as the persistence model.
- Tool success or narration as proof that state changed.
- Caller-provided numerical overrides for player stats, HP, AC, attack, or damage.
- Reward, loot, harvest, or consumable paths that report success without atomic persistence.
- Implicit context inferred from a session identifier alone.

## Behavioral evidence from the reference playtest

The following observations are design evidence from the reference server, not a repair backlog for that repository:

- Normal character creation, movement, attack, death saves, rest, scene updates, and quest completion provide useful golden-path shapes.
- An off-turn combat action and an action after an encounter ended were accepted.
- Multiple action-like choices could be accepted in one turn without a clear action-economy check.
- A rejected movement could still expand persisted map bounds.
- Custom attack and damage overrides could bypass normal character math.
- Quest completion reported XP and gold, but later character/inventory reads did not show the reward.
- Loot and harvest could produce output without transferring the result into the expected inventory.
- A healing consumable could report use without changing HP.
- Direct movement between rooms was accepted even when the generated rooms were not linked.
- Context reads could expose stale or unrelated encounter/narrative state when context was not explicit.
- Some formatted output disagreed with structured values, including undefined labels and derived AC display.

These observations become Lantern acceptance tests and design constraints. They do not justify widening or repairing the old server for production.

## Golden-path fixtures

Lantern should port the smallest useful fixtures first:

1. A level-1 supported character with ordinary ability scores.
2. One goblin-equivalent opponent.
3. One ability check with a known modifier and DC.
4. One legal movement edge in a DM-authored world context.
5. One legal attack and damage result.
6. One healing consumable with an atomic effect and consumption.
7. One loot transfer.
8. One quest objective and atomic reward.
9. One rest operation.
10. Campaign refresh and resume with unchanged authoritative state.

The level-20 overpowered Mnehmos campaign is an administrator stress fixture. It is useful for limits, overflow, override rejection, and large-value tests; it is not ordinary MVP character creation.

## Porting rule

Before a reference behavior enters Lantern, write:

~~~text
behavioral example -> pure rule contract -> focused test -> Lantern service integration -> persisted event evidence
~~~

If the behavior cannot be expressed and tested without global context, first extract the rule or deliberately replace it with a narrower Lantern behavior.
