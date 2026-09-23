import { describe, it, expect, vi } from "vitest";

// Every named export steps.grading-draft-flow.ts imports from "@/app/actions"
// must be present here (even the ones a given test never calls) or the
// import binds to undefined - see steps.grading-run.test.ts for the same
// pattern.
vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  generateAssignmentRubricAction: vi.fn(),
  gradeAction: vi.fn(),
  pullSubmissionAction: vi.fn(),
  listGradingQueueAction: vi.fn(),
  saveGradingDraftAction: vi.fn(),
  listPendingGradingDraftsAction: vi.fn(),
  getGradingDraftAction: vi.fn(),
  markGradingDraftReviewedAction: vi.fn(),
  postCanvasGradesAction: vi.fn(),
}));

import {
  listCourseHubAction,
  listGradingQueueAction,
  gradeAction,
  saveGradingDraftAction,
} from "@/app/actions";
import { gradingDraftFlowSteps } from "./steps.grading-draft-flow";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { GradeResult } from "@/lib/grade";
import type { CanvasQueueItem } from "@/lib/canvas";

const mockListCourseHubAction = vi.mocked(listCourseHubAction);
const mockListGradingQueueAction = vi.mocked(listGradingQueueAction);
const mockGradeAction = vi.mocked(gradeAction);
const mockSaveGradingDraftAction = vi.mocked(saveGradingDraftAction);

const step = gradingDraftFlowSteps.find((s) => s.type === "grade-to-draft")!;

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

function makeQueueItem(overrides: Partial<CanvasQueueItem> = {}): CanvasQueueItem {
  return {
    institution: "MCC",
    courseId: "1",
    courseName: "CS 101",
    kind: "assignment",
    id: "10",
    assignmentId: "10",
    title: "Homework 1",
    needsGradingCount: 2,
    dueAt: null,
    pointsPossible: 10,
    htmlUrl: "https://canvas.example.com/courses/1/assignments/10",
    canvasUrl: "https://canvas.example.com/courses/1",
    speedGraderUrl: "https://canvas.example.com/courses/1/gradebook/speed_grader?assignment_id=10",
    description: "Do the homework.",
    rubricText: "Rubric text",
    ...overrides,
  };
}

describe("grade-to-draft: A35 - the per-row summary line reports graded work, not results.length", () => {
  it("reports the GRADED count, not the array length, when the run carries a never-attempted row", async () => {
    mockListCourseHubAction.mockResolvedValue({ courses: [] });
    mockListGradingQueueAction.mockResolvedValue({ rows: [makeQueueItem()], errors: [] });
    mockGradeAction.mockResolvedValue({
      run: {
        results: [makeGradedResult("Alice"), makeNotAttemptedResult("Bob", 1)],
        rubricAreaNames: ["Correctness"],
        fullCreditChecklist: [],
      },
      error: null,
    });
    mockSaveGradingDraftAction.mockResolvedValue({ id: "draft-1" });

    const result = await step.run(
      { courses: "", institution: "MCC" },
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
});
