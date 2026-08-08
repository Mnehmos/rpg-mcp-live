# Audit: Social — Disposition, Trust, Reputation, Factions, Law, Promises, Witnesses, and Rumors

Scope: **read-only audit** for GitHub issue `Mnehmos/rpg-mcp-live#13` `[P2][Social] Disposition, trust, reputation, factions, law, promises, witnesses, and rumors`. No code modified; no implementation.
Repo: Lantern (`F:\Github\rpg mcp live`), branch `main` (untracked working tree). Build PASS; tests PASS 86/86. Date: 2026-08-07.
Parent: #1.

Status vocabulary: `LANTERN_IMPLEMENTED` · `LANTERN_PARTIAL` · `LANTERN_STUB` · `CONTENT_ONLY` · `REFERENCE_ONLY` · `ABSENT` · `BROKEN` · `UNKNOWN`.

> **Bottom line.** Social play is a single dice roll against an NPC's `socialDc` that nudges a `relationshipScore` and appends a prose `memory`. That is the entirety of structured social state. There are **no factions, no public reputation, no crimes/witnesses/evidence/wanted-state, no promises/debts/favors/leverage/secrets, and no rumor model.** Merchant prices are server-owned but **do not read relationship/reputation state.** `faction` is a free-text string on character details, not a system. Nearly the entire issue is greenfield and depends on #6 (checks), #7 (knowledge filtering), and #12 (time-delayed propagation).

---

## 1. Method and verification

Code inspected (`file:line`): `src/engine-domain.ts` (`resolveSocialCheck` `:587-623`, `normalizeNpc` `:3913-3922`, `resolveMerchantTrade` `:625-694`), `src/engine-contracts.ts` (`EngineNpc` `:591-600`, `EngineMerchant` `:609-615`, `factionName` free-text `:29,51`), `src/engine-dm.ts` (social prompt guidance `:282`). Grep for `reputation|faction|witness|promise|debt|favor|leverage|secret|rumor|crime|wanted|law|trust|loyalty` across `src` finds **only** free-text/prose usage (`factionName`, prompt strings) — no structured fields. Tests: none cover social beyond the `engine-dm` end-to-end. Observed fact unless labeled inference.

## 2. Current state by the issue's "Audit first" checklist

| Checklist item | Status | Evidence |
| --- | --- | --- |
| NPC disposition and relationship score | `LANTERN_PARTIAL` | `EngineNpc.disposition` enum (`hostile/unfriendly/neutral/friendly/helpful`, `engine-contracts.ts:595`) and `relationshipScore: number` (`:598`). `resolveSocialCheck` adjusts the score ±5/−2 (`engine-domain.ts:605`) and appends a `memory`. **Narrative-only mechanical effect** — no capability/price/access change. |
| Trust, fear, loyalty, hostility, reputation | `ABSENT` | Only `disposition` + scalar `relationshipScore`; no trust/fear/loyalty dimensions; no public reputation. |
| Faction membership / rank / standing | `ABSENT` | `factionName` is free text on character details (`engine-contracts.ts:29,51`); no faction entity, membership, rank, or standing. |
| Merchant reactions and prices | `LANTERN_PARTIAL` | Prices are server-owned (`resolveMerchantTrade` `:625-694`) but **do not read** `disposition`/`relationshipScore`/reputation — the merchant listing's `buyPriceCopper/sellPriceCopper` are static. |
| Crimes, witnesses, evidence, wanted state, legal consequences | `ABSENT` | No crime/witness/evidence/wanted model. |
| Promises, debts, favors, leverage, secrets, blackmail | `ABSENT` | Only prose references (DM prompt `engine-dm.ts:276` mentions "promises"; `player_note_add` may record one as text). No structured obligation. |
| Rumor creation and propagation | `ABSENT` | No rumor entity, source, confidence, truth-relation, or propagation state. |
| Social-check outcome mapping | `LANTERN_PARTIAL` | One fixed mapping: success +5 / failure −2 to `relationshipScore` (`:605`). No reviewed consequence tables; no bounded price/access effect. |
| Whether relationship memories alter mechanics | No | `memories: string[]` are prose; no resolver reads them. |
| Whether the DM can directly set social outcomes without bounded validation | `UNKNOWN`(soft) | The DM authors NPCs and their `socialDc`/`disposition` via `world_context`, so it can *seed* social state freely; outcomes flow only through `resolveSocialCheck`'s fixed mapping. There is no rule preventing the DM from re-authoring an NPC's `relationshipScore` via a new `world_context`. **Inference:** social outcomes are largely DM-authorable today. |

