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
import { renderMilestoneContract, projectChoiceContract, type MilestoneBrief } from "@/lib/course-project";
import { COMMITTED_TOOLSET_RULE } from "@/lib/course-kind";

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

  // Tool-churn fix (docs/REGRESSION.md): requiredTools now names the COURSE's
  // committed toolset, so the prompt must state the shared adherence policy
  // (default to it; only add a new tool with a stated reason) rather than the
  // old, stricter "do not introduce a different tool" - the same
  // COMMITTED_TOOLSET_RULE constant every tool-naming prompt in the app now
  // composes.
  it("composes the shared COMMITTED_TOOLSET_RULE adherence policy, not a standalone paraphrase", async () => {
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
    expect(prompt).toContain(COMMITTED_TOOLSET_RULE);
  });
});

// Off-domain-resources fix (docs/REGRESSION.md): a real generated Project
// Management assignment cited FreeCodeCamp (week 1) and W3Schools (week 8) in
// its "Helpful Free Resources" section - developer-education sites are
// off-register for an applied field. The rule must be course-kind aware.
//
// RCA regression (docs/REGRESSION.md entry 156): the prompt used to ALSO ask
// the model to write its own "Helpful Free Resources" section (with
// freeResourceSourceRule's course-kind text folded into that ask), so every
// LLM-generated sheet ended up with the heading twice - the model's own
// linkless list, then code's appended, curated one under the identical
// heading. The model is no longer asked for that section at all (below);
// the course-kind distinction freeResourceSourceRule used to state to the
// model now governs the CURATED resolver's own field-source choice instead
// (renderHelpfulFreeResourcesSection's `kind` parameter, resource-links.ts -
// see resource-links.test.ts's "course-kind gating" tests for that half).
describe("generateAssignmentInstructionsForAssignment Helpful Free Resources course-kind gating (AC6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("the prompt no longer asks the model to write a Helpful Free Resources section, for either course kind", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "# Assignment\n\nBody" });
    await generateAssignmentInstructionsForAssignment("assignment1", "Loops", "README content", "", "gemini", "coding");
    const codingPrompt = promptFromCall();

    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "# Assignment\n\nBody" });
    await generateAssignmentInstructionsForAssignment("assignment1", "Budgeting", "README content", "", "gemini", "applied");
    const appliedPrompt = promptFromCall(1);

    for (const prompt of [codingPrompt, appliedPrompt]) {
      expect(prompt).not.toContain('Include a "Helpful Free Resources" section');
      expect(prompt).not.toContain("Do NOT cite programming-education sites");
      expect(prompt).not.toContain("freeCodeCamp");
      // The no-URL prohibition survives the section being removed.
      expect(prompt).toContain("MUST NEVER write a URL");
    }
  });

  it("a coding course's assembled document never surfaces an applied-only professional body, even when the README names one", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "# Assignment\n\nBody" });

    const result = await generateAssignmentInstructionsForAssignment(
      "assignment1",
      "Loops",
      "This course follows PMI's guide to project management.",
      "",
      "gemini",
      "coding"
    );

    expect("error" in result).toBe(false);
    const text = "text" in result ? result.text : "";
    expect(text).not.toContain("pmi.org");
  });

  it("an applied course's assembled document surfaces the field's own professional body named in the README", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "# Assignment\n\nBody" });

    const result = await generateAssignmentInstructionsForAssignment(
      "assignment1",
      "Budgeting",
      "This course follows PMI's guide to project management.",
      "",
      "gemini",
      "applied"
    );

    expect("error" in result).toBe(false);
    const text = "text" in result ? result.text : "";
    expect(text).toContain("pmi.org");
  });
});

// RCA regression (docs/REGRESSION.md entry 156): every LLM-generated
// assignment sheet used to end up with "## Helpful Free Resources" TWICE -
// the model wrote its own linkless version (per the old prompt instruction),
// then code appended its own curated one under the identical heading. Pins
// that a real generated document carries the heading exactly once now that
// the model is never asked to write it.
describe("generateAssignmentInstructionsForAssignment Helpful Free Resources appears exactly once", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("the assembled document contains '## Helpful Free Resources' exactly once", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: "# Stakeholder Analysis\n\n## Assignment Overview\nDo the thing.\n\n## Instructions\n- Do step one\n\n## Requirements\n- Meet the spec\n\n## Deliverables\n- Submit the file",
    });

    const result = await generateAssignmentInstructionsForAssignment(
      "assignment1",
      "Stakeholder Analysis",
      "README content",
      "",
      "gemini",
      "applied"
    );

    expect("error" in result).toBe(false);
    const text = "text" in result ? result.text : "";
    const occurrences = text.split("## Helpful Free Resources").length - 1;
    expect(occurrences).toBe(1);
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
  it("composes renderMilestoneContract and projectChoiceContract verbatim when a milestone is supplied", async () => {
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
    // laterMilestone.priorTitles is non-empty - the LATER-milestone branch.
    expect(prompt).toContain(projectChoiceContract(false));
  });

  // "Subject chosen once" fix: the ROOT bug a real generated course showed -
  // week 8's assignment re-offered a fresh set of subject-choice examples
  // ("Select a specific infrastructure project subject to budget for this
  // assignment. Examples include: a community garden ...") even though the
  // SAME assignment's own milestone sentence said to build on the student's
  // existing work. The prompt for a non-first week must never invite the
  // student to choose a subject again.
  describe("the subject is chosen ONCE, at the first milestone (subject-chosen-once fix)", () => {
    it("a non-first week's prompt uses the LATER-milestone branch, not the first-milestone one", async () => {
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
      expect(prompt).toContain("already chosen by the student at an earlier milestone");
      expect(prompt).toContain("do NOT ask the student to select, choose, or pick a project subject again");
      expect(prompt).not.toContain("give the student an explicit choice point for it now");
    });

    it("the first milestone's prompt DOES give an explicit choice point, and carries no re-offer prohibition", async () => {
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
      expect(prompt).toContain("give the student an explicit choice point for it now");
      expect(prompt).not.toContain("already chosen by the student at an earlier milestone");
    });

    // AC4: the concrete-direction/example requirement still governs THIS
    // week's own task (already asserted for every week via item 10 /
    // CONCRETE_DIRECTION_CONTRACT) - the fix only stops it from being
    // redirected at re-picking the subject on a later week.
    it("a non-first week still requires concrete direction for its own task, just not for the subject", async () => {
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
      expect(prompt).toContain(CONCRETE_DIRECTION_CONTRACT);
      expect(prompt).toContain("HOW the student approaches this week's specific task");
    });
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

  // AC2/AC3: the FIRST milestone gives the student an explicit choice point
  // while fixing the rigor bar.
  it("gives the student an explicit choice point while fixing the rigor bar (first milestone)", async () => {
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
    expect(prompt).toContain("STUDENT CHOICE WITHIN THE PROJECT");
    expect(prompt).toContain("do not invent or assume a particular company, dataset, or scenario yourself");
    expect(prompt).toContain("RIGOR IS NOT NEGOTIABLE");
    expect(prompt).toContain("the subject is open, the competency demonstrated is not");
  });

  // AC3: the rigor bar is fixed on a LATER milestone too, even though the
  // choice point itself is no longer re-offered there.
  it("fixes the rigor bar on a later milestone as well, without re-offering the choice point", async () => {
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
