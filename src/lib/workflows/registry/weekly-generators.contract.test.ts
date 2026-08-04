// TDD for CHUNK C of the Course Build cleanup, written from the acceptance criteria
// BEFORE the implementation existed. The quota test below currently FAILS.
// Make it pass without changing what it asserts.
//
// Context. Six steps - announcements, qa, current-events, significance,
// knowledge-checks, instructor-notes - are one orchestration written six times:
// ~600 of their 1,188 combined run-body lines are duplicates, and 46 distinct
// non-trivial lines appear in all six. Chunk C collapses them onto one shared runner.
//
// This file pins the things a careless consolidation would FLATTEN. It deliberately
// does NOT re-test the shared contract - grounding honesty, per-week degrade, the files
// chain, `selected`, passThroughOnFailure - which the six per-step test files
// (2,344 lines) and docs/REGRESSION.md entries 182/183/184/191 already cover.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScheduleWeekPlan } from "@/app/actions";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import { emptyCourseProject } from "@/lib/course-project";
import type { Course } from "@/lib/supabase/courses";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  draftAnnouncementAction: vi.fn(),
  createScheduledAnnouncementAction: vi.fn(),
  generateLectureQaAction: vi.fn(),
  researchCurrentEventsAction: vi.fn(),
  generateWeekSignificanceAction: vi.fn(),
  generateKnowledgeCheckAction: vi.fn(),
  generateInstructorNotesAction: vi.fn(),
  createPageAction: vi.fn(),
  createModuleItemAction: vi.fn(),
  createGradableAction: vi.fn(),
  createQuizQuestionAction: vi.fn(),
  bulkUpdateAction: vi.fn(),
}));

import {
  listCourseHubAction,
  generateLectureQaAction,
  researchCurrentEventsAction,
  createPageAction,
  createModuleItemAction,
} from "@/app/actions";

import { weeklyAnnouncementSteps } from "./steps.weekly-announcements";
import { courseBuildQaSteps } from "./steps.course-build-qa";
import { courseBuildCurrentEventsSteps } from "./steps.course-build-current-events";
import { weeklySignificanceSteps } from "./steps.weekly-significance";
import { knowledgeCheckSteps } from "./steps.knowledge-checks";
import { instructorNotesSteps } from "./steps.instructor-notes";

// A hard monthly spend cap. isNonTransientQuotaRefusal (weekly-generator.ts - it moved
// there when the six generators were consolidated, and is still re-exported from
// steps.weekly-announcements.ts for its existing importers) matches HTTP 429 AND billing
// wording; a bare 429 is transient and must NOT stop the loop.
const SPEND_CAP_429 =
  'LLM API error for "Week 2": HTTP 429 - {"error":{"code":429,"message":"Your project has exceeded its monthly spending cap.","status":"RESOURCE_EXHAUSTED"}}';

function testHelpers(): StepRunHelpers {
  return {
    activeInstitution: null,
    provider: "gemini",
    author: "Test Author",
    saveBundle: null,
    saveCourseMaterialFile: null,
    saveCourseCastletopFile: null,
    saveCourseExportFile: null,
    loadCommonResources: null,
    getLibraryFile: null,
    getInstitutionFields: null,
    loadCourseExport: null,
    loadCourseMaterials: null,
  };
}

function baseCourse(): Course {
  return {
    id: "course-1",
    name: "MGT 422",
    courseCode: "MGT422",
    term: null,
    canvasUrl: "https://canvas.example.edu/courses/123",
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
    startDate: "2026-01-05",
    description: null,
    weeks: 6,
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
  } as Course;
}

/** The exact shape gatherWeekMaterials scans for. */
function materialsFile(week: number): GeneratedCourseFile {
  return {
    name: `Week ${week} Objectives.docx`,
    blob: new Blob(["x"]),
    mimeType: "application/octet-stream",
    weekNumber: week,
    sortOrder: 0.5,
    role: "objectives",
    pageText: "Objectives text.",
  };
}

function sixWeekSchedule(): ScheduleWeekPlan[] {
  return [1, 2, 3, 4, 5, 6].map((week) => ({
    week,
    topic: `Topic ${week}`,
    summary: "",
    assignmentTitle: null,
    assignmentSlug: null,
    testName: null,
  }));
}

const STEPS = {
  announcements: weeklyAnnouncementSteps.find((s) => s.type === "generate-weekly-announcements")!,
  qa: courseBuildQaSteps.find((s) => s.type === "generate-weekly-qa")!,
  currentEvents: courseBuildCurrentEventsSteps.find((s) => s.type === "generate-weekly-current-events")!,
  significance: weeklySignificanceSteps.find((s) => s.type === "generate-weekly-significance")!,
  knowledgeChecks: knowledgeCheckSteps.find((s) => s.type === "generate-knowledge-checks")!,
  instructorNotes: instructorNotesSteps.find((s) => s.type === "generate-instructor-notes")!,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
  vi.mocked(createPageAction).mockResolvedValue({
    page: { pageId: 1, url: "u", title: "t", body: "b", published: true, updatedAt: null },
  });
  vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true });
});

