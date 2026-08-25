// A downloadable log for "Generate & associate rubric"
// (docs/rubric-bulk-log-acceptance-criteria.md). Pure, no I/O, no React, no
// clock: every function here takes the timestamp it needs as a parameter
// rather than calling Date.now(), matching src/app/components/repo-grades/
// repoGradesLog.ts's own precedent (entry 333) for the identical problem -
// "a Canvas write with no undo and no audit table leaves a one-line note
// that a reload wipes". This file follows that shape (entry type, append+cap,
// validate-on-read, summary, CSV/JSON, filename) without importing it, since
// that module is repo-grades-specific.
//
// B1.2 - THE CORE INSTRUCTION: `buildRubricRunLogEntries` below is built from
// the SAME `RubricTargetOutcome[]`/`OrphanRubric[]` that
// `summarizeRubricGenerateOutcomes` (bulkRubricGenerateSummary.ts) consumes -
// never from a second classification of what happened. Entry 332 records
// that summarizer as "the ONE function that decides whether AC4's three
// outcomes stay distinct", and a second spelling of the same judgement is
// how the two would drift apart. This file does not re-decide which bucket
// an outcome falls in; it reads `outcome.status`/`outcome.reason` (and
// `OrphanRubric`'s own fields) straight through into one log entry per
// target/orphan, plus one entry for a whole-action error and one for a
// generation failure, both passed in from the same call site rather than
// re-derived here.
//
// vitest here is node-env and collects only src/**/*.test.ts - nothing in
// this file is ever rendered by a test, which is why every decision
// (entry shape, cap direction, CSV escaping, filename) lives here rather
// than in the panel component that only calls these functions.
import { escapeCsvValue } from "./course-tasks-view-csv";
import type { OrphanRubric, RubricTargetOutcome } from "@/app/actions/rubric-bulk";

/**
 * B1.4: the three failure kinds entry 332 fought to keep distinct, spelled
 * as three different `kind` values so a future edit that folds two of them
 * together fails a test that reads the KIND, not a count that could still
 * add up right by accident:
 * - "run-error": the whole action call failed (`{error}` from the server
 *   boundary) - `generateAndAssociateRubricAction` itself never ran to
 *   completion, so no item's eligibility was even attempted.
 * - "generation-failed": phase 1 (the LLM call) failed or produced an
 *   unparseable rubric - NO Canvas write of any kind was attempted, so every
 *   item's eligibility is unknown, not "ineligible".
 * - "target-failed": one target's own association attempt failed, after
 *   generation succeeded and a Canvas write was actually attempted for it.
 *
 * "target-updated" and "target-skipped" are plain, non-failure outcomes
 * (skipped carries its own `reason`, e.g. "already-has-rubric", which is not
 * a failure - nothing was attempted because nothing needed to be). "orphan"
 * is its own kind because it names a real object left behind in Canvas, not
 * an outcome for any one target.
 */
export type RubricRunLogEntryKind =
  | "run-error"
  | "generation-failed"
  | "target-updated"
  | "target-skipped"
  | "target-failed"
  | "orphan";

const LOG_ENTRY_KINDS: readonly RubricRunLogEntryKind[] = [
  "run-error",
  "generation-failed",
  "target-updated",
  "target-skipped",
  "target-failed",
  "orphan",
];

/** Human labels for the panel and the CSV's "Event" column. The CSV carries
 * the label; the raw `kind` stays in the JSON export for anything that wants
 * to match on it. */
export const RUBRIC_RUN_LOG_EVENT_LABELS: Readonly<Record<RubricRunLogEntryKind, string>> = {
  "run-error": "Action failed",
  "generation-failed": "Generation failed (no Canvas write attempted)",
  "target-updated": "Rubric associated",
  "target-skipped": "Skipped",
  "target-failed": "Item failed",
  orphan: "Orphan rubric (created, not attached)",
};

/**
 * Every field is a plain string and always present, matching
 * repoGradesLog.ts's `RepoGradeLogEntry` precedent: the CSV writer below
 * emits one column per field unconditionally, so an optional field would
 * silently shift every later column on the rows that omit it.
 */
export interface RubricRunLogEntry {
  /** ISO 8601, supplied by the caller - see this file's header. */
  at: string;
  kind: RubricRunLogEntryKind;
  /** The target's own itemId (moduleId:itemId, see useBulkItemActions.ts's
   * `itemKey`) for a target-* entry, or "" for a run-level or orphan entry
   * (an orphan is not any one target's outcome - see `attemptedItemIds`). */
  itemId: string;
  /** The skip reason enum string, the failed outcome's own free-text reason,
   * or the run-level error/generation-failure text. "" for target-updated
   * and orphan entries, which carry no "why" of their own. */
  reason: string;
  /** The rubric id: the newly created rubric for target-updated/orphan, or
   * the pre-existing rubric's id for a target-skipped "already-has-rubric".
   * "" when no rubric was involved. */
  rubricId: string;
  rubricTitle: string;
  pointsPossible: string;
  /** Orphan-only: every item this rubric's association attempt was made
   * against (and failed for all of them), joined for one CSV/JSON cell. ""
   * for every other kind. */
  attemptedItemIds: string;
}

