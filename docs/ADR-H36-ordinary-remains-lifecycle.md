# ADR-H36: Ordinary remains use one persisted, server-derived lifecycle

Status: Accepted for issue #138 first slice
Date: 2026-08-11
Depends on: ADR-H15, ADR-H32, issues #8, #9, #12, and #23

## Context

Lantern already creates one corpse record when the player character dies and moves that character's inventory into it. It also has authoritative inventory ownership, campaign time, world-object critical policies, atomic command commits, and idempotent replay. A separate corpse inventory, crafting, or background-decay subsystem would duplicate those kernels and let callers invent results.

## Decision

`EngineCorpse` remains the single persisted remains record. Existing records are additively normalized with species, one decay profile, one optional reviewed harvest profile, and one cleanup marker.

- Death creates one stable remains ID, records actor/source/location provenance, and atomically transfers inventory to that ID. A matching world-object instance remains validly scene-owned and is hidden; its shared item ID in the remains inventory is the authoritative association, and direct interaction must use `remains_action` first.
- `ordinary-remains-v1` snapshots the current reviewed weather at death. Clear weather decays remains after three days, rain after two days, and storm after one day. Only the central campaign-time advance changes `fresh` to `decayed`; wall-clock time and load normalization do not.
- `remains_action` is a closed command with `loot`, `harvest`, and `cleanup`. Loot must name one item already held by the remains. The caller cannot provide yield, decay, eligibility, ownership, or cleanup outcome.
- One reviewed harvest profile exists: `dragonborn-scale-v1`. Species is read from the persisted death record and the engine creates exactly one inert `Preserved dragonborn scale` inventory instance with harvest provenance. Other species fail closed.
- Loot uses the ordinary inventory ownership and capacity validators. A nonempty container cannot be removed before its contents, and inventory-backed world objects move through the same ownership transition.
- Cleanup requires DM authority and a committed `decayed` state. It marks the remains removed but retains the record, inventory ledger, death provenance, and command provenance for replay and audit.
- Cleanup rejects while any associated world object has a non-ordinary critical policy or forbids loss. The critical object must first follow its declared recovery path.
- A dead actor cannot loot or harvest, but DM cleanup may complete after death. Stable and otherwise unavailable actors retain the existing action restrictions.
- The legacy DM `loot(corpseId)` path remains readable for compatibility, but only while the remains are fresh and present.

Arbitrary species yields, recipes, corpse combatants, resurrection, undead conversion, disease, forensic simulation, and background workers remain unsupported.

## Consequences

- Death, item recovery, harvest, decay, and cleanup have stable state evidence instead of narration-only consequences.
- Every rejection leaves serialized campaign state, version, and event history unchanged.
- Restart normalization preserves the exact lifecycle and ownership record; store replay does not rerun a transfer or harvest.
- New decay or harvest profiles require an explicit reviewed server definition rather than model-authored data.

## Rejected alternatives

- **Create a second remains inventory system:** rejected because ADR-H32 already owns identity, containment, capacity, and provenance.
- **Run decay from wall-clock timers:** rejected because only in-fiction campaign time is authoritative and replayable.
- **Let the model author harvest yield or cleanup state:** rejected because results and durable state must be server-derived.
- **Delete remains rows during cleanup:** rejected because deletion would erase provenance and weaken replay/audit evidence.
- **Silently discard critical world objects:** rejected because issue #23 requires an explicit recovery or consequence path.
