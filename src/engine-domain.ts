import { randomInt, randomUUID } from "node:crypto";
import type { NarrationEnvelope } from "./ai-contracts.js";
import type {
  CompiledCreatureAttack,
  CompiledEffectProgram,
  CompiledSpellEffect,
  NormalizedSpell,
} from "./content/schema.js";
import type {
  EngineAbility,
  EngineCampaignProfile,
  EngineCampaignPhase,
  EngineCharacterCreationState,
  EngineCharacterDetails,
  EngineCharacter,
  EngineCharacterFeatureView,
  EngineCharacterSourceDetailsView,
  EngineCharacterView,
  EngineCampaignBeat,
  EngineCommand,
  EngineCombatant,
  EngineCombatantView,
  EngineCurrencyBreakdown,
  EngineCombat,
  EngineCombatView,
  EngineContentPolicy,
  EngineContentReference,
  EngineEvent,
  EngineFeatureReference,
  EngineImprovEffect,
  EngineInventoryItem,
  EngineMerchant,
  EngineMerchantView,
  EngineNpc,
  EngineMessage,
  EngineQuest,
  EngineResolution,
  EngineSessionView,
  EngineSpellReference,
  EngineSpellcastingView,
  EngineToolName,
  EngineWorldContextView,
  LanternCampaignState,
  RequestContext,
} from "./engine-contracts.js";
import {
  ENGINE_ABILITIES,
  OPEN5E_CLASS_PRESETS,
  OPEN5E_DEFAULT_ABILITY_SCORES,
  OPEN5E_DEFAULT_TOOL_CHOICES,
  OPEN5E_RULES_VERSION,
  OPEN5E_SPECIES_PRESETS,
  abilityModifier as open5eAbilityModifier,
  buildSavingThrows,
  buildSkillSheet,
  carryCapacity,
  createOpen5eInventoryItem,
  createOpen5eStarterInventory,
  currencyFromCopper,
  defaultOpen5eLanguages,
  materializeInventory,
  materializeInventoryItem,
  materializeCombatant,
  materializeCombatants,
  createOpen5eCombatant,
  getOpen5eCreature,
  getOpen5eSpell,
  getOpen5eSpellList,
  getOpen5eSpellProgression,
  getOpen5eClass,
  getOpen5eAlignment,
  getOpen5eBackground,
  getOpen5eFeat,
  getOpen5eLanguage,
  getOpen5eSkill,
  getOpen5eSpecies,
  normalizeInventoryItem,
  open5eSpellSlots,
  open5eItemContentKey,
  open5eCharacterContentKey,
  open5eCharacterOptions,
  open5eToolChoiceOptions,
  proficiencyBonus as open5eProficiencyBonus,
  requireOpen5eAlignment,
  requireOpen5eBackground,
  requireOpen5eClass,
  requireOpen5eLanguage,
  requireOpen5eSkill,
  requireOpen5eSpecies,
} from "./open5e-rules.js";

const proficiencyBonus = 2;

export function defaultCampaignProfile(): EngineCampaignProfile {
  return {
    name: "Unnamed Campaign",
    premise: "A new world is waiting for you to decide what matters.",
    setting: "Open fantasy",
    tone: "Adventurous",
  };
}

export function defaultContentPolicy(): EngineContentPolicy {
  return {
    gamesystem: "5e-2014",
    baseDocumentKey: "srd-2014",
    allowedDocumentKeys: ["core", "elderberry-inn-icons", "srd-2014"],
    allowedLicenseKeys: ["cc-by-40", "cc0"],
  };
}

export function normalizeContentPolicy(policy: EngineContentPolicy): EngineContentPolicy {
  const gamesystem = policy.gamesystem?.trim();
  const baseDocumentKey = policy.baseDocumentKey?.trim();
  const allowedDocumentKeys = [...new Set(
    (policy.allowedDocumentKeys ?? []).map((key) => key.trim()).filter(Boolean)
  )].sort();
  const allowedLicenseKeys = [...new Set(
    (policy.allowedLicenseKeys ?? []).map((key) => key.trim()).filter(Boolean)
  )].sort();
  if (!gamesystem || !baseDocumentKey || allowedLicenseKeys.length === 0) {
    return defaultContentPolicy();
  }
  if (!allowedDocumentKeys.includes(baseDocumentKey)) allowedDocumentKeys.push(baseDocumentKey);
  allowedDocumentKeys.sort();
  return { gamesystem, baseDocumentKey, allowedDocumentKeys, allowedLicenseKeys };
}

export function createInitialCampaign(
  accountId: string,
  actorId: string,
  campaignId = randomUUID(),
  campaign: EngineCampaignProfile = defaultCampaignProfile(),
  rulesVersion = OPEN5E_RULES_VERSION,
  contentPolicy: EngineContentPolicy = defaultContentPolicy()
): LanternCampaignState {
  const now = new Date().toISOString();
  const character = createUnconfiguredCharacter(randomUUID());
  return {
    id: campaignId,
    accountId,
    actorId,
    version: 0,
    rulesVersion,
    contentPolicy: normalizeContentPolicy(contentPolicy),
    campaign,
    phase: "character_creation",
    tutorialStep: 0,
    characterCreation: { abilityScoreDraft: null },
    worldContext: null,
    playerNotes: [],
    character,
    combat: emptyCombat(),
    quest: {
      id: "first-light",
      title: "The first chapter",
      objective: "Create a character and discover what your world is about.",
      status: "active",
      reward: { xp: 50, copper: 1_200 },
      rewardClaimed: false,
      progress: 0,
    },
    quests: [
      {
        id: "first-light",
        title: "The first chapter",
        objective: "Create a character and discover what your world is about.",
        status: "active",
        reward: { xp: 50, copper: 1_200 },
        rewardClaimed: false,
        progress: 0,
      },
    ],
    improvEffects: [],
    currentBeat: null,
    log: [
      makeMessage(
        "system",
        "Campaign created. The world is yours to shape; begin by creating the character who will enter it."
      ),
    ],
    lastRoll: null,
    updatedAt: now,
  };
}

export function normalizeCampaignState(state: LanternCampaignState): LanternCampaignState {
  const next = cloneCampaign(state) as LanternCampaignState & {
    campaign?: EngineCampaignProfile;
    phase?: EngineCampaignPhase;
    tutorialStep?: number;
    characterCreation?: EngineCharacterCreationState;
    scene?: unknown;
    playerNotes?: unknown;
    contentPolicy?: EngineContentPolicy;
  };
  if (!next.campaign) next.campaign = defaultCampaignProfile();
  next.contentPolicy = normalizeContentPolicy(next.contentPolicy ?? defaultContentPolicy());
  if (!next.tutorialStep && next.tutorialStep !== 0) next.tutorialStep = 0;
  if (!next.characterCreation) next.characterCreation = { abilityScoreDraft: null };
  if (!next.characterCreation.abilityScoreDraft) next.characterCreation.abilityScoreDraft = null;
  if (!next.phase) next.phase = next.version === 0 ? "character_creation" : "sandbox";
  if (next.character.created === undefined) {
    next.character.created = Boolean(next.character.name && next.character.name !== "Lantern Seeker");
  }
  if (next.character.name === "Lantern Seeker") {
    next.character = createUnconfiguredCharacter(next.character.id);
    next.phase = "character_creation";
    next.tutorialStep = 0;
    next.worldContext = null;
    next.playerNotes = [];
    next.quest = {
      id: "first-light",
      title: "The first chapter",
      objective: "Create a character and discover what your world is about.",
      status: "active",
      reward: { xp: 50, copper: 1_200 },
      rewardClaimed: false,
      progress: 0,
    };
    next.quests = [next.quest];
  }
  if (!Array.isArray(next.playerNotes)) next.playerNotes = [];
  if (!next.worldContext) next.worldContext = null;
  else {
    next.worldContext.npcs = Array.isArray(next.worldContext.npcs) ? next.worldContext.npcs : [];
    next.worldContext.merchants = Array.isArray(next.worldContext.merchants) ? next.worldContext.merchants : [];
    next.worldContext.merchants = next.worldContext.merchants.map(normalizeMerchant);
    next.worldContext.npcs = next.worldContext.npcs.map(normalizeNpc);
  }
  next.character = normalizeCharacter(next.character);
  next.combat = normalizeCombat(next.combat);
  next.quest = normalizeQuest(next.quest ?? ({} as EngineQuest));
  if (!Array.isArray(next.quests) || !next.quests.length) next.quests = [next.quest];
  next.quests = next.quests.map(normalizeQuest);
  const currentQuest = next.quests.find((quest) => quest.id === next.quest.id);
  if (currentQuest) next.quest = currentQuest;
  if (!Array.isArray(next.improvEffects)) next.improvEffects = [];
  if (next.currentBeat === undefined) next.currentBeat = null;
  // Discard the former fixed scene graph. A campaign earns its current context
  // from play; old scene data must not leak back into the player experience.
  delete next.scene;
  return next;
}

export function cloneCampaign(state: LanternCampaignState): LanternCampaignState {
  return JSON.parse(JSON.stringify(state)) as LanternCampaignState;
}

export function toSessionView(state: LanternCampaignState): EngineSessionView {
  const sandboxActions = ["observe", "listen", "roll"];
  return {
    id: state.id,
    userId: state.accountId,
    version: state.version,
    rulesVersion: state.rulesVersion,
    contentPolicy: state.contentPolicy,
    campaign: state.campaign,
    phase: state.phase,
    tutorialStep: state.tutorialStep,
    characterCreation: state.characterCreation,
    characterCreated: state.character.created,
    worldContext: projectWorldContext(state.worldContext),
    playerNotes: state.playerNotes,
    quests: state.quests,
    improvEffects: state.improvEffects,
    currentBeat: state.currentBeat,
    log: state.log.slice(-40),
    availableActions:
      state.phase === "character_creation"
        ? ["create_character"]
        : state.phase === "tutorial"
          ? ["continue"]
          : sandboxActions,
    lastRoll: state.lastRoll,
    character: characterData(state.character) as EngineSessionView["character"],
    combat: combatData(state.combat),
    updatedAt: state.updatedAt,
  };
}

export function readToolData(
  state: LanternCampaignState,
  tool:
    | "campaign_context"
    | "world_context"
    | "player_notes"
    | "npc_context"
    | "merchant_catalog"
    | "observe"
    | "character_sheet"
    | "inventory"
    | "quest_progress"
    | "combat_state"
): unknown {
  switch (tool) {
    case "campaign_context":
      return {
        campaignId: state.id,
        campaignVersion: state.version,
        rulesVersion: state.rulesVersion,
        campaign: state.campaign,
        phase: state.phase,
        tutorialStep: state.tutorialStep,
        worldContext: projectWorldContext(state.worldContext),
        playerNotes: state.playerNotes,
        quests: state.quests,
        improvEffects: state.improvEffects,
        currentBeat: state.currentBeat,
        character: characterData(state.character),
        combat: combatData(state.combat),
        quest: state.quest,
        recentLog: state.log.slice(-8),
      };
    case "observe":
      return {
        worldContext: projectWorldContext(state.worldContext),
        campaignVersion: state.version,
        combat: combatData(state.combat),
      };
    case "world_context":
      return projectWorldContext(state.worldContext);
    case "player_notes":
      return state.playerNotes;
    case "npc_context":
      return state.worldContext?.npcs ?? [];
    case "merchant_catalog":
      return projectMerchants(state.worldContext?.merchants ?? []);
    case "character_sheet":
      return characterData(state.character);
    case "inventory":
      return {
        items: materializeInventory(state.character.inventory),
        currency: state.character.currency,
        currencyBreakdown: currencyBreakdown(state.character.currency.copper),
        gold: state.character.gold,
        carryWeight: inventoryWeight(state.character.inventory),
        carryCapacity: carryCapacity(state.character.abilities.str),
        encumbered: inventoryWeight(state.character.inventory) > carryCapacity(state.character.abilities.str),
      };
    case "quest_progress":
      return state.quest;
    case "combat_state":
      return combatData(state.combat);
  }
}

export function resolveEngineCommand(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: EngineCommand,
  tool: EngineToolName | "declare" | "listen",
  playerText?: string
): EngineResolution {
  switch (command.kind) {
    case "observe":
      return readOnlyResolution(state, tool, "The DM's current world context is available to you.", readToolData(state, "observe"));
    case "listen":
      return resolveCheck(state, context, clientCommandId, command, tool, "wis", "perception", playerText ?? "Listen carefully.");
    case "world_context":
      return resolveWorldContext(state, context, clientCommandId, command, tool);
    case "player_note_add":
      return resolvePlayerNoteAdd(state, context, clientCommandId, command, tool);
    case "character_update":
      return resolveCharacterUpdate(state, context, clientCommandId, command, tool);
    case "move":
      return resolveMove(state, context, clientCommandId, command, tool);
    case "interact":
      return resolveInteract(state, context, clientCommandId, command, tool);
    case "social_check":
      return resolveSocialCheck(state, context, clientCommandId, command, tool);
    case "merchant_trade":
      return resolveMerchantTrade(state, context, clientCommandId, command, tool);
    case "quest_create":
      return resolveQuestCreate(state, context, clientCommandId, command, tool);
    case "quest_update":
      return resolveQuestUpdate(state, context, clientCommandId, command, tool);
    case "improvise":
      return resolveImprovise(state, context, clientCommandId, command, tool);
    case "campaign_beat":
      return resolveCampaignBeat(state, context, clientCommandId, command, tool);
    case "character_roll_stats":
      return resolveCharacterRollStats(state, context, clientCommandId, command, tool);
    case "character_create":
      return resolveCharacterCreate(state, context, clientCommandId, command, tool);
    case "equip_item":
      return resolveEquipItem(state, context, clientCommandId, command, tool);
    case "unequip_item":
      return resolveUnequipItem(state, context, clientCommandId, command, tool);
    case "drop_item":
      return resolveDropItem(state, context, clientCommandId, command, tool);
    case "tutorial_advance":
      return resolveTutorialAdvance(state, context, clientCommandId, command, tool);
    case "roll_check":
      return resolveCheck(state, context, clientCommandId, command, tool, command.ability, command.skill ?? null, command.goal);
    case "combat_action":
      return resolveCombatAction(state, context, clientCommandId, command, tool);
    case "combat_start":
      return resolveCombatStart(state, context, clientCommandId, command, tool);
    case "spawn_creature":
      return resolveSpawnCreature(state, context, clientCommandId, command, tool);
    case "learn_spell":
      return resolveLearnSpell(state, context, clientCommandId, command, tool);
    case "prepare_spell":
      return resolvePrepareSpell(state, context, clientCommandId, command, tool);
    case "cast_spell":
      return resolveCastSpell(state, context, clientCommandId, command, tool);
    case "advance_turn":
      return resolveAdvanceTurn(state, context, clientCommandId, command, tool);
    case "death_save":
      return resolveDeathSave(state, context, clientCommandId, command, tool);
    case "loot":
      return resolveLoot(state, context, clientCommandId, command, tool);
    case "rest":
      return resolveRest(state, context, clientCommandId, command, tool);
    case "use_item":
      return resolveUseItem(state, context, clientCommandId, command, tool);
    case "declare":
      return commit(
        state,
        context,
        clientCommandId,
        command,
        tool,
        "You declare: " + command.goal + ". No mechanical check was required; the DM must answer with the immediate fictional consequence.",
        { goal: command.goal },
        "declared",
        [],
        [],
        []
      );
  }
}

function resolveMove(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "move" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.combat.status === "active") {
    return rejection(state, tool, "combat_active", "You cannot leave while the encounter is active.");
  }

  const exit = state.worldContext?.exits.find((candidate) => candidate.id === command.destinationId);
  if (!exit) {
    return rejection(
      state,
      tool,
      "invalid_move",
      state.worldContext
        ? "That destination is not one of the exits the DM has established in the current context."
        : "There is no established world context to move through yet."
    );
  }
  const next = cloneCampaign(state);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "You move toward " + exit.label + ". The DM must establish the next context.",
    { exit, worldContext: state.worldContext },
    "moved",
    [],
    [],
    []
  );
}

function resolveWorldContext(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "world_context" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const next = cloneCampaign(state);
  const worldContext = {
    id: state.worldContext?.id ?? randomUUID(),
    title: command.title,
    description: command.description,
    features: command.features,
    exits: command.exits,
    npcs: (command.npcs ?? []).map(normalizeNpc),
    merchants: (command.merchants ?? []).map(normalizeMerchant),
  };
  next.worldContext = worldContext;
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "The DM establishes the current context: " + worldContext.title + ".",
    { worldContext },
    "world_context_updated",
    [],
    [],
    [{ path: "/worldContext", before: state.worldContext, after: worldContext }]
  );
}

function resolvePlayerNoteAdd(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "player_note_add" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const note = {
    id: randomUUID(),
    text: command.text,
    source: command.source,
    createdAt: new Date().toISOString(),
  };
  const next = cloneCampaign(state);
  next.playerNotes = [...state.playerNotes, note].slice(-100);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    command.source === "player" ? "Player note saved." : "The DM records a durable player note.",
    { note, playerNotes: next.playerNotes },
    "note_added",
    [],
    [],
    [{ path: "/playerNotes", before: state.playerNotes, after: next.playerNotes }]
  );
}

function resolveCharacterUpdate(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "character_update" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (!state.character.created) return rejection(state, tool, "character_required", "Create your character before editing the sheet.");
  if (!command.name && !command.background && !command.alignment && !command.description && !command.abilityScores && !command.details) {
    return rejection(state, tool, "no_character_changes", "Provide at least one character field to change.");
  }
  if (
    (state.character.backgroundRef && command.background)
    || (state.character.alignmentRef && command.alignment)
    || (state.character.classRef && command.abilityScores)
  ) {
    return rejection(
      state,
      tool,
      "source_field_locked",
      "Source-backed background, alignment, and ability scores cannot be overwritten after character creation."
    );
  }
  const next = cloneCampaign(state);
  const before = cloneCampaign(state).character;
  if (command.name) next.character.name = command.name;
  if (command.background) next.character.background = command.background;
  if (command.alignment) next.character.alignment = command.alignment;
  if (command.description) next.character.description = command.description;
  if (command.details) next.character.details = { ...next.character.details, ...command.details };
  if (command.abilityScores) next.character.abilities = { ...next.character.abilities, ...command.abilityScores };
  next.character = hydrateCharacter(next.character);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "Character sheet updated.",
    { character: characterData(next.character) },
    "character_updated",
    [],
    [],
    [{ path: "/character", before, after: next.character }]
  );
}

function resolveSocialCheck(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "social_check" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const npc = state.worldContext?.npcs.find((candidate) => candidate.id === command.npcId);
  if (!npc) return rejection(state, tool, "npc_not_found", "That NPC is not established in the current context.");
  const roll = randomInt(1, 21);
  const baseModifier = open5eAbilityModifier(state.character.abilities[command.ability]);
  const skillBonus = command.skill ? state.character.skills[command.skill]?.bonus : undefined;
  const modifier = skillBonus ?? baseModifier;
  const total = roll + modifier;
  const success = total >= npc.socialDc;
  const next = cloneCampaign(state);
  const nextNpc = next.worldContext?.npcs.find((candidate) => candidate.id === command.npcId);
  if (nextNpc) {
    nextNpc.relationshipScore = Math.max(-100, Math.min(100, nextNpc.relationshipScore + (success ? 5 : -2)));
  }
  const message =
    "You make a social check with " + npc.name + ": d20 " + roll + " " + signed(modifier) + " = " + total +
    " against DC " + npc.socialDc + ". " + (success ? "Success." : "Failure.");
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    { npc: nextNpc ?? npc, goal: command.goal, roll, modifier, dc: npc.socialDc, total, success },
    success ? "social_success" : "social_failure",
    [{ kind: "social_d20", value: roll, sides: 20 }],
    [{ name: command.ability + "_modifier", value: modifier }, { name: "social_dc", value: npc.socialDc }],
    nextNpc ? [{ path: "/worldContext/npcs/" + npc.id + "/relationshipScore", before: npc.relationshipScore, after: nextNpc.relationshipScore }] : []
  );
}

