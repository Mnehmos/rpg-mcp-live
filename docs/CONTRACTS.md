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

## Canonical event stream

`GET /api/campaigns/:campaignId/events/stream?after=<cursor>&limit=<n>` is a
bounded read projection over committed engine events. The engine owns the
immutable event row and returns at most 100 actor-projected events in canonical
`version`, `createdAt`, `eventId` order. Each record carries a stable stream
schema revision, campaign/command/revision identity, request and rules
provenance, and the redacted event payload. Consumers acknowledge a page by
retaining `nextCursor` and sending it as `after` on the next request; an empty
page is safe to retry, and reconnecting with the last acknowledged cursor does
not reapply gameplay mutation. The stream is read-only and does not create a
second mutation or event ontology.

## Tool facade

The engine publishes 52 tool definitions in OpenRouter-compatible function format:

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
travel
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
project
roll_check
tutorial_advance
~~~

`content_search` accepts an optional query, normalized collection, and bounded limit. `content_get` accepts one exact `contentKey`. `rules_reference` searches or gets pinned rules, rulesets, sections, and planes. `character_options` returns only creation options legal under the campaign policy. These tools resolve against the campaign's installed `rulesVersion` and are read-only: they produce no event and do not increment the campaign version. Stable content rejection codes include `content_pack_not_installed`, `content_not_found`, `content_gamesystem_forbidden`, `content_license_forbidden`, `content_document_forbidden`, and `content_tier_insufficient`.

`worldContext` is nullable. A new campaign has no preset room, location, map node, or scene. The DM writes the current place or situation through `world_context` when the fiction needs durable context. `playerNotes` is an ordered list of `{ id, text, source, createdAt }` records. The DM may write a `dm` note only for an explicit or clearly confirmed player fact; the player writes `player` notes through the web notes endpoint. The character sheet and campaign log remain engine-owned projections and are returned with every session view.

World-object instances are persisted inside the current world context as separate mutable records with stable `id`, `definition.sourceRef`, scene/location/container/owner references, material/tags, declared affordances, state, revision, provenance, and `criticalPolicy`. The `interact` tool accepts an optional typed `affordance`, `sourceId`, and `destinationId`; legacy goal-only interactions remain narration-only compatibility behavior. Typed affordances are resolved by the engine and reject unsupported materials, ownership, prerequisites, or critical-object violations without changing state. Uncertain locked-object actions use a target-bound `challenge_attempt`: `barred-door-v1` owns the Athletics force-open rule and changes a successful bound target from `locked` to `open`; `pick-lock-v1` owns the Dexterity plus Thieves' Tools rule and changes it from `locked` to `unlocked`. Missing, stale, unknown, or ineligible targets reject before RNG, and a failed check leaves the object unchanged. The roll, adjudication evidence, and successful transition are one atomic commit; direct `world_context` state authoring and generic checks remain unable to bypass this path. The bounded first fixture is the eight-object ruined gatehouse; physics, chemistry, arbitrary scripting, and #24 scene-detail promotion remain deferred.

Runtime locations use the shared `content_compile` boundary rather than a separate room subsystem. A location definition is immutable descriptive data; its canonical instance is connected to parent locations, actors, and world objects through stable `located_in` relationships. Topology-bearing locations declare a stable `key`; typed exits name their canonical `targetKey` and compile to directed `connects_to` relationships with persisted key, kind, target, open/locked/blocked state, hidden/discovered state, and bounded requirements. A target key must resolve to exactly one already persisted location instance before it can be committed; legacy definitions with descriptive exits but no target remain readable and non-traversable. `move` uses this graph whenever the actor has a canonical location, rejects absent or unavailable exits, and atomically updates the actor's containment relationship. `content_compile.exitPatch` changes an established exit once; undiscovered hidden exits are omitted from actor-facing state, commands, resolution data, and event evidence until discovered. This slice intentionally has no grid or geometry requirement.

Runtime mundane items also use `content_compile`, but their immutable runtime definition is bridged into one ordinary actor-owned inventory instance. The inventory instance keeps the canonical runtime instance ID, authored material/tag description, owner, container, quantity, and normal inventory provenance; existing inventory transfer, capacity, equip, use, and drop validation remain authoritative. A derived item must provide a new stable key plus existing source definition/instance IDs, a recipe key, and a plain-language modification. The compiler records that provenance and creates a new definition/instance without mutating the source definition or its other instances. Unsupported mechanical fields are rejected, and stable content/instance IDs plus the existing command idempotency record prevent duplicate replay. Runtime-item inventory links are normalized across reloads; runtime content remains the canonical definition while inventory remains authoritative for ownership and location. Economy/fencing, partial stack splitting, and arbitrary executable item effects remain deferred.

