# ADR-H33: Bounded tactical cover, areas, and movement reactions

Status: Accepted  
Date: 2026-08-10

## Context

ADR-H24 and issue #10 established Lantern's only tactical authority: one
frame-scoped `five_e_simple` grid with versioned geometry, footprints,
collision, path cost, and persisted movement plans. Cover, shaped areas, and
the already-detected leaving-reach boundaries were deliberately deferred.

## Decision

The first follow-up layer extends that authority instead of creating another
map or combat engine.

- Cover traces canonical blocking geometry from the best corner of the
  attacker's footprint to the four corners of the target footprint. Zero,
  one-to-two, three, or four blocked corners derive no, half, three-quarters,
  or total cover. Half and three-quarters cover add 2 or 5 to attack AC;
  total cover rejects before mutation. The same derivation applies in both
  attack directions, including creature multiattacks and opportunity attacks.
- A reviewed area command supplies only the current geometry revision and one
  aim cell. Shape, size, width, damage, saves, and provenance come from one
  exact compiled effect program. The bounded 2D projections are sphere as a
  circle under `five_e_simple`, a cardinal/diagonal cone, and a 5-foot-wide
  cardinal/diagonal line. The engine snapshots included cells and derives
  living targets across the player, enemies, and active controlled actors;
  caller-authored area target ids are rejected. Controlled-actor damage and
  terminal status commit through one bounded damage kernel with the spell,
  using defenses from the actor's existing fixed profile.
- `combat_move` resolves leaving-reach boundaries in path order. A living
  enemy with one reviewed melee attack may spend its explicit Reaction once
  for an opportunity attack. The path, reaction expenditure, attack result,
  damage, and evidence commit atomically. Enemy reactions reset only at the
  authoritative next-round boundary. Total cover prevents the opportunity
  attack without spending that Reaction.
- Stale revisions, wrong frames, invalid aims, unsupported programs, total
  cover, and invalid paths reject without spending movement, actions, spell
  slots, reactions, HP, or campaign version. Existing command idempotency and
  restart replay remain the exactly-once boundary.

## Consequences

Cover and area membership are derived facts, not narrator-authored numbers.
The public view may expose safe derived cover while hidden actors remain
subject to the existing knowledge projection boundary. This slice does not
add unrestricted line of sight, elevation, flight, arbitrary templates,
10-foot-wide lines, forced movement, or persistent zones; persistent zones
remain issue #175.
