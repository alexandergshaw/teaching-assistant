// Z1 (Group Z): generateLecturePlansAction/generateLecturePlanForAssignmentAction
// (the repo-zip pipeline COURSE_KICKOFF/COURSE_REFRESH actually use whenever a
// repository is linked - see lecture-zip.ts's step, which calls this function
// directly when a repo is present) now compute a whole-zip case-study plan up
// front and thread each assignment's anchor into buildAssignmentPlan. Both
// buildAssignmentPlan and planCourseCaseStudies are mocked here so only the
// WIRING in this file is under test - each function's own behavior has its
// own dedicated test file already (build-assignment-plan.test.ts,
// case-study-plan.test.ts).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./shared", async () => {
  const actual = await vi.importActual<typeof import("./shared")>("./shared");
  return { ...actual, buildAssignmentPlan: vi.fn() };
});

vi.mock("./case-study-plan", () => ({
  planCourseCaseStudies: vi.fn(),
}));

import { buildAssignmentPlan } from "./shared";
import { planCourseCaseStudies } from "./case-study-plan";
import { generateLecturePlansAction, generateLecturePlanForAssignmentAction } from "./lecture-plans";
import type { AssignmentPlan } from "../actions-types";

function stubPlan(weekNumber: number): AssignmentPlan {
  return {
    assignmentName: `week${weekNumber}`,
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

async function buildZip(folders: Record<string, string>): Promise<string> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const [path, content] of Object.entries(folders)) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: "base64" });
}

describe("generateLecturePlansAction: up-front case-study plan (Z1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildAssignmentPlan).mockImplementation(async (bundle) => stubPlan(Number(bundle.name.match(/\d+/)?.[0]) || 1));
  });

  it("calls planCourseCaseStudies once, up front, with courseKind 'coding' and week-numbered entries derived from the folders", async () => {
    vi.mocked(planCourseCaseStudies).mockResolvedValue(new Map());

    const zipBase64 = await buildZip({
      "assignments/week1/README.md": "# Week 1\n\nBuild a loop.",
      "assignments/week2/README.md": "# Week 2\n\nBuild a function.",
    });

    await generateLecturePlansAction(zipBase64, 50);

    expect(planCourseCaseStudies).toHaveBeenCalledTimes(1);
    const [weeks, courseDescription, provider, courseKind] = vi.mocked(planCourseCaseStudies).mock.calls[0];
    expect(courseDescription).toBe("");
    expect(provider).toBe("gemini");
    expect(courseKind).toBe("coding");
    expect(weeks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ week: 1 }),
        expect.objectContaining({ week: 2 }),
      ])
    );
  });

  it("hands each bundle its own week's assignedCaseStudy from the up-front plan", async () => {
    vi.mocked(planCourseCaseStudies).mockResolvedValue(
      new Map([
        [1, { organization: "Ariane 5", period: "1996", hook: "Guidance software overflow." }],
        [2, { organization: "Therac-25", period: "1986", hook: "Race condition in radiation therapy." }],
      ])
    );

    const zipBase64 = await buildZip({
      "assignments/week1/README.md": "# Week 1\n\nBuild a loop.",
      "assignments/week2/README.md": "# Week 2\n\nBuild a function.",
    });

    await generateLecturePlansAction(zipBase64, 50);

    expect(buildAssignmentPlan).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(buildAssignmentPlan).mock.calls;
    const week1Call = calls.find((c) => c[0].name === "week1")!;
    const week2Call = calls.find((c) => c[0].name === "week2")!;
    expect(week1Call[6]).toEqual({ organization: "Ariane 5", period: "1996", hook: "Guidance software overflow." });
    expect(week2Call[6]).toEqual({ organization: "Therac-25", period: "1986", hook: "Race condition in radiation therapy." });
  });

  it("a week the up-front plan could not assign gets undefined - buildAssignmentPlan's own fallback applies", async () => {
    vi.mocked(planCourseCaseStudies).mockResolvedValue(
      new Map([[1, { organization: "Ariane 5", hook: "Guidance software overflow." }]])
    );

    const zipBase64 = await buildZip({
      "assignments/week1/README.md": "# Week 1\n\nBuild a loop.",
      "assignments/week2/README.md": "# Week 2\n\nBuild a function.",
    });

    await generateLecturePlansAction(zipBase64, 50);

    const calls = vi.mocked(buildAssignmentPlan).mock.calls;
    const week2Call = calls.find((c) => c[0].name === "week2")!;
    expect(week2Call[6]).toBeUndefined();
  });

  it("keeps opener-before-deck off by default, but threads an explicit opt-in to every repo assignment plan", async () => {
    vi.mocked(planCourseCaseStudies).mockResolvedValue(new Map());
    const zipBase64 = await buildZip({
      "assignments/week1/README.md": "# Week 1\n\nBuild a loop.",
      "assignments/week2/README.md": "# Week 2\n\nBuild a function.",
    });

    await generateLecturePlansAction(zipBase64, 50);
    expect(vi.mocked(buildAssignmentPlan).mock.calls.map((call) => call[7])).toEqual([false, false]);

    vi.mocked(buildAssignmentPlan).mockClear();
    await generateLecturePlansAction(zipBase64, 50, undefined, undefined, "gemini", undefined, true);
    expect(vi.mocked(buildAssignmentPlan).mock.calls.map((call) => call[7])).toEqual([true, true]);
  });

  // Group F, decision 4 - see the identical coverage in
  // course-planning.case-study-plan.test.ts for the schedule-driven path;
  // this is the zip-driven path's own wiring test, planCourseCaseStudies
  // itself mocked exactly as it is everywhere else in this file.
  it("stamps caseStudyLibraryExhausted on the affected week's plan when planCourseCaseStudies reports an exhausted week", async () => {
    vi.mocked(planCourseCaseStudies).mockImplementation(async (_weeks, _desc, _provider, _kind, diagnostics) => {
      diagnostics?.exhaustedWeeks.push(2);
      return new Map([[1, { organization: "Ariane 5", hook: "Guidance software overflow." }]]);
    });

    const zipBase64 = await buildZip({
      "assignments/week1/README.md": "# Week 1\n\nBuild a loop.",
      "assignments/week2/README.md": "# Week 2\n\nBuild a function.",
    });

    const plans = await generateLecturePlansAction(zipBase64, 50);

    expect("error" in plans).toBe(false);
    if ("error" in plans) return;

    const week1 = plans.find((p) => p.weekNumber === 1)!;
    const week2 = plans.find((p) => p.weekNumber === 2)!;
    expect(week1.caseStudyLibraryExhausted).toBeUndefined();
    expect(week2.caseStudyLibraryExhausted).toBe(true);
  });
});

