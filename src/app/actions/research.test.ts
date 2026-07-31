import { describe, it, expect, vi, beforeEach } from "vitest";

// generateClassOpenerAction calls requireOwner() (auth), getWritingStyleBlock()
// (a DB read for the instructor's writing sample), and callLlm() (network) for
// a non-embedded provider - all three are mocked so the prompt-building logic
// runs for real without a Supabase session or a live model call.
vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("./shared", async () => {
  const actual = await vi.importActual<typeof import("./shared")>("./shared");
  return {
    ...actual,
    getWritingStyleBlock: vi.fn().mockResolvedValue(""),
  };
});

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

// generateWeekOpener's own case-study/practice-problem lookup goes through
// findCaseStudyMaterial/findPracticeProblems (@/lib/research/index) - mocked
// so those tests control the lookup deterministically without a real
// knowledge-base/curated-bank search.
vi.mock("@/lib/research/index", () => ({
  findCaseStudyMaterial: vi.fn(),
  findPracticeProblems: vi.fn(),
  research: vi.fn(),
}));

import { callLlm } from "@/lib/llm";
import { generateClassOpenerAction, generateWeekOpener } from "./research";
import { findCaseStudyMaterial, findPracticeProblems } from "@/lib/research/index";
import { PLAIN_LANGUAGE_CONTRACT, CONCRETE_DIRECTION_CONTRACT } from "@/lib/artifact-voice";
import { WORKED_EXAMPLE_CONTRACT } from "@/lib/worked-example-contract";
import type { PracticeProblemEntry } from "@/lib/research/practice-problems";

// A representative bank-sourced coding practice problem - the bank is a
// SOFTWARE bank (see docs/REGRESSION.md 84.5), so every entry can carry
// exampleCode/solutionCode regardless of which course it gets fetched for.
const codingPracticeProblem: PracticeProblemEntry = {
  kind: "practice_problem",
  id: "loops-sum-even",
  title: "Sum the even numbers",
  topics: ["loops"],
  language: "python",
  difficulty: "intro",
  prompt: "PRACTICE_PROMPT_MARKER: write a loop that sums even numbers.",
  exampleCode: "for n in range(10):\n    pass",
  solutionCode: "total = sum(n for n in range(10) if n % 2 == 0)",
};

function promptFromCall(callIndex = 0): string {
  const call = vi.mocked(callLlm).mock.calls[callIndex][0];
  const part = call.contents[0].parts[0];
  return "text" in part ? part.text : "";
}

