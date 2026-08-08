# Audit: Player Experience Contract — Tone, Difficulty, Adaptive Preferences, Safety, and Feedback

Scope: **read-only audit** for GitHub issue `Mnehmos/rpg-mcp-live#18` `[P1][Experience] Player contract, safety, tone, difficulty, and adaptive preferences`. No code modified; no implementation.
Repo: Lantern (`F:\Github\rpg mcp live`), branch `main` (untracked working tree). Build PASS; tests PASS 86/86. Date: 2026-08-07.
Parent: #1.

Status vocabulary: `LANTERN_IMPLEMENTED` · `LANTERN_PARTIAL` · `LANTERN_STUB` · `CONTENT_ONLY` · `REFERENCE_ONLY` · `ABSENT` · `BROKEN` · `UNKNOWN`.

> **Bottom line.** Lantern's "player contract" is four free-text campaign fields — `name, premise, setting, tone` — set once at creation and passed to the DM as "world canon." There is **no difficulty preference, no pillar weights, no narration-verbosity/style, no guidance level, no rules-transparency toggle, no content boundaries/excluded themes, no safety/fade-to-black controls, no post-session feedback, and no mid-campaign profile update path.** The one piece of good news for this issue: because there is **no difficulty adaptation mechanism at all**, there is also **no hidden manipulation to remove** — the "preferences never rewrite dice" invariant is vacuously true today. #18 is almost entirely greenfield, and its hardest constraint is a *non-requirement* (no engagement-maximization, no secret adaptation) that the current code already satisfies.

---

## 1. Method and verification

Code inspected (`file:line`): `src/engine-contracts.ts` (`engineCampaignProfileSchema` `:172-180`, `LanternCampaignState.campaign` `:984`, `EngineCampaignPhase` `:169`), `src/engine-domain.ts` (`defaultCampaignProfile` `:94-101`, phase transitions `:904,1024`), `src/engine-dm.ts` (system prompt + user-message projection `:264-324`, opening `:103-116`), `src/engine-tools.ts` (no preference/boundary tool in catalog `:128-166`; `character_update` details `:587`), `src/server.ts` (campaign creation requires name/premise/setting/tone `:307`). Grep for `difficulty|preference|boundary|safety|feedback|verbosity|guidance|transparency|fade|exclude` across `src` finds **no** experience-profile model (only `tone` and prompt prose like *"preferences"* in `player_note_add`). Tests: none cover preferences. Observed fact unless labeled inference.

## 2. Current state by the issue's "Audit first" checklist

