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

  // AC3: the tool is decided ONCE, before either downstream consumer exists,
  // and shared by both - the inverse of 3f284a9's original "deck decides,
  // assignment follows" direction, now that the assignment runs first.
  describe("the required tool is decided once and shared by the assignment and the deck (AC3)", () => {
    beforeEach(() => {
      vi.mocked(generateModuleIntroForAssignment).mockResolvedValue({ text: "x" });
      vi.mocked(generateAssignmentInstructionsForAssignment).mockResolvedValue({ text: "y" });
    });

    it("passes the pre-selected tool(s) as requiredTools to the assignment call, for an applied course", async () => {
      vi.mocked(callLlm)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          body: "",
          text: JSON.stringify({ tools: ["Trello (free plan)", "Excel (free trial)"] }),
        } as never)
        .mockResolvedValue({
          ok: true,
          status: 200,
          body: "",
          text: JSON.stringify({
            presentationTitle: "T",
            slides: [{ title: "Principle: Scope", bullets: ["b"], notes: "n" }],
          }),
        } as never);

      await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini", undefined, undefined, [], "applied");

      expect(vi.mocked(generateAssignmentInstructionsForAssignment).mock.calls[0][6]).toBe(
        "Trello (free plan); Excel (free trial)"
      );
    });

    it("composes the SAME pre-selected tool(s) into the deck's REQUIRED TOOL(S) prompt block", async () => {
      vi.mocked(callLlm)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          body: "",
          text: JSON.stringify({ tools: ["Trello (free plan)", "Excel (free trial)"] }),
        } as never)
        .mockResolvedValue({
          ok: true,
          status: 200,
          body: "",
          text: JSON.stringify({
            presentationTitle: "T",
            slides: [{ title: "Principle: Scope", bullets: ["b"], notes: "n" }],
          }),
        } as never);

      await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini", undefined, undefined, [], "applied");

      const prompts = callLlmPrompts();
      const deckPrompt = prompts.find((p) => p.includes("REQUIRED TOOL(S)"));
      expect(deckPrompt).toBeTruthy();
      expect(deckPrompt).toContain("Trello (free plan); Excel (free trial)");
    });

    it("passes an empty requiredTools for a coding course and never asks the deck for one", async () => {
      mockSlides();

      await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

      expect(vi.mocked(generateAssignmentInstructionsForAssignment).mock.calls[0][6]).toBe("");
      expect(callLlmPrompts().some((p) => p.includes("REQUIRED TOOL(S)"))).toBe(false);
    });

    it("flags moduleToolsSelectionFailed when an applied week's tool selection finds nothing usable", async () => {
      // No "tools" field anywhere in the mocked responses - selectRequiredTools
      // degrades to [].
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
});