function resolveMerchantTrade(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "merchant_trade" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const merchant = state.worldContext?.merchants.find((candidate) => candidate.id === command.merchantId);
  if (!merchant) return rejection(state, tool, "merchant_not_found", "That merchant is not established in the current context.");
  const listing = merchant.items.find((candidate) => candidate.item.id === command.itemId);
  if (!listing) return rejection(state, tool, "item_not_for_sale", "That merchant has not established that item for trade.");
  const isBuying = command.side === "buy" || command.side === "offer";
  const unitPrice = command.side === "offer" ? command.offerUnitPriceCopper : isBuying ? listing.buyPriceCopper : listing.sellPriceCopper;
  if (unitPrice === undefined) return rejection(state, tool, "offer_price_required", "An offer needs an explicit unit price.");
  const total = unitPrice * command.quantity;
  if (!Number.isSafeInteger(total)) return rejection(state, tool, "price_out_of_range", "That transaction is too large to resolve safely.");
  if (listing.stock >= 0 && isBuying && listing.stock < command.quantity) {
    return rejection(state, tool, "insufficient_stock", "The merchant does not have that quantity available.");
  }

  const next = cloneCampaign(state);
  const nextMerchant = next.worldContext?.merchants.find((candidate) => candidate.id === command.merchantId);
  const nextListing = nextMerchant?.items.find((candidate) => candidate.item.id === command.itemId);
  if (!nextMerchant || !nextListing) return rejection(state, tool, "merchant_not_found", "That merchant is no longer available.");
  const beforeCharacter = cloneCampaign(state).character;
  if (isBuying) {
    if (state.character.currency.copper < total) return rejection(state, tool, "insufficient_funds", "You cannot afford that purchase.");
    next.character.currency.copper -= total;
    syncCurrencyProjection(next.character);
    addInventory(next.character.inventory, { ...normalizeInventoryItem(nextListing.item), quantity: command.quantity, equipped: false });
    if (nextListing.stock >= 0) nextListing.stock -= command.quantity;
  } else {
    const held = next.character.inventory.find((candidate) => candidate.id === command.itemId);
    if (!held || held.quantity < command.quantity) return rejection(state, tool, "item_not_owned", "You do not have that quantity to sell.");
    held.quantity -= command.quantity;
    if (held.quantity <= 0) next.character.inventory = next.character.inventory.filter((candidate) => candidate.id !== held.id);
    next.character.currency.copper += total;
    syncCurrencyProjection(next.character);
    if (nextListing.stock >= 0) nextListing.stock += command.quantity;
  }

  const verb = isBuying ? (command.side === "offer" ? "offer accepted" : "purchase complete") : "sale complete";
  const listingView = materializeInventoryItem(listing.item);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "The " + verb + ": " + command.quantity + " × " + listingView.name + " for " + formatCurrency(total) + ".",
    {
      merchant: nextMerchant,
      item: listingView,
      side: command.side,
      quantity: command.quantity,
      unitPriceCopper: unitPrice,
      totalCopper: total,
      currency: next.character.currency,
      currencyBreakdown: currencyBreakdown(next.character.currency.copper),
      inventory: materializeInventory(next.character.inventory),
    },
    isBuying ? "merchant_purchase" : "merchant_sale",
    [],
    [],
    [
      { path: "/character", before: beforeCharacter, after: next.character },
      { path: "/worldContext/merchants/" + merchant.id + "/items/" + listing.item.id, before: listing, after: nextListing },
    ]
  );
}

function resolveQuestCreate(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "quest_create" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const quest: EngineQuest = {
    id: randomUUID(),
    title: command.title,
    objective: command.objective,
    status: "active",
    reward: { xp: command.rewardXp, copper: command.rewardCopper },
    rewardClaimed: false,
    progress: 0,
    giverNpcId: command.giverNpcId,
    deadline: command.deadline,
  };
  const next = cloneCampaign(state);
  next.quests = [...state.quests, quest].slice(-50);
  next.quest = quest;
  return commit(next, context, clientCommandId, command, tool, "Quest added: " + quest.title + ".", { quest, quests: next.quests }, "quest_created", [], [], [
    { path: "/quests", before: state.quests, after: next.quests },
    { path: "/quest", before: state.quest, after: next.quest },
  ]);
}

function resolveQuestUpdate(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "quest_update" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const existing = state.quests.find((candidate) => candidate.id === command.questId);
  if (!existing) return rejection(state, tool, "quest_not_found", "That quest is not in the campaign journal.");
  const next = cloneCampaign(state);
  const updated = next.quests.find((candidate) => candidate.id === command.questId);
  if (!updated) return rejection(state, tool, "quest_not_found", "That quest is not in the campaign journal.");
  if (command.status) updated.status = command.status;
  if (command.objective) updated.objective = command.objective;
  if (command.progress !== undefined) updated.progress = command.progress;
  if (updated.status === "completed") updated.progress = 100;
  const rewardClaimedNow = updated.status === "completed" && !updated.rewardClaimed;
  if (rewardClaimedNow) {
    updated.rewardClaimed = true;
    next.character.currency.copper += updated.reward.copper;
    syncCurrencyProjection(next.character);
    next.character.xp += updated.reward.xp;
  }
  next.quest = updated;
  const rewardText = rewardClaimedNow
    ? " Reward claimed: " + formatCurrency(updated.reward.copper) + " and " + updated.reward.xp + " XP."
    : "";
  const stateChanges: Array<{ path: string; before: unknown; after: unknown }> = [
    { path: "/quests/" + updated.id, before: existing, after: updated },
  ];
  if (rewardClaimedNow) {
    stateChanges.push(
      { path: "/character/currency", before: state.character.currency, after: next.character.currency },
      { path: "/character/xp", before: state.character.xp, after: next.character.xp }
    );
  }
  return commit(next, context, clientCommandId, command, tool, "Quest updated: " + updated.title + "." + rewardText, { quest: updated, quests: next.quests, reward: rewardClaimedNow ? updated.reward : null, character: characterData(next.character) }, "quest_updated", [], [], stateChanges);
}

function resolveImprovise(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "improvise" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const next = cloneCampaign(state);
  const effect: EngineImprovEffect = {
    id: randomUUID(),
    title: command.title,
    description: command.description,
    effectType: command.effectType,
    targetId: command.targetId,
    amount: command.amount,
    condition: command.condition,
    remainingRounds: command.durationRounds,
    createdAt: new Date().toISOString(),
  };
  if (command.effectType === "damage" || command.effectType === "healing") {
    const targetIsPlayer = !command.targetId || command.targetId === state.actorId || command.targetId === state.character.id;
    if (targetIsPlayer) {
      const amount = command.amount ?? 0;
      if (command.effectType === "damage") next.character.hp = Math.max(0, next.character.hp - amount);
      else next.character.hp = Math.min(next.character.maxHp, next.character.hp + amount);
      if (next.character.hp === 0 && command.effectType === "damage") next.character.conditions = addCondition(next.character.conditions, "unconscious");
    }
  }
  if (command.effectType === "condition" && command.condition) {
    const targetIsPlayer = !command.targetId || command.targetId === state.actorId || command.targetId === state.character.id;
    if (targetIsPlayer) next.character.conditions = addCondition(next.character.conditions, command.condition);
  }
  next.improvEffects = [...state.improvEffects, effect].slice(-100);
  return commit(next, context, clientCommandId, command, tool, "Improv effect applied: " + command.title + ".", { effect, character: characterData(next.character) }, "improv_effect_applied", [], [], [
    { path: "/improvEffects", before: state.improvEffects, after: next.improvEffects },
    { path: "/character", before: state.character, after: next.character },
  ]);
}

function resolveCampaignBeat(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "campaign_beat" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const beat: EngineCampaignBeat = { id: randomUUID(), title: command.title, description: command.description, pressure: command.pressure, choices: command.choices, createdAt: new Date().toISOString() };
  const next = cloneCampaign(state);
  next.currentBeat = beat;
  return commit(next, context, clientCommandId, command, tool, "The campaign moves: " + beat.title + ".", { beat }, "campaign_beat", [], [], [
    { path: "/currentBeat", before: state.currentBeat, after: beat },
  ]);
}

function resolveInteract(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "interact" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  return commit(
    state,
    context,
    clientCommandId,
    command,
    tool,
    "You act on " + command.targetId + ". No mechanical check was required; the DM narrates the immediate consequence.",
    { targetId: command.targetId, goal: command.goal },
    "interacted",
    [],
    [],
    []
  );
}

function resolveCharacterCreate(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "character_create" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.phase !== "character_creation" || state.character.created) {
    return rejection(state, tool, "character_locked", "Character creation is only available at the beginning of a campaign.");
  }

  const usesCanonicalOptions = Boolean(
    command.speciesKey
    || command.classKey
    || command.backgroundKey
    || command.alignmentKey
    || command.abilityScoreMethod
    || command.abilityScoreDraftId
    || command.abilityBonusChoices
    || command.skillKeys
    || command.languageKeys
    || command.toolProficiencies
  );
  if (usesCanonicalOptions && state.rulesVersion !== OPEN5E_RULES_VERSION) {
    return rejection(
      state,
      tool,
      "rules_version_mismatch",
      "This campaign is pinned to a different rules pack and must be migrated before using canonical character options."
    );
  }

  let nextCharacter: EngineCharacter;
  try {
    if (usesCanonicalOptions) {
      nextCharacter = createCanonicalCharacter(command, state.character.id, state.contentPolicy, state.characterCreation);
    } else {
      if (!command.species || !command.className) {
        return rejection(
          state,
          tool,
          "character_options_required",
          "Choose exact Open5e species and class keys, or provide both legacy preset fields."
        );
      }
      nextCharacter = createCharacter(
        command.name,
        command.species,
        command.className,
        state.character.id,
        true,
        command.background,
        command.alignment,
        command.abilityScores
      );
    }
  } catch (error) {
    if (error instanceof CharacterCreationError) {
      return rejection(state, tool, error.code, error.message);
    }
    const message = error instanceof Error ? error.message : "The character options could not be resolved.";
    return rejection(state, tool, "invalid_character_options", message);
  }
  const next = cloneCampaign(state);
  next.character = nextCharacter;
  next.characterCreation = { abilityScoreDraft: null };
  next.phase = "tutorial";
  next.tutorialStep = 0;
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    nextCharacter.name + " is ready. The tutorial will teach the table, then the world is yours.",
    { character: characterData(nextCharacter) },
    "character_created",
    [],
    [],
    [{ path: "/character", before: state.character, after: nextCharacter }]
  );
}

function resolveEquipItem(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "equip_item" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const item = state.character.inventory.find((candidate) => candidate.id === command.itemId);
  if (!item) return rejection(state, tool, "item_not_found", "That item is not in your inventory.");
  const itemView = materializeInventoryItem(item);
  if (itemView.kind !== "weapon" && itemView.kind !== "armor") return rejection(state, tool, "not_equipment", "Only weapons and armor can be equipped.");
  if (itemView.isMagic && itemView.mechanicsTier !== 2) {
    return rejection(
      state,
      tool,
      "content_tier_insufficient",
      "That magic item's effect is available as Open5e prose but has not been compiled for mechanical use."
    );
  }
  const next = cloneCampaign(state);
  next.character.inventory = next.character.inventory.map((candidate) => {
    if (candidate.slot !== command.slot) return candidate;
    return { ...candidate, equipped: false };
  });
  const equipped = next.character.inventory.find((candidate) => candidate.id === command.itemId);
  if (!equipped) return rejection(state, tool, "item_not_found", "That item is not in your inventory.");
  equipped.slot = command.slot;
  equipped.equipped = true;
  next.character.ac = deriveArmorClass(next.character);
  return commit(next, context, clientCommandId, command, tool, "You equip the " + itemView.name + ".", { item: materializeInventoryItem(equipped), character: characterData(next.character) }, "item_equipped", [], [], [
    { path: "/character/inventory", before: state.character.inventory, after: next.character.inventory },
    { path: "/character/ac", before: state.character.ac, after: next.character.ac },
  ]);
}

function resolveUnequipItem(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "unequip_item" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const item = state.character.inventory.find((candidate) => candidate.id === command.itemId);
  if (!item) return rejection(state, tool, "item_not_found", "That item is not in your inventory.");
  if (!item.equipped) return rejection(state, tool, "item_not_equipped", "That item is not equipped.");
  const next = cloneCampaign(state);
  const target = next.character.inventory.find((candidate) => candidate.id === command.itemId);
  if (target) target.equipped = false;
  next.character.ac = deriveArmorClass(next.character);
  return commit(next, context, clientCommandId, command, tool, "You unequip the " + materializeInventoryItem(item).name + ".", { item: target ? materializeInventoryItem(target) : null, character: characterData(next.character) }, "item_unequipped", [], [], [
    { path: "/character/inventory", before: state.character.inventory, after: next.character.inventory },
    { path: "/character/ac", before: state.character.ac, after: next.character.ac },
  ]);
}

function resolveDropItem(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "drop_item" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const item = state.character.inventory.find((candidate) => candidate.id === command.itemId);
  if (!item) return rejection(state, tool, "item_not_found", "That item is not in your inventory.");
  if (item.quantity < command.quantity) return rejection(state, tool, "quantity_unavailable", "You do not have that quantity.");
  if (item.equipped && command.quantity >= item.quantity) return rejection(state, tool, "item_equipped", "Unequip the item before dropping it.");
  const next = cloneCampaign(state);
  const target = next.character.inventory.find((candidate) => candidate.id === command.itemId);
  if (target) target.quantity -= command.quantity;
  next.character.inventory = next.character.inventory.filter((candidate) => candidate.quantity > 0);
  return commit(next, context, clientCommandId, command, tool, "You drop " + command.quantity + " × " + materializeInventoryItem(item).name + ".", { itemId: item.id, quantity: command.quantity, inventory: materializeInventory(next.character.inventory) }, "item_dropped", [], [], [
    { path: "/character/inventory", before: state.character.inventory, after: next.character.inventory },
  ]);
}

function resolveTutorialAdvance(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "tutorial_advance" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (!state.character.created) return rejection(state, tool, "character_required", "Create your character before entering the tutorial.");
  if (state.phase !== "tutorial") return rejection(state, tool, "tutorial_not_active", "The tutorial is not the current chapter of this campaign.");

  const next = cloneCampaign(state);
  if (state.tutorialStep < 1) {
    next.tutorialStep = 1;
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      "The first rule is simple: describe what you try, and the world will answer.",
      { phase: next.phase, tutorialStep: next.tutorialStep },
      "tutorial_advanced",
      [],
      [],
      [{ path: "/tutorialStep", before: state.tutorialStep, after: next.tutorialStep }]
    );
  }

  next.phase = "sandbox";
  next.tutorialStep = 2;
  next.quest = {
    id: "first-light",
    title: "The first chapter",
    objective: "Follow the consequences of your choices and decide what your world becomes.",
    status: "active",
    reward: { xp: 50, copper: 1_200 },
    rewardClaimed: false,
    progress: 0,
  };
  next.quests = next.quests.map((quest) => quest.id === next.quest.id ? next.quest : quest);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "The tutorial ends here. The world is open now; choose a direction and make it yours.",
    { phase: next.phase, tutorialStep: next.tutorialStep },
    "tutorial_completed",
    [],
    [],
    [
      { path: "/phase", before: state.phase, after: next.phase },
      { path: "/tutorialStep", before: state.tutorialStep, after: next.tutorialStep },
    ]
  );
}

function resolveCheck(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "roll_check" }> | Extract<EngineCommand, { kind: "listen" }>,
  tool: EngineToolName | "declare" | "listen",
  ability: EngineAbility,
  skill: string | null,
  goal: string
): EngineResolution {
  const roll = randomInt(1, 21);
  const modifier = skill && state.character.skills[skill]
    ? state.character.skills[skill].bonus
    : abilityModifier(state.character.abilities[ability]);
  const dc = state.combat.status === "active" ? 14 : 12;
  const total = roll + modifier;
  const success = total >= dc;
  const label = ability.toUpperCase() + (skill ? " (" + skill + ")" : "");
  const text =
    "You make a " +
    label +
    " check: d20 " +
    roll +
    " " +
    signed(modifier) +
    " = " +
    total +
    " against DC " +
    dc +
    ". " +
    (success ? "Success." : "Failure.");
  const next = cloneCampaign(state);
  next.lastRoll = roll;
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    text,
    { ability, skill, goal, dc, roll, modifier, total, success },
    success ? "success" : "failure",
    [{ kind: "d20", value: roll, sides: 20 }],
    [{ name: ability + "_modifier", value: modifier }, { name: "dc", value: dc }],
    [{ path: "/lastRoll", before: state.lastRoll, after: roll }]
  );
}

function resolveCombatStart(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "combat_start" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.combat.status === "active") return rejection(state, tool, "combat_active", "An encounter is already active.");
  const totalCount = command.creatures.reduce((total, group) => total + group.count, 0);
  if (totalCount > 20) {
    return rejection(state, tool, "encounter_too_large", "An encounter can contain at most 20 creature instances.");
  }
  for (const group of command.creatures) {
    if (!getOpen5eCreature(group.creatureKey)) {
      return rejection(state, tool, "content_not_installed", `Creature content is not installed: ${group.creatureKey}.`);
    }
  }
  const enemies = command.creatures.flatMap((group) => createCombatants(group.creatureKey, group.count, group.distanceFeet ?? 30));
  const next = cloneCampaign(state);
  next.combat = {
    status: "active",
    encounterId: command.encounterId,
    encounterName: command.encounterName,
    round: 1,
    activeActorId: state.actorId,
    actionUsed: false,
    bonusActionUsed: false,
    reactionUsed: false,
    enemies,
    lootClaimed: false,
    lastAction: null,
  };
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "Encounter started: " + command.encounterName + ". " + describeCombatants(enemies) + " Your turn.",
    { combat: combatData(next.combat) },
    "encounter_started",
    [],
    [],
    [{ path: "/combat", before: state.combat, after: next.combat }]
  );
}

function resolveSpawnCreature(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "spawn_creature" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.combat.status !== "active") {
    return rejection(state, tool, "no_active_combat", "Start an encounter before spawning additional combatants.");
  }
  if (state.combat.enemies.length + command.count > 20) {
    return rejection(state, tool, "encounter_too_large", "An encounter can contain at most 20 creature instances.");
  }
  if (!getOpen5eCreature(command.creatureKey)) {
    return rejection(state, tool, "content_not_installed", `Creature content is not installed: ${command.creatureKey}.`);
  }
  const spawned = createCombatants(command.creatureKey, command.count, command.distanceFeet ?? 30);
  const next = cloneCampaign(state);
  next.combat.enemies.push(...spawned);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    describeCombatants(spawned) + " join the encounter.",
    { spawned: materializeCombatants(spawned), combat: combatData(next.combat) },
    "creatures_spawned",
    [],
    [],
    [{ path: "/combat/enemies", before: state.combat.enemies, after: next.combat.enemies }]
  );
}

function resolveLearnSpell(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "learn_spell" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const spellcasting = state.character.spellcasting;
  const progression = getOpen5eSpellProgression(state.character.className);
  if (!state.character.created || !spellcasting || !progression) {
    return rejection(state, tool, "spellcasting_unavailable", "This character does not have an installed spellcasting progression.");
  }
  const spell = getOpen5eSpell(command.spellKey);
  if (!spell) return rejection(state, tool, "content_not_installed", `Spell content is not installed: ${command.spellKey}.`);
  const classList = getOpen5eSpellList(state.character.className);
  if (!classList) {
    return rejection(state, tool, "class_spell_list_unavailable", `No reviewed spell list is installed for ${state.character.className}.`);
  }
  if (!classList.spells.some((candidate) => candidate.contentKey === spell.contentKey)) {
    return rejection(state, tool, "spell_not_on_class_list", `${spell.definition.name} is not on the installed ${classList.className} spell list.`);
  }
  const existing = spellcasting.knownSpells.find((candidate) => candidate.contentKey === spell.contentKey);
  if (existing) {
    if (existing.packHash !== spell.packHash) {
      return rejection(state, tool, "content_pack_mismatch", `${spell.definition.name} is pinned to a different content pack and requires an explicit repin.`);
    }
    return rejection(state, tool, "spell_already_known", `${spell.definition.name} is already known.`);
  }

  const levelIndex = Math.max(0, Math.min(19, state.character.level - 1));
  if (spell.definition.level === 0) {
    const limit = progression.cantripsKnown[levelIndex];
    if (limit === null || limit <= 0) {
      return rejection(state, tool, "cantrips_unavailable", `${progression.className} does not learn cantrips at this level.`);
    }
    const knownCantrips = spellcasting.knownSpells.filter((reference) => getOpen5eSpell(reference.contentKey)?.definition.level === 0).length;
    if (knownCantrips >= limit) {
      return rejection(state, tool, "cantrip_limit_reached", `This character already knows the level-${state.character.level} limit of ${limit} cantrips.`);
    }
  } else {
    const highestSpellLevel = highestAvailableSlotLevel(spellcasting.slotMaximums);
    if (spell.definition.level > highestSpellLevel) {
      return rejection(state, tool, "spell_level_unavailable", `${spell.definition.name} requires a level-${spell.definition.level} slot; this character can cast through level ${highestSpellLevel}.`);
    }
    let limit: number | null = null;
    if (progression.selectionMode === "known") limit = progression.knownSpellLimits[levelIndex];
    else if (progression.selectionMode === "spellbook" && progression.spellbook) {
      limit = progression.spellbook.initialSpellCount
        + progression.spellbook.spellsGainedPerLevel * Math.max(0, state.character.level - 1);
    } else {
      return rejection(
        state,
        tool,
        "spell_learning_not_required",
        `${progression.className} prepares leveled spells directly from its class list; use prepare_spell.`
      );
    }
    const knownLeveled = spellcasting.knownSpells.filter((reference) => (getOpen5eSpell(reference.contentKey)?.definition.level ?? 0) > 0).length;
    if (limit === null || knownLeveled >= limit) {
      return rejection(state, tool, "known_spell_limit_reached", `This character already has the level-${state.character.level} limit of ${limit ?? 0} leveled spells.`);
    }
  }

  const next = cloneCampaign(state);
  const reference = spellReference(spell.contentKey, spell.packHash);
  next.character.spellcasting!.knownSpells.push(reference);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    `${spell.definition.name} is added to ${progression.selectionMode === "spellbook" ? "the spellbook" : "the known spell repertoire"}.`,
    { spell: spell.definition, spellcasting: next.character.spellcasting },
    "spell_learned",
    [],
    [],
    [{ path: "/character/spellcasting/knownSpells", before: spellcasting.knownSpells, after: next.character.spellcasting!.knownSpells }]
  );
}