The reviewed spell-scroll slice is one explicit exception, not a generic item scripting system. An authored consumable may select only `spell-scroll-cure-wounds-v1`; normalization derives and pins the SRD first-level spell-scroll source, Cure Wounds spell, pack hash, and `class-list-v1` activation policy. `use_item` then requires Cure Wounds on the character's installed class list and within the highest spell level the character can normally cast. It reuses ordinary Cure Wounds targeting, range, healing, and action economy without spending a spell slot. A successful use heals and consumes one scroll in one commit, recording distinct item and spell provenance; every rejection leaves inventory, hit points, action budget, event stream, and campaign version unchanged. Higher-level checks, attack/save/damage scrolls, spellbook copying, arbitrary spell selection, and caller-authored scroll mechanics remain deferred.

Runtime arcane synthesis also enters through `content_compile`, but it is executable only after the engine applies the reviewed `runtime-arcane-synthesis-v2` policy. The proposal may name one exact installed `open5e:spell:` primitive and assert only its category: `damage-only`, `healing-only`, or `bounded-modifier-only`. It may not author level, range, target count, duration, concentration, delivery, damage/healing dice, modifier amount, trigger, or resource mechanics. The engine requires the category to match, then copies the primitive's reviewed non-area, non-concentration, single-creature self/touch/ranged effect and authoritative casting data into a persistent execution-tier-2 `runtime:spell:` definition. Damage remains capped at level 1, 120 feet, and 20 average damage; healing is bounded to the reviewed Cure Wounds-scale family; the sole admitted modifier is the finite incoming-hit Armor Class family already executed by Shield's persisted reaction lifecycle. Unsupported effect kinds, area primitives, triggerless reactions, category mismatches, and over-budget records reject without mutation. Learned, prepared, and cast runtime spells use the ordinary spell/healing/reaction kernels and survive normalization/restart. Existing `runtime-arcane-synthesis-v1` damage definitions remain readable. No new effect primitive, arbitrary condition, prose compiler, or scripting engine is introduced.

Shipping this topology slice also requires exact-SHA native Railway evidence: both staging services must report the merge SHA, the staging verifier must pass its invariant and deterministic evaluations, and production health must report that same SHA. A green code check alone is not a deployment claim.

Campaign time is an explicit `time.gameTime` calendar aggregate and is separate from wall-clock `updatedAt`. `travel` uses the reviewed `one-day-road-v1` route profile; the engine derives distance, elapsed minutes, navigation, ration/water consumption, watches, weather, random-event evidence, exhaustion, and world-clock/deadline consequences. `rest` advances authoritative time, processes scheduled events exactly once, honors interruption, and applies existing effect clear policies; repeated long rests are gated by one in-fiction day. `project` is the bounded `research-v1` downtime clock. Legacy saves normalize with a zero-time aggregate, and every accepted time-advancing event records before/after game time plus its reason. Background workers, full route/weather catalogs, and multiplayer scheduling remain out of scope.

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

## Tactical consequence contract

The encounter's #10 frame, `five_e_simple` metric, footprints, obstacles, and
geometry revision are the only tactical spatial authority. Cover is derived
from canonical blocking cells for attacks in either direction. Reviewed area
effects accept an aim and current revision, then derive their circle, cone, or
5-foot-line cells and all living player, enemy, and active controlled-actor
targets from compiled content; callers cannot provide area targets or
mechanics. Movement resolves leaving-reach triggers in path order and consumes
each enemy Reaction at most once per round; total cover prevents the attack
without consuming the Reaction. Opportunity cover uses the occupied cell before
the leaving segment. A would-hit opportunity attack pauses there in the shared
pending-reaction protocol; Shield or decline resolves the stored roll and leaves
the character turn active. Movement, reaction attacks, spell effects, resource
spending, and event evidence share the normal atomic command boundary. Any stale
or invalid spatial request leaves state and version unchanged. ADR-H33 records
the exact first-slice geometry and deferrals.

Persistent tactical producers reuse that same authority. A zone-create command
selects only `hindering-circle-v1` or `guiding-aura-v1`, supplies the current
geometry revision, and supplies a center only for the stationary circle. The
engine owns both 10-foot circles, their three-round duration, player source,
effect operations, action cost, and all target membership. Enter, leave,
re-entry, following movement, expiry, source death, and encounter-end cleanup
update source-linked `EngineEffectInstance` evidence in the same accepted
command and version. Stale geometry and invalid source or shape state reject
without mutation. Caller-authored shapes, sources, targets,
strength, damage, AC/DC, and scripts are rejected before mutation.
ADR-H34 records the exact definitions and deferrals.

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
