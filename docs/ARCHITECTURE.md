# Lantern Live Architecture

Status: S0-S9 architecture deployed on Railway; authenticated browser acceptance pending  
Date: 2026-08-07

## Decision in one sentence

Lantern is two small Railway services: a public web/application service and a private authoritative engine service. The existing mnehmos.rpg.mcp repository remains a behavioral reference and rules laboratory, not a production dependency or deployment target.

## Railway topology

~~~text
Player browser
  -> lantern web service (public Railway domain)
      -> Clerk authentication
      -> Stripe Checkout/webhooks
      -> browser-safe HTTP API
      -> private HTTP call with shared service token
          -> lantern engine service (Railway private network)
              -> tenant-scoped SQLite volume
              -> authoritative command services
              -> structured events
              -> OpenRouter DM tool loop
~~~

The browser never calls the engine directly. The web service never decides game mechanics. The engine never serves the landing page, handles Clerk UI, or receives Stripe secrets.

Initial Railway service names:

- rpg-mcp-live: public web page and authenticated web API;
- lantern-engine: private engine API, OpenRouter adapter, and engine-owned database volume.

The web service uses a private engine URL supplied through Railway service-variable interpolation. The exact interpolation is environment configuration, not application code. No public domain is required for the engine.

## Two repositories, two responsibilities

| Repository | Role | Allowed use |
| --- | --- | --- |
| F:\Github\mnehmos.rpg.mcp | Reference engine | Behavioral comparison, playtest fixtures, pure rules algorithm research, negative requirements |
| F:\Github\rpg mcp live | Lantern production boundary | Web service, private engine service, tenant-scoped persistence, model adapter |

Lantern may selectively port a pure, independently tested rules component from the reference repository. It must not inherit the reference server's global singleton context, unrestricted MCP tool surface, process-local persistence, or permissive mutation behavior.

## Product flow

The browser lifecycle is:

~~~text
create campaign profile
  -> campaign manager lists, opens, or explicitly deletes player-owned worlds
  -> create character
  -> complete the guided tutorial
  -> enter the open campaign sandbox with no preset location
  -> describe an action
  -> web authenticates the player
  -> engine DM interprets the text
  -> DM calls constrained engine tools
  -> engine validates and resolves one ordered turn plan
  -> engine persists the event and state
  -> DM narrates the committed result
  -> web returns structured result plus prose
  -> browser refreshes or resumes the same state
~~~

Campaigns are player-owned worlds. The profile supplies name, premise, setting, and tone; the character supplies the player's point of view. A newly created campaign has no location, room, map node, or opening scene. Its `worldContext` stays null until the DM establishes whatever place or situation the fiction needs during play, and no campaign is created merely because the player opened the session page.

The campaign manager is a lifecycle boundary, not a second game system. It receives the account-scoped campaign list, opens one campaign by ID, starts an explicit new campaign flow, and offers deletion behind a confirmation dialog. Deletion carries the currently displayed aggregate version to the engine; the engine verifies ownership and atomically removes the campaign, commands, and events. A stale browser receives a conflict and refreshes instead of deleting newer work. Clerk identity, Stripe billing records, and sibling campaigns are outside the deletion scope.

Natural language is the player's input method. It is not the authority. A prose response cannot prove that an attack hit, an item moved, a reward was granted, or a quest advanced.

## Engine service boundary

The engine owns:

- account, campaign, and actor context;
- campaign creation and supported character setup;
- optional DM-authored world context and explicit context exits;
- DM-authored NPCs, merchant catalogs, quests, rewards, campaign beats, and rule-of-cool effects;
- movement validation against the current context without imposing a fixed map;
- durable player notes written by the player or explicitly recorded by the DM;
- observation, interaction, ability checks, and dice;
- combat turn ownership, action economy, attacks, damage, death saves, and encounter state;
- pack-backed spell learning/preparation, slots, persisted range, target geometry, spell attacks/saves, typed damage, concentration, and recovery;
- character sheet, inventory, consumables, loot, rest, quests, and rewards;
- idempotency, versions, transactions, and immutable events;
- the model-facing tool loop.

The creative authority boundary is intentional. The DM may invent campaign content and choose the fictional price, reward, quest, NPC response, or consequence. The engine does not judge canon or creativity. It validates the typed content and adjudicates only mechanical consequences such as rolls, affordability, stock, inventory, HP, conditions, durations, and persistence.

The web service owns:

- browser assets and UX;
- Clerk authentication and account identity;
- Stripe Checkout, webhook synchronization, and entitlement policy;
- proxying authenticated commands to the private engine;
- safe rendering of returned structured data and narration.

The engine exposes a narrow internal HTTP facade. Its current 41 capability names are:

