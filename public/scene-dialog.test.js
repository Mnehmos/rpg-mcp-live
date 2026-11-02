import { describe, expect, it } from "vitest";
import { composeEventTurn, eventCopy, plainProse } from "./scene-dialog.js";

const marla = { kind: "npc", name: "Marla Tull", prompt: "I walk over to Marla Tull and speak with them." };
const narrated = { kind: "feature", shape: "person", name: "Hesper Quill", prompt: "I walk over to Hesper Quill and speak with them." };
const satchel = { kind: "feature", shape: "crate", name: "the courier's satchel", description: "The strap was cut clean.", prompt: "I examine the courier's satchel." };

describe("3D mode events", () => {
  it("asks the right question for who or what the hero walked up to", () => {
    expect(eventCopy(marla)).toEqual({ title: "Marla Tull", placeholder: "What do you say to Marla Tull?", quick: "Just talk" });
    expect(eventCopy(narrated).placeholder).toBe("What do you say to Hesper Quill?");
    expect(eventCopy(satchel)).toMatchObject({ placeholder: "What do you do with the courier's satchel?", quick: "Examine it" });
    expect(eventCopy({ kind: "enemy", name: "Drowned Man" }).placeholder).toBe("What do you do about Drowned Man?");
    expect(eventCopy(null)).toEqual({ title: "Your move", placeholder: "What do you do?", quick: null });
  });

  it("turns words typed at a person into speech, and keeps first-person moves as they are", () => {
    expect(composeEventTurn(marla, "Which way did Kessick row?")).toBe("I say to Marla Tull, \"Which way did Kessick row?\"");
    expect(composeEventTurn(narrated, "\"Show me the glass.\"")).toBe("I say to Hesper Quill, \"Show me the glass.\"");
    expect(composeEventTurn(marla, "I hand Marla my flask.")).toBe("I hand Marla my flask.");
  });

  it("anchors other actions to the thing the hero is at", () => {
    expect(composeEventTurn(satchel, "open it and look for the letter")).toBe("At the courier's satchel: open it and look for the letter");
    expect(composeEventTurn(satchel, "I sniff the wax")).toBe("I sniff the wax (at the courier's satchel)");
  });

  it("falls back to the default move when nothing is typed, and passes free actions through", () => {
    expect(composeEventTurn(satchel, "  ")).toBe("I examine the courier's satchel.");
    expect(composeEventTurn(null, "I light a torch.")).toBe("I light a torch.");
  });

  it("shows the DM's words without markdown marks", () => {
    expect(plainProse("the *sound* of **them**, _quietly_\n## Later")).toBe("the sound of them, quietly\nLater");
    expect(plainProse("2*3*4")).toBe("2*3*4");
  });
});
