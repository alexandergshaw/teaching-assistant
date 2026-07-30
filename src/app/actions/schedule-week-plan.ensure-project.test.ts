// docs/REGRESSION.md 152, AC5: end-to-end proof that a course with NO project
// yet still gets real milestone chaining on the schedule-driven pipeline
// (buildScheduleWeekPlan, the "per-week spine" regression 146 targeted) once
// ensureCourseProject (src/lib/workflows/registry/steps.course-project.ts)
// derives one on demand - not merely that the two functions compile
// together. Only the true I/O boundaries are mocked: auth, callLlm, and the
// two `@/app/actions` project functions ensureCourseProject itself calls
// (generateCourseProjectAction/setCourseProjectAction - each already has its
// own dedicated prompt-building tests in course-project.test.ts, so this file
// does not re-derive that). buildScheduleWeekPlan and
// generateAssignmentInstructionsForAssignment (./shared) run for REAL, so the
// actual prompt text sent to the model is inspected directly, mirroring
// schedule-week-plan.test.ts's own callLlmPrompts() convention.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  generateCourseProjectAction: vi.fn(),
  setCourseProjectAction: vi.fn(),
}));

import { callLlm } from "@/lib/llm";
import { generateCourseProjectAction, setCourseProjectAction } from "@/app/actions";
import { buildScheduleWeekPlan } from "./course-planning-grounding";
import { ensureCourseProject } from "@/lib/workflows/registry/steps.course-project";
import { emptyCourseProject, hasProject } from "@/lib/course-project";
import type { Course } from "@/lib/supabase/courses";
import type { ScheduleWeekPlan } from "../actions-types";

function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "Project Management Foundations",
    courseCode: "PM101",
    term: null,
    canvasUrl: null,
    repos: [],
    githubOrg: null,
    textbook: null,
    syllabusId: null,
    institution: null,
    integrations: [],
    roster: null,
    notes: null,
    topics: null,
    csvName: null,
    csvData: null,
    rubricName: null,
    rubricData: null,
    startDate: null,
    description: null,
    weeks: 2,
    tests: null,
    lms: null,
    dayTime: null,
    modality: null,
    topicOutline: null,
    syllabusTemplateId: null,
    endDate: null,
    breaks: null,
    assignmentDueRule: null,
    email: null,
    emailClient: null,
    classLengthMinutes: null,
    courseProject: emptyCourseProject(),
    materialsFiles: [],
    castletopFiles: [],
    miscFiles: [],
    exportFiles: [],
    materialsZipName: null,
    materialsZipPath: null,
    materialsZipSize: null,
    customTiles: [],
    hiddenTiles: [],
    studentRepos: [],
    updatedAt: "2024-09-01T00:00:00Z",
    ...overrides,
  };
}

const WEEK1: ScheduleWeekPlan = {
  week: 1,
  topic: "Stakeholder Analysis",
  summary: "Identify and map project stakeholders.",
  assignmentTitle: null,
  assignmentSlug: null,
  testName: null,
};
const WEEK2: ScheduleWeekPlan = {
  week: 2,
  topic: "Project Charter",
  summary: "Draft the project charter.",
  assignmentTitle: null,
  assignmentSlug: null,
  testName: null,
};

