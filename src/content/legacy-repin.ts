import { randomUUID } from "node:crypto";
import type {
  EngineContentRepinCommand,
  EngineEvent,
  EngineResolution,
  LanternCampaignState,
  RequestContext,
} from "../engine-contracts.js";
import { cloneCampaign, normalizeContentPolicy } from "../engine-domain.js";
import { canonicalJson, sha256 } from "./hash.js";
import type { Open5eContentPack } from "./pack.js";

export const LEGACY_LANTERN_RULES_VERSION = "lantern-rules-0.1";

export interface LegacyRepinReview {
  schemaVersion: 1;
  kind: "legacy-campaign-to-open5e-pack";
  from: {
    rulesVersion: typeof LEGACY_LANTERN_RULES_VERSION;
    contentIdentity: "unversioned";
  };
  to: {
    packVersion: string;
    packHash: string;
    rulesVersion: string;
  };
  preconditions: string[];
  transforms: string[];
  historicalEventPolicy: string[];
  reviewSha256: string;
}

export interface LegacyContentMarker {
  path: string;
  field: "contentKey" | "conditionContentKey" | "sourceContentKey" | "packHash" | "characterSource";
  value: string;
}

export interface LegacyCampaignRepinAssessment {
  accepted: boolean;
  code: string | null;
  message: string;
  fromRulesVersion: typeof LEGACY_LANTERN_RULES_VERSION;
  toRulesVersion: string;
  reviewSha256: string;
  contentMarkers: LegacyContentMarker[];
}

export function buildLegacyRepinReview(toPack: Open5eContentPack): LegacyRepinReview {
  const base = {
    schemaVersion: 1 as const,
    kind: "legacy-campaign-to-open5e-pack" as const,
    from: {
      rulesVersion: LEGACY_LANTERN_RULES_VERSION as typeof LEGACY_LANTERN_RULES_VERSION,
      contentIdentity: "unversioned" as const,
    },
    to: {
      packVersion: toPack.descriptor.packVersion,
      packHash: toPack.descriptor.packHash,
      rulesVersion: toPack.descriptor.rulesVersion,
    },
    preconditions: [
      "The campaign rulesVersion is exactly lantern-rules-0.1.",
      "The campaign contains no contentKey, conditionContentKey, sourceContentKey, packHash, or character source marker.",
      "The target pack passed installed-pack checksum, schema, provenance, ordering, and reference verification.",
    ],
    transforms: [
      "Normalize the campaign content policy beneath the deployment default.",
      "Set rulesVersion to the exact target Open5e pack identity.",
      "Increment the campaign version once and append one system log entry.",
      "Commit one content_repin event with the target rules identity and no inferred source content keys.",
    ],
    historicalEventPolicy: [
      "Do not rewrite pre-pack event bytes.",
      "Treat an event with no rulesVersion and no contentKeys as legacy unversioned evidence.",
      "Reject an unversioned event that claims content keys because its source pack cannot be proven.",
    ],
  };
  return { ...base, reviewSha256: sha256(canonicalJson(base)) };
}

export function renderLegacyRepinReviewMarkdown(review: LegacyRepinReview): string {
  return [
    "# Legacy Lantern Campaign Upgrade Review",
    "",
    `Review SHA-256: \`${review.reviewSha256}\``,
    "",
    `From: \`${review.from.rulesVersion}\` (${review.from.contentIdentity} content identity)`,
    "",
    `To: \`${review.to.packVersion}\` / \`${review.to.packHash}\``,
    "",
    "## Preconditions",
    "",
    ...review.preconditions.map((entry) => `- ${entry}`),
    "",
    "## Atomic transforms",
    "",
    ...review.transforms.map((entry) => `- ${entry}`),
    "",
    "## Historical event policy",
    "",
    ...review.historicalEventPolicy.map((entry) => `- ${entry}`),
    "",
  ].join("\n");
}

export function collectLegacyContentMarkers(state: LanternCampaignState): LegacyContentMarker[] {
  const markers: LegacyContentMarker[] = [];
  visit(state, "", markers);
  const legacyCharacterSource = (state.character as typeof state.character & { source?: unknown }).source;
  if (legacyCharacterSource) {
    markers.push({ path: "/character/source", field: "characterSource", value: "present" });
  }
  return markers.sort((left, right) => left.path.localeCompare(right.path)
    || left.field.localeCompare(right.field)
    || left.value.localeCompare(right.value));
}

