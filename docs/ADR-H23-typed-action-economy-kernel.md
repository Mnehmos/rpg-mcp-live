# ADR-H23: Typed action-economy kernel, explicit end-turn, and persisted pending reactions

Status: Accepted; implementation pending
Date: 2026-08-07
See also: `docs/hosted-handoff/action-economy-and-spatial-design-intent.md` (Part 1 and Part 3) for the fuller research/checklist this ADR distills.

## Context

The action-economy and 3D-spatial audit (`docs/hosted-handoff/action-economy-and-spatial-audit.md`) found that Lantern's transactional foundation is sound — turn ownership, post-encounter rejection, one-Action-per-turn gating, idempotent replay, optimistic concurrency, and atomic state/event/result commit are all implemented and proven by tests (`src/engine-store.ts:346-427`, `src/engine-domain.ts:1679-1802`, `src/engine.test.ts:271-439`). But the combat vocabulary sitting on top of that foundation is too narrow to be "the action economy":

- `bonusActionUsed`/`reactionUsed` are booleans set only by spell casting-time checks (`src/engine-domain.ts:1381-1444`); nothing else ever spends or is gated by them.
- There is no movement budget, no Ready, no opportunity attacks, and no execution path for legendary/lair actions despite them being typed in content (`content/schema.ts:418-420`).
- `resolveAdvanceTurn` auto-advances the turn once the Action is spent, which is incompatible with a player having unspent Bonus Action or movement remaining.
- `EngineSessionView.availableActions` (`src/engine-contracts.ts:954`) exists but was not found to be populated from live turn-budget/legality state.
- The player's own attack is hardcoded to STR modifier + proficiency / `1d8 + STR`, ignoring the equipped weapon entirely (`src/engine-domain.ts:1727-1738`), while enemy attacks correctly use compiled, content-pinned stats (`:1903-1972`). This is a correctness defect in the one resource the kernel does track, and it blocks trusting the kernel for anything beyond a bare STR/d8 fighter.

The reference engine (`mnehmos.rpg.mcp`) has a richer typed combat-action model — `movementRemaining`, `actionUsed`, `bonusActionUsed`, `reactionUsed`, `hasDashed`, `hasDisengaged`, legendary/lair resources, death saves — but per ADR-H13 it is comparison material only and must not be imported wholesale; its raw schema also still accepts caller-supplied `attackBonus`/`dc`/`damage`, which Lantern must not reproduce.

## Decision

Extend the existing engine-command transaction (ADR-H11, ADR-H15) with a typed, per-turn action-economy kernel instead of ad hoc booleans:

