// The Content Diagnostic Log for the LMS course-content surface
// (ContentTab.tsx and its CoursePicker.tsx).
//
// MOTIVATING CASE, real and user-reported: selecting a newly entered
// institution produced "Could not list courses for this school", with
// nothing about why. CoursePicker.tsx was discarding the action's own error
// message (see coursePickerError.wiring.test.ts - now fixed, the message is
// kept and rendered). Fixing that one screen does not help with the NEXT
// failure of a different kind on this same surface, which is what this log
// is for: it exists so that failure is diagnosable from a file the owner can
// send, rather than from a screenshot and a memory of what they clicked.
//
// THIS MODULE NO LONGER OWNS A STORE - IT IS A VIEW. Everything it used to
// hold (the entry array, the entry cap, the drop counter, the scrubbing, the
// recording-start time) now lives in src/lib/session-diagnostic-log.ts, the
// app-wide session log behind Settings -> Diagnostics -> "Download session
// log". What survives here is exactly what is SPECIFIC to this surface: its
// four operation names and their labels, and the CSV/JSON rendering of the
// content-tab-only slice.
//
// The reason for the demotion, since it is the whole design constraint: the
// Settings download is offered as "everything that happened in this session",
// and a file that ASSERTS completeness while a second store quietly holds
// events it never saw is worse than no file at all. Two stores could only
// have stayed in sync by discipline; one store plus a filter cannot drift.
// recordContentDiagnosticEntry below therefore WRITES to the session log
// (surface "lms-content"), and contentDiagnosticLogView READS the same log
// back, filtered - so this section keeps showing precisely the entries it
// always showed, and every one of them is also in the session download.
//
// Consequences worth stating rather than discovering:
//   - The log is no longer scoped to ContentTab's mounted lifetime. It starts
//     when the page session starts and survives leaving and re-entering the
//     tab, which is strictly more useful and is what "that session" meant.
//   - `droppedCount` here is the count of LMS-CONTENT entries lost to the
//     session cap (session-diagnostic-log.ts tracks drops per surface), not
//     the session-wide total, which would overstate this section's losses.
//
// NO STUDENT DATA. Every operation this log instruments (listing courses,
// listing courses with a saved export, loading a course's modules/pages,
// listing addable content) is a Canvas-or-export API call succeeding or
// failing - never a student record. None of the errors these call sites can
// return name a student (see ContentTab.tsx/CoursePicker.tsx for the exact
// call sites this log's entries are built from).
//
// SCRUB-THEN-CAP, AND THE VISIBLE CAP, both moved with the store and both
// still hold; see session-diagnostic-log.ts's header for why the ordering is
// load-bearing and why a dropped entry is counted rather than silently
// forgotten. sanitizeContentDiagnosticError below is a thin alias of the
// session log's scrubber, kept so this surface's own tests keep pinning the
// property they always pinned - through the code path that now runs.
import {
  MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES,
  readSessionDiagnosticSurfaceEntries,
  recordSessionDiagnosticEntry,
  sanitizeSessionDiagnosticError,
} from "@/lib/session-diagnostic-log";
// The SHARED csvRow/yesNo rather than the private copies this file used to
// carry - course-tasks-view-csv.ts already owns both, and its own header
// records that two other log modules had each grown a byte-identical private
// csvRow before it was lifted out.
import { csvRow, yesNo } from "@/lib/course-tasks-view-csv";

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

/** The surface this module's entries are recorded under in the session log. */
const SURFACE = "lms-content" as const;

/**
 * The operations this surface can visibly fail at, and that either explain
 * themselves badly today or not at all:
 * - "list_courses": CoursePicker's live Canvas course dropdown
 *   (listCoursesAction) - the motivating case above.
 * - "list_export_courses": CoursePicker's "Courses with a saved export"
 *   section (listCourseHubAction) - today a real failure collapses to the
 *   fixed sentence "Could not list your saved courses."
 *   (describeExportSectionState), throwing away the same kind of real
 *   message the live list used to discard.
 * - "load_course_content": ContentTab's loadContent, for both the live
 *   Canvas branch and the export branch, and both its explicit-selection
 *   call site and the mount-time auto-restore effect that mirrors it.
 * - "list_addable_content": ContentTab's ensureTargets
 *   (listAddableContentAction) - today a failure here is completely silent:
 *   `targets` simply never gets set and nothing tells the instructor why.
 */
