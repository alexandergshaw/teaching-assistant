// Weekly "Significance of the Material": exercises the step's own honesty
// requirement directly - a week's document is only ever built when this
// week's own already-assigned case study is present in the accumulated
// "files" chain (attached by assembleLectureFiles, registry-helpers.ts, onto
// every file a week's plan produced) - never re-derived, never invented for
// a week the module selector left ungenerated this run.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScheduleWeekPlan } from "@/app/actions";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import { emptyCourseProject } from "@/lib/course-project";
import type { Course } from "@/lib/supabase/courses";
import type { CaseStudyAssignment } from "@/lib/case-study-prompt";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  generateWeekSignificanceAction: vi.fn(),
  createPageAction: vi.fn(),
  createModuleItemAction: vi.fn(),
}));

import {
  listCourseHubAction,
  generateWeekSignificanceAction,
  createPageAction,
  createModuleItemAction,
} from "@/app/actions";
import { weeklySignificanceSteps } from "./steps.weekly-significance";
import { PARTIAL_FAILURE_OUTPUT_KEY } from "@/lib/workflows/run-logging";

const SPEND_CAP_429 =
  'Significance-of-the-material generation failed: HTTP 429 — {"error":{"code":429,"message":"Your project has exceeded its monthly spending cap.","status":"RESOURCE_EXHAUSTED"}}';

const step = weeklySignificanceSteps.find((s) => s.type === "generate-weekly-significance")!;

const CASE_STUDY: CaseStudyAssignment = {
  organization: "Denver International Airport",
  period: "the early 1990s",
  hook: "Its automated baggage system failed spectacularly.",
};

function testHelpers(overrides: Partial<StepRunHelpers> = {}): StepRunHelpers {
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
    ...overrides,
  };
}

function baseCourse(overrides: Partial<Course> = {}): Course {
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
    weeks: 3,
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
  } as Course;
}

/** A file carrying `caseStudy` metadata for `week` - the exact shape
 * assembleLectureFiles (registry-helpers.ts) attaches onto every file a
 * week's plan produced, regardless of role. */
function caseStudyFile(week: number, caseStudy: CaseStudyAssignment = CASE_STUDY): GeneratedCourseFile {
  return {
    name: `Week ${week} Assignment Instructions.docx`,
    blob: new Blob(["x"]),
    mimeType: "application/octet-stream",
    weekNumber: week,
    sortOrder: 2,
    role: "instructions",
    pageText: "Assignment text.",
    caseStudy,
  };
}

/** A file with no case study - real generated materials, but no assigned
 * case (an unmatched week, or a repo-driven plan that never had one). */
