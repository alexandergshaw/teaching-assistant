// Discussion replies (Manual > Recording > Discussions) - the downloadable
// run log. Pays the debt docs/REGRESSION.md entries 369, 372, 373 and 374
// each record: "This surface still owes a downloadable log" under the rule
// now in docs/DEV_LOOP.md ("all features should have a downloadable log ...
// enough information for humans or LLMs to debug an issue ... displayed in a
// prominent location").
//
// STRUCTURE REUSED FROM src/lib/repo-grading-log.ts (this repo's existing,
// shipped downloadable-log implementation - read in full before writing this
// file): pure functions, no I/O, no clock reads (every function takes the
// timestamp(s) it needs as data, never calls Date.now()/Date.now().toISOString()
// itself) - so a test pins an exact rendered CSV/JSON rather than asserting
// around "now". CSV+JSON pairing, both built from the same in-memory record.
// A slugified-name + YYYYMMDD-HHMMSS filename convention, reimplemented here
// (not imported - repo-grading-log.ts's slugify/fileStamp are module-private)
// for the same reason that file's own header gives for not importing
// repoGradesLog.ts's copy: a report filename needs the same "always a valid
// filename" treatment, but the two logs are unrelated shapes with unrelated
// lifetimes.
//
// THIS FILE IS NOT THAT ONE - it is a different, unrelated log for a
// different surface (a live screen-capture session, not a batch grading
// run), so the record shape is new: a discussion-replies capture run has no
// notion of "one entry per attempted repo". Instead it has three event
// streams that accumulate over the panel's lifetime (batches sent to the
// extraction model, notices shown to the instructor, per-row retries) plus a
// point-in-time snapshot of the reply table - see `DiscussionRepliesRunLog`
// below for exactly what that covers and why.
//
// COLLECTION vs ASSEMBLY: useDiscussionReplies.ts (a hook; vitest here is
// node-env and never renders one) is where the three event streams above are
// COLLECTED, as plain refs appended to at the moment each event happens -
// that part has no test surface and is verified by reading only. ASSEMBLY -
// turning a collected `DiscussionRepliesLogInput` plus the current
// `rawRows` table into a complete `DiscussionRepliesRunLog`, and formatting
// that into CSV/JSON - is entirely in this file, which has no React import,
// so every formatting/aggregation decision here is exercised by a frozen-
// literal-oracle test.
//
// PARENT RESOLUTION IS RECOMPUTED, NEVER A SECOND COPY: `resolveDraftParent`
// (discussion-capture.ts, re-exported by discussion-thread.ts) is the exact
// function discussion-draft-loop.ts's `runDraftLoop` calls to decide whether
// a reply's parent goes into the drafting prompt (T6 in
// docs/discussion-thread-structure-acceptance-criteria.md). This module
// calls the SAME function, over the SAME `rawRows` table, to answer "did a
// parent resolve for this row" in the log - never a second, hand-rolled
// re-implementation of T6's "exactly one match" rule that could silently
// drift from the one that actually governs what the model sees (the class of
// defect REGRESSION entry 372 names "the seventh instance": a value computed
// twice where the tested copy is not the live one).

import { resolveDraftParent, type ReplyRow, type ReplyRowState } from "./discussion-capture";
import { escapeCsvValue } from "@/lib/course-tasks-view-csv";
// F7 fix (fixer pass, RC4/RC7): the "; " concepts joiner is owned by
// discussion-serialization.ts, not restated here - see that file's own
// comment on `CONCEPT_JOINER`.
import { CONCEPT_JOINER } from "./discussion-serialization";

// ---------------------------------------------------------------------------
// Event-stream records. Each carries the ISO 8601 timestamp of the event -
// supplied by the collector (useDiscussionReplies.ts), never computed here.
// ---------------------------------------------------------------------------

