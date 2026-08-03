// generate-weekly-current-events: exercises the step's own honesty
// requirement directly - a week's current-events report is only ever built
// when this week's own real generated materials (objectives/slides/
// instructions/opener) are present in the accumulated "files" chain, never
// invented generically for a week the module selector left ungenerated this
// run. Mirrors the shape of steps.weekly-significance.test.ts / steps.
// course-build-qa.test.ts.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScheduleWeekPlan } from "@/app/actions";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import { emptyCourseProject } from "@/lib/course-project";
import type { Course } from "@/lib/supabase/courses";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  researchCurrentEventsAction: vi.fn(),
}));

import { listCourseHubAction, researchCurrentEventsAction } from "@/app/actions";
import { courseBuildCurrentEventsSteps } from "./steps.course-build-current-events";
import { PARTIAL_FAILURE_OUTPUT_KEY } from "@/lib/workflows/run-logging";

const step = courseBuildCurrentEventsSteps.find((s) => s.type === "generate-weekly-current-events")!;

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

describe("generate-weekly-current-events step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listCourseHubAction).mockResolvedValue({ courses: [baseCourse()] });
    vi.mocked(researchCurrentEventsAction).mockResolvedValue({
      report: "CURRENT EVENTS REPORT\n...",
      reportMarkdown: "# Current Events Report\n\n...",
      sourceCount: 3,
      topicsCovered: 2,
    });
  });

  it("returns the incoming files unchanged when the schedule is empty", async () => {
    const incoming: GeneratedCourseFile[] = [materialsFile(1)];
    const result = await step.run({ schedule: [], files: incoming }, testHelpers(), () => {});
    expect(result.outputs.files).toBe(incoming);
    expect(result.outputs.count).toBe(0);
  });

  // AC1/AC2 (COURSE_BUILD's output selector): deselected means "do no work,
  // pass files through unchanged" - it never even calls researchCurrentEventsAction.
  it("selected explicitly off: does no work and passes incoming files through unchanged", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    const result = await step.run({ schedule: schedule(), files, selected: "" }, testHelpers(), () => {});
    expect(researchCurrentEventsAction).not.toHaveBeenCalled();
    expect(result.outputs.files).toBe(files);
    expect(result.outputs.count).toBe(0);
  });

  it("selected left unbound (undefined): generates normally, matching every preset that does not wire the output selector", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    const result = await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});
    expect(researchCurrentEventsAction).toHaveBeenCalledTimes(1);
    expect(result.outputs.count).toBe(1);
  });

  // The central honesty requirement: a week with no generated materials at
  // all this run is skipped, never given a generically-researched report.
  it("skips a week with no generated materials this run, rather than researching generically", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(2)];
    const result = await step.run({ schedule: schedule(), files }, testHelpers(), () => {});

    expect(researchCurrentEventsAction).toHaveBeenCalledTimes(1); // only week 2 has materials
    expect(result.outputs.count).toBe(1);
    const report = result.outputs.report as string;
    expect(report).toContain("Week 1: skipped - no generated module materials found for this week");
  });

  it("passes this week's real materials text as the research grounding, and defaults the recency window to the past 30 days", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});
    const call = vi.mocked(researchCurrentEventsAction).mock.calls[0];
    expect(call[0]).toContain("Objectives text.");
    expect(call[1]).toBe("the past 30 days");
  });

  it("passes a non-blank recentWindow through unchanged", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    await step.run({ schedule: [schedule()[0]], files, recentWindow: "the past 2 weeks" }, testHelpers(), () => {});
    const call = vi.mocked(researchCurrentEventsAction).mock.calls[0];
    expect(call[1]).toBe("the past 2 weeks");
  });

  it("produces a supplement file per week, sortOrder 6.7, filed under that week's own weekNumber", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    const result = await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});
    const outFiles = result.outputs.files as GeneratedCourseFile[];
    const doc = outFiles.find((f) => f.name.includes("Current Events"));
    expect(doc).toBeDefined();
    expect(doc!.role).toBe("supplement");
    expect(doc!.weekNumber).toBe(1);
    expect(doc!.sortOrder).toBe(6.7);
    expect(doc!.pageText).toContain("CURRENT EVENTS REPORT");
  });

  it("reports the source and topic counts the action returned", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    const result = await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});
    const report = result.outputs.report as string;
    expect(report).toContain("3 source(s) across 2 topic(s)");
  });

  it("continues to the next week when one week's research fails", async () => {
    vi.mocked(researchCurrentEventsAction)
      .mockResolvedValueOnce({ error: "search unavailable" })
      .mockResolvedValueOnce({
        report: "CURRENT EVENTS REPORT\n...",
        reportMarkdown: "# Current Events Report\n\n...",
        sourceCount: 1,
        topicsCovered: 1,
      });
    const files: GeneratedCourseFile[] = [materialsFile(1), materialsFile(2)];
    const result = await step.run({ schedule: schedule(), files }, testHelpers(), () => {});
    expect(result.outputs.count).toBe(1);
    const report = result.outputs.report as string;
    expect(report).toContain("Week 1: error");
  });

  it("sets the partial-failure signal when at least one week fails", async () => {
    vi.mocked(researchCurrentEventsAction).mockResolvedValueOnce({ error: "search unavailable" });
    const files: GeneratedCourseFile[] = [materialsFile(1)];
    const result = await step.run({ schedule: [schedule()[0]], files }, testHelpers(), () => {});
    const detail = result.outputs[PARTIAL_FAILURE_OUTPUT_KEY];
    expect(typeof detail).toBe("string");
    expect(detail as string).toContain("1 of 1 week(s) failed");
  });

  it("does not set the partial-failure signal when every week succeeds", async () => {
    const files: GeneratedCourseFile[] = [materialsFile(1), materialsFile(2)];
    const result = await step.run({ schedule: schedule(), files }, testHelpers(), () => {});
    expect(result.outputs[PARTIAL_FAILURE_OUTPUT_KEY]).toBeUndefined();
  });
});
