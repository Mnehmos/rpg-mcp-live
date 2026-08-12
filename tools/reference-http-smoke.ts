import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const directory = await mkdtemp(join(tmpdir(), "rpg-mcp-reference-http-smoke-"));
const referencePort = await availablePort();
const webPort = await availablePort();
const token = "reference-http-smoke-token";
const commitSha = "0123456789abcdef0123456789abcdef01234567";

type Character = {
  id: string;
  name: string;
  race: string;
  characterClass: string;
  background: string;
  alignment: string;
  stats: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  hp: number;
  maxHp: number;
  ac: number;
  level: number;
  xp: number;
  currency: { copper: number };
  skillProficiencies: string[];
  saveProficiencies: string[];
  expertise: string[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
  toolProficiencies: string[];
  languages: string[];
};

let character: Character | null = null;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function jsonResponse(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function toolResult(payload: unknown): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    result: {
      content: [{ type: "text", text: JSON.stringify(payload) }],
      isError: false,
    },
  };
}

function handleTool(name: string, args: Record<string, unknown>): unknown {
  const action = typeof args.action === "string" ? args.action : "";
  if (name === "session_manage" && action === "initialize") {
    return { worldId: "smoke-world", partyId: "smoke-party", created: { world: true, party: true } };
  }
  if (name === "narrative_manage" && action === "search") return { notes: [] };
  if (name === "inventory_manage" && action === "get_detailed") return { inventory: [] };
  if (name === "party_manage" && action === "add_member") return { success: true };
  if (name === "character_manage" && action === "create") {
    character = {
      id: "smoke-character",
      name: String(args.name),
      race: String(args.race),
      characterClass: String(args.class),
      background: String(args.background ?? "Folk Hero"),
      alignment: String(args.alignment ?? "Neutral"),
      stats: (args.stats ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }) as Character["stats"],
      hp: 10,
      maxHp: 10,
      ac: 10,
      level: 1,
      xp: 0,
      currency: { copper: 0 },
      skillProficiencies: (args.skillProficiencies ?? []) as string[],
      saveProficiencies: ["str", "con"],
      expertise: (args.expertise ?? []) as string[],
      armorProficiencies: ["light", "medium", "shields"],
      weaponProficiencies: ["simple", "martial"],
      toolProficiencies: (args.toolProficiencies ?? []) as string[],
      languages: (args.languages ?? ["Common"]) as string[],
    };
    return character;
  }
  if (name === "character_manage" && action === "get") return character ?? { error: true, message: "No character" };
  if (name === "character_manage" && action === "update") {
    if (character) character = { ...character, ...args } as Character;
    return character;
  }
  if (name === "load_tool_schema") return { name: String(args.name ?? ""), schema: { type: "object" } };
  return { success: true };
}

function startReferenceFixture(): ReturnType<typeof createServer> {
  return createServer(async (request, response) => {
    if (request.url === "/health" && request.method === "GET") {
      jsonResponse(response, 200, { status: "ok", service: "rpg-mcp", transport: "http" });
      return;
    }
    if (request.url !== "/mcp" || request.method !== "POST") {
      jsonResponse(response, 404, { error: "not_found" });
      return;
    }
    if (request.headers.authorization !== `Bearer ${token}`) {
      jsonResponse(response, 401, { error: "unauthorized" });
      return;
    }
    const body = await readJson(request);
    if (body.method === "notifications/initialized") {
      response.writeHead(202);
      response.end();
      return;
    }
    if (body.method === "initialize") {
      jsonResponse(response, 200, { jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-06-18", capabilities: {} } });
      return;
    }
    if (body.method === "tools/call") {
      const params = body.params as { name: string; arguments?: Record<string, unknown> };
      const result = toolResult(handleTool(params.name, params.arguments ?? {}));
      result.id = body.id;
      jsonResponse(response, 200, result);
      return;
    }
    jsonResponse(response, 200, { jsonrpc: "2.0", id: body.id, result: {} });
  });
}

function startWeb(): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, ["dist/server.js"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(webPort),
      APP_URL: `http://127.0.0.1:${webPort}`,
      DATABASE_PATH: join(directory, "web.db"),
      CLERK_PUBLISHABLE_KEY: "",
      CLERK_SECRET_KEY: "",
      DEV_AUTH_BYPASS: "true",
      DEV_USER_ID: "reference-smoke-player",
      OPENROUTER_API_KEY: "",
      REFERENCE_ENGINE_URL: `http://127.0.0.1:${referencePort}/mcp`,
      REFERENCE_ENGINE_TOKEN: token,
      REFERENCE_ENGINE_TIMEOUT_MS: "5000",
      RAILWAY_ENVIRONMENT_NAME: "smoke",
      RAILWAY_GIT_COMMIT_SHA: commitSha,
      RAILWAY_DEPLOYMENT_ID: "reference-web-smoke",
    },
    stdio: "pipe",
  });
}

