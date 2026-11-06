import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readRepoGradeReservationsAction, recoverUnstartedRepoGradeReservationsAction } from "@/app/actions/repo-grade-recovery";
import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
import { inspectRepoGradeReservations, releaseExpiredRepoGradeReservations } from "./reservation-recovery-client";

vi.mock("@/app/actions/repo-grade-recovery", () => ({
  readRepoGradeReservationsAction: vi.fn(),
  recoverUnstartedRepoGradeReservationsAction: vi.fn(),
}));
vi.mock("@/lib/session-diagnostic-log", () => ({ recordSessionDiagnosticEntry: vi.fn() }));

beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.restoreAllMocks());

it("records a bounded inspection outcome without reservation or account identifiers", async () => {
  vi.spyOn(performance, "now").mockReturnValueOnce(5).mockReturnValueOnce(35);
  const reservations = Array.from({ length: 101 }, (_, index) => ({
    generation: 200_001 + index,
    repo: "private-repository",
    folder: "private-folder",
    state: index === 0 ? "expired-unstarted" as const
      : index === 1 ? "evidence-required" as const : "active" as const,
  }));
  vi.mocked(readRepoGradeReservationsAction).mockResolvedValue({ status: "loaded", reservations });
  await expect(inspectRepoGradeReservations("private-account")).resolves.toEqual({ status: "loaded", reservations });
  expect(recordSessionDiagnosticEntry).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    surface: "grading",
    operation: "repo_grade_reservation_inspect",
    outcome: "success",
    durationMs: 30,
    detail: { outcome: "loaded", snapshot: "loaded", reservations: 100, expiredUnstarted: 1, evidenceRequired: 1 },
  }));
  expect(JSON.stringify(vi.mocked(recordSessionDiagnosticEntry).mock.calls)).not.toMatch(/private-|200001/);
});

it("distinguishes an acknowledged recovery with a failed refresh from an unconfirmed write", async () => {
  vi.mocked(recoverUnstartedRepoGradeReservationsAction)
    .mockResolvedValueOnce({ status: "checked", snapshot: { status: "unavailable" } })
    .mockRejectedValueOnce(new Error("private-upstream-text"));

  await expect(releaseExpiredRepoGradeReservations("private-account"))
    .resolves.toEqual({ status: "checked", snapshot: { status: "unavailable" } });
  await expect(releaseExpiredRepoGradeReservations("private-account")).resolves.toEqual({ status: "outcome-unconfirmed" });
  expect(recordSessionDiagnosticEntry).toHaveBeenNthCalledWith(1, expect.objectContaining({
    operation: "repo_grade_reservation_release", outcome: "success",
    detail: { outcome: "checked", snapshot: "unavailable" },
  }));
  expect(recordSessionDiagnosticEntry).toHaveBeenNthCalledWith(2, expect.objectContaining({
    operation: "repo_grade_reservation_release", outcome: "failure", cause: "outcome-unconfirmed",
    detail: { outcome: "outcome-unconfirmed", snapshot: "not-read" },
  }));
  expect(JSON.stringify(vi.mocked(recordSessionDiagnosticEntry).mock.calls)).not.toContain("private-");
});