export function assessLegacyCampaignRepin(
  state: LanternCampaignState,
  toPack: Open5eContentPack
): LegacyCampaignRepinAssessment {
  const review = buildLegacyRepinReview(toPack);
  const contentMarkers = collectLegacyContentMarkers(state);
  if (state.rulesVersion !== LEGACY_LANTERN_RULES_VERSION) {
    return rejected(
      "content_repin_source_mismatch",
      `The campaign is not pinned to ${LEGACY_LANTERN_RULES_VERSION}.`
    );
  }
  if (contentMarkers.length) {
    return rejected(
      "content_repin_legacy_content_present",
      "The legacy campaign contains source-content markers whose original pack cannot be proven."
    );
  }
  return {
    accepted: true,
    code: null,
    message: `Legacy campaign may be re-pinned to ${toPack.descriptor.packVersion}.`,
    fromRulesVersion: LEGACY_LANTERN_RULES_VERSION,
    toRulesVersion: toPack.descriptor.rulesVersion,
    reviewSha256: review.reviewSha256,
    contentMarkers,
  };

  function rejected(code: string, message: string): LegacyCampaignRepinAssessment {
    return {
      accepted: false,
      code,
      message,
      fromRulesVersion: LEGACY_LANTERN_RULES_VERSION,
      toRulesVersion: toPack.descriptor.rulesVersion,
      reviewSha256: review.reviewSha256,
      contentMarkers,
    };
  }
}

export function resolveLegacyCampaignRepin(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  toPack: Open5eContentPack,
  confirmedReviewSha256: string
): EngineResolution {
  const assessment = assessLegacyCampaignRepin(state, toPack);
  if (!assessment.accepted) {
    return rejection(state, assessment.code ?? "content_repin_rejected", assessment.message, assessment);
  }
  if (confirmedReviewSha256 !== assessment.reviewSha256) {
    return rejection(
      state,
      "content_repin_review_mismatch",
      "The confirmed review hash does not match the deterministic legacy migration review.",
      assessment
    );
  }

  const createdAt = new Date().toISOString();
  const next = cloneCampaign(state);
  next.rulesVersion = toPack.descriptor.rulesVersion;
  next.contentPolicy = normalizeContentPolicy(next.contentPolicy);
  next.version = state.version + 1;
  next.updatedAt = createdAt;
  const message = `Legacy rules re-pinned to ${toPack.descriptor.packVersion} after review ${assessment.reviewSha256.slice(0, 12)}.`;
  next.log = [...state.log, { id: randomUUID(), kind: "system" as const, text: message, createdAt }].slice(-40);
  const command: EngineContentRepinCommand = {
    kind: "content_repin",
    fromRulesVersion: LEGACY_LANTERN_RULES_VERSION,
    toRulesVersion: toPack.descriptor.rulesVersion,
    reviewSha256: assessment.reviewSha256,
    approvedChangedKeys: [],
  };
  const event: EngineEvent = {
    id: randomUUID(),
    kind: "command",
    tool: "content_repin",
    command,
    accountId: context.accountId,
    campaignId: context.campaignId,
    actorId: context.actorId,
    requestId: context.requestId,
    clientCommandId,
    previousVersion: state.version,
    version: next.version,
    rulesVersion: toPack.descriptor.rulesVersion,
    contentKeys: [],
    rolls: [],
    modifiers: [],
    outcome: "content_repin_committed",
    stateChanges: [
      { path: "/rulesVersion", before: state.rulesVersion, after: next.rulesVersion },
      { path: "/contentPolicy", before: state.contentPolicy, after: next.contentPolicy },
    ],
    createdAt,
  };
  return {
    state: next,
    tool: "content_repin",
    readOnly: false,
    accepted: true,
    code: null,
    message,
    data: assessment,
    event,
    narration: { text: message, proposedFacts: [], suggestedActions: [] },
  };
}

function rejection(
  state: LanternCampaignState,
  code: string,
  message: string,
  data: LegacyCampaignRepinAssessment
): EngineResolution {
  return {
    state,
    tool: "content_repin",
    readOnly: false,
    accepted: false,
    code,
    message,
    data,
    event: null,
    narration: { text: message, proposedFacts: [], suggestedActions: [] },
  };
}

function visit(value: unknown, path: string, markers: LegacyContentMarker[]): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visit(entry, `${path}/${index}`, markers));
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  for (const field of ["contentKey", "conditionContentKey", "sourceContentKey", "packHash"] as const) {
    const candidate = record[field];
    if (typeof candidate === "string" && candidate.trim()) {
      markers.push({ path: `${path}/${field}` || `/${field}`, field, value: candidate });
    }
  }
  for (const [key, child] of Object.entries(record)) {
    visit(child, `${path}/${escapePointer(key)}`, markers);
  }
}

function escapePointer(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}
