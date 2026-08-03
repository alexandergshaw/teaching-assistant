// generate-weekly-qa: exercises the step's own honesty requirement directly
// - a week's anticipated Q&A document is only ever built when this week's
// own real generated materials (objectives/slides/instructions/opener) are
// present in the accumulated "files" chain, never invented generically for a
// week the module selector left ungenerated this run. Mirrors the shape of
// steps.weekly-significance.test.ts / steps.instructor-notes.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScheduleWeekPlan } from "@/app/actions";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import { emptyCourseProject } from "@/lib/course-project";
import type { Course } from "@/lib/supabase/courses";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  generateLectureQaAction: vi.fn(),
}));

import { listCourseHubAction, generateLectureQaAction } from "@/app/actions";
import { courseBuildQaSteps } from "./steps.course-build-qa";
import { PARTIAL_FAILURE_OUTPUT_KEY } from "@/lib/workflows/run-logging";

const SPEND_CAP_429 =
  'LLM API error for "Week 2": HTTP 429 — {"error":{"code":429,"message":"Your project has exceeded its monthly spending cap.","status":"RESOURCE_EXHAUSTED"}}';

const step = courseBuildQaSteps.find((s) => s.type === "generate-weekly-qa")!;

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

/** Real generated materials for `week` - the exact shape gatherWeekMaterials
 * (steps.weekly-announcements.ts) scans for. */
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