function resolvePrepareSpell(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "prepare_spell" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const spellcasting = state.character.spellcasting;
  const progression = getOpen5eSpellProgression(state.character.className);
  if (!state.character.created || !spellcasting || !progression) {
    return rejection(state, tool, "spellcasting_unavailable", "This character does not have an installed spellcasting progression.");
  }
  if (progression.selectionMode === "known") {
    return rejection(state, tool, "preparation_not_used", `${progression.className} casts known spells and does not prepare them.`);
  }
  const spell = getOpen5eSpell(command.spellKey);
  if (!spell) return rejection(state, tool, "content_not_installed", `Spell content is not installed: ${command.spellKey}.`);
  if (spell.definition.level === 0) {
    return rejection(state, tool, "cantrip_preparation_not_used", "Cantrips are cast from known cantrips and are not prepared.");
  }
  const classList = getOpen5eSpellList(state.character.className);
  if (!classList) {
    return rejection(state, tool, "class_spell_list_unavailable", `No reviewed spell list is installed for ${state.character.className}.`);
  }
  if (!classList.spells.some((candidate) => candidate.contentKey === spell.contentKey)) {
    return rejection(state, tool, "spell_not_on_class_list", `${spell.definition.name} is not on the installed ${classList.className} spell list.`);
  }
  if (spell.definition.level > highestAvailableSlotLevel(spellcasting.slotMaximums)) {
    return rejection(state, tool, "spell_level_unavailable", `${spell.definition.name} is above this character's available spell levels.`);
  }
  if (progression.selectionMode === "spellbook" && !hasPinnedSpell(spellcasting.knownSpells, spell.contentKey, spell.packHash)) {
    return rejection(state, tool, "spell_not_in_spellbook", `${spell.definition.name} must be learned into the spellbook before it can be prepared.`);
  }

  const existingIndex = spellcasting.preparedSpells.findIndex((candidate) => candidate.contentKey === spell.contentKey);
  if (!command.prepared) {
    if (existingIndex < 0) return rejection(state, tool, "spell_not_prepared", `${spell.definition.name} is not prepared.`);
    const next = cloneCampaign(state);
    next.character.spellcasting!.preparedSpells.splice(existingIndex, 1);
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      `${spell.definition.name} is no longer prepared.`,
      { spell: spell.definition, spellcasting: next.character.spellcasting },
      "spell_unprepared",
      [],
      [],
      [{ path: "/character/spellcasting/preparedSpells", before: spellcasting.preparedSpells, after: next.character.spellcasting!.preparedSpells }]
    );
  }
  if (existingIndex >= 0) {
    const existing = spellcasting.preparedSpells[existingIndex];
    if (existing?.packHash !== spell.packHash) {
      return rejection(state, tool, "content_pack_mismatch", `${spell.definition.name} is pinned to a different content pack and requires an explicit repin.`);
    }
    return rejection(state, tool, "spell_already_prepared", `${spell.definition.name} is already prepared.`);
  }
  const capacity = preparedSpellCapacity(state.character, progression.preparedFormula);
  if (spellcasting.preparedSpells.length >= capacity) {
    return rejection(state, tool, "prepared_spell_limit_reached", `This character can prepare ${capacity} leveled spells.`);
  }
  const next = cloneCampaign(state);
  next.character.spellcasting!.preparedSpells.push(spellReference(spell.contentKey, spell.packHash));
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    `${spell.definition.name} is prepared.`,
    { spell: spell.definition, preparedCapacity: capacity, spellcasting: next.character.spellcasting },
    "spell_prepared",
    [],
    [],
    [{ path: "/character/spellcasting/preparedSpells", before: spellcasting.preparedSpells, after: next.character.spellcasting!.preparedSpells }]
  );
}

function resolveCastSpell(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "cast_spell" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const spellcasting = state.character.spellcasting;
  const progression = getOpen5eSpellProgression(state.character.className);
  if (!state.character.created || !spellcasting || !progression) {
    return rejection(state, tool, "spellcasting_unavailable", "This character does not have an installed spellcasting progression.");
  }
  const spell = getOpen5eSpell(command.spellKey);
  if (!spell) return rejection(state, tool, "content_not_installed", `Spell content is not installed: ${command.spellKey}.`);
  const availableReferences = spell.definition.level === 0 || progression.selectionMode === "known"
    ? spellcasting.knownSpells
    : spellcasting.preparedSpells;
  if (!hasPinnedSpell(availableReferences, spell.contentKey, spell.packHash)) {
    const mismatched = availableReferences.some((candidate) => candidate.contentKey === spell.contentKey);
    return rejection(
      state,
      tool,
      mismatched ? "content_pack_mismatch" : "spell_not_available",
      mismatched
        ? `${spell.definition.name} is pinned to a different content pack and requires an explicit repin.`
        : `${spell.definition.name} is not currently ${spell.definition.level === 0 || progression.selectionMode === "known" ? "known" : "prepared"}.`
    );
  }
  if (!spell.effect) {
    return rejection(
      state,
      tool,
      "content_tier_insufficient",
      `${spell.definition.name} is preserved as Open5e prose but has no reviewed S4 executable primary effect.`
    );
  }
  if (state.combat.status !== "active") {
    return rejection(state, tool, "no_active_combat", "S4 executable spell effects currently resolve against combatants in an active encounter.");
  }
  if (state.character.conditions.includes("unconscious")) {
    return rejection(state, tool, "unconscious", "You cannot cast while unconscious.");
  }

  const castingTime = spell.definition.castingTime;
  if (castingTime !== "action" && castingTime !== "bonus-action" && castingTime !== "reaction") {
    return rejection(state, tool, "content_tier_insufficient", `${spell.definition.name}'s ${castingTime} casting time is not executable in an encounter turn.`);
  }
  if (castingTime !== "reaction" && state.combat.activeActorId !== state.actorId) {
    return rejection(state, tool, "off_turn", "It is not your turn; only a reaction spell can be cast now.");
  }
  if (castingTime === "action" && state.combat.actionUsed) {
    return rejection(state, tool, "action_already_used", "Your action is already spent this turn.");
  }
  if (castingTime === "bonus-action" && state.combat.bonusActionUsed) {
    return rejection(state, tool, "bonus_action_already_used", "Your bonus action is already spent this turn.");
  }
  if (castingTime === "reaction" && state.combat.reactionUsed) {
    return rejection(state, tool, "reaction_already_used", "Your reaction is already spent this round.");
  }

  const slotSelection = selectSpellSlot(spell.definition.level, command.slotLevel, spellcasting.slots);
  if ("code" in slotSelection) return rejection(state, tool, slotSelection.code, slotSelection.message);
  const selectedSlotLevel = slotSelection.slotLevel;
  const slotOption = selectedSlotLevel === null
    ? null
    : spell.definition.castingOptions.find((option) => option.type === `slot_level_${selectedSlotLevel}`) ?? null;
  if (
    selectedSlotLevel !== null
    && selectedSlotLevel > spell.definition.level
    && spell.definition.higherLevel.trim()
    && !slotOption
    && !spell.effect.slotLevelVariants[String(selectedSlotLevel)]
  ) {
    return rejection(
      state,
      tool,
      "content_tier_insufficient",
      `${spell.definition.name}'s level-${selectedSlotLevel} upcast is described only in prose and is not executable in S4.`
    );
  }
  const damageExpression = selectSpellDamage(spell.effect, spell.definition.level, selectedSlotLevel, state.character.level);
  const targetLimit = slotOption?.targetCount ?? spell.definition.targetCount;
  const usesAreaSelection = spell.definition.targetType === "point"
    || spell.definition.targetType === "area"
    || spell.definition.area.shape !== null;
  const selectedIds = usesAreaSelection
    ? [...new Set(command.targetIds)]
    : command.targetIds;
  if (selectedIds.length === 0) return rejection(state, tool, "target_required", `Choose at least one living target for ${spell.definition.name}.`);
  if (
    !usesAreaSelection
    && (spell.definition.targetType === "creature" || spell.definition.targetType === "object")
    && targetLimit !== null
    && selectedIds.length !== targetLimit
  ) {
    return rejection(state, tool, "invalid_target_count", `${spell.definition.name} requires ${targetLimit} target selection${targetLimit === 1 ? "" : "s"} at this casting level.`);
  }
  const targets = selectedIds.map((targetId) => findLiveCombatant(state.combat, targetId));
  if (targets.some((target) => target === null)) {
    return rejection(state, tool, "invalid_spell_target", "Every spell target must be a living combatant in the active encounter.");
  }
  const rangeFeet = executableSpellRangeFeet(spell.definition);
  const outOfRange = targets.find((target) => target !== null && target.distanceFeet > rangeFeet);
  if (outOfRange) {
    return rejection(
      state,
      tool,
      "spell_target_out_of_range",
      `${spell.definition.name} can currently resolve through ${rangeFeet} feet; target ${outOfRange.id} is ${outOfRange.distanceFeet} feet away.`
    );
  }

  const next = cloneCampaign(state);
  if (selectedSlotLevel !== null) next.character.spellcasting!.slots[String(selectedSlotLevel)] -= 1;
  if (castingTime === "action") next.combat.actionUsed = true;
  else if (castingTime === "bonus-action") next.combat.bonusActionUsed = true;
  else next.combat.reactionUsed = true;
  if (spell.definition.concentration) {
    next.character.spellcasting!.concentration = {
      contentKey: spell.contentKey,
      packHash: spell.packHash,
      startedRound: next.combat.round,
    };
  }

  const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
  const modifiers: Array<{ name: string; value: number }> = [];
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  if (selectedSlotLevel !== null) {
    changes.push({
      path: `/character/spellcasting/slots/${selectedSlotLevel}`,
      before: spellcasting.slots[String(selectedSlotLevel)],
      after: next.character.spellcasting!.slots[String(selectedSlotLevel)],
    });
  }
  if (spell.definition.concentration) {
    changes.push({
      path: "/character/spellcasting/concentration",
      before: spellcasting.concentration,
      after: next.character.spellcasting!.concentration,
    });
  }
  changes.push({
    path: `/combat/${castingTime === "bonus-action" ? "bonusActionUsed" : castingTime === "reaction" ? "reactionUsed" : "actionUsed"}`,
    before: false,
    after: true,
  });

  const targetResults: Array<Record<string, unknown>> = [];
  for (const [index, sourceTarget] of targets.entries()) {
    if (!sourceTarget) continue;
    const target = next.combat.enemies.find((candidate) => candidate.id === sourceTarget.id);
    if (!target || !target.alive) continue;
    const targetView = materializeCombatant(target);
    let successfulSave: boolean | null = null;
    let hit = true;
    let critical = false;
    let attackTotal: number | null = null;
    let saveTotal: number | null = null;

    if (spell.effect.resolution === "spell-attack") {
      const die = randomInt(1, 21);
      attackTotal = die + spellcasting.spellAttackBonus;
      critical = die === 20;
      hit = die !== 1 && (critical || attackTotal >= targetView.armorClass);
      rolls.push({ kind: `spell_attack_${index + 1}`, value: die, sides: 20 });
      modifiers.push({ name: `spell_attack_bonus_${index + 1}`, value: spellcasting.spellAttackBonus });
    } else if (spell.effect.resolution === "saving-throw") {
      const ability = spell.definition.savingThrowAbility;
      if (!ability) return rejection(state, tool, "content_tier_insufficient", `${spell.definition.name} has no structured saving throw ability.`);
      const die = randomInt(1, 21);
      const saveModifier = targetView.savingThrowsAll[ability];
      saveTotal = die + saveModifier;
      successfulSave = saveTotal >= spellcasting.spellSaveDc;
      rolls.push({ kind: `spell_save_${ability}_${index + 1}`, value: die, sides: 20 });
      modifiers.push({ name: `target_${ability}_save_${index + 1}`, value: saveModifier });
    }

    const rolled = hit ? rollSpellDamage(damageExpression, critical, rolls, index + 1) : 0;
    const afterSave = successfulSave
      ? spell.effect.saveOnSuccess === "half" ? Math.floor(rolled / 2) : 0
      : rolled;
    const damage = applyCreatureDamageAffinity(targetView, spell.effect.damageType.contentKey, afterSave);
    const beforeHp = target.hp;
    target.hp = Math.max(0, target.hp - damage);
    target.alive = target.hp > 0;
    changes.push({ path: `/combat/enemies/${target.id}/hp`, before: beforeHp, after: target.hp });
    targetResults.push({
      targetId: target.id,
      targetName: targetView.name,
      hit,
      critical,
      attackTotal,
      successfulSave,
      saveTotal,
      damageRolled: rolled,
      damageApplied: damage,
      damageType: spell.effect.damageType.name,
      hpBefore: beforeHp,
      hpAfter: target.hp,
      defeated: !target.alive,
    });
  }

  const defeatedAll = !next.combat.enemies.some((combatant) => combatant.alive);
  if (defeatedAll) {
    next.combat.status = "ended";
    next.combat.activeActorId = null;
    changes.push({ path: "/combat/status", before: "active", after: "ended" });
  } else if (castingTime === "action") {
    next.combat.activeActorId = firstLiveCombatantId(next.combat);
  }
  next.combat.lastAction = `cast:${spell.contentKey}`;

  const totalDamage = targetResults.reduce((sum, result) => sum + Number(result.damageApplied ?? 0), 0);
  const slotText = selectedSlotLevel === null ? " as a cantrip" : ` with a level-${selectedSlotLevel} slot`;
  const message = `${spell.definition.name} resolves${slotText}: ${totalDamage} total ${spell.effect.damageType.name.toLowerCase()} damage across ${targetResults.length} target selection${targetResults.length === 1 ? "" : "s"}.`
    + (spell.effect.hasDeferredProseEffects ? " Only the reviewed primary damage is applied; additional source-prose effects remain deferred." : "")
    + (defeatedAll ? " The encounter ends." : castingTime === "action" ? " The opposition now has the turn." : "");
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    {
      spell: spell.definition,
      slotLevel: selectedSlotLevel,
      targetResults,
      deferredProseEffects: spell.effect.hasDeferredProseEffects,
      range: { source: spell.definition.range, executableFeet: rangeFeet },
      combat: combatData(next.combat),
      character: characterData(next.character),
    },
    defeatedAll ? "spell_encounter_ended" : "spell_cast",
    rolls,
    modifiers,
    changes
  );
}

function spellReference(contentKey: string, packHash: string): EngineSpellReference {
  return { contentKey, packHash };
}

function hasPinnedSpell(references: EngineSpellReference[], contentKey: string, packHash: string): boolean {
  return references.some((reference) => reference.contentKey === contentKey && reference.packHash === packHash);
}

function highestAvailableSlotLevel(slotMaximums: Record<string, number>): number {
  return Object.entries(slotMaximums).reduce(
    (highest, [slotLevel, count]) => count > 0 ? Math.max(highest, Number(slotLevel)) : highest,
    0
  );
}

function preparedSpellCapacity(
  character: EngineCharacter,
  formula: { classLevelMultiplier: number; abilityModifierMultiplier: number; minimum: number } | null
): number {
  if (!character.spellcasting || !formula) return 0;
  return Math.max(
    formula.minimum,
    Math.floor(
      character.level * formula.classLevelMultiplier
      + character.abilityModifiers[character.spellcasting.ability] * formula.abilityModifierMultiplier
    )
  );
}

function selectSpellSlot(
  spellLevel: number,
  requestedSlotLevel: number | undefined,
  slots: Record<string, number>
): { slotLevel: number | null } | { code: string; message: string } {
  if (spellLevel === 0) {
    if (requestedSlotLevel !== undefined) return { code: "cantrip_no_slot", message: "Cantrips do not consume spell slots." };
    return { slotLevel: null };
  }
  if (requestedSlotLevel !== undefined && requestedSlotLevel < spellLevel) {
    return { code: "slot_level_too_low", message: `This spell requires a level-${spellLevel} slot or higher.` };
  }
  const slotLevel = requestedSlotLevel ?? Object.entries(slots)
    .filter(([candidate, remaining]) => Number(candidate) >= spellLevel && remaining > 0)
    .map(([candidate]) => Number(candidate))
    .sort((left, right) => left - right)[0];
  if (slotLevel === undefined || (slots[String(slotLevel)] ?? 0) <= 0) {
    return { code: "no_spell_slot", message: requestedSlotLevel === undefined ? "No legal spell slot remains." : `No level-${requestedSlotLevel} spell slot remains.` };
  }
  return { slotLevel };
}

function selectSpellDamage(
  effect: CompiledSpellEffect,
  spellLevel: number,
  slotLevel: number | null,
  playerLevel: number
): CompiledSpellEffect["baseDamage"] {
  if (spellLevel === 0) {
    const applicableLevel = Object.keys(effect.playerLevelVariants)
      .map(Number)
      .filter((candidate) => candidate <= playerLevel)
      .sort((left, right) => right - left)[0];
    return applicableLevel === undefined ? effect.baseDamage : effect.playerLevelVariants[String(applicableLevel)] ?? effect.baseDamage;
  }
  if (slotLevel !== null) return effect.slotLevelVariants[String(slotLevel)] ?? effect.baseDamage;
  return effect.baseDamage;
}

function rollSpellDamage(
  expression: CompiledSpellEffect["baseDamage"],
  critical: boolean,
  rolls: Array<{ kind: string; value: number; sides?: number }>,
  targetIndex: number
): number {
  if (expression.kind === "flat") return expression.amount;
  const diceCount = expression.diceCount * (critical ? 2 : 1);
  let total = expression.bonus;
  for (let index = 0; index < diceCount; index += 1) {
    const die = randomInt(1, expression.dieSides + 1);
    total += die;
    rolls.push({ kind: `spell_damage_${targetIndex}`, value: die, sides: expression.dieSides });
  }
  return Math.max(0, total);
}

function applyCreatureDamageAffinity(
  target: EngineCombatantView,
  damageTypeContentKey: string,
  damage: number
): number {
  const immune = target.defenses.damageImmunities.some((reference) => reference.contentKey === damageTypeContentKey);
  if (immune) return 0;
  const resistant = target.defenses.damageResistances.some((reference) => reference.contentKey === damageTypeContentKey);
  const vulnerable = target.defenses.damageVulnerabilities.some((reference) => reference.contentKey === damageTypeContentKey);
  if (resistant && !vulnerable) return Math.floor(damage / 2);
  if (vulnerable && !resistant) return damage * 2;
  return damage;
}

function executableSpellRangeFeet(definition: NormalizedSpell): number {
  const sourceDistance = definition.range.unit.toLocaleLowerCase("en-US") === "miles"
    ? definition.range.distance * 5_280
    : definition.range.distance;
  const rangeText = definition.range.text.trim().toLocaleLowerCase("en-US");
  if (rangeText === "touch") return 5;
  if (rangeText === "self") return definition.area.size ?? 5;
  return sourceDistance + (definition.area.size ?? 0);
}