/** One extraction request/response cycle (AC10/AC10a in
 * docs/discussion-reply-capture-acceptance-criteria.md). `postsExtracted` is
 * what the model returned for this batch; `postsAdded` is how many became
 * NEW rows (mergeCapturedPosts' own `addedIds`); `postsDuplicate` is the
 * remainder - posts the model saw that matched an already-captured row
 * (`postsExtracted - postsAdded`, never a separately-counted, possibly-
 * drifting value) - EXCEPT for a `discarded` batch (see below), which never
 * reached the merge step at all, so none of its posts were ever compared
 * against the table and none of them are duplicates; `postsDuplicate` is
 * forced to 0 for a discarded batch, and its `postsExtracted` posts are
 * counted only in the discarded tally (`DiscussionRepliesLogSummary`'s
 * `postsDiscardedTotal`), never folded into the duplicate count. `capped` is
 * BL5's "the table was already at MAX_TABLE_ROWS" flag. `discarded` is a
 * fact this log adds that nothing else surfaces: the table's epoch changed
 * (Delete table / Redraft every reply) while this batch's response was in
 * flight, so `useDiscussionReplies.ts`'s own epoch guard silently drops the
 * whole response - a batch that really happened, produced real posts, and
 * left no other trace anywhere in the app. Those posts were thrown away, not
 * found-to-be-duplicates - conflating the two would overstate the duplicate
 * count by exactly the number an instructor would use to judge whether
 * extraction is working. `error` is the verbatim message when the
 * extraction call itself failed - never "an error occurred" - and `""`
 * otherwise; a batch is never BOTH `discarded` and carrying a non-empty
 * `error`, since a discarded batch is one that returned successfully but
 * arrived too late to apply. */
export interface DiscussionRepliesLogBatch {
  at: string;
  framesInBatch: number;
  postsExtracted: number;
  postsAdded: number;
  postsDuplicate: number;
  capped: boolean;
  discarded: boolean;
  error: string;
}

/** Builds one `DiscussionRepliesLogBatch`, deriving `postsDuplicate` from
 * `postsExtracted - postsAdded` rather than leaving the caller to compute
 * (and possibly drift) that subtraction at each of useDiscussionReplies.ts's
 * four call sites (the error branch, the discarded-by-epoch branch, the
 * nothing-found branch, and the real merge) - EXCEPT a discarded batch,
 * which is forced to `postsDuplicate: 0` regardless of `postsExtracted`/
 * `postsAdded`: a discarded batch never reached the merge step
 * (`useDiscussionReplies.ts` drops the whole response before calling
 * `mergeIncoming`), so none of its posts were ever compared against the
 * table, and `postsAdded` is always the collection site's default `0` for
 * that branch - without this override, `postsExtracted - 0` would count
 * every discarded post as a duplicate, which is not what happened to them.
 * Every field but `at`/`framesInBatch` defaults to its "nothing happened"
 * value, so a call site only names what is actually non-default for its
 * branch. */
export function makeDiscussionRepliesLogBatch(args: {
  at: string;
  framesInBatch: number;
  postsExtracted?: number;
  postsAdded?: number;
  capped?: boolean;
  discarded?: boolean;
  error?: string;
}): DiscussionRepliesLogBatch {
  const postsExtracted = args.postsExtracted ?? 0;
  const postsAdded = args.postsAdded ?? 0;
  const discarded = args.discarded ?? false;
  return {
    at: args.at,
    framesInBatch: args.framesInBatch,
    postsExtracted,
    postsAdded,
    postsDuplicate: discarded ? 0 : postsExtracted - postsAdded,
    capped: args.capped ?? false,
    discarded,
    error: args.error ?? "",
  };
}

/** One notice actually shown to the instructor - logged at the same point
 * `pushNotice` decides to show it (after its own consecutive-duplicate
 * dedupe), so a repeated failure collapsed to one visible notice in the UI
 * is also collapsed to one entry here, and the notices list here is never
 * longer than what was genuinely shown. Unlike the panel's own `notices`
 * state (capped to the most recent four, AC38), this list is never
 * truncated - a run that hit the same failure eight times must show all
 * eight in the log even though the UI only ever displayed the last four. */
export interface DiscussionRepliesLogNotice {
  at: string;
  text: string;
}

