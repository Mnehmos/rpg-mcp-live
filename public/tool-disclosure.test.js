import { describe, expect, it } from "vitest";
import { pairToolDisclosureWithNarration, renderToolDisclosure } from "./tool-disclosure.js";

describe("tool disclosure", () => {
  it("weaves a human table receipt into one expandable DM turn", () => {
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
    expect(html).toContain("AT THE TABLE");
    expect(html).toContain("1 table move shaped this moment");
    expect(html).toContain("The scene was framed");
    expect(html).not.toContain("DM tool activity:");
    expect(html).toContain('<details class="table-moves">');
    expect(html).toContain('<details class="tool-call-entry">');
    expect(html).toContain("technical receipt");
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

  it("pairs a tool receipt with the narration that immediately follows it", () => {
    var disclosure = { calls: [{ name: "write_docket", accepted: true }] };
    var entries = [
      { kind: "player", text: "I enter." },
      { kind: "tool", text: "The DM consulted the world.", toolDisclosure: disclosure },
      { kind: "narration", text: "The old door opens." },
    ];

    var paired = pairToolDisclosureWithNarration(entries);

    expect(paired).toHaveLength(2);
    expect(paired[1].entry.text).toBe("The old door opens.");
    expect(paired[1].toolDisclosure).toBe(disclosure);
    expect(paired[1].receiptOnly).toBe(false);
  });

  it("keeps an orphaned receipt visible without inventing narration", () => {
    var disclosure = { calls: [{ name: "scene_manage", accepted: true }] };
    var paired = pairToolDisclosureWithNarration([{ kind: "tool", toolDisclosure: disclosure }]);

    expect(paired).toEqual([{ entry: { kind: "tool", toolDisclosure: disclosure }, toolDisclosure: disclosure, receiptOnly: true }]);
  });
});
