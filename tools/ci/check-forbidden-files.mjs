#!/usr/bin/env node
/**
 * Forbidden-file gate.
 *
 * Rejects tracked files that must never enter the repository:
 *   - secret / credential files (.env, *.pem, *.key, id_rsa, etc.)
 *   - local databases (*.db, *.sqlite, *.sqlite3)
 *   - generated output (coverage/, dist/, build/)
 *
 * Also scans browser assets (public/) for known secret-variable names
 * so a clerk/stripe/openrouter key never leaks to the client.  Only
 * filenames are reported — suspected secret VALUES are never printed.
 *
 * Run locally:   node tools/ci/check-forbidden-files.mjs
 * Run in CI:     node tools/ci/check-forbidden-files.mjs   (fails the job)
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

const FORBIDDEN_GLOBS = [
  /\.env$/i,
  /\.env\./i, // .env.local, .env.production …  (.env.example is allowed, see below)
  /\.db$/i,
  /\.db-wal$/i,
  /\.db-shm$/i,
  /\.sqlite$/i,
  /\.sqlite3$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.crt$/i,
  /^id_rsa/i,
  /^id_ecdsa/i,
  /^id_ed25519/i,
  /coverage\//i,
  /^dist\//i,
  /\/dist\//i,
  /^build\//i,
  /\.tsbuildinfo$/i,
  /\.log$/i,
];

// Explicit allowlist — overrides FORBIDDEN_GLOBS.
const ALLOWED = new Set([
  ".env.example",
]);

const SECRET_NAMES = [
  "OPENROUTER_API_KEY",
  "CLERK_SECRET_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "ENGINE_INTERNAL_TOKEN",
  "ENGINE_SHARED_SECRET",
  "OPENAI_API_KEY",
  "DATABASE_URL",
  "SUPABASE",
];

// ---------------------------------------------------------------------------
// Collect tracked files
// ---------------------------------------------------------------------------

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);

// ---------------------------------------------------------------------------
// 1. Forbidden extensions / paths
// ---------------------------------------------------------------------------

const forbiddenHits = tracked.filter(
  (path) => ALLOWED.has(path) ? false : FORBIDDEN_GLOBS.some((re) => re.test(path))
);

// ---------------------------------------------------------------------------
// 2. Secret names in browser assets
// ---------------------------------------------------------------------------

const browserAssets = tracked.filter((p) => p.startsWith("public/") || p.startsWith("static/") || p.endsWith(".html"));
const secretNameHits = [];

for (const asset of browserAssets) {
  let content;
  try {
    content = readFileSync(asset, "utf8");
  } catch {
    continue;
  }
  for (const name of SECRET_NAMES) {
    // match  KEY=something  or  "KEY":"something"  but never just the key NAME in a comment
    const re = new RegExp(`${name}\\s*[:=]\\s*["']?[A-Za-z0-9_+/=-]{8,}`, "i");
    if (re.test(content)) {
      secretNameHits.push({ asset, name });
    }
  }
}

// ---------------------------------------------------------------------------
// Report & exit
// ---------------------------------------------------------------------------

let failed = false;

if (forbiddenHits.length > 0) {
  failed = true;
  console.error("\n✗ Forbidden tracked files:\n");
  for (const f of forbiddenHits) console.error(`   ${f}`);
  console.error("\n   These must be removed from git and added to .gitignore.\n");
}

if (secretNameHits.length > 0) {
  failed = true;
  console.error("\n✗ Secret-variable references in browser assets:\n");
  for (const h of secretNameHits) console.error(`   ${h.asset}  →  ${h.name}`);
  console.error("\n   Secret values must never appear in client-served files.\n");
}

if (!failed) {
  console.log(`✓ Scanned ${tracked.length} tracked files — no forbidden or leaked-secret files found.`);
}

process.exit(failed ? 1 : 0);
