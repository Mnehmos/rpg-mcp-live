# RPG MCP Live

RPG MCP Live is the Lantern Table product workspace: a browser game where one player describes what their character does and a server-authoritative engine resolves the result.

This repository is the new hosted Lantern boundary. The existing F:\Github\mnehmos.rpg.mcp repository is a reference engine and rules laboratory. It is not copied into this app, it is not the production backend, and it must not be routed into the Lantern player loop.

## Product boundary

~~~text
Player browser
  -> Lantern web service (public Railway)
      -> Clerk-authenticated campaign API
      -> private HTTP call
          -> Lantern engine service (Railway private network)
              -> tenant-scoped persistence
              -> structured authoritative events
              -> OpenRouter DM tool loop
~~~

The web page and engine are separate deployable services from the first hosted cut. KISS means two small services with one clear HTTP boundary: natural language and model output propose intent; the Lantern engine validates, resolves, and commits state.

## Local development

Requirements: Node 20.18.x and npm.

~~~powershell
npm install
Copy-Item .env.example .env

# terminal 1
npm run dev:engine

# terminal 2
npm run dev:web
~~~

Open http://localhost:3000. The web service calls the engine at http://localhost:3100. With the example settings, the web server uses an explicit local player identity so the shell can be exercised before Clerk credentials are configured. This bypass is for local development only; set DEV_AUTH_BYPASS=false on Railway.

Useful checks:

~~~powershell
Invoke-RestMethod http://localhost:3100/health
Invoke-RestMethod http://localhost:3000/api/health
npm run check
npm test
npm run build
~~~

## Integrations

Clerk authenticates the browser session and supplies the account identity used for campaign ownership. Stripe Checkout and signed webhooks control the Player Pass entitlement. The private engine owns the OpenRouter connection and tool loop using deepseek/deepseek-v4-flash.

Secrets belong in local ignored environment files or Railway secret variables. Never put Clerk secret keys, Stripe secret keys, webhook secrets, or OpenRouter keys in public browser code, Git, or a model-facing tool configuration.

The current test catalog is a recurring 5 USD/month Player Pass. It does not make the game engine complete and it is not public-launch readiness.

## Engine tools

The engine currently registers 74 constrained model-facing tools. The canonical
catalog is `lanternToolDefinitions` in `src/engine-tools.ts`; `/v1/tools` and the
health `toolCount` consume that same array. DM requests start with a compact
17-tool core and load one reviewed capability family on demand through the
engine-owned `capability_load` path. The three
`experience_*` commands are explicit player-only engine commands and are not
accepted by the generic model-facing tool-call endpoint.

Read tools inspect authoritative state. A player turn may contain multiple ordered typed effects, but the engine validates and commits the complete plan as one versioned transaction. The DM may request tools, but the engine owns rolls, DCs, modifiers, turn legality, resource changes, persistence, and event evidence.

`content_search` and `content_get` read the verified local Open5e pack. They never contact Open5e, never change campaign state or version, and enforce the campaign game system plus the deployment's document/license policy. Mechanically resolving a record also requires the record's declared fidelity tier; reference-only prose is never promoted into improvised numbers.

The player dossier is engine-backed: the full Open5e-informed character sheet, exact currency breakdown, equipment/inventory, quest journal, campaign pressure, ordered log, and durable notes are returned with the session. A new sandbox has no preset room or location; the DM establishes the current world context when play gives one a name. The DM may author original content through typed tools; the engine resolves only the mechanical consequences.

Signed-in players manage their own campaign list from the same shell: open a world, start another, or remove an unwanted campaign through a version-checked confirmation. Removal cascades that campaign's engine state, commands, and events only; Clerk identity, Stripe billing, and other campaigns are unaffected.

The pinned rules foundation is documented in [docs/OPEN5E-RULES.md](docs/OPEN5E-RULES.md).

The active deterministic S8 full-corpus pack can be rebuilt with an explicit source timestamp:

~~~powershell
npm run open5e:import -- --slice s8 --source-fetched-at 2026-08-07T06:16:36.932Z --page-size 100
npm run open5e:verify -- --slice s8 --source-fetched-at 2026-08-07T06:16:36.932Z --page-size 100
npm run open5e:verify-pack
~~~

The active local pack is `open5e-v2-full-corpus-s8`, hash `56bdfbda9d59a398f3c9cb0e02aaf2b411e4280e99fb32c550cf158b38f7b07f`. It captures all 24 discovered documents, 3,541 creatures, 1,955 spells, 440 ordinary items, and the remaining Open5e v1/v2 collections. Reviewed SRD-2014 records retain their typed or executable tier; every unreviewed source variant stays reference-only and fails closed when mechanical execution is requested.

Runtime campaign state stores only content references and mutable instance data. The importer is the only code path that contacts Open5e. Campaign policy selects one game system, a base document, enabled source documents, and licenses beneath the deployment ceiling; the browser surfaces matching attribution.

Pack upgrades use a deterministic review and explicit administrative re-pin. The inspected Railway database predated content packs, so this release used the strict legacy review:

~~~powershell
npm run open5e:repin -- diff --from lantern-rules-0.1 --to open5e-v2-full-corpus-s8 --out docs/generated/LANTERN-LEGACY-S8-MIGRATION.md
npm run open5e:repin -- plan --from lantern-rules-0.1 --to open5e-v2-full-corpus-s8 --database <database> --account <account-id> --campaign <campaign-id>
npm run open5e:repin -- apply --from lantern-rules-0.1 --to open5e-v2-full-corpus-s8 --database <database> --account <account-id> --campaign <campaign-id> --confirm-review-sha 1c7e72b9b6d57e2ca9de10e6bed524e2ba62272ef09adc1e4cffbceb86c8f38d
npm run open5e:audit-migration -- --database <database>
~~~

S9 keeps S1, S7, and S8 installed together. Pack-backed historical events resolve with the exact pack recorded when they were committed. Pre-pack events are accepted only when they contain neither a rules identity nor content keys; they are never rewritten. Old campaigns remain readable but reject new mutations until an explicit reviewed re-pin.

## Current status

The local S0-S9 implementation plus the legacy migration seam passes pack verification, type checking, the 83-test regression suite, and the built two-service HTTP smoke against S8. The engine owns tenant-scoped state, rules, tools, events, and the OpenRouter DM loop; the web service owns Clerk, Stripe, browser assets, content-source setup, attribution, and the authenticated proxy.

Railway now runs the verified S8 pair plus the player-owned campaign manager. The private engine deployment is `a4a50b7f-53ed-4bae-8c62-473b0b92e033`; the public web deployment is `11c55560-3d12-4815-9b13-eced61300469`. All four legacy campaigns were reviewed and migrated exactly once; all 38 original events remain byte-identical legacy evidence, and the four migration events resolve under S8. Public health reports the exact pack hash and model-facing catalog count. The remaining release proof is an authenticated Clerk/OpenRouter browser playtest; no controllable signed-in browser was attached to this agent session.

See:

- docs/ARCHITECTURE.md for the two-service Railway boundary;
- docs/GDD.md for the player experience and MVP scope;
- docs/CONTRACTS.md for HTTP, command, event, and model contracts;
- docs/REFERENCE-ENGINE.md for how the old repository is used;
- docs/ACCEPTANCE.md for the release gate;
- docs/WORKFLOW.md for delivery management;
- docs/DEPLOYMENT.md for the Railway handoff and evidence.