describe("generateClassOpenerAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("composes both the plain-language and concrete-direction voice contracts into the prompt", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: "# Class Opener: Stakeholder Analysis\n\n## Case study discussion (about 15 minutes)\nBody",
    });

    const result = await generateClassOpenerAction(
      "Stakeholder Analysis",
      "This week covers stakeholder mapping.",
      30,
      null,
      [],
      "gemini",
      "applied"
    );

    expect("error" in result).toBe(false);

    const prompt = promptFromCall();
    expect(prompt).toContain(PLAIN_LANGUAGE_CONTRACT);
    expect(prompt).toContain(CONCRETE_DIRECTION_CONTRACT);
  });

  // U1: the worked example shown for the warm-up exercise used to be
  // satisfied by a single filled-in row (Week 5's opener: a 4-task exercise
  // illustrated by one 3-field entry) - WORKED_EXAMPLE_CONTRACT overrides
  // that scope for this prompt so the example is a complete small instance
  // plus its derived result, not one row.
  it("composes WORKED_EXAMPLE_CONTRACT into the prompt (U1: examples must be a complete small instance, not one row)", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: "# Class Opener: Topic\n\n## Case study discussion (about 15 minutes)\nBody",
    });

    await generateClassOpenerAction("Topic", "Summary", 30, null, [], "gemini", "applied");

    const prompt = promptFromCall();
    expect(prompt).toContain(WORKED_EXAMPLE_CONTRACT);
  });

  it("raises the model's output ceiling above the old 3000-token cap so worked examples are not truncated", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: "# Class Opener: Topic\n\n## Case study discussion (about 15 minutes)\nBody",
    });

    await generateClassOpenerAction("Topic", "Summary", 30, null, [], "gemini", "coding");

    const call = vi.mocked(callLlm).mock.calls[0][0];
    expect(call.generationConfig?.maxOutputTokens).toBe(4096);
  });

  it("does not call the LLM at all for the embedded provider (voice contracts are LLM-only)", async () => {
    const result = await generateClassOpenerAction("Topic", "Summary", 30, null, [], "embedded", "coding");

    expect("error" in result).toBe(false);
    expect(callLlm).not.toHaveBeenCalled();
  });

  // AC3: the prompt used to inject practiceProblems[0] verbatim regardless of
  // exerciseKind. Both current callers already skip fetching the (coding-only)
  // practice bank for an applied warm-up, but this guard holds even if a
  // future or careless caller passes one through anyway - a no-code course's
  // opener must never see a coding practice problem's title or prompt text.
  it("an applied opener ignores a coding practice problem even if one reaches it", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: "# Class Opener: Risk\n\n## Case study discussion (about 15 minutes)\nBody",
    });

    await generateClassOpenerAction(
      "Risk Management",
      "Summary",
      30,
      null,
      [codingPracticeProblem],
      "gemini",
      "applied"
    );

    const prompt = promptFromCall();
    expect(prompt).not.toContain("PRACTICE_PROMPT_MARKER");
    expect(prompt).not.toContain(codingPracticeProblem.title);
    expect(prompt).toContain("Topic: Risk Management");
  });

  it("a coding opener still uses the practice problem when one is supplied", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: "# Class Opener: Loops\n\n## Case study discussion (about 15 minutes)\nBody",
    });

    await generateClassOpenerAction(
      "Loops",
      "Summary",
      30,
      null,
      [codingPracticeProblem],
      "gemini",
      "coding"
    );

    const prompt = promptFromCall();
    expect(prompt).toContain("PRACTICE_PROMPT_MARKER");
  });

  // AC1/AC2: the no-code kickoff's generate-class-openers step (opt-in via
  // its groundInAssignment input) grounds the opener in that week's already-
  // generated assignment text, so the warm-up actually prepares students for
  // it. "" (the default) leaves every pre-existing caller unaffected.
  describe("assignmentContext (AC1/AC2)", () => {
    it("a blank assignmentContext (the default) adds nothing extra to the prompt", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        text: "# Class Opener: Topic\n\n## Case study discussion (about 15 minutes)\nBody",
      });

      await generateClassOpenerAction("Topic", "Summary", 30, null, [], "gemini", "coding");

      const prompt = promptFromCall();
      expect(prompt).not.toContain("THIS WEEK'S ASSIGNMENT");
    });

    it("a non-blank assignmentContext grounds the prompt in the real assignment text", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        text: "# Class Opener: Risk Management\n\n## Case study discussion (about 15 minutes)\nBody",
      });

      await generateClassOpenerAction(
        "Risk Management",
        "Summary",
        30,
        null,
        [],
        "gemini",
        "applied",
        "# Build a risk register\n\nStudents will produce a one-page risk register."
      );

      const prompt = promptFromCall();
      expect(prompt).toContain("THIS WEEK'S ASSIGNMENT");
      expect(prompt).toContain("Build a risk register");
    });
  });
});

