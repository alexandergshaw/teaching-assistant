import {
  readRepoGradeReservationsAction,
  recoverUnstartedRepoGradeReservationsAction,
} from "@/app/actions/repo-grade-recovery";
import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";

type Snapshot = Awaited<ReturnType<typeof readRepoGradeReservationsAction>>;
type Recovery = Awaited<ReturnType<typeof recoverUnstartedRepoGradeReservationsAction>>;

function record(
  operation: "inspect" | "release", startedAt: number, result: Snapshot | Recovery,
) {
  try {
    const success = result.status === "loaded" || result.status === "checked";
    const snapshot = result.status === "checked" ? result.snapshot : operation === "inspect" ? result : null;
    const rows = snapshot?.status === "loaded" ? snapshot.reservations.slice(0, 100) : null;
    recordSessionDiagnosticEntry({
      at: new Date().toISOString(),
      surface: "grading",
      operation: `repo_grade_reservation_${operation}`,
      label: operation === "inspect" ? "Inspect repository grading reservations" : "Release expired unstarted repository grading reservations",
      outcome: success ? "success" : "failure",
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      ...(!success && { cause: result.status }),
      detail: {
        outcome: result.status,
        snapshot: snapshot?.status ?? "not-read",
        ...(rows && {
          reservations: rows.length,
          expiredUnstarted: rows.filter((row) => row.state === "expired-unstarted").length,
          evidenceRequired: rows.filter((row) => row.state === "evidence-required" || row.state === "attempt-unavailable").length,
        }),
      },
    });
  } catch {
    // Browser diagnostics cannot change an observed recovery outcome.
  }
}

export async function inspectRepoGradeReservations(accountId: string) {
  const startedAt = performance.now();
  const result = await readRepoGradeReservationsAction(accountId)
    .catch(() => ({ status: "unavailable" } as const));
  record("inspect", startedAt, result);
  return result;
}

export async function releaseExpiredRepoGradeReservations(accountId: string) {
  const startedAt = performance.now();
  const result = await recoverUnstartedRepoGradeReservationsAction(accountId)
    .catch(() => ({ status: "outcome-unconfirmed" } as const));
  record("release", startedAt, result);
  return result;
}
