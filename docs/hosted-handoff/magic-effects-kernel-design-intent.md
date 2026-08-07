# Lantern Magic Effects Kernel — Design Intent and Requirements Transcript

Transcribed: 2026-08-07
Source: external design response supplied by the product owner in-conversation, written in direct response to `docs/hosted-handoff/magic-and-caster-classes-audit.md`.
Status of this document: **reference / backing material, not itself a decision.** The decision distilled from it is recorded in [ADR-H25](ADR-H25-magic-effects-kernel.md). Where this document goes further than that ADR commits to (e.g. the full effect-operation union, the complete implementation directive's 13 numbered steps), treat the ADR as authoritative for what Lantern is building *now*, and this document as the fuller intent to draw on for follow-on ADRs (Conditions Kernel, Action Economy generalization, Progression, NPC Magic, Spatial Magic).

---

## Framing: horizontal effects, not vertical classes

The audit's architectural result is good: Lantern does not need eight separate caster implementations. It already has class-generic spellcasting state, correct known/prepared/spellbook distinctions, and genuinely distinct Pact Magic recovery. The failure is concentrated in one place: **the executable effect vocabulary is far smaller than the content vocabulary.**

So the correct strategy is:

> **Implement magic horizontally by reusable effect families, not vertically class by class.**

A single authoritative healing operation unlocks Cure Wounds, Healing Word, Mass Cure Wounds, Prayer of Healing, and much of the Cleric/Druid/Bard identity. A reusable timed-stat-modifier operation unlocks Shield, Bless, Mage Armor, Haste, Slow, and many equipment/class effects. A trigger system unlocks Shield, Hellish Rebuke, Counterspell, Absorb Elements, opportunity attacks, and Ready.

## What the audit establishes (recap, as read by this response)

Worth keeping:
- Spellcasting ability, save DC, attack bonus, slots, access mode, and recovery are derived through shared class-generic content and engine code.
- Wizard spellbook-style access, Cleric full-list preparation, known-spell casters, and Pact Magic are structurally distinguished.
- Slot spending, Action spending, damage, and event persistence are atomic.
- Unsupported spells reject without mutating state.
- Stable content keys and pack hashes prevent fuzzy or wrong-version resolution.

Narrow in practice:
- Only a hand-reviewed damage-spell allowlist compiles.
- Healing, buffs, conditions, summons, utility, Counterspell, and most reaction spells are content-only.
- No command can advance a character beyond level 1.
- Reactions are a free/off-turn timing flag, not responses to authoritative triggers.
- NPC spellcasters use compiled monster attacks rather than the spell system.

Conclusion: **the class architecture is ahead of the effect engine.**

## 1. A generic effect-operation union

The existing compiled spell effect should evolve toward something like:

```ts
type EffectOperation =
  | DamageEffect
  | HealingEffect
  | TemporaryHitPointsEffect
  | ApplyConditionEffect
  | RemoveConditionEffect
  | StatModifierEffect
  | AdvantageEffect
  | ForcedMovementEffect
  | SummonEffect;
```

For the first milestone, only fully implement two new members:

```ts
interface HealingEffect {
  kind: "healing";
  dice: DiceExpression;
  abilityModifier?: SpellcastingAbility;
  upcast?: DiceScaling;
  targetPolicy: "self" | "creature" | "willing-creature";
}

interface StatModifierEffect {
  kind: "stat-modifier";
  stat: "armor-class";
  operation: "add";
  value: number;
  duration: EffectDuration;
}
```

The unimplemented variants (`TemporaryHitPointsEffect`, `ApplyConditionEffect`, `RemoveConditionEffect`, `AdvantageEffect`, `ForcedMovementEffect`, `SummonEffect`) remain absent from the executable schema until they are real — **do not create valid schema branches that return narrative success without state changes.**

## 2. Cure Wounds proves authoritative healing

Cure Wounds should prove the full chain:

```text
class access
→ preparation
→ Action availability
→ slot availability
→ target validation
→ range validation
→ healing roll
→ maximum-HP cap
→ downed-state recovery
→ slot and Action expenditure
→ one atomic commit
```

A successful event should include structured evidence, e.g.:

```json
{
  "spellKey": "open5e:spell:...",
  "effectKind": "healing",
  "slotLevel": 1,
  "rolls": [
    { "expression": "1d8", "results": [6], "modifier": 3, "total": 9 }
  ],
  "stateChanges": [
    { "path": "character.hp", "before": 0, "after": 9 },
    { "path": "character.conditions.unconscious", "before": true, "after": false },
    { "path": "character.deathSaveSuccesses", "before": 1, "after": 0 },
    { "path": "character.deathSaveFailures", "before": 2, "after": 0 }
  ]
}
```

**Adjacent defect flagged by this response's own supplemental research** (not independently re-verified by this transcription pass — flag as `UNKNOWN` until checked against the live code): potion and short-rest healing may be able to produce a character with HP above zero who remains mechanically `unconscious`, because those paths may not clear `unconscious` state or death-save counters. If confirmed, this should not be fixed only inside Cure Wounds — create one canonical function:

```ts
applyHealing(target, amount, source)
```

Every healing source must route through it: spells, potions, rest, class features, NPC healing, administrative recovery. That function owns HP capping and recovery-from-zero semantics in one place.

## 3. Shield proves real reaction timing

Shield should not be exposed as an ordinary off-turn cast. The originating attack must pause between "the attack would hit" and "damage applies":

```text
enemy attack roll
→ determine that current AC would be hit
→ discover eligible triggered reactions
→ persist pending reaction
→ offer Shield or decline
→ resolve player decision
→ consume Reaction and slot if cast
→ apply +5 AC effect
→ recalculate whether the stored attack roll hits
→ resolve or cancel damage
→ finish the originating enemy action
```

Proposed state shape:

```ts
interface PendingReaction {
  id: string;
  trigger: "incoming-attack-would-hit";

  originatingCommandId: string;
  sourceActorId: string;
  targetActorId: string;

  attackRoll: number;
  attackTotal: number;
  originalArmorClass: number;

  legalReactionOffers: ReactionOffer[];

  status: "awaiting-choice" | "declined" | "resolved" | "expired";
}
```

Requirements:
- It survives refresh and restart.
- It cannot be answered twice.
- The originating attack cannot finish twice.
- Reusing the same command ID returns the original result.
- A stale campaign version cannot answer an old reaction.
- The player cannot cast Shield when no valid trigger exists.
- The slot and Reaction are consumed only when Shield resolves.
- Declining also resumes the attack exactly once.

This directly answers the audit's finding that reaction-timed spells currently have a timing classification but no event linkage — this `PendingReaction` record is the first real trigger object in Lantern's engine.

## 4. AC must read active effects, not just equipment

Shield cannot be implemented honestly if Armor Class only reads equipment. The active derived-stat chain should become:

```text
base AC formula
+ equipped armor and shield
+ class features
+ active effects
+ conditions
= current authoritative AC
```

One calculation, not a separately mutable field:

```ts
deriveArmorClass(character, equipment, activeEffects, ruleset)
```

Do not maintain a separately mutable `armorClass += 5`. The event should preserve the explanation:

```json
{
  "armorClass": {
    "before": 16,
    "after": 21,
    "components": [
      { "source": "Chain mail", "value": 16 },
      { "source": "Shield spell", "value": 5 }
    ]
  }
}
```

**Note for whoever implements this**: the magic audit (`magic-and-caster-classes-audit.md §2`) found `deriveArmorClass()` already exists and is canonical for equipment-derived AC (`src/engine-domain.ts:3742-3762` per the prior action-economy audit's citation). This response's ask is to extend that *same* function to also read active timed effects, not to create a second AC path.

## 5. Two findings that need focused verification before being trusted

There is an apparent disagreement between sources referenced by this response:

- The magic audit's spell-family matrix lists automatic-hit Magic Missile as *implemented*, though flagged not directly tested (§4 of the audit: "Automatic hit | Yes, but hardcoded to one spell | Magic Missile only ... | UNKNOWN — not directly located in this pass").
- This response's own supplemental research claims Magic Missile is allow-listed but may never actually compile, because the upstream normalized record may lack the damage fields the compilation gate requires.

**This transcription pass did not re-verify either claim independently.** Do not resolve the disagreement by reading comments — add one direct content-pack/compiler test:

```text
get installed Magic Missile kernel record
→ assert effect !== null
→ cast at a living target
→ assert automatic hit
→ assert no attack roll
→ assert correct dart count
→ assert correct damage and slot spend
```

Until that test passes, treat Magic Missile executability as `UNKNOWN` — not `LANTERN_IMPLEMENTED` as the audit's matrix currently states.

The response's supplemental research also claims several `improvise` effect types can return a successful commit without a corresponding mutation — flagged as `UNKNOWN`, not independently verified in this pass, but treated as dangerous *if true* because `improvise` may be the apparent fallback when a spell effect is unsupported. The milestone should either implement those effect types through the same effect kernel or reject them as unsupported — never leave a silent narrative-only success path.

## 6. Progression remains a separate, still-undecided product decision

The audit is unequivocal: all eight caster progression tables exist through level 20, but no live command changes `character.level`; every production character is effectively locked at level 1.

Two named options, requiring an explicit choice (this response does not pick one):

**Level-1-only first adventure** — valid if documented:
```text
First campaign ceiling: level 1
No XP-to-level transition
No implied higher-level progression
```
Then Cure Wounds and Shield take priority, unblocked.

**Campaign with advancement** — leveling becomes a required milestone immediately after the effects kernel:
```text
quest milestone
→ pending level-up
→ player choices
→ level/class progression
→ HP/features/spells/resources
→ derived-state rebuild
→ atomic commit
```

Do not let correct level-20 tables create the illusion that progression exists today.

## 7. NPC caster position

For the first adventure, precompiled monster spell-like attacks may be acceptable, provided the product is honest about it:

```text
Goblin shaman uses one compiled magical attack
```
is not the same as
```text
Mage has a spellbook, slots, concentration, Counterspell,
and chooses among legal spells.
```

Recommendation:
- Keep ordinary magical monsters on compiled action programs for MVP.
- Do not advertise them as full spellcasters.
- Later add `NpcSpellcastingState` for named recurring casters and bosses.
- Reuse the same spell resolver, effect kernel, reaction windows, and concentration logic rather than building a second magic engine.

## 8. Full "ready-to-send" implementation directive (as supplied)

```text
Implement Lantern Magic Effects Kernel Milestone 1.

Do not broaden the damage-spell allowlist, implement progression, port the
reference engine, or add additional caster classes during this milestone.
The existing class-generic spellcasting architecture must be preserved.

Before changes:
1. Inspect the still-uncommitted Lantern working tree for secrets, databases,
   generated content, and local configuration.
2. Complete .gitignore.
3. Commit the current passing baseline.
4. Tag it magic-audit-baseline-2026-08-07.

Required work:

1. Generalize the compiled spell-effect contract so executable spells may
   contain typed effect operations rather than damage-only data.

2. Implement an authoritative HealingEffect operation:
   - server-owned dice and modifier derivation;
   - upcast scaling;
   - target validation;
   - max-HP cap;
   - structured before/after evidence.

3. Create one canonical applyHealing function and route every existing healing
   source through it, including spell healing, consumables, and rest where
   appropriate. Healing from 0 HP must clear unconscious state and reset
   death-save counters consistently.

4. Compile Cure Wounds as the first healing spell. Do not special-case its
   display name in the resolver. It must execute from its stable content key
   through a typed compiled effect.

5. Add a generic timed StatModifierEffect operation and update the canonical
   AC derivation to include active effects in addition to equipment.

6. Compile Shield as the first AC-modifier spell.

7. Implement a persisted pending-reaction state machine:
   - created only by an authoritative trigger;
   - first trigger: incoming attack would hit;
   - pauses before damage;
   - exposes Shield or decline as legal choices;
   - survives refresh/restart;
   - consumes Reaction and slot atomically;
   - rechecks the stored attack total against updated AC;
   - resumes the originating attack exactly once.

8. Reject reaction-timed casting when there is no matching pending trigger.

9. Ensure unsupported effect kinds cannot return narrative-only success.
   Remove or reject any declared improvise effect type that has no state
   transition.

10. Add a focused Magic Missile test because the audit sources disagree about
    whether its installed content record actually compiles. Treat the spell
    as unsupported until that end-to-end test passes.

11. Add a Warlock test:
    cast an allowlisted pact spell
    → spend the pact slot
    → short rest
    → verify slot recovery
    → cast again.

12. Add a Cleric test:
    create Cleric
    → prepare Cure Wounds from the full class list
    → cast it
    → verify Action and slot expenditure
    → verify healing and recovery from 0 HP
    → refresh/reload and verify identical state.

13. Every rejection path must prove exact mechanical-state immutability.
    Every retry with the same clientCommandId must replay without rerolling,
    rehealing, respending, or resuming the originating attack twice.

Definition of done:
- Cure Wounds is executable through a generic HealingEffect.
- Shield is executable only through a matching incoming-hit reaction trigger.
- Armor Class derives active modifiers from one canonical path.
- All healing sources use one canonical recovery function.
- No supported effect reports success without a persisted mutation.
- Unsupported spells still reject with content_tier_insufficient.
- Existing damage spells and class-generic progression state are unchanged.
- npm run build passes.
- npm test passes, including all existing 86 tests and focused new tests.
- The baseline and completed milestone are committed.
- Documentation records exact executable effect families and deferred families.
```

> Note: step "Before changes" items 1-4 (secret sweep, .gitignore completion, baseline commit + tag) were carried out directly as an operational task alongside adopting this ADR, not deferred into the Milestone 1 engineering work — see [ADR-H25](ADR-H25-magic-effects-kernel.md)'s consequences section for the actual baseline commit reference. The suggested tag name `magic-audit-baseline-2026-08-07` was superseded by whatever tag/commit message was actually used at commit time.

## 9. Sequencing after this milestone (as proposed, not yet committed to)

1. **Effects Kernel 1:** healing and timed AC modifiers.
2. **Trigger Kernel 1:** incoming-hit reaction and Shield.
3. **Conditions Kernel:** apply/remove conditions, durations, saves, stacking.
4. **Action Economy:** real Bonus Actions, Reactions, explicit turn completion.
5. **Progression:** make level advancement reachable.
6. **NPC Magic:** named casters using shared spell resources.
7. **Spatial Magic:** actual area shapes, line of effect, forced movement, teleportation.
8. **Summoning and transformations:** only after actor ownership and effect cleanup are stable.

Only step 1 (and the reaction-trigger half of step 2, scoped to Shield specifically) is adopted by ADR-H25. Steps 3 onward are intent for future ADRs, consistent with how ADR-H23/H24 deferred most of their source research beyond a narrow first slice.

## Closing framing (as supplied)

> The audit's most important conclusion is not "Clerics are broken." It is: **Lantern already knows who may learn and cast a spell. It now needs a general language for what spells actually do.**
