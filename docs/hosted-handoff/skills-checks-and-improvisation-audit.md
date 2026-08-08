# Audit: Skills, Checks, Contests, Repeated Attempts, Information, and Bounded Improvisation

Scope: **read-only audit** for GitHub issue `Mnehmos/rpg-mcp-live#6` `[P1][Resolution] Skills, contests, repeated attempts, information, and bounded improvisation`. No code modified; no implementation.
Repo: Lantern (`F:\Github\rpg mcp live`), branch `main` (untracked working tree). Build PASS; tests PASS 86/86. Date: 2026-08-07.
Parent: #1. Coordinates with the existing `action-economy-and-spatial-audit.md`, `magic-and-caster-classes-audit.md`.

Status vocabulary: `LANTERN_IMPLEMENTED` · `LANTERN_PARTIAL` · `LANTERN_STUB` · `CONTENT_ONLY` · `REFERENCE_ONLY` · `ABSENT` · `BROKEN` · `UNKNOWN`.

> **Bottom line.** Lantern has a *minimal* check resolver (`roll_check`, `social_check`) that rolls a d20 against a hardcoded DC and writes a `lastRoll` note. There is **no expertise, no tool-check consumption, no advantage/disadvantage on checks, no Help, no opposed checks, no secret rolls, and no retry policy.** Improvisation (`improvise`) is the more serious problem: **5 of 8 declared effect types report "applied" with zero state mutation.** Issue #6's first slice cannot land until #2 provides effect-based advantage/modifiers and until improvisation stops returning narration-only success.

---

## 1. Method and verification

Code inspected (cited as `file:line`): `src/engine-domain.ts` (`resolveCheck` `:1054-1100`, `resolveSocialCheck` `:587-623`, `resolveInteract` `:816-836`, `resolveImprovise` `:762-799`, dodge branch `:1963-1965`), `src/engine-contracts.ts` (`EngineSkill` `:637-642`, command schemas `:128-166`), `src/open5e-rules.ts` (`buildSkillSheet` `:374-388`, `abilityModifier` `:334-336`, `proficiencyBonus` `:338-340`), `src/engine-tools.ts` (tool defs `roll_check`/`social_check`/`interact`/`improvise`). Test evidence: `engine.test.ts` has no dedicated check/improvise unit beyond what `engine-dm.test.ts:31` exercises end-to-end. Findings are observed fact unless labeled inference.

## 2. Current state by the issue's "Audit first" checklist

