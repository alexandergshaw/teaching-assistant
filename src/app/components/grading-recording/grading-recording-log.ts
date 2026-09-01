// Grading from a screen recording - the downloadable run log. Pays the debt
// docs/DEV_LOOP.md's rule names ("all features should have a downloadable
// log ... enough information for humans or LLMs to debug an issue ...
// displayed in a prominent location") for this surface: it reads names off a
// screen, merges readings across overlapping frames, skips submissions it
// cannot attribute to a readable name, can drop frames under backpressure,
// and grades - every one of those is a silent-failure candidate with no
// trace anywhere else in the app once the session ends.
//
// STRUCTURE REUSED FROM src/app/components/recording/discussion-replies-log.ts
// (itself reused from src/lib/repo-grading-log.ts - both read in full before
// writing this file): pure functions, no I/O, no clock reads (every
// timestamp is supplied by the caller as data, never Date.now()/
// toISOString() called in here) so a test pins an exact rendered CSV/JSON
// rather than asserting around "now"; the CSV+JSON pairing built from one
// in-memory record; a slugified-name + YYYYMMDD-HHMMSS filename convention,
// reimplemented locally (not imported - both precedents already reimplement
// it locally rather than import each other's copy, for the same reason: a
// report filename needs the "always a valid filename" treatment, but the
// three logs are unrelated shapes with unrelated lifetimes); escapeCsvValue
// (src/lib/course-tasks-view-csv.ts) reused rather than a local escaper.
//
// THIS FILE IS NOT THOSE - it is a different, unrelated log for a different
// surface. Unlike a discussion-replies capture run (three event streams plus
// a reply-table snapshot) or a repo-grading workflow run (one entry per
// attempted repo), a grading-via-recording run has FOUR things worth logging
// separately: per-extraction-batch facts (frames sent, submissions
// extracted, added vs merged, skipped-unnamed), encode notices (a frame
// dropped even after a re-encode), grading-call attempts (blocked by
// readiness, a hard call failure, or a real per-row split of graded/failed),
// and the row table itself (grading-row.ts's GradingRow, snapshotted at
// download time).
//
// COLLECTION vs ASSEMBLY: GradingRecordingPanel.tsx (a component; vitest
// here is node-env and never renders one) is where the three event streams
// above are COLLECTED, as plain refs appended to at the moment each event
// happens - that part has no test surface and is verified by reading only.
// ASSEMBLY - turning a collected GradingRecordingLogInput plus the current
// GradingRow[] table into a complete GradingRecordingRunLog, and formatting
// that into CSV/JSON - is entirely in this file, which has no React import,
// so every formatting/aggregation decision here is exercised by a
// frozen-literal-oracle test.
//
// PERSONAL DATA: a downloaded copy of this log carries every student name as
// READ off the screen (never corrected against the roster - see
// grading-row.ts's own header on why `studentName` stays verbatim) and the
// roster-match verdict/candidates. It deliberately does NOT carry the
// submission text or the full generated feedback (strengths/improvements/
// overallComment) - only `totalScore` - so a reader debugging "did this
// student get graded, and what happened" never needs to hand over the
// student's actual submitted work or the model's full written comments to
// see it. No redaction option is offered here, matching this repo's other
// two shipped logs (discussion-replies-log.ts's own `author` field is
// equally unredacted) - the instructor already has these names on screen
// before ever touching Download, so this changes WHERE the names live
// (a file instead of a table), not whether the instructor already has them.
// Anyone forwarding this file is forwarding student names; that is a fact to
// state plainly, not a defect to design around here.

import { escapeCsvValue } from "@/lib/course-tasks-view-csv";
import type { GradingRow, GradingRowNameMatch, GradingRowState } from "./grading-row";

// ---------------------------------------------------------------------------
// Event-stream records. Each carries the ISO 8601 timestamp of the event -
// supplied by the collector (GradingRecordingPanel.tsx), never computed here.
// ---------------------------------------------------------------------------

/** One extraction request/response cycle. `submissionsExtracted` is what the
 * model returned for this batch (0 for a batch that errored outright);
 * `added`/`merged` are mergeExtractedSubmissions' own addedCount/mergedCount
 * for this batch (grading-submission-merge.ts) - passed in, never re-derived,
 * since only the caller that actually ran the merge has them.
 * `skippedUnnamed` is extractGradingSubmissionsAction's own count of
 * submissions that were visible but could not be attributed to a readable
 * name (R3) - real content the instructor captured that never became a row
 * at all, which is exactly the silent-failure class this field exists to
 * make legible. `confirmedEmpty` is a real "nothing here" the model itself
 * confirmed, not a silent non-event. `error` is the verbatim message when the
 * extraction call itself failed - never "an error occurred" - and `""`
 * otherwise. */
