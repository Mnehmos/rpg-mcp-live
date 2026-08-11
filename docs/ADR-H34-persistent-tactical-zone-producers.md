# ADR-H34: Persistent tactical zones as effect producers

Status: Accepted
Date: 2026-08-10

## Context

ADR-H26 owns Lantern's persisted effect instances, while ADR-H24 and ADR-H33
own the only tactical coordinate and area-membership rules. A spell area could
derive one immediate target set, but nothing persisted an area whose membership
changed as actors moved or rounds advanced. Adding an aura-specific effect or
map engine would split both authorities.

## Decision

The first persistent-zone slice stores zones inside the encounter's existing
tactical state and treats each zone only as a producer of ordinary
`EngineEffectInstance` records.

Two definitions are executable:

| Definition | Anchor | Circle | Duration | Existing effect operation |
| --- | --- | --- | --- | --- |
| `hindering-circle-v1` | stationary caller-selected center | 10 feet | 3 rounds | disadvantage on ability checks |
| `guiding-aura-v1` | current canonical player position | 10 feet | 3 rounds | advantage on ability checks |

The command supplies only the definition key, current geometry revision, and
the stationary center when required. Definition code owns the anchor mode,
shape, radius, duration, operation, stacking key, source, and action cost. It
accepts no target list, condition strength, AC/DC, damage, script, or arbitrary
source.

Circle cells use ADR-H33's bounded `five_e_simple` derivation. Membership is
then derived across the living player, living encounter combatants, and active
controlled actors. The source-following aura reads the player's canonical
position after each accepted command; it never accepts a position write.

Each zone persists stable identity, player source, anchor, circle, geometry
revision, round duration, current center, affected actor ids, active effect
ids, lifecycle status, revision, and creation provenance. Entering creates one
source-linked effect with a deterministic application id. Leaving marks that
effect removed. Re-entry creates a new historical application without
reviving or duplicating the old one. Expiry, source death, and encounter end
remove every active effect from that zone. A stale geometry revision or an
invalid persisted source, anchor, or shape rejects the owning command without
mutation. Reconciliation is idempotent.

Load normalization records malformed persisted zone authority as an integrity
issue instead of silently discarding it. Commands then fail closed before an
orphaned source-linked effect can influence another resolution.

Zone reconciliation enriches the same accepted command result before the
state and event are persisted. It does not increment campaign version again or
append a second event. A rejected command performs no reconciliation and
therefore remains byte-for-byte non-mutating.

## Consequences

The model may select one of two finite producers and, for the stationary one,
an in-bounds center. It cannot decide membership or mechanics. Actor-scoped
knowledge still governs narration; canonical geometry and effects exist
independently of whether the DM may disclose every affected actor.

This slice does not add arbitrary aura compilation, moving non-player sources,
hazard damage, concentration, elevation, overlapping-strength arithmetic,
prose triggers, or a second spatial/effect engine. Those require separately
reviewed definitions and resolvers.
