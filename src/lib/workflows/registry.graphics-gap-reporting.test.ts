// A required-graphic gap that survives the repair pass must be REPORTED to the
// user, on EVERY step that ships an applied deck - not just on one of them.
//
// Background (root-cause investigation, 2026-08-02): a report that ~84% of
// "Artifact:" slides across three generated 16-week courses had shipped with no
// graphic turned out to be a measurement artifact - the audit counted <p:sp>
// shapes per slide, and a "table" graphic is rendered by pptxgenjs via
// addTable, which emits a <p:graphicFrame>/<a:tbl> and contributes ZERO <p:sp>.
// "Artifact:" is exactly the slide type APPLIED_STRUCTURE_REQUIREMENTS steers to
// a table ("a 'table' for a register, charter, or log"), so that whole slide
// type looked empty. Unpacking the same decks and counting <a:tbl> too shows
// 159/159 Artifact slides and 32/32 Agenda slides DID carry a graphic; exactly
// ONE slide in 350 (a Judgment Call slide) genuinely had none.
//
// What the investigation DID find is below: the surviving-gap report exists on
// the lecture-materials-from-schedule step and nowhere else, so the same gap on
// the repoless lecture-zip branch - which threads courseKind and therefore
// generates applied decks with Artifact/Judgment Call/Agenda slides - reaches
// the instructor with nothing said about it. That asymmetry is what makes a
// real gap silent, and it is what these tests pin.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  getRepoZipAction: vi.fn(),
  generateLecturePlansAction: vi.fn(),
  generateLectureMaterialsFromScheduleAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  listCourseHubAction: vi.fn(),
  generateLectureFromMaterialsAction: vi.fn(),
  regenerateAnnouncementAction: vi.fn(),
  generateClassOpenerAction: vi.fn(),
  findCaseStudyMaterialAction: vi.fn(),
  findPracticeProblemsAction: vi.fn(),
  saveLibraryFileAction: vi.fn(),
  getDeckTemplateAction: vi.fn(),
  listAssignmentDueDatesByUrlAction: vi.fn(),
  generateCourseProjectAction: vi.fn(),
  setCourseProjectAction: vi.fn(),
  selectCourseTools: vi.fn(),
}));

// assembleLectureFiles drives real pptx/docx/zip generation (via jszip),
// which needs browser Blob-reading support vitest's node environment lacks -
// mocked for the same reason registry.lecture-zip.test.ts mocks it.
//
// The graphics-gap report itself now lives INSIDE assembleLectureFiles (the
// AC1 choke-point fix - it used to be computed by the lecture-materials-from-
// schedule step alone, which is the exact asymmetry these tests exist to
// pin), so mocking assembleLectureFiles wholesale would hide the behavior
// under test. mockAssembled below avoids that by calling
// graphicsGapReportLines - the real, separately-exported pure function
// assembleLectureFiles itself calls - from inside the mock, using the SAME
// plans/courseKind arguments the step passed in. That exercises the actual
// gap-computation logic on every call; only the pptx/docx/zip machinery
// around it stays stubbed.
vi.mock("@/lib/workflows/registry-helpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workflows/registry-helpers")>();
  return { ...actual, assembleLectureFiles: vi.fn() };
});

import { listCourseHubAction, generateLectureMaterialsFromScheduleAction } from "@/app/actions";
import { getStepDefinition } from "./registry";
import { assembleLectureFiles, graphicsGapReportLines, type StepRunHelpers } from "./registry-helpers";
import { emptyCourseProject } from "@/lib/course-project";
import type { Course } from "@/lib/supabase/courses";
import type { AssignmentPlan } from "@/app/actions-types";
import type { CourseKind } from "@/lib/course-kind";

const fromSchedule = getStepDefinition("lecture-materials-from-schedule")!;
const lectureZip = getStepDefinition("lecture-zip")!;

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

function baseCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1",
    name: "PM 101",
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
    weeks: null,
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

// A week whose deck shipped a required-graphic slide with no graphic - exactly
// what enforceGraphicsForApplied reports and what the repair pass failed to
// fill. One real instance of this shipped in the m10 course (Week 11,
// "Judgment Call: Prioritizing cost recovery vs. schedule recovery").
function planWithSurvivingGap(): AssignmentPlan {
  return {
    assignmentName: "week-01",
    slides: [
      { title: "Principle: A charter is what makes authority real", bullets: ["a"] },
      { title: "Artifact: The Project Charter", bullets: ["Scope section", "Sign-off section"] },
    ],
    presentationTitle: "Week 1",
    label: "Week 1",
    moduleIntroduction: "Intro text",
    assignmentInstructions: "Instructions text",
    moduleObjectives: "Objectives text",
    weekNumber: 1,
    introTemplateHeadings: [],
    instructionsTemplateHeadings: [],
  };
}

function mockAssembled(): void {
  vi.mocked(assembleLectureFiles).mockImplementation(async (plans, _values, _helpers, _onProgress, _baseName, courseKind: CourseKind = "coding") => ({
    files: [],
    summary: { kind: "list", label: "Generated 0 files (zip downloaded)", items: graphicsGapReportLines(plans, courseKind) },
  }));
}

/** Every user-visible line the step reported for this run. */
function reportedLines(summary: { kind: string; items?: string[] }): string[] {
  return summary.kind === "list" ? (summary.items ?? []) : [];
}

const SCHEDULE = [
  { week: 1, topic: "Project Charters", summary: "", assignmentTitle: null, assignmentSlug: null, testName: null },
];

describe("a required-graphic gap that survives the repair pass is reported, on every applied deck path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssembled();
    vi.mocked(generateLectureMaterialsFromScheduleAction).mockResolvedValue([planWithSurvivingGap()]);
  });

  // The path that already reports. Kept as the reference contract so the
  // asymmetry the next test pins is unambiguous: same course kind, same deck,
  // same gap - only the step differs.
  it("lecture-materials-from-schedule names the surviving gap in its run summary", async () => {
    const result = await fromSchedule.run(
      { schedule: SCHEDULE, minutes: 50, courseKind: "applied" },
      testHelpers(),
      () => {}
    );

    expect(
      reportedLines(result.summary).some((line) => line.includes("missing a required graphic")),
      "the instructor is told a slide shipped without its required graphic"
    ).toBe(true);
  });

  // The defect. runLectureZipRepoless (steps.content-lectures.ts) threads
  // courseKind straight into generateLectureMaterialsFromScheduleAction, so an
  // applied course with no linked repository generates Artifact/Judgment Call/
  // Agenda slides here exactly as the sibling step does - but this branch never
  // calls enforceGraphicsForApplied over the finished plans, so a gap that
  // survived the repair pass ships with nothing said about it anywhere the
  // instructor can see. The only trace is a server-side console.error inside
  // generateSlidesFromTopic, and the graphicViolations/graphicsMissing counts
  // both actions return are read by no caller at all.
  it("lecture-zip without a linked repository names the same surviving gap", async () => {
    vi.mocked(listCourseHubAction).mockResolvedValue({
      courses: [
        baseCourse({
          id: "course-1",
          csvData: "week,topic,summary,assignment,test\n1,Project Charters,,,",
          topics: "Topic notes",
        }),
      ],
    });

    const result = await lectureZip.run(
      { repo: "", minutes: 50, hubCourse: "course-1", courseKind: "applied" },
      testHelpers(),
      () => {}
    );

    expect(
      reportedLines(result.summary).some((line) => line.includes("missing a required graphic")),
      "the repoless branch ships an applied deck too - a surviving gap must not be silent here either"
    ).toBe(true);
  });
});