export interface GradingRecordingLogBatch {
  at: string;
  framesInBatch: number;
  submissionsExtracted: number;
  added: number;
  merged: number;
  skippedUnnamed: number;
  confirmedEmpty: boolean;
  error: string;
}

/** Builds one GradingRecordingLogBatch. Every field but `at`/`framesInBatch`
 * defaults to its "nothing happened" value, so a call site only names what is
 * actually non-default for its branch (mirrors
 * makeDiscussionRepliesLogBatch's own default-filling shape). */
export function makeGradingRecordingLogBatch(args: {
  at: string;
  framesInBatch: number;
  submissionsExtracted?: number;
  added?: number;
  merged?: number;
  skippedUnnamed?: number;
  confirmedEmpty?: boolean;
  error?: string;
}): GradingRecordingLogBatch {
  return {
    at: args.at,
    framesInBatch: args.framesInBatch,
    submissionsExtracted: args.submissionsExtracted ?? 0,
    added: args.added ?? 0,
    merged: args.merged ?? 0,
    skippedUnnamed: args.skippedUnnamed ?? 0,
    confirmedEmpty: args.confirmedEmpty ?? false,
    error: args.error ?? "",
  };
}

/** One "a captured frame was too large to send even after re-encoding it at
 * a lower quality, and was dropped" event (useDiscussionCapture.ts's own
 * frameEncodeNotice) - collected every time that notice fires (it can fire
 * more than once per session; useDiscussionCapture.ts only ever exposes the
 * MOST RECENT one as live state), so a session that hit it three times shows
 * all three here even though the panel only ever displayed the last one. */
export interface GradingRecordingLogEncodeNotice {
  at: string;
  text: string;
}

/** One "Grade submissions" click's outcome. `blocked` is true when
 * checkGradingReadiness (grading-dispatch.ts) refused to even attempt the
 * call (no rubric, no rows) - `reason` carries its exact refusal message and
 * `graded`/`failed` are both 0, since nothing was attempted. `error` is the
 * verbatim message when the call itself failed outright (network/model
 * failure covering the whole batch, not a per-row result) - distinct from a
 * per-row failure, which lands in the row snapshot's own `error` field
 * instead (classifyGradingResult already turns those into "failed" rows with
 * a verbatim message; this event only needs the aggregate split so a reader
 * can see "N graded, M failed" per attempt without re-deriving it from the
 * row table's CURRENT state, which a later edit or re-grade could have since
 * changed). */
export interface GradingRecordingLogGradingRun {
  at: string;
  rowCount: number;
  blocked: boolean;
  reason: string;
  error: string;
  graded: number;
  failed: number;
}

/** One reply row's - here, one submission row's - full debugging picture,
 * read from the live GradingRow at the moment the log is built (download
 * time) - never accumulated as its own event stream, since every field here
 * is already the row's current, persisted truth (mirrors
 * buildDiscussionRepliesLogRowEntry's own reasoning). Deliberately excludes
 * `submissionText` and the full feedback fields (strengths/improvements/
 * overallComment) - see this file's header for why. */
export interface GradingRecordingLogRowEntry {
  rowId: string;
  studentName: string;
  nameMatch: GradingRowNameMatch;
  rosterCandidates: readonly string[];
  state: GradingRowState;
  userEdited: boolean;
  totalScore: string;
  error: string;
}

export function buildGradingRecordingLogRowEntry(row: GradingRow): GradingRecordingLogRowEntry {
  return {
    rowId: row.id,
    studentName: row.studentName,
    nameMatch: row.nameMatch,
    rosterCandidates: row.rosterCandidates,
    state: row.state,
    userEdited: row.userEdited,
    totalScore: row.totalScore,
    error: row.error,
  };
}

/** What GradingRecordingPanel.tsx collects, before the `rows` snapshot is
 * built. `startedAt` is the first time capture ever started this panel
 * mount; `endedAt` is the most recent capture stop - both `""` when that has
 * never happened. `courseName`/`rubricPresent`/`knowledgeContextPresent` are
 * the run's CURRENT settings, read fresh at download time (never
 * accumulated) - the same posture DiscussionRepliesLogInput's own
 * audience/courseName/ingredients/formality take, since these are session
 * settings, not per-event facts. `batches`/`encodeNotices`/`gradingRuns`
 * accumulate for the panel's whole mounted lifetime. */
export interface GradingRecordingLogInput {
  startedAt: string;
  endedAt: string;
  courseName: string;
  rubricPresent: boolean;
  knowledgeContextPresent: boolean;
  droppedFrames: number;
  batches: readonly GradingRecordingLogBatch[];
  encodeNotices: readonly GradingRecordingLogEncodeNotice[];
  gradingRuns: readonly GradingRecordingLogGradingRun[];
}

export interface GradingRecordingRunLog extends GradingRecordingLogInput {
  rows: GradingRecordingLogRowEntry[];
}