function resolveCombatAction(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "combat_action" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.combat.status !== "active") return rejection(state, tool, "no_active_combat", "There is no active encounter.");
  if (state.combat.activeActorId !== state.actorId) {
    return rejection(state, tool, "off_turn", "It is not your turn. Advance the encounter before acting again.");
  }
  if (state.character.conditions.includes("unconscious")) {
    return rejection(state, tool, "unconscious", "You are unconscious and must make a death save.");
  }
  const preventingCondition = state.character.conditions.find((condition) =>
    condition === "incapacitated"
    || condition === "paralyzed"
    || condition === "petrified"
    || condition === "stunned"
  );
  if (preventingCondition) {
    return rejection(
      state,
      tool,
      "condition_prevents_action",
      `You are ${preventingCondition} and cannot take an action. Advance the turn to resolve the skipped turn.`
    );
  }
  if (state.combat.actionUsed) return rejection(state, tool, "action_already_used", "Your action is already spent this turn.");

  const sourceTarget = findLiveCombatant(state.combat, command.targetId);
  if (command.action === "attack" && !sourceTarget) {
    return rejection(state, tool, "target_required", "Choose a living target for the attack.");
  }

  const next = cloneCampaign(state);
  const target = sourceTarget ? findLiveCombatant(next.combat, sourceTarget.id) : null;
  const targetView = target ? materializeCombatant(target) : null;
  next.combat.actionUsed = true;
  next.combat.lastAction = command.action;
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [
    { path: "/combat/actionUsed", before: false, after: true },
  ];
  let message = "You " + command.action + ".";
  const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
  const modifiers: Array<{ name: string; value: number }> = [];
  let outcome = "action_used";

  if (command.action === "attack" && target) {
    const attackRoll = randomInt(1, 21);
    const attackModifier = abilityModifier(next.character.abilities.str) + proficiencyBonus;
    const total = attackRoll + attackModifier;
    const critical = attackRoll === 20;
    const hit = critical || total >= targetView!.armorClass;
    rolls.push({ kind: "attack_d20", value: attackRoll, sides: 20 });
    modifiers.push({ name: "attack_bonus", value: attackModifier }, { name: "target_ac", value: targetView!.armorClass });
    if (hit) {
      const damageRoll = randomInt(1, 9);
      const damageModifier = abilityModifier(next.character.abilities.str);
      const damage = (critical ? damageRoll * 2 : damageRoll) + damageModifier;
      const beforeHp = target.hp;
      target.hp = Math.max(0, target.hp - Math.max(1, damage));
      target.alive = target.hp > 0;
      rolls.push({ kind: "damage_d8", value: damageRoll, sides: 8 });
      modifiers.push({ name: "damage_modifier", value: damageModifier });
      changes.push({ path: "/combat/enemies/" + target.id + "/hp", before: beforeHp, after: target.hp });
      message =
        "Your attack " +
        (critical ? "critically " : "") +
        "hits " +
        targetView!.name +
        " for " +
        Math.max(1, damage) +
        " damage.";
      outcome = target.alive ? "hit" : "defeated";
      if (!next.combat.enemies.some((combatant) => combatant.alive)) {
        next.combat.status = "ended";
        next.combat.activeActorId = null;
        message += " The encounter ground falls silent.";
        changes.push({ path: "/combat/status", before: "active", after: "ended" });
      } else {
        next.combat.activeActorId = firstLiveCombatantId(next.combat);
        message += " The opposition is still standing; advance the turn to resolve its answer.";
      }
    } else {
      next.combat.activeActorId = firstLiveCombatantId(next.combat);
      message = "Your attack misses " + targetView!.name + ". Advance the turn to see its answer.";
      outcome = "miss";
    }
  } else {
    if (command.action === "dodge") {
      next.character.conditions = addCondition(next.character.conditions, "dodging");
      changes.push({ path: "/character/conditions", before: state.character.conditions, after: next.character.conditions });
      message = "You take a guarded stance. The next incoming attack is made at disadvantage.";
    } else if (command.action === "dash") {
      message = "You gain ground across the encounter ground. The sentry watches for an opening.";
    } else if (command.action === "disengage") {
      message = "You withdraw without provoking a strike.";
    } else if (command.action === "help") {
      message = "You create an opening, though there is no ally here to take advantage of it.";
    }
    next.combat.activeActorId = firstLiveCombatantId(next.combat);
  }

  resolveTargetEndConditionEffects(next, rolls, modifiers, changes);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    {
      action: command.action,
      targetId: target?.id ?? null,
      combat: combatData(next.combat),
      character: characterData(next.character),
    },
    outcome,
    rolls,
    modifiers,
    changes
  );
}

function resolveAdvanceTurn(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "advance_turn" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.combat.status !== "active") return rejection(state, tool, "no_active_combat", "There is no active encounter to advance.");
  if (state.combat.activeActorId === state.actorId) {
    if (state.character.conditions.some((condition) =>
      condition === "incapacitated"
      || condition === "paralyzed"
      || condition === "petrified"
      || condition === "stunned"
    )) {
      return resolveSkippedCharacterTurn(state, context, clientCommandId, command, tool);
    }
    return rejection(state, tool, "not_enemy_turn", "The enemy has not been given the turn yet.");
  }

  const enemy = state.combat.activeActorId
    ? findLiveCombatant(state.combat, state.combat.activeActorId)
    : null;
  if (!enemy) {
    const next = cloneCampaign(state);
    next.combat.status = "ended";
    next.combat.activeActorId = null;
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      "With no foe left standing, the encounter ends.",
      { combat: combatData(next.combat) },
      "encounter_ended",
      [],
      [],
      [{ path: "/combat/status", before: "active", after: "ended" }]
    );
  }
  if (command.combatantId && command.combatantId !== enemy.id) {
    return rejection(state, tool, "off_turn", `It is ${enemy.id}'s turn, not ${command.combatantId}'s.`);
  }

  const enemyView = materializeCombatant(enemy);
  if (command.actionKey && command.attackKey && command.actionKey !== command.attackKey) {
    return rejection(state, tool, "conflicting_action_keys", "Choose actionKey or the legacy attackKey alias, not two different actions.");
  }
  const selectedActionKey = command.actionKey ?? command.attackKey;
  const executablePrograms = enemyView.effectPrograms.filter((program) =>
    program.executionMode === "multiattack"
    || program.executionMode === "saving-throw-damage"
    || program.executionMode === "saving-throw-condition"
  );
  if (!selectedActionKey) {
    const choices = new Set([
      ...enemyView.attacks.map((candidate) => candidate.actionKey),
      ...executablePrograms.flatMap((program) => program.sourceActionKey ? [program.sourceActionKey] : []),
    ]);
    if (choices.size > 1) {
      return rejection(
        state,
        tool,
        "enemy_action_required",
        `Choose ${enemyView.name}'s actionKey: ${[...choices].sort().join(", ")}.`
      );
    }
    const onlyProgram = executablePrograms[0];
    if (choices.size === 1 && onlyProgram && onlyProgram.sourceActionKey && choices.has(onlyProgram.sourceActionKey)) {
      return resolveCompiledCreatureProgram(state, context, clientCommandId, command, tool, enemy, enemyView, onlyProgram);
    }
  }
  const selectedProgram = selectedActionKey
    ? enemyView.effectPrograms.find((candidate) =>
        candidate.sourceActionKey === selectedActionKey || candidate.contentKey === selectedActionKey
      )
    : undefined;
  if (selectedProgram) {
    if (selectedProgram.executionMode === "fragments") {
      return rejection(
        state,
        tool,
        "content_tier_insufficient",
        `${enemyView.name}'s ${selectedProgram.sourceName} has typed S7 fragments, but its complete prose is not executable.`
      );
    }
    return resolveCompiledCreatureProgram(
      state,
      context,
      clientCommandId,
      command,
      tool,
      enemy,
      enemyView,
      selectedProgram
    );
  }

  let attack = selectedActionKey
    ? enemyView.attacks.find((candidate) =>
        candidate.actionKey === selectedActionKey || candidate.contentKey === selectedActionKey
      )
    : undefined;
  if (selectedActionKey && !attack) {
    const deferred = enemyView.actions.find((candidate) =>
      candidate.actionKey === selectedActionKey || candidate.name.toLowerCase() === selectedActionKey.toLowerCase()
    );
    if (deferred) {
      return rejection(
        state,
        tool,
        "content_tier_insufficient",
        `${enemyView.name}'s ${deferred.name} is preserved as source prose but is not executable in S3.`
      );
    }
    return rejection(state, tool, "unknown_creature_action", `${enemyView.name} has no action ${selectedActionKey}.`);
  }
  if (!attack) {
    if (enemyView.attacks.length === 0) {
      return rejection(
        state,
        tool,
        "content_tier_insufficient",
        `${enemyView.name} has no exact S3 basic attack. Its source actions are display-only until a later reviewed compiler supports them.`
      );
    }
    if (enemyView.attacks.length > 1) {
      return rejection(
        state,
        tool,
        "enemy_action_required",
        `Choose ${enemyView.name}'s attackKey: ${enemyView.attacks.map((candidate) => candidate.actionKey).join(", ")}.`
      );
    }
    attack = enemyView.attacks[0];
  }
  if (!attack) return rejection(state, tool, "content_tier_insufficient", "No executable attack was selected.");

  const next = cloneCampaign(state);
  const attackRoll = randomInt(1, 21);
  const attackModifier = attack.toHit;
  const dodging = state.character.conditions.includes("dodging");
  const secondRoll = dodging ? randomInt(1, 21) : null;
  const effectiveRoll = secondRoll === null ? attackRoll : Math.min(attackRoll, secondRoll);
  const total = effectiveRoll + attackModifier;
  const critical = effectiveRoll === 20;
  const hit = effectiveRoll !== 1 && (critical || total >= next.character.ac);
  const rolls: Array<{ kind: string; value: number; sides?: number }> = [{ kind: "enemy_attack_d20", value: effectiveRoll, sides: 20 }];
  if (secondRoll !== null) rolls.push({ kind: "enemy_attack_disadvantage_d20", value: secondRoll, sides: 20 });
  const modifiers = [{ name: "enemy_attack_bonus", value: attackModifier }, { name: "armor_class", value: next.character.ac }];
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  let message = enemyView.name + " uses " + attack.name + ".";
  let outcome = "enemy_miss";

  if (hit) {
    const diceCount = attack.damage.diceCount * (critical ? 2 : 1);
    const damageDice = Array.from(
      { length: diceCount },
      () => randomInt(1, attack.damage.dieSides + 1)
    );
    const damage = Math.max(0, damageDice.reduce((sum, value) => sum + value, 0) + attack.damage.bonus);
    const beforeHp = next.character.hp;
    next.character.hp = Math.max(0, next.character.hp - damage);
    changes.push({ path: "/character/hp", before: beforeHp, after: next.character.hp });
    for (const die of damageDice) {
      rolls.push({ kind: "enemy_damage", value: die, sides: attack.damage.dieSides });
    }
    modifiers.push({ name: "damage_bonus", value: attack.damage.bonus });
    message = enemyView.name + " " + (critical ? "critically " : "") + "hits with " + attack.name + " for " + damage + " " + attack.damage.typeName.toLowerCase() + " damage.";
    outcome = "enemy_hit";
    if (next.character.hp === 0) {
      if (next.character.spellcasting?.concentration) {
        const beforeConcentration = next.character.spellcasting.concentration;
        next.character.spellcasting.concentration = null;
        changes.push({ path: "/character/spellcasting/concentration", before: beforeConcentration, after: null });
        message += " Concentration ends.";
      }
      next.character.conditions = addCondition(next.character.conditions, "unconscious");
      message += " You fall unconscious.";
      outcome = "downed";
    } else if (damage > 0 && next.character.spellcasting?.concentration) {
      const concentrationDc = Math.max(10, Math.floor(damage / 2));
      const concentrationRoll = randomInt(1, 21);
      const concentrationModifier = next.character.savingThrows.con;
      const concentrationTotal = concentrationRoll + concentrationModifier;
      const concentrationHeld = concentrationTotal >= concentrationDc;
      rolls.push({ kind: "concentration_save_d20", value: concentrationRoll, sides: 20 });
      modifiers.push({ name: "concentration_save_bonus", value: concentrationModifier }, { name: "concentration_dc", value: concentrationDc });
      message += ` Concentration save ${concentrationTotal} against DC ${concentrationDc}: ${concentrationHeld ? "held" : "lost"}.`;
      if (!concentrationHeld) {
        const beforeConcentration = next.character.spellcasting.concentration;
        next.character.spellcasting.concentration = null;
        changes.push({ path: "/character/spellcasting/concentration", before: beforeConcentration, after: null });
      }
    }
  } else {
    message = enemyView.name + " misses with " + attack.name + ".";
  }

  const nextEnemyId = nextLiveCombatantId(next.combat, enemy.id);
  if (nextEnemyId) {
    next.combat.activeActorId = nextEnemyId;
    message += " The next foe acts.";
  } else {
    next.combat.round += 1;
    next.combat.activeActorId = next.actorId;
    next.combat.actionUsed = next.character.hp === 0;
    next.combat.bonusActionUsed = false;
    next.combat.reactionUsed = false;
    next.character.conditions = removeCondition(next.character.conditions, "dodging");
    message += next.character.hp === 0
      ? " Your turn arrives; make a death save."
      : " The initiative returns to you.";
  }

  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    { combat: combatData(next.combat), character: characterData(next.character) },
    outcome,
    rolls,
    modifiers,
    changes
  );
}

function resolveSkippedCharacterTurn(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "advance_turn" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const next = cloneCampaign(state);
  const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
  const modifiers: Array<{ name: string; value: number }> = [];
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  resolveTargetEndConditionEffects(next, rolls, modifiers, changes);
  const beforeActor = next.combat.activeActorId;
  next.combat.activeActorId = firstLiveCombatantId(next.combat);
  next.combat.actionUsed = true;
  changes.push(
    { path: "/combat/activeActorId", before: beforeActor, after: next.combat.activeActorId },
    { path: "/combat/actionUsed", before: state.combat.actionUsed, after: true }
  );
  const condition = state.character.conditions.find((candidate) =>
    candidate === "incapacitated"
    || candidate === "paralyzed"
    || candidate === "petrified"
    || candidate === "stunned"
  ) ?? "incapacitated";
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    `${next.character.name || "The character"} is ${condition}; the turn passes to the opposition.`,
    { skipped: true, condition, combat: combatData(next.combat), character: characterData(next.character) },
    "turn_skipped_by_condition",
    rolls,
    modifiers,
    changes,
    next.character.conditionEffects.map((effect) => effect.conditionContentKey)
  );
}

function resolveCompiledCreatureProgram(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "advance_turn" }>,
  tool: EngineToolName | "declare" | "listen",
  enemy: EngineCombatant,
  enemyView: EngineCombatantView,
  program: CompiledEffectProgram
): EngineResolution {
  if (
    program.sourceType !== "creature-action"
    || program.sourceContentKey !== enemy.contentKey
    || !program.sourceActionKey
  ) {
    return rejection(state, tool, "effect_program_mismatch", "The selected effect program does not belong to the active combatant.");
  }
  if (program.hasDeferredProse || program.executionMode === "fragments") {
    return rejection(
      state,
      tool,
      "content_tier_insufficient",
      `${enemyView.name}'s ${program.sourceName} is not completely executable from the pinned source prose.`
    );
  }
  if (program.executionMode === "multiattack") {
    return resolveCompiledMultiattack(state, context, clientCommandId, command, tool, enemy, enemyView, program);
  }
  if (program.executionMode === "saving-throw-damage") {
    return resolveCompiledSaveDamage(state, context, clientCommandId, command, tool, enemy, enemyView, program);
  }
  if (program.executionMode === "saving-throw-condition") {
    return resolveCompiledSaveCondition(state, context, clientCommandId, command, tool, enemy, enemyView, program);
  }
  return rejection(state, tool, "content_tier_insufficient", "That compiled program is not a creature-turn execution mode.");
}

function resolveCompiledMultiattack(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "advance_turn" }>,
  tool: EngineToolName | "declare" | "listen",
  enemy: EngineCombatant,
  enemyView: EngineCombatantView,
  program: CompiledEffectProgram
): EngineResolution {
  const sequence = program.operations.find((operation) => operation.kind === "attack-sequence");
  if (!sequence || program.operations.filter((operation) => operation.kind === "attack-sequence").length !== 1) {
    return rejection(state, tool, "invalid_effect_program", "The compiled multiattack has no unique attack sequence.");
  }
  const attackByContentKey = new Map(enemyView.attacks.map((attack) => [attack.contentKey, attack]));
  const attacks = sequence.steps.flatMap((step) => {
    const attack = attackByContentKey.get(step.attackContentKey);
    return attack ? Array.from({ length: step.count }, () => attack) : [];
  });
  const expectedAttackCount = sequence.steps.reduce((total, step) => total + step.count, 0);
  if (attacks.length !== expectedAttackCount) {
    return rejection(state, tool, "effect_program_mismatch", "A compiled multiattack step is unavailable in the active pack.");
  }

  const next = cloneCampaign(state);
  const nextEnemy = next.combat.enemies.find((candidate) => candidate.id === enemy.id);
  if (!nextEnemy) return rejection(state, tool, "combatant_not_found", "The active combatant disappeared.");
  const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
  const modifiers: Array<{ name: string; value: number }> = [];
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  const resource = prepareCompiledActionResource(next, nextEnemy, program, rolls, changes);
  if (resource.status === "unavailable") {
    return rejection(state, tool, resource.code, resource.message);
  }
  if (resource.status === "recharge-failed") {
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      `${enemyView.name}'s ${program.sourceName} does not recharge. The creature still has its turn and must choose another action.`,
      { combatantId: enemy.id, actionKey: program.sourceActionKey, rechargeRoll: resource.roll },
      "recharge_failed",
      rolls,
      modifiers,
      changes,
      [enemy.contentKey, program.contentKey]
    );
  }
  consumeCompiledActionResource(nextEnemy, program, changes);

  const attackMessages: string[] = [];
  let hitCount = 0;
  for (let index = 0; index < attacks.length && next.character.hp > 0; index += 1) {
    const attack = attacks[index];
    if (!attack) continue;
    const result = resolveOneCreatureAttack(next, attack, index + 1, rolls, modifiers, changes);
    attackMessages.push(result.message);
    if (result.hit) hitCount += 1;
  }
  next.combat.lastAction = program.sourceActionKey;
  const turnSuffix = finishCreatureTurn(next, enemy.id, changes);
  const message = `${enemyView.name} uses ${program.sourceName}. ${attackMessages.join(" ")}${turnSuffix}`;
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    {
      combatantId: enemy.id,
      actionKey: program.sourceActionKey,
      programKey: program.contentKey,
      attacksResolved: attackMessages.length,
      hits: hitCount,
      combat: combatData(next.combat),
      character: characterData(next.character),
    },
    next.character.hp === 0 ? "downed" : hitCount > 0 ? "enemy_multiattack_hit" : "enemy_multiattack_miss",
    rolls,
    modifiers,
    changes,
    [enemy.contentKey, program.contentKey, ...sequence.steps.map((step) => step.attackContentKey)]
  );
}

function resolveCompiledSaveDamage(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "advance_turn" }>,
  tool: EngineToolName | "declare" | "listen",
  enemy: EngineCombatant,
  enemyView: EngineCombatantView,
  program: CompiledEffectProgram
): EngineResolution {
  const save = program.operations.find((operation) => operation.kind === "saving-throw");
  const damage = program.operations.find((operation) => operation.kind === "damage");
  if (!save || !damage) {
    return rejection(state, tool, "invalid_effect_program", "The save-damage program is incomplete.");
  }
  const next = cloneCampaign(state);
  const nextEnemy = next.combat.enemies.find((candidate) => candidate.id === enemy.id);
  if (!nextEnemy) return rejection(state, tool, "combatant_not_found", "The active combatant disappeared.");
  const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
  const modifiers: Array<{ name: string; value: number }> = [];
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  const resource = prepareCompiledActionResource(next, nextEnemy, program, rolls, changes);
  if (resource.status === "unavailable") return rejection(state, tool, resource.code, resource.message);
  if (resource.status === "recharge-failed") {
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      `${enemyView.name}'s ${program.sourceName} does not recharge. The creature still has its turn and must choose another action.`,
      { combatantId: enemy.id, actionKey: program.sourceActionKey, rechargeRoll: resource.roll },
      "recharge_failed",
      rolls,
      modifiers,
      changes,
      [enemy.contentKey, program.contentKey]
    );
  }
  consumeCompiledActionResource(nextEnemy, program, changes);

  const savingRoll = randomInt(1, 21);
  const savingModifier = next.character.savingThrows[save.ability];
  const savingTotal = savingRoll + savingModifier;
  const succeeded = savingTotal >= save.dc;
  rolls.push({ kind: `character_${save.ability}_save_d20`, value: savingRoll, sides: 20 });
  modifiers.push(
    { name: `${save.ability}_saving_throw`, value: savingModifier },
    { name: "effect_save_dc", value: save.dc }
  );
  const rolledDamage = rollCompiledDamage(damage, rolls);
  const appliedDamage = succeeded
    ? damage.saveOnSuccess === "half" ? Math.floor(rolledDamage / 2) : 0
    : rolledDamage;
  const beforeHp = next.character.hp;
  next.character.hp = Math.max(0, next.character.hp - appliedDamage);
  if (next.character.hp !== beforeHp) {
    changes.push({ path: "/character/hp", before: beforeHp, after: next.character.hp });
  }
  applyConcentrationAndDownedState(next, appliedDamage, rolls, modifiers, changes);
  next.combat.lastAction = program.sourceActionKey;
  const turnSuffix = finishCreatureTurn(next, enemy.id, changes);
  const area = program.operations.find((operation) => operation.kind === "area");
  const saveText = `${savingTotal} against DC ${save.dc}`;
  const message = `${enemyView.name} uses ${program.sourceName}${area ? ` in a ${area.size}-foot ${area.shape}` : ""}. `
    + `${next.character.name || "The character"} rolls ${saveText} and ${succeeded ? "succeeds" : "fails"}, taking ${appliedDamage} ${damage.damageType.name.toLocaleLowerCase("en-US")} damage.${turnSuffix}`;
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    {
      combatantId: enemy.id,
      actionKey: program.sourceActionKey,
      programKey: program.contentKey,
      save: { ability: save.ability, dc: save.dc, roll: savingRoll, modifier: savingModifier, total: savingTotal, succeeded },
      damage: { rolled: rolledDamage, applied: appliedDamage, type: damage.damageType },
      area: area ?? null,
      combat: combatData(next.combat),
      character: characterData(next.character),
    },
    next.character.hp === 0 ? "downed" : succeeded ? "saving_throw_success" : "saving_throw_failure",
    rolls,
    modifiers,
    changes,
    [enemy.contentKey, program.contentKey, damage.damageType.contentKey]
  );
}

