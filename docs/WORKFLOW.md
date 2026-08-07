# Lantern Delivery Workflow

Status: S0-S9 local implementation complete; hosted release work remains  
Date: 2026-08-07

## Operating rule

Work in complete vertical slices. Each slice must improve the playable game while preserving explicit context, tenant isolation, server authority, atomic persistence, pinned content, and verifiable event evidence.

Lantern ships as two Railway services:

- web: public browser/API, Clerk, Stripe, and authenticated engine proxy;
- engine: private campaign state, rules, content, tools, events, and OpenRouter DM.

`F:\Github\mnehmos.rpg.mcp` is evidence and a rules laboratory, never a production dependency. A reference behavior enters Lantern only through:

~~~text
behavioral example -> pure contract -> focused test -> service integration -> persisted event evidence
~~~

## Work lanes

### Lane A - player ownership and tenancy

1. Clerk establishes the account identity at the public boundary.
2. Session reads never create a campaign implicitly.
3. The player creates and selects campaigns under their own account.
4. Each campaign owns its profile, content policy, character, tutorial state, sandbox, dossier, notes, and log.
5. The campaign manager can open, create, and explicitly delete one owned campaign; deletion carries the current version and cascades only that campaign's records.
6. Every engine read and write carries explicit account, campaign, and actor context.
7. Cross-account access and browser-to-engine bypass are rejected.

### Lane B - authoritative game engine

1. Parse one player turn into reads plus an ordered typed plan.
2. Validate expected version, references, action legality, and the full plan on one working snapshot.
3. Resolve rolls and derived values from server-owned rules.
4. Commit all effects and one event atomically, or commit nothing.
5. Preserve idempotent replay and stable no-mutation rejection.
6. Keep authored fiction expressive while refusing arbitrary mechanical overrides.

### Lane C - Open5e content translation

1. Fetch only through the offline importer.
2. Pin raw, normalized, compiled, attribution, and coverage artifacts by hash.
3. Partition content by game system, document, and license.
4. Execute only reviewed tier-2 programs; use tier-1 fields only as typed; keep everything else tier 0.
5. Store references and instance state in campaigns, never source definitions.
6. Keep historical packs installed and migrate campaigns only through reviewed S9 re-pin events.

### Lane D - product operations

1. Clerk authentication and account lifecycle on web.
2. Stripe webhook-backed Player Pass entitlement on web.
3. OpenRouter secret, model configuration, usage ledger, and limits on engine.
4. Railway private networking, volume backup/restore, logs, metrics, and rollback.
5. Browser security, privacy retention, deletion, rate limits, and support paths.

## Delivery board

### Verified locally

- Two-service web/engine boundary, explicit request context, tenant-scoped SQLite store, idempotency, versions, events, and narration separation.
- Player-owned campaign setup, source policy, character creation, tutorial, sandbox, complete dossier, ordered log, notes, and campaign management UI with safe deletion.
- Forty-one DM tools, including content, rules reference, character options, world/NPC/merchant/quest authorship, combat, spells, inventory, loot, rest, checks, and campaign direction.
- Atomic multi-effect turns; the earlier single-mutating-tool guard has been removed.
- S0 deterministic import spine and installed-pack verification.
- S1 immutable content loader, rules identity, policy resolver, content reads, skills, and currency.
- S2 pack-backed equipment, starting kits, AC, inventory, merchants, and atomic commerce.
- S3 pack-backed combatants, typed defenses/senses/saves, exact attacks, and authoritative spawning.
- S4 spell lists/progressions, preparation, slots, range/area, attacks/saves, damage, concentration, and recovery.
- S5 source-backed species/classes/backgrounds/feats/languages/alignments/abilities/skills and open character options.
- S6 pinned rules/rulesets/sections/planes and `rules_reference`.
- S7 deterministic effect programs for multiattack, save damage, recharge, area, conditions, and ordered execution.
- S8 complete discovered corpus, campaign partitions, deployment ceiling, OGL opt-in, source catalog, and attribution UI.
- S9 active/historical pack registry, deterministic diff, strict pre-pack legacy seam, compatibility plan, explicit re-pin, and historical event resolution.
- Active local S8 hash: `56bdfbda9d59a398f3c9cb0e02aaf2b411e4280e99fb32c550cf158b38f7b07f`.
- Local regression baseline: pack verification, source and tools type checks, 82 automated tests, build, and two-service HTTP smoke including disposable campaign deletion.