1. **Typed budget pools, not one generic point total.** A combat turn tracks independent `action`, `bonusAction`, `reaction`, and `movementFeet` allowances (an optional `interaction` slot may follow later). Each is an `{ available, spent }` pair, reset at the rules-defined boundary (start of turn for action/bonus/movement; "until the start of the actor's next turn" for reaction). This profile is versioned as `srd-2014-single-actor` — Lantern's current one-PC-vs-enemy-queue combat shape — so a future typed profile (e.g. a fungible three-action pool) can be added without redefining the command/event contracts.
2. **Fix player weapon-attack derivation as part of this ADR, not deferred.** Add one canonical `deriveWeaponAttack()` function, following the same pattern already proven for `deriveArmorClass()` (`src/engine-domain.ts:3742-3762`): it reads the character's equipped weapon, ability (STR/DEX, with finesse handling), proficiency, and any active conditions/effects, and returns attack bonus, damage dice, damage type, and reach/range. `combat_action` accepts a target (and optional weapon selection); it never accepts caller-supplied `attackBonus`, `damage`, or `targetAc`. The kernel is not trustworthy while its own default attack path is wrong.
3. **Explicit `end_turn`.** `resolveAdvanceTurn` stops auto-advancing the moment the Action is spent. The turn advances only when the player calls `end_turn` or has no remaining legal offer (empty budget across action/bonus/reaction/movement and no eligible feature). This lets movement and Bonus Action be used before or after the Action, matching how the audit's Milestone A/B split expects the kernel to behave.
4. **Populate `availableActions` from live state.** The session view's legal-action list is computed from the actor's current budget and turn legality on every read, not left as a static/unpopulated field.
5. **Reactions are either resolved inline in the same atomic commit (mandatory effects, NPC-controlled reactions) or persisted as an explicit `pendingReaction` record when the choice belongs to the player.** A pending reaction pauses only that one decision — it is not a general pause-and-resume turn-plan mechanism. Nesting is bounded (no reaction may itself spawn another optional reaction in v1).
6. **Noncombat play stays freeform.** Single ad hoc checks (`roll_check`, `social_check`, `interact`) remain the noncombat surface. A structured noncombat economy (exploration, travel, downtime, projects) is out of scope for this ADR and should get its own decision once a specific mode demonstrates the same pressures combat has (sequencing, danger, time pressure, resource consumption, abuse via repetition) — see ADR-H24 for the parallel scoping decision on spatial structure.
7. **No schema break to the command transaction.** Every new command (`combat_action` variants, `end_turn`) is validated, resolved, and committed inside the same `LanternEngineStore.executeCommand` transaction (idempotency key, `expectedCampaignVersion`, atomic state+event+result write) already established by ADR-H11 and ADR-H15. This ADR changes what is inside a turn, not how a turn is committed.

The reference engine's typed combat-action fields are useful *evidence* that this shape works, but the implementation is written fresh for Lantern per ADR-H13 — its resolver is coupled to global state and its schema permits caller-supplied combat numbers, neither of which Lantern will reproduce.

## Consequences

- `EngineCombat`/`EngineCombatant` gain budget fields; existing tests that read `actionUsed`/`bonusActionUsed`/`reactionUsed` as booleans need updating to the `{available, spent}` shape or a compatibility accessor during the transition.
- The weapon-attack fix is a prerequisite, not a follow-up: any new Bonus Action or Reaction feature built on top of a wrong attack derivation would just add more surface area to an already-incorrect number.
- `end_turn` becoming explicit means DM/LLM turn plans must call it deliberately; a turn that spends only the Action and stops will sit "open" until `end_turn` is called, which the DM prompt/tooling layer needs to account for.
- The first real Bonus Action and Reaction should be single, mechanically meaningful features (e.g., a resource-limited Bonus Action heal, a reaction to an incoming hit) rather than synthetic test-only actions, so the budget/legality/persistence machinery is proven against a real rule, not a placeholder.
- This ADR does not introduce movement itself (no coordinates exist yet); `movementFeet` is tracked as a budget number only. Spending it against real positions is ADR-H24's concern.

## Rejected alternatives

- **One generic action-point pool for all actions:** rejected. It doesn't match the SRD-2014 profile Lantern currently targets (distinct Action/Bonus Action/Reaction/Movement with different reset rules) and would need to be redone anyway when noncombat or an alternate ruleset profile is added.
- **Importing the reference engine's `EngineCombatant` action fields and resolver wholesale:** rejected per ADR-H13; its resolver is coupled to global state and its schema accepts caller-supplied combat numbers.
- **Deferring the weapon-attack fix to a later milestone:** rejected. Building typed Bonus Action/Reaction features on top of a known-wrong attack derivation would compound the defect rather than isolate it.
- **General pause-and-resume for every reaction, including mandatory/NPC ones:** rejected as unnecessary complexity for v1 — only reactions that require a *player* decision pause; deterministic/mandatory effects resolve inline within the existing atomic commit.
- **Building a structured noncombat action economy now:** rejected as premature; no product pressure for it has been demonstrated yet, and doing so speculatively risks the same "combat-shaped meter forced onto a tavern conversation" failure mode the research explicitly warns against.
