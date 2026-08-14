import { randomUUID } from "node:crypto";
import { createInitialCampaign, hydrateCharacter, toSessionView } from "./engine-domain.js";
import { abilityModifier, buildSavingThrows, buildSkillSheet, open5eCharacterContentKey, open5eClassSourceKey, OPEN5E_RULES_PACK_HASH, OPEN5E_RULES_VERSION } from "./open5e-rules.js";
import {
  engineCampaignProfileSchema,
  engineCharacterDetailsSchema,
  type EngineCampaignCreate,
  type EngineCampaignDeletionResult,
  type EngineCampaignProfile,
  type EngineAbility,
  type EngineCharacterDetails,
  type EngineContentReference,
  type EngineInventoryItem,
  type EngineItemKind,
  type EngineNote,
  type EngineSessionView,
  type EngineToolCallRequest,
  type EngineToolResult,
  type LanternCampaignState,
} from "./engine-contracts.js";
import type { ReferenceEngineClient } from "./reference-engine-client.js";
import type { TenantIdentity } from "./reference-engine-tenant.js";
import { ReferenceEngineStore, type ReferenceEngineRouting } from "./reference-engine-store.js";

/**
 * ADR-H13 override (accepted 2026-08-11): routes real campaigns to the
 * mnehmos-rpg-mcp reference engine for A/B comparison against lantern-engine.
 * This adapter is the ONLY caller of the reference engine — it never accepts
 * a client-supplied reference-engine ID, and always resolves worldId/partyId/
 * characterId through ReferenceEngineStore, never through the reference
 * engine's own "pick the first thing in the database" fallback. See
 * docs/ADR-H13-reference-engine-boundary.md and docs/REFERENCE-ENGINE.md for
 * why that matters (the reference engine's SQLite layer has no tenant
 * scoping at all).
 *
 * The reference engine has no concept of Lantern's campaign/session-view
 * contract (characterCreation state machine, runtimeContent, proceduralNotices,
 * quests, scene, orchestration, etc.) — all Lantern-specific. Rather than
 * hand-rolling a parallel projection, this adapter builds a real
 * LanternCampaignState via createInitialCampaign() and overlays only the
 * fields that have a genuine reference-engine equivalent (character stats,
 * player notes), then reuses toSessionView() for the exact shape the UI
 * already expects. Character sheet fidelity is intentionally partial: the
 * reference engine doesn't validate class/race against Open5e SRD content
 * packs or compute skills/proficiencies/spellcasting, so those stay at
 * createInitialCampaign's unconfigured defaults — only name, species,
 * class, level, ability scores (+ standard-formula modifiers), hp/maxHp,
 * ac, and gold are overlaid from real reference-engine data.
 */

export class ReferenceEngineNotRoutedError extends Error {
  public constructor(campaignId: string) {
    super(`Campaign ${campaignId} is not routed to the reference backend.`);
    this.name = "ReferenceEngineNotRoutedError";
  }
}

export class ReferenceEngineUnsupportedError extends Error {
  public constructor(feature: string) {
    super(`"${feature}" has no equivalent on the reference-engine backend.`);
    this.name = "ReferenceEngineUnsupportedError";
  }
}

interface ReferenceCharacterRecord {
  id: string;
  name: string;
  race: string;
  characterClass: string;
  stats: Record<"str" | "dex" | "con" | "int" | "wis" | "cha", number>;
  hp: number;
  maxHp: number;
  ac: number;
  level: number;
  xp: number;
  currency?: { gold?: number; silver?: number; copper?: number };
  background?: string;
  alignment?: string;
  skillProficiencies?: string[];
  saveProficiencies?: string[];
  expertise?: string[];
  armorProficiencies?: string[];
  weaponProficiencies?: string[];
  toolProficiencies?: string[];
  languages?: string[];
}

interface ReferenceNoteRecord {
  id: string;
  content: string;
  visibility: "dm_only" | "player_visible";
  createdAt: string;
}

