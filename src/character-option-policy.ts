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
 * Falls back to the deployment default when a campaign predates stored
 * policies, rather than returning undefined: undefined means "no filtering at
 * all", and a campaign always has some policy in effect.
 */
export function characterOptionPolicy(
  campaignProfileJson: string | null | undefined,
  fallback: EngineContentPolicy
): Open5eCharacterOptionPolicy {
  return resolverPolicyForCampaign(storedContentPolicy(campaignProfileJson) ?? fallback);
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
