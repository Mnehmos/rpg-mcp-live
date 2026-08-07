import Database from "better-sqlite3";
import { statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { resolverPolicyForCampaign } from "../src/content/catalog.js";
import {
  assessLegacyCampaignRepin,
  buildLegacyRepinReview,
  LEGACY_LANTERN_RULES_VERSION,
} from "../src/content/legacy-repin.js";
import { loadInstalledOpen5ePackRegistry } from "../src/content/registry.js";
import { assessCampaignRepin } from "../src/content/repin.js";
import { normalizeCampaignState } from "../src/engine-domain.js";
import type { EngineEvent, LanternCampaignState } from "../src/engine-contracts.js";

interface CampaignRow {
  account_id: string;
  campaign_id: string;
  state_json: string;
}

interface EventRow {
  account_id: string;
  campaign_id: string;
  event_json: string;
}

const databasePath = resolve(requiredOption(process.argv.slice(2), "database"));
const db = new Database(databasePath, { readonly: true, fileMustExist: true });

try {
  const registry = await loadInstalledOpen5ePackRegistry();
  const targetPack = registry.activePack;
  const legacyReview = buildLegacyRepinReview(targetPack);
  const campaignRows = db.prepare(
    "SELECT account_id, campaign_id, state_json FROM engine_campaigns ORDER BY account_id, campaign_id"
  ).all() as CampaignRow[];
  const campaigns = campaignRows.map((row) => ({
    identity: `${row.account_id}\u0000${row.campaign_id}`,
    state: normalizeCampaignState(JSON.parse(row.state_json) as LanternCampaignState),
  }));
  const stateByIdentity = new Map(campaigns.map((entry) => [entry.identity, entry.state]));
  const audit = campaigns.map(({ state }) => {
    if (state.rulesVersion === targetPack.descriptor.rulesVersion) {
      return { status: "already-active" as const, code: null, markers: 0 };
    }
    if (state.rulesVersion === LEGACY_LANTERN_RULES_VERSION) {
      const assessment = assessLegacyCampaignRepin(state, targetPack);
      return {
        status: assessment.accepted ? "accepted" as const : "rejected" as const,
        code: assessment.code,
        markers: assessment.contentMarkers.length,
      };
    }
    const fromPack = registry.getByRulesVersion(state.rulesVersion);
    if (!fromPack) return { status: "rejected" as const, code: "content_pack_not_installed", markers: 0 };
    const assessment = assessCampaignRepin(state, fromPack, targetPack);
    return {
      status: assessment.accepted ? "accepted" as const : "rejected" as const,
      code: assessment.code,
      markers: assessment.references.length,
    };
  });

  const eventRows = db.prepare(
    "SELECT account_id, campaign_id, event_json FROM engine_events ORDER BY account_id, campaign_id, version, created_at"
  ).all() as EventRow[];
  let legacyEvents = 0;
  let modernEvents = 0;
  const eventErrors: Record<string, number> = {};
  for (const row of eventRows) {
    try {
      const state = stateByIdentity.get(`${row.account_id}\u0000${row.campaign_id}`);
      if (!state) throw new Error("event_campaign_missing");
      const resolved = registry.resolveEvent(
        JSON.parse(row.event_json) as EngineEvent,
        resolverPolicyForCampaign(state.contentPolicy)
      );
      if (resolved.legacyUnversioned) legacyEvents += 1;
      else modernEvents += 1;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
        ? error.code
        : error instanceof Error ? error.message : "event_resolution_failed";
      eventErrors[code] = (eventErrors[code] ?? 0) + 1;
    }
  }

  const rulesVersions = [...campaigns.reduce((counts, entry) => {
    counts.set(entry.state.rulesVersion, (counts.get(entry.state.rulesVersion) ?? 0) + 1);
    return counts;
  }, new Map<string, number>())].map(([rulesVersion, count]) => ({ rulesVersion, count }));
  const rejectionCodes = audit
    .filter((entry) => entry.status === "rejected")
    .reduce<Record<string, number>>((counts, entry) => {
      const code = entry.code ?? "content_repin_rejected";
      counts[code] = (counts[code] ?? 0) + 1;
      return counts;
    }, {});

  process.stdout.write(`${JSON.stringify({
    database: { file: basename(databasePath), size: statSync(databasePath).size },
    integrity: db.pragma("quick_check"),
    target: {
      packVersion: targetPack.descriptor.packVersion,
      packHash: targetPack.descriptor.packHash,
      rulesVersion: targetPack.descriptor.rulesVersion,
    },
    legacyReviewSha256: legacyReview.reviewSha256,
    campaigns: {
      total: campaigns.length,
      rulesVersions,
      accepted: audit.filter((entry) => entry.status === "accepted").length,
      alreadyActive: audit.filter((entry) => entry.status === "already-active").length,
      rejected: audit.filter((entry) => entry.status === "rejected").length,
      contentMarkers: audit.reduce((sum, entry) => sum + entry.markers, 0),
      rejectionCodes,
    },
    events: {
      total: eventRows.length,
      legacyUnversioned: legacyEvents,
      modern: modernEvents,
      failed: Object.values(eventErrors).reduce((sum, count) => sum + count, 0),
      errors: eventErrors,
    },
  }, null, 2)}\n`);
} finally {
  db.close();
}

function requiredOption(args: string[], name: string): string {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? args[index + 1]?.trim() : null;
  if (!value || value.startsWith("--")) {
    throw new Error(`Usage: production-migration-audit --database <sqlite-path>`);
  }
  return value;
}
