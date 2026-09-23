import { describe, it, expect, vi } from "vitest";

// Every named export steps.grading-cartridge.ts imports from "@/app/actions"
// must be present here (even the ones a given test never calls) or the
// import binds to undefined - see steps.grading-run.test.ts for the same
// pattern.
vi.mock("@/app/actions", () => ({
  listNewCartridgeDropsAction: vi.fn(),
  takeCartridgeDropAction: vi.fn(),
  finishCartridgeDropAction: vi.fn(),
  saveLibraryFileAction: vi.fn(),
  saveGradingDraftAction: vi.fn(),
  gradeAction: vi.fn(),
}));

import {
  listNewCartridgeDropsAction,
  takeCartridgeDropAction,
  finishCartridgeDropAction,
  saveGradingDraftAction,
  gradeAction,
} from "@/app/actions";
import { gradingCartridgeSteps } from "./steps.grading-cartridge";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { GradeResult } from "@/lib/grade";

const mockListNewCartridgeDropsAction = vi.mocked(listNewCartridgeDropsAction);
const mockTakeCartridgeDropAction = vi.mocked(takeCartridgeDropAction);
const mockFinishCartridgeDropAction = vi.mocked(finishCartridgeDropAction);
const mockSaveGradingDraftAction = vi.mocked(saveGradingDraftAction);
const mockGradeAction = vi.mocked(gradeAction);

const step = gradingCartridgeSteps.find((s) => s.type === "grade-cartridge-submissions")!;

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

describe("grade-cartridge-submissions: A35 - the per-drop line reports graded work, not results.length", () => {
  it("reports the GRADED count, not the array length, when the run's results include a never-attempted row", async () => {
    mockListNewCartridgeDropsAction.mockResolvedValue([
      {
        id: "drop-1",
        name: "cs101-hw3.zip",
        courseLabel: "CS 101",
        assignmentLabel: "Homework 3",
        pointsPossible: 10,
        rubricText: "Rubric text",
        lms: "canvas",
        storagePath: "path/to/drop",
        sizeBytes: 1024,
      },
    ]);
    mockTakeCartridgeDropAction.mockResolvedValue({
      id: "drop-1",
      courseLabel: "CS 101",
      assignmentLabel: "Homework 3",
      pointsPossible: 10,
      rubricText: "Rubric text",
      lms: "canvas",
      zipBase64: Buffer.from("zip-bytes").toString("base64"),
    });
    mockFinishCartridgeDropAction.mockResolvedValue({ ok: true });
    mockSaveGradingDraftAction.mockResolvedValue({ id: "draft-1" });

    // Bound reached after Alice - Bob's row carries a not-attempted outcome,
    // the post-N13a invariant: run.results includes it, but no grading work
    // happened for it.
    mockGradeAction.mockResolvedValue({
      run: {
        results: [makeGradedResult("Alice"), makeNotAttemptedResult("Bob", 1)],
        rubricAreaNames: ["Correctness"],
        fullCreditChecklist: [],
      },
      error: null,
    });

    const result = await step.run({ maxDrops: 3 }, testHelpers(), () => {});

    const report = typeof result.outputs?.report === "string" ? result.outputs.report : "";
    const summaryItems = report.split("\n");
    const dropLine = summaryItems.find((line) => line.startsWith("cs101-hw3.zip:"));

    expect(dropLine).toBeDefined();
    // The line must report the GRADED count (1: Alice), never
    // gradeResult.run.results.length (2: it also counts Bob's never-attempted
    // row). RED today: the digit captured here is "2".
    const digitBeforeStudents = dropLine?.match(/(\d+)\s+students?/)?.[1];
    expect(digitBeforeStudents).toBe("1");
  });
});
