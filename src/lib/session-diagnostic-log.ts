// The Session Diagnostic Log - ONE app-wide record of what this page session
// attempted and how it turned out, and the store behind the "Download session
// log" control on /account/diagnostics.
//
// THE REQUEST, verbatim: "there should be an option to download logs from the
// admin tools in the settings. and these logs should encompass everything
// that has happened on the app in that session".
//
// ONE STORE, NEVER TWO. This module is a PROMOTION of
// src/app/components/content-tab/contentDiagnosticLog.ts (read it, and its
// header, before changing anything here), not a second log beside it. That
// module now records THROUGH this one and reads back a filtered VIEW of it -
// it kept its own on-screen section and its own operation vocabulary, and
// gave up its own array, its own cap and its own scrubbing. The reason is
// stated plainly because it is the whole design constraint: a file offered as
// "everything that happened" ASSERTS completeness, so a second store holding
// events this one never saw would make the download actively misleading -
// worse than not offering it at all.
//
// COVERAGE IS DECLARED, NOT IMPLIED. "Everything that happened" is a promise
// no honest log can keep by itself, so this module carries an explicit
// registry of which surfaces are instrumented and a list of what is NOT
// (SESSION_DIAGNOSTIC_COVERAGE / SESSION_DIAGNOSTIC_NOT_COVERED), and both
// the screen and every downloaded file state them. An instructor reading an
// empty Recording section must be able to tell "recording never fails" from
// "recording was never instrumented".
//
// PAGE-SESSION-LIVED, NEVER PERSISTED. Module-scope, in memory, for exactly
// as long as this page session (a full reload starts a new one; a soft
// navigation between the app and /account/diagnostics keeps it, which is what
// makes the Settings-side download see what the Course Content tab recorded).
// There is deliberately no persistence layer here at all: a diagnostic log
// that outlived its session would become a second, ownerless store of
// operational data with no retention answer - which this project has refused
// elsewhere on purpose.
//
// BROWSER-ONLY BY CONTRACT. Module-scope mutable state in a module reachable
// from a Server Action or a route handler would be shared across REQUESTS,
// and therefore across users - one instructor's failures landing in another's
// download. Nothing server-side may import this module;
// session-diagnostic-log.test.ts enforces that by scanning for the import
// under src/app/api and src/app/actions and in any file marked "use server".
//
// NO STUDENT PERSONAL DATA. Every operation instrumented here is an
// API/infrastructure call succeeding or failing - listing courses, loading a
// course's content, listing Canvas import jobs, cancelling a migration job.
// None of them read a roster, a submission or a message, so no entry names a
// student. The `institution`/`course` fields hold an owner-configured
// acronym and a course name or URL, never a person.
//
// SCRUB, THEN TRUNCATE - the order is load-bearing and is pinned by a test.
// A failure's `error` is upstream free text (a Canvas host, a fetch
// rejection) and can quote a credential, so it goes through
// redactEmbeddedSecrets (src/lib/workflows/run-input-redaction.ts) BEFORE it
// is stored - never at render or download time, by which point the raw value
// has already been sitting in memory and would already be in the file. It is
// length-capped SECOND: slicing first can cut a secret in half and leave a
// raw fragment that is too short for the pattern that would have caught it.
import { redactEmbeddedSecrets, MAX_VALUE_CHARS } from "@/lib/workflows/run-input-redaction";
// The SHARED csvRow/yesNo, not another private copy: course-tasks-view-csv.ts
// already carries both, and its own header records that two other log modules
// had each grown a byte-identical private csvRow before it was lifted out.
import { csvRow, yesNo } from "@/lib/course-tasks-view-csv";

// ---------------------------------------------------------------------------
// Surfaces and declared coverage
// ---------------------------------------------------------------------------

/** The app areas that report into this log. A closed union rather than a free
 * string so the coverage registry below cannot drift out of sync with what is
 * actually instrumented: adding a surface here without a coverage row fails
 * type-checking at SESSION_DIAGNOSTIC_COVERAGE. */
export type SessionDiagnosticSurface = "lms-content" | "diagnostics";

const SURFACES: readonly SessionDiagnosticSurface[] = ["lms-content", "diagnostics"];

export const SESSION_DIAGNOSTIC_SURFACE_LABELS: Readonly<Record<SessionDiagnosticSurface, string>> = {
  "lms-content": "Course Content",
  diagnostics: "Diagnostics (Settings)",
};

