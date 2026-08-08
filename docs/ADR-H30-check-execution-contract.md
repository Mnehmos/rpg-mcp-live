# ADR-H30: canonical check execution contract

Status: accepted for issue #6

## Decision

Check execution remains server-owned. The model may describe a goal, approach,
optional helper, opponent, tool, and information policy, but it cannot author a
modifier, DC, roll, outcome, or consequence.

The first execution slice derives ability modifiers, proficiency, expertise, and
validated tool proficiency from the persisted character. Advantage and
disadvantage are queried through the effects kernel; one legal friendly/helper
source may add advantage, and opposing sources cancel. Passive checks use a
fixed ten and consume no random draw. The reviewed `stealth-perception-v1`
definition compares the actor's Stealth check with an established living
combatant's Perception check, with ties favoring the defender.

Every accepted check emits typed evidence (`checks-v1`) with the formula inputs,
modifier sources, roll mode, helper/opponent, and public or withheld policy.
Withheld results return a bounded player-facing projection while the authoritative
event retains full evidence. Identical challenge retries remain blocked until an
approach or situation changes.

`improvise` is bounded by the existing effects kernel. Fictional effects record
creative fiction but explicitly apply no mechanical effect; typed damage must be
positive; movement and summoning remain rejected until a reviewed producer exists.

## Boundaries and deferrals

- #21 owns reviewed feasibility, DC ladders, stakes, and retry policy.
- #2 owns effect application and advantage/disadvantage cancellation.
- #7 owns the complete player/DM projection boundary; this slice only provides
  the public/withheld placeholder and event evidence.
- #12 owns campaign time; adjudication costs remain inert evidence here.
- No clock, hidden DC authoring, new RNG source, or live model call is added.