/** Assembles the full run record. `rawRows` is used in the order given
 * (never reordered/filtered) - the caller is expected to pass the UNFILTERED
 * table (useGradingRows' `rawRows`, never the display-filtered `rows`), the
 * same discipline buildDiscussionRepliesRunLog documents for the same
 * reason: a log built off a stale search-box filter must not silently omit
 * rows an instructor cannot currently see. */
export function buildGradingRecordingRunLog(
  input: GradingRecordingLogInput,
  rawRows: ReadonlyArray<GradingRow>
): GradingRecordingRunLog {
  return { ...input, rows: rawRows.map(buildGradingRecordingLogRowEntry) };
}

// ---------------------------------------------------------------------------
// Summary - the counts that make a silent failure legible, per docs/DEV_LOOP.md's
// rule. Exhaustive over GradingRowState (a `never` check, not a catch-all
// `else`), mirroring summarizeDiscussionRepliesRunLog's own reasoning
// (REGRESSION entry 370's S2: a catch-all `else` silently miscounted a state
// nobody had added a branch for yet).
// ---------------------------------------------------------------------------

export interface GradingRecordingLogSummary {
  totalRows: number;
  pending: number;
  grading: number;
  ready: number;
  failed: number;
  userEditedRows: number;
  batchesSent: number;
  submissionsExtractedTotal: number;
  addedTotal: number;
  mergedTotal: number;
  skippedUnnamedTotal: number;
  droppedFrames: number;
  encodeNoticeCount: number;
  gradingRunsTotal: number;
  gradingRunsBlocked: number;
  gradingRunsErrored: number;
}

export function summarizeGradingRecordingRunLog(log: GradingRecordingRunLog): GradingRecordingLogSummary {
  let pending = 0;
  let grading = 0;
  let ready = 0;
  let failed = 0;
  let userEditedRows = 0;
  for (const row of log.rows) {
    switch (row.state) {
      case "pending":
        pending += 1;
        break;
      case "grading":
        grading += 1;
        break;
      case "ready":
        ready += 1;
        break;
      case "failed":
        failed += 1;
        break;
      default: {
        const exhaustive: never = row.state;
        throw new Error(`Unhandled grading row state: ${String(exhaustive)}`);
      }
    }
    if (row.userEdited) userEditedRows += 1;
  }

  let submissionsExtractedTotal = 0;
  let addedTotal = 0;
  let mergedTotal = 0;
  let skippedUnnamedTotal = 0;
  for (const batch of log.batches) {
    submissionsExtractedTotal += batch.submissionsExtracted;
    addedTotal += batch.added;
    mergedTotal += batch.merged;
    skippedUnnamedTotal += batch.skippedUnnamed;
  }

  let gradingRunsBlocked = 0;
  let gradingRunsErrored = 0;
  for (const run of log.gradingRuns) {
    if (run.blocked) gradingRunsBlocked += 1;
    else if (run.error) gradingRunsErrored += 1;
  }

  return {
    totalRows: log.rows.length,
    pending,
    grading,
    ready,
    failed,
    userEditedRows,
    batchesSent: log.batches.length,
    submissionsExtractedTotal,
    addedTotal,
    mergedTotal,
    skippedUnnamedTotal,
    droppedFrames: log.droppedFrames,
    encodeNoticeCount: log.encodeNotices.length,
    gradingRunsTotal: log.gradingRuns.length,
    gradingRunsBlocked,
    gradingRunsErrored,
  };
}

/** The one-line summary shown above the download buttons - mirrors
 * discussionRepliesLogSummaryLine's own phrasing on this surface's own
 * event vocabulary. Never gated on `totalRows > 0` - a run that captured
 * nothing still gets a true, useful sentence, which is exactly the FAILED-run
 * case docs/DEV_LOOP.md's placement rule exists for. */
