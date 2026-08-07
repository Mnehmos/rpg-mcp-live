# ADR-H13: Reference engine is not Lantern production

Status: Accepted  
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

