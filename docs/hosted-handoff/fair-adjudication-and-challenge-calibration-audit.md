# Audit: Fair Adjudication and Challenge Calibration — Feasibility, Stakes, Outcomes, and Retry Policy

Scope: **read-only audit** for GitHub issue `Mnehmos/rpg-mcp-live#21` `[P1][Adjudication] Fair challenge calibration, feasibility, stakes, outcomes, and retry policy`. No code modified; no implementation.
Repo: Lantern (`F:\Github\rpg mcp live`), branch `main` (untracked working tree). Build PASS; tests PASS 86/86. Date: 2026-08-07.
Parent: #1. Complements #6 (this issue owns the *policy* of when/why to invoke #6's mechanics).

Status vocabulary: `LANTERN_IMPLEMENTED` · `LANTERN_PARTIAL` · `LANTERN_STUB` · `CONTENT_ONLY` · `REFERENCE_ONLY` · `ABSENT` · `BROKEN` · `UNKNOWN`.

> **Bottom line.** Lantern has **no adjudication policy.** Every non-combat attempt either (a) rolls a d20 against a **hardcoded DC** (`combat ? 14 : 12`), (b) rolls against an NPC's DM-authored `socialDc`, (c) is a pure no-op declaration (`interact`), or (d) is `improvise`, whose effect **the DM authors directly** (damage/healing/condition to the player, bounded only by `effectType`). There is **no automatic/impossible classification, no stakes declaration, no partial success or fail-forward, no retry policy, no causal impossibility explanation, and no DC source priority.** "Difficulty" is not a concept anywhere (see #18). This issue and #6 are inseparable — #21 decides *whether and why* to roll; #6 *executes* the roll. Both are greenfield and should be co-designed.

---

## 1. Method and verification

Code inspected (`file:line`): `src/engine-domain.ts` (`resolveCheck` `:1054-1100` incl. hardcoded DC `:1068`, `resolveSocialCheck` `:587-623` incl. NPC `socialDc` `:601`, `resolveInteract` `:816-836` no-op declaration, `resolveImprovise` `:762-799` DM-authored effects), `src/engine-dm.ts` (DM loop selects which tool to call; system prompt `:290` maps intent→tool), `src/engine-contracts.ts` (`roll_check`/`social_check`/`interact`/`improvise` command schemas `:301-308,398-408`, `EngineImprovEffect.effectType` `:953`). This issue shares the evidence base with the #6 audit (`skills-checks-and-improvisation-audit.md`). Observed fact unless labeled inference.

## 2. Current state by the issue's "Audit first" checklist