describe("generateLecturePlanForAssignmentAction: single-week case-study match (Z1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildAssignmentPlan).mockResolvedValue(stubPlan(1));
  });

  it("calls planCourseCaseStudies with only the ONE requested week (no cross-assignment visibility)", async () => {
    vi.mocked(planCourseCaseStudies).mockResolvedValue(new Map());

    const zipBase64 = await buildZip({
      "assignments/week1/README.md": "# Week 1\n\nBuild a loop.",
      "assignments/week2/README.md": "# Week 2\n\nBuild a function.",
    });

    await generateLecturePlanForAssignmentAction(zipBase64, "week1", 50);

    expect(planCourseCaseStudies).toHaveBeenCalledTimes(1);
    const [weeks, , , courseKind] = vi.mocked(planCourseCaseStudies).mock.calls[0];
    expect(weeks).toHaveLength(1);
    expect(weeks[0].week).toBe(1);
    expect(courseKind).toBe("coding");
  });

  it("passes the matched assignment through to buildAssignmentPlan", async () => {
    vi.mocked(planCourseCaseStudies).mockResolvedValue(
      new Map([[1, { organization: "Ariane 5", period: "1996", hook: "Guidance software overflow." }]])
    );

    const zipBase64 = await buildZip({
      "assignments/week1/README.md": "# Week 1\n\nBuild a loop.",
    });

    await generateLecturePlanForAssignmentAction(zipBase64, "week1", 50);

    const call = vi.mocked(buildAssignmentPlan).mock.calls[0];
    expect(call[6]).toEqual({ organization: "Ariane 5", period: "1996", hook: "Guidance software overflow." });
  });
});
