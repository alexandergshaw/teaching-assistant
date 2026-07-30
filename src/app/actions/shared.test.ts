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
import { renderMilestoneContract, PROJECT_CHOICE_CONTRACT, type MilestoneBrief } from "@/lib/course-project";

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

// docs/REGRESSION.md 146 (AC1/AC2/AC3/AC4/AC7): generateAssignmentInstructionsForAssignment
// gained a "milestone" parameter so a course-long project's per-week
// assignments chain together instead of each restarting from scratch.
describe("generateAssignmentInstructionsForAssignment course-project milestone (AC1/AC2/AC3/AC4/AC7)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const firstMilestone: MilestoneBrief = {
    projectName: "Harden a small-business network",
    projectDefinition: "Assess and harden one small business.",
    week: 1,
    title: "Scope and asset inventory",
    deliverable: "An asset register",
    priorTitles: [],
  };

  const laterMilestone: MilestoneBrief = {
    projectName: "Harden a small-business network",
    projectDefinition: "Assess and harden one small business.",
    week: 3,
    title: "Threat model draft",
    deliverable: "A threat model document",
    priorTitles: ["Scope and asset inventory"],
  };

  // AC1: no project set (the default null) must change nothing - the same
  // "no-op unless a caller opts in" guarantee every other optional parameter
  // here (requiredTools, templateText) already has.
  it("a null milestone (the default) adds no COURSE PROJECT block", async () => {
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
    expect(prompt).not.toContain("COURSE PROJECT");
  });

  // AC1/AC7: the milestone sentence and the choice/rigor rule are pushed
  // together, VERBATIM, exactly once - not restated as separate paraphrases.
  it("composes renderMilestoneContract and PROJECT_CHOICE_CONTRACT verbatim when a milestone is supplied", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "# Assignment\n\nBody" });

    await generateAssignmentInstructionsForAssignment(
      "assignment1",
      "Stakeholder Analysis",
      "README content",
      "",
      "gemini",
      "applied",
      "",
      laterMilestone
    );

    const prompt = promptFromCall();
    expect(prompt).toContain(renderMilestoneContract(laterMilestone));
    expect(prompt).toContain(PROJECT_CHOICE_CONTRACT);
  });

  // AC1: prior weeks' milestones must actually reach the prompt, and the
  // prompt must say to EXTEND them, not just note they happened.
  it("carries prior-week milestone titles and the build-on instruction", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "# Assignment\n\nBody" });

    await generateAssignmentInstructionsForAssignment(
      "assignment1",
      "Stakeholder Analysis",
      "README content",
      "",
      "gemini",
      "applied",
      "",
      laterMilestone
    );

    const prompt = promptFromCall();
    expect(prompt).toContain("Scope and asset inventory");
    expect(prompt).toContain("BUILD ON");
    expect(prompt).toContain("do not restart it from scratch");
  });

  // AC4: week 1 has nothing behind it - the prompt must say so plainly and
  // must never claim prior work exists or ask the student to build on
  // something they have not made yet.
  it("week 1 says plainly that there is nothing to build on yet", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "# Assignment\n\nBody" });

    await generateAssignmentInstructionsForAssignment(
      "assignment1",
      "Stakeholder Analysis",
      "README content",
      "",
      "gemini",
      "applied",
      "",
      firstMilestone
    );

    const prompt = promptFromCall();
    expect(prompt).toContain("first milestone");
    expect(prompt).not.toContain("Earlier milestones are already done");
    expect(prompt).not.toContain("BUILD ON");
  });

  // AC4 (pivot): the choice/rigor rule must tell the model to follow the
  // student's CURRENT direction, never penalize a change, and never assume a
  // specific prior artifact this prompt was not told about.
  it("the choice/rigor rule covers a mid-project pivot without inventing a prior artifact", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "# Assignment\n\nBody" });

    await generateAssignmentInstructionsForAssignment(
      "assignment1",
      "Stakeholder Analysis",
      "README content",
      "",
      "gemini",
      "applied",
      "",
      laterMilestone
    );

    const prompt = promptFromCall();
    expect(prompt).toContain("CURRENT direction");
    expect(prompt).toContain("never penalize a change of direction");
  });

  // AC2/AC3: the subject is the student's choice, but the deliverable's rigor
  // is fixed regardless of which subject they pick.
  it("gives the student an explicit choice point while fixing the rigor bar", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "# Assignment\n\nBody" });

    await generateAssignmentInstructionsForAssignment(
      "assignment1",
      "Stakeholder Analysis",
      "README content",
      "",
      "gemini",
      "applied",
      "",
      laterMilestone
    );

    const prompt = promptFromCall();
    expect(prompt).toContain("STUDENT CHOICE WITHIN THE PROJECT");
    expect(prompt).toContain("do not invent or assume a particular company, dataset, or scenario yourself");
    expect(prompt).toContain("RIGOR IS NOT NEGOTIABLE");
    expect(prompt).toContain("the subject is open, the competency demonstrated is not");
  });

  // AC5: composition with the tool rule - both must survive together, since
  // an applied project-based week still owes the same free-tool commitment.
  it("composes alongside REQUIRED TOOL(S) rather than replacing it", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "# Assignment\n\nBody" });

    await generateAssignmentInstructionsForAssignment(
      "assignment1",
      "Stakeholder Analysis",
      "README content",
      "",
      "gemini",
      "applied",
      "Trello (free plan)",
      laterMilestone
    );

    const prompt = promptFromCall();
    expect(prompt).toContain("REQUIRED TOOL(S)");
    expect(prompt).toContain("Trello (free plan)");
    expect(prompt).toContain("COURSE PROJECT");
  });

  // The embedded (no-LLM) scaffold path has no prompt to compose into at all.
  it("embedded provider never calls the LLM even with a milestone set", async () => {
    const result = await generateAssignmentInstructionsForAssignment(
      "assignment1",
      "Stakeholder Analysis",
      "README content",
      "",
      "embedded",
      "applied",
      "",
      laterMilestone
    );

    expect("error" in result).toBe(false);
    expect(callLlm).not.toHaveBeenCalled();
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
