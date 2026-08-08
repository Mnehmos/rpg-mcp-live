# Audit: Systemic Affordances and World Objects

Status: **read-only audit; implementation not authorized by this document**.

Repository: `Mnehmos/rpg-mcp-live`  
Issue: `#23`  
Audited base: `27e4523e64421380cf623637efa196521ff8ca93`  
Audit date: 2026-08-08

This audit records current evidence before any production implementation. It
does not add a world-object store, an affordance resolver, a physics system, or
new commands. `LANTERN_IMPLEMENTED`, `LANTERN_PARTIAL`, `ABSENT`, and
`REFERENCE_ONLY` describe observed code at the audited base. `DESIGNED` marks a
proposed boundary that still requires an accepted implementation plan.

## Reconciled conclusion

The issue is a genuine missing substrate, not a missing prompt instruction.
Lantern has authoritative campaign transactions, actor inventory instances,
bounded containers, world-context scene metadata, world facts, combat effects,
and typed command schemas. It does **not** have a stable instance model for
objects that exist in a scene, a shared affordance definition, material/tag
preconditions, object locations/owners outside the actor inventory, or a
critical-object loss policy. `interact` can therefore report a committed
interaction while changing no object state, and `improvise` cannot safely turn a
named gatehouse object into a mechanical target.

The smallest credible implementation slice is a data-backed ruined gatehouse
fixture and one shared affordance rule family, built on the existing command
transaction and effect primitives. It must prove one verb behaves identically
when called from exploration and a combat plan. It must not attempt physics,
chemistry, arbitrary scripting, or scene-specific handlers.

## 1. Current object identity and mutable state

### Inventory instances — `LANTERN_IMPLEMENTED`

`EngineInventoryItem` has a required instance `id`, quantity, optional
content/authored definition, equipment state, `ownerRef`, `containerRef`,
charges, and provenance (`src/engine-contracts.ts`, inventory interfaces and
`src/open5e-rules.ts:normalizeInventoryItem`). `materializeInventoryItem` joins
instance state to a source or authored definition. `inventoryTopologyIssue` and
`inventoryCapacityIssue` reject duplicate IDs, missing/cyclic containers,
ownership mismatches, depth overflow, and capacity violations.

This is a useful instance precedent, but it is actor-inventory state only. A
world object cannot currently be placed in a scene, owned by the world, or
referenced by an interaction without being invented in prose.

### World objects — `ABSENT`

There is no `WorldObjectInstance`, object registry, object revision, material
tag, declared affordance, or object provenance type. `EngineWorldContext`
contains only an id, title, description, string `features`, string-labelled
`exits`, NPCs, and merchants. `EngineWorldFact` is an information/visibility
record (`object | secret | trap | area`), not a mutable interactable object: it
has scene/revision/visibility fields but no owner, location, material, state,
affordance, or effect interaction.

### Combat and effects — `LANTERN_PARTIAL`

Combatants have authoritative HP, conditions, tactical positions, and damage
resolution. `EngineEffectInstance` is the shared runtime effect substrate for
conditions, modifiers, durations, and provenance. Neither model represents a
door, crate, lever, rope, fire source, or a destructible bridge.

## 2. World-context features and exits

`world_context` validates bounded title/description/features/exits arrays and
uses explicit NPC, merchant, and fact patches. Issue #25 now preserves omitted
NPC/merchant fields and supports explicit removal, while `features` and `exits`
remain replacement arrays by design. `resolveWorldContext` records entity-level
state changes for those patches and commits through the normal command kernel.

`move` only checks that `destinationId` is present in the current context's
`exits`, then commits a log message and returns the selected exit. It does not
persist a location/frame transition, consume movement, discover objects, or
validate a door/lever/bridge state. The existing spatial audit calls this a
scene-graph edge, not a spatial object system.

Classification: `LANTERN_PARTIAL` for scene metadata; `ABSENT` for object
identity and object-level navigation.

## 3. `interact` behavior

The command/tool contract is `{ kind: "interact", targetId, goal }` and is
strictly schema validated (`src/engine-contracts.ts`, `src/engine-tools.ts`).
`resolveInteract` does not look up `targetId`, world context, inventory,
materials, ownership, prerequisites, or combat state. It calls `commit` with
the input `state`, returns the target and goal as data, and uses the message
“No mechanical check was required; the DM narrates the immediate consequence.”

Classification: `REFERENCE_ONLY` for object interaction. The command is
transactionally recorded and idempotent, but it is not an authoritative object
transition. A future implementation must preserve the model-authority
boundary: the caller supplies intent and references; the engine selects and
applies a reviewed affordance rule or rejects honestly.

## 4. `improvise` behavior

The strict command contract declares eight effect types:
`fictional`, `advantage`, `disadvantage`, `condition`, `damage`, `healing`,
`movement`, and `summoning`.

Observed current behavior in `resolveImprovise`:

| Effect | Current result | Classification |
|---|---|---|
| `fictional` | Appends an `EngineImprovEffect`; commits narration-only state with an explicit no-mechanical-effect message | `REFERENCE_ONLY` |
| `advantage` / `disadvantage` | Applies a runtime effect with a category and optional duration; appends the record | `LANTERN_PARTIAL` |
| `condition` | Requires a condition name and applies the shared condition effect | `LANTERN_PARTIAL` |
| `damage` / `healing` | Requires a positive amount; only the player target has a resolver; enemy targets reject | `LANTERN_PARTIAL` |
| `movement` / `summoning` | Explicitly rejects as unsupported | `LANTERN_IMPLEMENTED` for honest rejection |