export type ContentDiagnosticOperation =
  | "list_courses"
  | "list_export_courses"
  | "load_course_content"
  | "list_addable_content";

const OPERATIONS: readonly ContentDiagnosticOperation[] = [
  "list_courses",
  "list_export_courses",
  "load_course_content",
  "list_addable_content",
];

/** Stable event names for the CSV/JSON and the on-screen recent-entries
 * list - DEV_LOOP.md's downloadable-log rule ("the same condition gets the
 * same wording every time"). Handed to the session log as each entry's
 * `label`, so the session-wide download names these operations identically
 * to this section rather than inventing a second wording for them. */
export const CONTENT_DIAGNOSTIC_OPERATION_LABELS: Readonly<Record<ContentDiagnosticOperation, string>> = {
  list_courses: "List courses",
  list_export_courses: "List courses with a saved export",
  load_course_content: "Load course content",
  list_addable_content: "List addable content",
};

export type ContentDiagnosticOutcome = "success" | "failure";

/** One attempted operation, in this surface's own shape (the session log's
 * entry carries a `surface` and a `label` too; the view below drops them, so
 * this section's rendering and its CSV columns are unchanged). */
export interface ContentDiagnosticLogEntry {
  /** ISO 8601, supplied by the caller. */
  at: string;
  operation: ContentDiagnosticOperation;
  institution: string;
  course: string;
  outcome: ContentDiagnosticOutcome;
  /** "" on success. On failure, the action's own error message, already
   * scrubbed and length-capped - see sanitizeContentDiagnosticError. */
  error: string;
}

/** Alias of the session log's scrubber: scrub the FULL string for embedded
 * secrets first, only then cap its length. Reversing that order can cut a
 * secret in half and defeat the pattern that would have caught it. Kept as a
 * named export on this surface so its own test pins the ordering on the path
 * this surface actually takes. */
export function sanitizeContentDiagnosticError(raw: string): string {
  return sanitizeSessionDiagnosticError(raw);
}

// ---------------------------------------------------------------------------
// Write and read - both through the one session store
// ---------------------------------------------------------------------------

/** What the on-screen section renders. Shape unchanged from when this module
 * owned the state; `recordingStartedAt` is now the SESSION's start (fixed
 * once per page session) rather than one component mount's, which is what
 * makes an empty section trustworthy across a tab switch. */
export interface ContentDiagnosticLogState {
  recordingStartedAt: string;
  entries: readonly ContentDiagnosticLogEntry[];
  droppedCount: number;
}

export interface RecordContentDiagnosticArgs {
  at: string;
  operation: ContentDiagnosticOperation;
  institution: string;
  course: string;
  outcome: ContentDiagnosticOutcome;
  /** The action's own raw error message. Required in practice on failure,
   * ignored on success. Callers must hand this in RAW, never pre-scrubbed or
   * pre-truncated - the session log owns both steps, in the required order. */
  error?: string;
}

/** Record one content-tab operation into the app-wide session log. Returns
 * nothing: there is no per-surface state to thread any more. A component
 * caller must invoke this OUTSIDE a setState updater (an updater can run
 * twice under StrictMode and would double-record) and then re-read
 * contentDiagnosticLogView() for the refreshed view. */
export function recordContentDiagnosticEntry(args: RecordContentDiagnosticArgs): void {
  recordSessionDiagnosticEntry({
    at: args.at,
    surface: SURFACE,
    operation: args.operation,
    label: CONTENT_DIAGNOSTIC_OPERATION_LABELS[args.operation],
    institution: args.institution,
    course: args.course,
    outcome: args.outcome,
    error: args.error,
  });
}

function isOperation(value: unknown): value is ContentDiagnosticOperation {
  return typeof value === "string" && (OPERATIONS as readonly string[]).includes(value);
}

/** This surface's slice of the session log, in this surface's own entry
 * shape. A session entry whose `operation` is not one of this surface's four
 * is skipped rather than coerced - it could only exist if some other caller
 * recorded under this surface, and silently retyping it would put a value in
 * `operation` that CONTENT_DIAGNOSTIC_OPERATION_LABELS cannot label. */
