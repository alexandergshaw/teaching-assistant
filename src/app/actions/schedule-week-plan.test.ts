import { describe, it, expect, vi, beforeEach } from "vitest";

// buildScheduleWeekPlan reaches auth and the model; both are mocked so the
// function's own decision - generate for real, or fall back to the scaffold -
// runs without a Supabase session or a network call.
vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("./shared", async () => {
  const actual = await vi.importActual<typeof import("./shared")>("./shared");
  return {
    ...actual,
    generateModuleIntroForAssignment: vi.fn(),
    generateAssignmentInstructionsForAssignment: vi.fn(),
  };
});

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import { callLlm } from "@/lib/llm";
import {
  generateModuleIntroForAssignment,
  generateAssignmentInstructionsForAssignment,
} from "./shared";
import { buildScheduleWeekPlan } from "./course-planning-grounding";
import type { ScheduleWeekPlan } from "../actions-types";
import { BLOOM_OBJECTIVES_CONTRACT } from "@/lib/bloom-taxonomy";
import { coerceCourseProject, emptyCourseProject, type CourseProject, type MilestoneBrief } from "@/lib/course-project";

const WEEK: ScheduleWeekPlan = {
  week: 1,
  topic: "Introduction to Project Management",
  summary: "Overview of PM fundamentals and the role of PM in organizations.",
  assignmentTitle: "Project Lifecycle Analysis",
  assignmentSlug: null,
  testName: null,
};

function mockSlides() {
  vi.mocked(callLlm).mockResolvedValue({
    ok: true,
    status: 200,
    body: "",
    text: JSON.stringify({ presentationTitle: "T", slides: [{ title: "S", bullets: ["b"] }] }),
  } as never);
}

// All prompts sent to callLlm across the whole buildScheduleWeekPlan call
// (selectRequiredTools, concept planning, and the slide-generation call all
// share the mock) - used to find a specific call's prompt without depending
// on the exact call order/count of the concept-planning internals.
function callLlmPrompts(): string[] {
  return vi.mocked(callLlm).mock.calls.map((call) => {
    const part = call[0].contents[0].parts[0];
    return "text" in part ? part.text : "";
  });
}

