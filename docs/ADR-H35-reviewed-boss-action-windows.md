# ADR-H35: Reviewed boss actions use persisted initiative windows and distinct resources

Status: Accepted for issue #176 first slice
Date: 2026-08-11
Depends on: ADR-H18, ADR-H23, issues #2, #3, and #11

## Context

Lantern imports legendary, lair, and mythic action labels, but imported prose is not executable authority. Ordinary creature attacks and save/damage effects already have reviewed primitives, persisted initiative already orders an encounter, and the command store already provides atomic commit, optimistic concurrency, and idempotent replay. A second combat engine is unnecessary.

## Decision

The first boss slice is one fixed lifecycle profile: `adult-black-dragon-boss-v1`.

- The profile admits exactly one installed Adult Black Dragon.
- Encounter start verifies the exact `tail-attack` legendary source text and one-point cost, then binds it to the already compiled `tail` creature attack. A source or pack mismatch fails closed.
- The source owns three persisted legendary points, refreshed only when its ordinary turn begins. Reaction, ordinary Action, legendary, and lair resources remain separate.
- One Lantern-reviewed `Acid Geyser` lair action uses a Dexterity save against DC 15 and 2d6 acid damage, halved on success. It reuses the existing save, damage-roll, HP, concentration, dying, and death primitives.
- Initiative count 20 is persisted as an order index: after actors whose server-rolled total is greater than 20 and before totals of 20 or less. The engine opens the lair window only when authoritative initiative crosses that boundary.
- At the end of another actor's turn, the engine may queue a legendary window. If the same transition crosses initiative count 20, the lair window follows it. The pending queue and resume actor are persisted.
- `boss_action` accepts only the exact action ref and target from current server-derived `actionOffers`, or the exact pass ref. Every call rechecks profile, timing, source state, target, content binding, attack reach/cover, and remaining resource before one atomic commit.
- A Legendary Tail hit uses the existing incoming-hit reaction envelope. Its persisted resume record names the exact boss-window id, so Shield resolves before damage and the same legendary window completes exactly once afterward.
- An explicit nonlethal final strike ends the encounter as `subdued`, preserves unconscious state, and never rewrites the player's mercy choice as a kill.
- Campaign normalization revalidates the fixed roster, source combatant, initiative membership, and exact Tail binding before restoring boss timing after a restart.
- Passing a lair window spends that cycle's opportunity. Passing a legendary window spends no point, but closes that end-of-turn opportunity.

Mythic phases, arbitrary legendary catalogs, arbitrary lair authoring, extra boss creatures, and model-authored boss mechanics remain unsupported.

## Consequences

- The model receives a finite menu and cannot convert imported boss prose into mechanics.
- Invalid, stale, off-timing, insufficient-resource, out-of-reach, total-cover, incapacitated, dead-source, and terminal attempts mutate nothing.
- Command replay and process restart preserve the exact window, HP result, initiative cycle, and resource evidence.
- A future boss profile can reuse the window substrate only after its source bindings and lair program receive an independent review.

## Rejected alternatives

- **Execute every imported legendary/lair record:** rejected because most prose has no complete reviewed program.
- **Let the DM announce initiative timing or resource totals:** rejected because narration is not combat authority.
- **Treat legendary actions as reactions or ordinary Actions:** rejected because their resources and refresh boundaries differ.
- **Build mythic phases now:** rejected as unnecessary for the single vertical slice.
