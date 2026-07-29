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
import { generateAssignmentInstructionsForAssignment, generateModuleIntroForAssignment, generateSlidesForAssignment } from "./shared";
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

// generateModuleIntroForAssignment gained an "upcomingAssignmentContext"
// parameter for AC1/AC2 (no-code kickoff reordering) - the module's already-
// generated assignment text must reach the intro's prompt so it actually sets
// students up for what they are about to be asked to do.
describe("generateModuleIntroForAssignment upcomingAssignmentContext (AC1/AC2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("a blank upcomingAssignmentContext (the default) adds nothing extra to the prompt", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "# Module Introduction: Week 1\n\nBody" });

    await generateModuleIntroForAssignment("assignment1", "Week 1", "assignment content", "", "gemini", "coding");

    const prompt = promptFromCall();
    expect(prompt).not.toContain("THIS MODULE'S ASSIGNMENT");
  });

  it("a non-blank upcomingAssignmentContext grounds the prompt in the real assignment text", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "# Module Introduction: Week 1\n\nBody" });

    await generateModuleIntroForAssignment(
      "assignment1",
      "Week 1",
      "assignment content",
      "",
      "gemini",
      "coding",
      "# Build a project charter\n\nStudents will produce a one-page charter."
    );

    const prompt = promptFromCall();
    expect(prompt).toContain("THIS MODULE'S ASSIGNMENT");
    expect(prompt).toContain("Build a project charter");
  });
});

// generateAssignmentInstructionsForAssignment gained a "requiredTools"
// parameter for AC4 - the deck's chosen tool(s) must reach the assignment so
// the two never drift onto different software.
describe("generateAssignmentInstructionsForAssignment requiredTools (AC4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("a blank requiredTools (the default) asks for nothing extra", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "# Assignment\n\nBody" });

    await generateAssignmentInstructionsForAssignment(
      "assignment1",
      "Stakeholder Analysis",
      "README content",
      "",
      "gemini",
      "applied"
    );

    const prompt = promptFromCall();
    expect(prompt).not.toContain("REQUIRED TOOL(S)");
  });

  it("a non-blank requiredTools requires the same tool(s) in the Instructions section", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "# Assignment\n\nBody" });

    await generateAssignmentInstructionsForAssignment(
      "assignment1",
      "Stakeholder Analysis",
      "README content",
      "",
      "gemini",
      "applied",
      "Trello (free plan)"
    );

    const prompt = promptFromCall();
    expect(prompt).toContain("REQUIRED TOOL(S)");
    expect(prompt).toContain("Trello (free plan)");
  });
});

// generateSlidesForAssignment is the third deck-prompt builder AC1 fixes
// (course-planning.ts and course-planning-grounding.ts are the other two).
// It is reached only from buildAssignmentPlan, which is repo-driven (an
// uploaded codebase's READMEs/unit tests) and always passes "coding"
// explicitly - these tests exercise the generator's own kind-awareness
// directly, independent of that one caller's choice.
describe("generateSlidesForAssignment courseKind (AC1/AC2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const deckResponse = (slides: Array<Record<string, unknown>>) =>
    JSON.stringify({ presentationTitle: "T", slides });

  it("defaults to the coding contract when courseKind is omitted", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: deckResponse([{ title: "Example: loops", bullets: ["b"], code: "for x in y: pass", codeLanguage: "python" }]),
    });

    const result = await generateSlidesForAssignment("assignment1", "content", 50, "gemini");
    expect("error" in result).toBe(false);

    const prompt = promptFromCall();
    expect(prompt).toContain("Walkthrough:");
    expect(prompt).not.toContain("NOT a programming course");
  });

  it("an applied course's prompt carries the applied contract, not the coding one", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: deckResponse([{ title: "Principle: Scope", bullets: ["b"], notes: "n" }]),
    });

    const result = await generateSlidesForAssignment("assignment1", "content", 50, "gemini", "applied");
    expect("error" in result).toBe(false);

    const prompt = promptFromCall();
    expect(prompt).toContain("NOT a programming course");
    expect(prompt).toContain("Principle:");
    expect(prompt).not.toContain("Walkthrough:");
  });

  it("strips code from an applied result even if the model returns some", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: deckResponse([{ title: "Example: rogue", bullets: ["b"], code: "print(1)", codeLanguage: "python" }]),
    });

    const result = await generateSlidesForAssignment("assignment1", "content", 50, "gemini", "applied");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.slides.every((s) => s.code === undefined)).toBe(true);
    expect(result.codeViolations).toBe(1);
  });
});
