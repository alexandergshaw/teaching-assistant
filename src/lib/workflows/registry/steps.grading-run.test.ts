import { describe, it, expect, vi } from "vitest";

// Every named export steps.grading-run.ts imports from "@/app/actions" must
// be present here (even the ones a given test never calls) or the import
// binds to undefined - see the same pattern in steps.grading-repos.grade-repo.test.ts.
vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  generateAssignmentRubricAction: vi.fn(),
  gradeAction: vi.fn(),
  pullSubmissionAction: vi.fn(),
  listGradingQueueAction: vi.fn(),
  listConfiguredInstitutionsAction: vi.fn(),
}));

import {
  listCourseHubAction,
  listGradingQueueAction,
  listConfiguredInstitutionsAction,
  gradeAction,
} from "@/app/actions";
import { gradingRunSteps } from "./steps.grading-run";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { GradeResult } from "@/lib/grade";

const mockListCourseHubAction = vi.mocked(listCourseHubAction);
const mockListGradingQueueAction = vi.mocked(listGradingQueueAction);
const mockListConfiguredInstitutionsAction = vi.mocked(listConfiguredInstitutionsAction);
const mockGradeAction = vi.mocked(gradeAction);

const step = gradingRunSteps.find((s) => s.type === "grading-preflight")!;
const gradeSubmissionsStep = gradingRunSteps.find((s) => s.type === "grade-submissions")!;

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
    workflowId: "workflow-1",
    workflowName: "Test Workflow",
    workflowRunId: "run-1",
    ...overrides,
  };
}

describe("grading-preflight institution-wide mode resolution", () => {
  it("resolves via the single configured institution when no tiles are selected, nothing is bound, and no header institution is active (AC3 unattended)", async () => {
    mockListCourseHubAction.mockResolvedValue({ courses: [] });
    mockListConfiguredInstitutionsAction.mockResolvedValue({ acronyms: ["MCC"] });
    mockListGradingQueueAction.mockResolvedValue({ rows: [], errors: [] });

    await step.run({ courses: "", institution: "" }, testHelpers({ activeInstitution: null }), () => {});

    expect(mockListGradingQueueAction).toHaveBeenCalledWith(["MCC"]);
  });

  it("prefers the header's active institution over the single-configured fallback", async () => {
    mockListCourseHubAction.mockResolvedValue({ courses: [] });
    mockListConfiguredInstitutionsAction.mockResolvedValue({ acronyms: ["OTHER"] });
    mockListGradingQueueAction.mockResolvedValue({ rows: [], errors: [] });

    await step.run({ courses: "", institution: "" }, testHelpers({ activeInstitution: "MCC" }), () => {});

    expect(mockListGradingQueueAction).toHaveBeenCalledWith(["MCC"]);
  });

  it("throws a ladder-aware message (still mentions tiles as an alternative) when nothing resolves", async () => {
    mockListCourseHubAction.mockResolvedValue({ courses: [] });
    mockListConfiguredInstitutionsAction.mockResolvedValue({ acronyms: ["MCC", "MPCC"] });

    await expect(
      step.run({ courses: "", institution: "" }, testHelpers({ activeInstitution: null }), () => {})
    ).rejects.toThrow(/course tiles|header|configure/i);
  });
});

function makeGradedResult(student: string): GradeResult {
  return {
    student,
    overallComment: "Good work",
    strengths: "Good work",
    improvements: "",
    resubmitNotice: "",
    rubricAreas: [{ area: "Correctness", score: "9/10", comment: "Nice" }],
    totalScore: "9/10",
    feedback: "",
    mergedFileCount: 1,
    submittedFiles: [],
  };
}

function makeNotAttemptedResult(student: string, sourceIndex: number): GradeResult {
  const message = "Not graded: this run reached its submission limit before this submission.";
  return {
    student,
    overallComment: message,
    strengths: message,
    improvements: "",
    resubmitNotice: "",
    rubricAreas: [],
    totalScore: "",
    feedback: message,
    mergedFileCount: 0,
    submittedFiles: [],
    ungraded: {
      kind: "not-attempted",
      stoppedBy: "submission-count-bound",
      sourceIndex,
      student,
      message,
    },
  };
}

describe("grade-submissions: A35 - the per-row summary line reports graded work, not results.length", () => {
  it("Canvas path: reports the GRADED count, not the array length, when the run carries a never-attempted row", async () => {
    mockListCourseHubAction.mockResolvedValue({ courses: [] });
    mockGradeAction.mockResolvedValue({
      run: {
        results: [makeGradedResult("Alice"), makeNotAttemptedResult("Bob", 1)],
        rubricAreaNames: ["Correctness"],
        fullCreditChecklist: [],
      },
      error: null,
    });

    const plan = [
      {
        courseId: "c1",
        courseName: "CS 101",
        canvasUrl: "https://canvas.example.com/courses/1",
        assignmentName: "Homework 1",
        rubricText: "Rubric text",
        pointsPossible: 10,
      },
    ];

    const result = await gradeSubmissionsStep.run(
      { plan, courses: "c1" },
      testHelpers(),
      () => {}
    );

    const items = result.summary?.kind === "list" ? result.summary.items : [];
    const line = items.find((l) => l.startsWith("CS 101 - Homework 1:"));

    expect(line).toBeDefined();
    // RED today: this line reads "graded 2 submission(s)" - run.results.length,
    // which includes Bob's never-attempted row. It must report 1, the graded count.
    const digit = line?.match(/graded (\d+) submission/)?.[1];
    expect(digit).toBe("1");
  });

  it("offline zip path: reports the GRADED count, not the array length, when the run carries a never-attempted row", async () => {
    mockListCourseHubAction.mockResolvedValue({ courses: [] });
    mockGradeAction.mockResolvedValue({
      run: {
        results: [makeGradedResult("Alice"), makeNotAttemptedResult("Bob", 1)],
        rubricAreaNames: ["Correctness"],
        fullCreditChecklist: [],
      },
      error: null,
    });

    const plan = [
      {
        courseId: "c1",
        courseName: "CS 101",
        offline: true,
      },
    ];

    const zipFile = new File([Buffer.from("zip-bytes")], "submissions.zip", {
      type: "application/zip",
    });

    const result = await gradeSubmissionsStep.run(
      { plan, submissionsZip: [zipFile], courses: "c1" },
      testHelpers(),
      () => {}
    );

    const items = result.summary?.kind === "list" ? result.summary.items : [];
    const line = items.find((l) => l.startsWith("CS 101: graded"));

    expect(line).toBeDefined();
    // RED today: this line reads "graded 2 submission(s)" - run.results.length.
    // It must report 1, the graded count.
    const digit = line?.match(/graded (\d+) submission/)?.[1];
    expect(digit).toBe("1");
  });
});