function resolveCompiledSaveCondition(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "advance_turn" }>,
  tool: EngineToolName | "declare" | "listen",
  enemy: EngineCombatant,
  enemyView: EngineCombatantView,
  program: CompiledEffectProgram
): EngineResolution {
  const save = program.operations.find((operation) => operation.kind === "saving-throw");
  const condition = program.operations.find((operation) => operation.kind === "apply-condition");
  if (!save || !condition) {
    return rejection(state, tool, "invalid_effect_program", "The save-condition program is incomplete.");
  }
  const next = cloneCampaign(state);
  const nextEnemy = next.combat.enemies.find((candidate) => candidate.id === enemy.id);
  if (!nextEnemy) return rejection(state, tool, "combatant_not_found", "The active combatant disappeared.");
  const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
  const modifiers: Array<{ name: string; value: number }> = [];
  const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
  const resource = prepareCompiledActionResource(next, nextEnemy, program, rolls, changes);
  if (resource.status === "unavailable") return rejection(state, tool, resource.code, resource.message);
  if (resource.status === "recharge-failed") {
    return commit(
      next,
      context,
      clientCommandId,
      command,
      tool,
      `${enemyView.name}'s ${program.sourceName} does not recharge. The creature still has its turn and must choose another action.`,
      { combatantId: enemy.id, actionKey: program.sourceActionKey, rechargeRoll: resource.roll },
      "recharge_failed",
      rolls,
      modifiers,
      changes,
      [enemy.contentKey, program.contentKey]
    );
  }
  consumeCompiledActionResource(nextEnemy, program, changes);

  const savingRoll = randomInt(1, 21);
  const savingModifier = next.character.savingThrows[save.ability];
  const savingTotal = savingRoll + savingModifier;
  const succeeded = savingTotal >= save.dc;
  rolls.push({ kind: `character_${save.ability}_save_d20`, value: savingRoll, sides: 20 });
  modifiers.push(
    { name: `${save.ability}_saving_throw`, value: savingModifier },
    { name: "effect_save_dc", value: save.dc }
  );
  if (!succeeded) {
    const beforeConditions = [...next.character.conditions];
    const beforeEffects = [...next.character.conditionEffects];
    const conditionName = condition.condition.name.toLocaleLowerCase("en-US");
    next.character.conditions = addCondition(next.character.conditions, conditionName);
    next.character.conditionEffects = next.character.conditionEffects.filter((effect) =>
      effect.conditionContentKey !== condition.condition.contentKey || effect.sourceCombatantId !== enemy.id
    );
    next.character.conditionEffects.push({
      id: randomUUID(),
      conditionContentKey: condition.condition.contentKey,
      packHash: enemy.packHash,
      name: condition.condition.name,
      sourceContentKey: enemy.contentKey,
      sourceCombatantId: enemy.id,
      appliedRound: next.combat.round,
      duration: condition.duration,
      repeatSave: condition.repeatSave,
    });
    changes.push(
      { path: "/character/conditions", before: beforeConditions, after: next.character.conditions },
      { path: "/character/conditionEffects", before: beforeEffects, after: next.character.conditionEffects }
    );
  }
  next.combat.lastAction = program.sourceActionKey;
  const turnSuffix = finishCreatureTurn(next, enemy.id, changes);
  const message = `${enemyView.name} uses ${program.sourceName}. ${next.character.name || "The character"} rolls ${savingTotal} against DC ${save.dc} and `
    + `${succeeded ? "resists the effect" : `becomes ${condition.condition.name.toLocaleLowerCase("en-US")}`}.${turnSuffix}`;
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    {
      combatantId: enemy.id,
      actionKey: program.sourceActionKey,
      programKey: program.contentKey,
      save: { ability: save.ability, dc: save.dc, roll: savingRoll, modifier: savingModifier, total: savingTotal, succeeded },
      condition: succeeded ? null : condition,
      combat: combatData(next.combat),
      character: characterData(next.character),
    },
    succeeded ? "saving_throw_success" : "condition_applied",
    rolls,
    modifiers,
    changes,
    [enemy.contentKey, program.contentKey, condition.condition.contentKey]
  );
}

function prepareCompiledActionResource(
  state: LanternCampaignState,
  enemy: EngineCombatant,
  program: CompiledEffectProgram,
  rolls: Array<{ kind: string; value: number; sides?: number }>,
  changes: Array<{ path: string; before: unknown; after: unknown }>
):
  | { status: "ready" }
  | { status: "recharge-failed"; roll: number }
  | { status: "unavailable"; code: string; message: string } {
  if (!program.usage || !program.sourceActionKey) return { status: "ready" };
  let resource = enemy.actionResources[program.sourceActionKey];
  if (!resource) {
    resource = program.usage.kind === "per-day"
      ? {
          kind: "per-day",
          usesRemaining: program.usage.uses,
          available: program.usage.uses > 0,
          rechargeMinimum: null,
          lastRechargeRound: null,
        }
      : {
          kind: "recharge",
          usesRemaining: null,
          available: true,
          rechargeMinimum: program.usage.minimumRoll,
          lastRechargeRound: null,
        };
    enemy.actionResources[program.sourceActionKey] = resource;
    changes.push({
      path: `/combat/enemies/${enemy.id}/actionResources/${program.sourceActionKey}`,
      before: null,
      after: { ...resource },
    });
  }
  if (resource.kind === "per-day") {
    if ((resource.usesRemaining ?? 0) <= 0) {
      return { status: "unavailable", code: "usage_limit_exhausted", message: `${program.sourceName} has no uses remaining.` };
    }
    return { status: "ready" };
  }
  if (resource.available) return { status: "ready" };
  if (resource.lastRechargeRound === state.combat.round) {
    return {
      status: "unavailable",
      code: "action_not_recharged",
      message: `${program.sourceName} did not recharge this round. Choose another action.`,
    };
  }
  const before = { ...resource };
  const roll = randomInt(1, 7);
  resource.lastRechargeRound = state.combat.round;
  rolls.push({ kind: "recharge_d6", value: roll, sides: 6 });
  if (roll >= (resource.rechargeMinimum ?? 6)) resource.available = true;
  changes.push({
    path: `/combat/enemies/${enemy.id}/actionResources/${program.sourceActionKey}`,
    before,
    after: { ...resource },
  });
  return resource.available ? { status: "ready" } : { status: "recharge-failed", roll };
}

function consumeCompiledActionResource(
  enemy: EngineCombatant,
  program: CompiledEffectProgram,
  changes: Array<{ path: string; before: unknown; after: unknown }>
): void {
  if (!program.sourceActionKey) return;
  const resource = enemy.actionResources[program.sourceActionKey];
  if (!resource) return;
  const before = { ...resource };
  if (resource.kind === "per-day") {
    resource.usesRemaining = Math.max(0, (resource.usesRemaining ?? 0) - 1);
    resource.available = (resource.usesRemaining ?? 0) > 0;
  } else {
    resource.available = false;
  }
  changes.push({
    path: `/combat/enemies/${enemy.id}/actionResources/${program.sourceActionKey}`,
    before,
    after: { ...resource },
  });
}

function resolveOneCreatureAttack(
  state: LanternCampaignState,
  attack: CompiledCreatureAttack,
  sequenceNumber: number,
  rolls: Array<{ kind: string; value: number; sides?: number }>,
  modifiers: Array<{ name: string; value: number }>,
  changes: Array<{ path: string; before: unknown; after: unknown }>
): { hit: boolean; message: string } {
  const attackRoll = randomInt(1, 21);
  const dodging = state.character.conditions.includes("dodging");
  const secondRoll = dodging ? randomInt(1, 21) : null;
  const effectiveRoll = secondRoll === null ? attackRoll : Math.min(attackRoll, secondRoll);
  const total = effectiveRoll + attack.toHit;
  const critical = effectiveRoll === 20;
  const hit = effectiveRoll !== 1 && (critical || total >= state.character.ac);
  rolls.push({ kind: `enemy_attack_${sequenceNumber}_d20`, value: attackRoll, sides: 20 });
  if (secondRoll !== null) rolls.push({ kind: `enemy_attack_${sequenceNumber}_disadvantage_d20`, value: secondRoll, sides: 20 });
  modifiers.push(
    { name: `enemy_attack_${sequenceNumber}_bonus`, value: attack.toHit },
    { name: `enemy_attack_${sequenceNumber}_armor_class`, value: state.character.ac }
  );
  if (!hit) return { hit: false, message: `${attack.name} misses.` };

  const diceCount = attack.damage.diceCount * (critical ? 2 : 1);
  let damage = attack.damage.bonus;
  for (let index = 0; index < diceCount; index += 1) {
    const die = randomInt(1, attack.damage.dieSides + 1);
    damage += die;
    rolls.push({ kind: `enemy_damage_${sequenceNumber}`, value: die, sides: attack.damage.dieSides });
  }
  damage = Math.max(0, damage);
  modifiers.push({ name: `enemy_damage_${sequenceNumber}_bonus`, value: attack.damage.bonus });
  const beforeHp = state.character.hp;
  state.character.hp = Math.max(0, state.character.hp - damage);
  changes.push({ path: "/character/hp", before: beforeHp, after: state.character.hp });
  applyConcentrationAndDownedState(state, damage, rolls, modifiers, changes);
  return {
    hit: true,
    message: `${attack.name} ${critical ? "critically " : ""}hits for ${damage} ${attack.damage.typeName.toLocaleLowerCase("en-US")} damage.`,
  };
}

function rollCompiledDamage(
  damage: Extract<CompiledEffectProgram["operations"][number], { kind: "damage" }>,
  rolls: Array<{ kind: string; value: number; sides?: number }>
): number {
  if (damage.expression.kind === "flat") return damage.expression.amount;
  let total = damage.expression.bonus;
  for (let index = 0; index < damage.expression.diceCount; index += 1) {
    const die = randomInt(1, damage.expression.dieSides + 1);
    total += die;
    rolls.push({ kind: "enemy_effect_damage", value: die, sides: damage.expression.dieSides });
  }
  return Math.max(0, total);
}

function applyConcentrationAndDownedState(
  state: LanternCampaignState,
  damage: number,
  rolls: Array<{ kind: string; value: number; sides?: number }>,
  modifiers: Array<{ name: string; value: number }>,
  changes: Array<{ path: string; before: unknown; after: unknown }>
): void {
  if (state.character.hp === 0) {
    if (state.character.spellcasting?.concentration) {
      const before = state.character.spellcasting.concentration;
      state.character.spellcasting.concentration = null;
      changes.push({ path: "/character/spellcasting/concentration", before, after: null });
    }
    const beforeConditions = [...state.character.conditions];
    state.character.conditions = addCondition(state.character.conditions, "unconscious");
    if (beforeConditions.length !== state.character.conditions.length) {
      changes.push({ path: "/character/conditions", before: beforeConditions, after: state.character.conditions });
    }
    return;
  }
  if (damage <= 0 || !state.character.spellcasting?.concentration) return;
  const dc = Math.max(10, Math.floor(damage / 2));
  const roll = randomInt(1, 21);
  const modifier = state.character.savingThrows.con;
  const held = roll + modifier >= dc;
  rolls.push({ kind: "concentration_save_d20", value: roll, sides: 20 });
  modifiers.push({ name: "concentration_save_bonus", value: modifier }, { name: "concentration_dc", value: dc });
  if (!held) {
    const before = state.character.spellcasting.concentration;
    state.character.spellcasting.concentration = null;
    changes.push({ path: "/character/spellcasting/concentration", before, after: null });
  }
}

function finishCreatureTurn(
  state: LanternCampaignState,
  enemyId: string,
  changes: Array<{ path: string; before: unknown; after: unknown }>
): string {
  expireSourceEndConditionEffects(state, enemyId, changes);
  const beforeActorId = state.combat.activeActorId;
  const beforeRound = state.combat.round;
  const nextEnemyId = nextLiveCombatantId(state.combat, enemyId);
  if (nextEnemyId) {
    state.combat.activeActorId = nextEnemyId;
    changes.push({ path: "/combat/activeActorId", before: beforeActorId, after: nextEnemyId });
    return " The next foe acts.";
  }
  state.combat.round += 1;
  state.combat.activeActorId = state.actorId;
  state.combat.actionUsed = state.character.hp === 0;
  state.combat.bonusActionUsed = false;
  state.combat.reactionUsed = false;
  const beforeConditions = [...state.character.conditions];
  state.character.conditions = removeCondition(state.character.conditions, "dodging");
  expireAtCharacterTurnStart(state, changes);
  changes.push(
    { path: "/combat/round", before: beforeRound, after: state.combat.round },
    { path: "/combat/activeActorId", before: beforeActorId, after: state.actorId }
  );
  if (beforeConditions.length !== state.character.conditions.length) {
    changes.push({ path: "/character/conditions", before: beforeConditions, after: state.character.conditions });
  }
  return state.character.hp === 0
    ? " Your turn arrives; make a death save."
    : " The initiative returns to you.";
}

function resolveTargetEndConditionEffects(
  state: LanternCampaignState,
  rolls: Array<{ kind: string; value: number; sides?: number }>,
  modifiers: Array<{ name: string; value: number }>,
  changes: Array<{ path: string; before: unknown; after: unknown }>
): void {
  const removeIds = new Set<string>();
  for (const effect of state.character.conditionEffects) {
    if (
      effect.duration.kind === "turn-boundary"
      && effect.duration.subject === "target"
      && effect.duration.boundary === "end"
    ) {
      removeIds.add(effect.id);
    }
    if (effect.repeatSave?.timing !== "end-of-turn") continue;
    const roll = randomInt(1, 21);
    const modifier = state.character.savingThrows[effect.repeatSave.ability];
    const total = roll + modifier;
    rolls.push({ kind: `condition_${effect.repeatSave.ability}_repeat_save_d20`, value: roll, sides: 20 });
    modifiers.push(
      { name: `condition_${effect.repeatSave.ability}_repeat_save`, value: modifier },
      { name: "condition_repeat_save_dc", value: effect.repeatSave.dc }
    );
    if (total >= effect.repeatSave.dc) removeIds.add(effect.id);
  }
  removeAppliedConditions(state, removeIds, changes);
}

function expireSourceEndConditionEffects(
  state: LanternCampaignState,
  sourceCombatantId: string,
  changes: Array<{ path: string; before: unknown; after: unknown }>
): void {
  const removeIds = new Set(
    state.character.conditionEffects
      .filter((effect) =>
        effect.sourceCombatantId === sourceCombatantId
        && effect.duration.kind === "turn-boundary"
        && effect.duration.subject === "source"
        && effect.duration.boundary === "end"
        && state.combat.round >= effect.appliedRound + effect.duration.offsetTurns
      )
      .map((effect) => effect.id)
  );
  removeAppliedConditions(state, removeIds, changes);
}

function expireAtCharacterTurnStart(
  state: LanternCampaignState,
  changes: Array<{ path: string; before: unknown; after: unknown }>
): void {
  const liveSourceIds = new Set(state.combat.enemies.filter((enemy) => enemy.alive).map((enemy) => enemy.id));
  const removeIds = new Set(
    state.character.conditionEffects
      .filter((effect) => {
        if (effect.duration.kind === "source-lifetime") return !liveSourceIds.has(effect.sourceCombatantId);
        if (
          effect.duration.kind === "turn-boundary"
          && effect.duration.subject === "target"
          && effect.duration.boundary === "start"
        ) return true;
        if (effect.duration.kind !== "fixed") return false;
        const durationRounds = effect.duration.unit === "round"
          ? effect.duration.amount
          : effect.duration.unit === "minute"
            ? effect.duration.amount * 10
            : effect.duration.unit === "hour"
              ? effect.duration.amount * 600
              : effect.duration.amount * 14_400;
        return state.combat.round >= effect.appliedRound + durationRounds;
      })
      .map((effect) => effect.id)
  );
  removeAppliedConditions(state, removeIds, changes);
}

function removeAppliedConditions(
  state: LanternCampaignState,
  removeIds: ReadonlySet<string>,
  changes: Array<{ path: string; before: unknown; after: unknown }>
): void {
  if (removeIds.size === 0) return;
  const beforeEffects = [...state.character.conditionEffects];
  const removed = beforeEffects.filter((effect) => removeIds.has(effect.id));
  state.character.conditionEffects = beforeEffects.filter((effect) => !removeIds.has(effect.id));
  const beforeConditions = [...state.character.conditions];
  for (const effect of removed) {
    const conditionName = effect.name.toLocaleLowerCase("en-US");
    if (!state.character.conditionEffects.some((candidate) =>
      candidate.name.toLocaleLowerCase("en-US") === conditionName
    )) {
      state.character.conditions = removeCondition(state.character.conditions, conditionName);
    }
  }
  changes.push({ path: "/character/conditionEffects", before: beforeEffects, after: state.character.conditionEffects });
  if (JSON.stringify(beforeConditions) !== JSON.stringify(state.character.conditions)) {
    changes.push({ path: "/character/conditions", before: beforeConditions, after: state.character.conditions });
  }
}

function resolveDeathSave(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "death_save" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (!state.character.conditions.includes("unconscious")) {
    return rejection(state, tool, "not_unconscious", "Death saves are only made when your character is unconscious at 0 HP.");
  }
  const roll = randomInt(1, 21);
  const success = roll >= 10;
  const next = cloneCampaign(state);
  if (success) next.character.deathSaveSuccesses += 1;
  else next.character.deathSaveFailures += 1;
  let outcome = success ? "death_save_success" : "death_save_failure";
  let message = "Death save: d20 " + roll + ". " + (success ? "A success." : "A failure.");
  if (next.character.deathSaveSuccesses >= 3) {
    next.character.conditions = removeCondition(next.character.conditions, "unconscious");
    next.character.conditions = addCondition(next.character.conditions, "stable");
    next.combat.activeActorId = firstLiveCombatantId(next.combat);
    next.combat.actionUsed = true;
    message += " You stabilize.";
    outcome = "stable";
  } else if (next.character.deathSaveFailures >= 3) {
    next.character.conditions = removeCondition(next.character.conditions, "unconscious");
    next.character.conditions = addCondition(next.character.conditions, "dead");
    next.combat.status = "ended";
    next.combat.activeActorId = null;
    message += " The character dies.";
    outcome = "dead";
  } else {
    next.combat.activeActorId = firstLiveCombatantId(next.combat);
    next.combat.actionUsed = true;
  }

  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    {
      roll,
      success,
      successes: next.character.deathSaveSuccesses,
      failures: next.character.deathSaveFailures,
      character: characterData(next.character),
    },
    outcome,
    [{ kind: "death_save_d20", value: roll, sides: 20 }],
    [],
    [{ path: "/character/deathSaveSuccesses", before: state.character.deathSaveSuccesses, after: next.character.deathSaveSuccesses }]
  );
}

function resolveLoot(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "loot" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.combat.status !== "ended") return rejection(state, tool, "encounter_active", "There is no defeated encounter to loot.");
  if (state.combat.lootClaimed) return rejection(state, tool, "loot_claimed", "The encounter area has already been searched.");
  const quest = command.questId ? state.quests.find((candidate) => candidate.id === command.questId) : null;
  if (command.questId && !quest) return rejection(state, tool, "quest_not_found", "That quest is not in the campaign journal.");
  const questReward = quest && !quest.rewardClaimed ? quest.reward : { xp: 0, copper: 0 };
  const rewardItems = command.items.map((item) => normalizeInventoryItem({ ...item, equipped: false }));
  const totalCopper = command.rewardCopper + questReward.copper;
  const totalXp = command.rewardXp + questReward.xp;
  const next = cloneCampaign(state);
  for (const item of rewardItems) addInventory(next.character.inventory, item);
  next.character.currency.copper += totalCopper;
  syncCurrencyProjection(next.character);
  next.character.xp += totalXp;
  next.combat.lootClaimed = true;
  if (quest) {
    const nextQuest = next.quests.find((candidate) => candidate.id === quest.id);
    if (nextQuest) {
      nextQuest.status = "completed";
      nextQuest.progress = 100;
      nextQuest.rewardClaimed = true;
      if (next.quest.id === nextQuest.id) next.quest = nextQuest;
    }
  }
  const itemText = rewardItems.length
    ? " You recover " + rewardItems.map((item) => {
        const view = materializeInventoryItem(item);
        return item.quantity + " × " + view.name;
      }).join(", ") + "."
    : " No item reward was authored.";
  const moneyText = totalCopper || totalXp ? " The reward is " + formatCurrency(totalCopper) + " and " + totalXp + " XP." : " No currency or XP reward was authored.";
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "You search the defeated encounter." + itemText + moneyText,
    {
      items: materializeInventory(rewardItems),
      reward: { xp: totalXp, copper: totalCopper },
      quest: quest ? next.quests.find((candidate) => candidate.id === quest.id) : null,
      inventory: materializeInventory(next.character.inventory),
      currency: next.character.currency,
      currencyBreakdown: currencyBreakdown(next.character.currency.copper),
      xp: next.character.xp,
    },
    quest ? "quest_completed" : "loot_claimed",
    [],
    [],
    [
      { path: "/character/inventory", before: state.character.inventory, after: next.character.inventory },
      { path: "/character/currency", before: state.character.currency, after: next.character.currency },
      { path: "/character/xp", before: state.character.xp, after: next.character.xp },
      { path: "/combat/lootClaimed", before: state.combat.lootClaimed, after: next.combat.lootClaimed },
      ...(quest ? [{ path: "/quests/" + quest.id, before: quest, after: next.quests.find((candidate) => candidate.id === quest.id) }] : []),
    ]
  );
}