| Checklist item | Status | Evidence |
| --- | --- | --- |
| Ability and skill derivation | `LANTERN_PARTIAL` | `resolveCheck` `engine-domain.ts:1064-1067`: d20 + (`skills[skill].bonus` if skill else `abilityModifier(ability)`). Skill bonus built at create via `buildSkillSheet` (`open5e-rules.ts:374-388`) = `abilityMod + proficiency`. Correct for proficiency; **no expertise**. |
| Proficiency / expertise / tool proficiency | `LANTERN_PARTIAL` / `LANTERN_PARTIAL`(dead) / `ABSENT`(for checks) | `EngineSkill.expertise` exists (`engine-contracts.ts:640`) but `buildSkillSheet` **hardcodes `expertise: false`** (`open5e-rules.ts:384`). Tool proficiencies are stored on the character (`proficiencies.tools`, `engine-contracts.ts:774`) and chosen at creation, but **no check path consults them** — `resolveCheck`/`resolveSocialCheck` look only at `skills[*].bonus` or raw ability. |
| Passive scores | `LANTERN_PARTIAL` | Only `passivePerception` is computed (`engine-domain.ts:4354` = `10 + perception.bonus`); no passive Investigation/Insight/Stealth. |
| `roll_check` behavior | `LANTERN_PARTIAL` | `resolveCheck` `engine-domain.ts:1054-1100`: rolls d20, applies one modifier, **DC hardcoded `combat ? 14 : 12`** (`:1068`) — the DM **cannot set a DC**; success = `total >= dc` (`:1070`); the only state mutation is `lastRoll` (`:1086`). |
| `social_check` behavior | `LANTERN_PARTIAL` | `resolveSocialCheck` `:587-623`: same roll math, but DC = the NPC's `socialDc` (DM-authored, `:601`); mutates `npc.relationshipScore` ±5/−2 (`:605`) and appends a memory. Narrative-only mechanical effect. |
| `interact` behavior | `REFERENCE_ONLY` | `resolveInteract` `:816-836`: pure declaration — *"No mechanical check was required; the DM narrates…"* (`:829`); commits a message, **zero state change**. |
| `improvise` behavior | `BROKEN` / `REFERENCE_ONLY` | See §3. |
| Advantage / disadvantage cancellation | `ABSENT` (on checks) | No `advantage`/`disadvantage` input on `roll_check`/`social_check` (`engine-contracts.ts:301-308,398-408`); no cancellation logic anywhere. The **only** live adv/disadv is the `dodging` condition imposing disadvantage on the *enemy's* attack roll (`engine-domain.ts:1963-1965`, also `:2504-2506`). |
| Secret rolls | `ABSENT` | No secret-roll policy; roll/DC/result are returned to the consumer verbatim. |
| Help / assistance | `ABSENT` | The `help` combat action is narration-only (*"no ally here…"*, `engine-domain.ts:1794-1795`); grants no advantage to any roll. |
| Opposed checks | `ABSENT` | No two-sided resolution; `social_check` is one-sided vs a static `socialDc`. |
| Repeated attempts / retry policy | `ABSENT` | No attempt-history store; identical checks can be repeated freely with no escalation, no state-change requirement, no "once per scene." **Anti-farming gap.** |
| Success / failure consequences | `LANTERN_PARTIAL` | A check writes `lastRoll`; only `social_check` has a downstream effect (relationshipScore). No time/noise/resource/consequence cost commits with the roll. |
| Declared improvisation effect types that do not mutate state | `BROKEN` | Confirmed — see §3. |

## 3. Improvisation — declared vs. actual mutation (the headline defect)

`improvise` declares 8 `effectType` values (`engine-contracts.ts:344,953`): `fictional, advantage, disadvantage, condition, damage, healing, movement, summoning`. `resolveImprovise` (`engine-domain.ts:762-799`) **always appends an `EngineImprovEffect` record and always returns "Improv effect applied"** (`:794-795`), but actual mutation is conditional:

| effectType | Mutates? | Scope | Status |
| --- | --- | --- | --- |
| `damage` | yes, **player target only** | `character.hp` (`:781-789`); creature targets get **no HP change** | `LANTERN_PARTIAL` |
| `healing` | yes, **player target only** | `character.hp` (`:781-789`); uses `amount ?? 0` | `LANTERN_PARTIAL` |
| `condition` | yes, **player target only** | `character.conditions` (`:790-793`) | `LANTERN_PARTIAL` |
| `advantage` | **no** | record-only | `REFERENCE_ONLY` (claims success) |
| `disadvantage` | **no** | record-only | `REFERENCE_ONLY` (claims success) |
| `movement` | **no** | record-only | `REFERENCE_ONLY` (claims success) |
| `summoning` | **no** | record-only | `REFERENCE_ONLY` (claims success) |
| `fictional` | **no** (by design) | record-only | `REFERENCE_ONLY` (intended) |

This confirms and localizes the EPIC's stated defect ("multiple declared improvisation effects can report success without mutation"). Five of eight types — and *all* creature-targeted damage/healing/condition — report success with zero state change. `improvise` records are **never read by any resolver** (`resolveCheck`, attack paths do not consult `improvEffects`).

## 4. First-slice feasibility (issue's KISS slice)

