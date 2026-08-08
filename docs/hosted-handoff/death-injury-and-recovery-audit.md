# Audit: Death, Dying, Injury, Poison, Disease, Exhaustion, Corpses, and Resurrection

Scope: **read-only audit** for GitHub issue `Mnehmos/rpg-mcp-live#9` `[P1][Life Cycle] Death, dying, injury, poison, disease, exhaustion, corpses, and resurrection`. No code modified; no implementation.
Repo: Lantern (`F:\Github\rpg mcp live`), branch `main` (untracked working tree). Build PASS; tests PASS 86/86. Date: 2026-08-07.
Parent: #1.

Status vocabulary: `LANTERN_IMPLEMENTED` · `LANTERN_PARTIAL` · `LANTERN_STUB` · `CONTENT_ONLY` · `REFERENCE_ONLY` · `ABSENT` · `BROKEN` · `UNKNOWN`.

> **Bottom line.** Lantern has a **working death-save counter** (3 successes → stable, 3 failures → dead) and condition markers for `unconscious/stable/dead`, but the lifecycle is **incomplete and has one confirmed BROKEN path.** Natural 1 / natural 20 are **not implemented**; massive damage, corpses, poison/disease/exhaustion, and max-HP reduction are **absent**; and **a healing potion raises HP without clearing `unconscious`** — the three heal paths (potion/rest/improvise) share **no contract**, so only a long rest clears downed state. The corpse concept does not exist (loot authors items directly into inventory). The headline fix is a single canonical recovery function owned by #4.

---

## 1. Method and verification

Code inspected (`file:line`): `src/engine-domain.ts` (`resolveDeathSave` `:2720-2775`, `applyConcentrationAndDownedState` `:2551-2583`, downed-state set inline `:1992-2001`, `resolveRest` `:2843-2909`, `resolveUseItem` `:2911-2950`, `resolveImprovise` heal `:781-789`, damage application `:1984,2273,2528`, `addCondition`/`removeCondition` `:4406-4412`, `resolveLoot` `:2777-2841`), `src/engine-contracts.ts` (`deathSaveSuccesses/Failures` `:786-787`, `conditions`/`conditionEffects` `:784-785`, `hp/maxHp` `:777-778`). Tests: no dedicated death-save unit test in `engine.test.ts`. Observed fact unless labeled inference.

## 2. Current state by the issue's "Audit first" checklist