function resolveRest(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "rest" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.combat.status === "active") return rejection(state, tool, "combat_active", "You cannot rest during an active encounter.");
  if (state.character.conditions.includes("dead")) return rejection(state, tool, "dead", "A dead character cannot rest.");
  const next = cloneCampaign(state);
  const beforeHp = next.character.hp;
  const beforeHitDice = next.character.hitDiceRemaining;
  const beforeSlots = next.character.spellcasting ? { ...next.character.spellcasting.slots } : null;
  const beforeConcentration = next.character.spellcasting?.concentration ?? null;
  let message = "You complete a long rest. Your wounds close and your resources recover.";
  let outcome = "long_rest";
  const rolls: Array<{ kind: string; value: number; sides?: number }> = [];
  if (command.restType === "short") {
    const pactRecovery = next.character.spellcasting?.slotRecovery === "short-or-long-rest"
      && Object.entries(next.character.spellcasting.slotMaximums)
        .some(([slotLevel, maximum]) => (next.character.spellcasting?.slots[slotLevel] ?? 0) < maximum);
    if (next.character.hitDiceRemaining <= 0 && !pactRecovery) {
      return rejection(state, tool, "no_short_rest_resources", "You have no hit dice or short-rest spell slots to recover.");
    }
    if (next.character.hitDiceRemaining > 0) {
      const die = randomInt(1, next.character.hitDie + 1);
      const healing = Math.max(0, die + open5eAbilityModifier(next.character.abilities.con));
      next.character.hp = Math.min(next.character.maxHp, next.character.hp + healing);
      next.character.hitDiceRemaining -= 1;
      rolls.push({ kind: "hit_die", value: die, sides: next.character.hitDie });
    }
    if (next.character.spellcasting?.slotRecovery === "short-or-long-rest") {
      next.character.spellcasting.slots = { ...next.character.spellcasting.slotMaximums };
    }
    message = "You complete a short rest and recover " + (next.character.hp - beforeHp) + " HP"
      + (pactRecovery ? "; your pact spell slots also return." : ".");
    outcome = "short_rest";
  } else {
    next.character.hp = next.character.maxHp;
    next.character.hitDiceRemaining = Math.min(next.character.level, next.character.hitDiceRemaining + Math.max(1, Math.floor(next.character.level / 2)));
    next.character.conditions = next.character.conditions.filter((condition) => condition === "stable");
    next.character.deathSaveSuccesses = 0;
    next.character.deathSaveFailures = 0;
    if (next.character.spellcasting) {
      next.character.spellcasting.slots = { ...next.character.spellcasting.slotMaximums };
      next.character.spellcasting.concentration = null;
    }
  }
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    message,
    { restType: command.restType, hpRestored: next.character.hp - beforeHp, hitDiceRemaining: next.character.hitDiceRemaining, character: characterData(next.character) },
    outcome,
    rolls,
    [],
    [
      { path: "/character/hp", before: beforeHp, after: next.character.hp },
      { path: "/character/hitDiceRemaining", before: beforeHitDice, after: next.character.hitDiceRemaining },
      ...(beforeSlots ? [{ path: "/character/spellcasting/slots", before: beforeSlots, after: next.character.spellcasting?.slots ?? null }] : []),
      ...(beforeConcentration ? [{ path: "/character/spellcasting/concentration", before: beforeConcentration, after: next.character.spellcasting?.concentration ?? null }] : []),
    ]
  );
}

function resolveUseItem(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "use_item" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  const item = state.character.inventory.find((candidate) => candidate.id === command.itemId);
  if (!item) return rejection(state, tool, "item_not_found", "That item is not in your inventory.");
  const itemView = materializeInventoryItem(item);
  if (itemView.definitionSource === "open5e" && itemView.mechanicsTier !== 2) {
    return rejection(state, tool, "content_tier_insufficient", "That Open5e item's prose has not been compiled into a usable mechanical effect.");
  }
  if (itemView.kind !== "consumable" || !itemView.healing) return rejection(state, tool, "not_consumable", "That item cannot be used as a consumable.");
  if (state.character.hp >= state.character.maxHp) return rejection(state, tool, "already_full_health", "You are already at full health.");

  const next = cloneCampaign(state);
  const beforeHp = next.character.hp;
  next.character.hp = Math.min(next.character.maxHp, next.character.hp + itemView.healing);
  const consumed = next.character.inventory.find((candidate) => candidate.id === item.id);
  if (!consumed) return rejection(state, tool, "item_not_found", "That item is no longer in your inventory.");
  consumed.quantity -= 1;
  if (consumed.quantity <= 0) next.character.inventory = next.character.inventory.filter((candidate) => candidate.id !== item.id);
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "You drink the " + itemView.name + " and recover " + (next.character.hp - beforeHp) + " HP.",
    { itemId: item.id, healing: next.character.hp - beforeHp, character: characterData(next.character) },
    "item_used",
    [],
    [],
    [
      { path: "/character/hp", before: beforeHp, after: next.character.hp },
      { path: "/character/inventory", before: state.character.inventory, after: next.character.inventory },
    ]
  );
}

function commit(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: EngineCommand,
  tool: EngineToolName | "declare" | "listen",
  message: string,
  data: unknown,
  outcome: string,
  rolls: Array<{ kind: string; value: number; sides?: number }>,
  modifiers: Array<{ name: string; value: number }>,
  stateChanges: Array<{ path: string; before: unknown; after: unknown }>,
  evidenceContentKeys: string[] = []
): EngineResolution {
  const next = cloneCampaign(state);
  const createdAt = new Date().toISOString();
  next.version = state.version + 1;
  next.updatedAt = createdAt;
  next.log = [...state.log, makeMessage(messageKindForOutcome(outcome), message)].slice(-40);
  const event: EngineEvent = {
    id: randomUUID(),
    kind: "command",
    tool,
    command,
    accountId: context.accountId,
    campaignId: context.campaignId,
    actorId: context.actorId,
    requestId: context.requestId,
    clientCommandId,
    previousVersion: state.version,
    version: next.version,
    rulesVersion: state.rulesVersion,
    contentKeys: collectContentKeys([command, stateChanges, { contentKeys: evidenceContentKeys }]),
    rolls,
    modifiers,
    outcome,
    stateChanges,
    createdAt,
  };
  return {
    state: next,
    tool,
    readOnly: false,
    accepted: true,
    code: null,
    message,
    data,
    event,
    narration: rulesNarration(message),
  };
}

function collectContentKeys(value: unknown): string[] {
  const keys = new Set<string>();
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    if (candidate === null || typeof candidate !== "object") return;
    for (const [key, child] of Object.entries(candidate as Record<string, unknown>)) {
      if (
        typeof child === "string"
        && child.startsWith("open5e:")
        && (key === "contentKey" || key.endsWith("Key"))
      ) {
        keys.add(child);
      } else if (Array.isArray(child) && key.endsWith("Keys")) {
        for (const contentKey of child) {
          if (typeof contentKey === "string" && contentKey.startsWith("open5e:")) keys.add(contentKey);
        }
      } else visit(child);
    }
  };
  visit(value);
  return [...keys].sort();
}

function readOnlyResolution(
  state: LanternCampaignState,
  tool: EngineToolName | "declare" | "listen",
  message: string,
  data: unknown
): EngineResolution {
  return {
    state,
    tool,
    readOnly: true,
    accepted: true,
    code: null,
    message,
    data,
    event: null,
    narration: rulesNarration(message),
  };
}

function rejection(
  state: LanternCampaignState,
  tool: EngineToolName | "declare" | "listen",
  code: string,
  message: string
): EngineResolution {
  return {
    state,
    tool,
    readOnly: false,
    accepted: false,
    code,
    message,
    data: { code, message, campaignVersion: state.version },
    event: null,
    narration: rulesNarration(message),
  };
}

type CharacterCreateCommand = Extract<EngineCommand, { kind: "character_create" }>;

function rollAbilityScore(): { dice: [number, number, number, number]; dropped: number; total: number } {
  const dice: [number, number, number, number] = [
    randomInt(1, 7),
    randomInt(1, 7),
    randomInt(1, 7),
    randomInt(1, 7),
  ];
  const ordered = [...dice].sort((left, right) => left - right);
  return {
    dice,
    dropped: ordered[0],
    total: ordered[1] + ordered[2] + ordered[3],
  };
}

function resolveCharacterRollStats(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  command: Extract<EngineCommand, { kind: "character_roll_stats" }>,
  tool: EngineToolName | "declare" | "listen"
): EngineResolution {
  if (state.phase !== "character_creation" || state.character.created) {
    return rejection(state, tool, "character_locked", "Ability scores can only be rolled before the character enters the world.");
  }
  if (state.characterCreation.abilityScoreDraft) {
    return rejection(state, tool, "ability_scores_already_rolled", "Your ability scores are already rolled. Assign those six values, or start a new campaign to roll again.");
  }

  const rolls = Array.from({ length: 6 }, rollAbilityScore);
  const draft = {
    id: randomUUID(),
    method: command.method,
    scores: rolls.map((roll) => roll.total),
    rolls,
    createdAt: new Date().toISOString(),
  } as const;
  const next = cloneCampaign(state);
  next.characterCreation = { abilityScoreDraft: draft };
  return commit(
    next,
    context,
    clientCommandId,
    command,
    tool,
    "The engine rolled six ability scores using 4d6, dropping the lowest die. Assign each result to an ability before entering the world.",
    { abilityScoreDraft: draft },
    "ability_scores_rolled",
    rolls.flatMap((roll) => roll.dice.map((value) => ({ kind: "ability_score_die", value, sides: 6 }))),
    [],
    [{ path: "/characterCreation/abilityScoreDraft", before: state.characterCreation.abilityScoreDraft, after: draft }]
  );
}

class CharacterCreationError extends Error {
  public constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "CharacterCreationError";
  }
}

function createCanonicalCharacter(
  command: CharacterCreateCommand,
  id: string,
  contentPolicy: EngineContentPolicy,
  characterCreation: EngineCharacterCreationState
): EngineCharacter {
  if (!command.speciesKey || !command.classKey) {
    throw new CharacterCreationError(
      "character_options_required",
      "Canonical character creation requires exact speciesKey and classKey values from character_options."
    );
  }

  const species = requireOpen5eSpecies(command.speciesKey);
  const characterClass = requireOpen5eClass(command.classKey);
  const options = open5eCharacterOptions({
    gamesystem: contentPolicy.gamesystem,
    allowedDocuments: contentPolicy.allowedDocumentKeys,
    allowedLicenses: contentPolicy.allowedLicenseKeys,
  });
  const speciesOption = options.species.find((option) => option.contentKey === species.contentKey);
  if (!speciesOption) {
    throw new CharacterCreationError(
      "content_option_forbidden",
      `${species.definition.name} is not enabled by this campaign's content policy.`
    );
  }
  if (!speciesOption.selectable) {
    throw new CharacterCreationError(
      "species_not_selectable",
      speciesOption.requiresSubspecies
        ? `${species.definition.name} requires a specific subrace selection.`
        : `${species.definition.name} is not selectable for a level-one character.`
    );
  }
  const classOption = options.classes.find((option) => option.contentKey === characterClass.contentKey);
  if (!classOption) {
    throw new CharacterCreationError(
      "content_option_forbidden",
      `${characterClass.definition.name} is not enabled by this campaign's content policy.`
    );
  }
  if (characterClass.definition.isSubclass || !characterClass.profile) {
    throw new CharacterCreationError(
      "class_not_selectable",
      `${characterClass.definition.name} is not a selectable level-one base class.`
    );
  }

  const backgroundKey = command.backgroundKey ?? open5eCharacterContentKey("background", "srd_acolyte");
  const alignmentKey = command.alignmentKey ?? open5eCharacterContentKey("alignment", "neutral");
  const background = requireOpen5eBackground(backgroundKey);
  const alignment = requireOpen5eAlignment(alignmentKey);
  const backgroundOption = options.backgrounds.find((option) => option.contentKey === background.contentKey);
  if (!backgroundOption) {
    throw new CharacterCreationError(
      "content_option_forbidden",
      `${background.definition.name} is not enabled by this campaign's content policy.`
    );
  }
  if (!backgroundOption.selectable) {
    throw new CharacterCreationError(
      "background_not_selectable",
      `${background.definition.name} is source-backed but not selectable for a player character.`
    );
  }
  const packHash = species.packHash;
  if (characterClass.packHash !== packHash || background.packHash !== packHash || options.packHash !== packHash) {
    throw new CharacterCreationError("character_pack_mismatch", "Character options must all come from one installed rules pack.");
  }

  const classEngineKey = characterClass.definition.name.trim().toLocaleLowerCase("en-US");
  const baseDefaults = OPEN5E_DEFAULT_ABILITY_SCORES[classEngineKey];
  if (!baseDefaults) {
    throw new CharacterCreationError(
      "class_defaults_missing",
      `No reviewed level-one ability-score policy is installed for ${characterClass.definition.name}.`
    );
  }
  const abilityScoreMethod = command.abilityScoreMethod ?? (command.abilityScores ? "class_default" : "class_default");
  const baseAbilities = command.abilityScores ? { ...command.abilityScores } : { ...baseDefaults };
  for (const ability of ENGINE_ABILITIES) {
    const score = baseAbilities[ability];
    if (!Number.isInteger(score) || score < 3 || score > 20) {
      throw new CharacterCreationError("invalid_ability_scores", "Ability scores must provide all six integer values from 3 through 20.");
    }
  }
  if (abilityScoreMethod === "standard_array" && !sameSortedScores(Object.values(baseAbilities), [8, 10, 12, 13, 14, 15])) {
    throw new CharacterCreationError("invalid_ability_scores", "Standard array scores must be 15, 14, 13, 12, 10, and 8, assigned once each.");
  }
  if (abilityScoreMethod === "rolled") {
    const draft = characterCreation.abilityScoreDraft;
    if (!command.abilityScoreDraftId || !draft || draft.id !== command.abilityScoreDraftId) {
      throw new CharacterCreationError("ability_score_draft_required", "Roll ability scores through the engine before assigning them.");
    }
    if (!sameSortedScores(Object.values(baseAbilities), [...draft.scores].sort((left, right) => left - right))) {
      throw new CharacterCreationError("invalid_ability_scores", "Assigned ability scores must use exactly the six values rolled by the engine.");
    }
  }

  const abilityChoices = resolveAbilityBonusChoices(
    command.abilityBonusChoices,
    species.profile.abilityChoice,
    baseAbilities
  );
  const abilities = Object.fromEntries(
    ENGINE_ABILITIES.map((ability) => [
      ability,
      baseAbilities[ability]
        + species.profile.abilityBonuses[ability]
        + abilityChoices.filter((selected) => selected === ability).length * (species.profile.abilityChoice?.bonus ?? 0),
    ])
  ) as Record<EngineAbility, number>;
  if (ENGINE_ABILITIES.some((ability) => abilities[ability] > 20)) {
    throw new CharacterCreationError(
      "ability_score_cap_exceeded",
      "The selected base scores and species bonuses exceed the level-one ability-score maximum of 20."
    );
  }

  const backgroundSkillKeys = new Set(background.profile.skillProficiencies.map((skill) => skill.contentKey));
  const classSkillOptions = characterClass.profile.skillChoice.options;
  const backgroundSkillOptions = background.profile.skillChoice?.options ?? [];
  const allowedSkillKeys = new Set([
    ...classSkillOptions.map((reference) => reference.contentKey),
    ...backgroundSkillOptions.map((reference) => reference.contentKey),
  ]);
  const skillChoiceCount = characterClass.profile.skillChoice.count + (background.profile.skillChoice?.count ?? 0);
  const selectedSkillKeys = command.skillKeys
    ? [...command.skillKeys]
    : [
        ...classSkillOptions
        .map((reference) => reference.contentKey)
        .filter((contentKey) => !backgroundSkillKeys.has(contentKey))
        .slice(0, characterClass.profile.skillChoice.count),
        ...backgroundSkillOptions
          .map((reference) => reference.contentKey)
          .filter((contentKey) => !backgroundSkillKeys.has(contentKey))
          .slice(0, background.profile.skillChoice?.count ?? 0),
      ];
  assertExactUniqueCount(
    selectedSkillKeys,
    skillChoiceCount,
    "skill",
    "invalid_skill_choices"
  );
  if (selectedSkillKeys.some((skillKey) => !allowedSkillKeys.has(skillKey))) {
    throw new CharacterCreationError("invalid_skill_choices", "Every selected skill must be allowed by the class or background.");
  }
  if (selectedSkillKeys.some((skillKey) => backgroundSkillKeys.has(skillKey))) {
    throw new CharacterCreationError("duplicate_skill_choice", "Skill choices cannot duplicate a fixed background proficiency.");
  }
  if (!canPartitionSkillChoices(
    selectedSkillKeys,
    new Set(classSkillOptions.map((reference) => reference.contentKey)),
    new Set(backgroundSkillOptions.map((reference) => reference.contentKey)),
    characterClass.profile.skillChoice.count,
    background.profile.skillChoice?.count ?? 0
  )) {
    throw new CharacterCreationError("invalid_skill_choices", "The selected skills cannot satisfy both the class and background choices.");
  }
  const skillReferences = [
    ...selectedSkillKeys.map((contentKey) => requireOpen5eSkill(contentKey)),
    ...background.profile.skillProficiencies.map((reference) => requireOpen5eSkill(reference.contentKey)),
  ];
  const proficientSkillKeys = [...new Set(skillReferences.map((skill) => skill.engineKey))];

  const fixedLanguageKeys = [
    ...species.profile.languages.map((language) => language.contentKey),
    ...background.profile.fixedLanguages.map((language) => language.contentKey),
  ];
  const languageChoiceCount = species.profile.languageChoiceCount + background.profile.languageChoiceCount;
  const selectedLanguages = command.languageKeys
    ? command.languageKeys.map((contentKey) => requireOpen5eLanguage(contentKey))
    : defaultOpen5eLanguages(fixedLanguageKeys, languageChoiceCount).slice(fixedLanguageKeys.length);
  assertExactUniqueCount(
    selectedLanguages.map((language) => language.contentKey),
    languageChoiceCount,
    "language",
    "invalid_language_choices"
  );
  const fixedLanguageKeySet = new Set(fixedLanguageKeys);
  for (const language of selectedLanguages) {
    if (language.isSecret) {
      throw new CharacterCreationError("invalid_language_choices", `${language.name} is a class feature, not a general language choice.`);
    }
    if (fixedLanguageKeySet.has(language.contentKey)) {
      throw new CharacterCreationError("duplicate_language_choice", `${language.name} is already granted by the selected species or background.`);
    }
  }
  const languages = [
    ...species.profile.languages.map((reference) => requireOpen5eLanguage(reference.contentKey)),
    ...background.profile.fixedLanguages.map((reference) => requireOpen5eLanguage(reference.contentKey)),
    ...selectedLanguages,
  ];

  const classToolChoiceCount = characterClass.profile.toolChoice?.count ?? 0;
  const backgroundToolChoiceCount = background.profile.toolChoice?.count ?? 0;
  const toolChoiceCount = classToolChoiceCount + backgroundToolChoiceCount;
  const backgroundToolOptions = open5eToolChoiceOptions(background.profile.toolChoice);
  const defaultBackgroundTools = backgroundToolOptions.slice(0, backgroundToolChoiceCount);
  const selectedTools = command.toolProficiencies
    ? [...command.toolProficiencies]
    : [
        ...(OPEN5E_DEFAULT_TOOL_CHOICES[characterClass.sourceKey] ?? []),
        ...defaultBackgroundTools,
      ];
  assertExactUniqueCount(selectedTools, toolChoiceCount, "tool proficiency", "invalid_tool_choices");
  const fixedTools = [
    ...characterClass.profile.proficiencies.tools,
    ...background.profile.toolProficiencies,
  ];
  if (selectedTools.some((toolName) => fixedTools.some((fixed) => fixed.toLocaleLowerCase("en-US") === toolName.toLocaleLowerCase("en-US")))) {
    throw new CharacterCreationError("duplicate_tool_choice", "A chosen tool proficiency cannot duplicate a fixed class or background proficiency.");
  }
  const explicitBackgroundToolOptions = background.profile.toolChoice?.options ?? [];
  if (explicitBackgroundToolOptions.length > 0) {
    const normalizedOptions = new Set(explicitBackgroundToolOptions.map((toolName) => toolName.toLocaleLowerCase("en-US")));
    const matchingBackgroundTools = selectedTools.filter((toolName) => normalizedOptions.has(toolName.toLocaleLowerCase("en-US")));
    if (matchingBackgroundTools.length !== backgroundToolChoiceCount) {
      throw new CharacterCreationError("invalid_tool_choices", "Every selected background tool must come from the allowed background options.");
    }
  }

  const classFeatures = characterClass.profile.levelOneFeatures.map((feature) => ({
    name: feature.name,
    reference: {
      contentKey: characterClass.contentKey,
      packHash,
      featureSourceKey: feature.sourceKey,
    },
  }));
  const speciesFeatures = species.profile.featureNames.map((name) => ({
    name,
    reference: {
      contentKey: species.contentKey,
      packHash,
      featureSourceKey: `${species.sourceKey}/${slugifyFeatureName(name)}`,
    },
  }));
  const backgroundFeatures = background.definition.benefits
    .filter((benefit) => benefit.benefitType === "feature")
    .map((benefit) => ({
      name: benefit.name,
      reference: {
        contentKey: background.contentKey,
        packHash,
        featureSourceKey: `${background.sourceKey}/${slugifyFeatureName(benefit.name)}`,
      },
    }));
  const features = [...classFeatures, ...speciesFeatures, ...backgroundFeatures];
  const level = 1;
  const maxHp = Math.max(1, characterClass.profile.hitDie + open5eAbilityModifier(abilities.con));
  const inventory = createOpen5eStarterInventory(characterClass.sourceKey, background);
  const character: EngineCharacter = {
    id,
    created: true,
    name: command.name,
    species: species.definition.name,
    className: characterClass.definition.name,
    speciesRef: { contentKey: species.contentKey, packHash },
    classRef: { contentKey: characterClass.contentKey, packHash },
    backgroundRef: { contentKey: background.contentKey, packHash },
    alignmentRef: { contentKey: alignment.contentKey, packHash },
    skillRefs: skillReferences.map((skill) => ({ contentKey: skill.contentKey, packHash })),
    languageRefs: languages.map((language) => ({ contentKey: language.contentKey, packHash })),
    featureRefs: features.map((feature) => feature.reference),
    featRefs: [],
    background: background.definition.name,
    alignment: alignment.name,
    description: "",
    details: emptyCharacterDetails(),
    level,
    abilities,
    abilityModifiers: Object.fromEntries(
      ENGINE_ABILITIES.map((ability) => [ability, open5eAbilityModifier(abilities[ability])])
    ) as Record<EngineAbility, number>,
    proficiencyBonus: open5eProficiencyBonus(level),
    savingThrows: buildSavingThrows(abilities, characterClass.profile.savingThrows, level),
    skills: buildSkillSheet(abilities, proficientSkillKeys, level),
    size: species.profile.size,
    speed: species.profile.speedFeet,
    hitDie: characterClass.profile.hitDie,
    hitDiceRemaining: level,
    proficiencies: {
      armor: [...characterClass.profile.proficiencies.armor],
      weapons: [...characterClass.profile.proficiencies.weapons],
      tools: [...fixedTools, ...selectedTools],
      languages: languages.map((language) => language.name),
    },
    features: features.map((feature) => feature.name),
    spellcasting: buildSpellcastingState(characterClass.definition.name, level, abilities),
    hp: maxHp,
    maxHp,
    ac: 10 + open5eAbilityModifier(abilities.dex),
    inventory,
    currency: { copper: background.profile.startingCurrencyCopper },
    gold: 0,
    xp: 0,
    conditions: [],
    conditionEffects: [],
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
  };
  character.ac = deriveArmorClass(character);
  syncCurrencyProjection(character);
  return character;
}