/** One explicit Retry click on a failed row (S1's targeted, forced dispatch
 * path in discussion-capture.ts's `draftDispatchForce`). Recorded so the log
 * can answer "was this failure retried, and did the retry itself fail too" -
 * a row's OWN final state never carries "this was retried" on its own. */
export interface DiscussionRepliesLogRetry {
  at: string;
  rowId: string;
}

/** One reply row's full debugging picture, read from the live `ReplyRow` at
 * the moment the log is built (download time) - never accumulated as its own
 * event stream, since every field here is already the row's current,
 * persisted truth. `threadPosition`/`replyingToAuthor` are `""` when absent
 * (T1a: absence and `"unknown"` already render identically to the
 * instructor, so the log does not invent a distinction the UI does not
 * make). `parentResolved` is answered by `resolveDraftParent` - see this
 * file's header for why that is a call, never a re-derivation. `error` and
 * `resourceError` are the verbatim stored messages, `""` when unset.
 * `concepts`/`resourceQuery`/`resourceQuerySource`
 * (docs/reply-resource-concepts-acceptance-criteria.md RC7) are the row's own
 * search provenance - `[]`/`""`/`""` when absent, the same discipline every
 * other optional field on this entry already follows, so the instructor can
 * tell "terms were used and then cleared by an edit" from "no terms existed"
 * by reading `resourceQuerySource` against an empty `concepts` column. */
export interface DiscussionRepliesLogRowEntry {
  rowId: string;
  author: string;
  threadPosition: "root" | "reply" | "unknown" | "";
  replyingToAuthor: string;
  parentResolved: boolean;
  draftState: ReplyRowState;
  userEdited: boolean;
  retried: boolean;
  error: string;
  resourceState: "idle" | "searching" | "done" | "failed" | "";
  resourceError: string;
  concepts: string[];
  resourceQuery: string;
  resourceQuerySource: string;
}

/** What `useDiscussionReplies.ts` collects, before the `rows` snapshot is
 * built. `startedAt` is the first time `start()` was ever called this page
 * load; `endedAt` is the most recent `stop()` - both `""` when that has
 * never happened. `batches`/`notices`/`retries` accumulate for the panel's
 * WHOLE lifetime (not reset per capture session): a returning instructor
 * debugging "why did my reply fail" needs the notice and batch history from
 * however many Start/Stop cycles it took to get there, not just the most
 * recent one. */
export interface DiscussionRepliesLogInput {
  startedAt: string;
  endedAt: string;
  audience: string;
  courseName: string;
  ingredients: readonly string[];
  addressByName: boolean;
  formality: string;
  framesCaptured: number;
  droppedFrames: number;
  stalled: boolean;
  batches: readonly DiscussionRepliesLogBatch[];
  notices: readonly DiscussionRepliesLogNotice[];
  retries: readonly DiscussionRepliesLogRetry[];
}

/** The whole run record: everything `DiscussionRepliesLogInput` collects,
 * plus the per-row snapshot built from the current table. */
export interface DiscussionRepliesRunLog extends DiscussionRepliesLogInput {
  rows: DiscussionRepliesLogRowEntry[];
}

// ---------------------------------------------------------------------------
// Assembly.
// ---------------------------------------------------------------------------

/** Builds one row's log entry. Exported on its own (not only through
 * `buildDiscussionRepliesRunLog`) so a test can pin its output against a
 * single frozen `ReplyRow` without constructing a whole run. */
export function buildDiscussionRepliesLogRowEntry(
  row: ReplyRow,
  rawRows: ReadonlyArray<ReplyRow>,
  retriedIds: ReadonlySet<string>
): DiscussionRepliesLogRowEntry {
  const parent = resolveDraftParent(row, rawRows);
  return {
    rowId: row.id,
    author: row.author,
    threadPosition: row.threadPosition ?? "",
    replyingToAuthor: row.replyingToAuthor ?? "",
    parentResolved: parent !== undefined,
    draftState: row.state,
    userEdited: row.userEdited,
    retried: retriedIds.has(row.id),
    error: row.error ?? "",
    resourceState: row.resourceState ?? "",
    resourceError: row.resourceError ?? "",
    concepts: row.concepts ?? [],
    resourceQuery: row.resourceQuery ?? "",
    resourceQuerySource: row.resourceQuerySource ?? "",
  };
}

