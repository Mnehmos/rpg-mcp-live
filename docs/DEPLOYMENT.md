# Deployment Handoff

Status: reference-engine-only runtime deployed to staging and production; tenant-isolation hardening remains open
Date: 2026-08-13
Repository: `F:\Github\rpg mcp live`

## Railway project

- Project: RPG MCP Live
- Project ID: `e399aea4-85c5-4532-a24a-9504363441bb`
- Environment: production
- Region: us-west2

These identifiers and deployment records were refreshed during the 2026-08-13 reference-only cutover. Refresh them again before the next release.

## Public web service

- Service: `rpg-mcp-live`
- Service ID: `8dd2fefa-966f-4709-8476-2896876a28f7`
- Public domain: https://rpg-mcp-live-production.up.railway.app
- Current verified deployment: query Railway before release; the deployment ID changes per environment and manual redeploy.
- Volume: `rpg-mcp-live-volume`
- Recorded mount: `/app/data`
- Start command: `npm run start:web`

Responsibilities:

- landing page, campaign setup, game shell and dossier;
- Clerk browser session and account identity;
- Stripe Checkout, webhook state and billing portal;
- content-source catalog and attribution rendering;
- player-owned campaign list, create/open flow, and confirmation-gated deletion;
- authenticated proxy to the reference engine.

## Reference engine service

- Service: `mnehmos-rpg-mcp`
- Service ID: `87690d39-ce48-44b7-8fbb-7f86b6d1f47e`
- Private hostname: `mnehmos-rpg-mcp.railway.internal`
- Staging service: `mnehmos-rpg-mcp-staging` (`62653549-7804-4ef9-8f9e-d44002246fff`)
- Volume: `mnehmos-rpg-mcp-volume`, mounted at `/app/data`
- Start command: `node dist/server/index.js --http`
- Health path: `/health`
- Source: `Mnehmos/mnehmos.rpg.mcp`
- MCP path: `/mcp`

This is the only gameplay backend. The web service reaches `http://mnehmos-rpg-mcp.railway.internal:3000/mcp` with `REFERENCE_ENGINE_TOKEN`. There is no Lantern engine service or backend switch.

The reference engine main identity is `e16711f4b78ff23d20439ee1b6668eb6f0baae5a`. Staging uses the environment-specific private hostname for `mnehmos-rpg-mcp-staging`; do not use the production hostname from staging.

## Rules identities

Pre-release executable identity:

- pack: `open5e-v2-srd-2014-s1`;
- hash: `7a30c58868cb9dfd87124582a26f95cfa43577d948f3bfc5311e7ab52eb03bf3`;
- tools: 35 in that historical deployment.

Pre-release persistence identity:

- campaigns: 4, all `lantern-rules-0.1`;
- commands: 42, all resolved;
- events: 38, all content-free and unversioned;
- persisted source-content markers: 0;
- SQLite `quick_check`: `ok`.

Current hosted identity after release:

- active pack: `open5e-v2-full-corpus-s8`;
- hash: `56bdfbda9d59a398f3c9cb0e02aaf2b411e4280e99fb32c550cf158b38f7b07f`;
- installed historical packs: S1 and S7;
- tools: 41;
- campaigns: 4, all active S8;
- commands/events: 46 / 42;
- event evidence: 38 legacy unversioned plus four modern migration events, zero resolution failures.

Local release candidate:

- active pack: `open5e-v2-full-corpus-s8`;
- hash: `56bdfbda9d59a398f3c9cb0e02aaf2b411e4280e99fb32c550cf158b38f7b07f`;
- installed historical packs: S1 and S7;
- tools: 41;
- default partition: `5e-2014` / `srd-2014`;
- default licenses: `cc-by-40,cc0`;
- OGL documents: opt-in beneath the deployment ceiling.

Deployment alone never migrates campaigns. During this release, the legacy aggregates and events remained readable after the engine cutover, while ordinary mutation rejected with `campaign_repin_required` until each campaign was explicitly re-pinned. S1 and S7 stay installed for exact pack-backed history and future migrations; they were not the source identity of these four campaigns.

Railway SSH access for the release audit uses the dedicated account key named `rpg-mcp-live`, fingerprint `SHA256:Sl2utGEkfNyXAYGL/0yalSLf2iKBGPTWDLJ8OIc0vSo`. Its private key remains outside the repository and must never be copied into Railway variables or documentation.

## Secret placement

Provider/engine services:

- `RPG_MCP_TRANSPORT_TOKEN`;
- `OPENROUTER_API_KEY` on the web host for DM orchestration and on the
  reference engine when agent-backed NPCs are enabled;
- any provider-side usage/telemetry secret.

Web only:

- `REFERENCE_ENGINE_TOKEN` (matches `RPG_MCP_TRANSPORT_TOKEN` set on the `mnehmos-rpg-mcp` service);
- Clerk publishable and secret keys;
- Stripe secret key, price ID and webhook secret.

Never copy provider, Clerk secret, Stripe secret or webhook values into browser assets, docs, Git, tool arguments, logs, or migration reports. The internal engine token must match across services but is not recorded here.

## Non-secret configuration

Reference engine baseline:

~~~text
NODE_ENV=production
ENGINE_PORT=8080
RPG_DATA_DIR=/app/data
RPG_MCP_TRANSPORT_TOKEN=<secret>
PORT=3000
OPENROUTER_MODEL=deepseek/deepseek-v4-flash
OPENROUTER_REASONING_EFFORT=medium
OPENROUTER_MAX_TOKENS=2500
OPENROUTER_SITE_URL=https://rpg-mcp-live-production.up.railway.app
OPENROUTER_FALLBACK_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_FALLBACK_MODEL=<reviewed fallback model, if enabled>
OPENROUTER_FIRST_TOKEN_TIMEOUT_MS=8000
LLM_USAGE_INPUT_COST_USD_PER_MILLION=0.0574
LLM_USAGE_OUTPUT_COST_USD_PER_MILLION=0.1148
LLM_USAGE_PLAYER_MONTHLY_TARGET_COST_USD=2.00
LLM_USAGE_PLAYER_MONTHLY_COST_USD=4.00
LLM_USAGE_TURN_ADMISSION_RESERVE_COST_USD=0.01
LLM_USAGE_GLOBAL_DAILY_COST_USD=5.00
LLM_USAGE_GLOBAL_MONTHLY_COST_USD=25.00
CONTENT_ALLOWED_GAMESYSTEMS=5e-2014
CONTENT_DEFAULT_BASE_DOCUMENT=srd-2014
CONTENT_BASE_DOCUMENTS=srd-2014
CONTENT_ALLOWED_LICENSES=cc-by-40,cc0,ogl-10a
CONTENT_ALLOWED_DOCUMENTS=core,elderberry-inn-icons,open5e,srd-2014,tdcs,toh
~~~

Player Pass accounts are gated only by `LLM_USAGE_PLAYER_MONTHLY_COST_USD`.
Free accounts retain their daily and monthly caps, and the global daily and
monthly brakes remain deployment-wide provider safeguards.

Web baseline:

~~~text
NODE_ENV=production
DEV_AUTH_BYPASS=false
REFERENCE_ENGINE_URL=http://mnehmos-rpg-mcp.railway.internal:3000/mcp
REFERENCE_ENGINE_TIMEOUT_MS=30000
~~~

`REFERENCE_ENGINE_TOKEN` is a secret (see Secret placement above) and is not shown in this baseline block.

The web host records every OpenRouter DM completion and nested NPC-agent
completion in its account-bound SQLite ledger. `GET /api/usage` returns the
authenticated player's UTC daily/monthly prompt, completion, reasoning, total
token, and actual USD totals. Raw token counts are diagnostics. A command is
admitted once, before any game-state mutation, using settled dollar cost plus a
short-lived per-turn reservation; all provider calls needed to finish that
admitted turn may then complete. The admission reservation makes concurrent
commands count atomically against user and deployment-wide dollar brakes. The
Player Pass target is distinct from its hard next-turn admission ceiling.
Reservations still protect standalone provider calls and the per-request
safety brake. The defaults above are the fallback estimate for the pinned
DeepSeek V4 Flash route; provider-reported settled cost remains authoritative.
When model or provider pricing changes, update the two input/output rate
variables and review the target, admission reserve, and hard ceilings.

Do not broaden the document/license ceiling during the S8 migration. OGL rollout is a separate product/legal decision with its own attribution check.

## Stripe test catalog

- Product: Lantern Table Player Pass
- Price: 5 USD/month
- Mode: test
- Entitlement source: signature-verified, idempotently recorded Stripe webhook state

Checkout success redirects are not entitlement proof. Keep the product in test mode until usage limits, support, privacy, backup/restore, deletion and tax/registration work are complete.

## Local candidate evidence

- Active S8 installed-pack verification passes.
- Source and tools TypeScript checks pass.
- All 82 automated tests pass.
- Production build passes.
- Built two-service HTTP smoke passes with web/engine health, exact S8 hash, 41 tools, policy catalog, source-backed character creation, inventory/currency, combat, compiled multiattack, and disposable campaign deletion evidence.
- S1-to-S8 deterministic review SHA: `7f8fdf0e0716b8cd9d26325a78a2718b5b7af3052154543130bc30b7f9076970`.
- Legacy-to-S8 deterministic review SHA: `1c7e72b9b6d57e2ca9de10e6bed524e2ba62272ef09adc1e4cffbceb86c8f38d`.
- A production-copy dry-run migrated 4/4 campaigns, preserved the 38 original-event digest exactly, passed `quick_check`, and resolved all 42 resulting events.