function resolveAbilityBonusChoices(
  requested: EngineAbility[] | undefined,
  choice: { count: number; bonus: number; excluded: EngineAbility[] } | null,
  baseAbilities: Record<EngineAbility, number>
): EngineAbility[] {
  if (!choice) {
    if (requested?.length) {
      throw new CharacterCreationError("invalid_ability_bonus_choices", "The selected species has no floating ability bonuses.");
    }
    return [];
  }
  const selected = requested
    ? [...requested]
    : ENGINE_ABILITIES
        .filter((ability) => !choice.excluded.includes(ability))
        .sort((left, right) => baseAbilities[right] - baseAbilities[left] || ENGINE_ABILITIES.indexOf(left) - ENGINE_ABILITIES.indexOf(right))
        .slice(0, choice.count);
  assertExactUniqueCount(selected, choice.count, "ability bonus", "invalid_ability_bonus_choices");
  if (selected.some((ability) => choice.excluded.includes(ability))) {
    throw new CharacterCreationError("invalid_ability_bonus_choices", "A floating species bonus was assigned to an excluded ability.");
  }
  return selected;
}

function assertExactUniqueCount(
  values: string[],
  expected: number,
  label: string,
  code: string
): void {
  if (values.length !== expected) {
    throw new CharacterCreationError(code, `Choose exactly ${expected} ${label}${expected === 1 ? "" : "s"}.`);
  }
  const normalized = values.map((value) => value.trim().toLocaleLowerCase("en-US"));
  if (new Set(normalized).size !== normalized.length) {
    throw new CharacterCreationError(code, `${label[0]?.toLocaleUpperCase("en-US") ?? "C"}${label.slice(1)} choices must be unique.`);
  }
}

function sameSortedScores(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort((a, b) => a - b);
  const sortedRight = [...right].sort((a, b) => a - b);
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function canPartitionSkillChoices(
  selected: string[],
  classOptions: Set<string>,
  backgroundOptions: Set<string>,
  classCount: number,
  backgroundCount: number
): boolean {
  const visit = (index: number, classUsed: number, backgroundUsed: number): boolean => {
    if (index === selected.length) return classUsed === classCount && backgroundUsed === backgroundCount;
    const skillKey = selected[index];
    if (!skillKey) return false;
    return (classOptions.has(skillKey) && classUsed < classCount && visit(index + 1, classUsed + 1, backgroundUsed))
      || (backgroundOptions.has(skillKey) && backgroundUsed < backgroundCount && visit(index + 1, classUsed, backgroundUsed + 1));
  };
  return visit(0, 0, 0);
}

function slugifyFeatureName(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function createUnconfiguredCharacter(id: string): EngineCharacter {
  return createCharacter("", "", "fighter", id, false);
}

function createCharacter(
  name: string,
  species: string,
  className: string,
  id: string,
  created = true,
  background = "Folk Hero",
  alignment = "Unaligned",
  abilityScores?: Record<EngineAbility, number>
): EngineCharacter {
  const classPreset = OPEN5E_CLASS_PRESETS[className] ?? OPEN5E_CLASS_PRESETS.fighter;
  const speciesPreset = OPEN5E_SPECIES_PRESETS[species] ?? OPEN5E_SPECIES_PRESETS.human;
  const base = abilityScores ?? OPEN5E_DEFAULT_ABILITY_SCORES[className] ?? OPEN5E_DEFAULT_ABILITY_SCORES.fighter;
  const abilities = {
    str: base.str + (speciesPreset.abilityBonuses.str ?? 0),
    dex: base.dex + (speciesPreset.abilityBonuses.dex ?? 0),
    con: base.con + (speciesPreset.abilityBonuses.con ?? 0),
    int: base.int + (speciesPreset.abilityBonuses.int ?? 0),
    wis: base.wis + (speciesPreset.abilityBonuses.wis ?? 0),
    cha: base.cha + (speciesPreset.abilityBonuses.cha ?? 0),
  };
  const level = 1;
  const inventory: EngineInventoryItem[] = [
    createOpen5eInventoryItem("bedroll", open5eItemContentKey("srd_bedroll"), 1),
    createOpen5eInventoryItem("ration", open5eItemContentKey("srd_rations-1-day"), 2),
    ...classPreset.startingEquipment.map((item) => normalizeInventoryItem({ ...item })),
  ];
  const maxHp = Math.max(1, classPreset.hitDie + open5eAbilityModifier(abilities.con));
  const character: EngineCharacter = {
    id,
    created,
    name,
    species,
    className,
    speciesRef: null,
    classRef: null,
    backgroundRef: null,
    alignmentRef: null,
    skillRefs: [],
    languageRefs: [],
    featureRefs: [],
    featRefs: [],
    background,
    alignment,
    description: "",
    details: emptyCharacterDetails(),
    level,
    abilities,
    abilityModifiers: {
      str: open5eAbilityModifier(abilities.str),
      dex: open5eAbilityModifier(abilities.dex),
      con: open5eAbilityModifier(abilities.con),
      int: open5eAbilityModifier(abilities.int),
      wis: open5eAbilityModifier(abilities.wis),
      cha: open5eAbilityModifier(abilities.cha),
    },
    proficiencyBonus: open5eProficiencyBonus(level),
    savingThrows: buildSavingThrows(abilities, classPreset.savingThrows, level),
    skills: buildSkillSheet(abilities, defaultSkillProficiencies(className), level),
    size: speciesPreset.size,
    speed: speciesPreset.speed,
    hitDie: classPreset.hitDie,
    hitDiceRemaining: level,
    proficiencies: {
      armor: classPreset.armorProficiencies,
      weapons: classPreset.weaponProficiencies,
      tools: classPreset.toolProficiencies,
      languages: speciesPreset.languages,
    },
    features: [...classPreset.startingFeatures, ...speciesPreset.features],
    spellcasting: buildSpellcastingState(className, level, abilities),
    hp: maxHp,
    maxHp,
    ac: 10 + open5eAbilityModifier(abilities.dex),
    inventory,
    currency: { copper: 500 },
    gold: 5,
    xp: 0,
    conditions: [],
    conditionEffects: [],
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
  };
  character.ac = deriveArmorClass(character);
  return character;
}

function normalizeCharacter(character: EngineCharacter): EngineCharacter {
  const raw = character as EngineCharacter & { currency?: { copper?: number } };
  const currencyCopper = raw.currency?.copper ?? Math.max(0, Math.trunc(raw.gold ?? 0) * 100);
  const hydrated = hydrateCharacter({
    ...raw,
    currency: { copper: Math.max(0, Math.trunc(currencyCopper)) },
    background: raw.background ?? "Folk Hero",
    alignment: raw.alignment ?? "Unaligned",
    speciesRef: normalizeContentReference(raw.speciesRef),
    classRef: normalizeContentReference(raw.classRef),
    backgroundRef: normalizeContentReference(raw.backgroundRef),
    alignmentRef: normalizeContentReference(raw.alignmentRef),
    skillRefs: normalizeContentReferences(raw.skillRefs),
    languageRefs: normalizeContentReferences(raw.languageRefs),
    featureRefs: normalizeFeatureReferences(raw.featureRefs),
    featRefs: normalizeContentReferences(raw.featRefs),
    description: raw.description ?? "",
    details: normalizeCharacterDetails(raw.details),
    inventory: Array.isArray(raw.inventory) ? raw.inventory.map(normalizeInventoryItem) : [],
    conditions: Array.isArray(raw.conditions) ? raw.conditions : [],
    conditionEffects: normalizeAppliedConditions(raw.conditionEffects),
    deathSaveSuccesses: raw.deathSaveSuccesses ?? 0,
    deathSaveFailures: raw.deathSaveFailures ?? 0,
    xp: raw.xp ?? 0,
  });
  syncCurrencyProjection(hydrated);
  return hydrated;
}

function emptyCharacterDetails(): EngineCharacterDetails {
  return {
    playerName: "",
    age: "",
    height: "",
    weight: "",
    eyes: "",
    skin: "",
    hair: "",
    personalityTraits: "",
    ideals: "",
    bonds: "",
    flaws: "",
    appearance: "",
    backstory: "",
    allies: "",
    factionName: "",
    treasure: "",
    inspiration: false,
    temporaryHp: 0,
  };
}

function normalizeCharacterDetails(value: unknown): EngineCharacterDetails {
  const defaults = emptyCharacterDetails();
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const raw = value as Partial<EngineCharacterDetails>;
  return {
    ...defaults,
    playerName: typeof raw.playerName === "string" ? raw.playerName : defaults.playerName,
    age: typeof raw.age === "string" ? raw.age : defaults.age,
    height: typeof raw.height === "string" ? raw.height : defaults.height,
    weight: typeof raw.weight === "string" ? raw.weight : defaults.weight,
    eyes: typeof raw.eyes === "string" ? raw.eyes : defaults.eyes,
    skin: typeof raw.skin === "string" ? raw.skin : defaults.skin,
    hair: typeof raw.hair === "string" ? raw.hair : defaults.hair,
    personalityTraits: typeof raw.personalityTraits === "string" ? raw.personalityTraits : defaults.personalityTraits,
    ideals: typeof raw.ideals === "string" ? raw.ideals : defaults.ideals,
    bonds: typeof raw.bonds === "string" ? raw.bonds : defaults.bonds,
    flaws: typeof raw.flaws === "string" ? raw.flaws : defaults.flaws,
    appearance: typeof raw.appearance === "string" ? raw.appearance : defaults.appearance,
    backstory: typeof raw.backstory === "string" ? raw.backstory : defaults.backstory,
    allies: typeof raw.allies === "string" ? raw.allies : defaults.allies,
    factionName: typeof raw.factionName === "string" ? raw.factionName : defaults.factionName,
    treasure: typeof raw.treasure === "string" ? raw.treasure : defaults.treasure,
    inspiration: typeof raw.inspiration === "boolean" ? raw.inspiration : defaults.inspiration,
    temporaryHp: typeof raw.temporaryHp === "number" && Number.isFinite(raw.temporaryHp)
      ? Math.max(0, Math.trunc(raw.temporaryHp))
      : defaults.temporaryHp,
  };
}

function normalizeAppliedConditions(value: unknown): EngineCharacter["conditionEffects"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Partial<EngineCharacter["conditionEffects"][number]>;
    if (
      typeof candidate.id !== "string"
      || typeof candidate.conditionContentKey !== "string"
      || !candidate.conditionContentKey.startsWith("open5e:condition:")
      || typeof candidate.packHash !== "string"
      || !/^[a-f0-9]{64}$/.test(candidate.packHash)
      || typeof candidate.name !== "string"
      || typeof candidate.sourceContentKey !== "string"
      || !candidate.sourceContentKey.startsWith("open5e:")
      || typeof candidate.sourceCombatantId !== "string"
      || typeof candidate.appliedRound !== "number"
      || !candidate.duration
    ) return [];
    return [{
      id: candidate.id,
      conditionContentKey: candidate.conditionContentKey,
      packHash: candidate.packHash,
      name: candidate.name,
      sourceContentKey: candidate.sourceContentKey,
      sourceCombatantId: candidate.sourceCombatantId,
      appliedRound: Math.max(0, Math.trunc(candidate.appliedRound)),
      duration: candidate.duration,
      repeatSave: candidate.repeatSave ?? null,
    }];
  });
}

function normalizeContentReference(value: unknown): EngineContentReference | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { contentKey?: unknown; packHash?: unknown };
  if (typeof candidate.contentKey !== "string" || typeof candidate.packHash !== "string") return null;
  if (!candidate.contentKey.startsWith("open5e:") || !/^[a-f0-9]{64}$/.test(candidate.packHash)) return null;
  return { contentKey: candidate.contentKey, packHash: candidate.packHash };
}

function normalizeContentReferences(value: unknown): EngineContentReference[] {
  if (!Array.isArray(value)) return [];
  const references = value
    .map(normalizeContentReference)
    .filter((reference): reference is EngineContentReference => reference !== null);
  return [...new Map(references.map((reference) => [reference.contentKey, reference])).values()];
}

