# ADR-H13: Reference engine is not Lantern production

Status: Superseded in part (see Update, 2026-08-11) — the core reasoning below still holds; the "Rejected alternatives" deployment decision was reversed.  
Date: 2026-08-06

## Context

The mnehmos.rpg.mcp repository contains useful game behavior and a broad MCP implementation. It also contains global context, permissive mutation paths, and persistence assumptions discovered during playtesting. Reusing it directly would make the hosted game inherit behavior that Lantern must reject.

## Decision

Treat mnehmos.rpg.mcp as:

- a behavioral reference;
- a rules laboratory;
- a source of golden-path fixtures;
- a source of edge cases and negative requirements;
- an optional source of pure rules components after extraction and focused testing.

Implement Lantern as a new application and engine boundary in F:\Github\rpg mcp live. Selective reuse is optional and must not determine the hosted architecture.

The first hosted facade uses typed internal functions and HTTP commands. A future MCP adapter may expose only those constrained capabilities; it must not expose the legacy server wholesale.

## Consequences

The team pays a small porting cost up front, but gains explicit tenant context, narrow authority, transactional state changes, and testable contracts. The old server can continue to support local comparison and playtesting without being placed on the production request path.

Golden-path success in the reference server is evidence for design, not proof of Lantern support. Reference defects are acceptance tests and guardrails, not an old-repository repair backlog.

## Rejected alternatives

- Deploy the reference server behind Railway: carries global state and unrestricted tools.
- Make Lantern import the entire reference runtime: couples the product to the wrong persistence and context model.
- Repair every reference edge case before building Lantern: delays the smallest production-safe vertical slice.

## Update, 2026-08-11: the deployment decision is reversed, deliberately

The first rejected alternative above — "deploy the reference server behind Railway: carries global state and unrestricted tools" — is exactly what is now deployed: `mnehmos-rpg-mcp` runs as a Railway service inside this project, and real campaigns can be routed to it for A/B comparison against lantern-engine (`src/reference-engine-*.ts`).

This is a knowing override, not a quiet reversal. The risk this ADR named is real and was verified, not assumed: the reference engine's SQLite layer has no tenant/session scoping at all (confirmed by reading its storage layer), and `session_manage.initialize` will hand a caller "whichever world/party is first in the database" if IDs aren't passed explicitly. The mitigation is that **the reference engine is never called by anything except this one adapter** — real users only ever talk to Lantern's own REST API. `ReferenceEngineStore` (`src/reference-engine-store.ts`) is the single place account+campaign IDs are bound to reference-engine world/party/character IDs; the adapter always resolves through it and never accepts a client-supplied raw reference-engine ID, which closes the specific leak path this ADR was worried about without requiring any change to the reference engine itself.

The other two rejected alternatives — importing the whole reference runtime, and repairing every reference edge case first — remain rejected. Nothing about Lantern's own engine boundary changed: `lantern-engine` is still the default and primary backend; the reference engine is an opt-in, per-campaign alternative for comparison, not a replacement.

What still carries the risk this ADR described, disclosed rather than hidden: campaigns routed to the reference backend inherit its documented gameplay bugs (see `docs/REFERENCE-ENGINE.md`'s "Behavioral evidence from the reference playtest") — rejected moves that still mutate persisted state, custom damage overrides bypassing character math, rewards that report success without applying. This is not a repaired reference server; it's the same one, used deliberately and narrowly.