~~~text
campaign_context
content_search
content_get
rules_reference
character_options
world_context
player_notes
player_note_add
npc_context
merchant_catalog
observe
move
interact
social_check
merchant_trade
quest_create
quest_update
improvise
campaign_beat
character_sheet
character_create
character_update
inventory
equip_item
unequip_item
drop_item
use_item
quest_progress
combat_state
combat_start
spawn_creature
learn_spell
prepare_spell
cast_spell
combat_action
advance_turn
death_save
loot
rest
roll_check
tutorial_advance
~~~

These capabilities are available to the DM tool loop and can be called by a trusted player-facing proxy. They are not arbitrary state patches. Every mutating call is checked against the explicit campaign context and expected version. Content-authoring tools are intentionally expressive; their mechanical effects still commit through the same transaction.

## Request context

Every engine use case receives explicit context. No use case may discover a current campaign, actor, or world through a global singleton.

~~~ts
interface RequestContext {
  requestId: string;
  accountId: string;
  campaignId: string;
  actorId: string;
  capabilities: string[];
}
~~~

The web service constructs this context after Clerk authentication and sends it over the private service boundary with an internal token. The engine validates the token and treats accountId, campaignId, and actorId as a single scope.

## Command lifecycle

Every mutating command follows this order:

1. Receive a request and assign or verify requestId.
2. Authenticate the internal web-to-engine call.
3. Load campaign by accountId and campaignId.
4. Verify actorId belongs to that campaign.
5. Claim clientCommandId for idempotency.
6. Check expected campaign version.
7. Validate every ordered effect, content reference, and action legality rule.
8. Calculate the complete authoritative result on one working snapshot.
9. Persist all state changes and one structured event transactionally.
10. Increment campaign version.
11. Return the machine-readable result to the DM/web caller.
12. Request narration from the committed result.
13. Persist narration without rerunning the command.

Rejected commands return a structured rejection and do not mutate state, the map, inventory, combat, quests, or campaign version.

## Persistence shape

The engine service owns its SQLite database and Railway volume. The web service does not share or write the engine database. Tenant isolation is a correctness property:

- every campaign read is scoped by accountId and campaignId;
- every actor lookup is scoped by campaign ownership;
- event rows include campaignId, accountId, actorId, requestId, and campaignVersion;
- idempotency records are scoped to the account and client command;
- no browser-supplied owner or actor identifier is trusted;
- a future Postgres migration preserves the engine command transaction boundary.

The operational aggregate is the current campaign state. Immutable events contain enough evidence to verify what happened: command, rolls, modifiers, DC or target, outcome, state changes, and resulting campaign version.

## Open5e relationship

Open5e is the canonical rules/content target for Lantern. The active local artifact is `open5e-v2-full-corpus-s8`, pack hash `56bdfbda9d59a398f3c9cb0e02aaf2b411e4280e99fb32c550cf158b38f7b07f`, and rules identity `open5e-pack@56bdfbda9d59a398f3c9cb0e02aaf2b411e4280e99fb32c550cf158b38f7b07f`. ADR-H14 defines raw, normalized, compiled, attribution, coverage, and hash contracts; ADR-H16 defines the resolver and policy boundary; ADR-H17 through ADR-H20 define source-backed instances, combatants, spells, and campaign content partitions. Runtime play never fetches Open5e.

Engine boot verifies and indexes the active pack plus the installed S1 and S7 historical packs. Campaign state stores `rulesVersion`, policy, content keys, pack hashes, and mutable instance data; definitions remain outside `state_json`. A pack-backed campaign resolver is selected by its own rules version. Historical pack campaigns are readable, and event evidence is hydrated from the pack named by each event. Pre-pack `lantern-rules-0.1` projections and content-free unversioned events remain readable without inventing a source pack. Mutation under any old identity is rejected with `campaign_repin_required` until the S9 administrative workflow proves compatibility and commits one atomic re-pin event. ADR-H21 records both paths.

## Current implementation status

The private engine service is implemented in this repository as `src/engine-server.ts`; the web service calls it through `src/engine-client.ts`. Local S8 verification, 82 automated tests, and the built web/engine HTTP smoke pass with 41 tools; the HTTP smoke also proves disposable campaign deletion cascades commands and events. Railway runs the same S8 source on both services, with the campaign manager deployed in the current web/engine pair. All four legacy campaigns migrated exactly once; 38 original events remain legacy evidence and four migration events resolve under S8. Public/private health, CSP, integration configuration, tenancy rejection, historical reads, active-pack lifecycle, and database integrity are verified. The authenticated Clerk/OpenRouter browser path remains the release evidence to collect.
