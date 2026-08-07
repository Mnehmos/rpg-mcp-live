# Lantern Runtime Contracts

These contracts define the narrow language shared by the browser, public web service, private engine service, persistence layer, and DM adapter.

## Service boundary

Public web endpoints:

~~~text
GET  /api/session
GET  /api/campaigns
POST /api/campaigns
GET  /api/character-options
GET  /api/content-catalog
GET  /api/campaigns/:campaignId
DELETE /api/campaigns/:campaignId
GET  /api/campaigns/:campaignId/events
POST /api/campaigns/:campaignId/commands
POST /api/campaigns/:campaignId/character
PATCH /api/campaigns/:campaignId/character
POST /api/campaigns/:campaignId/inventory
POST /api/campaigns/:campaignId/notes
POST /api/session/action
GET  /api/billing/status
POST /api/billing/checkout
POST /api/billing/portal
~~~

Private engine endpoints:

~~~text
GET  /health
GET  /v1/tools
GET  /v1/content-catalog
GET  /v1/character-options
GET  /v1/campaigns
POST /v1/campaigns
GET  /v1/campaigns/:campaignId
DELETE /v1/campaigns/:campaignId
GET  /v1/campaigns/:campaignId/events
POST /v1/campaigns/:campaignId/commands
POST /v1/campaigns/:campaignId/tool-calls
~~~

The browser calls only the web service. The web service calls the engine over Railway private networking with an internal service token.

## Request context

Every engine use case receives explicit context:

~~~ts
interface RequestContext {
  requestId: string;
  accountId: string;
  campaignId: string;
  actorId: string;
  capabilities: string[];
}
~~~

The web service sends the context through authenticated internal headers. No service may infer current context from a process-global variable, a previous request, or a session identifier without account and campaign scoping.

## Campaign ownership and onboarding

A session read never creates a campaign implicitly. If the account has no campaigns it returns `session: null` and `setupRequired: true`. The player creates a campaign with an explicit profile:

~~~json
{
  "name": "The Salt Road",
  "premise": "A fallen star has opened a road beneath the city.",
  "setting": "Frontier city",
  "tone": "Mysterious",
  "contentPolicy": {
    "gamesystem": "5e-2014",
    "baseDocumentKey": "srd-2014",
    "allowedDocumentKeys": ["srd-2014"],
    "allowedLicenseKeys": ["cc-by-40"]
  }
}
~~~

The content policy must be a subset of the deployment ceiling. The base document must be included in the enabled document set, every enabled document must belong to the selected game system, and its licenses must be permitted. The server supplies the verified catalog and default policy; the browser does not invent source metadata.

Every campaign persists one lifecycle phase:

~~~text
character_creation -> tutorial -> sandbox
~~~

Character setup is a trusted proxy to the engine's `character_create` tool. It is legal only during `character_creation`; tutorial advancement is a versioned `tutorial_advance` command. After source-backed creation, the player may edit name and description through `PATCH /character`; canonical class, species, background, alignment, scores, and derived values remain locked to engine commands and source rules. Equipment and consumable buttons use the narrow `/inventory` proxy.

The campaign manager lists only campaigns owned by the authenticated account. Opening a campaign is a read followed by a normal session selection; deleting one requires an explicit current version and the exact confirmation literal:

~~~json
{
  "expectedCampaignVersion": 12,
  "confirmation": "DELETE"
}
~~~

`DELETE /api/campaigns/:campaignId` authenticates the account, forwards the scoped request to the private engine, and returns the refreshed campaign list. The engine verifies account and actor ownership, rejects a stale version with `409 stale_version`, and transactionally removes the campaign aggregate, command idempotency records, and immutable events. It does not delete the Clerk account, Stripe customer/subscription, or other campaigns. The browser requires a confirmation dialog and never deletes a campaign implicitly when opening or creating another one.

## Campaign command

Command request:

~~~json
{
  "clientCommandId": "uuid",
  "expectedCampaignVersion": 0,
  "playerText": "I ask the DM to describe what is true around me."
}
~~~

The action is either a supported quick action or natural language that the private engine DM maps to one supported tool. The client cannot submit arbitrary engine mutations, authoritative rolls, DCs, damage, rewards, or state patches.

## Tool facade

The engine publishes 41 tool definitions in OpenRouter-compatible function format:

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

`content_search` accepts an optional query, normalized collection, and bounded limit. `content_get` accepts one exact `contentKey`. `rules_reference` searches or gets pinned rules, rulesets, sections, and planes. `character_options` returns only creation options legal under the campaign policy. These tools resolve against the campaign's installed `rulesVersion` and are read-only: they produce no event and do not increment the campaign version. Stable content rejection codes include `content_pack_not_installed`, `content_not_found`, `content_gamesystem_forbidden`, `content_license_forbidden`, `content_document_forbidden`, and `content_tier_insufficient`.

`worldContext` is nullable. A new campaign has no preset room, location, map node, or scene. The DM writes the current place or situation through `world_context` when the fiction needs durable context. `playerNotes` is an ordered list of `{ id, text, source, createdAt }` records. The DM may write a `dm` note only for an explicit or clearly confirmed player fact; the player writes `player` notes through the web notes endpoint. The character sheet and campaign log remain engine-owned projections and are returned with every session view.

