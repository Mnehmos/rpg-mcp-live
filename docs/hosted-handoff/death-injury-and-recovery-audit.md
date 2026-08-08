# Death, injury, and recovery audit

Status: observed baseline for issue #9; implementation not yet applied
Date: 2026-08-08

## Runtime evidence

- `EngineCharacter` persists `hp`, `maxHp`, `conditions`, compatibility
  `conditionEffects`, and death-save success/failure counters, but has no
  explicit lifecycle, death source/time, corpse/remains, or body location
  fields.
- Damage paths in `src/engine-domain.ts` clamp HP at zero and call
  `applyConcentrationAndDownedState`. That helper applies the canonical
  `unconscious` effect at zero HP, but it does not create a dying record,
  apply a death-save failure for damage while already downed, or create a
  corpse after three failures.
- `resolveDeathSave` rolls a d20 and treats `>= 10` as one success; it does
  not give natural 1 two failures or natural 20 one healing/standing result.
  Three successes apply `stable`; three failures apply a `dead` condition and
  end combat, but no remains entity or ownership transfer is committed.
- `resolveDeathSave` checks only for the `unconscious` effect. A positive-HP
  actor carrying a stale marker can therefore reach the resolver unless the
  normalizer has already removed that marker.
- `applyHealing` is the shared healing path used by spells, potions, rest, and
  Second Wind. When HP rises above zero it removes `unconscious` and `stable`
  effects and resets death-save counters. This is the correct seam for
  downed recovery, but it has no explicit lifecycle transition or dead/corpse
  guard.
- Existing tests cover basic zero-HP marker application, healing marker
  cleanup, death-save success/failure counters, and rest recovery. They do not
  cover damage while dying, natural 1/20, a persisted corpse, corpse action or
  healing rejection, corpse loot ownership, or restart/replay of those states.
- #8 now persists optional `ownerRef`, `containerRef`, `provenance`, and
  `charges` on inventory instances. Existing loot/merchant/transfer paths are
  exactly-once command transactions and provide the ownership seam needed for
  corpse transfer without adding a second inventory system.
- ADR-H26 makes the effect list authoritative and compatibility `conditions`
  derived. ADR-H25 requires `applyHealing` to remain the single healing
  transition. ADR-H11/H15 require rejection immutability and exactly-once
  replay for every mutating lifecycle operation.

## Recovery and effect matrix

| Path | Current behavior | Issue #9 decision |
| --- | --- | --- |
| Damage to 0 HP | clamps HP, applies `unconscious` | transition to explicit dying state, clear concentration |
| Damage while dying | no death-save failure path | one failure; critical damage two, exactly once |
| Death save | success/failure at 10+, no nat rules | nat 1 two failures; nat 20 heals 1 and clears downed state |
| Three successes | `stable` effect | retain stable state, no ordinary action |
| Three failures | `dead` effect, combat ends | create one corpse/remains record and transfer eligible ownership |
| Healing from 0 | `applyHealing` clears markers/counters | keep this path; reject dead/corpse targets |
| Rest | existing recovery clears permitted effects | do not wake dead/corpse; retain poison/exhaustion according to clear policy |
| Poison/exhaustion | effect kernel can represent reviewed condition | add one producer-backed poison fixture only after core lifecycle |
| Restart/replay | generic campaign persistence exists | prove counters, lifecycle, corpse, and effects survive and replay once |

## Scope boundary

The first implementation slice will add only the actor lifecycle state and
one corpse/remains record required by the issue sequence. It will not add a
resurrection catalog, soul model, disease catalog, graphic injuries, aging,
arbitrary permanent stat drain, or a second healing/effect system. Any poison
or exhaustion fixture must use the existing ADR-H26 effect substrate and have
a real producer and recovery rule.