// T2 (no-code pipeline reorder): generateWeekOpener extracts the wrapping
// logic the generate-class-openers step used to carry inline (case-study/
// practice-problem lookup, then generateClassOpenerAction, then the URL
// strip and "Tools You Will Use" section) so BOTH that step and
// buildScheduleWeekPlan's in-plan opener phase call the SAME function.
describe("generateWeekOpener", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findCaseStudyMaterial).mockResolvedValue(null);
    vi.mocked(findPracticeProblems).mockResolvedValue([]);
  });

  it("a coding exerciseKind looks up a case study and practice problems", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: "# Class Opener: Loops\n\n## Case study discussion (about 15 minutes)\nBody",
    });

    await generateWeekOpener("Loops", "Summary", 30, "gemini", "coding");

    expect(findCaseStudyMaterial).toHaveBeenCalledWith("Loops");
    expect(findPracticeProblems).toHaveBeenCalledWith("Loops", 2);
  });

  // The curated banks are SOFTWARE banks - fetching them for an applied
  // (no-code) warm-up wastes a call and risks leaking a coding practice
  // problem into a no-code course, so both are skipped entirely.
  it("an applied exerciseKind never looks up a case study or practice problems", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: "# Class Opener: Risk\n\n## Case study discussion (about 15 minutes)\nBody",
    });

    await generateWeekOpener("Risk Management", "Summary", 30, "gemini", "applied");

    expect(findCaseStudyMaterial).not.toHaveBeenCalled();
    expect(findPracticeProblems).not.toHaveBeenCalled();
  });

  it("propagates generateClassOpenerAction's error unchanged", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 500, body: "server error" });

    const result = await generateWeekOpener("Topic", "Summary", 30, "gemini", "coding");

    expect(result).toEqual({ error: expect.stringContaining("Generation failed") });
  });

  it("strips a model-authored URL from the returned text (P1-AC1/AC4 - never trust a model-authored link)", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: "# Class Opener: Topic\n\n## Case study discussion (about 15 minutes)\nVisit https://example.com/fake for more.",
    });

    const result = await generateWeekOpener("Topic", "Summary", 30, "gemini", "coding");

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.text).not.toContain("https://example.com/fake");
    }
  });

  // U3: renderToolsYouWillUseSection now renders only the INTERSECTION of the
  // committed toolset and what the opener's own generated text names - so the
  // mocked opener body here must actually name Trello for the section to
  // appear (see the U4 describe block below for the case where it doesn't).
  it("appends a 'Tools You Will Use' section when a committed tool is recognized in the opener's own text", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: "# Class Opener: Planning\n\n## Case study discussion (about 15 minutes)\nBody\n\n## Warm-up exercise\nTrack your board in Trello.",
    });

    const result = await generateWeekOpener(
      "Planning",
      "Summary",
      30,
      "gemini",
      "applied",
      "",
      ["Trello (free plan)"]
    );

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.text).toContain("## Tools You Will Use");
      expect(result.text).toContain("Trello");
    }
  });

  it("adds no 'Tools You Will Use' section when no committed tool is recognized (default [])", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: "# Class Opener: Topic\n\n## Case study discussion (about 15 minutes)\nBody, no tool keywords here",
    });

    const result = await generateWeekOpener("Topic", "Summary", 30, "gemini", "coding");

    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.text).not.toContain("## Tools You Will Use");
    }
  });

  // U4: the opener contradicts itself about tooling when its own warm-up
  // text says to work on paper, yet the appended tools block still lists the
  // course's committed SaaS toolset. renderToolsYouWillUseSection's U3
  // intersection fix (resource-links.ts) is what closes this gap: a
  // committed tool never named in the opener's own text is never rendered,
  // so a deliberately paper/low-tech warm-up gets no tools block at all -
  // this test exercises that through generateWeekOpener end to end (not just
  // the shared renderer in isolation) so the real caller is covered too.
  describe("U4: a paper/low-tech warm-up never gets a contradicting tools block", () => {
    it("an opener that tells students to write on paper gets no 'Tools You Will Use' section, even with a full committed toolset", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        text:
          "# Class Opener: Scheduling\n\n## Case study discussion (about 15 minutes)\nBody\n\n" +
          "## Warm-up exercise (about 10 minutes)\nWrite this as a simple 4-row list on a piece of paper or a blank document.",
      });

      const result = await generateWeekOpener(
        "Scheduling",
        "Summary",
        30,
        "gemini",
        "applied",
        "",
        ["Asana (free tier)", "Google Sheets (free)", "Miro (free plan)"]
      );

      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.text).not.toContain("## Tools You Will Use");
      }
    });

    it("the same committed toolset DOES render when the opener's own text names one of the committed tools", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        text:
          "# Class Opener: Scheduling\n\n## Case study discussion (about 15 minutes)\nBody\n\n" +
          "## Warm-up exercise (about 10 minutes)\nSketch this warm-up directly in Asana.",
      });

      const result = await generateWeekOpener(
        "Scheduling",
        "Summary",
        30,
        "gemini",
        "applied",
        "",
        ["Asana (free tier)", "Google Sheets (free)", "Miro (free plan)"]
      );

      expect("error" in result).toBe(false);
      if (!("error" in result)) {
        expect(result.text).toContain("## Tools You Will Use");
        expect(result.text).toContain("Asana");
        expect(result.text).not.toContain("Miro (free plan):");
      }
    });
  });

  it("passes assignmentContext through to generateClassOpenerAction's own grounding block", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: "# Class Opener: Risk Management\n\n## Case study discussion (about 15 minutes)\nBody",
    });

    await generateWeekOpener(
      "Risk Management",
      "Summary",
      30,
      "gemini",
      "applied",
      "# Build a risk register\n\nStudents will produce a one-page risk register."
    );

    const prompt = promptFromCall();
    expect(prompt).toContain("THIS WEEK'S ASSIGNMENT");
    expect(prompt).toContain("Build a risk register");
  });

  // V1/V2/V4 (professional-lift audit): an up-front, whole-course case-study
  // plan takes priority over the free-choice fallback, so the opener and the
  // lecture deck teach the SAME case instead of each choosing independently.
  describe("assignedCaseStudy (V1/V2/V4)", () => {
    it("uses the assigned case instead of the free-choice fallback", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        text: "# Class Opener: Risk\n\n## Case study discussion (about 15 minutes)\nBody",
      });

      await generateWeekOpener(
        "Risk Management",
        "Summary",
        30,
        "gemini",
        "applied",
        "",
        [],
        { organization: "Denver International Airport", period: "1994-1995", hook: "The baggage system failed testing." }
      );

      const prompt = promptFromCall();
      expect(prompt).toContain("Denver International Airport");
      expect(prompt).toContain("1994-1995");
      expect(prompt).toContain("use EXACTLY this");
      expect(prompt).not.toContain("No case study material was supplied");
    });

    it("states the period is not established with confidence when the assignment carries none", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        text: "# Class Opener: Risk\n\n## Case study discussion (about 15 minutes)\nBody",
      });

      await generateWeekOpener(
        "Risk Management",
        "Summary",
        30,
        "gemini",
        "applied",
        "",
        [],
        { organization: "Some Org", hook: "hook text" }
      );

      const prompt = promptFromCall();
      expect(prompt).toContain("not established with confidence");
    });

    it("a coding exerciseKind ignores the curated bank when an assignment is present, using the assignment instead", async () => {
      vi.mocked(findCaseStudyMaterial).mockResolvedValue({
        title: "The Mars Climate Orbiter Unit Mix-Up",
        bullets: ["a", "b"],
      });
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        text: "# Class Opener: Loops\n\n## Case study discussion (about 15 minutes)\nBody",
      });

      await generateWeekOpener(
        "Loops",
        "Summary",
        30,
        "gemini",
        "coding",
        "",
        [],
        { organization: "Assigned Org For Coding", hook: "hook" }
      );

      const prompt = promptFromCall();
      expect(prompt).toContain("Assigned Org For Coding");
      expect(prompt).not.toContain("Mars Climate Orbiter");
    });

    it("falls back to the free-choice text when no assignment is given (unchanged behavior)", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        text: "# Class Opener: Risk\n\n## Case study discussion (about 15 minutes)\nBody",
      });

      await generateWeekOpener("Risk Management", "Summary", 30, "gemini", "applied");

      const prompt = promptFromCall();
      expect(prompt).toContain("No case study material was supplied");
    });
  });
});