interface ReferenceInventoryEntry {
  item: {
    id: string;
    name: string;
    description?: string;
    type: string;
    weight: number;
    value?: number;
    properties?: { damage?: string; damageType?: string; ac?: number; acBonus?: number };
  };
  quantity: number;
  equipped: boolean;
  slot?: string;
}

const REFERENCE_EQUIPMENT_SLOTS = new Set<NonNullable<EngineInventoryItem["slot"]>>([
  "mainhand", "offhand", "armor", "head", "feet", "accessory",
]);

/**
 * The reference engine stores `slot` as current equip state, so carried items
 * normally have no slot. Lantern's inventory UI also uses the field as the
 * slot to request when the player clicks Equip. Derive that affordance from
 * authoritative item metadata while preserving a valid engine-provided slot.
 */
function referenceInventorySlot(entry: ReferenceInventoryEntry): EngineInventoryItem["slot"] {
  if (entry.slot && REFERENCE_EQUIPMENT_SLOTS.has(entry.slot as NonNullable<EngineInventoryItem["slot"]>)) {
    return entry.slot as NonNullable<EngineInventoryItem["slot"]>;
  }
  if (entry.item.type === "weapon") return "mainhand";
  if (entry.item.type === "armor") {
    return typeof entry.item.properties?.acBonus === "number" ? "offhand" : "armor";
  }
  return undefined;
}

const REFERENCE_ITEM_KINDS = new Set<EngineItemKind>([
  "weapon", "armor", "consumable", "quest", "misc", "tool", "ammunition", "treasure",
]);

/** Maps the reference engine's raw inventory_manage.get_detailed items onto Lantern's "authored" (non-Open5e) inventory item shape. */
function mapReferenceInventory(entries: ReferenceInventoryEntry[]): EngineInventoryItem[] {
  return entries.map((entry) => {
    const kind: EngineItemKind = REFERENCE_ITEM_KINDS.has(entry.item.type as EngineItemKind)
      ? (entry.item.type as EngineItemKind)
      : "misc";
    return {
      id: entry.item.id,
      quantity: entry.quantity,
      equipped: entry.equipped,
      slot: referenceInventorySlot(entry),
      authoredDefinition: {
        name: entry.item.name,
        kind,
        weight: entry.item.weight,
        description: entry.item.description,
        damage: entry.item.properties?.damage,
        armorClass: entry.item.properties?.ac ?? entry.item.properties?.acBonus,
      },
    };
  });
}

/**
 * Resolves a plain class/species name string (e.g. "warlock", "human") to a
 * Lantern content-kernel reference, so hydrateCharacter() uses the real SRD
 * data for any of the 12 classes instead of the 4-class OPEN5E_CLASS_PRESETS
 * fallback. Returns null for an unrecognized/homebrew name — the reference
 * engine accepts free-form class/race strings, so this must degrade
 * gracefully rather than throw.
 */
function resolveContentRef(kind: "class" | "species", name: string): EngineContentReference | null {
  try {
    const normalizedName = name.trim().toLocaleLowerCase("en-US").replace(/^srd[-_:]/, "");
    const sourceKey =
      kind === "class" ? open5eClassSourceKey(normalizedName) : `srd_${normalizedName.replaceAll(" ", "-")}`;
    return { contentKey: open5eCharacterContentKey(kind, sourceKey), packHash: OPEN5E_RULES_PACK_HASH };
  } catch {
    return null;
  }
}

function referenceCurrencyToCopper(currency: ReferenceCharacterRecord["currency"]): number {
  if (!currency) return 0;
  if (currency.gold !== undefined || currency.silver !== undefined) {
    return Math.max(0, Math.trunc(currency.gold ?? 0)) * 100
      + Math.max(0, Math.trunc(currency.silver ?? 0)) * 10
      + Math.max(0, Math.trunc(currency.copper ?? 0));
  }
  // Legacy reference records stored total copper under currency.copper.
  return Math.max(0, Math.trunc(currency.copper ?? 0));
}


