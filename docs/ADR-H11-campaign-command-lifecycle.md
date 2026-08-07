# ADR-H11: Explicit campaign context and idempotent engine commands

Status: Accepted  
Date: 2026-08-06

## Context

The browser can retry requests, open multiple tabs, or return after a network timeout. A random roll performed twice or a late browser write would corrupt the player's campaign. Lantern is also multi-tenant: a campaign ID without its account context is not sufficient authority.

The reference engine's implicit/global context and broad mutation surface are unsuitable for the hosted product. The web service and engine service must remain separate.

## Decision

The private engine service owns a versioned campaign aggregate. Every engine use case receives an explicit RequestContext containing requestId, accountId, campaignId, actorId, and capabilities. Every mutating request carries clientCommandId and expectedCampaignVersion.

The public web service authenticates Clerk, constructs the context, and forwards the request over Railway private networking with an internal token. The engine validates the token and context before loading state.

For a quick action, a DM tool call, or free-form text after interpretation, one transaction:

1. authenticates and scopes the campaign by accountId and campaignId;
2. verifies actorId;
3. returns the stored result when the client command ID already exists;
4. rejects a different request that reuses that ID;
5. checks the expected campaign version;
6. validates action legality;
7. resolves the server-owned rules action;
8. writes state and immutable event evidence;
9. increments the campaign version;
10. stores the complete result for replay.

Read tools do not increment the version. Narration happens after the authoritative transaction and may fall back without changing the event or roll.

## Consequences

The web and engine can be deployed independently while remaining simple. The engine owns its SQLite Railway volume; the web never shares or writes game state. Retry behavior, tenant isolation, stale tabs, and failure recovery are explicit and testable.

The engine command transaction is the migration seam if persistence later moves to Postgres or if the service is moved to another Railway project.

Every service must accept context as data. A global current world, party, session, or actor is not an optimization; it is a correctness defect.

## Rejected alternatives

- Client-owned campaign state: too easy to tamper with or overwrite.
- Last-write-wins saves: lose actions across tabs and retries.
- Session-only lookup: permits ambiguous or cross-tenant context.
- Deploying the reference MCP runtime: carries global state and unrestricted tools.
- Keeping the engine inside the public web process: exposes the wrong secret and couples browser release risk to rules state.
- Full event sourcing now: adds projection and migration complexity before the game loop is validated.

