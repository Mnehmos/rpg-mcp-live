# ADR-H32: Authoritative inventory instance ownership

Status: Accepted  
Date: 2026-08-08

## Context

Lantern already persists a stable inventory `id`, quantity, source-backed or
authored definition, equipment slot, and attunement state. It does not yet
persist who owns an item, where it is stored, bounded container capacity,
charges, or a reviewed provenance record. Flat-array movement would therefore
allow duplicate ownership, unbounded nesting, and capacity-free transfers.

## Decision

`EngineInventoryItem.id` remains the campaign-local instance/stack identity.
The optional persisted metadata fields are:

- `ownerRef`: one server-recognized owner reference;
- `containerRef`: one containing inventory instance, or absent at actor root;
- `provenance`: the source kind and source identifier for the current instance;
- `charges`: current and maximum uses for reviewed charge-backed effects.

Legacy character inventory with missing ownership metadata is treated as
character-owned at the root for validation; mutating inventory commands write
explicit references without rewriting unrelated commands. A transfer is one atomic command. It may split a positive quantity
into a new server-generated stack, but it may not create a second owner or
physical location. Container graphs are actor-owned, acyclic, and bounded in
depth. Weight and capacity are server-derived validation and projection data;
this ADR does not add a tactical Speed penalty.

Equipment changes validate ownership, slot conflicts, attunement, and the
explicit operation execution tier before committing. Weapon attack derivation
reads equipped instances; ammunition is consumed only after a resolved ranged
action. Consumables use the canonical healing/effect paths in the existing
kernel and decrement in the same transaction. Merchant and loot paths assign
server-owned ownership/provenance and retain their existing exactly-once
transaction boundaries.

Only reviewed, explicitly identified magic effects may execute. The first
fixture is one authored charge-backed effect using the #2 effect lifecycle;
catalog prose, arbitrary DM/homebrew mechanics, broad magic-item coverage,
theft, corpses, crafting, and dynamic markets remain fail-closed or deferred.

## Consequences

- Existing source provenance (`contentKey` and `packHash`) remains authoritative
  under ADR-H17; authored definitions never masquerade as Open5e content.
- API projections may expose derived weight/capacity and hydrated definitions,
  while persisted state stores only canonical item metadata.
- Rejection must leave serialized state, version, and event evidence unchanged;
  replay and restart are part of the issue's acceptance fixtures.
