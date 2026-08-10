# Lantern Table - Game Design Document

Status: working MVP specification  
Internal repository: F:\Github\rpg mcp live  
Consumer-facing working name: Lantern Table

## Product promise

Lantern Table is a browser-first, one-player tabletop RPG. The player brings a character and describes an action. A private Railway engine decides what is legal, rolls and applies the rules, persists the consequence, and asks a Dungeon Master model to make that committed result readable.

The player should feel like they are sitting at a living table: simple input, immediate consequence, persistent campaign. Sophistication belongs in the world response and content; the state machine stays narrow and verifiable.

## Product constitution

[The Sand Remembers](./THE-SAND-REMEMBERS.md) is Lantern's normative product constitution. It protects three equal obligations: state trust (the world remembers), procedural trust (rules and rolls remain honest), and momentum trust (the world meaningfully reacts). The compact model-facing projection lives in `src/engine-dm-doctrine.ts`; the full manifesto is design doctrine, not per-turn prompt bulk.

Its release invariant is: **no orphaned mechanics; no orphaned fiction.** No roll exists without stakes, no result ends without a concrete consequence, and no durable narrated consequence exists without committed state.

## Player-owned lifecycle

The player does not enter a pre-authored Lantern character. They own the campaign and create the character who will experience it:

~~~text
campaign name + premise + setting + tone
  -> character name + species + class
  -> guided tutorial
  -> open-world campaign sandbox
~~~

The campaign manager remains available from the signed-in player shell. It lists the player's worlds, opens one without changing its state, starts a new campaign, and permanently deletes an unwanted campaign only after explicit confirmation. Deletion is account-scoped and removes that campaign's game records; it never removes the player's identity, billing relationship, or sibling worlds.

There is no shared doorway, location, room, or preset identity waiting for every player. The sandbox begins with no current world context; the DM establishes a town, ship, wilderness, battlefield, or other situation only when the fiction calls for one.

## Core loop

~~~text
choose a campaign
  -> optionally observe the current DM-authored context
  -> say what the character does
  -> web authenticates the turn
  -> DM understands intent and frames meaningful stakes
  -> engine resolves authoritative uncertainty
  -> engine validates and commits the consequence atomically
  -> DM narrates the committed consequence
  -> player faces a meaningfully changed situation
~~~

The product is chat-first. A player can type “I study the lantern for a hidden mechanism,” but the DM cannot turn that sentence directly into a database mutation. The web service forwards player intent; the engine interprets, validates, resolves, commits, and then narrates.

## MVP pillars

1. Player agency: free-form intent is welcome, while every accepted action has a clear authoritative result.
2. Continuity: a campaign survives refreshes, retries, and returning to the same account.
3. Readable surprise: the DM can be expressive without rewriting persisted facts.
4. KISS operations: one public web service and one private engine service, each with one responsibility.
5. Tenant safety: one account cannot read or mutate another account's campaign.

## First playable slice

- Sign in with Clerk.
- Create a named, player-owned campaign with a premise, setting, and tone.
- Create one supported level-one character with an explicit name, species, and class.
- Complete a short authoritative tutorial that teaches natural-language actions and rules responses.
- Enter a persistent sandbox where the campaign profile and character drive the DM context.
- Describe a natural-language action.
- Review the full authoritative character sheet, ordered campaign log, and shared player notes.
- Review current pressure, quest journal, equipment, carrying load, and exact gold/silver/copper balances.
- Let the engine DM use multiple read tools and commit one validated multi-effect turn plan.
- Resolve one exploration ability check with a server-owned d20, modifier, and DC.
- Persist command, event evidence, campaign version, and latest narration.
- Replay a retried command without a second roll or state mutation.
- Reject stale browser state without mutating the campaign.
- Refresh and resume the same authoritative result.
- Prove cross-account isolation.
- Manage multiple player-owned campaigns and delete an unwanted campaign with a current-version confirmation.

