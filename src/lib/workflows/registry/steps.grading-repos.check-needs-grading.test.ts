import { describe, it, expect, vi } from "vitest";

// Every named export steps.grading-repos.ts imports from "@/app/actions" must
// be present here (even the ones a given test never calls) or the import
// binds to undefined - see the same pattern in steps.grading-repos.grade-repo.test.ts.
vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  generateAssignmentRubricAction: vi.fn(),
  generateModelAnswerAction: vi.fn(),
  gradeRepoAction: vi.fn(),
  ingestRepoAction: vi.fn(),
  saveGradingDraftAction: vi.fn(),
  deleteGradingDraftAction: vi.fn(),
  generateFullCreditChecklistAction: vi.fn(),
  getInstitutionCountsAction: vi.fn(),
  getRepoTreeAction: vi.fn(),
  getFileTextAction: vi.fn(),
  listConfiguredInstitutionsAction: vi.fn(),
}));

import { getInstitutionCountsAction, listConfiguredInstitutionsAction } from "@/app/actions";
import { gradingRepoSteps } from "./steps.grading-repos";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";

const mockGetInstitutionCountsAction = vi.mocked(getInstitutionCountsAction);
const mockListConfiguredInstitutionsAction = vi.mocked(listConfiguredInstitutionsAction);

const step = gradingRepoSteps.find((s) => s.type === "check-needs-grading")!;

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

describe("check-needs-grading institution resolution", () => {
  it("resolves via the single configured institution with no bound value and no header institution (AC3 unattended - schedule institution null)", async () => {
    mockListConfiguredInstitutionsAction.mockResolvedValue({ acronyms: ["MCC"] });
    mockGetInstitutionCountsAction.mockResolvedValue({
      counts: [{ acronym: "MCC", needsGrading: 3, unread: 1 }],
    });

    const result = await step.run({ institution: "" }, testHelpers({ activeInstitution: null }), () => {});

    expect(mockGetInstitutionCountsAction).toHaveBeenCalledWith(["MCC"]);
    expect(result.outputs.needsGrading).toBe(3);
  });

  it("prefers the header's active institution over the single-configured fallback", async () => {
    mockListConfiguredInstitutionsAction.mockResolvedValue({ acronyms: ["OTHER"] });
    mockGetInstitutionCountsAction.mockResolvedValue({ counts: [] });

    await step.run({ institution: "" }, testHelpers({ activeInstitution: "MCC" }), () => {});

    expect(mockGetInstitutionCountsAction).toHaveBeenCalledWith(["MCC"]);
  });

  it("prefers an explicit bound value over the header's active institution", async () => {
    mockListConfiguredInstitutionsAction.mockResolvedValue({ acronyms: [] });
    mockGetInstitutionCountsAction.mockResolvedValue({ counts: [] });

    await step.run({ institution: "BOUND" }, testHelpers({ activeInstitution: "MCC" }), () => {});

    expect(mockGetInstitutionCountsAction).toHaveBeenCalledWith(["BOUND"]);
  });

  it("does not fall back when two or more institutions are configured, and names the ladder in the failure", async () => {
    mockListConfiguredInstitutionsAction.mockResolvedValue({ acronyms: ["MCC", "MPCC"] });

    await expect(
      step.run({ institution: "" }, testHelpers({ activeInstitution: null }), () => {})
    ).rejects.toThrow(/bind an institution|course tile|header|configure/i);
  });
});
