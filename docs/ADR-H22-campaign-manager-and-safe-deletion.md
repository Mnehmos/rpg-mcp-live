# ADR-H22 - Player-owned campaign manager and safe deletion

Status: accepted  
Date: 2026-08-07

## Context

Lantern is a player-owned campaign product, not one universal opening scene. A player may create several worlds, return to an older one, or abandon a failed experiment. The browser therefore needs a real campaign manager rather than a single implicit campaign slot. Deletion is destructive and must not be implemented as a client-side list operation or an unscoped database shortcut.

## Decision

The public web service exposes an authenticated campaign lifecycle:

~~~text
GET  /api/campaigns
POST /api/campaigns
GET  /api/campaigns/:campaignId
DELETE /api/campaigns/:campaignId
~~~

The browser renders each owned campaign with independent open and delete actions. Delete requires a confirmation dialog and sends the aggregate version currently displayed by the manager plus the exact literal `DELETE`.

The web service forwards deletion to the private engine with the Clerk-derived account and actor context. The engine:

1. loads the campaign under `(accountId, campaignId)`;
2. verifies the actor and exact expected version;
3. deletes the campaign aggregate, command idempotency rows, and event rows in one SQLite transaction;
4. returns deletion counts and a timestamp;
5. never touches Clerk, Stripe, sibling campaigns, content-pack rows, or unrelated accounts.

A stale version returns `409 stale_version` and leaves every row unchanged. A missing or cross-account ID behaves as not found. Deleting the active campaign clears the browser session and leaves the player in the manager with the remaining worlds and a create option.

## Rationale

The current version requirement prevents a stale tab from deleting newer play. The engine transaction preserves the same atomicity used for game turns. Keeping deletion out of the model tool surface ensures that DM creativity cannot remove a player's world. Keeping billing and identity outside the campaign aggregate makes “delete this campaign” predictable and reversible only through backups, without silently deleting the account.

## Consequences

- The manager is a first-class product surface for multi-campaign players.
- Campaign deletion is intentionally permanent in the live store; the UI labels the scope clearly.
- Future account deletion, retention, trash/recovery, or export requires a separate contract and ADR.
- Local HTTP smoke creates and deletes only its disposable campaign, proving the cascade without touching a developer or production database.