/** Assembles the full run record. `rawRows` is used in the order given
 * (never reordered/filtered) - the caller is expected to pass the UNFILTERED
 * table (`rawRows`, never the display-filtered `rows`), the same discipline
 * this feature's own dispatch sites follow (F0-2/F11 in
 * docs/discussion-reply-sort-filter-acceptance-criteria.md) - a log built off
 * a stale search-box filter must not silently omit rows an instructor cannot
 * currently see. */
export function buildDiscussionRepliesRunLog(
  input: DiscussionRepliesLogInput,
  rawRows: ReadonlyArray<ReplyRow>
): DiscussionRepliesRunLog {
  const retriedIds = new Set(input.retries.map((r) => r.rowId));
  const rows = rawRows.map((row) => buildDiscussionRepliesLogRowEntry(row, rawRows, retriedIds));
  return { ...input, rows };
}

// ---------------------------------------------------------------------------
// Summary - the counts that make a silent failure legible, per docs/DEV_LOOP.md's
// rule. Exhaustive over `ReplyRowState` (a `never` check, not a catch-all
// `else`) for the same reason src/lib/repo-grading-log.ts's own
// `summarizeRepoGradingRunLog` is: REGRESSION entry 370's S2 records a
// catch-all `else` silently miscounting a state nobody had added a branch
// for yet. A `"drafting"` row can appear in a snapshot taken mid-capture
// (the only state genuinely in flight); it is its own bucket rather than
// folded into `neverDrafted` or lost, so the four counts always sum to
// `totalRows`.
// ---------------------------------------------------------------------------

export interface DiscussionRepliesLogSummary {
  totalRows: number;
  neverDrafted: number;
  drafting: number;
  ready: number;
  failed: number;
  retriedRows: number;
  batchesSent: number;
  framesCaptured: number;
  postsExtractedTotal: number;
  postsAddedTotal: number;
  // Sum of `postsDuplicate` across every batch. Never includes a discarded
  // batch's posts - see `makeDiscussionRepliesLogBatch`'s header for why a
  // thrown-away batch's posts are not duplicates.
  postsDuplicateTotal: number;
  cappedBatches: number;
  discardedBatches: number;
  // Sum of `postsExtracted` across only the batches whose `discarded` flag
  // is set - the tally a discarded batch's posts belong in instead of
  // `postsDuplicateTotal`.
  postsDiscardedTotal: number;
  noticeCount: number;
  droppedFrames: number;
}

export function summarizeDiscussionRepliesRunLog(log: DiscussionRepliesRunLog): DiscussionRepliesLogSummary {
  let neverDrafted = 0;
  let drafting = 0;
  let ready = 0;
  let failed = 0;
  let retriedRows = 0;
  for (const row of log.rows) {
    switch (row.draftState) {
      case "pending":
        neverDrafted += 1;
        break;
      case "drafting":
        drafting += 1;
        break;
      case "ready":
        ready += 1;
        break;
      case "failed":
        failed += 1;
        break;
      default: {
        const exhaustive: never = row.draftState;
        throw new Error(`Unhandled discussion reply draft state: ${String(exhaustive)}`);
      }
    }
    if (row.retried) retriedRows += 1;
  }

  let postsExtractedTotal = 0;
  let postsAddedTotal = 0;
  let postsDuplicateTotal = 0;
  let cappedBatches = 0;
  let discardedBatches = 0;
  let postsDiscardedTotal = 0;
  for (const batch of log.batches) {
    postsExtractedTotal += batch.postsExtracted;
    postsAddedTotal += batch.postsAdded;
    postsDuplicateTotal += batch.postsDuplicate;
    if (batch.capped) cappedBatches += 1;
    if (batch.discarded) {
      discardedBatches += 1;
      postsDiscardedTotal += batch.postsExtracted;
    }
  }

  return {
    totalRows: log.rows.length,
    neverDrafted,
    drafting,
    ready,
    failed,
    retriedRows,
    batchesSent: log.batches.length,
    framesCaptured: log.framesCaptured,
    postsExtractedTotal,
    postsAddedTotal,
    postsDuplicateTotal,
    cappedBatches,
    discardedBatches,
    postsDiscardedTotal,
    noticeCount: log.notices.length,
    droppedFrames: log.droppedFrames,
  };
}