function baseEntry(at: string, kind: RubricRunLogEntryKind): RubricRunLogEntry {
  return { at, kind, itemId: "", reason: "", rubricId: "", rubricTitle: "", pointsPossible: "", attemptedItemIds: "" };
}

/**
 * B1.1/B1.2/B1.3/B1.4: one entry per TARGET the run considered (from the
 * same `outcomes` array `summarizeRubricGenerateOutcomes` reads), one entry
 * per orphan rubric (by id, from the same `orphans` array), and at most one
 * run-level entry for a whole-action error plus at most one for a
 * generation failure - both supplied by the caller from the exact fields
 * `BulkRubricGenerateReport.actionError`/`generationFailedReason` already
 * carry, never re-derived from anything else. Nothing here decides which
 * bucket an outcome falls in; `outcome.status`/`outcome.reason` are read
 * straight through.
 */
export function buildRubricRunLogEntries(
  outcomes: readonly RubricTargetOutcome[],
  orphans: readonly OrphanRubric[],
  runLevel: { actionError?: string; generationFailedReason?: string },
  at: string
): RubricRunLogEntry[] {
  const entries: RubricRunLogEntry[] = [];
  if (runLevel.actionError) {
    entries.push({ ...baseEntry(at, "run-error"), reason: runLevel.actionError });
  }
  if (runLevel.generationFailedReason) {
    entries.push({ ...baseEntry(at, "generation-failed"), reason: runLevel.generationFailedReason });
  }
  for (const outcome of outcomes) {
    if (outcome.status === "updated") {
      entries.push({
        ...baseEntry(at, "target-updated"),
        itemId: outcome.itemId,
        rubricId: String(outcome.rubricId),
        rubricTitle: outcome.rubricTitle,
        pointsPossible: String(outcome.pointsPossible),
      });
    } else if (outcome.status === "skipped") {
      entries.push({
        ...baseEntry(at, "target-skipped"),
        itemId: outcome.itemId,
        reason: outcome.reason,
        rubricId: outcome.existingRubricId != null ? String(outcome.existingRubricId) : "",
      });
    } else {
      entries.push({ ...baseEntry(at, "target-failed"), itemId: outcome.itemId, reason: outcome.reason });
    }
  }
  for (const orphan of orphans) {
    entries.push({
      ...baseEntry(at, "orphan"),
      rubricId: String(orphan.rubricId),
      rubricTitle: orphan.rubricTitle,
      pointsPossible: String(orphan.pointsPossible),
      attemptedItemIds: orphan.attemptedItemIds.join("; "),
    });
  }
  return entries;
}

/** Chosen to comfortably outlast many runs (a 40-item selection produces
 * ~40 entries in one run) while staying a trivial localStorage value,
 * matching MAX_REPO_GRADE_LOG_ENTRIES's identical reasoning (entry 333). */
export const MAX_RUBRIC_RUN_LOG_ENTRIES = 500;

export const EMPTY_RUBRIC_RUN_LOG: readonly RubricRunLogEntry[] = [];

/**
 * B2 item 6: returns a NEW oldest-first array with `entries` appended,
 * trimmed to MAX_RUBRIC_RUN_LOG_ENTRIES by dropping from the FRONT. A
 * second run must not erase the first - the orphans from run one are still
 * uncleaned - so appending (never replacing) is the only correct mutator,
 * and dropping the OLDEST rather than refusing the newest is what keeps the
 * log from going quiet during the long session that fills it. Never
 * mutates `log`.
 */
export function appendRubricRunLogEntries(
  log: readonly RubricRunLogEntry[],
  entries: readonly RubricRunLogEntry[]
): RubricRunLogEntry[] {
  if (entries.length === 0) return log.slice();
  const next = [...log, ...entries];
  return next.length <= MAX_RUBRIC_RUN_LOG_ENTRIES ? next : next.slice(next.length - MAX_RUBRIC_RUN_LOG_ENTRIES);
}

function parseOneEntry(raw: unknown): RubricRunLogEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const kind = record.kind;
  if (typeof kind !== "string" || !LOG_ENTRY_KINDS.includes(kind as RubricRunLogEntryKind)) return null;
  const text = (key: string): string | null => (typeof record[key] === "string" ? (record[key] as string) : null);
  const at = text("at");
  const itemId = text("itemId");
  const reason = text("reason");
  const rubricId = text("rubricId");
  const rubricTitle = text("rubricTitle");
  const pointsPossible = text("pointsPossible");
  const attemptedItemIds = text("attemptedItemIds");
  if (
    at === null ||
    itemId === null ||
    reason === null ||
    rubricId === null ||
    rubricTitle === null ||
    pointsPossible === null ||
    attemptedItemIds === null
  ) {
    return null;
  }
  return { at, kind: kind as RubricRunLogEntryKind, itemId, reason, rubricId, rubricTitle, pointsPossible, attemptedItemIds };
}