| Checklist item | Status | Evidence |
| --- | --- | --- |
| Onboarding and campaign-creation preferences | `LANTERN_PARTIAL` | Campaign creation takes `name, premise, setting, tone` (`engine-contracts.ts:172-180`; `server.ts:307` requires all four). That is the entirety of "preferences." No pillar/difficulty/style/guidance/boundary choices. |
| Tone / difficulty / style fields | `LANTERN_PARTIAL` / `ABSENT` / `ABSENT` | `tone` is a free-text string (`:177`), passed to the DM as canon (`engine-dm.ts:269`). **No difficulty field, no narration-style/verbosity field.** |
| Content boundaries and sensitive-topic handling | `ABSENT` | No excluded-theme/boundary/fade-to-black/skip/redirect field or mechanic. |
| Whether preferences are stored separately from character mechanics | `LANTERN_IMPLEMENTED` (trivially) | `campaign` profile (`:984`) is a separate field from `character` (`:990`) — the separation the issue wants already exists, just with almost no content. |
| What preference data enters the DM prompt | `LANTERN_PARTIAL` | The user message passes `campaign` (name/premise/setting/tone), `phase`, `contentPolicy`, `worldContext`, `quests`, `character`, `combat`, `recentLog`, etc. (`engine-dm.ts:305-323`). **No preference projection exists beyond `tone`.** The full `worldContext` is passed unfiltered (see #7). |
| Whether the player can update preferences mid-campaign | `ABSENT` | There is **no campaign-profile update tool**. `campaign_beat` updates `currentBeat`; `world_context` updates the scene; `character_update` updates the sheet — none touch `name/premise/setting/tone`. The profile is immutable after creation. `player_note_add` can record prose "preferences" as notes (`engine-dm.ts:276`, `engine-tools.ts:451`) but these are free-text notes, not a structured profile. |
| Feedback collection after sessions | `ABSENT` | No feedback contract, endpoint, or storage. |
| Any hidden adaptation or difficulty manipulation | `ABSENT` (good) | No difficulty system exists, so nothing manipulates it. The DM system prompt is *more* proactive than adaptive: it instructs ending quiet turns with pressure/choice (`engine-dm.ts:281`) — a pacing directive, not a difficulty adjustment. |
| Privacy/logging of sensitive preference data | `N/A` | No sensitive preference data exists yet. When it does, it must be excluded from ordinary logs/telemetry (issue AC). |

## 3. The vacuous-invariant observation

Issue #18's central safety invariant — *"preferences shape presentation/challenge policy, never committed dice or state"* — is **already satisfied** because there is no preference-driven mechanism at all. The risk for this issue is therefore the *opposite* of most: the temptation, when building it, to wire preferences into mechanics (e.g. "lower difficulty = lower DC"). The audit recommends treating the profile as **read-only input to selection/presentation/prompt-projection only**, with a hard rule that no preference field is ever read by a roll/damage/heal/reward resolver.

## 4. First-slice feasibility (issue's KISS slice)

Issue slice: *create campaign → choose pillar emphasis, standard difficulty, compact narration, one excluded theme → opening + DM response honor choices → change boundary, ask for less combat mid-campaign → future selection/presentation changes → prior mechanical history unchanged → one post-session feedback stored and surfaced.*

**What exists:** a versioned, account-scoped, atomically-persisted campaign record; a separate `campaign` profile field; `tone` already flowing into the DM prompt; the transactional kernel for any new update command.

**What must be built (all new):**
- A **versioned `PlayerExperienceProfile`** (pillar weights, difficulty, narration verbosity/style, guidance, rules-transparency, excluded/fade-to-black themes, feedback history, source/revision/timestamps) — stored **separately** from character mechanics and world truth.
- A **mid-campaign update command** (none exists today — the profile is immutable).
- A **preference projection** into the DM prompt (replace/augment the `tone`-only projection) that **excludes** disallowed themes and is the *only* preference surface the DM sees.
- **Difficulty → reviewed challenge policy** selection (couples to #21; never dice manipulation).
- **Rules-transparency → presentation** toggle (changes what the player sees, not event evidence).
- **Safe redirect/fade/skip** controls that commit **no unwanted fictional detail before the boundary applies.**
- **One post-session feedback** contract (stored, surfaced, separate from mechanics).
- **Audit trail** for preference changes; **sensitive-field exclusion** from logs/telemetry.

## 5. Acceptance-criteria → current-state mapping

| AC | Met? | Note |
| --- | --- | --- |
| Preferences/boundaries explicit, versioned, stored separately from mechanics | No | only name/premise/setting/tone; no versioning of profile |
| DM receives only current allowed projection; excluded content not introduced | No | only `tone` projected; no boundary model |
| Preference changes affect future selection/presentation only; never rewrite mechanics/history | Vacuously yes | no mechanism exists; must stay true when built |
| Difficulty selects reviewed challenge policy, not hidden roll manipulation | No | no difficulty field (see #21) |
| Rules-transparency changes presentation, not event evidence | No | no transparency toggle |
| Safe redirect/fade/skip commit no unwanted detail before boundary applied | No | absent |
| Sensitive fields excluded from ordinary logs and model-usage telemetry | N/A then No | none exist; must be enforced when added |
| LLM cannot modify profile without explicit player-authored command | Partial | no profile *exists* to modify; when built, gate updates behind a player command |
| Rejected/stale updates preserve prior profile byte-for-byte | Yes (kernel) | inherited, once updates exist |
| Replay does not apply preference/feedback twice | Yes (kernel) | inherited |
| Refresh/restart preserves profile + revision | Partial | campaign profile persists; new profile fields new |
| Tests (creation, mid-campaign update, excluded-theme filtering, difficulty-policy selection, stale version, idempotency, no-mechanical-state change) | No | none exist |

## 6. Dependencies and risks

- **#7** owns actor/world-knowledge filtering; #18 owns *player* preferences and boundaries (distinct concerns — do not conflate).
- **#19/#20** consume the profile when selecting situations and framing scenes.
- **#21** owns the challenge-policy that #18's difficulty selects.
- **#22** measures whether the experience matches the selected profile.
- **Risk (anti-pattern):** resist wiring preferences into any resolver. The profile is presentation/selection input only — the strongest guard is an architectural rule that no roll/damage/heal/reward path imports a preference field.
- **Risk (privacy):** excluded themes are sensitive data; they must never enter ordinary logs or model-usage telemetry. Build the exclusion *with* the field, not after.
- **Risk (boundary timing):** safe-skip/fade must apply **before** any fictional detail is generated — the boundary check must precede narration, not follow it.

## 7. Recommendation

Sequence per EPIC: **audit #18 and #21 while Phase 0 implementation proceeds** (both are read-only-audit-first issues). Build the **versioned profile + projection + exclusion rule first** (the safety boundary), then difficulty→policy (with #21), then feedback. Keep the invariant explicit and tested: *no preference field is read by a mechanical resolver.* Do not optimize for engagement — measure agency/fairness/clarity/continuity diagnostically (EPIC rule #12, #22).