Issue slice: *force a barred door while an ally helps; derive Athletics; validate helper; resolve one check against a bounded definition; advance time/noise/consequence; block identical retries; return only authorized information.* Plus one opposed fixture (Stealth vs Perception or Deception vs Insight).

**What exists that helps:** the d20+modifier roll primitive; transactional commit; `social_check`'s NPC-DC pattern as a precedent for server-owned DC.

**What is missing and must be built (gates the slice):**
- A **challenge/check definition** carrying the DC (server-owned) — the hardcoded `combat?14:12` must be replaced (`engine-domain.ts:1068`).
- **Advantage/disadvantage** as effect-driven, queryable state (depends on **#2**) — there is currently no input or cancellation.
- **Help** validation + advantage grant (currently narration-only).
- **Opposed-check** two-sided resolution.
- A **retry/attempt-history** store (scene- or objective-scoped) — no anti-farming infra exists.
- **Atomic consequence commit** (time/noise/resource) with the roll.
- **Information-disclosure tiers** (couples to **#7**'s knowledge model).
- **Bounded improvisation**: select only reviewed effect classes; **honestly reject unsupported types** instead of recording "applied."

## 5. Required-model gaps (vs. issue's "Required model")

The issue asks a check definition to identify: ability/skill, proficiency/expertise/tool, DC source, advantage sources, helper, retry policy, consequence, information tier, provenance. Lantern has **none** of these as structured fields today — `roll_check` carries only `{ability, skill, reason}` (`engine-contracts.ts:398-408`). The whole challenge-definition type is new.

## 6. Acceptance-criteria → current-state mapping

| AC | Met? | Note |
| --- | --- | --- |
| One canonical character derivation for check modifiers | Partial | skill bonus is canonical; expertise/tool dead; adv/disadv absent |
| Proficiency/expertise/tool/passive represented | Partial | proficiency yes; expertise hardcoded false; tool unused; passive perception only |
| Advantage sources listed + cancel deterministically | No | no adv/disadv on checks |
| Help requires legal helper, no free stacking | No | Help is narration-only |
| Opposed checks derive both sides server-side | No | absent |
| Secret rolls hide detail, preserve event evidence | No | absent |
| Retry policy prevents free farming | No | absent |
| Time/resource/noise/consequence commit atomically with roll | No | only `lastRoll` mutated |
| Improvised effects from bounded classes; unsupported reject | No | 5/8 types falsely report success |
| LLM cannot supply modifiers/roll outcomes/mutations | Mostly | but it *can* supply improvised `amount` and the false "applied" — a boundary hole |
| Replay does not reroll/reapply | Yes (kernel) | inherited |
| Rejected checks preserve state byte-for-byte | Yes (kernel) | inherited |
| Refresh/restart preserves challenge/attempts/revealed info | No | none of these exist |
| Focused tests (Help, opposed, secret, retry, partial, idempotency, rejection) | No | none exist |

## 7. Dependencies and risks

- **#2 (effects)** — hard gate for advantage/disadvantage-as-effect and temporary modifiers. Start #6 only after #2's adv/disadv + additive-mod ops land.
- **#3 (action economy)** — Action/turn cost when a check occurs during combat.
- **#7 (perception)** — information-disclosure tiers and secret-roll sharing; co-design the secret-roll policy.
- **Risk:** retry policy is a new persistent concern (scene-scoped attempt history) with no existing pattern — scope it deliberately (per-check vs per-scene vs per-objective) before building.
- **Risk:** bounded improvisation must *reject* unsupported effect classes; this overlaps with #2's honesty contract and #3's truthful-action rule.

## 8. Recommendation

Sequence: **#2 → #6 → #7** (matches EPIC guide `#2 → #6 → #7`). First sub-slice: replace the hardcoded DC with a server-owned `challenge` definition, add expertise/tool/passive reads, and add advantage/disadvantage cancellation via #2. **Fix the improvise false-success defect early** — it is the single most misleading behavior in the resolution surface today.
