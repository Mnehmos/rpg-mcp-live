import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const favicon = readFileSync(new URL("./favicon.svg", import.meta.url), "utf8");

describe("player-facing branding", () => {
  it("uses Quest Keeper AI in the page chrome", () => {
    expect(page).toContain("Quest Keeper AI — Your next campaign starts here");
    expect(page).toContain("Quest Keeper AI home");
    expect(page).toContain("QUEST KEEPER <em>/</em> AI <small>LIVE</small>");
    expect(page).not.toContain("Lantern Table");
  });

  it("uses Quest Keeper AI in the favicon accessibility label", () => {
    expect(favicon).toContain('aria-label="Quest Keeper AI"');
    expect(favicon).not.toContain("Lantern Table");
  });
});
