import { describe, it, expect, vi, beforeEach } from "vitest";

// generateAssignmentInstructionsForAssignment and generateModuleIntroForAssignment
// only call callLlm (no auth, no DB) for a non-embedded provider, so only
// callLlm needs mocking to exercise the real prompt-building logic.
vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { callLlm } from "@/lib/llm";
import { generateAssignmentInstructionsForAssignment, generateModuleIntroForAssignment } from "./shared";
import { PLAIN_LANGUAGE_CONTRACT, CONCRETE_DIRECTION_CONTRACT } from "@/lib/artifact-voice";

function promptFromCall(callIndex = 0): string {
  const call = vi.mocked(callLlm).mock.calls[callIndex][0];
  const part = call.contents[0].parts[0];
  return "text" in part ? part.text : "";
}

describe("generateAssignmentInstructionsForAssignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("composes both the plain-language and concrete-direction voice contracts into the prompt", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "# Assignment\n\nBody" });

    const result = await generateAssignmentInstructionsForAssignment(
      "assignment1",
      "Stakeholder Analysis",
      "README content here",
      "",
      "gemini",
      "applied"
    );

    expect("error" in result).toBe(false);

    const prompt = promptFromCall();
    expect(prompt).toContain(PLAIN_LANGUAGE_CONTRACT);
    expect(prompt).toContain(CONCRETE_DIRECTION_CONTRACT);
  });

  it("does not call the LLM at all for the embedded provider (voice contracts are LLM-only)", async () => {
    const result = await generateAssignmentInstructionsForAssignment(
      "assignment1",
      "Stakeholder Analysis",
      "README content here",
      "",
      "embedded",
      "applied"
    );

    expect("error" in result).toBe(false);
    expect(callLlm).not.toHaveBeenCalled();
  });
});

describe("generateModuleIntroForAssignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("composes the plain-language voice contract into the prompt", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "# Module Introduction: Week 1\n\nBody" });

    const result = await generateModuleIntroForAssignment(
      "assignment1",
      "Week 1",
      "assignment content",
      "",
      "gemini",
      "coding"
    );

    expect("error" in result).toBe(false);

    const prompt = promptFromCall();
    expect(prompt).toContain(PLAIN_LANGUAGE_CONTRACT);
  });
});
