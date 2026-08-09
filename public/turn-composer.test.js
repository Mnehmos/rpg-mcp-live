import { describe, expect, it, vi } from "vitest";
import {
  composerSubmission,
  settleComposer,
} from "./turn-composer.js";

describe("turn composer", () => {
  it("clears the successful turn and resets its counter", () => {
    const input = { value: "I distract the lanista.", maxLength: 2000 };
    const counter = { textContent: "23 / 2000" };

    expect(settleComposer(input, counter, true)).toBe(true);
    expect(input.value).toBe("");
    expect(counter.textContent).toBe("0 / 2000");

    input.value = "I try again.";
    expect(settleComposer(input, counter, false)).toBe(false);
    expect(input.value).toBe("I try again.");
  });

  it("reuses one command id for an unchanged retry and replaces it after an edit", () => {
    const createCommandId = vi.fn()
      .mockReturnValueOnce("command-1")
      .mockReturnValueOnce("command-2");
    const first = composerSubmission(null, "campaign-a", "I distract the lanista.", createCommandId);
    const retry = composerSubmission(first, "campaign-a", "I distract the lanista.", createCommandId);
    const edited = composerSubmission(retry, "campaign-a", "I call to Titus.", createCommandId);

    expect(retry).toBe(first);
    expect(edited.clientCommandId).toBe("command-2");
    expect(createCommandId).toHaveBeenCalledTimes(2);
  });

  it("replaces the command id when the active campaign changes", () => {
    const createCommandId = vi.fn()
      .mockReturnValueOnce("command-a")
      .mockReturnValueOnce("command-b");
    const first = composerSubmission(null, "campaign-a", "I wait.", createCommandId);
    const nextCampaign = composerSubmission(first, "campaign-b", "I wait.", createCommandId);

    expect(nextCampaign.clientCommandId).toBe("command-b");
    expect(createCommandId).toHaveBeenCalledTimes(2);
  });
});