### Hosted release sequence

The S8 pair and legacy migration have now completed through step 9. The release sequence and evidence are:

1. Inspect current project/service/deployment/variable/volume status without mutation. Completed for the current release candidate.
2. Capture a consistent backup of `/app/data/lantern-engine.db`, download it, verify its digest, and run the complete migration on a disposable copy. Completed for the current release candidate.
3. Deploy the dual-registry and legacy-aware S8 code to the private engine first. Completed; legacy reads succeeded and ordinary mutation rejected with `campaign_repin_required` without a write.
4. Verify private engine health reports active S8 plus installed S1/S7 history and 41 tools. Completed.
5. Deploy the web service and verify public health, catalog, CSP, Clerk configuration, and private engine reachability. Completed.
6. Enumerate each production campaign and run `open5e:repin plan` against the exact live database. Completed for four campaigns.
7. Confirm the legacy-to-S8 review SHA and zero campaign-specific source-content markers. Completed.
8. Apply each approved re-pin with the exact review hash and a unique idempotency key. Completed; versions advanced `21 -> 22`, `17 -> 18`, `0 -> 1`, and `0 -> 1`.
9. Verify old events remain byte-identical legacy evidence and each migration event resolves through S8. Completed; 38 legacy plus four modern events resolve with zero failures.
10. Run the authenticated browser path: sign in, create/select campaign, choose source policy, create character, complete tutorial, send an OpenRouter DM turn, refresh, inspect dossier/events/attribution, and continue play.
11. Verify Stripe test entitlement and cancellation behavior without exposing billing secrets to the engine.

Do not combine database migration with an unverified build deployment. Do not apply a re-pin before a backup and campaign-specific plan have been reviewed.

### Product work after hosted proof

- Add a provider usage/cost ledger and enforce per-player turn/token budgets before public charging.
- Add structured telemetry for provider failure, tool rejection, latency, and campaign version conflicts.
- Prove scheduled volume backup, restore, account deletion, and privacy retention.
- Expand tier-2 coverage based on real play failures, not raw corpus size.
- Author a short optional tutorial adventure without reintroducing a universal room, door, or fixed player identity.

### Explicit non-goals

- Deploying or repairing the broad legacy MCP runtime as Lantern production.
- Treating full-corpus import as full mechanical rules coverage.
- Runtime Open5e calls or model-generated rule repair.
- Multiplayer, 3D maps, worker fleets, or Postgres before measured need.
- Arbitrary state-patch tools or client-side mechanical authority.

## Definition of done

A slice is done only when:

- its contract, success path, rejection path, and persistence behavior are tested;
- state and event evidence commit atomically;
- rejected commands leave state, resources, events, and version unchanged;
- retries do not reroll or repeat effects;
- source-backed mechanics retain exact pack and content-key evidence;
- no source definition appears in campaign JSON;
- the model cannot bypass tool schemas, content fidelity, ownership, or action legality;
- `npm run check`, `npm test`, and `npm run build` pass;
- the built web/engine HTTP path passes;
- the browser exercises the same path against the deployed pair when the slice affects hosted behavior;
- acceptance claims are labeled `verified`, `observed`, `designed`, or `blocked`;
- rollback and the next safe action are documented.

Reference-server behavior, a successful import, a local unit test, and a hosted browser result are separate evidence classes. None substitutes for the others.

## Change workflow

For every engine or content change:

1. Update the contract and ADR when authority, storage, replay, or licensing changes.
2. Add the smallest source fixture plus stable failure cases.
3. Implement the pure resolver/compiler before the transaction or model tool.
4. Verify no-mutation rejection and idempotency.
5. Regenerate coverage, attribution, and diff artifacts where applicable.
6. Run check, tests, build, and HTTP smoke.
7. Deploy engine first; verify health and historical compatibility.
8. Deploy web; verify proxy, auth, policy UI, and rendering.
9. Run the authenticated browser path and record exact evidence.

## Handoff status

S0-S9 and the strict legacy migration seam are implemented locally and deployed. The authoritative local and hosted pack is S8. Read-only Railway inspection, a consistent backup, independent audit, disposable migration, engine-first compatibility gate, web promotion, all-campaign live plan/apply, and post-migration audit are complete. The next safe action is authenticated browser acceptance. The agent session had no attached browser backend, so the player must open the deployed site in an attached signed-in browser before that final proof can run.