function schedule(): ScheduleWeekPlan[] {
  return [
    { week: 1, topic: "Project Risk Management", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
    { week: 2, topic: "Earned Value", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
  ];
}

describe("generate-weekly-qa step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(generateLectureQaAction).mockResolvedValue({
      questions: [{ question: "Why does risk matter here?", answer: "Because the project fails otherwise." }],
    });
  });

  it("returns the incoming files unchanged when the schedule is empty", async () => {
    const incoming: GeneratedCourseFile[] = [materialsFile(1)];
    const result = await step.run({ schedule: [], files: incoming }, testHelpers(), () => {});
    expect(result.outputs.files).toBe(incoming);
    expect(result.outputs.count).toBe(0);
  });

  // AC1/AC2 (COURSE_BUILD's output selector): deselected means "do no work,
  // pass files through unchanged" - it never even calls generateLectureQaAction.
  it("selected explicitly off: does no work and passes incoming files through unchanged", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    const result = await step.run({ schedule: schedule(), files, selected: "" }, testHelpers(), () => {});
    expect(generateLectureQaAction).not.toHaveBeenCalled();
    expect(result.outputs.files).toBe(files);
    expect(result.outputs.count).toBe(0);
  });

  it("selected left unbound (undefined): generates normally, matching every preset that does not wire the output selector", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    const result = await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});
    expect(generateLectureQaAction).toHaveBeenCalledTimes(1);
    expect(result.outputs.count).toBe(1);
  });

  // The central honesty requirement: a week with no generated materials at
  // all this run is skipped, never given generic/invented questions.
  it("skips a week with no generated materials this run, rather than inventing generic questions", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(2)];
    const result = await step.run({ schedule: schedule(), files }, testHelpers(), () => {});

    expect(generateLectureQaAction).toHaveBeenCalledTimes(1); // only week 2 has materials
    expect(result.outputs.count).toBe(1);
    const report = result.outputs.report as string;
    expect(report).toContain("Week 1: skipped - no generated module materials found for this week");
  });

  it("passes this week's real materials text - not the bare topic - into the generator", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});
    const call = vi.mocked(generateLectureQaAction).mock.calls[0];
    expect(call[1]).toBe("Project Risk Management");
    expect(call[2]).toContain("Objectives text.");
  });

  it("produces a supplement file per week, sortOrder 6.6, filed under that week's own weekNumber", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    const result = await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});
    const outFiles = result.outputs.files as GeneratedCourseFile[];
    const doc = outFiles.find((f) => f.name.includes("Anticipated Q&A"));
    expect(doc).toBeDefined();
    expect(doc!.role).toBe("supplement");
    expect(doc!.weekNumber).toBe(1);
    expect(doc!.sortOrder).toBe(6.6);
    expect(doc!.pageText).toContain("Why does risk matter here?");
  });

  it("never includes example programs for an applied (no-code) course, even if the model returned some", async () => {
    vi.mocked(generateLectureQaAction).mockResolvedValue({
      questions: [{ question: "Q1?", answer: "A1." }],
      examples: [{ title: "T", language: "python", code: "print(1)", explanation: "E" }],
    });
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    const result = await step.run(
      { schedule: [schedule()[0]], files, courseKind: "applied" },
      testHelpers(),
      () => {}
    );
    const outFiles = result.outputs.files as GeneratedCourseFile[];
    const doc = outFiles.find((f) => f.name.includes("Anticipated Q&A"));
    expect(doc!.pageText).not.toContain("print(1)");
  });

  it("includes example programs for a coding course when the model returned some", async () => {
    vi.mocked(generateLectureQaAction).mockResolvedValue({
      questions: [{ question: "Q1?", answer: "A1." }],
      examples: [{ title: "T", language: "python", code: "print(1)", explanation: "E" }],
    });
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    const result = await step.run(
      { schedule: [schedule()[0]], files, courseKind: "coding" },
      testHelpers(),
      () => {}
    );
    const outFiles = result.outputs.files as GeneratedCourseFile[];
    const doc = outFiles.find((f) => f.name.includes("Anticipated Q&A"));
    expect(doc!.pageText).toContain("print(1)");
  });

  it("skips a week whose generation returns no questions, rather than shipping an empty document", async () => {
    vi.mocked(generateLectureQaAction).mockResolvedValueOnce({ questions: [] });
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    const result = await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});
    expect(result.outputs.count).toBe(0);
    const report = result.outputs.report as string;
    expect(report).toContain("Week 1: skipped - the model returned no questions.");
  });

  it("continues to the next week when one week's generation fails", async () => {
    vi.mocked(generateLectureQaAction)
      .mockResolvedValueOnce({ error: "model unavailable" })
      .mockResolvedValueOnce({ questions: [{ question: "Q2?", answer: "A2." }] });
    const files: GeneratedCourseFile[] = [materialsFile(1), materialsFile(2)];
    const result = await step.run({ schedule: schedule(), files }, testHelpers(), () => {});
    expect(result.outputs.count).toBe(1);
    const report = result.outputs.report as string;
    expect(report).toContain("Week 1: error");
  });

  describe("non-transient quota refusal (mirrors generate-weekly-significance's own)", () => {
    it("stops after the first non-transient quota refusal instead of attempting every remaining week", async () => {
      vi.mocked(generateLectureQaAction)
        .mockResolvedValueOnce({ questions: [{ question: "Q1?", answer: "A1." }] })
        .mockResolvedValueOnce({ error: SPEND_CAP_429 });

      const fullSchedule: ScheduleWeekPlan[] = Array.from({ length: 5 }, (_, i) => ({
        week: i + 1,
        topic: `Topic ${i + 1}`,
        summary: "",
        assignmentTitle: null,
        assignmentSlug: null,
        testName: null,
      }));
      const files: GeneratedCourseFile[] = fullSchedule.map((w) => materialsFile(w.week));

      const result = await step.run({ schedule: fullSchedule, files }, testHelpers(), () => {});

      expect(generateLectureQaAction).toHaveBeenCalledTimes(2);
      expect(result.outputs.count).toBe(1);
      const report = result.outputs.report as string;
      expect(report).toContain("Stopped after week 2 - the LLM quota was exhausted; 3 week(s) not attempted.");
    });

    it("sets the partial-failure signal when the quota is exhausted mid-run", async () => {
      vi.mocked(generateLectureQaAction)
        .mockResolvedValueOnce({ questions: [{ question: "Q1?", answer: "A1." }] })
        .mockResolvedValueOnce({ error: SPEND_CAP_429 });

      const files: GeneratedCourseFile[] = [materialsFile(1), materialsFile(2)];
      const result = await step.run({ schedule: schedule(), files }, testHelpers(), () => {});

      const detail = result.outputs[PARTIAL_FAILURE_OUTPUT_KEY];
      expect(typeof detail).toBe("string");
      expect(detail as string).toContain("quota was exhausted after week 2");
    });

    it("does not set the partial-failure signal when every week succeeds", async () => {
      const files: GeneratedCourseFile[] = [materialsFile(1), materialsFile(2)];
      const result = await step.run({ schedule: schedule(), files }, testHelpers(), () => {});
      expect(result.outputs[PARTIAL_FAILURE_OUTPUT_KEY]).toBeUndefined();
    });
  });
});
