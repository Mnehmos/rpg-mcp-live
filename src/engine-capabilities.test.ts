import { describe, expect, it } from "vitest";
import { createInitialCampaign } from "./engine-domain.js";
import {
  capabilitySchemaOverhead,
  engineCapabilityDescriptors,
  engineCoreToolDefinitions,
  engineCoreToolNames,
  engineToolDefinitionsForLoadedCapabilities,
  isCapabilityFamilyAllowed,
  isToolVisibleForLoadedCapabilities,
} from "./engine-capabilities.js";
import { lanternToolDefinitions } from "./engine-tools.js";

describe("engine capability families", () => {
  it("keeps a compact core surface and loads detailed schemas by family", () => {
    const coreNames = engineCoreToolDefinitions().map((definition) => definition.function.name);
    const combatNames = engineToolDefinitionsForLoadedCapabilities(["combat"]).map((definition) => definition.function.name);

    expect(coreNames).toEqual(engineCoreToolNames.slice().sort((left, right) =>
      lanternToolDefinitions.findIndex((definition) => definition.function.name === left)
      - lanternToolDefinitions.findIndex((definition) => definition.function.name === right)
    ));
    expect(coreNames).not.toContain("combat_start");
    expect(coreNames).toContain("challenge_attempt");
    expect(combatNames).toContain("combat_start");
    expect(combatNames).toContain("campaign_context");
    expect(combatNames).not.toContain("merchant_trade");
    expect(isToolVisibleForLoadedCapabilities("combat_start", ["combat"])).toBe(true);
    expect(isToolVisibleForLoadedCapabilities("combat_start", [])).toBe(false);
  });

  it("reports deterministic before/after schema overhead and stable family metadata", () => {
    const overhead = capabilitySchemaOverhead();
    const descriptors = engineCapabilityDescriptors();

    expect(overhead.fullToolCount).toBe(lanternToolDefinitions.length);
    expect(overhead.coreToolCount).toBe(engineCoreToolDefinitions().length);
    expect(overhead.fullSchemaBytes).toBeGreaterThan(overhead.coreSchemaBytes);
    expect(overhead.estimatedFullSchemaTokens).toBeGreaterThan(overhead.estimatedCoreSchemaTokens);
    expect(descriptors.every((descriptor) => descriptor.revision === 2)).toBe(true);
    expect(new Set(descriptors.map((descriptor) => descriptor.id)).size).toBe(descriptors.length);
    expect(descriptors.every((descriptor) => descriptor.toolCount === descriptor.toolNames.length)).toBe(true);
    expect(descriptors.every((descriptor) => descriptor.promptlet.startsWith(descriptor.id.toUpperCase() + " CAPABILITY (rev 2)."))).toBe(true);
    expect(descriptors.find((descriptor) => descriptor.id === "social")?.promptlet).toContain("Portray every present NPC directly");
    expect(descriptors.find((descriptor) => descriptor.id === "social")?.promptlet).not.toContain("COMBAT CAPABILITY");
  });

  it("binds family loading to the server-assigned DM role and campaign phase", () => {
    const state = createInitialCampaign("account-capabilities", "actor-capabilities");
    expect(isCapabilityFamilyAllowed("rules", state, ["player"])).toBe(false);
    expect(isCapabilityFamilyAllowed("rules", state, ["player", "dm"])).toBe(true);
    expect(isCapabilityFamilyAllowed("combat", state, ["player", "dm"])).toBe(false);
    state.phase = "sandbox";
    expect(isCapabilityFamilyAllowed("combat", state, ["player", "dm"])).toBe(true);
  });

  it("keeps orchestration prose out of model-facing tool descriptions", () => {
    const descriptions = JSON.stringify(lanternToolDefinitions);
    expect(descriptions).not.toMatch(/(?:the\s+)?DM\s+must|must establish the next context|should narrate|must narrate/i);
    expect(lanternToolDefinitions.find((definition) => definition.function.name === "move")?.function.description)
      .toBe("Move through one currently available persisted exit. Returns the committed destination and movement evidence.");
  });
});