export interface SessionDiagnosticCoverageRow {
  surface: SessionDiagnosticSurface;
  /** What this surface reports, in the operations' own terms - so a reader of
   * the downloaded file knows which silences are meaningful. */
  covers: string;
}

/** Every instrumented surface, stated in the download. Typed as a full record
 * keyed by surface so a new surface cannot be added without describing it. */
const COVERAGE_BY_SURFACE: Readonly<Record<SessionDiagnosticSurface, string>> = {
  "lms-content":
    "Listing courses, listing courses with a saved export, loading a course's modules and pages, and listing addable content.",
  diagnostics:
    "Listing courses, listing a course's Canvas import jobs, loading those jobs' progress objects, and cancelling a migration job.",
};

export const SESSION_DIAGNOSTIC_COVERAGE: readonly SessionDiagnosticCoverageRow[] = SURFACES.map((surface) => ({
  surface,
  covers: COVERAGE_BY_SURFACE[surface],
}));

/** What this log does NOT see, named rather than left to be inferred from an
 * absence. Keep this list honest as surfaces are instrumented: an entry
 * removed from here without its surface being added above turns a truthful
 * gap into a false claim of coverage. */
export const SESSION_DIAGNOSTIC_NOT_COVERED: readonly string[] = [
  "Recording, captions, teleprompter and avatar tools.",
  "Grading, rubrics, drafted grades and repo grading.",
  "Workflows and the Automate panel - these keep their own per-run logs, downloadable from their own views.",
  "Chat, the knowledge base, discussion replies and message replies.",
  "Files, course planning, and every other tab not listed as covered above.",
  "Anything that happened before this page was loaded, and anything in another browser tab.",
];

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export type SessionDiagnosticOutcome = "success" | "failure";

/** One attempted operation. Every field is a plain string and always present
 * (mirrors ContentDiagnosticLogEntry's own reasoning) so the CSV writer can
 * emit one column per field unconditionally. `institution`/`course` are ""
 * when the operation has none to name. */
export interface SessionDiagnosticEntry {
  /** ISO 8601, supplied by the caller - no clock read on the append path. */
  at: string;
  surface: SessionDiagnosticSurface;
  /** Stable machine name, e.g. "list_courses". DEV_LOOP.md's downloadable-log
   * rule: the same condition gets the same wording every time. */
  operation: string;
  /** Stable human-readable name for `operation`. Supplied by the surface,
   * because each surface owns its own vocabulary (the Course Content tab's
   * labels live in contentDiagnosticLog.ts and must not be duplicated here). */
  label: string;
  institution: string;
  course: string;
  outcome: SessionDiagnosticOutcome;
  /** "" on success. On failure, the caller's own error text, already scrubbed
   * and length-capped - see sanitizeSessionDiagnosticError. */
  error: string;
}

// ---------------------------------------------------------------------------
// Scrub-then-cap. Order matters - see this file's header.
// ---------------------------------------------------------------------------

function capErrorLength(scrubbed: string): string {
  if (scrubbed.length <= MAX_VALUE_CHARS) return scrubbed;
  const dropped = scrubbed.length - MAX_VALUE_CHARS;
  return `${scrubbed.slice(0, MAX_VALUE_CHARS)} [truncated, ${dropped} more character(s) dropped]`;
}

/** Scrub the FULL string first, cap its length second. Exported so a test can
 * pin the ordering directly, independent of the store's other bookkeeping. */
export function sanitizeSessionDiagnosticError(raw: string): string {
  return capErrorLength(redactEmbeddedSecrets(raw));
}

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

/** Entry-count cap for the whole session across every surface. Higher than
 * the per-surface log it replaced (200) because it now carries more than one
 * surface's traffic, and low enough that the download stays pasteable
 * (DEV_LOOP.md: "a run log that is megabytes cannot be handed to an
 * assistant"). Hitting it is recorded and surfaced, never silent. */
export const MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES = 500;

let storedEntries: SessionDiagnosticEntry[] = [];
let storedDroppedCount = 0;
let storedDroppedBySurface: Record<string, number> = {};

/** Fixed once, when this module is first evaluated in this page session -
 * which is necessarily at or before the first thing that could be recorded,
 * since every recording call goes through this module. Never recomputed, so
 * an EMPTY log and a log that never started recording stay distinguishable:
 * the download always states a real period it covers, even with zero entries.
 * A test pins that it does not move. */
