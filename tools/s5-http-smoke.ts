import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deploymentIdentity } from "../src/deployment-identity.js";

const repositoryRoot = process.cwd();
const probeRoot = await mkdtemp(join(tmpdir(), "rpg-mcp-s9-http-"));
const enginePort = await availablePort();
const webPort = await availablePort();
const internalToken = "s9-local-http-smoke";
const smokeCommitSha = "0123456789abcdef0123456789abcdef01234567";
type DeploymentIdentity = {
  service?: string;
  environment?: string;
  commitSha?: string | null;
  deploymentId?: string | null;
};
const unverifiedIdentity = deploymentIdentity("web", {});
assert(unverifiedIdentity.environment === null && unverifiedIdentity.commitSha === null && unverifiedIdentity.deploymentId === null, "Missing Railway metadata must remain unverified.");
const commonEnvironment = {
  ...process.env,
  NODE_ENV: "development",
  CLERK_PUBLISHABLE_KEY: "",
  CLERK_SECRET_KEY: "",
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
  STRIPE_PRICE_ID: "",
  OPENROUTER_API_KEY: "",
  ENGINE_TIMEOUT_MS: "60000",
  RAILWAY_ENVIRONMENT_NAME: "smoke",
  RAILWAY_GIT_COMMIT_SHA: smokeCommitSha,
};
const engine = startService("engine", "dist/engine-server.js", {
  ...commonEnvironment,
  ENGINE_PORT: String(enginePort),
  ENGINE_DATABASE_PATH: join(probeRoot, "engine.db"),
  ENGINE_INTERNAL_TOKEN: internalToken,
  RAILWAY_DEPLOYMENT_ID: "smoke-engine-deployment",
});
const web = startService("web", "dist/server.js", {
  ...commonEnvironment,
  PORT: String(webPort),
  APP_URL: `http://127.0.0.1:${webPort}`,
  DATABASE_PATH: join(probeRoot, "web.db"),
  DEV_AUTH_BYPASS: "true",
  DEV_USER_ID: "s9-http-player",
  ENGINE_URL: `http://127.0.0.1:${enginePort}`,
  ENGINE_SHARED_SECRET: internalToken,
  RAILWAY_DEPLOYMENT_ID: "smoke-web-deployment",
});

