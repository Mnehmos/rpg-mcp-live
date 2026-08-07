import type { EngineContentPolicy } from "../engine-contracts.js";
import type { Open5eContentPack } from "./pack.js";
import type { NormalizedDocument } from "./schema.js";

export interface DeploymentContentPolicy {
  allowedGamesystems: readonly string[];
  allowedLicenses: readonly string[];
  allowedDocuments: readonly string[];
  baseDocuments: readonly string[];
  defaultGamesystem: string;
  defaultBaseDocument: string;
}

export type CampaignContentPolicyCode =
  | "content_gamesystem_forbidden"
  | "content_base_document_forbidden"
  | "content_document_forbidden"
  | "content_document_gamesystem_mismatch"
  | "content_license_forbidden"
  | "content_document_license_mismatch";

export class CampaignContentPolicyError extends Error {
  public constructor(
    public readonly code: CampaignContentPolicyCode,
    message: string
  ) {
    super(message);
    this.name = "CampaignContentPolicyError";
  }
}

export interface Open5eContentCatalogDocument {
  key: string;
  name: string;
  displayName: string;
  gamesystem: string;
  publisher: { key: string; name: string };
  licenseKeys: string[];
  permalink: string;
  documentType: string;
  canBeBase: boolean;
  default: boolean;
}

export interface Open5eContentCatalog {
  packHash: string;
  rulesVersion: string;
  packVersion: string;
  defaultPolicy: EngineContentPolicy;
  allowedGamesystems: string[];
  allowedLicenseKeys: string[];
  documents: Open5eContentCatalogDocument[];
}

export function buildOpen5eContentCatalog(
  pack: Open5eContentPack,
  deployment: DeploymentContentPolicy
): Open5eContentCatalog {
  const documents = normalizedDocuments(pack)
    .filter((document) => deployment.allowedGamesystems.includes(document.gamesystem))
    .filter((document) => deployment.allowedDocuments.length === 0
      || deployment.allowedDocuments.includes(document.sourceKey))
    .filter((document) => document.licenseKeys.some((key) => deployment.allowedLicenses.includes(key)))
    .map<Open5eContentCatalogDocument>((document) => ({
      key: document.sourceKey,
      name: document.name,
      displayName: document.displayName,
      gamesystem: document.gamesystem,
      publisher: { ...document.publisher },
      licenseKeys: [...document.licenseKeys].sort(),
      permalink: document.permalink,
      documentType: document.documentType,
      canBeBase: deployment.baseDocuments.includes(document.sourceKey),
      default: document.sourceKey === deployment.defaultBaseDocument,
    }))
    .sort((left, right) => left.gamesystem.localeCompare(right.gamesystem)
      || left.displayName.localeCompare(right.displayName)
      || left.key.localeCompare(right.key));
  const defaultDocuments = documents
    .filter((document) => document.gamesystem === deployment.defaultGamesystem)
    .filter((document) => document.key === deployment.defaultBaseDocument
      || ["core", "elderberry-inn-icons"].includes(document.key))
    .map((document) => document.key)
    .sort();
  const defaultPolicy = validateCampaignContentPolicy(pack, deployment, {
    gamesystem: deployment.defaultGamesystem,
    baseDocumentKey: deployment.defaultBaseDocument,
    allowedDocumentKeys: defaultDocuments,
    allowedLicenseKeys: deployment.allowedLicenses.filter((license) =>
      documents.some((document) => document.licenseKeys.includes(license))
    ),
  });
  return {
    packHash: pack.descriptor.packHash,
    rulesVersion: pack.descriptor.rulesVersion,
    packVersion: pack.descriptor.packVersion,
    defaultPolicy,
    allowedGamesystems: [...deployment.allowedGamesystems].sort(),
    allowedLicenseKeys: [...deployment.allowedLicenses].sort(),
    documents,
  };
}

export function validateCampaignContentPolicy(
  pack: Open5eContentPack,
  deployment: DeploymentContentPolicy,
  requested: EngineContentPolicy
): EngineContentPolicy {
  const gamesystem = requested.gamesystem.trim();
  const baseDocumentKey = requested.baseDocumentKey.trim();
  const allowedDocumentKeys = [...new Set(requested.allowedDocumentKeys.map((key) => key.trim()).filter(Boolean))].sort();
  const allowedLicenseKeys = [...new Set(requested.allowedLicenseKeys.map((key) => key.trim()).filter(Boolean))].sort();
  if (!deployment.allowedGamesystems.includes(gamesystem)) {
    throw new CampaignContentPolicyError(
      "content_gamesystem_forbidden",
      `Game system ${gamesystem} is not enabled by the deployment policy.`
    );
  }
  if (!deployment.baseDocuments.includes(baseDocumentKey)) {
    throw new CampaignContentPolicyError(
      "content_base_document_forbidden",
      `Document ${baseDocumentKey} is not enabled as a campaign rules base.`
    );
  }
  if (!allowedDocumentKeys.includes(baseDocumentKey)) {
    throw new CampaignContentPolicyError(
      "content_base_document_forbidden",
      "The campaign must enable its base rules document."
    );
  }
  if (allowedLicenseKeys.length === 0 || allowedLicenseKeys.some((key) => !deployment.allowedLicenses.includes(key))) {
    throw new CampaignContentPolicyError(
      "content_license_forbidden",
      "The campaign requested a license outside the deployment policy."
    );
  }
  const documents = new Map(normalizedDocuments(pack).map((document) => [document.sourceKey, document]));
  for (const documentKey of allowedDocumentKeys) {
    if (deployment.allowedDocuments.length > 0 && !deployment.allowedDocuments.includes(documentKey)) {
      throw new CampaignContentPolicyError(
        "content_document_forbidden",
        `Document ${documentKey} is not enabled by the deployment policy.`
      );
    }
    const document = documents.get(documentKey);
    if (!document) {
      throw new CampaignContentPolicyError(
        "content_document_forbidden",
        `Document ${documentKey} is not installed in the active content pack.`
      );
    }
    if (document.gamesystem !== gamesystem) {
      throw new CampaignContentPolicyError(
        "content_document_gamesystem_mismatch",
        `Document ${documentKey} belongs to ${document.gamesystem}; this campaign uses ${gamesystem}.`
      );
    }
    if (!document.licenseKeys.some((key) => allowedLicenseKeys.includes(key))) {
      throw new CampaignContentPolicyError(
        "content_document_license_mismatch",
        `Document ${documentKey} has no license enabled for this campaign.`
      );
    }
  }
  const baseDocument = documents.get(baseDocumentKey);
  if (!baseDocument || baseDocument.gamesystem !== gamesystem) {
    throw new CampaignContentPolicyError(
      "content_base_document_forbidden",
      `Base document ${baseDocumentKey} does not define ${gamesystem}.`
    );
  }
  return { gamesystem, baseDocumentKey, allowedDocumentKeys, allowedLicenseKeys };
}

export function resolverPolicyForCampaign(policy: EngineContentPolicy): {
  gamesystem: string;
  allowedLicenses: readonly string[];
  allowedDocuments: readonly string[];
} {
  return {
    gamesystem: policy.gamesystem,
    allowedLicenses: policy.allowedLicenseKeys,
    allowedDocuments: policy.allowedDocumentKeys,
  };
}

function normalizedDocuments(pack: Open5eContentPack): NormalizedDocument[] {
  return pack.records("documents").map((record) => {
    if (record.kind !== "document") throw new Error("The Open5e document collection contains a non-document record.");
    return record;
  });
}