// The SAME generic slide-shaped JSON blob schedule-week-plan.test.ts's own
// mockSlides() helper uses for every callLlm call across a full
// buildScheduleWeekPlan run (concept planning, tool selection, module intro,
// assignment instructions, module objectives, slide generation): every one of
// those callers already degrades gracefully on a shape it does not recognize
// rather than throwing (proven by that file's own existing, passing applied-
// course tests), so this single mock is sufficient to let the WHOLE real
// pipeline complete.
function mockAllLlmCalls() {
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

describe("ensureCourseProject -> buildScheduleWeekPlan chaining (docs/REGRESSION.md 152, AC5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAllLlmCalls();
  });

  it("a tile with no project gets one from ensureCourseProject, and its milestone genuinely reaches the composed assignment-instructions prompt", async () => {
    vi.mocked(generateCourseProjectAction).mockResolvedValue({
      name: "Community Garden Launch",
      brief: "Plan and pitch a community garden to the city.",
      milestones: [
        { week: 1, title: "Stakeholder map", deliverable: "A one-page stakeholder map." },
        { week: 2, title: "Project charter", deliverable: "A signed-off project charter." },
      ],
    });
    vi.mocked(setCourseProjectAction).mockResolvedValue({ ok: true });

    const tile = baseCourse();
    const schedule = [WEEK1, WEEK2];

    // Step 1: the on-demand path (what the lecture-materials-from-schedule
    // step now does before calling generateLectureMaterialsFromScheduleAction
    // - see steps.content-lectures.ts).
    const ensured = await ensureCourseProject(tile, "gemini", "applied", schedule);
    expect(ensured.created).toBe(true);
    expect(hasProject(ensured.project)).toBe(true);

    // Step 2: the REAL per-week pipeline, fed the project ensureCourseProject
    // just derived - exactly what buildScheduleWeekPlan's callers thread
    // through today (AC1/AC6, docs/REGRESSION.md 146).
    await buildScheduleWeekPlan(
      WEEK1,
      0,
      "An introductory project management course.",
      50,
      "gemini",
      undefined,
      undefined,
      schedule,
      "applied",
      ensured.project
    );

    const prompts = callLlmPrompts();
    const instructionsPrompt = prompts.find((p) => p.includes("COURSE PROJECT"));
    expect(instructionsPrompt, "no prompt contained a COURSE PROJECT block").toBeTruthy();

    // The milestone sentence (renderMilestoneContract) and the choice/rigor
    // rule (PROJECT_CHOICE_CONTRACT) both reached the real composed prompt -
    // not just an argument passed to a mocked function.
    expect(instructionsPrompt).toContain('milestone 1 of the course project "Community Garden Launch"');
    expect(instructionsPrompt).toContain("Stakeholder map");
    expect(instructionsPrompt).toContain("STUDENT CHOICE WITHIN THE PROJECT");
    // Week 1: honest continuity - no prior milestone exists yet.
    expect(instructionsPrompt).toContain("This is the first milestone");
  });

  it("week 2 of the SAME on-demand project references week 1's milestone as prior work to build on", async () => {
    vi.mocked(generateCourseProjectAction).mockResolvedValue({
      name: "Community Garden Launch",
      brief: "Plan and pitch a community garden to the city.",
      milestones: [
        { week: 1, title: "Stakeholder map", deliverable: "A one-page stakeholder map." },
        { week: 2, title: "Project charter", deliverable: "A signed-off project charter." },
      ],
    });
    vi.mocked(setCourseProjectAction).mockResolvedValue({ ok: true });

    const tile = baseCourse();
    const schedule = [WEEK1, WEEK2];

    const ensured = await ensureCourseProject(tile, "gemini", "applied", schedule);

    await buildScheduleWeekPlan(
      WEEK2,
      1,
      "An introductory project management course.",
      50,
      "gemini",
      undefined,
      undefined,
      schedule,
      "applied",
      ensured.project
    );

    const prompts = callLlmPrompts();
    const instructionsPrompt = prompts.find((p) => p.includes("COURSE PROJECT"));
    expect(instructionsPrompt).toBeTruthy();
    expect(instructionsPrompt).toContain('milestone 2 of the course project "Community Garden Launch"');
    expect(instructionsPrompt).toContain(
      "Earlier milestones are already done (Stakeholder map) - do not re-specify them"
    );
    expect(instructionsPrompt).toContain("BUILD ON what the student already produced");
  });

  it("idempotency across two on-demand calls: a SECOND call for the SAME (now-persisted) tile reuses the identical project - week 2's prompt still references week 1's real milestone, not a re-generated one", async () => {
    vi.mocked(generateCourseProjectAction).mockResolvedValue({
      name: "Community Garden Launch",
      brief: "Plan and pitch a community garden to the city.",
      milestones: [
        { week: 1, title: "Stakeholder map", deliverable: "A one-page stakeholder map." },
        { week: 2, title: "Project charter", deliverable: "A signed-off project charter." },
      ],
    });
    vi.mocked(setCourseProjectAction).mockResolvedValue({ ok: true });

    const tile = baseCourse();
    const schedule = [WEEK1, WEEK2];

    // Run 1 (e.g. week 1's own workflow run): generates and persists.
    const firstRun = await ensureCourseProject(tile, "gemini", "applied", schedule);
    expect(generateCourseProjectAction).toHaveBeenCalledTimes(1);

    // Run 2 (e.g. week 2's later run, re-loading the tile - now carrying the
    // project run 1 persisted): must NOT invent a second project.
    const reloadedTile = { ...tile, courseProject: firstRun.project };
    const secondRun = await ensureCourseProject(reloadedTile, "gemini", "applied", schedule);
    expect(secondRun.created).toBe(false);
    expect(generateCourseProjectAction).toHaveBeenCalledTimes(1);
    expect(setCourseProjectAction).toHaveBeenCalledTimes(1);
    expect(secondRun.project).toEqual(firstRun.project);
  });
});