| Checklist item | Status | Evidence |
| --- | --- | --- |
| When `roll_check`/`social_check`/`interact`/`improvise` are selected | `LANTERN_PARTIAL` | The **DM loop** decides which tool to call (the LLM interprets intent; system prompt `engine-dm.ts:290` gives rough mapping). There is **no engine-side policy** that classifies an attempt as roll/no-roll/impossible — selection is entirely LLM-discretionary. |
| DC sources and caller/model-supplied DCs | `LANTERN_PARTIAL` / `ABSENT`(for checks) | `roll_check` DC is **hardcoded** `combat?14:12` (`engine-domain.ts:1068`) — neither DM- nor model-supplied. `social_check` DC = NPC `socialDc` (`:601`), which the DM authors via `world_context`. **No challenge-definition, no DC source priority, no authored band.** |
| Automatic success and impossibility handling | `ABSENT` | No feasibility classification. An ordinary unlocked door with no pressure still goes to `roll_check` (or `interact` no-op) — there is no "automatic, no roll needed" path. An impossible action (lift a multi-ton gate by hand) has no `impossible` outcome — it would be narrated or rolled like anything else. |
| Declared stakes and consequences | `ABSENT` | `roll_check` records only `lastRoll` (`:1086`) — no stakes, no consequence. `social_check` has one fixed downstream effect (relationshipScore ±5/−2, `:605`). No stakes are declared or made visible. |
| Partial success or fail-forward behavior | `ABSENT` | Outcomes are binary (total ≥ DC or not). No `success-with-cost`/`partial-success`/`failure-with-progress`/`failure-with-complication`. |
| Retry / repetition controls | `ABSENT` | No attempt history; identical checks repeat freely (anti-farming gap, shared with #6). |
| Secret DCs and information disclosure | `ABSENT` | DCs are not secret because they are hardcoded/static; no secret-roll policy; no information-disclosure tier (couples to #7). |
| Whether the DM can create arbitrary consequences or difficulty numbers | **Yes — confirmed** | `improvise` lets the DM author `damage`/`healing`/`condition` directly to the player (`engine-domain.ts:781-793`) with a DM-supplied `amount`; `world_context` lets the DM set NPC `socialDc`; `campaign_beat` introduces arbitrary `pressure`/`choices`. **The DM can mint consequences and DC-ish numbers today** — exactly the authority #21 must bound. |
| How difficulty preference currently changes play | `ABSENT` | There is no difficulty preference (see #18; campaign profile is name/premise/setting/tone only). |

## 3. The improvise authority problem

`improvise` is the live instance of "the DM creates arbitrary consequences." Its `effectType` bounds the *category* (`damage/healing/condition/advantage/disadvantage/movement/summoning/fictional`), and the `amount` is DM-supplied (`engine-domain.ts:784`). For #21, this means the engine already permits LLM-authored consequences within a typed envelope — but with **no feasibility gate, no stakes, no reviewed DC, and no consequence-class policy.** #21's requirement that *"failure outcomes use only bounded consequence classes and cannot mint arbitrary damage/rewards/knowledge"* directly targets this surface: `improvise` must become the execution arm of an `AdjudicationDecision`, not an open DM authoring channel.

## 4. First-slice feasibility (issue's KISS slice)

Issue slice — four adjudications in one scene: (1) **automatic** open door, no pressure; (2) **impossible** lift multi-ton gate — causal reason + valid alternative categories; (3) **uncertain** force barred door under time pressure — derived Athletics + reviewed DC; (4) **failure-with-consequence** — failed attempt advances time/noise and changes the situation; identical retry requires a new approach/state change.

**What exists:** the d20+modifier roll primitive; `social_check`'s NPC-DC pattern as a precedent for a server-owned DC; the transactional commit; `improvise` as a (too-open) consequence channel.

**What must be built (all new — co-designed with #6):**
- A **feasibility classifier**: `automatic | uncertain | impossible`, decided **engine-side** (not LLM discretion).
- **DC source priority**: rule/content → opposed stat → authored challenge → reviewed difficulty band, with the engine owning the final DC.
- **Impossible handling**: reject without mutation + an established-world causal reason + valid alternative-approach categories (no generic refusal).
- **Outcome vocabulary**: `automatic-success / success / success-with-cost / partial-success / failure-with-progress / failure-with-complication / failure-closes-opportunity / impossible` (bounded classes; no arbitrary minting).
- **Stakes** declared and (where appropriate) visible to the player.
- **Retry policy** with attempt history; a *changed approach* adjudicated independently (shared with #6).
- **Time/noise/exposure costs** committing atomically with the roll (couples to #12).
- **Information-disclosure policy** via #7.
- **Difficulty-preference integration** via reviewed policies from #18 (never post-roll dice manipulation).

## 5. Acceptance-criteria → current-state mapping

| AC | Met? | Note |
| --- | --- | --- |
| Every adjudicated attempt records goal, approach, feasibility, rule source, stakes, retry policy, outcome family | No | `roll_check` records only `lastRoll` |
| No roll when success is automatic and no meaningful pressure | No | no automatic path |
| Impossible actions reject without mutation + causal reason (not generic refusal) | No | no impossible path |
| Model may propose difficulty band/stakes; engine owns final DC/consequences | Partial | DM authors `socialDc`/improvise `amount` today; must invert to engine-owned |
| DC priority explicit and deterministic | No | hardcoded DC |
| Failure outcomes use only bounded consequence classes; no arbitrary minting | No | improvise mints DM-authored damage/healing/condition |
| Identical retries follow explicit policy; changed approach adjudicated distinctly | No | no retry policy |
| Secret adjudications preserve event evidence; filter player-visible info via #7 | No | no secret policy |
| Difficulty preferences alter reviewed selection/policy, not dice after roll | No | no difficulty concept |
| Rejected/stale adjudications preserve state byte-for-byte | Yes (kernel) | inherited |
| Replay does not reroll/reapply cost/advance consequence twice | Yes (kernel) | inherited |
| Tests (automatic, impossible, uncertain, partial, fail-forward, closed opportunity, identical retry, changed approach, source-priority, hidden result, stale version, idempotency) | No | none exist |

## 6. Dependencies and risks

- **#2** supplies reusable effect/consequence operations.
- **#6** supplies the check/skill/contest/assistance/improvisation *execution* — #21 supplies the *policy* over it. **Co-design; do not build either alone.**
- **#7** hidden information / secret-roll presentation.
- **#12** authoritative time/noise/deadline costs.
- **#18** difficulty + transparency preferences.
- **#19** consumes this policy for clue/situation resolution.
- **#22** evaluates fairness/clarity/trust.
- **Risk (authority inversion):** the single biggest change is moving the DM from *authoring* consequences/DCs (`improvise`, `socialDc`) to *proposing* them within a bounded envelope the engine finalizes. This is a deliberate narrowing of current DM authority — coordinate with the existing DM-loop contract (`engine-dm.ts`).
- **Risk (fail-forward discipline):** "success at a cost" must not become universal; the issue explicitly forbids "universal success at a cost for every failed roll." Keep consequence classes closed and reviewed.

## 7. Recommendation

Sequence per EPIC: **#6 ↔ #21** (bidirectional; build together), after **#2**, before **#7**. Build the **feasibility classifier + DC source-priority + bounded outcome vocabulary first** (the policy core), then wire `improvise` into it as the consequence-execution arm. Tie difficulty to **reviewed challenge-selection policy** (#18/#21), never to post-roll dice. Make the impossible-action *causal reason + alternatives* a first-class output — it is the clearest signal of a fair, non-arbitrary adjudicator.
