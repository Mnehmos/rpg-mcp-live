# Session handoff: production outage, first-session funnel, harness gates, billing sync

Dates: 2026-10-22 → 2026-10-25. Repos: `Mnehmos/rpg-mcp-live` (web), `Mnehmos/mnehmos.rpg.mcp` (reference engine).
Production at hand-off: web `d8f6494` (#338), engine `8b88726`. Railway project **RPG MCP Live**, environment `production`.

> **Bottom line.** Players were not churning; they never got to play. The DM's OpenRouter key expired, and **every turn failed from 2026-09-18 18:34 UTC until 2026-10-22** (197 failures, 32 players), on top of a mostly broken DM since about 2026-09-07. Of about 74 Clerk sign-ups, 52 sent a turn but only **11 ever got one through**. The only live Player Pass belongs to the owner's own account. The key is fixed, the first-session funnel is repaired, and the remaining work is four open PRs plus verifying the new Stripe webhook on the 2026-10-26 renewal.

---

## 1. Owner directives (standing)

- **KISS harness, trust but verify.** No arbitrary stop gates on the DM model: no `max_tokens`, no tool-round limits, no forced "stop calling tools / narrate now" switches, no harness classifier deciding what is state-changing. The engine verifies; the model decides. Time limits exist **only to detect hangs**. Cheap models are the cost control.
- **Model:** `deepseek/deepseek-v4.1-flash-1017` for everyone (DM and NPC agents). No tiers.
- **Free tier:** **$0.50/month**, **no daily limit** (about 50–70 turns at about $0.007/turn on 1017). Player Pass: $5/month.
- Dollar-based usage gates are a business control; confirm with the owner before changing them.

## 2. Root causes found (evidence)

| Problem | Evidence | Status |
| --- | --- | --- |
| OpenRouter key expired, so every turn got a 401 | Web logs: `OpenRouter request failed with status 401 … API key expired` from 2026-09-24 (log window start) on; DB: last `resolved` command 2026-09-18T18:32Z | Fixed: new key, web redeployed 2026-10-22; engine redeployed 2026-10-22 (it had been running the 2026-08-26 deploy with the old key) |
| Health reported OK throughout | `/api/health` reports integrations as *configured*, not *working* | **Open**: health does not test the key |
| Opening intermittently blank ("The opening paused") | After #326 streaming, an assembled stream always had a `message`, so the empty-completion retry never fired | Fixed in #335 |
| Play now lost across sign-up | Pending quickstart was in-memory only; hosted sign-up page reloads the app | Fixed in #335 (persisted intent with request id; idempotent claim on the server) |
| Confusing first-minute copy | Opening instruction rendered as a **YOU** line; "begin by creating the character" after Play now; "still reconciling" on ordinary slow turns | Fixed in #335 |
| "Return to campaign" started a **new** random campaign | Header CTA relabelled but kept `data-action="play-now"` | Fixed in #336 |
| Free tier blocked a new player after 1 turn | `LLM daily usage limit reached` at admission; $0.05/day vs about $0.02/turn on `v4.1-flash` | Fixed: model switched to 1017, daily limit removed (#338 plus env) |
| Turn failed at 17 tool rounds | DB `failure_json`: `toolRounds:17 … phase:"narration"` (2026-10-24) | Fixed in #339 (cap removed) |
| Player Pass never renewed or lapsed locally | Live Stripe had **no** Quest Keeper webhook endpoint (only ProveCalc's, `checkout.session.completed`); one DB row was a **test-mode** subscription in the live DB | Webhook created 2026-10-25; code fix in **#340 (open)** |
| Production promotion failed | `verify-staging` step got `gh: Bad credentials (HTTP 401)` | Fixed: `PRODUCTION_PROMOTION_TOKEN` replaced (fine-grained PAT, Contents read/write on this repo) |

## 3. Shipped (merged and live)

| PR | Summary |
| --- | --- |
| #335 | Retry blank streamed completions; drop DM `max_tokens`; keep Play now across sign-up (persisted intent, `withSignUp`, idempotent `quickstart_requests` claim: `claimed`/`open`/`done`, 2-min stale takeover, resume same campaign and preset); hide the opening instruction; copy fixes |
| #336 | "Return to campaign" reopens the player's campaign |
| #337 | `turn_completed` log line per successful turn/opening (user, plan, campaign, duration, cost, calls, rounds, state changes; no player text) |
| #338 | Free daily limit `0` means none (default); usage display counts down to the monthly reset |
| #339 | Remove `MAX_TOOL_ROUNDS` and the forced-narration (`tool_choice: "none"`) gate |

## 4. Open PRs (CI green, review findings addressed, not merged)

Merge order: **#340 any time · #341 before #342 (they conflict; rebase #342 after #341 lands) · engine #111 any time.**

| PR | Summary | Review findings fixed in-branch |
| --- | --- | --- |
| rpg-mcp-live **#340** | Billing sync: re-read entitled rows with an ended period from Stripe on session load (1/min/account); Stripe `resource_missing` revokes (`missing`); only `STRIPE_PRICE_ID` grants entitlement (account shared with ProveCalc) | P1: a `missing` binding no longer blocks a new paid subscription. P2: the account's own subscription moving off the price is revoked (`not_player_pass`) |
| rpg-mcp-live **#341** | Remove the regex "authoritative action" gate (routing hint, `tool_choice: "required"`, prose-turn failure); the model decides. NPC agents: no `maxTokens`/`budgetTokens` in the prompt, model 1017 | — |
| rpg-mcp-live **#342** | Stream each engine result live (`{type:"tool"}` progress → table-move chip; status while thinking); all provider requests stream; whole-request 60s abort and 120s turn deadline replaced by an idle watchdog (abort only after `timeoutMs` of silence); `tool_call` log line (name, action, accepted, stateChanging, durationMs, resultChars, `exceedsReplayLimit`, outcome fields) | P2: the command lease is renewed every 60s while a turn works (a stream can outlast the 5-min lease) |
| mnehmos.rpg.mcp **#111** | NPC agent calls send no output cap (old default `maxTokens` 800); only an explicit `budgetTokens` bounds a call | Major: the prompt estimate is reserved before the budgeted completion limit; `budget_exhausted` is returned without a provider call if nothing remains |

## 5. Production configuration changed this session

`rpg-mcp-live` service variables (set via Railway):

- `OPENROUTER_API_KEY`: new key (owner rotated); `$50/week` limit on the key.
- `OPENROUTER_MODEL=deepseek/deepseek-v4.1-flash-1017` (was `deepseek-v4.1-flash`, $0.30/$1.20 per M). Fallback is still `z-ai/glm-5.3-flash`.
- `LLM_USAGE_FREE_MONTHLY_COST_USD=0.50` (was 0.25); `LLM_USAGE_FREE_DAILY_COST_USD=0` (was 0.05).
- `LLM_USAGE_INPUT_COST_USD_PER_MILLION=0.15`, `LLM_USAGE_OUTPUT_COST_USD_PER_MILLION=0.60` (1017 list prices; estimate only, settlement uses provider cost).
- `STRIPE_WEBHOOK_SECRET`: new, for the endpoint below.
- **Unchanged but worth a decision:** `LLM_USAGE_GLOBAL_DAILY_COST_USD=5`, `LLM_USAGE_GLOBAL_MONTHLY_COST_USD=25` (service-wide brakes that will stop *all* players once hit).

Stripe (live): endpoint `https://play.questkeeperai.com/api/webhooks/stripe`, events `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `charge.refunded`, `charge.dispute.created`. **Not yet observed delivering.** The owner's pass renews 2026-10-26, which should produce `customer.subscription.updated`.

GitHub: `PRODUCTION_PROMOTION_TOKEN` replaced 2026-10-23. Set an expiry reminder; an expired token silently stops production promotion at the last step.

## 6. Data snapshot (2026-10-25)

| Metric | Value |
| --- | --- |
| Clerk sign-ups | about 74 (owner screenshot) |
| Players with a campaign / sent a turn / got a turn | 56 / 52 / **11** |
| Turns resolved / failed (all time) | 92 / 297 |
| Successful turns per player | 0: 41 · 1: 5 · 2–3: 5 · 11+: 1 (owner playtesting) |
| New players since the fix (2026-10-22) | 2 (excluding the owner and the `admin@provecalc.com` test account `user_3L41iTNra`) |
| Cost per turn | about $0.02 on `v4.1-flash`; about **$0.007** on 1017 (first measurements) |
| Subscriptions | `user_3IQCbFwr0` live, owner's own, renews 2026-10-26 (DB still says 2026-09-26 until the webhook/#340); `user_3HYRVUZ9N` **test-mode** subscription in the live DB (revoked by #340 on next session load) |

## 7. Known gaps and decisions still open

1. **Engine NPC agent `timeoutMs`** is a total-time abort (agent calls don't stream). Making it a true hang detector needs streaming agent calls. Owner has not decided.
2. **Tool-result replay truncation (4,000 characters)** is still in place. #342's `tool_call.exceedsReplayLimit` will show whether it ever triggers; decide from data.
3. **Health check** should exercise the provider key (and alert after N consecutive failed turns). The Sep 18 outage was silent for five weeks.
4. **Clerk dashboard copy:** the app name still reads "RPG MCP Live", and the sign-in dialog greets new players with "Welcome back!" (dashboard settings, not code).
5. **Funnel ideas the owner has not yet chosen to build:**
   - guest play before sign-in (opening plus 3 turns)
   - a win-back email to the 41 players who never got a working turn
   - an upgrade prompt at the free limit
6. **Turn latency** is 26–86s for openings and about 30s for turns; #342 makes progress visible but does not make it faster.
7. **Full test suite:** `src/content/*`, `content-catalog`, and `engine` tests time out at 5s under full-suite load locally (they also fail on `main`; they pass in isolation and in CI).

## 8. How to look at production (read-only)

- Successful turns: `railway logs --service rpg-mcp-live | grep turn_completed`; tool calls (after #342): `grep tool_call`; failures: `grep streamed_turn_failed`.
- Database (SQLite at `/app/data/rpg-mcp-live.db`): `railway ssh --service rpg-mcp-live -- "<command>"`. Write the script to `/app/.<name>.cjs` (so `better-sqlite3` resolves), open the DB with `{ readonly: true }`, and delete the file afterwards. Command status values are `resolved` / `failed` (not `completed`). Successful-turn data: `reference_engine_commands`; spend: `llm_usage` (`cost_source='provider'`).
- Requires the operator's SSH key registered with `railway ssh keys add` and Railway's host key in `known_hosts`.
- Stripe: `https://dashboard.stripe.com/webhooks` (live mode) for endpoint deliveries. The account is shared with ProveCalc.
