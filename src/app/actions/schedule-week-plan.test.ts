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

  // AC4: the deck's chosen tool(s) must reach the SAME week's assignment
  // instructions, so the two never drift onto different software.
  describe("moduleTools carry from the deck to the assignment instructions (AC4)", () => {
    beforeEach(() => {
      vi.mocked(generateModuleIntroForAssignment).mockResolvedValue({ text: "x" });
      vi.mocked(generateAssignmentInstructionsForAssignment).mockResolvedValue({ text: "y" });
    });

    it("passes the deck's moduleTools as requiredTools for an applied course", async () => {
      vi.mocked(callLlm).mockResolvedValue({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify({
          presentationTitle: "T",
          moduleTools: ["Trello (free plan)", "Excel (free trial)"],
          slides: [{ title: "Principle: Scope", bullets: ["b"], notes: "n" }],
        }),
      } as never);

      await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini", undefined, undefined, [], "applied");

      expect(vi.mocked(generateAssignmentInstructionsForAssignment).mock.calls[0][6]).toBe(
        "Trello (free plan); Excel (free trial)"
      );
    });

    it("passes an empty requiredTools for a coding course (moduleTools is never asked for)", async () => {
      mockSlides();

      await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

      expect(vi.mocked(generateAssignmentInstructionsForAssignment).mock.calls[0][6]).toBe("");
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