## Hosted release record and repeatable runbook

The numbered S8 migration steps below are the historical Lantern-engine release record. They are retained as audit evidence and must not be executed against the current `mnehmos-rpg-mcp` service. Current releases use the paired reference-engine health checks and the protected GitHub/Railway flow described above.

### 1. Inspect without mutation - completed

- Confirm CLI account, project, environment and linked services.
- Record current deployment IDs, health, start commands, domains and variable names.
- Confirm engine volume mount and database file size.
- Confirm production health still reports the expected S1 executable hash and the database audit still reports four `lantern-rules-0.1` campaigns before using the committed legacy-to-S8 review.

If the executable identity or persisted rules distribution changed, stop and regenerate the audit/plan from the actual live state.

### 2. Back up the engine database - completed

- Use SQLite's online backup operation so the WAL-backed database is copied consistently.
- The verified pre-release backup is `/app/data/lantern-engine-pre-s8-20260807-s9.db`: 220 pages, 901,120 bytes, SHA-256 `60f76afd220fd9fbbc5d0eda9a6d349020f11b8fc221368e2d853f79a758f727`.
- A downloaded copy matched the remote digest, opened independently, passed `quick_check`, and completed the full disposable migration.
- Refresh the backup if any live campaign version or event count changed after this evidence was recorded.

Do not run the first production re-pin without a verified backup.

### 3. Deploy engine candidate - completed

- Deploy the exact locally gated source to `lantern-engine` first.
- Verify `/health` reports active S8, the exact hash, S1/S7 historical packs and 41 tools.
- Read an existing legacy campaign and its unversioned events.
- Confirm an ordinary mutation rejects with `campaign_repin_required` and leaves the campaign unchanged.

### 4. Deploy web candidate - completed

- Deploy the same source revision to `rpg-mcp-live`.
- Verify public health reaches the private engine.
- Verify `/api/config`, CSP, Clerk bootstrap, content catalog and attribution assets without exposing secrets.
- Confirm an unauthenticated campaign request returns 401.

### 5. Plan every campaign - completed

Run inside the engine service context so the mounted database and installed packs are exact:

~~~powershell
node dist/content-repin-cli.js plan --from lantern-rules-0.1 --to open5e-v2-full-corpus-s8 --database /app/data/lantern-engine.db --account <account-id> --campaign <campaign-id>
~~~

Every current campaign must report `accepted: true` and zero content markers. Any source-content marker blocks the legacy migration; do not use `--approve-changed` to bypass it.

### 6. Apply reviewed re-pins - completed

~~~powershell
node dist/content-repin-cli.js apply --from lantern-rules-0.1 --to open5e-v2-full-corpus-s8 --database /app/data/lantern-engine.db --account <account-id> --campaign <campaign-id> --confirm-review-sha 1c7e72b9b6d57e2ca9de10e6bed524e2ba62272ef09adc1e4cffbceb86c8f38d --client-command-id <unique-uuid>
~~~

After each apply, verify the aggregate version increased once, `rulesVersion` is S8, one migration event exists, old event bytes still resolve as legacy unversioned evidence, and normal mutation is legal again. The disposable run produced versions `21 -> 22`, `17 -> 18`, `0 -> 1`, and `0 -> 1`; live values must be replanned immediately before apply.

### 7. Authenticated browser acceptance - pending attached browser

- Sign in through Clerk.
- Create/select a campaign and source policy.
- Create a character from live options, complete tutorial and enter sandbox.
- Send a natural-language turn that causes an OpenRouter tool call and authoritative event.
- Refresh and verify ordered player message followed by DM response, sheet, inventory, notes, log and attribution.
- Exercise one rejection and verify no version/resource change.
- Verify Stripe test entitlement and portal behavior separately.

## Rollback

- Before any re-pin: redeploy the last verified S1 code if the candidate fails; the legacy database remains compatible with that executable.
- After a re-pin: do not deploy S1 code over S8 aggregates. Keep the dual-registry candidate running while fixing forward, or restore the verified pre-migration database backup before rolling code back.
- Never rewrite or delete migration or historical events as a rollback shortcut.

## Current blockers

- Scheduled off-volume backup and a complete Railway restoration drill remain unproven.
- Authenticated Clerk/OpenRouter browser acceptance remains outstanding.
- Usage/cost limits remain required before real subscriptions are sold.
