import { describe, expect, it } from "vitest";
import { buildSceneChoicesMessages, parseChoicesModels, parseSceneChoices } from "./scene-choices.js";

describe("scene choices", () => {
  it("parses the JSON object, a bare array, and fenced or chatty replies", () => {
    const choice = { label: "Enter the cave", prompt: "I wade into the cave." };
    expect(parseSceneChoices(JSON.stringify({ choices: [choice] }))).toEqual([choice]);
    expect(parseSceneChoices(JSON.stringify([choice]))).toEqual([choice]);
    expect(parseSceneChoices("Here you go:\n```json\n" + JSON.stringify({ choices: [choice] }) + "\n```")).toEqual([choice]);
  });

  it("drops blank, duplicate, and malformed choices", () => {
    expect(parseSceneChoices(JSON.stringify({ choices: [
      { label: " Enter the cave ", prompt: " I wade in. " },
      { label: "enter the cave", prompt: "Again." },
      { label: "", prompt: "No label." },
      { label: "No prompt" },
      "nonsense",
    ] }))).toEqual([{ label: "Enter the cave", prompt: "I wade in." }]);
    expect(parseSceneChoices("not json")).toEqual([]);
    expect(parseSceneChoices(null)).toEqual([]);
  });

  it("gives the model recent play and the scene the choices belong to", () => {
    const messages = buildSceneChoicesMessages(
      [
        { id: "1", kind: "system", text: "Campaign created.", createdAt: "" },
        { id: "2", kind: "narration", text: "The satchel hangs open.", createdAt: "" },
      ],
      "I follow the prints.",
      "A light moves in the cave.",
    );
    expect(messages[0].role).toBe("system");
    expect(messages[1].content).not.toContain("Campaign created.");
    expect(messages[1].content).toContain("DM: The satchel hangs open.");
    expect(messages[1].content).toContain("PLAYER: I follow the prints.");
    expect(messages[1].content).toMatch(/A light moves in the cave\.$/);
  });

  it("reads a comma-separated model list, empty meaning off", () => {
    expect(parseChoicesModels("inception/mercury-3, google/gemini-2.5-flash-lite")).toEqual(["inception/mercury-3", "google/gemini-2.5-flash-lite"]);
    expect(parseChoicesModels("")).toEqual([]);
  });
});
