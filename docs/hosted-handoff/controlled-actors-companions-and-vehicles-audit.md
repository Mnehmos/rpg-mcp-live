# Audit: Controlled Actors — Companions, Familiars, Summons, Mounts, Vehicles, and Controlled Creatures

Scope: **read-only audit** for GitHub issue `Mnehmos/rpg-mcp-live#16` `[P2][Actors] Companions, familiars, summons, mounts, vehicles, and controlled creatures`. No code modified; no implementation.
Repo: Lantern (`F:\Github\rpg mcp live`), branch `main` (untracked working tree). Build PASS; tests PASS 86/86. Date: 2026-08-07.
Parent: #1.

Status vocabulary: `LANTERN_IMPLEMENTED` · `LANTERN_PARTIAL` · `LANTERN_STUB` · `CONTENT_ONLY` · `REFERENCE_ONLY` · `ABSENT` · `BROKEN` · `UNKNOWN`.

> **Bottom line.** There are **no controlled actors.** The product is single-PC; `EngineCombatant` is enemy-only; `"summoning"` is a **fictional improvise token that applies no effect** (`engine-domain.ts:762-799`). There is no ownership/controller field, no command cost, no companion/summon persistence, no initiative policy for allies, and no dismissal/duration/cleanup model. The entire concept is greenfield and touches nearly every subsystem (state, combat, inventory, knowledge, position, effects). It is the broadest-surface P2 issue and must be sequenced late, on top of #2/#3/#7–#12.

---

## 1. Method and verification

Code inspected (`file:line`): `src/engine-contracts.ts` (`EngineCombatant` enemy-only `:873-882`, `EngineCombat.enemies` `:928`, `EngineImprovEffect.effectType` incl. `"summoning"` `:953`, `EngineCharacter` single-PC `:764-788`), `src/engine-domain.ts` (`resolveCombatStart` spawns into `enemies` `:1099-1144`, `resolveSpawnCreature` `:1146-1178`, `resolveImprovise` summoning = no-op record `:762-799`, `createOpen5eCombatant` `:4088-4090`), `src/engine-tools.ts` (no companion/summon command in the tool catalog `:128-166`). Grep for `companion|familiar|summon|mount|vehicle|hireling|controller|owner` across `src` finds **only** the fictional `"summoning"` token and prose. Tests: none. Observed fact unless labeled inference.

## 2. Current state by the issue's "Audit first" checklist

