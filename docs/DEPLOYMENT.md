# Deployment Handoff

Status: S8/S9 and campaign-manager deletion flow deployed; legacy campaigns migrated and audited; authenticated browser acceptance pending  
Date: 2026-08-07  
Repository: `F:\Github\rpg mcp live`

## Railway project

- Project: RPG MCP Live
- Project ID: `e399aea4-85c5-4532-a24a-9504363441bb`
- Environment: production
- Region: us-west2

These identifiers and deployment records were refreshed during the 2026-08-07 release. Refresh them again before the next release.

## Public web service

- Service: `rpg-mcp-live`
- Service ID: `8dd2fefa-966f-4709-8476-2896876a28f7`
- Public domain: https://rpg-mcp-live-production.up.railway.app
- Current verified deployment: `11c55560-3d12-4815-9b13-eced61300469` (`SUCCESS`)
- Volume: `rpg-mcp-live-volume`
- Recorded mount: `/app/data`
- Start command: `npm run start:web`

Responsibilities:

- landing page, campaign setup, game shell and dossier;
- Clerk browser session and account identity;
- Stripe Checkout, webhook state and billing portal;
- content-source catalog and attribution rendering;
- player-owned campaign list, create/open flow, and confirmation-gated deletion;
- authenticated proxy to the private engine.

## Private engine service

- Service: `lantern-engine`
- Service ID: `2536aaf9-66c7-42ec-ada5-4966579ac31f`
- Private hostname: `lantern-engine.railway.internal`
- Port: `8080`
- Current verified deployment: `a4a50b7f-53ed-4bae-8c62-473b0b92e033` (`SUCCESS`)
- Volume: `lantern-engine-volume`
- Volume ID: `664e9ba1-0dd5-48c0-90f5-f080619c9b10`
- Mount: `/app/data`
- Database: `/app/data/lantern-engine.db`
- Start command: `npm run start:engine`
- Health path: `/health`

The engine has no public domain. The web service reaches `http://lantern-engine.railway.internal:8080` with the shared internal token.

## Reference-engine A/B service (ADR-H13 override, 2026-08-11)

- Service: `mnehmos-rpg-mcp`
- Service ID: `87690d39-ce48-44b7-8fbb-7f86b6d1f47e`
- Public domain (temporary, used for live verification during development): https://mnehmos-rpg-mcp-production.up.railway.app — remove this domain once the web service is confirmed reaching it over the private network, since it needs no public exposure in normal operation.
- Volume: `mnehmos-rpg-mcp-volume`, mounted at `/app/data`
- Start command: `node dist/server/index.js --http`
- Health path: `/health`
- Source: `Mnehmos/rpg-mcp` (a clone of the reference engine with an added Streamable-HTTP transport; the canonical repo at `F:\Github\mnehmos.rpg.mcp` has no HTTP transport)

Not the default backend — campaigns opt in per-campaign via `POST /api/campaigns/:id/engine-backend`. See `docs/ADR-H13-reference-engine-boundary.md`'s 2026-08-11 update for why this service exists despite that ADR's original "do not deploy" decision, and `src/reference-engine-store.ts` for the tenant-isolation mechanism that makes it safe to do so.

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

Engine only:

- `ENGINE_INTERNAL_TOKEN`;
- `OPENROUTER_API_KEY`;
- any provider-side usage/telemetry secret.

Web only:

- `ENGINE_SHARED_SECRET`;
- `REFERENCE_ENGINE_TOKEN` (matches `RPG_MCP_TRANSPORT_TOKEN` set on the `mnehmos-rpg-mcp` service);
- Clerk publishable and secret keys;
- Stripe secret key, price ID and webhook secret.

Never copy provider, Clerk secret, Stripe secret or webhook values into browser assets, docs, Git, tool arguments, logs, or migration reports. The internal engine token must match across services but is not recorded here.

## Non-secret configuration

Engine baseline:

~~~text
NODE_ENV=production
ENGINE_PORT=8080
ENGINE_DATABASE_PATH=/app/data/lantern-engine.db
OPENROUTER_MODEL=openai/gpt-5.6-luna
OPENROUTER_REASONING_EFFORT=medium
OPENROUTER_MAX_TOKENS=2500
OPENROUTER_SITE_URL=https://rpg-mcp-live-production.up.railway.app
OPENROUTER_FALLBACK_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_FALLBACK_MODEL=<reviewed fallback model, if enabled>
OPENROUTER_FIRST_TOKEN_TIMEOUT_MS=8000
CONTENT_ALLOWED_GAMESYSTEMS=5e-2014
CONTENT_DEFAULT_BASE_DOCUMENT=srd-2014
CONTENT_BASE_DOCUMENTS=srd-2014
CONTENT_ALLOWED_LICENSES=cc-by-40,cc0,ogl-10a
CONTENT_ALLOWED_DOCUMENTS=core,elderberry-inn-icons,open5e,srd-2014,tdcs,toh
~~~

Web baseline:

~~~text
NODE_ENV=production
DEV_AUTH_BYPASS=false
ENGINE_URL=http://lantern-engine.railway.internal:8080
ENGINE_TIMEOUT_MS=30000
REFERENCE_ENGINE_URL=http://mnehmos-rpg-mcp.railway.internal:3000
REFERENCE_ENGINE_TIMEOUT_MS=30000
~~~

`REFERENCE_ENGINE_TOKEN` is a secret (see Secret placement above) and is not shown in this baseline block.

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