/**
 * Minimal frontmatter parser for LLM-authored dockets: a leading `---`
 * fenced block of `key: value` lines, where a value of `|` starts an
 * indented block-scalar (for long prose fields like backstory). No external
 * YAML dependency — this only needs to round-trip the narrow subset the DM
 * system prompt instructs the model to produce, and every parsed field is
 * re-validated against a strict Zod schema before use, so a malformed or
 * hostile block degrades to "field ignored," never a parse crash or an
 * unbounded field.
 */
function parseFrontmatter(content: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match) return {};
  const lines = match[1].split(/\r?\n/);
  const result: Record<string, string> = {};
  let blockKey: string | null = null;
  let blockLines: string[] = [];

  const flushBlock = () => {
    if (blockKey) result[blockKey] = blockLines.join("\n").trim();
    blockKey = null;
    blockLines = [];
  };

  for (const line of lines) {
    if (blockKey) {
      if (line.trim() === "") {
        blockLines.push("");
        continue;
      }
      if (/^\s/.test(line)) {
        blockLines.push(line.replace(/^ {1,4}/, ""));
        continue;
      }
      flushBlock();
    }
    const keyMatch = /^([a-zA-Z][\w-]*):[ \t]?(.*)$/.exec(line);
    if (!keyMatch) continue;
    const [, key, rest] = keyMatch;
    if (rest.trim() === "|") {
      blockKey = key;
      blockLines = [];
      continue;
    }
    result[key] = rest.trim().replace(/^["']|["']$/g, "");
  }
  flushBlock();
  return result;
}

/**
 * Narrative-only: bounded by engineCharacterDetailsSchema.partial(), which
 * has no hp/ac/abilities/inventory fields, so there is no field name a
 * PLAYER.md docket could set that would touch mechanical character state —
 * that's enforced by the schema shape itself, not by a denylist here.
 */
// The only frontmatter keys this docket honors — prose/narrative only, never
// hp/ac/abilities/inventory/etc. Unknown keys (whether hostile or just typos)
// are silently dropped here, before the field even reaches Zod, so one bad
// key can never zero out the rest of an otherwise-valid docket the way a
// single atomic .safeParse() over the whole object would.
const PLAYER_DETAIL_STRING_FIELDS = [
  "playerName", "age", "height", "weight", "eyes", "skin", "hair",
  "personalityTraits", "ideals", "bonds", "flaws", "appearance",
  "backstory", "allies", "factionName", "treasure",
] as const;

export function parsePlayerDocket(content: string): {
  details: Partial<EngineCharacterDetails>;
  background?: string;
  alignment?: string;
  description?: string;
} {
  const fields = parseFrontmatter(content);
  const details: Partial<EngineCharacterDetails> = {};
  for (const key of PLAYER_DETAIL_STRING_FIELDS) {
    if (typeof fields[key] !== "string") continue;
    const fieldSchema = engineCharacterDetailsSchema.shape[key];
    const parsed = fieldSchema.safeParse(fields[key]);
    if (parsed.success) (details as Record<string, unknown>)[key] = parsed.data;
  }
  return {
    details,
    background: typeof fields.background === "string" ? fields.background.slice(0, 120) : undefined,
    alignment: typeof fields.alignment === "string" ? fields.alignment.slice(0, 80) : undefined,
    description: typeof fields.description === "string" ? fields.description.slice(0, 2_000) : undefined,
  };
}

const CAMPAIGN_STRING_FIELDS = ["name", "premise", "setting", "tone"] as const;

export function parseCampaignDocket(content: string): Partial<EngineCampaignProfile> {
  const fields = parseFrontmatter(content);
  const profile: Partial<EngineCampaignProfile> = {};
  for (const key of CAMPAIGN_STRING_FIELDS) {
    if (typeof fields[key] !== "string") continue;
    const parsed = engineCampaignProfileSchema.shape[key].safeParse(fields[key]);
    if (parsed.success) profile[key] = parsed.data;
  }
  return profile;
}

function blockScalarLines(key: string, value: string): string[] {
  return [`${key}: |`, ...value.split("\n").map((line) => `  ${line}`)];
}

/** Inverse of parsePlayerDocket — produces frontmatter it can re-parse exactly. */
export function serializePlayerDocket(data: {
  details: Partial<EngineCharacterDetails>;
  background?: string;
  alignment?: string;
  description?: string;
}): string {
  const lines: string[] = ["---"];
  if (data.background) lines.push(`background: ${data.background}`);
  if (data.alignment) lines.push(`alignment: ${data.alignment}`);
  if (data.description) lines.push(...blockScalarLines("description", data.description));
  for (const key of PLAYER_DETAIL_STRING_FIELDS) {
    const value = data.details[key];
    if (typeof value === "string" && value) lines.push(...blockScalarLines(key, value));
  }
  lines.push("---");
  return lines.join("\n");
}

export class ReferenceEngineAdapter {
  public constructor(
    private readonly client: ReferenceEngineClient,
    private readonly store: ReferenceEngineStore
  ) {}

  public async createCampaign(
    accountId: string,
    actorId: string,
    campaign: EngineCampaignCreate = {
      name: "Unnamed Campaign",
      premise: "A new world is waiting for you to decide what matters.",
      setting: "Open fantasy",
      tone: "Adventurous",
    }
  ): Promise<{ campaign: EngineSessionView }> {
    const campaignId = randomUUID();
    await this.ensureReferenceSession(accountId, campaignId, campaign);
    return this.getCampaign(accountId, actorId, campaignId);
  }

  /**
   * Routes campaignId to the reference backend, bootstrapping a new
   * reference-engine world+party if one isn't already recorded. Used both by
   * createCampaign (always a fresh campaignId) and by the engine-backend
   * switch route (an existing campaignId that may already have one).
   */
  /**
   * The tenant an outbound engine call acts for.
   *
   * accountId/campaignId come from the authenticated request, and worldId/
   * partyId from this store's routing row — never from request arguments. The
   * routing row is the only binding between a Lantern account and a set of
   * reference-engine IDs, so it stays the sole authority for that mapping.
   */
  private tenantFor(
    accountId: string,
    campaignId: string,
    routing?: ReferenceEngineRouting | null
  ): TenantIdentity {
    return {
      accountId,
      campaignId,
      worldId: routing?.referenceWorldId ?? undefined,
      partyId: routing?.referencePartyId ?? undefined,
    };
  }

  public async ensureReferenceSession(
    accountId: string,
    campaignId: string,
    profile?: EngineCampaignCreate
  ): Promise<void> {
    const existing = this.store.getRouting(accountId, campaignId);
    this.store.setBackend(accountId, campaignId, "reference");
    if (profile) this.store.setCampaignProfile(accountId, campaignId, profile);
    if (existing?.referenceWorldId) return;

    const name = profile?.name ?? "Unnamed Campaign";
    const init = await this.client.callTool("session_manage", {
      action: "initialize",
      createNew: true,
      worldName: `${name} World`,
      partyName: `${name} Party`,
    }, this.tenantFor(accountId, campaignId, existing));
    const initData = init.payload as { worldId: string; partyId: string };
    this.store.setReferenceIds(accountId, campaignId, {
      worldId: initData.worldId,
      partyId: initData.partyId,
    });
  }

  public async listCampaigns(accountId: string, _actorId: string): Promise<EngineSessionView[]> {
    const rows = this.store.listForUser(accountId).filter((row) => row.routing.backend === "reference");
    const views = await Promise.all(
      rows.map((row) => this.buildSessionView(accountId, accountId, row.campaignId, row.routing))
    );
    return views;
  }

  public async getCampaign(
    accountId: string,
    actorId: string,
    campaignId: string
  ): Promise<{ campaign: EngineSessionView; dockets: Partial<Record<"state" | "npcs" | "journal" | "campaign", string>> }> {
    const routing = this.requireRouting(accountId, campaignId);
    const view = await this.buildSessionView(accountId, actorId, campaignId, routing);
    // Player docket is folded into `campaign.character` above; secrets are
    // excluded by listDockets' default — never send them to the client.
    const allDockets = this.store.listDockets(accountId, campaignId);
    const { player: _player, secrets: _secrets, ...dockets } = allDockets;
    return { campaign: view, dockets };
  }

  public async deleteCampaign(accountId: string, campaignId: string): Promise<EngineCampaignDeletionResult> {
    const routing = this.requireRouting(accountId, campaignId);

    // Erase the engine-side game state before dropping the routing row. Doing
    // it in this order matters: the routing row is the only record that this
    // account owns this campaign, so losing it first would leave an orphaned
    // database with no way to attribute — or erase — it.
    //
    // A failure here is logged rather than thrown. The user asked to delete a
    // campaign; refusing because the engine was briefly unreachable would
    // leave them unable to remove it at all, and the routing row is what makes
    // the campaign reachable.
    try {
      await this.client.deleteCampaignData(this.tenantFor(accountId, campaignId, routing));
    } catch (error) {
      console.error(
        `Failed to erase reference-engine data for campaign ${campaignId}:`,
        error instanceof Error ? error.message : error
      );
    }

    this.store.deleteRouting(accountId, campaignId);
    return {
      deleted: true,
      campaignId,
      previousVersion: routing.version,
      deletedCommands: 0,
      deletedEvents: 0,
      deletedAt: new Date().toISOString(),
    };
  }

  public async executeToolCall(
    accountId: string,
    actorId: string,
    campaignId: string,
    request: EngineToolCallRequest
  ): Promise<EngineToolResult> {
    const routing = this.requireRouting(accountId, campaignId);

    switch (request.toolName) {
      case "character_create":
        return this.characterCreate(accountId, actorId, campaignId, routing, request);
      case "equip_item":
        return this.inventoryAction(accountId, actorId, campaignId, routing, "equip", request);
      case "unequip_item":
        return this.inventoryAction(accountId, actorId, campaignId, routing, "unequip", request);
      case "use_item":
        return this.inventoryAction(accountId, actorId, campaignId, routing, "use", request);
      case "drop_item":
        return this.inventoryAction(accountId, actorId, campaignId, routing, "remove", request);
      case "player_note_add":
        return this.playerNoteAdd(accountId, actorId, campaignId, routing, request);
      default:
        return {
          tool: request.toolName,
          readOnly: true,
          accepted: false,
          code: "unsupported_on_reference_backend",
          message: `"${request.toolName}" has no equivalent on the reference-engine backend.`,
          data: null,
          campaignVersion: routing.version,
        };
    }
  }

  private async characterCreate(
    accountId: string,
    actorId: string,
    campaignId: string,
    routing: ReferenceEngineRouting,
    request: EngineToolCallRequest
  ): Promise<EngineToolResult> {
    const args = request.arguments as {
      name: string;
      species?: string;
      className?: string;
      background?: string;
      alignment?: string;
      abilityScores?: Record<string, number>;
      skillProficiencies?: string[];
      saveProficiencies?: string[];
      expertise?: string[];
      armorProficiencies?: string[];
      weaponProficiencies?: string[];
      toolProficiencies?: string[];
      languages?: string[];
    };
    const result = await this.client.callTool("character_manage", {
      action: "create",
      name: args.name,
      race: args.species ?? "human",
      class: args.className ?? "fighter",
      background: args.background,
      alignment: args.alignment,
      characterType: "pc",
      stats: args.abilityScores,
      skillProficiencies: args.skillProficiencies,
      saveProficiencies: args.saveProficiencies,
      expertise: args.expertise,
      armorProficiencies: args.armorProficiencies,
      weaponProficiencies: args.weaponProficiencies,
      toolProficiencies: args.toolProficiencies,
      languages: args.languages,
    }, this.tenantFor(accountId, campaignId, routing));
    const character = result.payload as ReferenceCharacterRecord;
    this.store.setReferenceIds(accountId, campaignId, { characterId: character.id });

    if (routing.referencePartyId) {
      await this.client.callTool("party_manage", {
        action: "add_member",
        partyId: routing.referencePartyId,
        characterId: character.id,
        role: "leader",
      }, this.tenantFor(accountId, campaignId, routing));
    }

    const version = this.store.bumpVersion(accountId, campaignId);
    const view = await this.buildSessionView(accountId, actorId, campaignId, {
      ...routing,
      referenceCharacterId: character.id,
      version,
    });
    return {
      tool: "character_create",
      readOnly: false,
      accepted: true,
      code: null,
      message: `Created ${character.name}.`,
      data: { character: view.character },
      campaignVersion: version,
    };
  }

  private async inventoryAction(
    accountId: string,
    _actorId: string,
    campaignId: string,
    routing: ReferenceEngineRouting,
    action: "equip" | "unequip" | "use" | "remove",
    request: EngineToolCallRequest
  ): Promise<EngineToolResult> {
    if (!routing.referenceCharacterId) {
      return {
        tool: request.toolName,
        readOnly: false,
        accepted: false,
        code: "no_character",
        message: "Create a character before managing inventory.",
        data: null,
        campaignVersion: routing.version,
      };
    }
    const args = request.arguments as { itemId: string; slot?: string; quantity?: number };
    const result = await this.client.callTool("inventory_manage", {
      action,
      characterId: routing.referenceCharacterId,
      itemId: args.itemId,
      slot: args.slot,
      quantity: args.quantity,
    }, this.tenantFor(accountId, campaignId, routing));
    const version = this.store.bumpVersion(accountId, campaignId);
    return {
      tool: request.toolName,
      readOnly: false,
      accepted: !result.isError,
      code: result.isError ? "reference_engine_error" : null,
      message: result.text || `${action} completed.`,
      data: result.payload,
      campaignVersion: version,
    };
  }

  private async playerNoteAdd(
    accountId: string,
    actorId: string,
    campaignId: string,
    routing: ReferenceEngineRouting,
    request: EngineToolCallRequest
  ): Promise<EngineToolResult> {
    if (!routing.referenceWorldId) throw new ReferenceEngineUnsupportedError("player_note_add");
    const args = request.arguments as { text: string; source?: "player" | "dm" };
    await this.client.callTool("narrative_manage", {
      action: "add",
      worldId: routing.referenceWorldId,
      type: "session_log",
      content: args.text,
      visibility: args.source === "dm" ? "dm_only" : "player_visible",
    }, this.tenantFor(accountId, campaignId, routing));
    const version = this.store.bumpVersion(accountId, campaignId);
    const view = await this.buildSessionView(accountId, actorId, campaignId, { ...routing, version });
    return {
      tool: "player_note_add",
      readOnly: false,
      accepted: true,
      code: null,
      message: "Note added.",
      data: { playerNotes: view.playerNotes },
      campaignVersion: version,
    };
  }

  /**
   * Backs PATCH /api/campaigns/:id/character for the reference backend.
   * background/alignment/name are real mechanical fields the reference
   * engine itself stores — confirmed live that character_manage.update
   * accepts them — so those go through the tool, not a docket. The
   * free-text fields (details.* and description) have no engine-side home and
   * are merged into the player docket, reusing parsePlayerDocket so a save
   * round-trips through the exact same parser buildState() already uses.
   */
  public async updateCharacterDetails(
    accountId: string,
    actorId: string,
    campaignId: string,
    update: {
      name?: string;
      background?: string;
      alignment?: string;
      description?: string;
      details?: Partial<EngineCharacterDetails>;
    }
  ): Promise<{ campaign: EngineSessionView; dockets: Partial<Record<"state" | "npcs" | "journal" | "campaign", string>> }> {
    const routing = this.requireRouting(accountId, campaignId);
    if (!routing.referenceCharacterId) throw new ReferenceEngineUnsupportedError("character_update");

    if (update.name || update.background || update.alignment) {
      await this.client.callTool("character_manage", {
        action: "update",
        characterId: routing.referenceCharacterId,
        name: update.name,
        background: update.background,
        alignment: update.alignment,
      }, this.tenantFor(accountId, campaignId, routing));
    }

    if (update.description !== undefined || update.details) {
      const existing = parsePlayerDocket(this.store.getDocket(accountId, campaignId, "player"));
      this.store.setDocket(
        accountId,
        campaignId,
        "player",
        serializePlayerDocket({
          details: { ...existing.details, ...update.details },
          background: update.background ?? existing.background,
          alignment: update.alignment ?? existing.alignment,
          description: update.description ?? existing.description,
        })
      );
    }

    this.store.bumpVersion(accountId, campaignId);
    return this.getCampaign(accountId, actorId, campaignId);
  }

  private async buildSessionView(
    accountId: string,
    actorId: string,
    campaignId: string,
    routing: ReferenceEngineRouting
  ): Promise<EngineSessionView> {
    const state = await this.buildState(accountId, actorId, campaignId, routing);
    return toSessionView(state);
  }

  private async buildState(
    accountId: string,
    actorId: string,
    campaignId: string,
    routing: ReferenceEngineRouting
  ): Promise<LanternCampaignState> {
    const profile = (routing.campaignProfileJson
      ? JSON.parse(routing.campaignProfileJson)
      : undefined) as EngineCampaignCreate | undefined;
    // Rehydrate the content policy chosen at creation. Omitting it here falls
    // back to defaultContentPolicy(), so a campaign created with non-default
    // sources or licenses silently reverted to the defaults on every read —
    // attribution and mechanics would then disagree with what the player
    // actually picked.
    const state = createInitialCampaign(
      accountId,
      actorId,
      campaignId as ReturnType<typeof randomUUID>,
      profile,
      OPEN5E_RULES_VERSION,
      profile?.contentPolicy
    );
    state.version = routing.version;


    if (routing.referenceCharacterId) {
      const result = await this.client.callTool("character_manage", {
        action: "get",
        characterId: routing.referenceCharacterId,
      }, this.tenantFor(accountId, campaignId, routing));
      const character = result.payload as ReferenceCharacterRecord;
      const referenceCurrencyCopper = referenceCurrencyToCopper(character.currency);
      state.character = {
        ...state.character,
        id: character.id,
        created: true,
        name: character.name,
        species: character.race,
        className: character.characterClass,
        level: character.level,
        abilities: character.stats,
        abilityModifiers: {
          str: abilityModifier(character.stats.str),
          dex: abilityModifier(character.stats.dex),
          con: abilityModifier(character.stats.con),
          int: abilityModifier(character.stats.int),
          wis: abilityModifier(character.stats.wis),
          cha: abilityModifier(character.stats.cha),
        },
        hp: character.hp,
        maxHp: character.maxHp,
        ac: character.ac,
        xp: character.xp,
        currency: { copper: referenceCurrencyCopper },
        gold: Math.floor(referenceCurrencyCopper / 100),
        background: character.background ?? state.character.background,
        alignment: character.alignment ?? state.character.alignment,
      };
      state.character.skills = buildSkillSheet(
        state.character.abilities,
        character.skillProficiencies ?? [],
        character.level,
        character.expertise ?? []
      );

      const inventoryResult = await this.client.callTool("inventory_manage", {
        action: "get_detailed",
        characterId: routing.referenceCharacterId,
      }, this.tenantFor(accountId, campaignId, routing));
      const inventoryPayload = inventoryResult.payload as { inventory?: ReferenceInventoryEntry[] };
      state.character.inventory = mapReferenceInventory(inventoryPayload?.inventory ?? []);

      state.character.classRef = resolveContentRef("class", character.characterClass);
      state.character.speciesRef = resolveContentRef("species", character.race);

      // hydrateCharacter only fills hitDie/size/speed/proficiencies when
      // they're unset, and features when the array is empty — but the
      // createInitialCampaign shell always pre-fills these with fighter/
      // human defaults, so those guards would otherwise silently keep the
      // wrong class/species data instead of deriving it from classRef/
      // speciesRef. Clear them first so hydrateCharacter treats them as
      // genuinely unset.
      const clearable = state.character as unknown as {
        hitDie?: number;
        size?: string;
        speed?: number;
        proficiencies?: unknown;
      };
      clearable.hitDie = undefined;
      clearable.size = undefined;
      clearable.speed = undefined;
      const hasReferenceProficiencyData = Boolean(
        (character.armorProficiencies?.length ?? 0)
        || (character.weaponProficiencies?.length ?? 0)
        || (character.toolProficiencies?.length ?? 0)
        || (character.languages?.length ?? 0)
      );
      clearable.proficiencies = hasReferenceProficiencyData
        ? {
            armor: character.armorProficiencies ?? [],
            weapons: character.weaponProficiencies ?? [],
            tools: character.toolProficiencies ?? [],
            languages: character.languages ?? [],
          }
        : undefined;
      state.character.features = [];

      // hydrateCharacter derives saves/skills/proficiencyBonus/size/speed/
      // hitDie/proficiencies/features/spellcasting from classRef/speciesRef
      // (real SRD kernel data for any of the 12 classes once those refs are
      // set — see engine-domain.ts:17193). It also recomputes ac from
      // equipped armor and can backfill hp/maxHp, but those three are
      // reference-engine authoritative combat state — never let a locally
      // recomputed value replace what character_manage actually returned.
      const authoritativeAc = state.character.ac;
      const authoritativeHp = state.character.hp;
      const authoritativeMaxHp = state.character.maxHp;
      state.character = hydrateCharacter(state.character);
      if (character.saveProficiencies?.length) {
        state.character.savingThrows = buildSavingThrows(
          state.character.abilities,
          character.saveProficiencies as EngineAbility[],
          state.character.level
        );
      }
      if (hasReferenceProficiencyData) {
        state.character.proficiencies = {
          armor: character.armorProficiencies ?? [],
          weapons: character.weaponProficiencies ?? [],
          tools: character.toolProficiencies ?? [],
          languages: character.languages ?? [],
        };
      }
      state.character.ac = authoritativeAc;
      state.character.hp = authoritativeHp;
      state.character.maxHp = authoritativeMaxHp;

      state.phase = "sandbox";
    }

    // Narrative-only overlay from LLM-authored dockets (never touches hp/ac/
    // abilities/inventory — those come only from character_manage above).
    const playerDocket = this.store.getDocket(accountId, campaignId, "player");
    if (playerDocket) {
      const parsed = parsePlayerDocket(playerDocket);
      state.character = {
        ...state.character,
        details: { ...state.character.details, ...parsed.details },
        // background/alignment are NOT taken from the docket here — they're
        // real mechanical fields character_manage now tracks (set above),
        // which is authoritative. The docket's background/alignment fields
        // exist only so updateCharacterDetails can merge a partial save
        // without losing whatever was there before writing back to the
        // docket; they're not read back into the rendered character.
        description: parsed.description ?? state.character.description,
      };
    }
    const campaignDocket = this.store.getDocket(accountId, campaignId, "campaign");
    if (campaignDocket) {
      const parsed = parseCampaignDocket(campaignDocket);
      state.campaign = { ...state.campaign, ...parsed };
    }

    if (routing.referenceWorldId) {
      const result = await this.client.callTool("narrative_manage", {
        action: "search",
        worldId: routing.referenceWorldId,
        type: "session_log",
        limit: 40,
      }, this.tenantFor(accountId, campaignId, routing));
      const payload = result.payload as { notes?: ReferenceNoteRecord[] };
      const notes: EngineNote[] = (payload?.notes ?? []).map((note) => ({
        id: note.id,
        text: note.content,
        source: note.visibility === "dm_only" ? "dm" : "player",
        createdAt: note.createdAt,
      }));
      state.playerNotes = notes;
    }

    const storedLog = this.store.getLogMessages(accountId, campaignId);
    if (storedLog.length > 0) state.log = storedLog;

    return state;
  }

  private requireRouting(accountId: string, campaignId: string): ReferenceEngineRouting {
    const routing = this.store.getRouting(accountId, campaignId);
    if (!routing || routing.backend !== "reference") throw new ReferenceEngineNotRoutedError(campaignId);
    return routing;
  }
}