describe("buildScheduleWeekPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSlides();
  });

  // THE bug: the intro and instructions were scaffolded unconditionally, so a
  // user who had selected a model still received placeholder prose - complete
  // with an instructor TODO - in student-facing lecture notes.
  it("generates the intro and instructions with the model, not the scaffold", async () => {
    vi.mocked(generateModuleIntroForAssignment).mockResolvedValue({ text: "# Real intro" });
    vi.mocked(generateAssignmentInstructionsForAssignment).mockResolvedValue({ text: "# Real instructions" });

    const plan = await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

    expect(generateModuleIntroForAssignment).toHaveBeenCalledTimes(1);
    expect(generateAssignmentInstructionsForAssignment).toHaveBeenCalledTimes(1);
    expect(plan.moduleIntroduction).toBe("# Real intro");
    expect(plan.assignmentInstructions).toBe("# Real instructions");
    expect(plan.moduleIntroduction).not.toContain("Add two or three concrete examples");
  });

  // Passing the week LABEL produced "This module introduces week 1 and why it
  // matters", which says nothing about the subject.
  it("titles the intro with the TOPIC, not the week label", async () => {
    vi.mocked(generateModuleIntroForAssignment).mockResolvedValue({ text: "x" });
    vi.mocked(generateAssignmentInstructionsForAssignment).mockResolvedValue({ text: "y" });

    await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

    expect(vi.mocked(generateModuleIntroForAssignment).mock.calls[0][1]).toBe(
      "Introduction to Project Management"
    );
  });

  it("falls back to the week label when the week has no topic", async () => {
    vi.mocked(generateModuleIntroForAssignment).mockResolvedValue({ text: "x" });
    vi.mocked(generateAssignmentInstructionsForAssignment).mockResolvedValue({ text: "y" });

    await buildScheduleWeekPlan({ ...WEEK, topic: "" }, 0, "c", 50, "gemini");

    expect(vi.mocked(generateModuleIntroForAssignment).mock.calls[0][1]).toBe("Week 1");
  });

  it("embedded uses the scaffold and calls no generator", async () => {
    const plan = await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "embedded");

    expect(generateModuleIntroForAssignment).not.toHaveBeenCalled();
    expect(generateAssignmentInstructionsForAssignment).not.toHaveBeenCalled();
    expect(plan.moduleIntroduction).toContain("Introduction to Project Management");
    expect(plan.introFailed).toBeUndefined();
  });

  // The document still ships, but the run must be able to SAY it degraded -
  // a silent fallback is how placeholder notes reached a real course.
  it("flags a fallback rather than failing silently", async () => {
    vi.mocked(generateModuleIntroForAssignment).mockResolvedValue({ error: "HTTP 503" });
    vi.mocked(generateAssignmentInstructionsForAssignment).mockResolvedValue({ error: "HTTP 503" });

    const plan = await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

    expect(plan.introFailed).toBe(true);
    expect(plan.instructionsFailed).toBe(true);
    // The scaffold still produced usable text, so the week is not lost.
    expect(plan.moduleIntroduction.length).toBeGreaterThan(0);
    expect(plan.assignmentInstructions.length).toBeGreaterThan(0);
  });

  it("a failure on one document does not drag down the other", async () => {
    vi.mocked(generateModuleIntroForAssignment).mockResolvedValue({ error: "HTTP 503" });
    vi.mocked(generateAssignmentInstructionsForAssignment).mockResolvedValue({ text: "# Real instructions" });

    const plan = await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

    expect(plan.introFailed).toBe(true);
    expect(plan.instructionsFailed).toBeUndefined();
    expect(plan.assignmentInstructions).toBe("# Real instructions");
  });

  // AC1: the assignment is this module's spine - generated first, from the
  // schedule alone, before either the intro or the deck.
  describe("the assignment generates before the intro and the deck (AC1)", () => {
    it("calls generateAssignmentInstructionsForAssignment before generateModuleIntroForAssignment", async () => {
      vi.mocked(generateModuleIntroForAssignment).mockResolvedValue({ text: "x" });
      vi.mocked(generateAssignmentInstructionsForAssignment).mockResolvedValue({ text: "y" });

      await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

      const assignmentOrder = vi.mocked(generateAssignmentInstructionsForAssignment).mock.invocationCallOrder[0];
      const introOrder = vi.mocked(generateModuleIntroForAssignment).mock.invocationCallOrder[0];
      expect(assignmentOrder).toBeLessThan(introOrder);
    });
  });

  // AC2: the module intro and the deck must both actually receive the
  // assignment's text, not just run after it.
  describe("the intro and the deck are grounded in the generated assignment text (AC2)", () => {
    it("passes the assignment text as the intro's upcomingAssignmentContext", async () => {
      vi.mocked(generateModuleIntroForAssignment).mockResolvedValue({ text: "x" });
      vi.mocked(generateAssignmentInstructionsForAssignment).mockResolvedValue({
        text: "# Real instructions: build a charter",
      });
      mockSlides();

      await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

      expect(vi.mocked(generateModuleIntroForAssignment).mock.calls[0][6]).toBe(
        "# Real instructions: build a charter"
      );
    });

    it("composes the assignment text into the deck's own prompt", async () => {
      vi.mocked(generateModuleIntroForAssignment).mockResolvedValue({ text: "x" });
      vi.mocked(generateAssignmentInstructionsForAssignment).mockResolvedValue({
        text: "# Real instructions: build a stakeholder register",
      });
      mockSlides();

      await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

      const prompts = callLlmPrompts();
      expect(prompts.some((p) => p.includes("THIS WEEK'S ASSIGNMENT"))).toBe(true);
      expect(prompts.some((p) => p.includes("build a stakeholder register"))).toBe(true);
    });
  });

  // Tool-churn fix (docs/REGRESSION.md): buildScheduleWeekPlan no longer
  // DECIDES a tool for this week - it READS the course's already-committed
  // toolset off courseProject.tools (ensureCourseTools, steps.course-project.ts,
  // decides it once, before this function's per-week loop even runs). This
  // replaces the old per-week selectRequiredTools(topic, summary, provider)
  // LLM call, which is what sent a student to a different SaaS tool almost
  // every week of the same course (Trello, then Miro, then Asana).
  describe("the committed toolset is read (not re-decided) and shared by the assignment and the deck (tool-churn fix)", () => {
    beforeEach(() => {
      vi.mocked(generateModuleIntroForAssignment).mockResolvedValue({ text: "x" });
      vi.mocked(generateAssignmentInstructionsForAssignment).mockResolvedValue({ text: "y" });
    });

    function projectWithTools(tools: string[]): CourseProject {
      return coerceCourseProject({ mode: "course-long", name: "P", definition: "P", tools });
    }

    it("passes the committed tool(s) as requiredTools to the assignment call, for an applied course", async () => {
      mockSlides();

      await buildScheduleWeekPlan(
        WEEK,
        0,
        "A PM course",
        50,
        "gemini",
        undefined,
        undefined,
        [],
        "applied",
        projectWithTools(["Trello (free plan)", "Excel (free trial)"])
      );

      expect(vi.mocked(generateAssignmentInstructionsForAssignment).mock.calls[0][6]).toBe(
        "Trello (free plan); Excel (free trial)"
      );
    });

    it("composes the SAME committed tool(s) into the deck's REQUIRED TOOL(S) prompt block", async () => {
      mockSlides();

      await buildScheduleWeekPlan(
        WEEK,
        0,
        "A PM course",
        50,
        "gemini",
        undefined,
        undefined,
        [],
        "applied",
        projectWithTools(["Trello (free plan)", "Excel (free trial)"])
      );

      const prompts = callLlmPrompts();
      const deckPrompt = prompts.find((p) => p.includes("REQUIRED TOOL(S)"));
      expect(deckPrompt).toBeTruthy();
      expect(deckPrompt).toContain("Trello (free plan); Excel (free trial)");
    });

    it("never calls the LLM to decide a tool - it is a pure read of courseProject.tools", async () => {
      mockSlides();

      await buildScheduleWeekPlan(
        WEEK,
        0,
        "A PM course",
        50,
        "gemini",
        undefined,
        undefined,
        [],
        "applied",
        projectWithTools(["Trello (free plan)"])
      );

      // The old per-week tool-selection prompt's own distinctive phrase must
      // never appear - if it did, a decision was made again instead of read.
      expect(
        callLlmPrompts().some((p) =>
          p.includes("a practitioner in this field actually uses for this week's hands-on work")
        )
      ).toBe(false);
    });

    // A later week reuses the SAME committed toolset rather than choosing
    // anew - the core guarantee of the fix, proven by calling the function
    // twice (simulating two different weeks of the same course) with the
    // identical courseProject and getting the identical tools both times.
    it("a later week reuses the identical committed toolset rather than choosing anew", async () => {
      mockSlides();
      const project = projectWithTools(["Trello (free plan)", "Excel (free trial)"]);

      await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini", undefined, undefined, [], "applied", project);
      const week1Tools = vi.mocked(generateAssignmentInstructionsForAssignment).mock.calls[0][6];

      vi.clearAllMocks();
      vi.mocked(generateModuleIntroForAssignment).mockResolvedValue({ text: "x" });
      vi.mocked(generateAssignmentInstructionsForAssignment).mockResolvedValue({ text: "y" });
      mockSlides();

      const week8 = { ...WEEK, week: 8, topic: "Budgeting" };
      await buildScheduleWeekPlan(week8, 7, "A PM course", 50, "gemini", undefined, undefined, [], "applied", project);
      const week8Tools = vi.mocked(generateAssignmentInstructionsForAssignment).mock.calls[0][6];

      expect(week1Tools).toBe("Trello (free plan); Excel (free trial)");
      expect(week8Tools).toBe(week1Tools);
    });

    it("passes an empty requiredTools for a coding course and never asks the deck for one, even with a committed toolset on the project", async () => {
      mockSlides();

      await buildScheduleWeekPlan(
        WEEK,
        0,
        "A PM course",
        50,
        "gemini",
        undefined,
        undefined,
        [],
        "coding",
        projectWithTools(["Trello (free plan)"])
      );

      expect(vi.mocked(generateAssignmentInstructionsForAssignment).mock.calls[0][6]).toBe("");
      expect(callLlmPrompts().some((p) => p.includes("REQUIRED TOOL(S)"))).toBe(false);
    });

    it("flags moduleToolsSelectionFailed when an applied course has no committed toolset yet", async () => {
      mockSlides();

      const plan = await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini", undefined, undefined, [], "applied");

      expect(plan.moduleToolsSelectionFailed).toBe(true);
    });

    it("never flags moduleToolsSelectionFailed for a coding course", async () => {
      mockSlides();

      const plan = await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

      expect(plan.moduleToolsSelectionFailed).toBeUndefined();
    });
  });

  // AC6: a module whose assignment fails to generate must not silently feed
  // a fake "the assignment says..." block to the intro/deck - they degrade to
  // ungrounded (exactly like before this feature existed), not misleadingly
  // grounded in placeholder scaffold text.
  describe("a failed assignment does not fake-ground the intro or the deck (AC6)", () => {
    it("does not run the whole week's generation off the rails - the run still produces an intro and a deck", async () => {
      vi.mocked(generateModuleIntroForAssignment).mockResolvedValue({ text: "Real intro" });
      vi.mocked(generateAssignmentInstructionsForAssignment).mockResolvedValue({ error: "HTTP 503" });
      mockSlides();

      const plan = await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

      expect(plan.instructionsFailed).toBe(true);
      expect(plan.moduleIntroduction).toBe("Real intro");
      expect(plan.slidesFailed).toBeUndefined();
    });

    it("passes an empty upcomingAssignmentContext to the intro when the assignment failed", async () => {
      vi.mocked(generateModuleIntroForAssignment).mockResolvedValue({ text: "Real intro" });
      vi.mocked(generateAssignmentInstructionsForAssignment).mockResolvedValue({ error: "HTTP 503" });
      mockSlides();

      await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

      expect(vi.mocked(generateModuleIntroForAssignment).mock.calls[0][6]).toBe("");
    });

    it("never composes an assignment-grounding block into the deck's prompt when the assignment failed", async () => {
      vi.mocked(generateModuleIntroForAssignment).mockResolvedValue({ text: "Real intro" });
      vi.mocked(generateAssignmentInstructionsForAssignment).mockResolvedValue({ error: "HTTP 503" });
      mockSlides();

      await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

      expect(callLlmPrompts().some((p) => p.includes("THIS WEEK'S ASSIGNMENT"))).toBe(false);
    });
  });

  // V3-AC3 (professional-lift audit): a single deck-generation LLM call
  // failure used to fall straight to the placeholder deck with no retry
  // (only a JSON-parse failure retried) - a transient error in a 16-week run
  // is almost certainly recoverable, so it now gets the same one retry the
  // parse-failure branches already had.
  describe("the slide-generation LLM call retries once on a transient failure (V3-AC3)", () => {
    beforeEach(() => {
      vi.mocked(generateModuleIntroForAssignment).mockResolvedValue({ text: "x" });
      vi.mocked(generateAssignmentInstructionsForAssignment).mockResolvedValue({ text: "y" });
    });

    it("succeeds on the retry - slidesFailed stays unset and real slides ship", async () => {
      let deckAttempts = 0;
      vi.mocked(callLlm).mockImplementation(async (req) => {
        const part = req.contents[0].parts[0];
        const text = "text" in part ? part.text : "";
        if (text.startsWith("You are an expert educator creating a lecture slide deck for a course.")) {
          deckAttempts++;
          if (deckAttempts === 1) {
            return { ok: false, status: 500, body: "boom" } as never;
          }
        }
        return {
          ok: true,
          status: 200,
          body: "",
          text: JSON.stringify({ presentationTitle: "T", slides: [{ title: "S", bullets: ["b"] }] }),
        } as never;
      });

      const plan = await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

      expect(deckAttempts).toBe(2);
      expect(plan.slidesFailed).toBeUndefined();
      expect(plan.slides.length).toBeGreaterThan(0);
    });

    it("still falls back to the placeholder when BOTH attempts fail", async () => {
      let deckAttempts = 0;
      vi.mocked(callLlm).mockImplementation(async (req) => {
        const part = req.contents[0].parts[0];
        const text = "text" in part ? part.text : "";
        if (text.startsWith("You are an expert educator creating a lecture slide deck for a course.")) {
          deckAttempts++;
          return { ok: false, status: 500, body: "boom" } as never;
        }
        return {
          ok: true,
          status: 200,
          body: "",
          text: JSON.stringify({ presentationTitle: "T", slides: [{ title: "S", bullets: ["b"] }] }),
        } as never;
      });

      const plan = await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

      expect(deckAttempts).toBe(2);
      expect(plan.slidesFailed).toBe(true);
      expect(plan.slides).toEqual([]);
    });
  });

  // AC2: the applied no-code guard must show up on the AssignmentPlan the
  // same way slidesFailed/introFailed/instructionsFailed already do, so a run
  // that shipped a code-bearing deck to a no-code course cannot look clean.
  describe("the applied no-code guard is surfaced on the plan (AC2)", () => {
    beforeEach(() => {
      vi.mocked(generateModuleIntroForAssignment).mockResolvedValue({ text: "x" });
      vi.mocked(generateAssignmentInstructionsForAssignment).mockResolvedValue({ text: "y" });
    });

    it("records codeStrippedFromApplied when the model returns code for an applied course", async () => {
      vi.mocked(callLlm).mockResolvedValue({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify({
          presentationTitle: "T",
          slides: [
            { title: "Principle: Scope", bullets: ["b"], notes: "n" },
            { title: "Example: rogue", bullets: ["b"], code: "print(1)", codeLanguage: "python" },
          ],
        }),
      } as never);

      const plan = await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini", undefined, undefined, [], "applied");

      expect(plan.codeStrippedFromApplied).toBe(1);
      expect(plan.slides.every((s) => s.code === undefined)).toBe(true);
    });

    it("leaves codeStrippedFromApplied undefined for a clean run", async () => {
      mockSlides();

      const plan = await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini", undefined, undefined, [], "applied");

      expect(plan.codeStrippedFromApplied).toBeUndefined();
    });
  });

  // AC1/AC5/AC7: module objectives are generated alongside the intro/deck
  // (buildScheduleWeekPlan is the schedule-driven pipeline behind the
  // no-code kickoff's lecture-materials-from-schedule step, and the
  // repoless lecture-zip path a standalone Course Refresh can take) - always
  // grounded in the assignment that was already generated above, never a
  // generic topic restatement, and never absent even on failure.
  describe("module objectives (AC1/AC5/AC7)", () => {
    beforeEach(() => {
      vi.mocked(generateModuleIntroForAssignment).mockResolvedValue({ text: "Real intro" });
      vi.mocked(generateAssignmentInstructionsForAssignment).mockResolvedValue({
        text: "# Real instructions: build a stakeholder register",
      });
    });

    it("is populated on the returned plan", async () => {
      mockSlides();

      const plan = await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

      expect(plan.moduleObjectives.length).toBeGreaterThan(0);
      expect(plan.objectivesFailed).toBeUndefined();
    });

    it("the objectives prompt is grounded in the just-generated assignment text", async () => {
      mockSlides();

      await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

      const prompts = callLlmPrompts();
      const objectivesPrompt = prompts.find((p) => p.includes("MODULE OBJECTIVES document"));
      expect(objectivesPrompt).toBeTruthy();
      expect(objectivesPrompt).toContain("build a stakeholder register");
    });

    it("embedded uses the scaffold and calls no generator for objectives either", async () => {
      const plan = await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "embedded");

      expect(plan.moduleObjectives).toContain("Introduction to Project Management");
      expect(plan.objectivesFailed).toBeUndefined();
    });

    // AC7: failure isolation - objectives generation failing must not abort
    // the run, ship an empty document, or affect the slides/intro that are
    // generated in the same parallel batch.
    it("objectivesFailed is set and the scaffold still ships when generation fails, without dragging down slides", async () => {
      vi.mocked(callLlm).mockImplementation(async (req) => {
        const part = req.contents[0].parts[0];
        const text = "text" in part ? part.text : "";
        if (text.includes("MODULE OBJECTIVES document")) {
          return { ok: false, status: 500, body: "boom" } as never;
        }
        return {
          ok: true,
          status: 200,
          body: "",
          text: JSON.stringify({ presentationTitle: "T", slides: [{ title: "S", bullets: ["b"] }] }),
        } as never;
      });

      const plan = await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

      expect(plan.objectivesFailed).toBe(true);
      expect(plan.moduleObjectives.length).toBeGreaterThan(0);
      expect(plan.slidesFailed).toBeUndefined();
    });

    // AC5: an applied course's objectives must not imply coding.
    it("carries the applied (no-code) contract for an applied course", async () => {
      mockSlides();

      await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini", undefined, undefined, [], "applied");

      const prompts = callLlmPrompts();
      const objectivesPrompt = prompts.find((p) => p.includes("MODULE OBJECTIVES document"));
      expect(objectivesPrompt).toContain("NOT a programming course");
    });

    // AC6/AC9 (Bloom's Taxonomy, docs/REGRESSION.md 145/146): this pipeline
    // must carry the ONE shared Bloom contract constant through to the
    // objectives prompt, exactly like the applied/coding contract above.
    it("carries the Bloom's Taxonomy contract in the objectives prompt", async () => {
      mockSlides();

      await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

      const prompts = callLlmPrompts();
      const objectivesPrompt = prompts.find((p) => p.includes("MODULE OBJECTIVES document"));
      expect(objectivesPrompt).toContain(BLOOM_OBJECTIVES_CONTRACT);
    });

    // AC5 (progression): the schedule-driven pipeline always has the full
    // term (allWeeks) in hand, so it can - and must - tell the model where
    // in the term this module falls.
    describe("term position (AC5 progression)", () => {
      it("states the term position from the week number and the full schedule length", async () => {
        mockSlides();
        const allWeeks: ScheduleWeekPlan[] = Array.from({ length: 10 }, (_, i) => ({ ...WEEK, week: i + 1 }));

        await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini", undefined, undefined, allWeeks);

        const prompts = callLlmPrompts();
        const objectivesPrompt = prompts.find((p) => p.includes("MODULE OBJECTIVES document"));
        expect(objectivesPrompt).toContain("TERM POSITION");
        expect(objectivesPrompt).toContain("week 1 of 10");
      });

      it("omits the term-position line when no schedule (allWeeks) is supplied", async () => {
        mockSlides();

        await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

        const prompts = callLlmPrompts();
        const objectivesPrompt = prompts.find((p) => p.includes("MODULE OBJECTIVES document"));
        expect(objectivesPrompt).not.toContain("TERM POSITION");
      });
    });
  });

  // docs/REGRESSION.md 146 (AC1/AC4/AC5/AC6/AC8): the course-long project's
  // milestone must actually reach the assignment generator - buildScheduleWeekPlan
  // computes it (milestoneBriefFor) and passes it as
  // generateAssignmentInstructionsForAssignment's 8th argument.
  describe("course-long project milestone reaches the assignment (AC1/AC4/AC5/AC6)", () => {
    function project(overrides: Partial<CourseProject> = {}): CourseProject {
      return coerceCourseProject({
        mode: "course-long",
        name: "Harden a small-business network",
        definition: "Assess and harden one small business.",
        milestones: [
          { week: 1, title: "Scope and asset inventory", deliverable: "An asset register" },
          { week: 3, title: "Threat model draft", deliverable: "A threat model document" },
        ],
        ...overrides,
      });
    }

    function milestoneArg(): MilestoneBrief | null {
      return vi.mocked(generateAssignmentInstructionsForAssignment).mock.calls[0][7] ?? null;
    }

    beforeEach(() => {
      vi.mocked(generateModuleIntroForAssignment).mockResolvedValue({ text: "x" });
      vi.mocked(generateAssignmentInstructionsForAssignment).mockResolvedValue({ text: "y" });
      mockSlides();
    });

    // AC1: no-project path is unchanged - the same hasProject() gate
    // milestoneBriefFor already uses, exercised here through the real,
    // un-mocked course-project.ts module.
    it("no courseProject argument (the default) passes a null milestone", async () => {
      await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

      expect(milestoneArg()).toBeNull();
    });

    it("an empty/no-project CourseProject also passes a null milestone", async () => {
      await buildScheduleWeekPlan(
        WEEK,
        0,
        "A PM course",
        50,
        "gemini",
        undefined,
        undefined,
        [],
        "coding",
        emptyCourseProject()
      );

      expect(milestoneArg()).toBeNull();
    });

    // AC4: week 1 gets the milestone with no prior titles.
    it("week 1 gets its own milestone with no prior titles", async () => {
      await buildScheduleWeekPlan(
        { ...WEEK, week: 1 },
        0,
        "A PM course",
        50,
        "gemini",
        undefined,
        undefined,
        [],
        "coding",
        project()
      );

      const milestone = milestoneArg();
      expect(milestone).not.toBeNull();
      expect(milestone!.week).toBe(1);
      expect(milestone!.priorTitles).toEqual([]);
    });

    // AC1: a later week's assignment must receive enough of the preceding
    // milestones to reference what the student already produced.
    it("a later week carries the prior milestone's title", async () => {
      await buildScheduleWeekPlan(
        { ...WEEK, week: 3 },
        0,
        "A PM course",
        50,
        "gemini",
        undefined,
        undefined,
        [],
        "coding",
        project()
      );

      const milestone = milestoneArg();
      expect(milestone).not.toBeNull();
      expect(milestone!.week).toBe(3);
      expect(milestone!.priorTitles).toEqual(["Scope and asset inventory"]);
    });

    // A week the project defines no milestone for must not fabricate one -
    // this week's assignment generates exactly as it would with no project.
    it("a week with no milestone passes null even though the course has a project", async () => {
      await buildScheduleWeekPlan(
        { ...WEEK, week: 2 },
        0,
        "A PM course",
        50,
        "gemini",
        undefined,
        undefined,
        [],
        "coding",
        project()
      );

      expect(milestoneArg()).toBeNull();
    });

    // AC6: nothing about milestone threading branches on courseKind - an
    // applied course gets the identical milestone object a coding course
    // would for the same project/week.
    it("an applied course gets the same milestone as a coding course would", async () => {
      await buildScheduleWeekPlan(
        { ...WEEK, week: 3 },
        0,
        "A PM course",
        50,
        "gemini",
        undefined,
        undefined,
        [],
        "applied",
        project()
      );

      const milestone = milestoneArg();
      expect(milestone).not.toBeNull();
      expect(milestone!.title).toBe("Threat model draft");
    });

    // AC5: the tool commitment and the milestone must both reach the
    // assignment call for the same applied week - neither crowds out the
    // other. Tool-churn fix: the committed toolset is read straight off the
    // project (courseProject.tools), not decided fresh by an LLM call here.
    it("composes with the committed toolset for an applied project week", async () => {
      mockSlides();

      await buildScheduleWeekPlan(
        { ...WEEK, week: 3 },
        0,
        "A PM course",
        50,
        "gemini",
        undefined,
        undefined,
        [],
        "applied",
        project({ tools: ["Trello (free plan)"] })
      );

      const call = vi.mocked(generateAssignmentInstructionsForAssignment).mock.calls[0];
      expect(call[6]).toBe("Trello (free plan)");
      expect(call[7]).not.toBeNull();
      expect(call[7]!.title).toBe("Threat model draft");
    });
  });
});
