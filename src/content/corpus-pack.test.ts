import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildOpen5eContentCatalog,
  CampaignContentPolicyError,
  validateCampaignContentPolicy,
} from "./catalog.js";
import { verifyOpen5eS8Pack } from "./open5e-pack-verify.js";
import { loadOpen5eContentPack } from "./pack.js";
import { ContentAccessError, Open5eContentResolver } from "./resolve.js";
import { loadRulesKernel } from "./rules-kernel.js";

const packDirectory = join(process.cwd(), "content", "open5e", "open5e-v2-full-corpus-s8");

describe("Open5e S8 full-corpus pack", () => {
  it("verifies the pinned corpus and preserves the reviewed S7 kernel", async () => {
    const verified = await verifyOpen5eS8Pack(packDirectory);
    expect(verified.packHash).toBe("fbd846cf7b7833560b22f4ebffaf950fb6b2adf62cf9c6fff469266325ac31fa");
    expect(verified.collections.documents?.raw).toBe(24);
    expect(verified.collections.creatures?.raw).toBe(3_541);
    expect(verified.collections.spells?.raw).toBe(1_955);
    expect(verified.collections.magicitems?.raw).toBe(2_319);
    expect(verified.collections.backgrounds?.compiled).toBe(27);

    const kernel = loadRulesKernel(packDirectory);
    expect(kernel.gamesystem).toBe("5e-2014");
    expect(Object.keys(kernel.skills)).toHaveLength(18);
    expect(Object.keys(kernel.creatures)).toHaveLength(325);
    expect(Object.keys(kernel.spells)).toHaveLength(319);
    expect(Object.keys(kernel.backgrounds)).toHaveLength(27);
    expect(kernel.backgrounds["open5e:background:5e-2014:toh:toh_innkeeper"]?.profile).toMatchObject({
      skillChoice: { count: 1, options: expect.arrayContaining([
        expect.objectContaining({ name: "Intimidation" }),
        expect.objectContaining({ name: "Persuasion" }),
      ]) },
      languageChoiceCount: 2,
    });
    expect(kernel.backgrounds["open5e:background:5e-2014:tdcs:tdcs_fate-touched"]?.profile.selectable).toBe(false);
  });

  it("returns an exact raw tier-zero source while rejecting cross-system and cross-license access", async () => {
    const pack = await loadOpen5eContentPack(packDirectory);
    const a5eKey = "open5e:corpus-reference:a5e:a5e-mm:creatures:a5e-mm_aboleth";
    const a5eResolver = new Open5eContentResolver(pack, {
      gamesystem: "a5e",
      allowedDocuments: ["a5e-mm"],
      allowedLicenses: ["ogl-10a"],
    });
    const resolved = a5eResolver.get(a5eKey, pack.descriptor.rulesVersion);
    expect(resolved.effectiveTier).toBe(0);
    expect(resolved.normalized).toMatchObject({ kind: "corpus-reference", name: "Aboleth" });
    expect(resolved.sourcePayload).toMatchObject({ key: "a5e-mm_aboleth" });

    const crossSystem = new Open5eContentResolver(pack, {
      gamesystem: "5e-2014",
      allowedDocuments: ["a5e-mm"],
      allowedLicenses: ["ogl-10a"],
    });
    expect(() => crossSystem.get(a5eKey, pack.descriptor.rulesVersion)).toThrowError(
      expect.objectContaining<Partial<ContentAccessError>>({ code: "content_gamesystem_forbidden" })
    );

    const ccOnly = new Open5eContentResolver(pack, {
      gamesystem: "5e-2014",
      allowedDocuments: ["tob3"],
      allowedLicenses: ["cc-by-40"],
    });
    expect(() => ccOnly.get(
      "open5e:corpus-reference:5e-2014:tob3:creatures:tob3_abaasy",
      pack.descriptor.rulesVersion
    )).toThrowError(expect.objectContaining<Partial<ContentAccessError>>({ code: "content_license_forbidden" }));
  });

  it("builds a player-facing catalog under a deployment ceiling", async () => {
    const pack = await loadOpen5eContentPack(packDirectory);
    const deployment = {
      allowedGamesystems: ["5e-2014", "5e-2024", "a5e"],
      allowedLicenses: ["cc-by-40", "cc0", "ogl-10a"],
      allowedDocuments: pack.manifest.documents.map((document) => document.key),
      baseDocuments: ["srd-2014", "srd-2024", "a5e-ag", "bfrd"],
      defaultGamesystem: "5e-2014",
      defaultBaseDocument: "srd-2014",
    } as const;
    const catalog = buildOpen5eContentCatalog(pack, deployment);
    expect(catalog.documents).toHaveLength(24);
    expect(catalog.allowedGamesystems).toEqual(["5e-2014", "5e-2024", "a5e"]);
    expect(catalog.defaultPolicy).toMatchObject({
      gamesystem: "5e-2014",
      baseDocumentKey: "srd-2014",
    });

    expect(() => validateCampaignContentPolicy(pack, deployment, {
      gamesystem: "a5e",
      baseDocumentKey: "a5e-ag",
      allowedDocumentKeys: ["a5e-ag", "tob3"],
      allowedLicenseKeys: ["ogl-10a"],
    })).toThrowError(expect.objectContaining<Partial<CampaignContentPolicyError>>({
      code: "content_document_gamesystem_mismatch",
    }));
  });
});
