import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OPENING_INSTRUCTION, openingPresenceCopy, renderOpeningPresence, visibleLogEntries } from "./dm-presence.js";

describe("opening DM presence", () => {
  it("makes an immediate contextual inference without claiming campaign state", () => {
    var copy = openingPresenceCopy({
      campaign: { name: "The Salt Road", setting: "a stormbound coast" },
      character: { name: "Mara" },
    }, {});

    expect(copy.inference).toBe("The DM is reading Mara against a stormbound coast and choosing the first pressure that will make both matter.");
    expect(copy.steps).toContain("Opening on a real choice");
  });

  it("labels the quick read as transient and escapes player-authored names", () => {
    var html = renderOpeningPresence({
      campaign: { setting: "<script>coast</script>" },
      character: { name: "<b>Mara</b>" },
    }, {});

    expect(html).toContain("THE DM IS THINKING");
    expect(html).toContain("quick read, not campaign history");
    expect(html).toContain("&lt;b&gt;Mara&lt;/b&gt;");
    expect(html).not.toContain("<script>coast</script>");
  });

  it("offers a visible retry when the opening pauses", () => {
    var html = renderOpeningPresence({}, {}, "error");

    expect(html).toContain("THE OPENING PAUSED");
    expect(html).toContain("data-opening-retry");
  });
});

describe("visible campaign log", () => {
  it("never shows the server opening instruction as a player line", () => {
    const entries = [
      { kind: "system", text: "Campaign created. Your story starts here." },
      { kind: "player", text: OPENING_INSTRUCTION },
      { kind: "narration", text: "The fog came off the water." },
      { kind: "player", text: "I walk to the quay." },
    ];

    expect(visibleLogEntries(entries).map((entry) => entry.text)).toEqual([
      "The fog came off the water.",
      "I walk to the quay.",
    ]);
  });

  it("keeps the campaign-created line until the DM has narrated", () => {
    const entries = [{ kind: "system", text: "Campaign created. Your story starts here." }];
    expect(visibleLogEntries(entries)).toHaveLength(1);
  });

  it("matches the instruction the server sends for the opening turn", () => {
    const server = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
    expect(server).toContain(JSON.stringify(OPENING_INSTRUCTION));
  });
});