There is no opening scene fixture in the player model. Movement, combat, inventory, quests, rest, death saves, loot, emergent world context, authored NPCs, merchants, campaign beats, and shared notes are separate engine capabilities that the DM composes as the campaign develops.

## Live DM toolset

The engine exposes the tools a DM needs to run a player turn:

- context and observation: campaign_context, observe, world_context, character_sheet, inventory, quest_progress, combat_state;
- continuity: player_notes, player_note_add;
- world action: move, interact, social_check, merchant_catalog, merchant_trade, roll_check;
- campaign direction: quest_create, quest_update, campaign_beat, improvise;
- character setup: character_create, character_update, tutorial_advance;
- sheet and equipment: character_sheet, inventory, equip_item, unequip_item, drop_item;
- combat: combat_start, spawn_creature, combat_action, advance_turn, death_save;
- spellcasting: learn_spell, prepare_spell, cast_spell, with engine-owned slots, range, attacks/saves, typed damage, and concentration;
- resources and progression: use_item, authored loot, quest rewards, rest.

The DM can call read tools to understand the table and assemble multiple typed effects for a turn. The engine validates and commits the complete turn atomically, controls all mechanical truth, and increments the campaign version once. The browser may eventually render tool affordances, but it never supplies authoritative results.

## Engine and model roles

The Lantern engine owns:

- campaign and actor context;
- legal actions and action economy;
- dice, modifiers, DCs, targets, and outcomes;
- derived values;
- optional world context and movement validation;
- full character sheet, campaign log, and player notes;
- inventory, combat, quest, rest, death-save, and reward state;
- transactional persistence and versioning.

The model adapter may:

- interpret player text into a constrained tool call;
- ask a clarification question;
- read the current game through tools;
- turn a committed structured result into atmospheric prose;
- author original campaign content through typed content tools;
- propose narrative facts for later validation.

The model may not roll dice, choose arbitrary mechanical overrides, bypass ownership, or establish a mechanical fact that is absent from the committed result. It may choose the creative content of a reward, price, quest, NPC, or consequence; the engine then records the content and resolves any typed mechanical effects.

## Rules and content direction

The rules target a methodical Open5e recreation. The active local package is `open5e-v2-full-corpus-s8`, hash `56bdfbda9d59a398f3c9cb0e02aaf2b411e4280e99fb32c550cf158b38f7b07f`; the translation and fidelity contract lives in `docs/OPEN5E-RULES.md`. Open5e is not fetched at runtime. The reference engine informs domain/tool boundaries, while Open5e defines the source vocabulary.

Full-corpus capture does not imply universal mechanical execution. Reviewed SRD-2014 records are typed or executable; other source variants remain reference-only until promoted through deterministic compilers and tests. Players choose a campaign game system and enabled source documents beneath the hosted license ceiling, and the GUI surfaces matching attribution.

The reference engine supplies behavioral examples and candidate pure algorithms. Before porting anything, express it as a Lantern rule contract, cover it with a focused test, and record the resulting event evidence.

## Commercial direction

- Test product: Lantern Table Player Pass.
- Test price: 5 USD/month, one licensed player seat.
- Checkout: Stripe-hosted recurring subscription Checkout.
- Management: Stripe Customer Portal.
- Entitlement source: signature-verified Stripe webhooks, not the success redirect.

Before public charging, add usage limits, cancellation/deletion flows, customer support paths, privacy retention, backup/restore, and Stripe Tax/registration readiness.

## Explicit non-goals for the first engine slice

- Deploying or repairing the old broad MCP runtime as Lantern production.
- Multiplayer parties.
- A map renderer or 3D client.
- Client-side rules authority.
- Runtime Open5e fetching.
- Arbitrary DM/admin mutation commands in the player surface.
- Worker fleets or Postgres before measured need.
- The level-20 overpowered Mnehmos character as ordinary player content.
