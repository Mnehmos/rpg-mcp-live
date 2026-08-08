# Audit: Controlled actors, companions, summons, mounts, and vehicles

Scope: read-only baseline for GitHub issue `Mnehmos/rpg-mcp-live#16` before implementation. Verified against `main` at `1cd67058834c12678f8ef13595685f5213eab560` on 2026-08-08. This audit update changes documentation only; it does not implement issue #16.

## Bottom line

Lantern still has one player character and enemy-only encounter combatants. There is no first-class controlled actor, owner/controller relationship, companion command, allied initiative entry, actor-specific inventory, or summon lifecycle. The existing kernels provide reusable seams: #2 has source-linked effects, #3 has the primary Action/Bonus/Reaction budget, #7 stores actor-keyed knowledge records, #8 stores item `ownerRef`, #9 persists death/corpses, #10 stores the player's tactical position, #11 owns player/enemy initiative, #12 advances game time, and #15 owns quest consequences. None of those kernels currently creates or controls a non-player actor.

## Verified live behavior

| Concern | Current status | Evidence |
| --- | --- | --- |
| Party/allied actors | Absent | `LanternCampaignState` has one `character`; `EngineCombat.enemies` is the only combatant collection. |
| Ownership vs. control | Partial foundation only | Inventory items have `ownerRef`; no actor relationship record has owner, controller, summoner, rider, employer, or faction-control semantics. |
| Familiar/companion/summon | Absent | No controlled-actor type or command exists. `spawn_creature` creates enemy combatants. `improvise` rejects `summoning` as unadmitted rather than claiming fictional success. |
| Initiative and turn ownership | Player plus enemies only | `EngineEncounterInitiative` is populated from the player and encounter enemies; `activeActorId` and `turnBudget` assume the player or an enemy. |
| Command cost/menu | Absent for allies | The #3 budget and legal offers expose only the player's Action, Bonus Action, Reaction, and movement. |
| Default behavior | Separate NPC system | #14 `npc_tick` handles established world NPC agency; it is not a controlled-actor turn or fallback. |
| Independent state | Absent | HP/effects/position/actions are on `character` or enemy combatants; there is no allied actor aggregate. |
| Knowledge/senses | Reusable actor-keyed records | `actorKnowledge` is already keyed by `actorId`, but only the primary actor has a normal read/projection path. |
| Inventory/equipment | Personal PC state only | Item ownership is typed, but `character.inventory` is the only actor inventory. |
| Death/dismissal/corpse | PC/enemy lifecycle only | #9 handles player death and enemy corpses; no controlled-actor cleanup path exists. |
| Duration/source cleanup | Reusable effect/time seams | #2 `removeRuntimeSource` and #12 `advanceGameTime` already process source removal and fixed time boundaries. |
| XP/loot | Single-PC or encounter policy | Quest and loot rewards accrue to the primary character; no companion/summon permanent-reward policy exists. |

## First-slice boundary

The smallest complete slice is one server-reviewed persistent `familiar-scout-v1` with a distinct actor ID, owner/controller fields, independent HP/senses/position/action state, actor-scoped knowledge, bounded command menu, primary-controller command cost, explicit `controller-turn` initiative policy, deterministic no-command fallback, death/dismissal, and restart persistence. After that base is proven, one `summon-scout-v1` uses the same aggregate with an explicit fixed duration and source-linked cleanup. Mounts, vehicles, charm/domination, hireling economy, party orchestration, and summon swarms remain future seams.

## Required invariants and risks

- The caller/model selects only a fixed profile, actor ID target, and closed command; the engine derives stats, legal commands, cost, damage, duration, and lifecycle.
- Owner and controller are separate typed fields; authorization is checked before any clone is committed.
- A rejected command must preserve the complete campaign, controlled-actor state, version, and event evidence byte-for-byte.
- A command, summon, dismissal, source cleanup, or expiry must be idempotent through the existing store replay boundary.
- A temporary summon cannot gain permanent XP or loot; cleanup must be exactly once for duration, dismissal, death, and source termination.
- Actor knowledge must remain scoped by actor ID, and controlled-actor projections must not expose private source or relationship data.

## Direct dependencies read

`docs/ADR-H15-atomic-multi-effect-turns.md`, `docs/ADR-H23-typed-action-economy-kernel.md`, `docs/ADR-H26-effects-conditions-kernel.md`, `docs/ADR-H31-knowledge-projection-boundary.md`, `docs/ADR-H32-inventory-instance-ownership.md`, and the shipped #7/#8/#9/#10/#11/#12/#14/#15 contracts and focused tests.