/** The one-line summary shown above the download buttons - mirrors
 * src/app/components/drafted-grades/repoGradingLogPanel.helpers.ts's
 * `repoGradingLogSummaryLine` phrasing (attempted/outcome-split-first) on
 * this surface's own event vocabulary. Never gated on `totalRows > 0` - a
 * run that captured nothing still gets a true, useful sentence ("0 replies
 * captured across 0 batches"), which is exactly the FAILED-run case
 * docs/DEV_LOOP.md's placement rule exists for. */
export function discussionRepliesLogSummaryLine(summary: DiscussionRepliesLogSummary): string {
  const batchWord = summary.batchesSent === 1 ? "batch" : "batches";
  const replyWord = summary.totalRows === 1 ? "reply" : "replies";
  const noticeWord = summary.noticeCount === 1 ? "notice" : "notices";
  // Discarded posts are appended ONLY when there are any, so the ordinary
  // sentence is unchanged and stays the frozen oracle the tests pin. They
  // earn a place in the on-screen line - rather than living only in the
  // downloaded file - because a discarded batch is posts that were read off
  // the screen and then silently thrown away when the table was deleted or a
  // redraft bumped the epoch. That is precisely the "why are posts missing?"
  // question an instructor would open this log to answer, and nothing else in
  // the UI says it happened at all.
  const discarded =
    summary.postsDiscardedTotal > 0
      ? ` ${summary.postsDiscardedTotal} extracted post${summary.postsDiscardedTotal === 1 ? " was" : "s were"} discarded before reaching the table.`
      : "";
  return (
    `${summary.totalRows} ${replyWord} captured across ${summary.batchesSent} ${batchWord} - ` +
    `${summary.ready} drafted, ${summary.failed} failed, ${summary.neverDrafted} never drafted, ` +
    `${summary.retriedRows} retried, ${summary.noticeCount} ${noticeWord}.${discarded}`
  );
}

// ---------------------------------------------------------------------------
// CSV. Every field goes through escapeCsvValue (src/lib/course-tasks-view-csv.ts),
// reused rather than a new local escaper - the same discipline
// src/lib/repo-grading-log.ts's own formatRepoGradingLogCsv documents (see
// REGRESSION entry 267 check 4 / entry 333). Rows joined with \r\n, matching
// that file.
//
// FOUR SECTIONS IN ONE FILE, not one flat per-row table: unlike a repo-
// grading run (one entry per attempted repo, nothing else to say), this
// surface's own debugging bar (docs/DEV_LOOP.md, and this task's brief)
// names run-level facts, a per-batch history AND a per-row table as each
// separately load-bearing - flattening the batch/notice history into extra
// columns on the per-row table would either duplicate it onto every row or
// lose it outright. Each section is a normal CSV table (its own header row);
// a single-cell `=== Name ===` row marks where one starts, which is valid
// CSV (a row with one field) and reads immediately in a text editor or a
// spreadsheet.
// ---------------------------------------------------------------------------

const RUN_CSV_HEADER = ["Field", "Value"];
const BATCH_CSV_HEADER = ["At", "Frames in batch", "Posts extracted", "Posts added", "Posts duplicate", "Capped", "Discarded", "Error"];
const NOTICE_CSV_HEADER = ["At", "Text"];
const RETRY_CSV_HEADER = ["At", "Row ID"];
const ROW_CSV_HEADER = [
  "Row ID",
  "Author",
  "Thread position",
  "Replying to",
  "Parent resolved",
  "Draft state",
  "User edited",
  "Retried",
  "Error",
  "Resource state",
  "Resource error",
  "Search terms",
  "Resource search text",
  "Resource search source",
];

function csvRow(values: readonly string[]): string {
  return values.map(escapeCsvValue).join(",");
}

