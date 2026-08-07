import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import {
  assessLegacyCampaignRepin,
  buildLegacyRepinReview,
  LEGACY_LANTERN_RULES_VERSION,
  renderLegacyRepinReviewMarkdown,
  resolveLegacyCampaignRepin,
} from "./content/legacy-repin.js";
import { diffOpen5ePacks, renderOpen5ePackDiffMarkdown } from "./content/pack-diff.js";
import { loadOpen5eContentPack, open5ePackDirectory } from "./content/pack.js";
import { assessCampaignRepin, resolveCampaignRepin } from "./content/repin.js";
import { engineConfig } from "./engine-config.js";
import type { EngineContentRepinCommand, RequestContext } from "./engine-contracts.js";
import { normalizeCampaignState } from "./engine-domain.js";
import { LanternEngineStore } from "./engine-store.js";

const [operation] = process.argv.slice(2);
const options = parseOptions(process.argv.slice(3));

if (!operation || !["diff", "plan", "apply"].includes(operation)) {
  fail("Usage: content-repin-cli <diff|plan|apply> --from <pack-version> --to <pack-version> [options]");
}

const fromVersion = requiredOption(options, "from");
const toVersion = requiredOption(options, "to");
const legacySource = fromVersion === LEGACY_LANTERN_RULES_VERSION;
const toPack = await loadOpen5eContentPack(open5ePackDirectory(toVersion));
const fromPack = legacySource ? null : await loadOpen5eContentPack(open5ePackDirectory(fromVersion));
const diff = fromPack ? diffOpen5ePacks(fromPack, toPack) : null;
const legacyReview = legacySource ? buildLegacyRepinReview(toPack) : null;
const reviewSha256 = diff?.reviewSha256 ?? legacyReview?.reviewSha256;
if (!reviewSha256) fail("The migration review could not be constructed.");

if (operation === "diff") {
  const report = diff
    ? renderOpen5ePackDiffMarkdown(diff)
    : renderLegacyRepinReviewMarkdown(legacyReview as NonNullable<typeof legacyReview>);
  const output = options.get("out");
  if (output) {
    const outputPath = resolve(output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, report, "utf8");
  }
  const summary = diff ? packSummary(diff) : {
    kind: legacyReview?.kind,
    from: legacyReview?.from,
    to: legacyReview?.to,
    reviewSha256,
  };
  process.stdout.write(`${JSON.stringify({ ...summary, output: output ? resolve(output) : null }, null, 2)}\n`);
  process.exit(0);
}

const accountId = requiredOption(options, "account");
const campaignId = requiredOption(options, "campaign");
const databasePath = resolve(options.get("database") ?? engineConfig.databasePath);
const approvedChangedKeys = csvOption(options, "approve-changed");
if (legacySource && approvedChangedKeys.length) {
  fail("Legacy migration does not accept --approve-changed because any source-content marker blocks migration.");
}
const plannedState = readCampaignReadonly(databasePath, accountId, campaignId);
const plannedAssessment = legacySource
  ? assessLegacyCampaignRepin(plannedState, toPack)
  : assessCampaignRepin(plannedState, fromPack as NonNullable<typeof fromPack>, toPack, approvedChangedKeys);
if (operation === "plan") {
  process.stdout.write(`${JSON.stringify({
    databasePath,
    campaignId,
    campaignVersion: plannedState.version,
    ...plannedAssessment,
  }, null, 2)}\n`);
  process.exit(plannedAssessment.accepted ? 0 : 2);
}

const store = new LanternEngineStore(databasePath);
let exitCode = 0;
try {
    const state = store.listCampaigns(accountId).find((campaign) => campaign.id === campaignId);
    if (!state) fail(`Campaign ${campaignId} was not found for account ${accountId}.`);
    const confirmedReviewSha256 = requiredOption(options, "confirm-review-sha");
    if (confirmedReviewSha256 !== reviewSha256) {
      fail(`Review hash mismatch. Current deterministic review is ${reviewSha256}.`);
    }
    const context: RequestContext = {
      requestId: randomUUID(),
      accountId,
      campaignId,
      actorId: state.actorId,
      capabilities: ["admin", "dm"],
    };
    const command: EngineContentRepinCommand = {
      kind: "content_repin",
      fromRulesVersion: state.rulesVersion,
      toRulesVersion: toPack.descriptor.rulesVersion,
      reviewSha256,
      approvedChangedKeys,
    };
    const clientCommandId = options.get("client-command-id") ?? randomUUID();
    const result = store.executeCommand({
      context,
      clientCommandId,
      expectedCampaignVersion: state.version,
      command,
      tool: "content_repin",
      resolve: (current) => legacySource
        ? resolveLegacyCampaignRepin(current, context, clientCommandId, toPack, confirmedReviewSha256)
        : resolveCampaignRepin(
          current,
          context,
          clientCommandId,
          fromPack as NonNullable<typeof fromPack>,
          toPack,
          confirmedReviewSha256,
          approvedChangedKeys
        ),
    });
    process.stdout.write(`${JSON.stringify({
      accepted: result.accepted,
      code: result.code,
      message: result.message,
      campaignId,
      previousVersion: state.version,
      version: result.state.version,
      rulesVersion: result.state.rulesVersion,
      reviewSha256,
      eventId: result.event?.id ?? null,
      clientCommandId,
    }, null, 2)}\n`);
    exitCode = result.accepted ? 0 : 2;
} finally {
  store.close();
}
process.exitCode = exitCode;

function parseOptions(args: string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token?.startsWith("--")) fail(`Unexpected argument: ${token ?? ""}.`);
    const key = token.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith("--")) fail(`Option --${key} needs a value.`);
    parsed.set(key, value);
    index += 1;
  }
  return parsed;
}

function requiredOption(optionsMap: Map<string, string>, key: string): string {
  const value = optionsMap.get(key)?.trim();
  if (!value) fail(`Missing required option --${key}.`);
  return value;
}

function csvOption(optionsMap: Map<string, string>, key: string): string[] {
  const value = optionsMap.get(key);
  return value ? [...new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean))].sort() : [];
}

function readCampaignReadonly(databasePath: string, accountId: string, campaignId: string) {
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const row = database.prepare(
      "SELECT state_json FROM engine_campaigns WHERE account_id = ? AND campaign_id = ?"
    ).get(accountId, campaignId) as { state_json: string } | undefined;
    if (!row) fail(`Campaign ${campaignId} was not found for account ${accountId}.`);
    return normalizeCampaignState(JSON.parse(row.state_json));
  } finally {
    database.close();
  }
}

function packSummary(value: ReturnType<typeof diffOpen5ePacks>) {
  return {
    from: value.from,
    to: value.to,
    reviewSha256: value.reviewSha256,
    normalized: summarizeLayer(value.normalized),
    compiled: summarizeLayer(value.compiled),
  };
}

function summarizeLayer(layer: ReturnType<typeof diffOpen5ePacks>["normalized"]) {
  return Object.fromEntries(Object.entries(layer).map(([key, values]) => [key, values.length]));
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