| Checklist item | Status | Evidence |
| --- | --- | --- |
| Party members and allied combatants | `ABSENT` | Combat tracks `enemies: EngineCombatant[]` only (`engine-contracts.ts:928`); the single PC is `state.character`. No allied combatant list. |
| Actor ownership / controller fields | `ABSENT` | No `owner`/`controller`/`summoner` field on combatants or NPCs. |
| Familiars, animal companions, summons, hirelings, mounts, vehicles, controlled undead, charm/dominate | `ABSENT` | None modeled. `"summoning"` is an improvise effect type that **creates nothing** — it appends a fictional record and applies no mechanical effect (`engine-domain.ts:762-799`, esp. no branch for `summoning`). |
| Initiative and turn ownership | `ABSENT` | Turn order is implicit player→enemies (`:1777,1797`); no multi-actor initiative, no companion turn. |
| Command Action/Bonus Action costs | `ABSENT` | No command concept. |
| Autonomous default behavior | `ABSENT` | Nothing for an uncommanded ally to do. |
| Shared vs. separate resources | `ABSENT` | Single PC inventory/slots/hp only. |
| Persistence, dismissal, duration, death, corpse state | `ABSENT` | Nothing persists; no dismissal/duration; corpse model itself is absent (see #9). |
| XP / progression policy | `ABSENT` | XP accrues only to `character.xp` (see progression audit); no companion track. |
| Inventory / equipment transfer | `ABSENT` | Single-owner inventory (see #8). |
| Model-driven NPC control and prompt isolation | `ABSENT` | No NPC-as-actor invocation (see #14). |

## 3. The "summoning success with no effect" hazard

`improvise` with `effectType: "summoning"` returns *"Improv effect applied"* (`engine-domain.ts:794-795`) while creating **zero** combatant and applying **zero** effect — it is the same false-success defect as the other non-mutating improvise types (#6). The issue's AC (a temporary summon must clean up exactly once; summons must not accumulate permanent XP) cannot even be expressed until a real actor-creation path exists. Note also: `spawn_creature` creates **enemy** combatants (DM-controlled opposition), not player summons — so there is no existing "create an allied actor" path to extend.

## 4. First-slice feasibility (issue's KISS slice)

Issue slice: *one persistent familiar/companion with its own actor ID, state, senses, position → bounded command menu → command consumes the reviewed Action/Bonus cost → companion acts on the reviewed initiative policy → without a command, deterministic default behavior → damage/death/dismissal persist → refresh/restart preserves controller and state. Then one temporary summon with explicit duration + cleanup.*

**What exists:** combatant shell (`EngineCombatant`), creature stat blocks, transactional persistence, the #2 effect substrate (for source-linked cleanup) and #3 action budgets (for command cost) once those land.

**What must be built (all new — broad surface):**
- **First-class controlled actor**: independent actor ID, HP, effects, position (#10), actions, inventory policy (#8), knowledge/senses scope (#7) — distinct from both `character` and enemy `EngineCombatant`.
- **Ownership vs. control** distinction (owner / controller / summoner-source) with authorization.
- **Bounded command menu** + **command cost** consuming the correct Action/Bonus (#3) exactly once.
- **Initiative/default-behavior policy** (deterministic; multi-actor initiative couples to #11).
- **Death/dismissal lifecycle** (couples to #9).
- **One temporary summon** with duration/concentration/dismissal/source-termination cleanup exactly once (couples to #2 source-linked cleanup).
- **Typed seams** (not overloaded booleans) for charm/domination, rider/mount, vehicle — even if unimplemented in the first slice.

## 5. Acceptance-criteria → current-state mapping

| AC | Met? | Note |
| --- | --- | --- |
| Controlled actors are first-class actors, not items/narration | No | absent |
| Ownership and control distinct; authorization enforced | No | absent |
| Controller sees only legal commands for current state | No | absent |
| Command cost consumes correct Action/Bonus exactly once | No | absent |
| Initiative/default-behavior explicit and deterministic | No | absent |
| Independent HP/effects/position/actions/inventory/knowledge scope | No | absent |
| Cannot act while dead/incapacitated/dismissed or after source effect ends | No | absent |
| Temporary summon cleans up exactly once on duration/concentration/dismissal/source end | No | absent (summoning is a no-op token) |
| Summons do not accumulate permanent XP/loot unless explicit policy | No | absent |
| Controller changes/charm/rider/vehicle have typed seams, not overloaded booleans | No | absent |
| Model cannot command an unowned actor or bypass command cost | No | absent |
| Rejected commands preserve both controller and controlled-actor state byte-for-byte | Yes (kernel) | inherited, once commands exist |
| Replay does not command/summon/dismiss/clean up twice | Yes (kernel) | inherited |
| Refresh/restart preserves controller/initiative/pending command/duration/actor state | No | absent |
| Tests (authorized/unauthorized command, no-command fallback, action cost, death, dismissal, duration expiry, concentration cleanup, stale version, replay) | No | none exist |

## 6. Dependencies and risks

- **#2** (source-linked effects + duration cleanup), **#3** (action/bonus/reaction budgets + legal offers), **#7** (actor-specific senses/knowledge), **#8** (inventory/ownership), **#9** (death/corpse), **#10** (tactical positions), **#11** (initiative/encounter lifecycle), **#12** (time/durations).
- **Risk (surface):** this is the **broadest** P2 issue — it forces "first-class actor" into state, combat, inventory, knowledge, and position. Sequence it late and keep the first slice to **one persistent companion + one temporary summon**.
- **Risk (cleanup):** summon cleanup is the correctness crux — four termination causes (duration, concentration, dismissal, source-end) must each remove the actor exactly once; this depends hard on #2's source-linked cleanup.
- **Risk (boundary):** the model must not be able to command an actor it does not control or bypass command cost — authorization must be engine-enforced.
- **Risk (XP):** summons defaulting to permanent XP accumulation is a real hazard; the policy must be explicit and default to "no."

## 7. Recommendation

Sequence: after **#2/#3/#7/#8/#9/#10/#11/#12** (EPIC guide — the most-depended-upon actor issue). Build the **first-class controlled-actor state + ownership/control authorization first**, then the **command-cost + deterministic default-behavior** slice (one companion), then **one temporary summon** exercising #2's source-linked cleanup. Keep mount/vehicle/charm as **typed future seams** — do not implement them in the first slice, but do not represent them as overloaded booleans.
