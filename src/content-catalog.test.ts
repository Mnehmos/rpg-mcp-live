import { describe, expect, it } from "vitest";
import { buildOpen5eContentCatalog, type DeploymentContentPolicy } from "./content/catalog.js";
import { loadInstalledOpen5ePackRegistry } from "./content/registry.js";
import { config } from "./config.js";

/**
 * Guards the campaign creation form's Rules & Sources panel.
 *
 * The catalog was once a hardcoded stub with `documents: []`, left behind when
 * the reference-only runtime migration removed the Lantern engine that used to
 * build it. Nothing failed loudly — the endpoint still returned a well-formed
 * catalog with a real pack hash — but every dropdown in the campaign form was
 * empty, because the UI only offers a game system that has at least one
 * base-capable document.
 *
 * These assertions are deliberately about *shape reaching the UI*, not about
 * which specific documents ship: a pack repin may change the titles, and that
 * should not fail the build. An empty catalog should.
 */
describe("Open5e content catalog", () => {
  const policy: DeploymentContentPolicy = {
    defaultGamesystem: config.contentGamesystem,
    defaultBaseDocument: config.contentDefaultBaseDocument,
    allowedGamesystems: config.contentAllowedGamesystems,
    allowedLicenses: config.contentAllowedLicenses,
    allowedDocuments: config.contentAllowedDocuments,
    baseDocuments: config.contentBaseDocuments,
  };

  async function catalog() {
    const registry = await loadInstalledOpen5ePackRegistry();
    return buildOpen5eContentCatalog(registry.activePack, policy);
  }

  it("serves at least one document, so the form is not empty", async () => {
    expect((await catalog()).documents.length).toBeGreaterThan(0);
  });

  it("offers a game system that has a base-capable document", async () => {
    const built = await catalog();

    // Mirrors renderContentCatalog(): a system only appears in the dropdown
    // when something in it can serve as the rules base.
    const systems = built.allowedGamesystems.filter((gamesystem) =>
      built.documents.some((document) => document.gamesystem === gamesystem && document.canBeBase)
    );

    expect(systems).toContain(config.contentGamesystem);
  });

  it("offers the configured default base document as a rules base", async () => {
    const built = await catalog();
    const bases = built.documents.filter((document) => document.canBeBase).map((document) => document.key);

    expect(bases).toContain(config.contentDefaultBaseDocument);
  });

  it("reports the installed pack hash rather than a placeholder", async () => {
    expect((await catalog()).packHash).toMatch(/^[0-9a-f]{16,}$/i);
  });

  it("produces a default policy whose base document is also enabled", async () => {
    const { defaultPolicy } = await catalog();

    // validateCampaignContentPolicy rejects a base that is not in the enabled
    // set, so a catalog whose own default violated that would fail every
    // campaign creation.
    expect(defaultPolicy.allowedDocumentKeys).toContain(defaultPolicy.baseDocumentKey);
  });

  it("only exposes documents whose licenses the deployment allows", async () => {
    const built = await catalog();

    for (const document of built.documents) {
      expect(document.licenseKeys.some((key) => built.allowedLicenseKeys.includes(key))).toBe(true);
    }
  });
});