| Checklist item | Status | Evidence |
| --- | --- | --- |
| Damage at 0 HP | `LANTERN_PARTIAL` | Damage clamps `hp = max(0, hp-damage)` (`:1984,2273,2528`); reaching 0 sets `unconscious` via `applyConcentrationAndDownedState` (`:2558-2569`). **But damage taken *while already at 0* does not add death-save failures** (no massive-damage/crit-at-0 rule). |
| Natural 1 / natural 20 death-save behavior | `ABSENT` | `resolveDeathSave` `:2730-2731`: `roll = randomInt(1,21); success = roll >= 10;` — a natural 1 is just one failure; a natural 20 is just one success. No special-case. **SRD-2014 rule not implemented.** |
| Stabilization | `LANTERN_IMPLEMENTED` | At 3 successes: removes `unconscious`, adds `stable`, passes turn (`:2737-2743`). |
| Healing from 0 HP | `BROKEN` | `resolveUseItem` potion raises HP (`:2929`) but is **not gated on `unconscious`** and does **not clear it** (`:2911-2929`). A character can be healed above 0 yet remain flagged `unconscious`. Only a long rest (or 3-success stabilize) clears `unconscious`. |
| Unconscious/stable/dead condition cleanup | `LANTERN_PARTIAL` | `unconscious` set at 0 HP (`:2558-2569`); cleared on stabilize (`:2738`) or long rest (`:2883` keeps only `stable`, zeroes death counters `:2884-2885`). `dead` blocks rest (`:2851`). Cleanup is **inconsistent across heal sources** (potion doesn't clear; long rest does). |
| Massive damage | `ABSENT` | No rule; exceeding max HP in one blow adds no failures. |
| Corpse state and loot ownership | `ABSENT` | No corpse/remains entity. `resolveLoot` `:2777-2841` authors items directly into the PC inventory after an `ended` encounter — there is no body with its own inventory ownership. |
| Poison, disease, exhaustion, ability drain, max-HP reduction, lingering injuries | `ABSENT` | No exhaustion field/code (grep finds nothing); no disease/poison stage tracking; no max-HP reduction field; applied conditions never deal recurring damage (no DOT operation in the compiled effect union). `poisoned` is only a condition *name* the compiler regex can apply (`effect-compiler.ts:276`). |
| Short/long rest recovery | `LANTERN_IMPLEMENTED` | `resolveRest` `:2843-2909`: short rest spends a hit die (`:2867-2873`); long rest sets HP=max, recovers hit dice, clears concentration, zeroes death saves, drops conditions except `stable` (`:2878-2889`). Note: rest has **no time requirement** (couples to #12; rest is currently spammable). |
| Resurrection spells/content and time windows | `ABSENT` | No resurrection content is executable (all healing spells are non-compiled prose — see #4); no time-window concept (no game time — see #12). |
| Whether healing paths disagree across spells, potions, rest, class features | **Yes — confirmed BROKEN/inconsistent** | Three inline heal paths with divergent side-effects: potion (`:2925-2929`, caps at max, **no condition touch**); long rest (`:2881-2889`, full clear); improvise (`:785-786`, player-only direct set). No shared `applyHealing`. |

## 3. The BROKEN healing path (headline defect)

`resolveUseItem` (potion) is the canonical example: it raises `hp` but neither checks nor clears `unconscious` (`engine-domain.ts:2911-2929`). Result: a downed character chugs a potion, HP goes positive, but the engine still treats them as `unconscious` (death saves continue; they cannot act). This is the concrete instance of the issue's "healing paths disagree." The fix is a **single `applyHealing(target, amount)` that always clears incompatible downed state** — owned by **#4**, adopted by #9 (death) and #8 (potions).

## 4. First-slice feasibility (issue's KISS slice)

Issue slice: *living → damage to 0 → unconscious + death saves → damage-at-0 adds failures → nat 1 / nat 20 → stabilize or heal (clears downed state) → or 3 failures → corpse → corpse ownership/loot separate from former actor.*

**What exists:** death-save roll + counters + stabilize/die thresholds; condition markers; transactional persistence.

**What must be built:**
- **Natural 1 (two failures) and natural 20 (regain 1 HP, conscious)** per pinned ruleset (`engine-domain.ts:2730-2731`).
- **Damage-at-0 → death-save failures**, incl. crit-at-0 = two failures.
- **Canonical recovery function** (`applyHealing`) clearing `unconscious`/death-save state — fixes the BROKEN potion; shared with #4/#8.
- **Corpse/remains entity** with inventory ownership separation (loot-from-corpse exactly-once, cannot duplicate the former actor's inventory).
- **Corpse cannot act/rest/cast/receive healing.**
- **One poison or exhaustion effect** via #2 (duration/stacking/recovery); long/short rest must **not** clear effects they shouldn't.

## 5. Acceptance-criteria → current-state mapping

| AC | Met? | Note |
| --- | --- | --- |
| HP/consciousness/dying/stable/dead/corpse cannot contradict | Partial | corpse absent; potion leaves unconscious (contradiction) |
| Damage at 0 applies correct failures incl. crit | No | absent |
| Nat 1 / nat 20 per pinned rules, evidenced | No | absent (`:2730-2731`) |
| Stabilization + heal-from-0 use one canonical transition | No | three divergent paths |
| Every healing source clears incompatible downed state consistently | No | **BROKEN** — potion doesn't |
| Death creates one corpse exactly once with provenance + inventory ownership | No | corpse absent |
| Corpse cannot act/rest/cast/receive healing | No | corpse absent |
| Looting exactly once, no duplication of former inventory | Partial | loot once; but no corpse inventory to separate |
| One poison/exhaustion via #2 stacking/duration/recovery | No | absent |
| Rests do not clear effects they shouldn't | Unknown | no effects to test against yet |
| Rejected death/heal/corpse ops preserve state byte-for-byte | Yes (kernel) | inherited |
| Replay cannot add failures, create a 2nd corpse, or heal twice | Yes (kernel) | inherited, once ops exist |
| Refresh/restart preserves death-save counters, corpse state, active effects | Partial | counters persist; corpse/effects new |
| Tests cover all transitions + simultaneous/retry + narration failure | No | none exist |

## 6. Dependencies and risks

- **#2 (effects)** — poison/disease/exhaustion/max-HP-reduction/lingering-injury as typed effects with duration/stacking/recovery.
- **#4 (magic)** — owns `applyHealing`; **sequence #4 before (or with) #9** to fix the BROKEN potion path in one coordinated change.
- **#8 (inventory)** — corpse inventory and item ownership.
- **#12 (time)** — resurrection windows and disease progression (later).
- **Risk:** the corpse model is a new entity type with its own ownership rules — decide whether a corpse is a lootable actor or an item-bearing remains record before building.
- **Risk:** pinned-ruleset nat-1/nat-20 must be content/ruleset-aware (SRD-2014 specifics); hardcoding risks future-ruleset drift.

## 7. Recommendation

Sequence: **#2/#3/#4 → #8/#9** (EPIC guide). Tightly couple #9 with #4 on the **single `applyHealing` contract** — that one function fixes the confirmed BROKEN potion path and prevents three more divergent heal implementations. Build the death-save nat-1/nat-20 + damage-at-0 rules next (small, well-specified). Defer corpse/poison/exhaustion until #2 and #8 provide the effect and ownership substrates.

---

## 2026-08-08 re-audit after #4 and #8

The historical observations above remain preserved. The following deltas are
the current implementation evidence used for issue #9:

- #4 now supplies `applyHealing` and the potion, rest, Second Wind, and spell
  paths call it. Healing above zero removes `unconscious`/`stable` effects and
  resets death-save counters; the old potion contradiction is fixed.
- #8 now supplies optional persisted `ownerRef`, `containerRef`,
  `provenance`, and `charges` on item instances, with exactly-once transfer,
  loot, merchant, and restart/replay transactions. No corpse/remains entity
  exists yet, so corpse ownership transfer is still this issue's work.
- The actor contract still has no explicit lifecycle enum, death source/time,
  remains identity/location, maximum-HP reduction, or poison/disease/exhaustion
  level. Effects/conditions are represented by ADR-H26's effect list and
  compatibility projections.
- `resolveDeathSave` still treats every d20 roll at or above 10 as one
  success, lacks natural-1/natural-20 rules, does not reject stale positive-HP
  unconscious state explicitly, and turns three failures into only a `dead`
  condition with no corpse record.
- Damage at zero still applies the downed marker but does not add a death-save
  failure (or two for a critical hit). Rest and ordinary action guards have no
  corpse target to reject.

The implementation slice therefore remains: explicit lifecycle/corpse state,
critical death-save semantics, damage-at-zero failures, corpse-safe ownership
transfer, replay/restart proof, and one producer-backed poison or exhaustion
effect only after the core transitions are green. Resurrection windows and
full injury/disease catalogs remain deferred to #12/later slices.
