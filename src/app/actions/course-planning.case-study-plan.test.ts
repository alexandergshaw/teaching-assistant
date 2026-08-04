// V1/V2/V4 (professional-lift audit): generateLectureMaterialsFromScheduleAction
// calls planCourseCaseStudies ONCE, up front, before its mapWithConcurrency
// loop starts - see that function's own doc comment for why (the old
// mechanism raced under mapWithConcurrency's 4-at-a-time pool). This file
// isolates that wiring: both planCourseCaseStudies and buildScheduleWeekPlan
// are mocked, so only the wiring in course-planning.ts itself is under test,
// not either function's own internal behavior (each has its own dedicated
// test file already).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("./course-planning-grounding", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./course-planning-grounding")>();
  return { ...actual, buildScheduleWeekPlan: vi.fn() };
});

vi.mock("./case-study-plan", () => ({
  planCourseCaseStudies: vi.fn(),
}));

import { buildScheduleWeekPlan } from "./course-planning-grounding";
import { planCourseCaseStudies } from "./case-study-plan";
import { generateLectureMaterialsFromScheduleAction } from "./course-planning";
import type { AssignmentPlan } from "../actions-types";

function stubPlan(weekNumber: number): AssignmentPlan {
  return {
    assignmentName: `week-${weekNumber}`,
    slides: [{ title: "S", bullets: ["b"] }],
    presentationTitle: "T",
    label: `Week ${weekNumber}`,
    moduleIntroduction: "intro",
    assignmentInstructions: "instructions",
    moduleObjectives: "objectives",
    weekNumber,
    introTemplateHeadings: [],
    instructionsTemplateHeadings: [],
  };
}

