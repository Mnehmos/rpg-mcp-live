import { describe, expect, it } from "vitest";
import { openingPresenceCopy, renderOpeningPresence } from "./dm-presence.js";

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
