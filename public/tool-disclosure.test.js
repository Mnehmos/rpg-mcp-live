import { describe, expect, it } from "vitest";
import { renderToolDisclosure } from "./tool-disclosure.js";

describe("tool disclosure", () => {
  it("surfaces the spoiler warning and keeps call details click-to-expand", () => {
    var html = renderToolDisclosure({
      spoilerWarning: "Spoiler warning: inspect carefully.",
      calls: [{
        name: "scene_manage",
        arguments: { action: "set", sceneId: "scene-1" },
        result: { accepted: true, description: "A hidden vault opens." },
        accepted: true,
      }],
    });

    expect(html).toContain("Spoiler warning: inspect carefully.");
    expect(html).toContain("DM tool activity: ");
    expect(html).toContain('<details class="tool-call-entry">');
    expect(html).toContain("Click a call to inspect its arguments and engine result.");
    expect(html).toContain("A hidden vault opens.");
  });

  it("escapes tool payloads before putting them in the HTML", () => {
    var html = renderToolDisclosure({
      spoilerWarning: "Spoiler <warning>",
      calls: [{
        name: "<scene>",
        arguments: { description: "<script>alert(1)</script>" },
        result: "<b>spoiler</b>",
        accepted: false,
      }],
    });

    expect(html).toContain("&lt;scene&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
