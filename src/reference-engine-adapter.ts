import { randomUUID } from "node:crypto";
import { createInitialCampaign, hydrateCharacter, toSessionView } from "./engine-domain.js";
import {
  abilityModifier,
  buildSavingThrows,
  buildSkillSheet,
  getOpen5eSpell,
  getOpen5eSpellList,
  getOpen5eSpellProgression,
  open5eSpellOptions,
  open5eCharacterContentKey,
  open5eClassSourceKey,
  OPEN5E_RULES_PACK_HASH,
  OPEN5E_RULES_VERSION,
} from "./open5e-rules.js";
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
  type EnginePartyState,
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
 * scene, orchestration, etc.) — all Lantern-specific. Its assigned quest log
 * is a genuine equivalent, so that narrow projection is imported below rather
 * than replaced with the starter tutorial shell. Rather than
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
  knownSpells?: string[];
  preparedSpells?: string[];
  cantripsKnown?: string[];
  spellSlots?: Record<string, { current?: number; max?: number }>;
  pactMagicSlots?: { current?: number; max?: number; slotLevel?: number };
}

interface ReferenceNoteRecord {
  id: string;
  content: string;
  visibility: "dm_only" | "player_visible";
  createdAt: string;
}

interface ReferenceQuestObjectiveRecord {
  id: string;
  description: string;
  type?: string;
  current?: number;
  required?: number;
  completed?: boolean;
}

interface ReferenceQuestRecord {
  id: string;
  name: string;
  description?: string;
  status?: string;
  giver?: string;
  objectives?: ReferenceQuestObjectiveRecord[];
  rewards?: {
    experience?: number;
    xp?: number;
    gold?: number;
  };
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

interface ReferencePartyMemberRecord {
  characterId?: unknown;
  role?: unknown;
  joinedAt?: unknown;
}

interface ReferencePartyRecord {
  id?: unknown;
  currentLocation?: unknown;
  currentPOI?: unknown;
  members?: unknown;
  leader?: unknown;
  activeCharacter?: unknown;
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

function mapReferenceQuests(entries: unknown): import("./engine-contracts.js").EngineQuest[] {
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry): import("./engine-contracts.js").EngineQuest[] => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as ReferenceQuestRecord;
    if (!raw.id || !raw.name) return [];
    const objectives = Array.isArray(raw.objectives) ? raw.objectives : [];
    const completedUnits = objectives.reduce((total, objective) => {
      const required = Math.max(1, Math.trunc(objective.required ?? 1));
      const current = Math.max(0, Math.min(required, Math.trunc(objective.current ?? (objective.completed ? required : 0))));
      return total + current;
    }, 0);
    const requiredUnits = objectives.reduce((total, objective) => total + Math.max(1, Math.trunc(objective.required ?? 1)), 0);
    const status = raw.status === "completed" || raw.status === "failed" || raw.status === "abandoned" || raw.status === "expired"
      ? raw.status
      : "active";
    const progress = status === "completed"
      ? 100
      : requiredUnits > 0
        ? Math.max(0, Math.min(100, Math.round((completedUnits / requiredUnits) * 100)))
        : 0;
    const objective = objectives.map((candidate) => candidate.description).filter(Boolean).join(" ");
    return [{
      id: raw.id,
      title: raw.name,
      objective: raw.description || objective || "Follow the thread.",
      status,
      reward: {
        xp: Math.max(0, Math.trunc(raw.rewards?.experience ?? raw.rewards?.xp ?? 0)),
        copper: Math.max(0, Math.trunc(raw.rewards?.gold ?? 0)) * 100,
      },
      rewardClaimed: status === "completed",
      progress,
    }];
  });
}

/**
 * The reference engine owns party membership, while the web app still emits
 * Lantern's session-view contract. Project the authoritative party roster at
 * read time so NPC companions survive refreshes and new browser sessions.
 */
