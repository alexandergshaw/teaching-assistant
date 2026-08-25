// R1.4 (docs/repo-grading-records-acceptance-criteria.md): an UNATTENDED
// repo-grading run leaves a Markdown report; an attended one does not.
//
// This guard exists because the report is invisible when it is wrong. Nobody
// is watching an unattended run by definition, so a report that silently stops
// being written looks exactly like a run that had nothing to say - which is
// the precise confusion R1.4 was written to remove. And the gate it hangs on
// (`helpers.unattended`) is a NEW field: before it, the de-facto tell was
// `saveRunReport`, which the attended builder also sets since D6, so anything
// inferring from that would now write reports on attended runs too.
//
// The two assertions are a pair on purpose: "writes it when unattended" alone
// would still pass if the flag were ignored and reports were written always.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  generateAssignmentRubricAction: vi.fn(),
  generateModelAnswerAction: vi.fn(),
  gradeRepoAction: vi.fn(),
  ingestRepoAction: vi.fn(),
  saveGradingDraftAction: vi.fn(),
  deleteGradingDraftAction: vi.fn(),
  findPendingGradingDraftForWorkflowAction: vi.fn(),
  generateFullCreditChecklistAction: vi.fn(),
  getInstitutionCountsAction: vi.fn(),
  getRepoTreeAction: vi.fn(),
  getFileTextAction: vi.fn(),
  listConfiguredInstitutionsAction: vi.fn(),
  listOrgReposAction: vi.fn(),
}));

import { saveGradingDraftAction, findPendingGradingDraftForWorkflowAction } from "@/app/actions";
import { saveRepoGradingDraft } from "./steps.grading-repos.helpers";
import { buildRepoGradingRunLog, buildRepoGradingLogEntry } from "@/lib/repo-grading-log";
import type { StepRunHelpers } from "@/lib/workflows/registry-helpers";
import type { GradingRunEntry } from "@/lib/grade";

const AT = "2026-08-25T09:00:00.000Z";

function runLog() {
  return buildRepoGradingRunLog([
    buildRepoGradingLogEntry({ repo: "org/student-a", outcome: "graded", reason: "", score: "18/20", at: AT }),
    buildRepoGradingLogEntry({ repo: "org/student-b", outcome: "skipped", reason: "no matching folder", score: "", at: AT }),
  ]);
}

/** A run that produced no gradeable results - the AC5 "writes nothing" path,
 * and precisely the run a draft cannot represent. */
function emptyEntry(): GradingRunEntry {
  return { run: { results: [] } } as unknown as GradingRunEntry;
}

function helpersWith(unattended: boolean, saveRunReport: ReturnType<typeof vi.fn>): StepRunHelpers {
  return {
    activeInstitution: null,
    provider: "gemini",
    author: "Tester",
    saveBundle: null,
    saveRunReport,
    saveCourseMaterialFile: null,
    saveCourseCastletopFile: null,
    saveCourseExportFile: null,
    loadCommonResources: null,
    getLibraryFile: null,
    getInstitutionFields: null,
    loadCourseExport: null,
    loadCourseMaterials: null,
    workflowId: "wf-1",
    workflowName: "Nightly repo grading",
    workflowRunId: "run-1",
    unattended,
  } as StepRunHelpers;
}

beforeEach(() => {
  vi.mocked(saveGradingDraftAction).mockReset();
  vi.mocked(findPendingGradingDraftForWorkflowAction).mockReset();
});

describe("R1.4 - the unattended repo-grading report", () => {
  it("an UNATTENDED run writes the report even when it graded nothing at all", async () => {
    const saveRunReport = vi.fn().mockResolvedValue(undefined);
    // Deliberately the empty-run path: no draft is created, so the report is
    // the ONLY trace this run leaves. If it were written after the early
    // return, this run would vanish entirely.
    const result = await saveRepoGradingDraft({
      entry: emptyEntry(),
      summary: "nothing graded",
      helpers: helpersWith(true, saveRunReport),
      repoGradingLog: runLog(),
    });

    expect(result.draftId).toBe("");
    expect(saveGradingDraftAction).not.toHaveBeenCalled();
    expect(saveRunReport).toHaveBeenCalledTimes(1);

    const [fileName, markdown] = saveRunReport.mock.calls[0];
    expect(fileName).toMatch(/\.md$/);
    // The skipped repo and its real reason must reach the report - a report
    // listing only what succeeded would repeat the gap this chunk closes.
    expect(markdown).toContain("org/student-b");
    expect(markdown).toContain("no matching folder");
  });

  it("an ATTENDED run writes NO report, even though it can save one", async () => {
    // saveRunReport is present and callable - since D6 the attended builder
    // sets it too - so this proves the gate is `unattended`, not "can I write".
    const saveRunReport = vi.fn().mockResolvedValue(undefined);
    await saveRepoGradingDraft({
      entry: emptyEntry(),
      summary: "nothing graded",
      helpers: helpersWith(false, saveRunReport),
      repoGradingLog: runLog(),
    });

    expect(saveRunReport).not.toHaveBeenCalled();
  });

  it("a report write that throws never costs the run its draft path", async () => {
    const saveRunReport = vi.fn().mockRejectedValue(new Error("storage is down"));
    await expect(
      saveRepoGradingDraft({
        entry: emptyEntry(),
        summary: "nothing graded",
        helpers: helpersWith(true, saveRunReport),
        repoGradingLog: runLog(),
      })
    ).resolves.toEqual({ draftId: "" });
    expect(saveRunReport).toHaveBeenCalledTimes(1);
  });
});
