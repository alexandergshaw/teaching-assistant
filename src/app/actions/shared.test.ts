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
import { WORKED_EXAMPLE_CONTRACT } from "@/lib/worked-example-contract";
import {
  renderMilestoneContract,
  projectChoiceContract,
  PROJECT_HANDS_ON_CONTRACT,
  type MilestoneBrief,
} from "@/lib/course-project";
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

// U1/U2/U3: the core "lack of direction or examples" complaint - worked
// examples showing one row, no stated size/effort/self-check, and a tools
// block listing the whole committed toolset regardless of what the
// assignment actually uses.
describe("generateAssignmentInstructionsForAssignment direction and examples (U1/U2/U3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // U1: a real generated assignment's worked example was a single task row
  // (Task/Predecessor/Duration) that taught formatting, not the critical-path
  // skill being assessed. WORKED_EXAMPLE_CONTRACT overrides
  // CONCRETE_DIRECTION_CONTRACT's "a single filled-in row" scope for this
  // prompt so the example must be a complete small instance plus its result.
  it("composes WORKED_EXAMPLE_CONTRACT into the prompt (U1: examples must show a complete instance, not one row)", async () => {
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
    expect(prompt).toContain(WORKED_EXAMPLE_CONTRACT);
  });

  // U2-AC1/AC2: every assignment must state the deliverable's expected size
  // and effort - Week 5 asked for "a project timeline document" with no
  // indication of how many tasks or how long it should take.
  it("requires an Expected Scope and Effort section stating concrete size and an effort estimate (U2-AC1/AC2)", async () => {
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
    expect(prompt).toContain("Expected Scope and Effort");
    expect(prompt).toContain("expected SIZE in concrete, countable terms");
    expect(prompt).toContain("(estimate)");
  });

  // U2-AC3: a self-check the student can actually run before submitting,
  // modeled on the opener generator's existing solution/debrief pattern -
  // 4-6 checkable statements tied to THIS assignment's own requirements, not
  // generic advice.
  it("requires a 'Before You Submit' self-check section tied to this assignment's own requirements (U2-AC3)", async () => {
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
    expect(prompt).toContain("Before You Submit");
    expect(prompt).toContain("4-6 short, checkable statements");
    expect(prompt).toContain("never generic advice");
  });

  // rubrics-must-not-appear-in-generated-files fix: a real generated course
  // (BIT 320) showed the SAME tiered rubric criteria text duplicated into the
  // standalone Grading Rubric.docx (steps.rubrics.ts's "lms-rubric" step) AND
  // into every single week's Assignment Instructions document - this function
  // used to be the source of the second copy (the U2-AC4/Y1 history below is
  // what it replaces): it appended a "## Grading Rubric" section built from
  // generateEmbeddedRubricText/buildRubricFromInstructions
  // (embedded-grader/rubric.ts). That append is gone; these tests pin that it
  // stays gone. generateEmbeddedRubricText itself is untouched (it still
  // backs the standalone rubric document and the grading engine independently
  // of this document's text) - see embedded-grader/rubric.test.ts for its own
  // course-kind-awareness (Y1) coverage, which this function no longer needs
  // to re-verify end to end now that it never calls that generator at all.
  describe("AC1: no rubric or performance-level descriptors are appended to the assignment document", () => {
    it("never appends a '## Grading Rubric' heading, even for generated text with clear checkable requirements that used to drive rubric extraction", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        text:
          "# Project Schedule\n\n## Assignment Overview\nBuild a schedule.\n\n## Instructions\n" +
          "- Build a work breakdown structure with at least 12 tasks.\n" +
          "- Identify the critical path.\n\n## Requirements\n" +
          "- Include at least three dependencies.\n\n## Deliverables\n" +
          "- Submit a .xlsx file with at least 300 words of narrative explanation.",
      });

      const result = await generateAssignmentInstructionsForAssignment(
        "assignment1",
        "Project Schedule",
        "README content",
        "",
        "gemini",
        "applied"
      );

      expect("error" in result).toBe(false);
      const text = "text" in result ? result.text : "";
      expect(text).not.toContain("## Grading Rubric");
    });

    it("never emits the tiered performance-level descriptors (Excellent / Meets Expectations / Needs Improvement), for either course kind", async () => {
      const codingText =
        "# Data Cleaning\n\n## Assignment Overview\nClean a dataset.\n\n## Requirements\n" +
        "- Define a function named clean_data that removes duplicate rows.\n" +
        "- Submit a PDF summary of at least 300 words.";
      vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: codingText });
      const codingResult = await generateAssignmentInstructionsForAssignment(
        "assignment1",
        "Data Cleaning",
        "README content",
        "",
        "gemini",
        "coding"
      );
      expect("error" in codingResult).toBe(false);
      const codingOut = "text" in codingResult ? codingResult.text : "";

      const appliedText =
        "# Critical Path Analysis\n\n## Assignment Overview\nBuild a schedule.\n\n## Requirements\n" +
        "- Dependency logic must be complete and acyclic.\n" +
        "- The identified critical path must genuinely be the longest-duration path through the network.\n" +
        "- At least three parallel task sequences must converge.\n\n## Deliverables\n" +
        "- Apply the analysis to your own selected project.";
      vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: appliedText });
      const appliedResult = await generateAssignmentInstructionsForAssignment(
        "assignment1",
        "Critical Path Analysis",
        "README content",
        "",
        "gemini",
        "applied"
      );
      expect("error" in appliedResult).toBe(false);
      const appliedOut = "text" in appliedResult ? appliedResult.text : "";

      for (const out of [codingOut, appliedOut]) {
        expect(out).not.toContain("Excellent (100%");
        expect(out).not.toContain("Meets Expectations (75%");
        expect(out).not.toContain("Needs Improvement (50%");
        // The reported defect shape (percentage-weighted keyword/code-symbol
        // criteria) must never appear again either.
        expect(out).not.toMatch(/Defines \w+ \(\d+%\)/);
        expect(out).not.toMatch(/Mentions \w+ \(\d+%\)/);
      }
    });

    // AC3: removing the rubric TABLE must not remove the assignment's own
    // "what good looks like" guidance - the model-authored "Before You
    // Submit" self-check (item 8 of the prompt, U2-AC3 test above) is that
    // guidance, and it must survive untouched now that the rubric section
    // that used to follow it is gone.
    it("AC3: the model's own 'Before You Submit' deliverable-expectations content survives, with no rubric appended after it", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        text:
          "# Project Schedule\n\n## Assignment Overview\nBuild a schedule.\n\n## Deliverables\n" +
          "- Submit a .xlsx file.\n\n## Before You Submit\n" +
          "- Your critical path is the longest duration path, not simply the tasks you listed first.",
      });

      const result = await generateAssignmentInstructionsForAssignment(
        "assignment1",
        "Project Schedule",
        "README content",
        "",
        "gemini",
        "applied"
      );

      expect("error" in result).toBe(false);
      const text = "text" in result ? result.text : "";
      expect(text).toContain("## Before You Submit");
      expect(text).toContain("Your critical path is the longest duration path");
      expect(text).not.toContain("## Grading Rubric");
    });
  });

  // U3: the tools block must render only the tools this artifact's own text
  // actually names - the intersection of the committed toolset and what the
  // generated body mentions, not the whole committed toolset. Reproduces the
  // Week 5 evidence (Asana + Google Sheets used, Miro committed but unused).
  describe("U3: tools block is the intersection of committed and mentioned, with a specific per-tool sentence", () => {
    it("omits a committed tool this assignment's own generated text never mentions", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        text:
          "# Project Schedule\n\n## Instructions\n" +
          "- Build your work breakdown structure and set task dates in Asana.\n" +
          "- Sequence dependencies and identify the critical path in Google Sheets.",
      });

      const result = await generateAssignmentInstructionsForAssignment(
        "assignment1",
        "Project Schedule",
        "README content",
        "",
        "gemini",
        "applied",
        "Asana (free tier); Google Sheets (free); Miro (free plan)"
      );

      expect("error" in result).toBe(false);
      const text = "text" in result ? result.text : "";
      expect(text).toContain("## Tools You Will Use");
      expect(text).toContain("Asana");
      expect(text).toContain("Google Sheets");
      expect(text).not.toContain("Miro (free plan):");
      // U3-AC2: a specific sentence per tool, not the same boilerplate line
      // repeated for both.
      expect(text).toContain("Build your work breakdown structure and set task dates in Asana.");
      expect(text).toContain("Sequence dependencies and identify the critical path in Google Sheets.");
    });

    it("renders no tools block at all when the committed toolset is never named in the generated text", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        text: "# Reflection\n\n## Instructions\n- Write a short reflection on your own communication style.",
      });

      const result = await generateAssignmentInstructionsForAssignment(
        "assignment1",
        "Reflection",
        "README content",
        "",
        "gemini",
        "applied",
        "Asana (free tier); Google Sheets (free); Miro (free plan)"
      );

      expect("error" in result).toBe(false);
      const text = "text" in result ? result.text : "";
      expect(text).not.toContain("## Tools You Will Use");
    });
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

  // D6 fixture (deck-audit entry, docs/HANDOFF.md): a course-long project
  // whose real work never touches a system, network, account, or dataset the
  // student does not own - the exact opposite shape from laterMilestone
  // above, used to prove composeProjectHandsOnContract actually branches on
  // the field rather than always returning the full contract.
  const plainProgrammingMilestone: MilestoneBrief = {
    projectName: "Library catalog app",
    projectDefinition: "Build a small library catalog application using object-oriented Python classes.",
    week: 3,
    title: "Book and Member classes",
    deliverable: "Three Python classes: Book, Member, and Library, with a short demo script.",
    priorTitles: ["Project setup"],
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

  // "Hands-on project" fix: PROJECT_HANDS_ON_CONTRACT (src/lib/course-project.ts)
  // must reach THIS week's assignment prompt whenever a milestone is set, not
  // just the project-design prompt (course-project.ts's
  // generateCourseProjectAction) - each week's assignment is a separate
  // generation call that could otherwise elaborate a hands-on milestone into
  // a documentation-only deliverable, or drift toward an unauthorized target,
  // with nothing here to stop it.
  it("composes PROJECT_HANDS_ON_CONTRACT verbatim (hands-on push + authorized-targets boundary) whenever a milestone is set", async () => {
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
    expect(prompt).toContain(PROJECT_HANDS_ON_CONTRACT);
  });

  // D6 (deck-audit entry, docs/HANDOFF.md): a real generated assignment about
  // writing three plain Python classes carried "Ensure all object
  // definitions are contained within your authorized project environment" -
  // the AUTHORIZED TARGETS clause above, meaningless for a milestone that
  // never touches a system, network, account, or dataset the student does
  // not own. composeProjectHandsOnContract (src/lib/course-project.ts) now
  // composes that clause only when the milestone's own field text warrants
  // it - laterMilestone ("Harden a small-business network", tested right
  // above) still gets it in full; a plain-programming milestone must not,
  // while still keeping the hands-on push itself.
  it("D6: omits the AUTHORIZED TARGETS clause for a plain-programming milestone, but keeps the hands-on push", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, text: "# Assignment\n\nBody" });

    await generateAssignmentInstructionsForAssignment(
      "assignment1",
      "Book and Member Classes",
      "README content",
      "",
      "gemini",
      "coding",
      "",
      plainProgrammingMilestone
    );

    const prompt = promptFromCall();
    expect(prompt).not.toContain("AUTHORIZED TARGETS ONLY");
    expect(prompt).toContain("HANDS-ON, NOT ABOUT THE FIELD");
  });

  // A null milestone is the "no project" case (AC1 above) - the hands-on/
  // authorized-targets contract is project-specific and must not leak into a
  // plain assignment that has no course-long project behind it at all.
  it("adds no PROJECT_HANDS_ON_CONTRACT text when there is no milestone", async () => {
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
    expect(prompt).not.toContain("AUTHORIZED TARGETS ONLY");
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