let storedRecordingStartedAt: string = new Date().toISOString();

export function sessionDiagnosticRecordingStartedAt(): string {
  return storedRecordingStartedAt;
}

export interface SessionDiagnosticLogState {
  recordingStartedAt: string;
  entries: readonly SessionDiagnosticEntry[];
  droppedCount: number;
  /** Drops attributed to the surface whose entry fell off the front, so a
   * per-surface view (contentDiagnosticLog.ts's) can report ITS OWN losses
   * rather than the session total, which would overstate them. */
  droppedBySurface: Readonly<Record<string, number>>;
}

export interface RecordSessionDiagnosticArgs {
  at: string;
  surface: SessionDiagnosticSurface;
  operation: string;
  label?: string;
  institution?: string;
  course?: string;
  outcome: SessionDiagnosticOutcome;
  /** The caller's own RAW error message - never pre-scrubbed or
   * pre-truncated. This function owns both steps, in the required order. */
  error?: string;
}

/** Append one entry to the session store. Side-effecting on purpose: this is
 * the single write path, so there is exactly one place where scrubbing,
 * capping and drop-counting happen. Callers in components must call this
 * OUTSIDE a setState updater - an updater can be invoked twice under
 * StrictMode and would double-record. */
export function recordSessionDiagnosticEntry(args: RecordSessionDiagnosticArgs): void {
  const entry: SessionDiagnosticEntry = {
    at: args.at,
    surface: args.surface,
    operation: args.operation || "unknown",
    label: args.label || args.operation || "unknown",
    institution: args.institution ?? "",
    course: args.course ?? "",
    outcome: args.outcome,
    error: args.outcome === "failure" ? sanitizeSessionDiagnosticError(args.error ?? "") : "",
  };
  storedEntries.push(entry);
  while (storedEntries.length > MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES) {
    const dropped = storedEntries.shift();
    if (!dropped) break;
    storedDroppedCount += 1;
    storedDroppedBySurface[dropped.surface] = (storedDroppedBySurface[dropped.surface] ?? 0) + 1;
  }
}

/** A snapshot of the whole session log. Returns a COPY of the entry array
 * every call: callers cannot mutate the store through it, and a React caller
 * gets a new identity so a re-render actually happens. */
export function readSessionDiagnosticLogState(): SessionDiagnosticLogState {
  return {
    recordingStartedAt: storedRecordingStartedAt,
    entries: [...storedEntries],
    droppedCount: storedDroppedCount,
    droppedBySurface: { ...storedDroppedBySurface },
  };
}

/** The one surface's slice of the session log, with the drops attributed to
 * that surface - the read path behind contentDiagnosticLog.ts's view. */
export function readSessionDiagnosticSurfaceEntries(surface: SessionDiagnosticSurface): {
  recordingStartedAt: string;
  entries: SessionDiagnosticEntry[];
  droppedCount: number;
} {
  return {
    recordingStartedAt: storedRecordingStartedAt,
    entries: storedEntries.filter((entry) => entry.surface === surface),
    droppedCount: storedDroppedBySurface[surface] ?? 0,
  };
}

/** Test-only reset. Not exported for production use: nothing in the app may
 * clear this log, because a "clear" control on a diagnostic record is a way
 * to make a failure unreportable after the fact. */
export function resetSessionDiagnosticLogForTests(recordingStartedAt: string): void {
  storedEntries = [];
  storedDroppedCount = 0;
  storedDroppedBySurface = {};
  storedRecordingStartedAt = recordingStartedAt;
}

/** Newest-first slice for an on-screen "recent activity" list. The full,
 * oldest-first order is preserved in the download. */
