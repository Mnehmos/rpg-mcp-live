import { randomUUID } from "node:crypto";
import type { Open5eContentPack } from "./pack.js";
import { comparePackContentKey, diffOpen5ePacks, type ContentCompatibility } from "./pack-diff.js";
import { cloneCampaign } from "../engine-domain.js";
import type {
  EngineContentRepinCommand,
  EngineEvent,
  EngineResolution,
  LanternCampaignState,
  RequestContext,
} from "../engine-contracts.js";

export interface CampaignContentReference {
  packHash: string;
  contentKey: string;
  paths: string[];
}

export interface CampaignRepinAssessment {
  accepted: boolean;
  code: string | null;
  message: string;
  fromRulesVersion: string;
  toRulesVersion: string;
  reviewSha256: string;
  references: CampaignContentReference[];
  compatibility: Record<ContentCompatibility, string[]>;
  approvedChangedKeys: string[];
}

export function collectCampaignContentReferences(state: LanternCampaignState): CampaignContentReference[] {
  const references = new Map<string, CampaignContentReference>();
  visitReferences(state, "", (packHash, contentKey, path) => {
    const identity = `${packHash}\u0000${contentKey}`;
    const current = references.get(identity) ?? { packHash, contentKey, paths: [] };
    if (!current.paths.includes(path)) current.paths.push(path);
    references.set(identity, current);
  });
  return [...references.values()]
    .map((reference) => ({ ...reference, paths: [...reference.paths].sort() }))
    .sort((left, right) => left.packHash.localeCompare(right.packHash)
      || left.contentKey.localeCompare(right.contentKey));
}

export function assessCampaignRepin(
  state: LanternCampaignState,
  fromPack: Open5eContentPack,
  toPack: Open5eContentPack,
  approvedChangedKeys: readonly string[] = []
): CampaignRepinAssessment {
  const diff = diffOpen5ePacks(fromPack, toPack);
  const approvals = [...new Set(approvedChangedKeys)].sort();
  const references = collectCampaignContentReferences(state);
  const compatibility: CampaignRepinAssessment["compatibility"] = {
    identical: [],
    "provenance-only": [],
    changed: [],
    "missing-source": [],
    "missing-target": [],
  };
  for (const reference of references) {
    const status = reference.packHash === fromPack.descriptor.packHash
      ? comparePackContentKey(fromPack, toPack, reference.contentKey)
      : "missing-source";
    compatibility[status].push(reference.contentKey);
  }
  for (const values of Object.values(compatibility)) values.sort();

  if (state.rulesVersion !== fromPack.descriptor.rulesVersion) {
    return rejected("content_repin_source_mismatch", "The campaign is not pinned to the reviewed source pack.");
  }
  if (fromPack.descriptor.rulesVersion === toPack.descriptor.rulesVersion) {
    return rejected("content_repin_not_needed", "The campaign already uses the requested content pack.");
  }
  if (compatibility["missing-source"].length || compatibility["missing-target"].length) {
    return rejected("content_repin_reference_missing", "At least one persisted content reference is absent from the reviewed source or target pack.");
  }
  const unapprovedChanges = compatibility.changed.filter((key) => !approvals.includes(key));
  if (unapprovedChanges.length) {
    return rejected("content_repin_review_required", `Changed content requires explicit review: ${unapprovedChanges.join(", ")}.`);
  }
  return {
    accepted: true,
    code: null,
    message: `Campaign may be re-pinned from ${fromPack.descriptor.packVersion} to ${toPack.descriptor.packVersion}.`,
    fromRulesVersion: fromPack.descriptor.rulesVersion,
    toRulesVersion: toPack.descriptor.rulesVersion,
    reviewSha256: diff.reviewSha256,
    references,
    compatibility,
    approvedChangedKeys: approvals,
  };

  function rejected(code: string, message: string): CampaignRepinAssessment {
    return {
      accepted: false,
      code,
      message,
      fromRulesVersion: fromPack.descriptor.rulesVersion,
      toRulesVersion: toPack.descriptor.rulesVersion,
      reviewSha256: diff.reviewSha256,
      references,
      compatibility,
      approvedChangedKeys: approvals,
    };
  }
}