## 3. The "rumor becomes truth" hazard

The issue's hardest correctness requirement: **a propagated rumor must not become world fact.** Lantern has neither rumors nor world-fact predicates, so there is nothing yet to confuse — but the moment #13 adds rumors, it must pair them with an explicit truth-relation field and keep the knowledge layer (#7) separate from world truth. This is the #13 analogue of #7's prompt-filtering boundary.

## 4. First-slice feasibility (issue's KISS slice)

Issue slice: *bargain with a merchant + make a promise → record promise + bounded trust change → witnessed theft/broken promise creates evidence → one faction/reputation value changes → merchant changes price/access within bounds → guard receives rumor/evidence after time passes → future social options differ without exposing hidden facts.*

**What exists:** `social_check` roll + `relationshipScore` + `memories`; server-owned merchant prices; transactional persistence; `player_note_add` for durable facts.

**What must be built (all new):**
- **Distinct values with bounds**: relationship (trust + one of fear/loyalty/hostility), disposition, faction standing, public reputation.
- **Reviewed consequence tables** mapping social-check outcomes to bounded score/price/access changes (replace the fixed ±5/−2).
- **Promises/debts/favors** with stable IDs, parties, terms, status, deadlines, provenance; fulfillment/breach exactly-once.
- **Crime/witness/evidence** records distinguishing accusation from proven fact.
- **Rumors** with source/confidence/truth-relation + one propagation step (must not mint world fact).
- **Bounded price/access rule** reading authoritative relationship/reputation.
- **Time-delayed propagation** (guard response only after #12 time passes).
- **Knowledge filtering** via #7 (hidden social facts excluded from player-facing context).

## 5. Acceptance-criteria → current-state mapping

| AC | Met? | Note |
| --- | --- | --- |
| Relationship/disposition/faction-standing/public-reputation distinct + bounded | No | only disposition + scalar score |
| Social checks cannot directly set arbitrary trust/reputation; map via reviewed tables | No | fixed ±5/−2 mapping |
| Promises/debts/favors: stable IDs, parties, terms, status, deadlines, provenance | No | absent |
| Fulfillment/breach exactly once | No | absent |
| Crime/witness/evidence distinguish accusation from proven fact | No | absent |
| Rumors preserve source/confidence/truth-relation; don't become truth by propagation | No | absent |
| Hidden social facts filtered via #7 | No | absent |
| One merchant price/access rule reads authoritative state | No | prices static |
| One guard/faction response only after #12 time/propagation | No | no clock |
| LLM may narrate but cannot mutate scores/erase evidence/invent standing | Partial | outcomes are engine-mapped, but DM can re-author NPC state via world_context |
| Rejected social changes preserve state byte-for-byte | Yes (kernel) | inherited |
| Replay does not duplicate promises/crimes/evidence/rumors/score changes | Yes (kernel) | inherited, once they exist |
| Refresh/restart preserves obligations/evidence/rumors/social state | Partial | relationshipScore/memories persist; the rest new |
| Tests (promise fulfill/breach, witnessed/unwitnessed crime, false rumor, bounded price, propagation delay, hidden-state filtering, stale version, idempotency) | No | none exist |

## 6. Dependencies and risks

- **#6** — social/contested checks + bounded outcomes.
- **#7** — actor-specific knowledge, secrets, rumors, false beliefs; the prompt-filter boundary.
- **#8** — merchant/currency transactions + stolen-item provenance.
- **#12** — authoritative time and deadlines (propagation delay, promise expiry).
- **#14** — NPC agency consumes these states for off-screen choices.
- **Risk (correctness):** rumor≠truth — needs an explicit truth-relation and a separation from world fact; couple tightly to #7.
- **Risk (boundary):** the DM can re-author NPC social state via `world_context` today; #13 must decide whether social outcomes remain DM-seedable or become engine-gated.

## 7. Recommendation

Sequence: **#6/#7/#8/#12 → #13** (EPIC guide). Build the **bounded consequence tables + promise/obligation records first** (the most reusable primitives), then crime/evidence, then the rumor model with its truth-relation. Keep merchant price/access changes **read-only over authoritative state**, never LLM-authored. Gate all propagation on #12 time.