The resolver never maps a target ID to a world object, never checks material or
ownership, and never turns `improvEffects` into a world-object affordance
definition. Existing effects are a reusable mechanical substrate, not a world
object grammar. The audit's current conclusion supersedes older issue #6 text
that described all eight classes as false-success paths; the present code
rejects two classes and applies several others.

## 5. Ownership, location, containment, and equipment

`EngineItemOwnerRef` supports `actor`, `merchant`, and `world`, and inventory
items may point at a bounded `containerRef`. The current actor commands enforce
ownership, equipment/container constraints, acyclic topology, maximum depth,
carrying capacity, and container capacity. Loot, merchant trade, equip,
unequip, transfer, drop, and use run through the same versioned command
transaction.

The gaps relevant to #23 are:

- `ownerRef.kind = "world"` has no world-object registry or location consumer;
- dropped items are removed from actor inventory, not placed in a world scene;
- merchant listings are nested item data, not location-bearing object instances;
- NPCs, merchants, facts, exits, and features have no common object identity;
- combat position is separate tactical state and is not a general scene/object
  location model.

Classification: `LANTERN_PARTIAL`; do not create a second inventory or object
store. A future world-object instance must use one canonical identity and make
ownership/location transitions explicit in the same engine transaction.

## 6. Destruction and transformations

Creature damage flows through the combat/lifecycle and effects kernels. Death
creates a persisted corpse with provenance and a lootable inventory. Inventory
drop removes quantities and rejects non-empty containers; item effects can add or
remove runtime sources. World facts can be marked inactive through an explicit
fact removal patch. These are real, separately scoped transitions.

No generic operation destroys, damages, opens, closes, locks, lights, wets,
repairs, transforms, or moves a world object. No critical-object policy exists
for recovery route, alternate path, quest failure, or world transformation.

Classification: `LANTERN_PARTIAL` for creatures/items/facts; `ABSENT` for
world-object lifecycle and critical-object policy.

## 7. Narration-only success paths and authority boundary

The following paths can commit a version/event while producing no authoritative
world-object state:

- `interact` records target/goal and delegates the consequence to narration;
- `declare` records a player declaration without a mechanical check;
- `improvise` with `fictional` explicitly advances fiction only;
- `move` records a scene-graph exit but leaves the next context to the DM.

The engine store does enforce idempotency, expected-version checks, atomic event
and state writes, and replay. LLM narration is attached after the mechanical
resolution and cannot retroactively create an object transition. The missing
piece is a server-owned object/affordance resolver, not another narration
prompt.

## 8. Transaction, persistence, and rejection evidence

`LanternEngineStore.executeCommand` wraps request identity, replay detection,
stale-version rejection, resolver execution, state write, event write, and
stored result in one SQLite transaction. `rejection` returns the unchanged
state and does not emit an event. Existing tests cover this pattern for combat,
movement, inventory, effects, world-context patches, and replay/restart.

The future object path must use this kernel and add focused evidence for:

- schema-valid/domain-invalid affordances with byte-identical state/version;
- exactly-once object transitions and replay;
- stale-version rejection;
- restart-preserved object identity, location, ownership, state, and provenance;
- before/after `stateChanges` at object paths rather than an opaque context blob.

## 9. #24 scene-detail promotion boundary

The audited runtime has no accepted #24 scene-extension implementation to
promote cosmetic narration into an object. Therefore a narrated crate, rope,
lever, or clue is not mechanically present merely because it appears in prose.
Promotion must be a later validated scene-extension operation and must reject a
retroactive threat, negate the declared plan, mint arbitrary power, or
contradict committed state. Until #24 is accepted, #23 tests should construct
authoritative gatehouse objects through an explicit fixture/command, not a
prompt-only promotion.

Classification: `DESIGNED` boundary; no current promotion path is verified.

## 10. Reconciled first implementation slice

After this audit is accepted, implement only:

1. A canonical `WorldObjectDefinition`/`WorldObjectInstance` contract with
   stable id, content/source ref, scene/container/owner refs, material/tags,
   state, declared affordances, and provenance/revision.
2. A small data-backed ruined-gatehouse fixture containing the eight issue
   objects (door, crate, metal weapon, rope, oil, fire source, breakable lever,
   critical clue) and explicit critical-object policies.
3. One shared affordance resolver for a bounded subset (`inspect`, `open` /
   `close`, `move` / `carry`, `ignite` / `extinguish`, `break` / `damage`,
   `attach`, `activate`) with material/tag and ownership prerequisites.
4. One direct exploration path and one combat-plan path that call the same
   rule family; no scene-specific mechanics or duplicate object store.
5. Atomic object state/effect/inventory transitions with stable state-change
   paths, rejection immutability, replay, stale-version, and restart tests.

`take/give/drop/steal/equip/use` should reuse the existing inventory commands
where their existing contracts are sufficient. Do not add a second transfer
system in the first slice. `CriticalObjectPolicy` must make early acquisition,
loss, destruction, and recovery outcomes explicit; no silent respawn or
teleport is acceptable.

## 11. Explicit deferrals

Rigid-body physics, chemistry simulation, arbitrary scripting, a general puzzle
VM, every material/object type, voxel destruction, procedural puzzle generation,
full scene compilation, #24 promotion implementation, multiplayer object
ownership, and broad world-object synchronization are outside this slice.

## 12. Audit acceptance checklist

- [x] Current object identity/state, `interact`, `improvise`, ownership/location,
      world-context features/exits, destruction/transformations, and
      narration-only paths are recorded with source evidence.
- [x] Existing transaction/replay/restart boundaries and their implications are
      recorded.
- [x] Issue #23 is reconciled: the missing substrate is explicit, and the first
      slice is bounded to one shared rule family and the eight gatehouse objects.
- [x] No production code or tests are changed by this audit commit.
- [ ] Human/Codex review accepts this audit before production implementation
      begins.