function plainFile(week: number): GeneratedCourseFile {
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

function schedule(): ScheduleWeekPlan[] {
  return [
    { week: 1, topic: "Project Risk Management", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    { week: 2, topic: "Earned Value", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
  ];
}

describe("generate-weekly-significance step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(generateWeekSignificanceAction).mockResolvedValue({
      text: "# Why This Matters\n\nDenver International Airport shows the real stakes.",
    });
    vi.mocked(createPageAction).mockResolvedValue({
      page: { pageId: 1, url: "week-1-significance", title: "t", body: "b", published: true, updatedAt: null },
    });
    vi.mocked(createModuleItemAction).mockResolvedValue({ ok: true });
  });

  it("returns the incoming files unchanged when the schedule is empty", async () => {
    const incoming: GeneratedCourseFile[] = [caseStudyFile(1)];
    const result = await step.run({ schedule: [], files: incoming }, testHelpers(), () => {});
    expect(result.outputs.files).toBe(incoming);
    expect(result.outputs.count).toBe(0);
  });

  // AC1/AC2 (COURSE_BUILD's output selector): deselected means "do no work,
  // pass files through unchanged" - it never even calls
  // generateWeekSignificanceAction.
  it("selected explicitly off: does no work and passes incoming files through unchanged", async () => {
    const files: GeneratedCourseFile[] = [caseStudyFile(1)];
    const result = await step.run({ schedule: schedule(), files, selected: "" }, testHelpers(), () => {});
    expect(generateWeekSignificanceAction).not.toHaveBeenCalled();
    expect(result.outputs.files).toBe(files);
    expect(result.outputs.count).toBe(0);
  });

  it("selected left unbound (undefined): generates normally, matching every preset that does not wire the output selector", async () => {
    const files: GeneratedCourseFile[] = [caseStudyFile(1)];
    const result = await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});
    expect(generateWeekSignificanceAction).toHaveBeenCalledTimes(1);
    expect(result.outputs.count).toBe(1);
  });

  // The central honesty requirement (AC): a week with real generated
  // materials but NO assigned case study is skipped, never given an
  // invented one - contrast steps.weekly-announcements.ts's "no materials"
  // skip, which this deliberately does NOT reduce to (plainFile below DOES
  // carry real materials text, proving the skip here is about the case study
  // specifically, not a materials-presence check borrowed wholesale).
  it("skips a week with real materials but no assigned case study, rather than inventing one", async () => {
    const files: GeneratedCourseFile[] = [plainFile(1), caseStudyFile(2)];
    const result = await step.run({ schedule: schedule(), files }, testHelpers(), () => {});

    expect(generateWeekSignificanceAction).toHaveBeenCalledTimes(1); // only week 2 has a case study
    expect(result.outputs.count).toBe(1);
    const report = result.outputs.report as string;
    expect(report).toContain("Week 1: skipped - no assigned case study available for this week");
  });

  it("passes the exact assigned case study - not a re-derived one - into the generator", async () => {
    const files: GeneratedCourseFile[] = [caseStudyFile(1, CASE_STUDY)];
    await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});
    const call = vi.mocked(generateWeekSignificanceAction).mock.calls[0];
    expect(call[0]).toBe("Project Risk Management");
    expect(call[2]).toBe(CASE_STUDY);
  });

  it("produces a supplement file per week, sortOrder 0.2, filed under that week's own weekNumber", async () => {
    const files: GeneratedCourseFile[] = [caseStudyFile(1)];
    const result = await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});
    const outFiles = result.outputs.files as GeneratedCourseFile[];
    const doc = outFiles.find((f) => f.name.includes("Significance"));
    expect(doc).toBeDefined();
    expect(doc!.role).toBe("supplement");
    expect(doc!.weekNumber).toBe(1);
    expect(doc!.sortOrder).toBe(0.2);
    expect(doc!.pageText).toContain("Denver International Airport");
  });

  it("does not post to the LMS when postToLms is off (default), and says so", async () => {
    const files: GeneratedCourseFile[] = [caseStudyFile(1)];
    const result = await step.run({ schedule: [schedule()[0]], files, hubCourse: "course-1" }, testHelpers(), () => {});
    expect(createPageAction).not.toHaveBeenCalled();
    const report = result.outputs.report as string;
    expect(report).toContain("posting is turned off");
  });

  it("creates and places a published LMS page per week when postToLms is on", async () => {
    const modules = [{ week: 1, id: 555, name: "Module 01" }];
    const files: GeneratedCourseFile[] = [caseStudyFile(1)];
    const result = await step.run(
      { schedule: [schedule()[0]], files, hubCourse: "course-1", modules, postToLms: "1" },
      testHelpers(),
      () => {}
    );

    expect(createPageAction).toHaveBeenCalledTimes(1);
    const [, fields] = vi.mocked(createPageAction).mock.calls[0];
    expect(fields.published).toBe(true);
    expect(createModuleItemAction).toHaveBeenCalledWith(
      "https://canvas.example.edu/courses/123",
      555,
      { type: "Page", pageUrl: "week-1-significance" },
      undefined
    );
    const report = result.outputs.report as string;
    expect(report).toContain("page created");
  });

  it("notes the page was not placed in a module when no module matches that week", async () => {
    const files: GeneratedCourseFile[] = [caseStudyFile(1)];
    const result = await step.run(
      { schedule: [schedule()[0]], files, hubCourse: "course-1", modules: [], postToLms: "1" },
      testHelpers(),
      () => {}
    );
    expect(createModuleItemAction).not.toHaveBeenCalled();
    const report = result.outputs.report as string;
    expect(report).toContain("not placed in a module");
  });

  it("reports 'not posted' when postToLms is on but the tile has no LMS course", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse({ canvasUrl: "" })] });
    const files: GeneratedCourseFile[] = [caseStudyFile(1)];
    const result = await step.run(
      { schedule: [schedule()[0]], files, hubCourse: "course-1", postToLms: "1" },
      testHelpers(),
      () => {}
    );
    expect(createPageAction).not.toHaveBeenCalled();
    const report = result.outputs.report as string;
    expect(report).toContain("no LMS course on the tile");
  });

  it("never throws when the LMS post itself fails - it is noted, not fatal", async () => {
    vi.mocked(createPageAction).mockResolvedValue({ error: "Canvas is down" });
    const files: GeneratedCourseFile[] = [caseStudyFile(1)];
    const result = await step.run(
      { schedule: [schedule()[0]], files, hubCourse: "course-1", postToLms: "1" },
      testHelpers(),
      () => {}
    );
    expect(result.outputs.count).toBe(1);
    const report = result.outputs.report as string;
    expect(report).toContain("LMS error - Canvas is down");
  });

  it("continues to the next week when one week's generation fails", async () => {
    vi.mocked(generateWeekSignificanceAction)
      .mockResolvedValueOnce({ error: "model unavailable" })
      .mockResolvedValueOnce({ text: "Week 2 significance text." });
    const files: GeneratedCourseFile[] = [caseStudyFile(1), caseStudyFile(2)];
    const result = await step.run({ schedule: schedule(), files }, testHelpers(), () => {});
    expect(result.outputs.count).toBe(1);
    const report = result.outputs.report as string;
    expect(report).toContain("Week 1: error");
  });

  describe("non-transient quota refusal (mirrors generate-weekly-announcements' U7-AC1)", () => {
    it("stops after the first non-transient quota refusal instead of attempting every remaining week", async () => {
      vi.mocked(generateWeekSignificanceAction)
        .mockResolvedValueOnce({ text: "Week 1 text" })
        .mockResolvedValueOnce({ error: SPEND_CAP_429 });

      const fullSchedule: ScheduleWeekPlan[] = Array.from({ length: 5 }, (_, i) => ({
        week: i + 1,
        topic: `Topic ${i + 1}`,
        summary: "",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: null,
      }));
      const files: GeneratedCourseFile[] = fullSchedule.map((w) => caseStudyFile(w.week));

      const result = await step.run({ schedule: fullSchedule, files }, testHelpers(), () => {});

      expect(generateWeekSignificanceAction).toHaveBeenCalledTimes(2);
      expect(result.outputs.count).toBe(1);
      const report = result.outputs.report as string;
      expect(report).toContain("Stopped after week 2 - the LLM quota was exhausted; 3 week(s) not attempted.");
    });

    it("sets the partial-failure signal when the quota is exhausted mid-run", async () => {
      vi.mocked(generateWeekSignificanceAction)
        .mockResolvedValueOnce({ text: "Week 1 text" })
        .mockResolvedValueOnce({ error: SPEND_CAP_429 });

      const files: GeneratedCourseFile[] = [caseStudyFile(1), caseStudyFile(2)];
      const result = await step.run({ schedule: schedule(), files }, testHelpers(), () => {});

      const detail = result.outputs[PARTIAL_FAILURE_OUTPUT_KEY];
      expect(typeof detail).toBe("string");
      expect(detail as string).toContain("quota was exhausted after week 2");
    });

    it("does not set the partial-failure signal when every week succeeds", async () => {
      const files: GeneratedCourseFile[] = [caseStudyFile(1), caseStudyFile(2)];
      const result = await step.run({ schedule: schedule(), files }, testHelpers(), () => {});
      expect(result.outputs[PARTIAL_FAILURE_OUTPUT_KEY]).toBeUndefined();
    });
  });
});