try {
  const webBaseUrl = `http://127.0.0.1:${webPort}`;
  const engineBaseUrl = `http://127.0.0.1:${enginePort}`;
  const health = await waitForHealth(webBaseUrl);
  const webDeployment = health.deployment as DeploymentIdentity;
  assert((health.integrations as { lanternEngine?: boolean }).lanternEngine === true, "Web could not reach the engine.");
  const engineHealth = health.engine as {
    status?: string;
    toolCount?: number;
    rules?: { packVersion?: string; packHash?: string };
    deployment?: DeploymentIdentity;
  };
  const engineDeployment = engineHealth.deployment ?? {};
  assert(JSON.stringify(Object.keys(webDeployment).sort()) === JSON.stringify(["commitSha", "deploymentId", "environment", "service"]), "Web deployment identity exposed an unexpected field.");
  assert(JSON.stringify(Object.keys(engineDeployment).sort()) === JSON.stringify(["commitSha", "deploymentId", "environment", "service"]), "Engine deployment identity exposed an unexpected field.");
  assert(webDeployment.service === "web" && engineDeployment.service === "engine", "Health did not distinguish the web and engine services.");
  assert(webDeployment.environment === "smoke" && engineDeployment.environment === "smoke", "Health did not report the Railway environment.");
  assert(webDeployment.commitSha === smokeCommitSha && engineDeployment.commitSha === smokeCommitSha, "Health did not report the deployed Git SHA.");
  assert(webDeployment.deploymentId === "smoke-web-deployment" && engineDeployment.deploymentId === "smoke-engine-deployment", "Health did not report immutable deployment IDs.");
  assert(engineHealth.status === "ok", "Engine health was not ok.");
  assert(engineHealth.rules?.packVersion === "open5e-v2-full-corpus-s8", "Engine did not boot the S8 corpus pack.");
  assert(engineHealth.rules.packHash === "fbd846cf7b7833560b22f4ebffaf950fb6b2adf62cf9c6fff469266325ac31fa", "Engine booted an unexpected pack hash.");
  assert(engineHealth.toolCount === 75, "Engine tool count drifted.");
  const toolCatalog = await requestJson<{
    tools: Array<{ function: { name: string; parameters: Record<string, unknown> } }>;
  }>(
    `${engineBaseUrl}/v1/tools`,
    { headers: { "x-lantern-engine-token": internalToken } }
  );
  const advertisedToolNames = toolCatalog.tools.map((tool) => tool.function.name);
  assert(advertisedToolNames.length === engineHealth.toolCount, "Health and the advertised tool catalog disagree.");
  assert(new Set(advertisedToolNames).size === advertisedToolNames.length, "The advertised tool catalog contains duplicate names.");
  assert(
    ["experience_profile_update", "experience_feedback_add", "experience_boundary"].every(
      (name) => !advertisedToolNames.includes(name)
    ),
    "A player-only experience command was advertised to the DM."
  );
  const rollCheckParameters = toolCatalog.tools.find(
    (definition) => definition.function.name === "roll_check"
  )?.function.parameters as { properties?: Record<string, { type?: string }> } | undefined;
  assert(
    rollCheckParameters?.properties?.passive?.type === "boolean",
    "The roll_check catalog omitted the runtime-supported passive argument."
  );

  const page = await fetch(`${webBaseUrl}/play`);
  const pageHtml = await page.text();
  assert(page.ok && pageHtml.includes("character-background-choice"), "Web did not serve the source-backed character builder.");

  const catalogEnvelope = await waitForEngineBackedJson<{ catalog: ContentCatalog }>(`${webBaseUrl}/api/content-catalog`);
  const catalog = catalogEnvelope.catalog;
  assert(catalog.packHash === engineHealth.rules.packHash, "Web catalog and engine health disagree on the active pack.");
  assert(catalog.defaultPolicy.gamesystem === "5e-2014", "Catalog default game system drifted.");
  assert(catalog.defaultPolicy.baseDocumentKey === "srd-2014", "Catalog default base document drifted.");
  assert(catalog.defaultPolicy.allowedDocumentKeys.includes("srd-2014"), "Catalog default policy omitted its base document.");
  assert(catalog.documents.some((document) => document.key === "srd-2014" && document.canBeBase), "Catalog did not expose the reviewed SRD base.");

  const optionsEnvelope = await waitForEngineBackedJson<{ options: CharacterOptions }>(`${webBaseUrl}/api/character-options`);
  const options = optionsEnvelope.options;
  const species = requireNamed(options.species.filter((option) => option.selectable), "Human");
  const characterClass = requireNamed(options.classes.filter((option) => option.selectable), "Fighter");
  const background = requireNamed(options.backgrounds, "Acolyte");
  const alignment = requireNamed(options.alignments, "Neutral");
  const skillKeys = ["Athletics", "Perception"].map((name) => requireNamed(characterClass.skillChoice.options, name).contentKey);
  const languageKeys = ["Dwarvish", "Elvish", "Halfling"].map((name) => requireNamed(options.languages, name).contentKey);
  assert(options.species.filter((option) => option.selectable).length === 9, "Selectable species count drifted.");
  assert(options.classes.filter((option) => option.selectable).length === 12, "Selectable class count drifted.");

  const createdCampaign = await requestJson<{
    session: { id: string; version: number; contentPolicy: ContentPolicy };
  }>(`${webBaseUrl}/api/campaigns`, {
    method: "POST",
    body: JSON.stringify({
      name: "S9 HTTP Probe",
      premise: "A rules-bound test campaign.",
      setting: "Integration harness",
      tone: "Adventurous",
      contentPolicy: catalog.defaultPolicy,
    }),
  }, 60_000);
  assert(
    JSON.stringify(createdCampaign.session.contentPolicy) === JSON.stringify(catalog.defaultPolicy),
    "Campaign did not persist the catalog-selected content policy."
  );
  const resumedCampaign = await requestJson<{
    session: { id: string; version: number } | null;
    activeCampaignId: string | null;
  }>(`${webBaseUrl}/api/session?campaignId=${encodeURIComponent(createdCampaign.session.id)}`);
  assert(resumedCampaign.session?.id === createdCampaign.session.id, "Authenticated campaign resume did not restore the requested campaign.");
  assert(resumedCampaign.activeCampaignId === createdCampaign.session.id, "Campaign resume did not report the active campaign identity.");
  const createdCharacter = await requestJson<{
    accepted: boolean;
    code: string | null;
    message: string;
    session: {
      version: number;
      phase: string;
      character: {
        name: string;
        species: string;
        className: string;
        speciesRef: unknown;
        classRef: unknown;
        backgroundRef: unknown;
        alignmentRef: unknown;
        currency: { copper: number };
        skillRefs: unknown[];
        languageRefs: unknown[];
        inventory: unknown[];
        derived: { initiative: number; passivePerception: number };
        sourceDetails: { features: unknown[] };
      };
    };
  }>(`${webBaseUrl}/api/campaigns/${encodeURIComponent(createdCampaign.session.id)}/character`, {
    method: "POST",
    body: JSON.stringify({
      clientCommandId: crypto.randomUUID(),
      expectedCampaignVersion: createdCampaign.session.version,
      name: "HTTP Sentinel",
      speciesKey: species.contentKey,
      classKey: characterClass.contentKey,
      backgroundKey: background.contentKey,
      alignmentKey: alignment.contentKey,
      abilityScoreMethod: "standard_array",
      abilityScores: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 },
      abilityBonusChoices: [],
      skillKeys,
      languageKeys,
      toolProficiencies: [],
    }),
  });
  const sheet = createdCharacter.session.character;
  assert(createdCharacter.accepted, `Character creation was rejected: ${createdCharacter.code ?? "unknown"} ${createdCharacter.message}`);
  assert(createdCharacter.session.phase === "tutorial", "Character creation did not enter the tutorial phase.");
  assert(sheet.name === "HTTP Sentinel" && sheet.species === "Human" && sheet.className === "Fighter", "Character identity diverged.");
  assert(Boolean(sheet.speciesRef && sheet.classRef && sheet.backgroundRef && sheet.alignmentRef), "Character source references were not persisted.");
  assert(sheet.currency.copper === 1_500, "Acolyte currency was not applied.");
  assert(sheet.skillRefs.length === 4, "Class and background skills did not reconcile.");
  assert(sheet.languageRefs.length === 4, "Fixed and selected languages did not reconcile.");
  assert(sheet.inventory.length >= 9, "Reviewed class and background inventory was not materialized.");
  assert(sheet.sourceDetails.features.length > 0, "Source-backed feature descriptions were not hydrated.");

  const engineHeaders = {
    "x-lantern-engine-token": internalToken,
    "x-lantern-account-id": "s9-http-player",
    "x-lantern-actor-id": "s9-http-player",
    "x-lantern-capabilities": "admin",
  };
  const hiddenToolResponse = await fetch(
    `${engineBaseUrl}/v1/campaigns/${encodeURIComponent(createdCampaign.session.id)}/tool-calls`,
    {
      method: "POST",
      headers: { ...engineHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        clientCommandId: crypto.randomUUID(),
        expectedCampaignVersion: createdCharacter.session.version,
        toolName: "experience_feedback_add",
        arguments: { rating: 5 },
      }),
    }
  );
  const hiddenToolBody = await hiddenToolResponse.json() as { code?: string };
  assert(
    hiddenToolResponse.status === 400 && hiddenToolBody.code === "tool_not_model_facing",
    "The generic tool-call endpoint accepted a player-only experience command."
  );
  const passiveCheck = await engineToolCall(engineBaseUrl, engineHeaders, createdCampaign.session.id, {
    expectedCampaignVersion: createdCharacter.session.version,
    toolName: "roll_check",
    arguments: { ability: "wis", goal: "Notice a quiet test signal.", passive: true },
  });
  assert(passiveCheck.accepted, `Advertised passive roll_check failed: ${passiveCheck.code ?? passiveCheck.message}`);
  const encounter = await engineToolCall(engineBaseUrl, engineHeaders, createdCampaign.session.id, {
    expectedCampaignVersion: passiveCheck.campaignVersion,
    toolName: "combat_start",
    arguments: {
      encounterId: "s9-http-elemental",
      encounterName: "S9 HTTP Elemental",
      creatures: [{
        creatureKey: "open5e:creature:5e-2014:srd-2014:srd_air-elemental",
        count: 1,
        distanceFeet: 20,
      }],
    },
  });
  assert(encounter.accepted, `S9 combat start failed: ${encounter.code ?? encounter.message}`);
  const yielded = await engineToolCall(engineBaseUrl, engineHeaders, createdCampaign.session.id, {
    expectedCampaignVersion: encounter.campaignVersion,
    toolName: "combat_action",
    arguments: { action: "dodge" },
  });
  assert(yielded.accepted, `S9 player combat action failed: ${yielded.code ?? yielded.message}`);
  assert(yielded.commandResult.session.combat.activeActorId === "s9-http-player", "S9 player turn advanced before end_turn.");
  const endTurn = await engineToolCall(engineBaseUrl, engineHeaders, createdCampaign.session.id, {
    expectedCampaignVersion: yielded.campaignVersion,
    toolName: "end_turn",
    arguments: {},
  });
  assert(endTurn.accepted, `S9 end_turn failed: ${endTurn.code ?? endTurn.message}`);
  const activeEnemyId = endTurn.commandResult.session.combat.activeActorId;
  assert(Boolean(activeEnemyId), "S9 combat did not hand initiative to the creature.");
  const multiattack = await engineToolCall(engineBaseUrl, engineHeaders, createdCampaign.session.id, {
    expectedCampaignVersion: endTurn.campaignVersion,
    toolName: "advance_turn",
    arguments: { combatantId: activeEnemyId, actionKey: "multiattack" },
  });
  assert(multiattack.accepted, `S9 multiattack failed: ${multiattack.code ?? multiattack.message}`);
  assert(multiattack.message.includes("uses Multiattack"), "S9 multiattack did not resolve through the compiled program.");
  assert(
    multiattack.commandResult.event?.contentKeys.includes("open5e:effect-program:5e-2014:srd-2014:srd_air-elemental/multiattack"),
    "S9 effect-program provenance was absent from persisted event evidence."
  );
  assert(
    !JSON.stringify(multiattack.commandResult.state.combat.enemies).includes("sourceDescription"),
    "S9 persisted campaign state contains content prose."
  );

  const deleted = await requestJson<{
    deleted: true;
    deletedCommands: number;
    deletedEvents: number;
    campaigns: unknown[];
  }>(`${webBaseUrl}/api/campaigns/${encodeURIComponent(createdCampaign.session.id)}`, {
    method: "DELETE",
    body: JSON.stringify({
      expectedCampaignVersion: multiattack.campaignVersion,
      confirmation: "DELETE",
    }),
  });
  assert(deleted.deleted === true, "Campaign deletion was not accepted.");
  assert(deleted.deletedCommands > 0 && deleted.deletedEvents > 0, "Campaign deletion did not cascade persisted records.");
  assert(Array.isArray(deleted.campaigns) && deleted.campaigns.length === 0, "Deleted campaign still appeared in the manager.");

  process.stdout.write(`${JSON.stringify({
    webStatus: health.status,
    engineStatus: engineHealth.status,
    packVersion: engineHealth.rules.packVersion,
    packHash: engineHealth.rules.packHash,
    toolCount: engineHealth.toolCount,
    selectableSpecies: options.species.filter((option) => option.selectable).length,
    selectableClasses: options.classes.filter((option) => option.selectable).length,
    campaignPhase: createdCharacter.session.phase,
    character: `${sheet.name} / ${sheet.species} / ${sheet.className}`,
    sourcePinned: true,
    contentCatalogPinned: true,
    contentGamesystem: createdCampaign.session.contentPolicy.gamesystem,
    contentDocumentCount: createdCampaign.session.contentPolicy.allowedDocumentKeys.length,
    currencyCopper: sheet.currency.copper,
    skillRefCount: sheet.skillRefs.length,
    languageRefCount: sheet.languageRefs.length,
    featureDetailCount: sheet.sourceDetails.features.length,
    inventoryCount: sheet.inventory.length,
    initiative: sheet.derived.initiative,
    passivePerception: sheet.derived.passivePerception,
    compiledMultiattack: true,
    multiattackEventVersion: multiattack.commandResult.event?.version,
    campaignDeleted: true,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(serviceDiagnostics(engine));
  process.stderr.write(serviceDiagnostics(web));
  throw error;
} finally {
  stopService(web);
  stopService(engine);
}

interface CharacterReferenceOption {
  contentKey: string;
  name: string;
}

interface ContentPolicy {
  gamesystem: string;
  baseDocumentKey: string;
  allowedDocumentKeys: string[];
  allowedLicenseKeys: string[];
}

interface ContentCatalog {
  packHash: string;
  defaultPolicy: ContentPolicy;
  documents: Array<{ key: string; canBeBase: boolean }>;
}

interface CharacterOptions {
  species: Array<CharacterReferenceOption & { selectable: boolean }>;
  classes: Array<CharacterReferenceOption & {
    selectable: boolean;
    skillChoice: { options: CharacterReferenceOption[] };
  }>;
  backgrounds: CharacterReferenceOption[];
  alignments: CharacterReferenceOption[];
  languages: CharacterReferenceOption[];
}

interface RunningService {
  name: string;
  process: ChildProcessWithoutNullStreams;
  stdout: string[];
  stderr: string[];
}

interface EngineToolEnvelope {
  accepted: boolean;
  code: string | null;
  message: string;
  campaignVersion: number;
  commandResult: {
    event: { version: number; contentKeys: string[] } | null;
    session: { combat: { activeActorId: string | null } };
    state: { combat: { enemies: unknown[] } };
  };
}

async function engineToolCall(
  engineBaseUrl: string,
  headers: Record<string, string>,
  campaignId: string,
  input: { expectedCampaignVersion: number; toolName: string; arguments: Record<string, unknown> }
): Promise<EngineToolEnvelope> {
  return requestJson<EngineToolEnvelope>(
    `${engineBaseUrl}/v1/campaigns/${encodeURIComponent(campaignId)}/tool-calls`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        clientCommandId: crypto.randomUUID(),
        expectedCampaignVersion: input.expectedCampaignVersion,
        toolName: input.toolName,
        arguments: input.arguments,
      }),
    }
  );
}

function startService(name: string, entrypoint: string, environment: NodeJS.ProcessEnv): RunningService {
  const child = spawn(process.execPath, [entrypoint], {
    cwd: repositoryRoot,
    env: environment,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const service: RunningService = { name, process: child, stdout: [], stderr: [] };
  child.stdout.on("data", (chunk: Buffer) => service.stdout.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk: Buffer) => service.stderr.push(chunk.toString("utf8")));
  return service;
}

function stopService(service: RunningService): void {
  if (service.process.exitCode === null && !service.process.killed) service.process.kill();
}

function serviceDiagnostics(service: RunningService): string {
  return `\n[${service.name} stdout]\n${service.stdout.join("")}\n[${service.name} stderr]\n${service.stderr.join("")}\n`;
}

async function availablePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a local smoke-test port."));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(baseUrl: string): Promise<Record<string, unknown>> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const health = await requestJson<Record<string, unknown>>(`${baseUrl}/api/health`, undefined, 2_000);
      if ((health.integrations as { lanternEngine?: boolean } | undefined)?.lanternEngine) return health;
      lastError = new Error("Web is ready but the engine connection is not ready.");
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError instanceof Error ? lastError : new Error("Local services did not become ready.");
}

async function requestJson<T>(url: string, init?: RequestInit, timeoutMs = 10_000): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error ?? `${response.status} ${response.statusText}`);
  return data;
}

async function waitForEngineBackedJson<T>(url: string, attempts = 12): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestJson<T>(url, undefined, 2_000);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("The Lantern engine is unavailable")) throw error;
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("The Lantern engine did not become ready for the smoke probe.");
}

function requireNamed<T extends CharacterReferenceOption>(options: T[], name: string): T {
  const option = options.find((candidate) => candidate.name === name);
  if (!option) throw new Error(`Character option not found: ${name}.`);
  return option;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