export function contentDiagnosticLogView(): ContentDiagnosticLogState {
  const slice = readSessionDiagnosticSurfaceEntries(SURFACE);
  const entries: ContentDiagnosticLogEntry[] = [];
  for (const entry of slice.entries) {
    if (!isOperation(entry.operation)) continue;
    entries.push({
      at: entry.at,
      operation: entry.operation,
      institution: entry.institution,
      course: entry.course,
      outcome: entry.outcome,
      error: entry.error,
    });
  }
  return { recordingStartedAt: slice.recordingStartedAt, entries, droppedCount: slice.droppedCount };
}

/** Newest-first slice for the on-screen "recent activity" list. The full,
 * oldest-first order is preserved in the download
 * (formatContentDiagnosticLogCsv/Json read `log.entries` directly). */
export function recentContentDiagnosticEntries(
  entries: readonly ContentDiagnosticLogEntry[],
  count: number
): ContentDiagnosticLogEntry[] {
  if (count <= 0) return [];
  return entries.slice(Math.max(0, entries.length - count)).reverse();
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface ContentDiagnosticLogSummary {
  total: number;
  succeeded: number;
  failed: number;
  droppedCount: number;
}

export function summarizeContentDiagnosticLog(state: ContentDiagnosticLogState): ContentDiagnosticLogSummary {
  let succeeded = 0;
  let failed = 0;
  for (const entry of state.entries) {
    if (entry.outcome === "success") succeeded += 1;
    else failed += 1;
  }
  return { total: state.entries.length, succeeded, failed, droppedCount: state.droppedCount };
}

/** The one-line summary shown above the download buttons (RunLogRow's
 * `summary` prop). Always states that recording is active - even (and
 * especially) when `total` is 0 - so an instructor reading the screen, or a
 * reader of a downloaded file whose entries section is empty, sees "nothing
 * happened" rather than mistaking silence for "nothing was captured". Never
 * gated on `total > 0`. */
export function contentDiagnosticLogSummaryLine(summary: ContentDiagnosticLogSummary): string {
  const parts: string[] = [];
  if (summary.total === 0) {
    parts.push("Diagnostic log recording - no operations attempted yet this session.");
  } else {
    const opWord = summary.total === 1 ? "operation" : "operations";
    parts.push(
      `Diagnostic log recording - ${summary.total} ${opWord} attempted, ${summary.succeeded} succeeded, ${summary.failed} failed.`
    );
  }
  if (summary.droppedCount > 0) {
    parts.push(
      `${summary.droppedCount} earlier entr${summary.droppedCount === 1 ? "y" : "ies"} dropped to stay under the session log's ${MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES}-entry cap.`
    );
  }
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Full log (state + the context/timestamp only known at download time) and
// its CSV/JSON rendering.
// ---------------------------------------------------------------------------

/** Settings in force for this session, read fresh at download time -
 * DEV_LOOP.md's downloadable-log rule ("every setting in force for that
 * run"). Not accumulated as events: these can change many times across the
 * log's lifetime (switching institution/course does not reset this log),
 * so only the CURRENT value is worth stating in the header - each entry
 * already carries its OWN institution/course at the time it happened. */
export interface ContentDiagnosticLogContext {
  currentInstitution: string;
  currentCourse: string;
}

export interface ContentDiagnosticLog extends ContentDiagnosticLogState, ContentDiagnosticLogContext {
  generatedAt: string;
}

export function buildContentDiagnosticLog(
  state: ContentDiagnosticLogState,
  context: ContentDiagnosticLogContext,
  generatedAt: string
): ContentDiagnosticLog {
  return { ...state, ...context, generatedAt };
}

const RUN_CSV_HEADER = ["Field", "Value"];
const ENTRY_CSV_HEADER = ["At", "Operation", "Institution", "Course", "Outcome", "Error"];

/** CSV export: a "Run" section stating the period covered and whether
 * anything was dropped to the cap, then one row per entry, oldest first
 * (the order it actually happened). This file is the COURSE CONTENT slice
 * only - the whole-session file lives behind Settings -> Diagnostics and is
 * built from the same store, so the two can never disagree. */
export function formatContentDiagnosticLogCsv(log: ContentDiagnosticLog): string {
  const summary = summarizeContentDiagnosticLog(log);
  const lines: string[] = [];

  lines.push(csvRow(["=== Run ==="]));
  lines.push(csvRow(RUN_CSV_HEADER));
  lines.push(csvRow(["Scope", "Course Content operations only - Settings > Diagnostics downloads the whole session"]));
  lines.push(csvRow(["Recording started", log.recordingStartedAt]));
  lines.push(csvRow(["Generated", log.generatedAt]));
  lines.push(csvRow(["Current institution", log.currentInstitution]));
  lines.push(csvRow(["Current course", log.currentCourse]));
  lines.push(csvRow(["Total entries", String(summary.total)]));
  lines.push(csvRow(["Succeeded", String(summary.succeeded)]));
  lines.push(csvRow(["Failed", String(summary.failed)]));
  lines.push(csvRow(["Entries dropped (cap reached)", String(summary.droppedCount)]));
  lines.push(csvRow(["Any entries dropped", yesNo(summary.droppedCount > 0)]));

  lines.push("");
  lines.push(csvRow(["=== Entries ==="]));
  lines.push(csvRow(ENTRY_CSV_HEADER));
  for (const entry of log.entries) {
    lines.push(
      csvRow([
        entry.at,
        CONTENT_DIAGNOSTIC_OPERATION_LABELS[entry.operation],
        entry.institution,
        entry.course,
        entry.outcome,
        entry.error,
      ])
    );
  }

  return lines.join("\r\n");
}

/** The exhaustive JSON export - an OBJECT (never a bare array), matching
 * formatGradingRecordingLogJson/formatRubricRunLogJson. Carries the
 * computed `summary` alongside the raw entries so a reader (human or LLM)
 * pasted this file does not need to recompute totals or notice the cap was
 * hit by counting entries themselves. */
export function formatContentDiagnosticLogJson(log: ContentDiagnosticLog): string {
  return JSON.stringify({ ...log, summary: summarizeContentDiagnosticLog(log) }, null, 2);
}

// ---------------------------------------------------------------------------
// Filename
// ---------------------------------------------------------------------------

function fileStamp(atIso: string): string {
  const match = atIso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return atIso.replace(/[^0-9a-zA-Z]+/g, "-").replace(/^-+|-+$/g, "");
  const [, year, month, day, hour, minute, second] = match;
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

export function contentDiagnosticLogFileName(extension: string, atIso: string): string {
  return `content-diagnostic-log-${fileStamp(atIso)}.${extension}`;
}

// ---------------------------------------------------------------------------
// Round-trip: validate-and-reconstruct entries from parsed JSON. Not used by
// any persistence layer (this log has none - see this file's header), but
// proves formatContentDiagnosticLogJson's output is reconstructible by a
// program, not merely readable by a person - which is exactly what "a file
// the owner can send" needs to be worth sending to an assistant that will
// re-parse it. Mirrors parseRubricRunLogEntries's identical validate-on-read
// shape.
// ---------------------------------------------------------------------------

function isOutcome(value: unknown): value is ContentDiagnosticOutcome {
  return value === "success" || value === "failure";
}

function parseOneEntry(raw: unknown): ContentDiagnosticLogEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (!isOperation(record.operation)) return null;
  if (!isOutcome(record.outcome)) return null;
  const text = (key: string): string | null => (typeof record[key] === "string" ? (record[key] as string) : null);
  const at = text("at");
  const institution = text("institution");
  const course = text("course");
  const error = text("error");
  if (at === null || institution === null || course === null || error === null) return null;
  return { at, operation: record.operation, institution, course, outcome: record.outcome, error };
}

export function parseContentDiagnosticLogEntries(value: unknown): ContentDiagnosticLogEntry[] {
  if (!Array.isArray(value)) return [];
  const out: ContentDiagnosticLogEntry[] = [];
  for (const raw of value) {
    const entry = parseOneEntry(raw);
    if (entry) out.push(entry);
  }
  return out;
}