export function resolveCampaignRepin(
  state: LanternCampaignState,
  context: RequestContext,
  clientCommandId: string,
  fromPack: Open5eContentPack,
  toPack: Open5eContentPack,
  confirmedReviewSha256: string,
  approvedChangedKeys: readonly string[] = []
): EngineResolution {
  const assessment = assessCampaignRepin(state, fromPack, toPack, approvedChangedKeys);
  if (!assessment.accepted) return rejection(state, assessment.code ?? "content_repin_rejected", assessment.message, assessment);
  if (confirmedReviewSha256 !== assessment.reviewSha256) {
    return rejection(
      state,
      "content_repin_review_mismatch",
      "The confirmed review hash does not match the current deterministic pack diff.",
      assessment
    );
  }

  const createdAt = new Date().toISOString();
  const next = rewriteCampaignPackHash(state, fromPack.descriptor.packHash, toPack.descriptor.packHash);
  next.rulesVersion = toPack.descriptor.rulesVersion;
  next.version = state.version + 1;
  next.updatedAt = createdAt;
  const message = `Rules pack re-pinned to ${toPack.descriptor.packVersion} after review ${assessment.reviewSha256.slice(0, 12)}.`;
  next.log = [...state.log, { id: randomUUID(), kind: "system" as const, text: message, createdAt }].slice(-40);
  const command: EngineContentRepinCommand = {
    kind: "content_repin",
    fromRulesVersion: fromPack.descriptor.rulesVersion,
    toRulesVersion: toPack.descriptor.rulesVersion,
    reviewSha256: assessment.reviewSha256,
    approvedChangedKeys: assessment.approvedChangedKeys,
  };
  const contentKeys = [...new Set(assessment.references.map((reference) => reference.contentKey))].sort();
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
    contentKeys,
    rolls: [],
    modifiers: [],
    outcome: "content_repin_committed",
    stateChanges: [
      { path: "/rulesVersion", before: state.rulesVersion, after: next.rulesVersion },
      { path: "/contentReferences/packHash", before: fromPack.descriptor.packHash, after: toPack.descriptor.packHash },
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

export function rewriteCampaignPackHash(
  state: LanternCampaignState,
  fromPackHash: string,
  toPackHash: string
): LanternCampaignState {
  const next = cloneCampaign(state);
  rewritePackHashes(next, fromPackHash, toPackHash);
  return next;
}

function rejection(
  state: LanternCampaignState,
  code: string,
  message: string,
  data: CampaignRepinAssessment
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

function visitReferences(
  value: unknown,
  path: string,
  receive: (packHash: string, contentKey: string, path: string) => void
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visitReferences(entry, `${path}/${index}`, receive));
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const packHash = typeof record.packHash === "string" && /^[a-f0-9]{64}$/.test(record.packHash)
    ? record.packHash
    : null;
  if (packHash) {
    for (const key of ["contentKey", "conditionContentKey", "sourceContentKey"]) {
      const contentKey = record[key];
      if (typeof contentKey === "string" && contentKey.startsWith("open5e:")) {
        receive(packHash, contentKey, `${path}/${key}` || `/${key}`);
      }
    }
  }
  for (const [key, child] of Object.entries(record)) visitReferences(child, `${path}/${escapePointer(key)}`, receive);
}

function rewritePackHashes(value: unknown, fromPackHash: string, toPackHash: string): void {
  if (Array.isArray(value)) {
    for (const entry of value) rewritePackHashes(entry, fromPackHash, toPackHash);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (record.packHash === fromPackHash) record.packHash = toPackHash;
  for (const child of Object.values(record)) rewritePackHashes(child, fromPackHash, toPackHash);
}

function escapePointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