/**
 * B2: turns one stored value into entries, dropping anything that is not a
 * complete, correctly-typed entry rather than trusting it - a malformed
 * blob degrades to fewer entries, never a crash. Also applies the cap, so a
 * blob hand-edited to a million entries cannot make the view slow forever.
 */
export function parseRubricRunLogEntries(value: unknown): RubricRunLogEntry[] {
  if (!Array.isArray(value)) return [];
  const valid: RubricRunLogEntry[] = [];
  for (const raw of value) {
    const entry = parseOneEntry(raw);
    if (entry) valid.push(entry);
  }
  return valid.length <= MAX_RUBRIC_RUN_LOG_ENTRIES ? valid : valid.slice(valid.length - MAX_RUBRIC_RUN_LOG_ENTRIES);
}

export interface RubricRunLogSummary {
  total: number;
  updated: number;
  skipped: number;
  /** Merges all three failure kinds into one count for the panel's
   * "did anything go wrong" line - the underlying entries keep their
   * distinct `kind` (B1.4); only this display-only rollup combines them,
   * the same choice summarizeRepoGradeLog makes for its own "failed". */
  failed: number;
  orphans: number;
}

export function summarizeRubricRunLog(log: readonly RubricRunLogEntry[]): RubricRunLogSummary {
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let orphans = 0;
  for (const e of log) {
    if (e.kind === "target-updated") updated += 1;
    else if (e.kind === "target-skipped") skipped += 1;
    else if (e.kind === "target-failed" || e.kind === "run-error" || e.kind === "generation-failed") failed += 1;
    else if (e.kind === "orphan") orphans += 1;
  }
  return { total: log.length, updated, skipped, failed, orphans };
}

/** The most recent `count` entries, NEWEST FIRST - the reverse of the stored
 * order, matching recentRepoGradeLogEntries's identical reasoning: the panel
 * is a "did that just work" check, and the thing that just happened should
 * be the thing at the top. Never mutates. */
export function recentRubricRunLogEntries(log: readonly RubricRunLogEntry[], count: number): RubricRunLogEntry[] {
  if (count <= 0) return [];
  return log.slice(Math.max(0, log.length - count)).reverse();
}

const CSV_HEADER = ["Time", "Event", "Item", "Reason", "Rubric ID", "Rubric title", "Points", "Attempted items"];

/**
 * One header row then one row per entry, oldest first (the stored order - a
 * spreadsheet reader sorts it themselves, and chronological is how a run
 * actually happened). Every field goes through escapeCsvValue
 * (src/lib/course-tasks-view-csv.ts) rather than a new local escaper - a
 * rubric criterion description, and therefore a failure reason quoting one,
 * routinely contains a comma, a quote AND a newline. Rows are joined with
 * \r\n, matching formatRepoGradeLogCsv.
 */
export function formatRubricRunLogCsv(log: readonly RubricRunLogEntry[]): string {
  const rows = [CSV_HEADER.map(escapeCsvValue).join(",")];
  for (const entry of log) {
    rows.push(
      [
        entry.at,
        RUBRIC_RUN_LOG_EVENT_LABELS[entry.kind],
        entry.itemId,
        entry.reason,
        entry.rubricId,
        entry.rubricTitle,
        entry.pointsPossible,
        entry.attemptedItemIds,
      ]
        .map(escapeCsvValue)
        .join(",")
    );
  }
  return rows.join("\r\n");
}

/**
 * An OBJECT, never a bare array, matching formatRepoGradeLogJson's identical
 * reasoning: a later field (a schema version) can be added without breaking
 * anything already parsing these files.
 */
export function formatRubricRunLogJson(log: readonly RubricRunLogEntry[], meta: { exportedAt: string }): string {
  return JSON.stringify({ exportedAt: meta.exportedAt, entryCount: log.length, entries: log }, null, 2);
}

/** "2026-08-24T15:04:05.123Z" -> "20260824-150405". Colons and dots are not
 * safe in a Windows filename, matching repoGradesLog.ts's `fileStamp`. */
function fileStamp(atIso: string): string {
  const match = atIso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return atIso.replace(/[^0-9a-zA-Z]+/g, "-").replace(/^-+|-+$/g, "");
  const [, year, month, day, hour, minute, second] = match;
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

/**
 * "rubric-run-log-<YYYYMMDD-HHMMSS>.<ext>". Unlike repoGradeLogFileName this
 * carries no course-name segment: useBulkItemActions.ts (this feature's only
 * caller) has a `courseUrl` but never a course NAME - only ModulesView's own
 * caller resolves that, several boundaries up - so a course slug is left out
 * rather than invented from the URL. The log is already persisted per course
 * (rubricRunLogStore.ts), so a course's own entries never mix with
 * another's; only the downloaded filename itself does not name the course.
 */
export function rubricRunLogFileName(extension: string, atIso: string): string {
  return `rubric-run-log-${fileStamp(atIso)}.${extension}`;
}