export function gradingRecordingLogSummaryLine(summary: GradingRecordingLogSummary): string {
  const batchWord = summary.batchesSent === 1 ? "batch" : "batches";
  const rowWord = summary.totalRows === 1 ? "submission" : "submissions";
  const parts = [
    `${summary.totalRows} ${rowWord} captured across ${summary.batchesSent} ${batchWord} - ` +
      `${summary.ready} graded, ${summary.failed} failed, ${summary.pending} never graded, ${summary.userEditedRows} edited by hand.`,
  ];
  if (summary.skippedUnnamedTotal > 0) {
    parts.push(
      `${summary.skippedUnnamedTotal} submission${summary.skippedUnnamedTotal === 1 ? "" : "s"} skipped for an unreadable name.`
    );
  }
  if (summary.droppedFrames > 0) {
    parts.push(`${summary.droppedFrames} frame${summary.droppedFrames === 1 ? "" : "s"} dropped.`);
  }
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// CSV. Every field goes through escapeCsvValue, reused rather than a new
// local escaper - see this file's header. Rows joined with \r\n. Five
// sections in one file, matching formatDiscussionRepliesLogCsv's own
// multi-section shape for the same reason: run-level facts, a per-batch
// history, an encode-notice history, a per-grading-attempt history AND a
// per-row table are each separately load-bearing here.
// ---------------------------------------------------------------------------

const RUN_CSV_HEADER = ["Field", "Value"];
const BATCH_CSV_HEADER = ["At", "Frames in batch", "Submissions extracted", "Added", "Merged", "Skipped unnamed", "Confirmed empty", "Error"];
const ENCODE_NOTICE_CSV_HEADER = ["At", "Text"];
const GRADING_RUN_CSV_HEADER = ["At", "Row count", "Blocked", "Reason", "Error", "Graded", "Failed"];
const ROW_CSV_HEADER = ["Row ID", "Student name", "Name match", "Roster candidates", "State", "User edited", "Total score", "Error"];

function csvRow(values: readonly string[]): string {
  return values.map(escapeCsvValue).join(",");
}

const yesNo = (b: boolean): string => (b ? "Yes" : "No");

export function formatGradingRecordingLogCsv(log: GradingRecordingRunLog): string {
  const lines: string[] = [];

  lines.push(csvRow(["=== Run ==="]));
  lines.push(csvRow(RUN_CSV_HEADER));
  lines.push(csvRow(["Started", log.startedAt]));
  lines.push(csvRow(["Ended", log.endedAt]));
  lines.push(csvRow(["Course", log.courseName]));
  lines.push(csvRow(["Rubric present", yesNo(log.rubricPresent)]));
  lines.push(csvRow(["Knowledge Base context present", yesNo(log.knowledgeContextPresent)]));
  lines.push(csvRow(["Dropped frames", String(log.droppedFrames)]));

  lines.push("");
  lines.push(csvRow(["=== Batches ==="]));
  lines.push(csvRow(BATCH_CSV_HEADER));
  for (const b of log.batches) {
    lines.push(
      csvRow([
        b.at,
        String(b.framesInBatch),
        String(b.submissionsExtracted),
        String(b.added),
        String(b.merged),
        String(b.skippedUnnamed),
        yesNo(b.confirmedEmpty),
        b.error,
      ])
    );
  }

  lines.push("");
  lines.push(csvRow(["=== Encode notices ==="]));
  lines.push(csvRow(ENCODE_NOTICE_CSV_HEADER));
  for (const n of log.encodeNotices) {
    lines.push(csvRow([n.at, n.text]));
  }

  lines.push("");
  lines.push(csvRow(["=== Grading runs ==="]));
  lines.push(csvRow(GRADING_RUN_CSV_HEADER));
  for (const g of log.gradingRuns) {
    lines.push(
      csvRow([g.at, String(g.rowCount), yesNo(g.blocked), g.reason, g.error, String(g.graded), String(g.failed)])
    );
  }

  lines.push("");
  lines.push(csvRow(["=== Rows ==="]));
  lines.push(csvRow(ROW_CSV_HEADER));
  for (const row of log.rows) {
    lines.push(
      csvRow([
        row.rowId,
        row.studentName,
        row.nameMatch,
        row.rosterCandidates.join("; "),
        row.state,
        yesNo(row.userEdited),
        row.totalScore,
        row.error,
      ])
    );
  }

  return lines.join("\r\n");
}

/** The exhaustive JSON export - an OBJECT (never a bare array), same
 * reasoning as formatDiscussionRepliesLogJson/formatRepoGradingLogJson. */
export function formatGradingRecordingLogJson(log: GradingRecordingRunLog, meta: { exportedAt: string }): string {
  return JSON.stringify({ exportedAt: meta.exportedAt, ...log }, null, 2);
}

// ---------------------------------------------------------------------------
// Filename. Reimplements the slugify/fileStamp shape locally - see this
// file's header for why that is reuse-of-idiom, not reinvention.
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fileStamp(atIso: string): string {
  const match = atIso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!match) return atIso.replace(/[^0-9a-zA-Z]+/g, "-").replace(/^-+|-+$/g, "");
  const [, year, month, day, hour, minute, second] = match;
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

/** `grading-recording-log-<course-slug>-<YYYYMMDD-HHMMSS>.<ext>`. A course
 * name that slugs to nothing (blank, no course selected) drops that segment
 * entirely rather than emitting a dangling double dash - same rule as
 * discussionRepliesLogFileName/repoGradingLogFileName. */
export function gradingRecordingLogFileName(courseName: string, extension: string, atIso: string): string {
  const slug = slugify(courseName);
  const parts = ["grading-recording-log", slug, fileStamp(atIso)].filter((part) => part !== "");
  return `${parts.join("-")}.${extension}`;
}