const SCHEDULE = [
  { week: 1, topic: "Stakeholder Analysis", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
  { week: 2, topic: "Project Charter", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
  { week: 3, topic: "Risk Management", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
];

describe("generateLectureMaterialsFromScheduleAction: up-front case-study plan (V1/V2/V4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildScheduleWeekPlan).mockImplementation(async (week) => stubPlan((week as { week: number }).week));
  });

  it("calls planCourseCaseStudies once, up front, for an applied course", async () => {
    vi.mocked(planCourseCaseStudies).mockResolvedValue(new Map());

    await generateLectureMaterialsFromScheduleAction(
      JSON.stringify(SCHEDULE),
      "A PM course",
      50,
      "gemini",
      undefined,
      undefined,
      undefined,
      "applied"
    );

    expect(planCourseCaseStudies).toHaveBeenCalledTimes(1);
    expect(planCourseCaseStudies).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ week: 1 })]),
      "A PM course",
      "gemini",
      "applied",
      // Group F, decision 4: a fresh, empty diagnostics sink is threaded
      // through every call - see the "exhaustion reporting" describe block
      // below for what gets read back out of it.
      { exhaustedWeeks: [] }
    );
  });

  // Z1 (Group Z): SUPERSEDES the old "never calls planCourseCaseStudies for
  // a coding course" behavior - a coding course now gets the SAME up-front,
  // whole-course case-study plan an applied course already had (matched
  // against CASE_STUDIES instead of APPLIED_CASE_STUDIES - see
  // planCourseCaseStudies's own course-kind-aware tests, case-study-plan.test.ts).
  it("also calls planCourseCaseStudies, up front, for a coding course (the default) - Z1 parity", async () => {
    vi.mocked(planCourseCaseStudies).mockResolvedValue(new Map());

    await generateLectureMaterialsFromScheduleAction(JSON.stringify(SCHEDULE), "A course", 50, "gemini");

    expect(planCourseCaseStudies).toHaveBeenCalledTimes(1);
    expect(planCourseCaseStudies).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ week: 1 })]),
      "A course",
      "gemini",
      "coding",
      { exhaustedWeeks: [] }
    );
  });

  it("hands each week its own assignment and every OTHER week's organization as the exclusion list", async () => {
    vi.mocked(planCourseCaseStudies).mockResolvedValue(
      new Map([
        [1, { organization: "Denver International Airport", period: "1994-1995", hook: "hook1" }],
        [2, { organization: "Healthcare.gov", hook: "hook2" }],
        [3, { organization: "Big Dig", hook: "hook3" }],
      ])
    );

    await generateLectureMaterialsFromScheduleAction(
      JSON.stringify(SCHEDULE),
      "A PM course",
      50,
      "gemini",
      undefined,
      undefined,
      undefined,
      "applied"
    );

    expect(buildScheduleWeekPlan).toHaveBeenCalledTimes(3);
    const calls = vi.mocked(buildScheduleWeekPlan).mock.calls;

    const week1Call = calls.find((c) => (c[0] as { week: number }).week === 1)!;
    expect(week1Call[12]).toEqual({ organization: "Denver International Airport", period: "1994-1995", hook: "hook1" });
    const week1Others = week1Call[13] as string[];
    expect(week1Others).toContain("Healthcare.gov");
    expect(week1Others).toContain("Big Dig");
    expect(week1Others).not.toContain("Denver International Airport");

    const week2Call = calls.find((c) => (c[0] as { week: number }).week === 2)!;
    expect(week2Call[12]).toEqual({ organization: "Healthcare.gov", hook: "hook2" });
    const week2Others = week2Call[13] as string[];
    expect(week2Others).toContain("Denver International Airport");
    expect(week2Others).toContain("Big Dig");
    expect(week2Others).not.toContain("Healthcare.gov");
  });

  it("a week the up-front plan could not assign gets undefined - buildScheduleWeekPlan's own fallback applies", async () => {
    vi.mocked(planCourseCaseStudies).mockResolvedValue(
      new Map([[1, { organization: "Denver International Airport", hook: "hook1" }]])
    );

    await generateLectureMaterialsFromScheduleAction(
      JSON.stringify(SCHEDULE),
      "A PM course",
      50,
      "gemini",
      undefined,
      undefined,
      undefined,
      "applied"
    );

    const calls = vi.mocked(buildScheduleWeekPlan).mock.calls;
    const week2Call = calls.find((c) => (c[0] as { week: number }).week === 2)!;
    expect(week2Call[12]).toBeUndefined();
  });

  // Group F (backlog: "validated case studies, one per week per course"),
  // decision 4: planCourseCaseStudies is mocked here (this file only tests
  // course-planning.ts's own wiring - see the header comment), so exhaustion
  // is simulated the same way an unmatched-week assignment already is above:
  // by mutating the diagnostics object the real function would have mutated.
  describe("case-study library exhaustion is surfaced on the affected week's plan (decision 4)", () => {
    it("stamps caseStudyLibraryExhausted on exactly the week(s) planCourseCaseStudies reports as exhausted", async () => {
      vi.mocked(planCourseCaseStudies).mockImplementation(async (_weeks, _desc, _provider, _kind, diagnostics) => {
        diagnostics?.exhaustedWeeks.push(2);
        return new Map([[1, { organization: "Denver International Airport", hook: "hook1" }]]);
      });

      const plans = await generateLectureMaterialsFromScheduleAction(
        JSON.stringify(SCHEDULE),
        "A PM course",
        50,
        "gemini",
        undefined,
        undefined,
        undefined,
        "applied"
      );

      expect("error" in plans).toBe(false);
      if ("error" in plans) return;

      const byWeek = new Map(plans.map((p) => [p.weekNumber, p]));
      expect(byWeek.get(1)!.caseStudyLibraryExhausted).toBeUndefined();
      expect(byWeek.get(2)!.caseStudyLibraryExhausted).toBe(true);
      expect(byWeek.get(3)!.caseStudyLibraryExhausted).toBeUndefined();
    });

    it("leaves caseStudyLibraryExhausted undefined on every week when nothing was exhausted", async () => {
      vi.mocked(planCourseCaseStudies).mockResolvedValue(
        new Map([[1, { organization: "Denver International Airport", hook: "hook1" }]])
      );

      const plans = await generateLectureMaterialsFromScheduleAction(
        JSON.stringify(SCHEDULE),
        "A PM course",
        50,
        "gemini",
        undefined,
        undefined,
        undefined,
        "applied"
      );

      expect("error" in plans).toBe(false);
      if ("error" in plans) return;

      expect(plans.every((p) => p.caseStudyLibraryExhausted === undefined)).toBe(true);
    });
  });
});
