// The grading surface's client wrapper over the app-wide Session Diagnostic
// Log (src/lib/session-diagnostic-log.ts). Mirrors contentDiagnosticLog.ts:
// ONE surface value ("grading"), this module owns the operation vocabulary,
// and every record goes THROUGH the core so scrubbing, capping and drop
// accounting stay in one place.
//
// BROWSER-ONLY. The core holds module-scope state that a server would share
// across requests, so nothing under src/app/api, src/app/actions or any
// "use server" file may import this module either (the scan in
// session-diagnostic-log.test.ts bans this specifier too).
//
// NO STUDENT DATA. The label is the fixed operation label below, never a
// student name or submission text. `error` is the grading action's own error
// string, handed in RAW so the core scrubs then caps it.
import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
import type { SubmissionZipClassification } from "@/lib/grade/types";

export type GradingDiagnosticOperation =
  | "resolve_header"
  | "generate_rubric"
  | "prepare_submission"
  | "grade_whole_run"
  | "grade_item"
  | "grade_repo"
  | "grade_repos"
  | "derive_checklist"
  | "fetch_canvas_meta"
  | "list_lms_assignments"
  | "post_grades"
  | "post_draft"
  | "capture_screenshot"
  | "classify_submission_class"
  | "classify_submission_single"
  | "classify_submission_unknown";

export const GRADING_DIAGNOSTIC_OPERATION_LABELS: Readonly<Record<GradingDiagnosticOperation, string>> = {
  resolve_header: "Resolve run header",
  generate_rubric: "Generate rubric",
  prepare_submission: "Prepare submission",
  grade_whole_run: "Grade (whole run)",
  grade_item: "Grade submission",
  grade_repo: "Grade repository",
  grade_repos: "Grade repository cohort",
  derive_checklist: "Derive assignment checklist",
  fetch_canvas_meta: "Fetch Canvas assignment details",
  list_lms_assignments: "List LMS assignments",
  post_grades: "Post grades to Canvas",
  post_draft: "Post drafted grade",
  capture_screenshot: "Capture screenshot",
  classify_submission_class: "Classified: class bundle",
  classify_submission_single: "Classified: single submission",
  classify_submission_unknown: "Classification: undetermined",
};

export interface RecordGradingDiagnosticArgs {
  at: string;
  operation: GradingDiagnosticOperation;
  outcome: "success" | "failure";
  /** Elapsed milliseconds as seen by the browser. */
  durationMs: number;
  institution?: string;
  course?: string;
  /** The action's own RAW error message; ignored on success. */
  error?: string;
  /** Students found in a classified zip (a bare count, never names). */
  classificationStudentCount?: number;
}

/** Record one grading operation into the app-wide session log. Call it
 * OUTSIDE a setState updater (an updater can run twice under StrictMode). */
export function recordGradingDiagnosticEntry(args: RecordGradingDiagnosticArgs): void {
  recordSessionDiagnosticEntry({
    at: args.at,
    surface: "grading",
    operation: args.operation,
    label: GRADING_DIAGNOSTIC_OPERATION_LABELS[args.operation],
    institution: args.institution ?? "",
    course: args.course ?? "",
    outcome: args.outcome,
    error: args.error,
    durationMs: args.durationMs,
    classificationStudentCount: args.classificationStudentCount,
  });
}

/** The slice of the whole-run `useActionState` result the decision reads. */
export interface WholeRunSettledState {
  error: string | null;
  run: unknown;
}

export interface WholeRunDiagnosticDecision {
  operation: "grade_whole_run";
  outcome: "success" | "failure";
  durationMs: number;
  error?: string;
}

/** PURE. Whether, and what, to record when a whole-run grade settles.
 * `null` when no whole-run dispatch is in flight (no captured start), so an
 * unrelated `state` change never records. Failure when the action returned an
 * error; success otherwise. */
export function decideWholeRunDiagnostic(args: {
  startedAtMs: number | null;
  settledAtMs: number;
  state: WholeRunSettledState;
}): WholeRunDiagnosticDecision | null {
  if (args.startedAtMs === null) return null;
  const durationMs = Math.max(0, Math.round(args.settledAtMs - args.startedAtMs));
  if (args.state.error) {
    return { operation: "grade_whole_run", outcome: "failure", durationMs, error: args.state.error };
  }
  return { operation: "grade_whole_run", outcome: "success", durationMs };
}

/** The thin caller GradingTab's settle effect uses: decide, then record.
 * Returns whether an entry was recorded. */
export function recordWholeRunSettled(args: {
  startedAtMs: number | null;
  settledAtMs: number;
  state: WholeRunSettledState;
  at: string;
}): boolean {
  const decision = decideWholeRunDiagnostic(args);
  if (!decision) return false;
  recordGradingDiagnosticEntry({
    at: args.at,
    operation: decision.operation,
    outcome: decision.outcome,
    durationMs: decision.durationMs,
    error: decision.error,
  });
  return true;
}

export interface ClassifyDiagnosticDecision {
  operation: "classify_submission_class" | "classify_submission_single" | "classify_submission_unknown";
  studentCount: number;
  durationMs: number;
}

/** PURE. Whether, and what, to record when a zip upload has been classified.
 * `null` when no ingest start was captured, and `null` when no classification
 * streamed (a non-zip submission, or an old-server sentinel). Operation and a
 * bare count only: NO student data. */
export function decideClassifyDiagnostic(args: {
  startedAtMs: number | null;
  settledAtMs: number;
  classification: SubmissionZipClassification | undefined;
}): ClassifyDiagnosticDecision | null {
  if (args.startedAtMs === null) return null;
  if (args.classification === undefined) return null;
  return {
    operation: `classify_submission_${args.classification.kind}`,
    studentCount: args.classification.studentCount,
    durationMs: Math.max(0, Math.round(args.settledAtMs - args.startedAtMs)),
  };
}

/** The thin caller the chat driver's zip-ingest branches use: decide, then
 * record. Returns whether an entry was recorded. `startedAtMs` and
 * `settledAtMs` are performance.now() captures. */
export function recordClassifySettled(args: {
  startedAtMs: number | null;
  settledAtMs: number;
  classification: SubmissionZipClassification | undefined;
  at: string;
}): boolean {
  const decision = decideClassifyDiagnostic(args);
  if (!decision) return false;
  recordGradingDiagnosticEntry({
    at: args.at,
    operation: decision.operation,
    outcome: "success",
    durationMs: decision.durationMs,
    classificationStudentCount: decision.studentCount,
  });
  return true;
}