async function waitForHealth(url: string, timeoutMs = 20_000): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json() as Record<string, unknown>;
    } catch {
      // The child may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(`${response.status}: ${body.error ?? "request failed"}`);
  return body;
}

async function availablePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string", "Could not allocate a smoke-test port.");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

const reference = startReferenceFixture();
await new Promise<void>((resolve, reject) => {
  reference.once("error", reject);
  reference.listen(referencePort, "127.0.0.1", () => resolve());
});
const web = startWeb();
let webOutput = "";
web.stdout.on("data", (chunk) => { webOutput += String(chunk); });
web.stderr.on("data", (chunk) => { webOutput += String(chunk); });

try {
  const health = await waitForHealth(`http://127.0.0.1:${webPort}/api/health`);
  const integrations = health.integrations as Record<string, unknown>;
  assert(integrations.referenceEngine === true, "Web did not reach the reference engine.");
  assert(!Object.prototype.hasOwnProperty.call(integrations, "lanternEngine"), "Lantern engine remained in the health contract.");

  const options = await requestJson<{ options: { species: unknown[]; classes: unknown[] } }>(`http://127.0.0.1:${webPort}/api/character-options`);
  assert(options.options.species.length > 0 && options.options.classes.length > 0, "Reference character options were empty.");
  const catalog = await requestJson<{ catalog: { defaultPolicy: { baseDocumentKey: string } } }>(`http://127.0.0.1:${webPort}/api/content-catalog`);
  assert(catalog.catalog.defaultPolicy.baseDocumentKey === "srd-2014", "Reference content catalog drifted.");

  const campaign = await requestJson<{ session: { id: string; version: number } }>(`http://127.0.0.1:${webPort}/api/campaigns`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Reference Smoke", premise: "Smoke", setting: "Test", tone: "Test" }),
  });
  const created = await requestJson<{ data: { character: { name: string; savingThrows: Record<string, number>; proficiencies: { languages: string[] } } } }>(
    `http://127.0.0.1:${webPort}/api/campaigns/${campaign.session.id}/character`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientCommandId: randomUUID(),
        expectedCampaignVersion: campaign.session.version,
        name: "Reference Smoke Hero",
        speciesKey: "open5e:species:srd_dragonborn",
        classKey: "open5e:class:srd_barbarian",
        backgroundKey: "open5e:background:folk_hero",
        alignmentKey: "open5e:alignment:neutral",
        abilityScoreMethod: "standard_array",
        abilityScores: { str: 16, dex: 9, con: 14, int: 12, wis: 13, cha: 12 },
        skillKeys: ["open5e:skill:athletics"],
        languageKeys: ["open5e:language:draconic"],
        toolProficiencies: [],
      }),
    },
  );
  assert(created.data.character.name === "Reference Smoke Hero", "Reference character creation failed.");
  assert(created.data.character.savingThrows.str === 5 && created.data.character.savingThrows.con === 4, "Reference save derivation failed.");
  assert(created.data.character.proficiencies.languages.includes("Draconic"), "Reference language persistence failed.");
  console.log("Reference HTTP smoke passed.");
} catch (error) {
  console.error(webOutput);
  throw error;
} finally {
  web.kill();
  reference.close();
}
