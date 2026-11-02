#!/usr/bin/env node
/**
 * Local playtest server: the reference engine and the web app on this
 * machine, with sign-in bypassed and every byte of state under tmp/dev/.
 *
 *   npm run dev:local                       (bring your own OPENROUTER_API_KEY)
 *   railway run -s rpg-mcp-live -e staging -- npm run dev:local
 *                                           (borrow staging's key at run time)
 *
 * Whatever the shell or `railway run` provides is the base; everything that
 * would point at a hosted service (database, engine, Clerk, Stripe) is
 * overridden here, so a local run never touches staging or production state.
 * Only the model key and model settings come through.
 *
 * ENGINE_DIR overrides where the engine checkout lives (default: the sibling
 * mnehmos.rpg.mcp folder). WEB_PORT / ENGINE_PORT override the ports.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engineDir = resolve(process.env.ENGINE_DIR || join(webDir, "..", "mnehmos.rpg.mcp"));
const webPort = process.env.WEB_PORT || "3000";
const enginePort = process.env.ENGINE_PORT || "3101";
const dataDir = join(webDir, "tmp", "dev");
const tsxCli = createRequire(import.meta.url).resolve("tsx/cli");

// Local-only secrets: the web app and the engine just have to agree.
const transportToken = "local-dev-transport-token";
const tenantSecret = "local-dev-tenant-secret";

if (!existsSync(join(engineDir, "src", "server", "index.ts"))) {
  console.error(`Engine checkout not found at ${engineDir}. Clone Mnehmos/mnehmos.rpg.mcp there or set ENGINE_DIR.`);
  process.exit(1);
}
if (!existsSync(join(engineDir, "node_modules"))) {
  console.error(`Engine dependencies are missing. Run: npm install --prefix "${engineDir}"`);
  process.exit(1);
}
mkdirSync(join(dataDir, "engine"), { recursive: true });

const children = [];
function run(name, args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
  const prefix = (line) => `[${name}] ${line}`;
  for (const stream of [child.stdout, child.stderr]) {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) if (line.trim()) console.log(prefix(line));
    });
  }
  child.on("exit", (code) => {
    console.log(prefix(`exited with code ${code}`));
    shutdown(code ?? 1);
  });
  children.push(child);
  return child;
}

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function waitForEngine() {
  const url = `http://127.0.0.1:${enginePort}/health`;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`The engine did not answer ${url} within 60s.`);
}

run("engine", [tsxCli, "src/server/index.ts", "--http", "--port", enginePort], engineDir, {
  ...process.env,
  PORT: "",
  NODE_ENV: "development",
  RPG_DATA_DIR: join(dataDir, "engine"),
  RPG_MCP_DB_PATH: "",
  RPG_MCP_TRANSPORT_TOKEN: transportToken,
  RPG_MCP_TENANT_SECRET: tenantSecret,
});

try {
  await waitForEngine();
} catch (error) {
  console.error(error.message);
  shutdown(1);
}

run("web", [tsxCli, "watch", "src/server.ts"], webDir, {
  ...process.env,
  NODE_ENV: "development",
  PORT: webPort,
  APP_URL: `http://localhost:${webPort}`,
  DATABASE_PATH: join(dataDir, "rpg-mcp-live.db"),
  // Blank Clerk keys turn on the dev sign-in bypass (it never runs in production).
  CLERK_PUBLISHABLE_KEY: "",
  CLERK_SECRET_KEY: "",
  DEV_AUTH_BYPASS: "true",
  DEV_USER_ID: process.env.DEV_USER_ID || "local-player",
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
  STRIPE_PRICE_ID: "",
  REFERENCE_ENGINE_URL: `http://127.0.0.1:${enginePort}/mcp`,
  REFERENCE_ENGINE_TOKEN: transportToken,
  REFERENCE_ENGINE_TENANT_SECRET: tenantSecret,
});

console.log(`\n  Playtest at http://localhost:${webPort}  (signed in as ${process.env.DEV_USER_ID || "local-player"})`);
console.log(`  State lives in ${dataDir}; delete that folder for a fresh start.`);
if (!process.env.OPENROUTER_API_KEY) {
  console.log("  No OPENROUTER_API_KEY: the page loads, but DM turns will fail. Either export one, or run:");
  console.log("    railway run -s rpg-mcp-live -e staging -- npm run dev:local\n");
}
