# ADR-H27: Pending milestone progression and reviewed NPC instances

Status: Accepted for issue #5's first vertical slice
Date: 2026-08-08

## Decision

Lantern uses an explicit, persisted milestone advancement policy for this slice:

- one server-owned pending transition, level 1 to level 2;
- maximum supported level 2;
- fixed/average hit-point gain (`max(1, ceil(hit die / 2) + Constitution modifier)`);
- confirmation is a separate command and callers cannot author derived values;
- confirmation refreshes supported spell slots to their new maxima, while the
  remaining character state is recalculated from the pinned class/content pack;
- formula revision `progression-v1` is persisted and used to repair derived HP
  state on load.

Quest completion is the unique milestone source. Reward and pending-preview
creation occur in the existing atomic command transaction; replay and
duplicate reward guards remain the source of exactly-once behavior.

NPC progression is not PC leveling. The only admitted instance template is
`veteran` v1. It applies reviewed HP, AC, attack, and damage deltas, records
before/after CR and XP plus command provenance, and leaves the pinned statblock
unchanged. A combatant can receive the template once.

## Scope seam

Subclasses, ASIs, feats, multiclassing, XP-threshold leveling, companions,
dynamic scaling, and additional NPC templates remain deferred. The persisted
policy and formula revision are the migration seams for a later progression
slice.
