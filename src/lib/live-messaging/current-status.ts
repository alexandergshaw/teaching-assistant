/**
 * CURRENT STATUS band (LIVE-LMS-STUDENT-MESSAGING W3, FORK D).
 *
 * ORCHESTRATOR DEFAULT, PENDING THE OWNER DEFINITION. Canvas has no single
 * "current status" field (docs/live-lms-student-messaging-scope.md section 5,
 * FORK D, RES-LMS-2). Until the owner defines the column, it is a simple band
 * over the student's Canvas current_score. This is the ONLY place that
 * decides the band, so a later owner redefinition is a one-function change
 * (currentStatusFor) plus its test; the table only renders what it returns.
 */

export type CurrentStatus = "on-track" | "at-risk" | "failing" | "unknown";

/** Below this percentage the band is "failing". */
export const FAILING_BELOW = 60;
/** From FAILING_BELOW up to (excluding) this percentage the band is "at-risk". */
export const AT_RISK_BELOW = 75;

export const CURRENT_STATUS_LABELS: Record<CurrentStatus, string> = {
  "on-track": "On track",
  "at-risk": "At risk",
  failing: "Failing",
  unknown: "No grade",
};

/** The band for a Canvas current_score (a percentage). null/NaN -> "unknown". */
export function currentStatusFor(grade: number | null): CurrentStatus {
  if (grade === null || !Number.isFinite(grade)) return "unknown";
  if (grade < FAILING_BELOW) return "failing";
  if (grade < AT_RISK_BELOW) return "at-risk";
  return "on-track";
}
