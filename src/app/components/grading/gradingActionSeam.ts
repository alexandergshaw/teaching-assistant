// Session Diagnostic Log timing for the awaited grading ACTION seams that are
// not the whole-run grade or the chat seams: repo grading, rubric generation
// from a repo, checklist derivation, posting grades to Canvas and posting a
// drafted grade. GRADING-DIAGNOSTICS-COVERAGE wave 3.
//
// BROWSER-ONLY, like the wrapper it records through (gradingDiagnosticLog.ts).
// Nothing under src/app/api, src/app/actions or any "use server" file may
// import this module.
//
// NO STUDENT DATA. A raw action error or a post-skip reason can name a student
// or embed a repo path, and the diagnostic core scrubs secrets only. So the
// recorded `error` is ALWAYS one of the fixed class strings below, derived
// from the SHAPE of the result (never its text); the raw text is never passed
// on.
import { recordGradingDiagnosticEntry } from "./gradingDiagnosticLog";
import type { BranchMergeStatus } from "@/lib/repo-grade-merge-check";

export type GradingActionOperation =
  | "generate_rubric"
  | "grade_repo"
  | "grade_repos"
  | "derive_checklist"
  | "post_grades"
  | "post_draft";

export const GRADING_ACTION_FAILURE_CLASSES = ["action failed", "partially posted", "request threw"] as const;

export type GradingActionFailureClass = (typeof GRADING_ACTION_FAILURE_CLASSES)[number];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function nonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

/** PURE. Map an action's RESOLVED result to a fixed failure class, or null for
 * success. Reads only the result's shape; no text from it is ever returned.
 *  - `{ error }` -> "action failed"
 *  - a post result that sent some rows but failed or skipped others (Canvas
 *    `failures` / `skipped` arrays, or a draft's `failed` / `skipped` counts)
 *    -> "partially posted" */
export function classifyGradingActionResult(result: unknown): GradingActionFailureClass | null {
  const rec = asRecord(result);
  if (!rec) return null;
  if ("error" in rec && rec.error) return "action failed";
  if (nonEmptyArray(rec.failures) || nonEmptyArray(rec.skipped)) return "partially posted";
  if ((typeof rec.failed === "number" && rec.failed > 0) || (typeof rec.skipped === "number" && rec.skipped > 0)) {
    return "partially posted";
  }
  return null;
}

const MERGE_STATUSES: readonly BranchMergeStatus[] = ["merged", "not-merged", "no-submission", "unknown"];

/** The fixed text-free class recorded for a non-merged merge-check outcome.
 * The log core keeps `error` only on failure entries, so a non-merged outcome
 * is recorded as one extra failure entry carrying exactly one of these. */
export const MERGE_CHECK_FAILURE_CLASSES: Readonly<Record<Exclude<BranchMergeStatus, "merged">, string>> = {
  "not-merged": "merge check: not merged",
  "no-submission": "merge check: no submission",
  unknown: "merge check: undetermined",
};

/** PURE. Read `branchMergeCheck.status` from a resolved grade_repo result by
 * SHAPE. Returns a member of the fixed status set or null (no target set, or
 * not a repo grade). Never returns, and never reads, branch or repo text. */
export function classifyMergeCheckResult(result: unknown): BranchMergeStatus | null {
  const rec = asRecord(result);
  const check = rec ? asRecord(rec.branchMergeCheck) : null;
  const status = check?.status;
  return MERGE_STATUSES.find((m) => m === status) ?? null;
}

export interface GradingActionDecision {
  operation: GradingActionOperation;
  outcome: "success" | "failure";
  durationMs: number;
  /** A member of GRADING_ACTION_FAILURE_CLASSES; present only on failure. */
  error?: GradingActionFailureClass;
  /** Merge-check outcome (fixed status set); present only when the result
   * carried one. Never a branch name. */
  mergeCheck?: BranchMergeStatus;
}

/** PURE. `failureClass` null = success. Duration is rounded and never negative. */
export function decideGradingActionDiagnostic(args: {
  operation: GradingActionOperation;
  startedAtMs: number;
  settledAtMs: number;
  failureClass: GradingActionFailureClass | null;
  mergeCheck?: BranchMergeStatus | null;
}): GradingActionDecision {
  const durationMs = Math.max(0, Math.round(args.settledAtMs - args.startedAtMs));
  const merge = args.mergeCheck ? { mergeCheck: args.mergeCheck } : {};
  if (args.failureClass) {
    return { operation: args.operation, outcome: "failure", durationMs, error: args.failureClass, ...merge };
  }
  return { operation: args.operation, outcome: "success", durationMs, ...merge };
}

/** The monotonic clock the seams capture their start from. */
export function gradingActionNowMs(): number {
  return performance.now();
}

function recordSettled(
  operation: GradingActionOperation,
  startedAtMs: number,
  failureClass: GradingActionFailureClass | null,
  mergeCheck: BranchMergeStatus | null = null
): void {
  const decision = decideGradingActionDiagnostic({
    operation,
    startedAtMs,
    settledAtMs: gradingActionNowMs(),
    failureClass,
    mergeCheck,
  });
  recordGradingDiagnosticEntry({
    at: new Date().toISOString(),
    operation: decision.operation,
    outcome: decision.outcome,
    durationMs: decision.durationMs,
    error: decision.error,
  });
  // The session log has no merge-check field, so a non-merged outcome rides as
  // one extra fixed-class entry (text-free). A merged outcome adds none: it is
  // the ordinary success entry above.
  if (decision.mergeCheck && decision.mergeCheck !== "merged") {
    recordGradingDiagnosticEntry({
      at: new Date().toISOString(),
      operation: decision.operation,
      outcome: "failure",
      durationMs: decision.durationMs,
      error: MERGE_CHECK_FAILURE_CLASSES[decision.mergeCheck],
    });
  }
}

/** `timeGradingAction("post_grades", ...)` with the operation bound. Exists so
 * a call site in a line-budgeted or window-scanned file stays short. */
export function timePostGrades<T>(run: () => Promise<T>): Promise<T> {
  return timeGradingAction("post_grades", run);
}

/** Run an existing awaited grading action, timing it. The action's arguments,
 * result and rejection are passed through UNCHANGED - this only observes. A
 * rejection is recorded as "request threw" and rethrown to the caller. */
export async function timeGradingAction<T>(operation: GradingActionOperation, run: () => Promise<T>): Promise<T> {
  const startedAtMs = gradingActionNowMs();
  let result: T;
  try {
    result = await run();
  } catch (err) {
    recordSettled(operation, startedAtMs, "request threw");
    throw err;
  }
  recordSettled(
    operation,
    startedAtMs,
    classifyGradingActionResult(result),
    operation === "grade_repo" ? classifyMergeCheckResult(result) : null
  );
  return result;
}
