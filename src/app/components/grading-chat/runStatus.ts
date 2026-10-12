// Presentation-only description of what the chat grader is doing right now.
// Pure leaf so the wording is testable (no component is rendered under vitest).
// The run is continuous with NO known total, so this reports honest live counts
// only: finished so far, being graded now, waiting - never an invented "N of M".
import { describeBulkProgress } from "./ingestLedger";
import type { HeaderState } from "./useContinuousGradingRun";

export const RUN_STATUS_MAX_NAMES = 3;

export interface RunStatusInput {
  readonly preparing: boolean;
  readonly zipPhase: "uploading" | "preparing" | null;
  readonly headerState: HeaderState;
  /** Free-text step the panel is in while preparing (e.g. fetching Canvas details). */
  readonly intakeNote: string | null;
  /** True while a recording is being classified (one submission or several). Takes precedence over pending rows. */
  readonly classifyingRecording: boolean;
  /** Rows queued or in flight (first grades, retries and regrades). */
  readonly pendingCount: number;
  /** Student labels being graded right now, in dispatch order. */
  readonly inFlightStudents: readonly string[];
  /** Concurrency slots in use (inFlight count). */
  readonly inFlightCount: number;
  /** Arrived results (graded or failed) so far. */
  readonly completedCount: number;
}

export interface RunStatus {
  readonly title: string;
  readonly detail: string;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function describeNamesNow(names: readonly string[], count: number): string {
  if (names.length === 0) return `Grading ${plural(count, "submission")} now`;
  const shown = names.slice(0, RUN_STATUS_MAX_NAMES).join(", ");
  const more = names.length - RUN_STATUS_MAX_NAMES;
  return more > 0 ? `Grading now: ${shown} and ${more} more` : `Grading now: ${shown}`;
}

/** Null when nothing is happening (the indicator is not shown). */
export function describeRunStatus(input: RunStatusInput): RunStatus | null {
  const { preparing, zipPhase, headerState, intakeNote, classifyingRecording, pendingCount, inFlightStudents, inFlightCount, completedCount } = input;
  if (zipPhase !== null) {
    return {
      title: describeBulkProgress({ phase: zipPhase, dispatchedCount: 0, completedCount: 0 }),
      detail: pendingCount > 0 ? `${plural(completedCount, "submission")} finished so far` : "",
    };
  }
  if (classifyingRecording) {
    return {
      title: "Analyzing the recording...",
      detail:
        pendingCount > 0
          ? `${completedCount} finished so far, ${pendingCount} still grading`
          : "Checking whether it holds one submission or several",
    };
  }
  if (pendingCount <= 0) {
    if (!preparing && headerState !== "resolving") return null;
    if (intakeNote !== null) return { title: intakeNote, detail: "" };
    if (headerState === "resolving") {
      return { title: "Setting up the session...", detail: "Reading your instructions and rubric" };
    }
    return { title: "Reading your submission...", detail: "Extracting files and identifying the student" };
  }
  const active = Math.max(inFlightCount, inFlightStudents.length);
  const waiting = Math.max(pendingCount - active, 0);
  const parts = [`${completedCount} finished so far`];
  if (waiting > 0) parts.push(`${waiting} waiting`);
  if (preparing) parts.push("reading more submissions");
  return {
    title: active > 0 ? describeNamesNow(inFlightStudents, active) : "Waiting for a grading slot...",
    detail: parts.join(", "),
  };
}