const yesNo = (b: boolean): string => (b ? "Yes" : "No");

export function formatDiscussionRepliesLogCsv(log: DiscussionRepliesRunLog): string {
  const lines: string[] = [];

  lines.push(csvRow(["=== Run ==="]));
  lines.push(csvRow(RUN_CSV_HEADER));
  lines.push(csvRow(["Started", log.startedAt]));
  lines.push(csvRow(["Ended", log.endedAt]));
  lines.push(csvRow(["Audience", log.audience]));
  lines.push(csvRow(["Course", log.courseName]));
  lines.push(csvRow(["Ingredients", log.ingredients.join(", ")]));
  lines.push(csvRow(["Address by first name", yesNo(log.addressByName)]));
  lines.push(csvRow(["Formality", log.formality]));
  lines.push(csvRow(["Frames captured", String(log.framesCaptured)]));
  lines.push(csvRow(["Batches sent", String(log.batches.length)]));
  lines.push(csvRow(["Dropped frames", String(log.droppedFrames)]));
  lines.push(csvRow(["Stalled at export time", yesNo(log.stalled)]));

  lines.push("");
  lines.push(csvRow(["=== Batches ==="]));
  lines.push(csvRow(BATCH_CSV_HEADER));
  for (const b of log.batches) {
    lines.push(
      csvRow([
        b.at,
        String(b.framesInBatch),
        String(b.postsExtracted),
        String(b.postsAdded),
        String(b.postsDuplicate),
        yesNo(b.capped),
        yesNo(b.discarded),
        b.error,
      ])
    );
  }

  lines.push("");
  lines.push(csvRow(["=== Notices ==="]));
  lines.push(csvRow(NOTICE_CSV_HEADER));
  for (const n of log.notices) {
    lines.push(csvRow([n.at, n.text]));
  }

  lines.push("");
  lines.push(csvRow(["=== Retries ==="]));
  lines.push(csvRow(RETRY_CSV_HEADER));
  for (const r of log.retries) {
    lines.push(csvRow([r.at, r.rowId]));
  }

  lines.push("");
  lines.push(csvRow(["=== Rows ==="]));
  lines.push(csvRow(ROW_CSV_HEADER));
  for (const row of log.rows) {
    lines.push(
      csvRow([
        row.rowId,
        row.author,
        row.threadPosition,
        row.replyingToAuthor,
        yesNo(row.parentResolved),
        row.draftState,
        yesNo(row.userEdited),
        yesNo(row.retried),
        row.error,
        row.resourceState,
        row.resourceError,
        row.concepts.join(CONCEPT_JOINER),
        row.resourceQuery,
        row.resourceQuerySource,
      ])
    );
  }

  return lines.join("\r\n");
}

/** The exhaustive JSON export - an OBJECT (never a bare array), same
 * reasoning as src/lib/repo-grading-log.ts's own `formatRepoGradingLogJson`:
 * a later field can be added without breaking anything already parsing these
 * files. `exportedAt` is a parameter for the same reason every other
 * timestamp in this module is - see this file's header. */
export function formatDiscussionRepliesLogJson(log: DiscussionRepliesRunLog, meta: { exportedAt: string }): string {
  return JSON.stringify({ exportedAt: meta.exportedAt, ...log }, null, 2);
}

// ---------------------------------------------------------------------------
// Filename. Reimplements src/lib/repo-grading-log.ts's `slugify`/`fileStamp`
// shape locally (those two helpers are not exported from that file) - see
// this file's header for why that is reuse-of-idiom, not reinvention.
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

/** `discussion-replies-log-<course-slug>-<YYYYMMDD-HHMMSS>.<ext>`. A course
 * name that slugs to nothing (blank, no course selected) drops that segment
 * entirely rather than emitting a dangling double dash - same rule as
 * `repoGradingLogFileName`. */
export function discussionRepliesLogFileName(courseName: string, extension: string, atIso: string): string {
  const slug = slugify(courseName);
  const parts = ["discussion-replies-log", slug, fileStamp(atIso)].filter((part) => part !== "");
  return `${parts.join("-")}.${extension}`;
}
