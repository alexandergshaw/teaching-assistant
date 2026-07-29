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
} from "@/app/actions";
import { gradingRunSteps } from "./steps.grading-run";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";

const mockListCourseHubAction = vi.mocked(listCourseHubAction);
const mockListGradingQueueAction = vi.mocked(listGradingQueueAction);
const mockListConfiguredInstitutionsAction = vi.mocked(listConfiguredInstitutionsAction);

const step = gradingRunSteps.find((s) => s.type === "grading-preflight")!;

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