function mapReferenceParty(
  payload: unknown,
  state: LanternCampaignState,
  routing: ReferenceEngineRouting,
): EnginePartyState | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const rawPayload = payload as Record<string, unknown>;
  const partyValue = rawPayload.party && typeof rawPayload.party === "object" && !Array.isArray(rawPayload.party)
    ? rawPayload.party
    : rawPayload;
  const party = partyValue as ReferencePartyRecord;
  const id = typeof party.id === "string" ? party.id : routing.referencePartyId;
  if (!id || !Array.isArray(party.members)) return null;

  const rawMembers = party.members
    .filter((member): member is ReferencePartyMemberRecord => Boolean(member && typeof member === "object" && !Array.isArray(member)))
    .map((member) => ({
      characterId: typeof member.characterId === "string" ? member.characterId : null,
      role: member.role === "leader" ? "leader" as const : "companion" as const,
      joinedAt: typeof member.joinedAt === "string" ? member.joinedAt : null,
    }))
    .filter((member): member is { characterId: string; role: "leader" | "companion"; joinedAt: string | null } => Boolean(member.characterId));
  if (rawMembers.length === 0) return null;

  const leaderValue = party.leader && typeof party.leader === "object" && !Array.isArray(party.leader)
    ? party.leader as ReferencePartyMemberRecord
    : null;
  const activeValue = party.activeCharacter && typeof party.activeCharacter === "object" && !Array.isArray(party.activeCharacter)
    ? party.activeCharacter as ReferencePartyMemberRecord
    : null;
  const leaderActorId = typeof leaderValue?.characterId === "string"
    ? leaderValue.characterId
    : rawMembers.find((member) => member.role === "leader")?.characterId
      ?? routing.referenceCharacterId
      ?? rawMembers[0]!.characterId;
  const activeViewpointActorId = typeof activeValue?.characterId === "string"
    ? activeValue.characterId
    : leaderActorId;
  const locationRef = typeof party.currentPOI === "string" && party.currentPOI
    ? party.currentPOI
    : typeof party.currentLocation === "string" && party.currentLocation
      ? party.currentLocation
      : `party:${id}`;
  const controllerActorId = routing.referenceCharacterId ?? leaderActorId;

  return {
    id,
    leaderActorId,
    activeViewpointActorId,
    mode: "together",
    members: rawMembers.map((member) => ({
      actorId: member.characterId,
      role: member.role,
      controllerActorId,
      sceneId: locationRef,
      locationRef,
      joinedAtVersion: routing.version,
    })),
    shared: {
      questIds: state.quests.map((quest) => quest.id),
      // The reference party schema has no shared-wallet field. Do not expose
      // the leader's personal currency as if it were a party balance.
      currency: { copper: 0 },
      container: {
        id: `${id}:shared`,
        name: "Shared party container",
        inventory: [],
      },
    },
    rewardAllocation: "leader-only",
    consent: {
      mode: "single-controller-future-member-seam",
      permanentChoiceRequires: "leader-confirmation",
    },
    revision: routing.version,
  };
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

function normalizeSpellName(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "");
}

/** Convert the reference engine's name-based spell fields into the live UI's
 * pinned Open5e references. Unknown/homebrew values are retained nowhere in
 * the projection; the player can see the engine catalog and choose a valid
 * replacement rather than receiving a silently fake spell. */
function referenceSpellReferences(values: string[] | undefined, className: string): Array<{ contentKey: string; packHash: string }> {
  const list = getOpen5eSpellList(className);
  const references = list?.spells ?? [];
  const seen = new Set<string>();
  const result: Array<{ contentKey: string; packHash: string }> = [];
  for (const value of values ?? []) {
    const raw = value.trim();
    if (!raw) continue;
    const direct = raw.startsWith("open5e:spell:") ? getOpen5eSpell(raw) : null;
    const match = direct ?? references
      .map((reference) => getOpen5eSpell(reference.contentKey))
      .find((spell) => spell && normalizeSpellName(spell.definition.name) === normalizeSpellName(raw));
    if (!match || seen.has(match.contentKey)) continue;
    seen.add(match.contentKey);
    result.push({ contentKey: match.contentKey, packHash: match.packHash });
  }
  return result;
}

function referenceSpellNames(contentKeys: string[]): string[] {
  return contentKeys.map((contentKey) => getOpen5eSpell(contentKey)?.definition.name ?? "")
    .filter((name): name is string => Boolean(name));
}