export function recentSessionDiagnosticEntries(
  entries: readonly SessionDiagnosticEntry[],
  count: number
): SessionDiagnosticEntry[] {
  if (count <= 0) return [];
  return entries.slice(Math.max(0, entries.length - count)).reverse();
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export interface SessionDiagnosticLogSummary {
  total: number;
  succeeded: number;
  failed: number;
  droppedCount: number;
  /** Attempts per surface - lets a reader see at a glance that a surface
   * reported nothing, which with the coverage list above is the difference
   * between "nothing happened there" and "it is not instrumented". */
  bySurface: Record<string, number>;
}

export function summarizeSessionDiagnosticLog(state: SessionDiagnosticLogState): SessionDiagnosticLogSummary {
  let succeeded = 0;
  let failed = 0;
  const bySurface: Record<string, number> = {};
  for (const surface of SURFACES) bySurface[surface] = 0;
  for (const entry of state.entries) {
    if (entry.outcome === "success") succeeded += 1;
    else failed += 1;
    bySurface[entry.surface] = (bySurface[entry.surface] ?? 0) + 1;
  }
  return { total: state.entries.length, succeeded, failed, droppedCount: state.droppedCount, bySurface };
}

/** The one-line summary above the download buttons. Always states that
 * recording is active - even, and especially, when `total` is 0 - so an empty
 * result reads as "nothing happened" rather than "nothing was captured".
 * Never gated on `total > 0`. */
export function sessionDiagnosticLogSummaryLine(summary: SessionDiagnosticLogSummary): string {
  const parts: string[] = [];
  if (summary.total === 0) {
    parts.push("Session diagnostic log recording - no operations attempted yet in this page session.");
  } else {
    const opWord = summary.total === 1 ? "operation" : "operations";
    parts.push(
      `Session diagnostic log recording - ${summary.total} ${opWord} attempted, ${summary.succeeded} succeeded, ${summary.failed} failed.`
    );
  }
  if (summary.droppedCount > 0) {
    parts.push(
      `${summary.droppedCount} earlier entr${summary.droppedCount === 1 ? "y" : "ies"} dropped to stay under the ${MAX_SESSION_DIAGNOSTIC_LOG_ENTRIES}-entry cap.`
    );
  }
  return parts.join(" ");
}

/** The coverage sentence shown beside the summary. Separate from the summary
 * line so the honesty about scope is never squeezed out by the counts. */
export function sessionDiagnosticCoverageLine(): string {
  const names = SESSION_DIAGNOSTIC_COVERAGE.map((row) => SESSION_DIAGNOSTIC_SURFACE_LABELS[row.surface]).join("; ");
  return (
    `This log covers ${SESSION_DIAGNOSTIC_COVERAGE.length} instrumented area(s) - ${names} - not yet the whole app. ` +
    "The downloaded file lists exactly what is and is not covered. Reloading the page starts a new session log."
  );
}

// ---------------------------------------------------------------------------
// Full log (state + the context/timestamp only known at download time)
// ---------------------------------------------------------------------------

/** Settings and environment facts in force at download time (DEV_LOOP.md's
 * "every setting in force for that run" and "the environment facts the
 * behaviour depends on"). Not accumulated as events: these change many times
 * across a session, and each entry already carries its own institution and
 * course at the moment it happened. `currentPage` is a PATH only, never the
 * query string - a query string is exactly where a credential would be. */
export interface SessionDiagnosticLogContext {
  currentInstitution: string;
  currentCourse: string;
  currentPage: string;
  browser: string;
}

export interface SessionDiagnosticLog extends SessionDiagnosticLogState, SessionDiagnosticLogContext {
  generatedAt: string;
}

export function buildSessionDiagnosticLog(
  state: SessionDiagnosticLogState,
  context: SessionDiagnosticLogContext,
  generatedAt: string
): SessionDiagnosticLog {
  return { ...state, ...context, generatedAt };
}

const RUN_CSV_HEADER = ["Field", "Value"];
const COVERAGE_CSV_HEADER = ["Area", "Instrumented", "What is recorded"];
const ENTRY_CSV_HEADER = ["At", "Area", "Operation", "Institution", "Course", "Outcome", "Error"];

/** CSV export: a "Session" header block, then the COVERAGE block (what this
 * file does and does not claim), then one row per entry, oldest first - the
 * order it actually happened. The coverage block sits above the entries on
 * purpose: a reader must meet the scope of the file before they meet its
 * silences. */
export function formatSessionDiagnosticLogCsv(log: SessionDiagnosticLog): string {
  const summary = summarizeSessionDiagnosticLog(log);
  const lines: string[] = [];

  lines.push(csvRow(["=== Session ==="]));
  lines.push(csvRow(RUN_CSV_HEADER));
  lines.push(csvRow(["Recording started", log.recordingStartedAt]));
  lines.push(csvRow(["Generated", log.generatedAt]));
  lines.push(csvRow(["Recording active", "Yes"]));
  lines.push(csvRow(["Page", log.currentPage]));
  lines.push(csvRow(["Browser", log.browser]));
  lines.push(csvRow(["Current institution", log.currentInstitution]));
  lines.push(csvRow(["Current course", log.currentCourse]));
  lines.push(csvRow(["Total entries", String(summary.total)]));
  lines.push(csvRow(["Succeeded", String(summary.succeeded)]));
  lines.push(csvRow(["Failed", String(summary.failed)]));
  lines.push(csvRow(["Entries dropped (cap reached)", String(summary.droppedCount)]));
  lines.push(csvRow(["Any entries dropped", yesNo(summary.droppedCount > 0)]));
  for (const surface of SURFACES) {
    lines.push(csvRow([`Attempts - ${SESSION_DIAGNOSTIC_SURFACE_LABELS[surface]}`, String(summary.bySurface[surface] ?? 0)]));
  }

  lines.push("");
  lines.push(csvRow(["=== Coverage ==="]));
  lines.push(csvRow(COVERAGE_CSV_HEADER));
  for (const row of SESSION_DIAGNOSTIC_COVERAGE) {
    lines.push(csvRow([SESSION_DIAGNOSTIC_SURFACE_LABELS[row.surface], "Yes", row.covers]));
  }
  for (const notCovered of SESSION_DIAGNOSTIC_NOT_COVERED) {
    lines.push(csvRow([notCovered, "No", "Not instrumented - this log's silence about it means nothing."]));
  }

  lines.push("");
  lines.push(csvRow(["=== Entries ==="]));
  lines.push(csvRow(ENTRY_CSV_HEADER));
  for (const entry of log.entries) {
    lines.push(
      csvRow([
        entry.at,
        SESSION_DIAGNOSTIC_SURFACE_LABELS[entry.surface] ?? entry.surface,
        entry.label,
        entry.institution,
        entry.course,
        entry.outcome,
        entry.error,
      ])
    );
  }

  return lines.join("\r\n");
}

/** The exhaustive JSON export - an OBJECT, never a bare array, matching this
 * repo's other downloadable logs. Carries the computed summary and the
 * coverage declaration alongside the raw entries, so a reader (human or LLM)
 * handed this file alone does not have to recompute totals, notice the cap
 * was hit by counting, or guess what the file's silence covers. */
export function formatSessionDiagnosticLogJson(log: SessionDiagnosticLog): string {
  return JSON.stringify(
    {
      ...log,
      summary: summarizeSessionDiagnosticLog(log),
      recordingActive: true,
      coverage: {
        instrumented: SESSION_DIAGNOSTIC_COVERAGE.map((row) => ({
          area: SESSION_DIAGNOSTIC_SURFACE_LABELS[row.surface],
          surface: row.surface,
          covers: row.covers,
        })),
        notInstrumented: SESSION_DIAGNOSTIC_NOT_COVERED,
      },
    },
    null,
    2
  );
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

export function sessionDiagnosticLogFileName(extension: string, atIso: string): string {
  return `session-diagnostic-log-${fileStamp(atIso)}.${extension}`;
}

// ---------------------------------------------------------------------------
// Round-trip: validate-and-reconstruct entries from parsed JSON. No
// persistence layer reads this (there is none); it proves the JSON export is
// reconstructible by a program, not merely readable by a person - which is
// what "a file the owner can send to an assistant" has to be.
// ---------------------------------------------------------------------------

function isSurface(value: unknown): value is SessionDiagnosticSurface {
  return typeof value === "string" && (SURFACES as readonly string[]).includes(value);
}

function isOutcome(value: unknown): value is SessionDiagnosticOutcome {
  return value === "success" || value === "failure";
}

function parseOneEntry(raw: unknown): SessionDiagnosticEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (!isSurface(record.surface)) return null;
  if (!isOutcome(record.outcome)) return null;
  const text = (key: string): string | null => (typeof record[key] === "string" ? (record[key] as string) : null);
  const at = text("at");
  const operation = text("operation");
  const label = text("label");
  const institution = text("institution");
  const course = text("course");
  const error = text("error");
  if (at === null || operation === null || label === null) return null;
  if (institution === null || course === null || error === null) return null;
  return {
    at,
    surface: record.surface,
    operation,
    label,
    institution,
    course,
    outcome: record.outcome,
    error,
  };
}

export function parseSessionDiagnosticLogEntries(value: unknown): SessionDiagnosticEntry[] {
  if (!Array.isArray(value)) return [];
  const out: SessionDiagnosticEntry[] = [];
  for (const raw of value) {
    const entry = parseOneEntry(raw);
    if (entry) out.push(entry);
  }
  return out;
}
