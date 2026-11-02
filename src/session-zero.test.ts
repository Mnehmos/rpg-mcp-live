import { describe, expect, it } from "vitest";
import { pickRandomQuickstartPreset, getQuickstartPreset } from "./quickstarts.js";
import { buildSceneChoicesMessages, SESSION_ZERO_CHOICES_SYSTEM_PROMPT } from "./scene-choices.js";
import { isSessionZeroActive, SESSION_ZERO_AGENDA, SESSION_ZERO_COMPLETE_HEADING } from "./session-zero.js";
import { getStarterScene } from "./starter-scenes.js";
import type { StoredLogMessage } from "./reference-engine-store.js";

const welcome: StoredLogMessage = {
  id: "1",
  kind: "narration",
  text: "Welcome to the table.",
  createdAt: "",
  starter: { roomId: "r", roomName: "The Unwritten Map", sceneId: null, title: "Session Zero", sessionZero: true },
};

describe("session zero", () => {
  it("is offered as a quickstart with a welcome that asks the first question", () => {
    expect(getQuickstartPreset("session-zero")?.title).toBe("Build a World Together");
    const starter = getStarterScene("session-zero");
    expect(starter?.sessionZero).toBe(true);
    expect(starter?.narration).toContain("what kind of story are we telling?");
    expect(starter?.firstMoves.length).toBeGreaterThanOrEqual(3);
  });

  it("is never picked by Play now", () => {
    for (let index = 0; index < 50; index += 1) expect(pickRandomQuickstartPreset().id).not.toBe("session-zero");
  });

  it("runs from the welcome until the DM records completion in the campaign docket", () => {
    expect(isSessionZeroActive([welcome], "")).toBe(true);
    expect(isSessionZeroActive([welcome], `# World\nA drowned kingdom.\n${SESSION_ZERO_COMPLETE_HEADING}`)).toBe(false);
    expect(isSessionZeroActive([{ ...welcome, starter: { ...welcome.starter!, sessionZero: undefined } }], "")).toBe(false);
  });

  it("tells the DM how to finish and hand over to play", () => {
    expect(SESSION_ZERO_AGENDA).toContain(SESSION_ZERO_COMPLETE_HEADING);
    expect(SESSION_ZERO_AGENDA).toContain("character_manage update");
    expect(SESSION_ZERO_AGENDA).toMatch(/lines.*veils/i);
  });

  it("asks the choices model for answers, not actions", () => {
    expect(buildSceneChoicesMessages([], "Heroic.", "What is the land like?", true)[0].content).toBe(SESSION_ZERO_CHOICES_SYSTEM_PROMPT);
  });
});
