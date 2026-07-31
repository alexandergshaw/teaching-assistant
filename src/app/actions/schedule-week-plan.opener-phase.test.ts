// T2 (no-code pipeline reorder): buildScheduleWeekPlan's sequenceOpenerBeforeDeck
// phase - the opener joins the intro/objectives parallel group (grounded in
// the assignment), and the deck becomes its own later phase (grounded in the
// assignment AND the opener). Split out from schedule-week-plan.test.ts (that
// file's own tests never pass a 12th argument, so they exercise ONLY the
// default-off branch - this file is the dedicated coverage for the on branch).

import { describe, it, expect, vi, beforeEach } from "vitest";

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

// generateWeekOpener is mocked wholesale: its own behavior (case-study
// lookup, generateClassOpenerAction, URL strip, tools section) is covered by
// research.test.ts - this file only proves buildScheduleWeekPlan calls it at
// the right time, with the right arguments, and actually uses what comes
// back.
vi.mock("./research", () => ({
  generateWeekOpener: vi.fn(),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import { callLlm } from "@/lib/llm";
import {
  generateModuleIntroForAssignment,
  generateAssignmentInstructionsForAssignment,
} from "./shared";
import { generateWeekOpener } from "./research";
import { buildScheduleWeekPlan } from "./course-planning-grounding";
import type { ScheduleWeekPlan } from "../actions-types";
import { coerceCourseProject, type CourseProject } from "@/lib/course-project";

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

function callLlmPrompts(): string[] {
  return vi.mocked(callLlm).mock.calls.map((call) => {
    const part = call[0].contents[0].parts[0];
    return "text" in part ? part.text : "";
  });
}

function projectWithTools(tools: string[]): CourseProject {
  return coerceCourseProject({ mode: "course-long", name: "P", definition: "P", tools });
}

describe("buildScheduleWeekPlan: sequenceOpenerBeforeDeck (T2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSlides();
    vi.mocked(generateModuleIntroForAssignment).mockResolvedValue({ text: "x" });
    vi.mocked(generateAssignmentInstructionsForAssignment).mockResolvedValue({
      text: "# Real instructions: build a stakeholder register",
    });
  });

  describe("off (the default) - byte-for-byte today's behavior", () => {
    it("never calls generateWeekOpener, and openerText/openerFailed stay undefined", async () => {
      const plan = await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

      expect(generateWeekOpener).not.toHaveBeenCalled();
      expect(plan.openerText).toBeUndefined();
      expect(plan.openerFailed).toBeUndefined();
    });

    it("the deck's prompt carries no opener block", async () => {
      await buildScheduleWeekPlan(WEEK, 0, "A PM course", 50, "gemini");

      expect(callLlmPrompts().some((p) => p.includes("THIS WEEK'S CLASS OPENER"))).toBe(false);
    });
  });

  describe("on - the opener joins intro/objectives, and the deck is grounded in it", () => {
    it("calls generateWeekOpener grounded in the assignment, with the course's exercise kind and committed tools", async () => {
      vi.mocked(generateWeekOpener).mockResolvedValue({ text: "OPENER_TEXT_MARKER" });

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
        projectWithTools(["Trello (free plan)"]),
        [],
        true
      );

      expect(generateWeekOpener).toHaveBeenCalledTimes(1);
      const call = vi.mocked(generateWeekOpener).mock.calls[0];
      expect(call[0]).toBe("Introduction to Project Management"); // topic (introTitle)
      expect(call[1]).toBe(WEEK.summary); // summary
      expect(call[2]).toBe(30); // DEFAULT_OPENER_MINUTES
      expect(call[3]).toBe("gemini"); // provider
      expect(call[4]).toBe("applied"); // exerciseKind, derived from courseKind
      expect(call[5]).toBe("# Real instructions: build a stakeholder register"); // assignmentContext
      expect(call[6]).toEqual(["Trello (free plan)"]); // committedToolNames (requiredTools)
    });

    it("derives exerciseKind 'coding' for a coding course", async () => {
      vi.mocked(generateWeekOpener).mockResolvedValue({ text: "x" });

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
        undefined,
        [],
        true
      );

      expect(vi.mocked(generateWeekOpener).mock.calls[0][4]).toBe("coding");
    });

    // The whole point of the reorder: the deck must actually SEE the opener,
    // not merely run after it - proven by a data dependency (the opener's
    // marker text reaching the deck's own prompt), not just call timing.
    it("composes the opener's text into the deck's own prompt, sequenced AFTER the opener resolves", async () => {
      vi.mocked(generateWeekOpener).mockResolvedValue({ text: "OPENER_TEXT_MARKER_XYZ" });

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
        undefined,
        [],
        true
      );

      const prompts = callLlmPrompts();
      const deckPrompt = prompts.find((p) => p.includes("THIS WEEK'S CLASS OPENER"));
      expect(deckPrompt, "no deck prompt carried the opener block").toBeTruthy();
      expect(deckPrompt).toContain("OPENER_TEXT_MARKER_XYZ");
      expect(deckPrompt).toContain("do NOT re-teach that case study or re-run that warm-up");
    });

    it("degrades gracefully when the opener fails: openerFailed is set, openerText is empty, and the deck's prompt omits the opener block", async () => {
      vi.mocked(generateWeekOpener).mockResolvedValue({ error: "HTTP 503" });

      const plan = await buildScheduleWeekPlan(
        WEEK,
        0,
        "A PM course",
        50,
        "gemini",
        undefined,
        undefined,
        [],
        "applied",
        undefined,
        [],
        true
      );

      expect(plan.openerFailed).toBe(true);
      expect(plan.openerText).toBe("");
      expect(callLlmPrompts().some((p) => p.includes("THIS WEEK'S CLASS OPENER"))).toBe(false);
      // A failed opener must not abort the week - the deck still generates.
      expect(plan.slidesFailed).toBeUndefined();
    });

    it("still generates the deck and the intro/objectives normally alongside the opener", async () => {
      vi.mocked(generateWeekOpener).mockResolvedValue({ text: "x" });

      const plan = await buildScheduleWeekPlan(
        WEEK,
        0,
        "A PM course",
        50,
        "gemini",
        undefined,
        undefined,
        [],
        "applied",
        undefined,
        [],
        true
      );

      expect(plan.moduleIntroduction).toBe("x");
      expect(plan.slidesFailed).toBeUndefined();
      expect(plan.slides.length).toBeGreaterThan(0);
    });

    it("surfaces generateWeekOpener's returned text on the plan verbatim (assembleLectureFiles ships whatever is here)", async () => {
      vi.mocked(generateWeekOpener).mockResolvedValue({ text: "  # Class Opener\n\nBody  " });

      const plan = await buildScheduleWeekPlan(
        WEEK,
        0,
        "A PM course",
        50,
        "gemini",
        undefined,
        undefined,
        [],
        "applied",
        undefined,
        [],
        true
      );

      expect(plan.openerText).toBe("  # Class Opener\n\nBody  ");
      expect(plan.openerFailed).toBeUndefined();
    });
  });
});