function referenceSpellSlotCurrents(
  spellSlots: ReferenceCharacterRecord["spellSlots"],
  pactMagicSlots: ReferenceCharacterRecord["pactMagicSlots"],
): Record<string, number> {
  const currents: Record<string, number> = {};
  for (const [key, slot] of Object.entries(spellSlots ?? {})) {
    const level = /^level(\d+)$/i.exec(key)?.[1] ?? key;
    const value = slot?.current ?? slot?.max;
    if (value !== undefined && Number.isFinite(Number(value))) {
      currents[level] = Math.max(0, Math.trunc(Number(value)));
    }
  }
  if (pactMagicSlots?.slotLevel !== undefined && pactMagicSlots.current !== undefined
    && Number.isFinite(Number(pactMagicSlots.current))) {
    currents[String(pactMagicSlots.slotLevel)] = Math.max(0, Math.trunc(Number(pactMagicSlots.current)));
  }
  return currents;
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
      level?: number;
      cantripsKnown?: string[];
      knownSpells?: string[];
      preparedSpells?: string[];
    };
    const result = await this.client.callTool("character_manage", {
      action: "create",
      name: args.name,
      race: args.species ?? "human",
      class: args.className ?? "fighter",
      background: args.background,
      alignment: args.alignment,
      level: args.level ?? 1,
      characterType: "pc",
      stats: args.abilityScores,
      skillProficiencies: args.skillProficiencies,
      saveProficiencies: args.saveProficiencies,
      expertise: args.expertise,
      armorProficiencies: args.armorProficiencies,
      weaponProficiencies: args.weaponProficiencies,
      toolProficiencies: args.toolProficiencies,
      languages: args.languages,
      cantripsKnown: args.cantripsKnown ? referenceSpellNames(args.cantripsKnown) : undefined,
      knownSpells: args.knownSpells ? referenceSpellNames(args.knownSpells) : undefined,
      preparedSpells: args.preparedSpells ? referenceSpellNames(args.preparedSpells) : undefined,
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

  /**
   * Persists player-selected source-backed spells through the reference
   * engine. The engine stores spell names, while the browser and this host
   * use pinned Open5e content keys; only names resolved from the installed
   * class catalog are forwarded.
   */
  public async updateCharacterSpells(
    accountId: string,
    actorId: string,
    campaignId: string,
    update: { cantripsKnown?: string[]; knownSpells?: string[]; preparedSpells?: string[] }
  ): Promise<{ campaign: EngineSessionView; dockets: Partial<Record<"state" | "npcs" | "journal" | "campaign", string>> }> {
    const routing = this.requireRouting(accountId, campaignId);
    if (!routing.referenceCharacterId) throw new ReferenceEngineUnsupportedError("spellbook_update");
    const characterResult = await this.client.callTool("character_manage", {
      action: "get",
      characterId: routing.referenceCharacterId,
    }, this.tenantFor(accountId, campaignId, routing));
    const character = characterResult.payload as ReferenceCharacterRecord;
    const className = character.characterClass;
    const progression = getOpen5eSpellProgression(className);
    const spellOptions = open5eSpellOptions(className, character.level);
    const args: Record<string, unknown> = {
      action: "update",
      characterId: routing.referenceCharacterId,
    };
    if (update.cantripsKnown !== undefined) args.cantripsKnown = referenceSpellNames(update.cantripsKnown);
    if (update.knownSpells !== undefined) args.knownSpells = referenceSpellNames(update.knownSpells);
    if (update.preparedSpells !== undefined) args.preparedSpells = referenceSpellNames(update.preparedSpells);
    if (update.knownSpells !== undefined && progression?.selectionMode === "prepared") {
      throw new ReferenceEngineUnsupportedError("known_spells_for_prepared_class");
    }
    if (update.preparedSpells !== undefined && progression?.selectionMode === "known") {
      throw new ReferenceEngineUnsupportedError("prepared_spells_for_known_class");
    }
    const ability = progression?.spellcastingAbility;
    const abilityModifierValue = ability ? abilityModifier(character.stats[ability]) : 0;
    const preparedCapacity = progression?.preparedFormula
      ? Math.max(
          progression.preparedFormula.minimum,
          Math.floor(
            character.level * progression.preparedFormula.classLevelMultiplier
            + abilityModifierValue * progression.preparedFormula.abilityModifierMultiplier,
          ),
        )
      : null;
    if (update.cantripsKnown !== undefined && spellOptions.cantripLimit !== null
      && update.cantripsKnown.length > spellOptions.cantripLimit) {
      throw new ReferenceEngineUnsupportedError(`cantrip_limit_${spellOptions.cantripLimit}`);
    }
    if (update.knownSpells !== undefined && spellOptions.knownSpellLimit !== null
      && update.knownSpells.length > spellOptions.knownSpellLimit) {
      throw new ReferenceEngineUnsupportedError(`known_spell_limit_${spellOptions.knownSpellLimit}`);
    }
    if (update.preparedSpells !== undefined && preparedCapacity !== null
      && update.preparedSpells.length > preparedCapacity) {
      throw new ReferenceEngineUnsupportedError(`prepared_spell_limit_${preparedCapacity}`);
    }
    // Resolve every submitted key before mutating anything. This keeps an
    // unavailable, unreachable, or foreign spell from being silently dropped by the host.
    const submittedSpellBuckets: Array<{ key: string; bucket: "cantrip" | "levelled" }> = [
      ...(update.cantripsKnown ?? []).map((key) => ({ key, bucket: "cantrip" as const })),
      ...(update.knownSpells ?? []).map((key) => ({ key, bucket: "levelled" as const })),
      ...(update.preparedSpells ?? []).map((key) => ({ key, bucket: "levelled" as const })),
    ];
    for (const { key, bucket } of submittedSpellBuckets) {
      const spell = getOpen5eSpell(key);
      if (!spell
        || !getOpen5eSpellList(className)?.spells.some((reference) => reference.contentKey === key)
        || !spellOptions.spells.some((reference) => reference.contentKey === key)) {
        throw new ReferenceEngineUnsupportedError(`spell ${key}`);
      }
      if (bucket === "cantrip" && spell.definition.level !== 0) {
        throw new ReferenceEngineUnsupportedError(`cantrip_requires_level_0_${key}`);
      }
      if (bucket === "levelled" && spell.definition.level === 0) {
        throw new ReferenceEngineUnsupportedError(`levelled_spell_cannot_be_cantrip_${key}`);
      }
    }
    await this.client.callTool("character_manage", args, this.tenantFor(accountId, campaignId, routing));
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
      if (state.character.spellcasting) {
        const known = referenceSpellReferences(
          [...(character.cantripsKnown ?? []), ...(character.knownSpells ?? [])],
          character.characterClass,
        );
        const prepared = referenceSpellReferences(character.preparedSpells, character.characterClass);
        state.character.spellcasting = {
          ...state.character.spellcasting,
          knownSpells: known,
          preparedSpells: prepared,
        };
        const referenceSlots = referenceSpellSlotCurrents(character.spellSlots, character.pactMagicSlots);
        if (Object.keys(referenceSlots).length > 0) {
          const localSlots = state.character.spellcasting.slots;
          state.character.spellcasting.slots = Object.fromEntries(
            Object.entries(state.character.spellcasting.slotMaximums).map(([level, maximum]) => [
              level,
              referenceSlots[level] === undefined
                ? localSlots[level] ?? maximum
                : Math.max(0, Math.min(maximum, referenceSlots[level])),
            ])
          );
        }
      }
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

      // The reference engine owns the durable quest log. Import the assigned
      // quests into the session projection so the UI does not fall back to the
      // Lantern tutorial quest that exists only in the compatibility shell.
      // A read failure must not make an otherwise readable campaign disappear.
      try {
        const questResult = await this.client.callTool("quest_manage", {
          action: "get_log",
          characterId: routing.referenceCharacterId,
        }, this.tenantFor(accountId, campaignId, routing));
        const questPayload = questResult.payload as { quests?: unknown };
        const quests = mapReferenceQuests(questPayload?.quests);
        // The reference log is authoritative, including an empty result. Do
        // not leave the compatibility shell's starter quest visible when the
        // character has no assigned quests.
        state.quests = quests;
        if (quests.length > 0) {
          state.quest = quests.find((quest) => quest.status === "active") ?? quests[0]!;
        }
      } catch {
        // Keep the shell's starter quest only when the authoritative quest log
        // cannot be read; never synthesize authored quests from narration.
      }

      // Party membership is authoritative in the reference engine too. It is
      // intentionally read independently of the quest log: a stale or
      // unavailable quest projection must not erase a companion roster from
      // the session view. This also makes party state durable across refresh
      // and fresh-browser hydration instead of relying on the last DM reply.
      if (routing.referencePartyId) {
        try {
          const partyResult = await this.client.callTool("party_manage", {
            action: "get",
            partyId: routing.referencePartyId,
          }, this.tenantFor(accountId, campaignId, routing));
          if (!partyResult.isError) {
            const party = mapReferenceParty(partyResult.payload, state, routing);
            if (party) state.party = party;
          }
        } catch {
          // Keep the rest of the campaign readable if the optional party
          // projection is temporarily unavailable.
        }
      }
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