// ---------------------------------------------------------------------------
// AC C2 - the count output key is NOT uniform across the six, and presets bind
// these names. A consolidation that unifies them silently yields `undefined` at
// every binding site. Exercised through the `selected: ""` skip path, which
// returns before any grounding precondition, so this is a real runtime assertion
// for all six rather than a source-text check.
// ---------------------------------------------------------------------------
describe("AC C2 - each generator keeps its own count output key", () => {
  it.each([
    ["announcements", STEPS.announcements, "announcementCount"],
    ["qa", STEPS.qa, "count"],
    ["currentEvents", STEPS.currentEvents, "count"],
    ["significance", STEPS.significance, "count"],
    ["knowledgeChecks", STEPS.knowledgeChecks, "checkCount"],
    ["instructorNotes", STEPS.instructorNotes, "count"],
  ])("%s reports its count under `%s`", async (_name, step, countKey) => {
    const files = [materialsFile(1)];
    const result = await step.run(
      { schedule: sixWeekSchedule(), files, selected: "" },
      testHelpers(),
      () => {}
    );
    expect(Object.keys(result.outputs)).toContain(countKey);
    expect(result.outputs[countKey]).toBe(0);
    // and the files chain is passed through by identity, not rebuilt
    expect(result.outputs.files).toBe(files);
  });

  it("the step declaring `announcementCount` does not also declare `count`, and vice versa", async () => {
    const files = [materialsFile(1)];
    const ann = await STEPS.announcements.run({ schedule: sixWeekSchedule(), files, selected: "" }, testHelpers(), () => {});
    const kc = await STEPS.knowledgeChecks.run({ schedule: sixWeekSchedule(), files, selected: "" }, testHelpers(), () => {});
    expect(Object.keys(ann.outputs)).not.toContain("count");
    expect(Object.keys(kc.outputs)).not.toContain("count");
  });
});

// ---------------------------------------------------------------------------
// AC C3 - THE LIVE BUG. Five of the six break out of the per-week loop on a hard
// spend-cap 429. generate-weekly-current-events does not: it imports only
// gatherWeekMaterials from steps.weekly-announcements.ts, never
// isNonTransientQuotaRefusal, and declares `let failedWeekCount = 0` with no
// quotaStoppedAtWeek - so it keeps issuing doomed calls for every remaining week.
// The `qa` case is the GREEN CONTROL: it already behaves correctly, so if both
// cases below ever go green for the wrong reason (e.g. the loop stops for some
// unrelated cause), the control still distinguishes real behavior from an artifact.
// ---------------------------------------------------------------------------
describe("AC C3 - a hard spend-cap 429 stops the whole loop, it does not just fail one week", () => {
  // NOTE ON HOW THE FAILURE IS SIMULATED. These actions REPORT a refusal by
  // resolving to `{ error }`; they do not throw. The quota check sits inside the
  // `if ("error" in generated)` branch (steps.course-build-qa.ts:180-192). A
  // throwing mock lands in the generic `catch (err)` instead, which has no quota
  // check in ANY of the six - so mocking a throw here would test a different path
  // and would report every step as broken. Simulate what the action really does.
  it("generate-weekly-qa stops after the refusal (control: already correct today)", async () => {
    const files = [1, 2, 3, 4, 5, 6].map(materialsFile);
    vi.mocked(generateLectureQaAction).mockResolvedValue({ error: SPEND_CAP_429 });

    await STEPS.qa.run({ schedule: sixWeekSchedule(), files }, testHelpers(), () => {});

    expect(generateLectureQaAction).toHaveBeenCalledTimes(1);
  });

  it("generate-weekly-current-events stops after the refusal instead of burning five more weeks", async () => {
    const files = [1, 2, 3, 4, 5, 6].map(materialsFile);
    vi.mocked(researchCurrentEventsAction).mockResolvedValue({ error: SPEND_CAP_429 });

    const result = await STEPS.currentEvents.run(
      { schedule: sixWeekSchedule(), files },
      testHelpers(),
      () => {}
    );

    // The whole point: ONE doomed call, not six.
    expect(researchCurrentEventsAction).toHaveBeenCalledTimes(1);
    // and the step says so, rather than reporting five silent per-week errors
    const report = String(result.outputs.report ?? "");
    expect(report.toLowerCase()).toMatch(/quota|spending cap|not attempted/);
  });

  it("a TRANSIENT 429 does not stop the loop - only billing-shaped refusals do", async () => {
    const files = [1, 2, 3].map(materialsFile);
    vi.mocked(researchCurrentEventsAction).mockResolvedValue({
      error: 'HTTP 429 - {"error":{"code":429,"message":"Rate limit exceeded, retry shortly."}}',
    });

    await STEPS.currentEvents.run(
      { schedule: sixWeekSchedule().slice(0, 3), files },
      testHelpers(),
      () => {}
    );

    // Every week is still attempted: a transient 429 is already retried inside
    // callLlm, so the loop must keep going. This is what stops an implementer
    // "fixing" the bug by breaking out of the loop on ANY 429.
    expect(researchCurrentEventsAction).toHaveBeenCalledTimes(3);
  });
});