function normalizeFeatureReferences(value: unknown): EngineFeatureReference[] {
  if (!Array.isArray(value)) return [];
  const references: EngineFeatureReference[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const base = normalizeContentReference(raw);
    const featureSourceKey = raw && typeof raw === "object"
      ? (raw as { featureSourceKey?: unknown }).featureSourceKey
      : null;
    if (!base || typeof featureSourceKey !== "string" || !featureSourceKey.trim()) continue;
    const identity = `${base.contentKey}\u0000${featureSourceKey}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    references.push({ ...base, featureSourceKey });
  }
  return references;
}

function hydrateCharacter(character: EngineCharacter): EngineCharacter {
  const classEngineKey = character.className.trim().toLocaleLowerCase("en-US");
  const speciesEngineKey = character.species.trim().toLocaleLowerCase("en-US");
  const classPreset = OPEN5E_CLASS_PRESETS[classEngineKey] ?? OPEN5E_CLASS_PRESETS.fighter;
  const speciesPreset = OPEN5E_SPECIES_PRESETS[speciesEngineKey] ?? OPEN5E_SPECIES_PRESETS.human;
  const referencedClass = character.classRef
    ? getOpen5eClass(character.classRef.contentKey, character.classRef.packHash)
    : null;
  const referencedSpecies = character.speciesRef
    ? getOpen5eSpecies(character.speciesRef.contentKey, character.speciesRef.packHash)
    : null;
  const classProfile = referencedClass?.profile ?? null;
  const speciesProfile = referencedSpecies?.profile ?? null;
  const level = Math.max(1, character.level || 1);
  const abilities = {
    str: character.abilities?.str ?? 10,
    dex: character.abilities?.dex ?? 10,
    con: character.abilities?.con ?? 10,
    int: character.abilities?.int ?? 10,
    wis: character.abilities?.wis ?? 10,
    cha: character.abilities?.cha ?? 10,
  };
  const proficientSkills = Object.entries(character.skills ?? {})
    .filter(([, skill]) => skill.proficient)
    .map(([skill]) => skill);
  const skillNames = proficientSkills.length ? proficientSkills : defaultSkillProficiencies(classEngineKey);
  const hitDie = character.hitDie ?? classProfile?.hitDie ?? classPreset.hitDie;
  const maxHp = Math.max(1, hitDie * level + open5eAbilityModifier(abilities.con) * level);
  character.level = level;
  character.abilities = abilities;
  character.abilityModifiers = {
    str: open5eAbilityModifier(abilities.str),
    dex: open5eAbilityModifier(abilities.dex),
    con: open5eAbilityModifier(abilities.con),
    int: open5eAbilityModifier(abilities.int),
    wis: open5eAbilityModifier(abilities.wis),
    cha: open5eAbilityModifier(abilities.cha),
  };
  character.proficiencyBonus = open5eProficiencyBonus(level);
  character.savingThrows = buildSavingThrows(abilities, classProfile?.savingThrows ?? classPreset.savingThrows, level);
  character.skills = buildSkillSheet(abilities, skillNames, level);
  character.size = character.size ?? speciesProfile?.size ?? speciesPreset.size;
  character.speed = character.speed ?? speciesProfile?.speedFeet ?? speciesPreset.speed;
  character.hitDie = hitDie;
  character.hitDiceRemaining = Math.max(0, Math.min(level, character.hitDiceRemaining ?? level));
  character.proficiencies = character.proficiencies ?? {
    armor: classProfile?.proficiencies.armor ?? classPreset.armorProficiencies,
    weapons: classProfile?.proficiencies.weapons ?? classPreset.weaponProficiencies,
    tools: classProfile?.proficiencies.tools ?? classPreset.toolProficiencies,
    languages: speciesProfile?.languages.map((language) => language.name) ?? speciesPreset.languages,
  };
  character.features = character.features?.length
    ? character.features
    : [
        ...(classProfile?.levelOneFeatures.map((feature) => feature.name) ?? classPreset.startingFeatures),
        ...(speciesProfile?.featureNames ?? speciesPreset.features),
      ];
  character.spellcasting = buildSpellcastingState(
    character.className,
    level,
    abilities,
    character.spellcasting,
    character.classRef?.packHash
  );
  character.maxHp = character.maxHp ?? maxHp;
  character.hp = Math.max(0, Math.min(character.maxHp, character.hp ?? character.maxHp));
  character.inventory = Array.isArray(character.inventory) ? character.inventory.map(normalizeInventoryItem) : [];
  character.currency = character.currency ?? { copper: 0 };
  character.ac = deriveArmorClass(character);
  return character;
}

function buildSpellcastingState(
  className: string,
  level: number,
  abilities: Record<EngineAbility, number>,
  current?: EngineCharacter["spellcasting"],
  packHash?: string
): EngineCharacter["spellcasting"] {
  const progression = getOpen5eSpellProgression(className, packHash);
  const classPreset = OPEN5E_CLASS_PRESETS[className] ?? OPEN5E_CLASS_PRESETS.fighter;
  const ability = progression?.spellcastingAbility ?? classPreset.spellcastingAbility;
  if (!ability) return null;

  const slotMaximums = open5eSpellSlots(className, level, packHash);
  const slots = Object.fromEntries(
    Object.entries(slotMaximums).map(([slotLevel, maximum]) => {
      const existing = current?.slots?.[slotLevel];
      return [slotLevel, existing === undefined ? maximum : Math.max(0, Math.min(maximum, Math.trunc(existing)))];
    })
  );
  return {
    ability,
    spellSaveDc: 8 + open5eProficiencyBonus(level) + open5eAbilityModifier(abilities[ability]),
    spellAttackBonus: open5eProficiencyBonus(level) + open5eAbilityModifier(abilities[ability]),
    slots,
    slotMaximums,
    slotRecovery: progression?.slotRecovery ?? "long-rest",
    knownSpells: normalizeSpellReferences(current?.knownSpells),
    preparedSpells: normalizeSpellReferences(current?.preparedSpells),
    concentration: normalizeConcentration(current?.concentration),
  };
}

function normalizeSpellReferences(value: unknown): EngineSpellReference[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const references: EngineSpellReference[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const reference = candidate as Partial<EngineSpellReference>;
    if (typeof reference.contentKey !== "string" || typeof reference.packHash !== "string") continue;
    if (!reference.contentKey.startsWith("open5e:spell:") || seen.has(reference.contentKey)) continue;
    seen.add(reference.contentKey);
    references.push({ contentKey: reference.contentKey, packHash: reference.packHash });
  }
  return references;
}

function normalizeConcentration(value: unknown): NonNullable<EngineCharacter["spellcasting"]>["concentration"] {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { contentKey?: unknown; packHash?: unknown; startedRound?: unknown };
  if (
    typeof candidate.contentKey !== "string"
    || !candidate.contentKey.startsWith("open5e:spell:")
    || typeof candidate.packHash !== "string"
  ) return null;
  return {
    contentKey: candidate.contentKey,
    packHash: candidate.packHash,
    startedRound: typeof candidate.startedRound === "number" ? Math.max(0, Math.trunc(candidate.startedRound)) : null,
  };
}

function defaultSkillProficiencies(className: string): string[] {
  switch (className) {
    case "barbarian": return ["athletics", "survival"];
    case "fighter": return ["athletics", "perception"];
    case "rogue": return ["stealth", "sleightOfHand", "investigation", "deception"];
    case "wizard": return ["arcana", "history"];
    default: return [];
  }
}

function deriveArmorClass(character: EngineCharacter): number {
  const dexterity = open5eAbilityModifier(character.abilities.dex);
  const equipped = materializeInventory(character.inventory).filter((item) => item.equipped);
  const armor = equipped.find((item) => item.kind === "armor" && item.slot === "armor");
  const shieldBonus = equipped
    .filter((item) => item.kind === "armor" && item.properties?.includes("shield"))
    .reduce((total, item) => total + (item.armorClass ?? 0), 0);
  if (!armor) return 10 + dexterity + shieldBonus;
  if (armor.armorProfile) {
    const dexBonus = armor.armorProfile.addDexterityModifier
      ? armor.armorProfile.dexterityModifierCap === null
        ? dexterity
        : Math.min(armor.armorProfile.dexterityModifierCap, dexterity)
      : 0;
    return armor.armorProfile.base + dexBonus + shieldBonus;
  }
  const heavy = armor.properties?.includes("heavy");
  const medium = armor.properties?.includes("medium");
  const dexBonus = heavy ? 0 : medium ? Math.min(2, dexterity) : dexterity;
  return (armor.armorClass ?? 10) + dexBonus + shieldBonus;
}

function normalizeNpc(npc: EngineNpc): EngineNpc {
  return {
    id: npc.id,
    name: npc.name,
    description: npc.description ?? "",
    disposition: npc.disposition ?? "neutral",
    goals: npc.goals ?? [],
    socialDc: npc.socialDc ?? 12,
    relationshipScore: npc.relationshipScore ?? 0,
    memories: npc.memories ?? [],
  };
}

function normalizeMerchant(merchant: EngineMerchant): EngineMerchant {
  return {
    id: merchant.id,
    name: merchant.name,
    description: merchant.description ?? "",
    disposition: merchant.disposition ?? "neutral",
    items: (merchant.items ?? []).map((listing) => {
      const item = normalizeInventoryItem(listing.item);
      const definition = materializeInventoryItem(item);
      return {
        item,
        stock: listing.stock ?? 0,
        buyPriceCopper: Math.max(0, Math.trunc(listing.buyPriceCopper ?? definition.valueCopper ?? 0)),
        sellPriceCopper: Math.max(0, Math.trunc(listing.sellPriceCopper ?? Math.floor((definition.valueCopper ?? 0) / 2))),
      };
    }),
  };
}

function projectMerchants(merchants: EngineMerchant[]): EngineMerchantView[] {
  return merchants.map((merchant) => ({
    ...merchant,
    items: merchant.items.map((listing) => ({
      ...listing,
      item: materializeInventoryItem(listing.item),
    })),
  }));
}

function projectWorldContext(world: LanternCampaignState["worldContext"]): EngineWorldContextView | null {
  if (!world) return null;
  return {
    ...world,
    merchants: projectMerchants(world.merchants),
  };
}

function normalizeQuest(quest: EngineQuest): EngineQuest {
  const legacy = quest as EngineQuest & { reward?: { xp?: number; copper?: number; gold?: number } };
  return {
    id: legacy.id ?? randomUUID(),
    title: legacy.title ?? "Untitled quest",
    objective: legacy.objective ?? "Follow the thread.",
    status: legacy.status ?? "active",
    reward: {
      xp: legacy.reward?.xp ?? 0,
      copper: legacy.reward?.copper ?? (legacy.reward?.gold ?? 0) * 100,
    },
    rewardClaimed: legacy.rewardClaimed ?? false,
    progress: Math.max(0, Math.min(100, legacy.progress ?? 0)),
    giverNpcId: legacy.giverNpcId,
    deadline: legacy.deadline,
  };
}

function currencyBreakdown(copper: number): EngineCurrencyBreakdown {
  return currencyFromCopper(copper);
}

function syncCurrencyProjection(character: EngineCharacter): void {
  character.currency.copper = Math.max(0, Math.trunc(character.currency.copper));
  character.gold = Math.floor(character.currency.copper / 100);
}

function inventoryWeight(inventory: EngineInventoryItem[]): number {
  return materializeInventory(inventory)
    .reduce((total, item) => total + item.weight * item.quantity, 0);
}

function addInventory(inventory: EngineInventoryItem[], item: EngineInventoryItem): void {
  const existing = inventory.find((candidate) => candidate.id === item.id && !candidate.equipped);
  if (existing) existing.quantity += item.quantity;
  else inventory.push(item);
}

function formatCurrency(copper: number): string {
  const parts = currencyFromCopper(copper);
  const labels: string[] = [];
  if (parts.platinum) labels.push(parts.platinum + " pp");
  if (parts.gold) labels.push(parts.gold + " gp");
  if (parts.electrum) labels.push(parts.electrum + " ep");
  if (parts.silver) labels.push(parts.silver + " sp");
  if (parts.copper || !labels.length) labels.push(parts.copper + " cp");
  return labels.join(" ");
}

function emptyCombat(): EngineCombat {
  return {
    status: "none",
    encounterId: null,
    encounterName: null,
    round: 0,
    activeActorId: null,
    actionUsed: false,
    bonusActionUsed: false,
    reactionUsed: false,
    enemies: [],
    lootClaimed: false,
    lastAction: null,
  };
}

function normalizeCombat(combat: EngineCombat | null | undefined): EngineCombat {
  if (!combat || !Array.isArray(combat.enemies)) return emptyCombat();
  const legacyEnemies = combat.enemies as Array<Partial<EngineCombatant>>;
  if (legacyEnemies.some((enemy) => !enemy.id || !enemy.contentKey || !enemy.packHash)) {
    return {
      ...emptyCombat(),
      status: combat.status === "none" ? "none" : "ended",
      encounterId: combat.encounterId ?? null,
      encounterName: combat.encounterName ?? null,
      lastAction: "legacy_encounter_requires_explicit_repin",
    };
  }
  return {
    status: combat.status ?? "none",
    encounterId: combat.encounterId ?? null,
    encounterName: combat.encounterName ?? null,
    round: Math.max(0, combat.round ?? 0),
    activeActorId: combat.activeActorId ?? null,
    actionUsed: combat.actionUsed ?? false,
    bonusActionUsed: combat.bonusActionUsed ?? false,
    reactionUsed: combat.reactionUsed ?? false,
    enemies: legacyEnemies.map((enemy) => ({
      id: enemy.id as string,
      contentKey: enemy.contentKey as string,
      packHash: enemy.packHash as string,
      hp: Math.max(0, Math.trunc(enemy.hp ?? 0)),
      alive: Boolean(enemy.alive) && (enemy.hp ?? 0) > 0,
      distanceFeet: Math.max(0, Number(enemy.distanceFeet ?? 30)),
      conditions: Array.isArray(enemy.conditions) ? enemy.conditions : [],
      actionResources: normalizeActionResources(enemy.actionResources),
    })),
    lootClaimed: combat.lootClaimed ?? false,
    lastAction: combat.lastAction ?? null,
  };
}

function normalizeActionResources(
  resources: Partial<EngineCombatant>["actionResources"]
): EngineCombatant["actionResources"] {
  if (!resources || typeof resources !== "object" || Array.isArray(resources)) return {};
  return Object.fromEntries(
    Object.entries(resources).flatMap(([actionKey, resource]) => {
      if (!resource || (resource.kind !== "per-day" && resource.kind !== "recharge")) return [];
      return [[actionKey, {
        kind: resource.kind,
        usesRemaining: resource.kind === "per-day"
          ? Math.max(0, Math.trunc(resource.usesRemaining ?? 0))
          : null,
        available: Boolean(resource.available),
        rechargeMinimum: resource.kind === "recharge"
          ? Math.max(2, Math.min(6, Math.trunc(resource.rechargeMinimum ?? 6)))
          : null,
        lastRechargeRound: resource.lastRechargeRound === null || resource.lastRechargeRound === undefined
          ? null
          : Math.max(0, Math.trunc(resource.lastRechargeRound)),
      }]];
    })
  );
}

function createCombatants(contentKey: string, count: number, distanceFeet = 30): EngineCombatant[] {
  return Array.from({ length: count }, () => createOpen5eCombatant(contentKey, randomUUID(), distanceFeet));
}

function describeCombatants(combatants: EngineCombatant[]): string {
  const counts = new Map<string, { name: string; count: number }>();
  for (const combatant of materializeCombatants(combatants)) {
    const current = counts.get(combatant.contentKey) ?? { name: combatant.name, count: 0 };
    current.count += 1;
    counts.set(combatant.contentKey, current);
  }
  return [...counts.values()]
    .map(({ name, count }) => count === 1 ? `One ${name}` : `${count} ${name}`)
    .join(", ");
}

function materializeSpellcasting(character: EngineCharacter): EngineSpellcastingView | null {
  const spellcasting = character.spellcasting;
  if (!spellcasting) return null;
  const progression = getOpen5eSpellProgression(character.className, character.classRef?.packHash);
  const levelIndex = Math.max(0, Math.min(19, character.level - 1));
  const knownSpellLimit = progression?.selectionMode === "known"
    ? progression.knownSpellLimits[levelIndex] ?? null
    : progression?.selectionMode === "spellbook" && progression.spellbook
      ? progression.spellbook.initialSpellCount
        + progression.spellbook.spellsGainedPerLevel * Math.max(0, character.level - 1)
      : null;
  const knownSpells = spellcasting.knownSpells.map(materializeSpellReference).sort(compareSpellViews);
  const preparedSpells = spellcasting.preparedSpells.map(materializeSpellReference).sort(compareSpellViews);
  return {
    ability: spellcasting.ability,
    spellSaveDc: spellcasting.spellSaveDc,
    spellAttackBonus: spellcasting.spellAttackBonus,
    slots: { ...spellcasting.slots },
    slotMaximums: { ...spellcasting.slotMaximums },
    slotRecovery: spellcasting.slotRecovery,
    selectionMode: progression?.selectionMode ?? null,
    knownSpellLimit,
    cantripLimit: progression?.cantripsKnown[levelIndex] ?? null,
    preparedCapacity: progression?.preparedFormula ? preparedSpellCapacity(character, progression.preparedFormula) : null,
    knownSpells,
    preparedSpells,
    concentration: spellcasting.concentration
      ? { ...materializeSpellReference(spellcasting.concentration), startedRound: spellcasting.concentration.startedRound }
      : null,
  };
}

function materializeSpellReference(reference: EngineSpellReference): EngineSpellcastingView["knownSpells"][number] {
  const source = getOpen5eSpell(reference.contentKey, reference.packHash);
  if (!source || source.packHash !== reference.packHash) {
    return {
      ...reference,
      name: reference.contentKey,
      level: null,
      school: null,
      castingTime: null,
      range: null,
      concentrationRequired: null,
      mechanicsStatus: "pack-unavailable",
    };
  }
  return {
    ...reference,
    name: source.definition.name,
    level: source.definition.level,
    school: source.definition.school.name,
    castingTime: source.definition.castingTime,
    range: source.definition.range.text,
    concentrationRequired: source.definition.concentration,
    mechanicsStatus: source.effect ? "compiled-primary" : "prose-only",
  };
}

function compareSpellViews(
  left: EngineSpellcastingView["knownSpells"][number],
  right: EngineSpellcastingView["knownSpells"][number]
): number {
  return (left.level ?? 99) - (right.level ?? 99) || left.name.localeCompare(right.name);
}

function materializeCharacterSourceDetails(character: EngineCharacter): EngineCharacterSourceDetailsView {
  const species = character.speciesRef
    ? getOpen5eSpecies(character.speciesRef.contentKey, character.speciesRef.packHash)
    : null;
  const characterClass = character.classRef
    ? getOpen5eClass(character.classRef.contentKey, character.classRef.packHash)
    : null;
  const background = character.backgroundRef
    ? getOpen5eBackground(character.backgroundRef.contentKey, character.backgroundRef.packHash)
    : null;
  const alignment = character.alignmentRef
    ? getOpen5eAlignment(character.alignmentRef.contentKey, character.alignmentRef.packHash)
    : null;
  const skills = character.skillRefs
    .map((reference) => getOpen5eSkill(reference.contentKey, reference.packHash))
    .filter((skill): skill is NonNullable<typeof skill> => skill !== null)
    .map((skill) => ({
      contentKey: skill.contentKey,
      name: skill.name,
      engineKey: skill.engineKey,
      ability: skill.ability,
      description: skill.description,
    }));
  const languages = character.languageRefs
    .map((reference) => getOpen5eLanguage(reference.contentKey, reference.packHash))
    .filter((language): language is NonNullable<typeof language> => language !== null)
    .map((language) => ({
      contentKey: language.contentKey,
      name: language.name,
      description: language.description,
      isExotic: language.isExotic,
    }));
  const features: EngineCharacterFeatureView[] = character.featureRefs.map((reference) => {
    if (characterClass && reference.contentKey === characterClass.contentKey) {
      const feature = characterClass.definition.features.find((candidate) => candidate.sourceKey === reference.featureSourceKey);
      return {
        ...reference,
        name: feature?.name ?? reference.featureSourceKey,
        description: feature?.description ?? "",
        sourceType: "class",
        sourceName: characterClass.definition.name,
      };
    }
    if (species && reference.contentKey === species.contentKey) {
      const trait = species.definition.traits.find(
        (candidate) => `${species.sourceKey}/${slugifyFeatureName(candidate.name)}` === reference.featureSourceKey
      );
      return {
        ...reference,
        name: trait?.name ?? reference.featureSourceKey,
        description: trait?.description ?? "",
        sourceType: "species",
        sourceName: species.definition.name,
      };
    }
    if (background && reference.contentKey === background.contentKey) {
      const benefit = background.definition.benefits.find(
        (candidate) => `${background.sourceKey}/${slugifyFeatureName(candidate.name)}` === reference.featureSourceKey
      );
      return {
        ...reference,
        name: benefit?.name ?? reference.featureSourceKey,
        description: benefit?.description ?? "",
        sourceType: "background",
        sourceName: background.definition.name,
      };
    }
    return unresolvedFeatureView(reference, "unknown", "Unknown source");
  });
  for (const reference of character.featRefs) {
    const feat = getOpen5eFeat(reference.contentKey, reference.packHash);
    features.push({
      ...reference,
      featureSourceKey: feat?.sourceKey ?? reference.contentKey,
      name: feat?.name ?? reference.contentKey,
      description: feat?.description ?? "",
      sourceType: feat ? "feat" : "unknown",
      sourceName: feat ? "Feat" : "Unavailable rules pack",
    });
  }
  return {
    species: species
      ? {
          contentKey: species.contentKey,
          name: species.definition.name,
          description: species.definition.description,
          traits: species.definition.traits.map((trait) => ({ name: trait.name, description: trait.description })),
        }
      : null,
    characterClass: characterClass
      ? {
          contentKey: characterClass.contentKey,
          name: characterClass.definition.name,
          description: characterClass.definition.description,
          levelOneFeatures: (characterClass.profile?.levelOneFeatures ?? []).map((feature) => {
            const source = characterClass.definition.features.find((candidate) => candidate.sourceKey === feature.sourceKey);
            return { sourceKey: feature.sourceKey, name: feature.name, description: source?.description ?? "" };
          }),
          startingEquipmentDescription: characterClass.profile?.startingEquipmentDescription ?? null,
        }
      : null,
    background: background
      ? {
          contentKey: background.contentKey,
          name: background.definition.name,
          description: background.definition.description,
          benefits: background.definition.benefits.map((benefit) => ({ ...benefit })),
        }
      : null,
    alignment: alignment
      ? { contentKey: alignment.contentKey, name: alignment.name, description: alignment.description }
      : null,
    skills,
    languages,
    features,
  };
}

function unresolvedFeatureView(
  reference: EngineFeatureReference,
  sourceType: EngineCharacterFeatureView["sourceType"],
  sourceName: string
): EngineCharacterFeatureView {
  return {
    ...reference,
    name: reference.featureSourceKey,
    description: "",
    sourceType,
    sourceName,
  };
}

function characterData(character: EngineCharacter): EngineCharacterView {
  const carryWeight = inventoryWeight(character.inventory);
  const carryLimit = carryCapacity(character.abilities.str);
  const referencedClass = character.classRef
    ? getOpen5eClass(character.classRef.contentKey, character.classRef.packHash)
    : null;
  return {
    id: character.id,
    created: character.created,
    name: character.name,
    species: character.species,
    className: character.className,
    speciesRef: character.speciesRef,
    classRef: character.classRef,
    backgroundRef: character.backgroundRef,
    alignmentRef: character.alignmentRef,
    skillRefs: character.skillRefs,
    languageRefs: character.languageRefs,
    featureRefs: character.featureRefs,
    featRefs: character.featRefs,
    background: character.background,
    alignment: character.alignment,
    description: character.description,
    details: character.details,
    level: character.level,
    abilities: character.abilities,
    abilityModifiers: character.abilityModifiers,
    proficiencyBonus: character.proficiencyBonus,
    savingThrows: character.savingThrows,
    skills: character.skills,
    size: character.size,
    speed: character.speed,
    hitDie: character.hitDie,
    hitDiceRemaining: character.hitDiceRemaining,
    proficiencies: character.proficiencies,
    features: character.features,
    spellcasting: materializeSpellcasting(character),
    hp: character.hp,
    maxHp: character.maxHp,
    ac: character.ac,
    inventory: materializeInventory(character.inventory),
    currency: character.currency,
    gold: character.gold,
    xp: character.xp,
    conditions: character.conditions,
    conditionEffects: character.conditionEffects,
    deathSaveSuccesses: character.deathSaveSuccesses,
    deathSaveFailures: character.deathSaveFailures,
    derived: {
      initiative: character.abilityModifiers.dex,
      passivePerception: 10 + (character.skills.perception?.bonus ?? character.abilityModifiers.wis),
      carryWeight,
      carryCapacity: carryLimit,
      encumbered: carryWeight > carryLimit,
      currencyBreakdown: currencyBreakdown(character.currency.copper),
      savingThrowProficiencies: referencedClass && character.classRef && referencedClass.packHash === character.classRef.packHash
        ? referencedClass.profile?.savingThrows ?? []
        : [],
    },
    sourceDetails: materializeCharacterSourceDetails(character),
  };
}

function combatData(combat: EngineCombat): EngineCombatView {
  return {
    status: combat.status,
    encounterId: combat.encounterId,
    encounterName: combat.encounterName,
    round: combat.round,
    activeActorId: combat.activeActorId,
    actionUsed: combat.actionUsed,
    bonusActionUsed: combat.bonusActionUsed,
    reactionUsed: combat.reactionUsed,
    enemies: materializeCombatants(combat.enemies),
    lootClaimed: combat.lootClaimed,
    lastAction: combat.lastAction,
  };
}

function findLiveCombatant(combat: EngineCombat, targetId?: string): EngineCombatant | null {
  if (targetId) return combat.enemies.find((enemy) => enemy.id === targetId && enemy.alive) ?? null;
  return combat.enemies.find((enemy) => enemy.alive) ?? null;
}

function firstLiveCombatantId(combat: EngineCombat): string | null {
  return combat.enemies.find((combatant) => combatant.alive)?.id ?? null;
}

function nextLiveCombatantId(combat: EngineCombat, currentId: string): string | null {
  const currentIndex = combat.enemies.findIndex((combatant) => combatant.id === currentId);
  if (currentIndex < 0) return firstLiveCombatantId(combat);
  return combat.enemies.slice(currentIndex + 1).find((combatant) => combatant.alive)?.id ?? null;
}

function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function signed(value: number): string {
  return value >= 0 ? "+ " + value : "- " + Math.abs(value);
}

function addCondition(conditions: string[], condition: string): string[] {
  return conditions.includes(condition) ? conditions : [...conditions, condition];
}

function removeCondition(conditions: string[], condition: string): string[] {
  return conditions.filter((candidate) => candidate !== condition);
}

function messageKindForOutcome(outcome: string): EngineMessage["kind"] {
  if (outcome.includes("check") || outcome.includes("social") || outcome === "success" || outcome === "failure" || outcome.includes("save")) return "roll";
  return "narration";
}

function makeMessage(kind: EngineMessage["kind"], text: string): EngineMessage {
  return { id: randomUUID(), kind, text, createdAt: new Date().toISOString() };
}

function rulesNarration(text: string, suggestedActions: Array<{ id: string; label: string }> = []): NarrationEnvelope {
  return { text, proposedFacts: [], suggestedActions };
}
