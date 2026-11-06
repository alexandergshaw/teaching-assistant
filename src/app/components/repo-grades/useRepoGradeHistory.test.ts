import { expect, it, vi } from "vitest";
import { readRepoGradeHistoryAction } from "@/app/actions/repo-grades-dashboard";
import {
  buildSessionDiagnosticLog, formatSessionDiagnosticLogJson,
  readSessionDiagnosticLogState, resetSessionDiagnosticLogForTests,
} from "@/lib/session-diagnostic-log";
import { loadRepoGradeHistoryPage } from "./useRepoGradeHistory";
import { loadRepoGradeMatrixPages } from "./useRepoGradeMatrixResults";

vi.mock("@/app/actions/repo-grades-dashboard", () => ({ readRepoGradeHistoryAction: vi.fn() }));

it("exports bounded history metrics for success, unavailable storage, and rejected transport", async () => {
  const at = "2026-11-05T00:00:00.000Z";
  resetSessionDiagnosticLogForTests(at);
  vi.mocked(readRepoGradeHistoryAction)
    .mockResolvedValueOnce({
      status: "loaded", nextBefore: null,
      rows: [{
        generation: 42, repo: "private/repo", folder: "private-folder", sourceRef: "private-branch",
        commit: "a".repeat(40), profileFingerprint: "b".repeat(64), status: "succeeded",
        claimedAt: at, settledAt: at, score: 42, feedback: "private-feedback",
        rubric: null, feedback_retention: null, feedback_sections: null,
      }],
    })
    .mockResolvedValueOnce({ status: "storage-unavailable" })
    .mockRejectedValueOnce(new Error("private-transport-error"));
  const request = () => loadRepoGradeHistoryPage("private-course", "private-account");
  await expect(request()).resolves.toMatchObject({ status: "loaded" });
  await expect(request()).resolves.toEqual({ status: "storage-unavailable" });
  await expect(request()).resolves.toEqual({ status: "request-failed" });
  const state = readSessionDiagnosticLogState();
  expect(state.entries.filter((entry) => entry.operation === "repo_grade_history_read")).toMatchObject([
    { surface: "grading", operation: "repo_grade_history_read", outcome: "success", durationMs: expect.any(Number), detail: { rowCount: 1 } },
    { surface: "grading", operation: "repo_grade_history_read", outcome: "failure", durationMs: expect.any(Number), cause: "storage-unavailable" },
    { surface: "grading", operation: "repo_grade_history_read", outcome: "failure", durationMs: expect.any(Number), cause: "request-failed" },
  ]);
  expect(state.entries.filter((entry) => entry.operation === "repo_feedback_restore")).toMatchObject([
    { outcome: "failure", durationMs: expect.any(Number), detail: { storageSource: "durable", outcome: "partial", failureCategory: "retention_limit" } },
    { outcome: "failure", detail: { outcome: "failed", failureCategory: "service_rejected" } },
    { outcome: "failure", detail: { outcome: "failed", failureCategory: "transport_rejected" } },
  ]);
  const exported = formatSessionDiagnosticLogJson(buildSessionDiagnosticLog(
    state, { currentInstitution: "", currentCourse: "", currentPage: "", browser: "" }, at,
  ));
  expect(exported).toContain("repo_grade_history_read");
  expect(exported).toContain("transport_rejected");
  expect(exported).toContain("rowCount");
  expect(exported).not.toMatch(/private[-/]|"score"|"generation"/);
});

it("resumes from the bounded batch cursor without rereading newer pages", async () => {
  const readHistory = vi.mocked(readRepoGradeHistoryAction).mockReset()
    .mockImplementation(async (_course, _account, before) => ({
      status: "loaded", rows: [], nextBefore: before === 100 ? null : (before ?? 110) - 1,
    }));

  const first = await loadRepoGradeMatrixPages("course", "owner", undefined, () => true);
  expect(first).toMatchObject({ complete: false, nextBefore: 100 });
  expect(readHistory.mock.calls.map(([, , before]) => before))
    .toEqual([undefined, 109, 108, 107, 106, 105, 104, 103, 102, 101]);

  const older = await loadRepoGradeMatrixPages("course", "owner", first?.nextBefore ?? undefined, () => true);
  expect(older).toMatchObject({ complete: true, nextBefore: null });
  expect(readHistory).toHaveBeenLastCalledWith("course", "owner", 100);
  expect(readHistory).toHaveBeenCalledTimes(11);
});

it("retries a failed continuation at the same cursor and drops it if the course is unavailable", async () => {
  const readHistory = vi.mocked(readRepoGradeHistoryAction).mockReset()
    .mockResolvedValueOnce({ status: "storage-unavailable" })
    .mockResolvedValueOnce({ status: "course-unavailable" });

  await expect(loadRepoGradeMatrixPages("course", "owner", 100, () => true))
    .resolves.toMatchObject({ complete: false, nextBefore: 100, courseUnavailable: false });
  await expect(loadRepoGradeMatrixPages("course", "owner", 100, () => true))
    .resolves.toMatchObject({ complete: false, nextBefore: null, courseUnavailable: true });
  expect(readHistory.mock.calls).toEqual([["course", "owner", 100], ["course", "owner", 100]]);
});
