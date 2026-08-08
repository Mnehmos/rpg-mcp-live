# ADR-H26: Effects & Conditions Kernel

Status: Accepted
Date: 2026-08-08
See also: `docs/ADR-H25-magic-effects-kernel.md`, `docs/ADR-H11-campaign-command-lifecycle.md`, `docs/ADR-H15-atomic-multi-effect-turns.md`

## Context

Lantern had several authoritative condition writers and readers, but they did
not share one persisted representation. Dodge was a string marker, creature
conditions were only partially projected onto the player, and improvise could
claim a mechanical effect without a corresponding mutation. Duration and
source cleanup therefore depended on each caller remembering different rules.

## Decision

Add one persisted `EngineEffectInstance` list to campaign state. An instance
records its definition key, source and targets, typed operations, start anchor,
duration, stacking key/rule, clear policy, lifecycle status, and provenance.
Active effects are the authority; legacy `conditions` arrays remain derived
compatibility projections for clients and old saves.

The executable operation fence for this ADR is producer-gated: an operation is
admitted only when this slice ships both its resolver and a live producer. This
slice admits only:

- advantage/disadvantage for attack rolls, ability checks, and saving throws;
- apply/remove a reviewed condition marker;
- timed additive armor-class modifiers for reviewed reaction producers;
- duration and source-linked cleanup.

Timed additive AC modifiers are now admitted for the reviewed Shield producer
under ADR-H25; temporary HP, forced movement, summoning, spatial zones, and
arbitrary scripting remain rejected and out of scope. ADR-H25's conservative
spell-prose compilation fence remains in force; this ADR governs the shared
runtime substrate for all admitted operations.

## Runtime rules

- Same-source, same-target, same-stacking-key effects are deterministic: an
  `ignore` rule does not duplicate; `replace` marks the prior instance removed;
  `stack` is explicit.
- `queryModifiers(actorId, category)` is the only first-slice roll modifier
  query. Advantage and disadvantage cancel when both are present.
- Expiry marks an active instance `expired`; source cleanup marks dependents
  `removed`. Both operations are idempotent and are committed with their
  owning command.
- Rest uses `clearedBy` metadata, never a condition-name whitelist. Unrelated
  campaign records remain untouched.
- Unsupported effect attempts reject before commit, preserving version and
  authoritative state byte-for-byte.

## Consequences

The first live producers are Dodge, the bounded improvise advantage/
disadvantage and condition paths, and compiled creature condition programs.
Creature condition storage and reads use the same effect list as player
conditions. Existing `conditionEffects` records remain as a compatibility
projection for repeat-save/content metadata while the canonical effect list
owns active condition membership.

Future slices may add operations only with a real resolver, producer, and
focused rejection/idempotency tests in that slice.