Read tools return authoritative projections without changing the campaign version. A DM turn may use multiple reads and propose multiple ordered, typed effects. The engine validates the complete turn plan against one working snapshot and either commits every effect in one transaction or commits none. The turn receives one idempotency result and increments the campaign version once. See ADR-H15.

Currency is stored as integer copper in `character.currency.copper`. The UI derives `gold`, `silver`, and remaining `copper` using 100 cp = 1 gp and 10 cp = 1 sp. The legacy `character.gold` field is a compatibility projection only. DM-authored encounter loot supplies its own typed items, XP, and copper; the engine does not inject fixed demo rewards.

The character projection includes ability modifiers, proficiency bonus, saving throws, all standard skills, speed, hit die, remaining hit dice, proficiencies, features, spellcasting ability/DC/attack bonus, exact remaining and maximum slots, known and prepared pinned spell references, concentration, equipment metadata, carrying capacity, and derived armor class. The combat projection includes each pinned creature's hydrated statblock plus authoritative distance from the player. The browser renders these projections; it does not calculate authoritative values.

## Command lifecycle

One atomic turn plan follows:

~~~text
receive
  -> authenticate web-to-engine token
  -> load campaign by accountId + campaignId
  -> verify actorId
  -> claim idempotency key
  -> validate expected campaign version
  -> validate all effects, references, and legality
  -> calculate ordered authoritative results on a working copy
  -> persist the complete event and state transactionally
  -> increment campaign version
  -> return structured result
  -> request narration
  -> persist narration
~~~

The model interpreter and narrator are outside the authority boundary. A narrator failure can degrade the response to deterministic rules text; it cannot rerun the command.

## Result envelope

Successful results contain enough machine-readable evidence to verify the result without prose:

~~~json
{
  "campaignId": "uuid",
  "clientCommandId": "uuid",
  "event": {
    "tool": "roll_check",
    "previousVersion": 0,
    "version": 1,
    "rolls": [{ "kind": "d20", "value": 14, "sides": 20 }],
    "modifiers": [{ "name": "wis_modifier", "value": 1 }],
    "outcome": "success",
    "stateChanges": []
  },
  "campaignVersion": 1,
  "state": {},
  "narration": {},
  "narrationSource": "rules"
}
~~~

Rejected results contain a stable code, a human-readable explanation, and the unchanged version/state assertion. Rejected commands do not mutate the map, combat, inventory, quests, character, or campaign version.

## Aggregate and events

The current campaign aggregate is the operational source of truth in the engine service. Immutable events are evidence for audit, replay tests, debugging, and future migration. They are not a second competing state model.

Modern event records include, at minimum:

- accountId, campaignId, actorId, requestId, and clientCommandId;
- command kind and normalized arguments;
- exact `rulesVersion` (`open5e-pack@<sha256>`) and the sorted content keys used by the committed command;
- rolls, modifiers, DC/target, and outcome where relevant;
- state changes;
- previous and resulting campaign version;
- narration status and provider metadata without secrets.

`GET /events` returns persisted events plus content evidence resolved from each event's own historical rules version. It does not reinterpret old keys through the active pack.

Pre-pack events are a bounded exception. An event that omits `rulesVersion` is returned as `legacyUnversioned` evidence only when it also has no content keys. If an unversioned event claims a content key, resolution rejects because the engine cannot prove which source bytes governed it. Legacy event rows are never backfilled or rewritten during migration.

## Pack upgrade contract

Ordinary DM/player mutation is allowed only when the campaign uses the active rules version. A historical campaign remains readable, but mutation returns `campaign_repin_required` without changing state, events, or version.

`content_repin` is an administrative persisted command, not one of the model's 41 tools. It requires:

- exact source and target rules versions;
- a deterministic full-pack review SHA-256;
- campaign-specific content-reference compatibility;
- explicit approval of every referenced key classified as changed.

Missing source/target references, source mismatch, an unnecessary re-pin, unapproved changes, or review-hash mismatch reject stably. An accepted pack-to-pack re-pin atomically rewrites matching instance pack hashes, updates `rulesVersion`, appends one system log entry and event, and increments the campaign version once. Existing event rows remain byte-for-byte unchanged.

The legacy `lantern-rules-0.1` path has no source pack. Its deterministic review rejects any persisted source-content or pack marker and does not accept changed-key approvals. An accepted legacy re-pin normalizes policy, sets the exact target rules identity, and uses the same one-log, one-event, one-version transaction without inventing provenance.

## AI contract

OpenRouter receives the bounded context and tool definitions. It suggests tool calls; the engine executes them and sends structured tool results back to the model. The model's final text is a projection of the committed result.

The engine sets parallel model tool calls off so proposed reads and effects have a deterministic order. The authoritative boundary is one atomic multi-effect commit per accepted player turn, not one mutation in the entire model loop. Tool arguments are parsed and validated before execution. Unknown tools, invalid arguments, unauthorized context, or insufficient content fidelity become structured tool errors rather than state changes. The DM prompt explicitly prohibits passive “the merchant is still considering” loops: commerce uses an immediate catalog lookup and concrete trade resolution, or an immediate prose counteroffer with no hidden pending state.

## Billing boundary

The browser requests a server-created Stripe Checkout Session from the web service. Stripe webhook signatures are verified and webhook deliveries are recorded idempotently before subscription entitlement is used. The engine does not receive Stripe secrets and does not make billing decisions.
