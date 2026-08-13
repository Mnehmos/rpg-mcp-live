import { resolverPolicyForCampaign } from "./content/catalog.js";
import type { EngineCampaignCreate, EngineContentPolicy } from "./engine-contracts.js";
import type { Open5eCharacterOptionPolicy } from "./open5e-rules.js";

/**
 * The content policy that should constrain a campaign's character builder.
 *
 * The browser has always sent `?campaignId=` to /api/character-options and
 * cached the result per campaign, but the server ignored it and returned every
 * species and class in the rules kernel — so a campaign that enabled only SRD
 * sources still offered options from documents it had not enabled. The
 * filtering existed in open5eCharacterOptions the whole time; nothing was
 * passing it a policy.
 *
 * The stored policy is re-validated rather than trusted. Campaigns created
 * before creation-time validation existed can hold a schema-valid but
 * deployment-invalid policy, and the same happens whenever a deployment's
 * allowlists later narrow. Serving that policy unchanged would let an old
 * campaign keep offering documents this deployment is no longer permitted to
 * serve — the ceiling enforced for new campaigns has to apply to old ones too.
 *
 * `validate` is injected rather than imported so this stays testable without
 * loading a content pack.
 */
export function characterOptionPolicy(
  campaignProfileJson: string | null | undefined,
  fallback: EngineContentPolicy,
  validate: (policy: EngineContentPolicy) => EngineContentPolicy
): Open5eCharacterOptionPolicy {
  const stored = storedContentPolicy(campaignProfileJson);
  if (!stored) return resolverPolicyForCampaign(fallback);

  try {
    return resolverPolicyForCampaign(validate(stored));
  } catch (error) {
    // Fall back rather than fail: the player should still be able to build a
    // character, just within what the deployment currently permits.
    console.warn(
      "Stored campaign content policy is not valid for the current deployment; " +
        "falling back to the deployment default.",
      error instanceof Error ? error.message : error
    );
    return resolverPolicyForCampaign(fallback);
  }
}

function storedContentPolicy(campaignProfileJson: string | null | undefined): EngineContentPolicy | null {
  if (!campaignProfileJson) return null;
  try {
    const profile = JSON.parse(campaignProfileJson) as EngineCampaignCreate;
    return profile?.contentPolicy ?? null;
  } catch {
    // A profile row that will not parse is a storage problem, not a reason to
    // hand the player an unfiltered content list.
    return null;
  }
}
