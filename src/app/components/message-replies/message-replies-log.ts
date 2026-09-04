// Message replies (Manual > Recording > Message replies) - the downloadable
// run log. docs/message-replies-acceptance-criteria.md M19 (section 8),
// section 9.
//
// STRUCTURE REUSED FROM src/app/components/recording/discussion-replies-
// log.ts (read in full before writing this file, and see that file's own
// header for why it exists at all - docs/DEV_LOOP.md's "every feature needs
// a downloadable log" rule): pure functions, no I/O, no clock reads - every
// function here takes the timestamp(s) it needs as data, never calls
// Date.now() itself - so a test pins an exact rendered CSV/JSON rather than
// asserting around "now". CSV+JSON pairing, both built from the same
// in-memory record; a slugified-name + YYYYMMDD-HHMMSS filename convention,
// via the shared `logFileName` (src/lib/log-file-name.ts) - discussion-
// replies-log.ts and src/lib/repo-grading-log.ts build their own filenames
// the same way, off the same leaf.
//
// THIS FILE IS NOT THAT ONE: the record shape differs where the surfaces
// differ. A message-replies run has no per-row "thread position" or resource
// search - it has a Canvas match, a saved-draft link and a sent record
// instead (M6, M15, M16, M17). Two deliberate divergences from the
// discussion log's own discipline:
//
// - Message bodies and the drafted reply text ARE carried on the row entry
//   (`messages`, `reply`) - unlike `DiscussionRepliesLogRowEntry`, which
//   carries neither the post nor the reply body at all. Section 8 is
//   explicit: "Message bodies and replies are JSON-only" - so
//   `formatMessageRepliesLogCsv` below never renders either field (the CSV
//   header list is frozen to exactly the 13 columns section 8 names), while
//   `formatMessageRepliesLogJson` (a plain JSON.stringify of the whole log)
//   carries them because it carries everything.
// - `buildMessageRepliesLogRowEntry(row)` takes ONLY the row (section 9's
//   own signature - contrast `buildDiscussionRepliesLogRowEntry(row,
//   rawRows, retriedIds)`, which needs the whole table to recompute
//   `resolveDraftParent`). A message thread has no cross-row parent
//   resolution to recompute, but it does still need to know whether ITS OWN
//   id is in the run's retries list - information a single row can never
//   carry about itself. So `retried` is `false` from this function alone
//   (documented on the field below), and `buildMessageRepliesLog` - which
//   DOES see the whole `MessageRepliesLogInput`, retries included - overlays
//   the true value once it has both. This is the same "collection vs
//   assembly" split discussion-replies-log.ts's own header documents,
//   drawn at a different seam because M19's own fixed signature draws it
//   there.
//
// `latestIncoming` (message-thread.ts, a sibling leaf owned by a concurrent
// implementer, per section 9) is CALLED, never re-derived: M9 already
// defines "the latest incoming message" as "the newest with fromMe ===
// false", and reimplementing that rule a second time here is exactly the
// "value computed twice where the tested copy is not the live one" defect
// class discussion-replies-log.ts's own header warns against for
// `resolveDraftParent`.

import { csvRow, yesNo } from "@/lib/course-tasks-view-csv";
import { logFileName } from "@/lib/log-file-name";
import { latestIncoming } from "./message-thread";
import type { MessageThreadRow, ThreadMessage, MessageRowState } from "./message-serialization";

// ---------------------------------------------------------------------------
// Event-stream records. Each carries the ISO 8601 timestamp of the event -
// supplied by the collector (a React hook that appends to these streams as
// each event happens), never computed here.
// ---------------------------------------------------------------------------

/** One extraction request/response cycle - the message-replies analogue of
 * `DiscussionRepliesLogBatch` (see that type's own header for the full
 * reasoning, reused verbatim here with "posts" renamed to "messages"):
 * `messagesExtracted` is what the model returned for this batch;
 * `messagesAdded` is how many became NEW rows/messages
 * (`mergeCapturedMessages`'s own `addedIds`); `messagesDuplicate` is the
 * remainder, EXCEPT for a `discarded` batch (the table's epoch changed while
 * this batch's response was in flight), whose `messagesDuplicate` is forced
 * to 0 - a discarded batch's messages were never compared against the table,
 * so none of them are duplicates; they are counted only in the discarded
 * tally (`MessageRepliesLogSummary.messagesDiscardedTotal`). `capped` is the
 * "table was already at MAX_TABLE_ROWS" flag. `error` is the verbatim
 * extraction failure message, `""` otherwise. */
export interface MessageRepliesLogBatch {
  at: string;
  framesInBatch: number;
  messagesExtracted: number;
  messagesAdded: number;
  messagesDuplicate: number;
  capped: boolean;
  discarded: boolean;
  error: string;
}

/** Builds one `MessageRepliesLogBatch`, deriving `messagesDuplicate` from
 * `messagesExtracted - messagesAdded` (forced to 0 when `discarded`) rather
 * than leaving each collection call site to compute - and possibly drift on
 * - that subtraction independently. Mirrors
 * `makeDiscussionRepliesLogBatch`'s own defaulting exactly. Clamped to a
 * minimum of 0: `messagesAdded` and `messagesExtracted` are supplied
 * independently by the caller, so a caller that reports more added than
 * extracted (a defensive-programming slip, not a real run) must never
 * surface as a negative "duplicate" count in a downloaded log. */
export function makeMessageRepliesLogBatch(args: {
  at: string;
  framesInBatch: number;
  messagesExtracted?: number;
  messagesAdded?: number;
  capped?: boolean;
  discarded?: boolean;
  error?: string;
}): MessageRepliesLogBatch {
  const messagesExtracted = args.messagesExtracted ?? 0;
  const messagesAdded = args.messagesAdded ?? 0;
  const discarded = args.discarded ?? false;
  return {
    at: args.at,
    framesInBatch: args.framesInBatch,
    messagesExtracted,
    messagesAdded,
    messagesDuplicate: discarded ? 0 : Math.max(0, messagesExtracted - messagesAdded),
    capped: args.capped ?? false,
    discarded,
    error: args.error ?? "",
  };
}

/** One notice actually shown to the instructor - logged at the point it was
 * shown, the same discipline `DiscussionRepliesLogNotice` documents on its
 * own (never truncated here even though the panel's own live list is). */
export interface MessageRepliesLogNotice {
  at: string;
  text: string;
}

/** One explicit Redraft click on a row (M14's per-row `Redraft`
 * `ConfirmArmButtons` control) - the message-replies analogue of
 * `DiscussionRepliesLogRetry`. */
export interface MessageRepliesLogRetry {
  at: string;
  rowId: string;
}

/** One thread row's full debugging picture, read from the live
 * `MessageThreadRow` at build time. `latestIncomingAt` is the RAW timestamp
 * text of `latestIncoming(row)` (M9: "raw is what the UI and log render; ms
 * is only a sort key") - `""` when the thread has no incoming message yet.
 * `matchedConversationId`/`savedDraftId`/`sentAt` are `null`/`""`/`null`
 * when the row has no `canvas`/`savedDraft`/`sent` respectively - the same
 * "never undefined, a documented empty value" discipline
 * `DiscussionRepliesLogRowEntry` follows. `retried` is ALWAYS `false` from
 * this function alone - see this file's own header for why a single row
 * cannot answer that on its own; `buildMessageRepliesLog` overlays the real
 * value. `messages`/`reply` are carried in full (JSON-only per section 8 -
 * `formatMessageRepliesLogCsv` never reads either field). */
export interface MessageRepliesLogRowEntry {
  rowId: string;
  subject: string;
  student: string;
  messageCount: number;
  latestIncomingAt: string;
  answered: boolean;
  state: MessageRowState;
  userEdited: boolean;
  retried: boolean;
  error: string;
  matchedConversationId: number | null;
  savedDraftId: string;
  sentAt: number | null;
  messages: ThreadMessage[];
  reply: string;
}

/** What the run collects, before the `rows` snapshot is built.
 * `signoffSet` is yes/no ONLY - M19: "signoff set yes/no - never the text" -
 * so a downloaded log never leaks the instructor's actual sign-off text
 * through the run-level section even though the per-row `reply` field
 * already carries the applied sign-off as part of the reply body (that is
 * the reply, not a second copy of the sign-off alone). `rawRows` is the
 * UNFILTERED table at build time - the same discipline
 * `buildDiscussionRepliesRunLog`'s own header documents (a log built off a
 * stale search-box filter must not silently omit rows an instructor cannot
 * currently see) - bundled into this input (rather than a second positional
 * parameter, as the discussion tool's own `buildDiscussionRepliesRunLog`
 * takes it) because section 9 fixes `buildMessageRepliesLog`'s signature to
 * a single `input` parameter. */
export interface MessageRepliesLogInput {
  startedAt: string;
  endedAt: string;
  courseName: string;
  ingredients: readonly string[];
  formality: string;
  addressByName: boolean;
  signoffSet: boolean;
  skipAnswered: boolean;
  framesCaptured: number;
  droppedFrames: number;
  stalled: boolean;
  batches: readonly MessageRepliesLogBatch[];
  notices: readonly MessageRepliesLogNotice[];
  retries: readonly MessageRepliesLogRetry[];
  rawRows: readonly MessageThreadRow[];
}

/** The whole run record: every collected field except `rawRows` (superseded
 * by the built `rows` snapshot below). */
export interface MessageRepliesRunLog {
  startedAt: string;
  endedAt: string;
  courseName: string;
  ingredients: readonly string[];
  formality: string;
  addressByName: boolean;
  signoffSet: boolean;
  skipAnswered: boolean;
  framesCaptured: number;
  droppedFrames: number;
  stalled: boolean;
  batches: readonly MessageRepliesLogBatch[];
  notices: readonly MessageRepliesLogNotice[];
  retries: readonly MessageRepliesLogRetry[];
  rows: MessageRepliesLogRowEntry[];
}

// ---------------------------------------------------------------------------
// Assembly.
// ---------------------------------------------------------------------------

/** Builds one row's log entry from the row alone (section 9's fixed
 * one-parameter signature) - `retried` is always `false` here; see this
 * file's own header and this interface's own comment for why, and
 * `buildMessageRepliesLog` for where the true value is applied. */
export function buildMessageRepliesLogRowEntry(row: MessageThreadRow): MessageRepliesLogRowEntry {
  return {
    rowId: row.id,
    subject: row.subject,
    student: row.student,
    messageCount: row.messages.length,
    latestIncomingAt: latestIncoming(row)?.sentAt ?? "",
    answered: row.answered,
    state: row.state,
    userEdited: row.userEdited,
    retried: false,
    error: row.error ?? "",
    matchedConversationId: row.canvas?.conversationId ?? null,
    savedDraftId: row.savedDraft?.id ?? "",
    sentAt: row.sent?.at ?? null,
    messages: row.messages,
    reply: row.reply,
  };
}

/** Assembles the full run record from a single `MessageRepliesLogInput`
 * (section 9's fixed signature). Builds every row via
 * `buildMessageRepliesLogRowEntry`, then overlays the true `retried` value
 * from `input.retries` - the one place in this module that has visibility
 * into both a row and the retries stream at once. `input.rawRows` is
 * consumed here and does not appear on the returned `MessageRepliesRunLog`
 * (superseded by `rows`). */
export function buildMessageRepliesLog(input: MessageRepliesLogInput): MessageRepliesRunLog {
  const retriedIds = new Set(input.retries.map((r) => r.rowId));
  const rows = input.rawRows.map((row) => ({
    ...buildMessageRepliesLogRowEntry(row),
    retried: retriedIds.has(row.id),
  }));
  return {
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    courseName: input.courseName,
    ingredients: input.ingredients,
    formality: input.formality,
    addressByName: input.addressByName,
    signoffSet: input.signoffSet,
    skipAnswered: input.skipAnswered,
    framesCaptured: input.framesCaptured,
    droppedFrames: input.droppedFrames,
    stalled: input.stalled,
    batches: input.batches,
    notices: input.notices,
    retries: input.retries,
    rows,
  };
}

// ---------------------------------------------------------------------------
// Summary - the counts that make a silent failure legible, per docs/
// DEV_LOOP.md's rule. Exhaustive over `MessageRowState` (a `never` check,
// not a catch-all `else`), for the same reason
// `summarizeDiscussionRepliesRunLog`'s own header gives (REGRESSION entry
// 370's S2: a catch-all `else` silently miscounting a state nobody had added
// a branch for yet).
// ---------------------------------------------------------------------------

export interface MessageRepliesLogSummary {
  totalRows: number;
  pending: number;
  drafting: number;
  ready: number;
  failed: number;
  answered: number;
  sent: number;
  savedDraft: number;
  retriedRows: number;
  batchesSent: number;
  framesCaptured: number;
  messagesExtractedTotal: number;
  messagesAddedTotal: number;
  messagesDuplicateTotal: number;
  cappedBatches: number;
  discardedBatches: number;
  messagesDiscardedTotal: number;
  noticeCount: number;
  droppedFrames: number;
}

export function summarizeMessageRepliesLog(log: MessageRepliesRunLog): MessageRepliesLogSummary {
  let pending = 0;
  let drafting = 0;
  let ready = 0;
  let failed = 0;
  let answered = 0;
  let sent = 0;
  let savedDraft = 0;
  let retriedRows = 0;

  for (const row of log.rows) {
    switch (row.state) {
      case "pending":
        pending += 1;
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
        const exhaustive: never = row.state;
        throw new Error(`Unhandled message reply draft state: ${String(exhaustive)}`);
      }
    }
    if (row.answered) answered += 1;
    if (row.sentAt !== null) sent += 1;
    if (row.savedDraftId !== "") savedDraft += 1;
    if (row.retried) retriedRows += 1;
  }

  let messagesExtractedTotal = 0;
  let messagesAddedTotal = 0;
  let messagesDuplicateTotal = 0;
  let cappedBatches = 0;
  let discardedBatches = 0;
  let messagesDiscardedTotal = 0;
  for (const batch of log.batches) {
    messagesExtractedTotal += batch.messagesExtracted;
    messagesAddedTotal += batch.messagesAdded;
    messagesDuplicateTotal += batch.messagesDuplicate;
    if (batch.capped) cappedBatches += 1;
    if (batch.discarded) {
      discardedBatches += 1;
      messagesDiscardedTotal += batch.messagesExtracted;
    }
  }

  return {
    totalRows: log.rows.length,
    pending,
    drafting,
    ready,
    failed,
    answered,
    sent,
    savedDraft,
    retriedRows,
    batchesSent: log.batches.length,
    framesCaptured: log.framesCaptured,
    messagesExtractedTotal,
    messagesAddedTotal,
    messagesDuplicateTotal,
    cappedBatches,
    discardedBatches,
    messagesDiscardedTotal,
    noticeCount: log.notices.length,
    droppedFrames: log.droppedFrames,
  };
}

/** The one-line summary shown above the download buttons - M18's own frozen
 * oracle sentence (docs/message-replies-acceptance-criteria.md section 7):
 * `12 threads captured across 3 batches - 9 drafted, 0 failed, 3 already
 * answered, 2 sent, 1 saved as a draft, 0 notices.` Never gated on
 * `totalRows > 0`, matching `discussionRepliesLogSummaryLine`'s own rule -
 * a run that captured nothing still gets a true, useful sentence. The six
 * numbers quoted are independent tallies, not a partition of `totalRows`: a
 * thread can be both `ready` and `answered` (redrafted after being
 * answered), so they are not expected to sum to `totalRows` in general -
 * they happen to in M18's own example only because that example's fixture
 * has no non-answered pending/drafting rows. */
export function messageRepliesLogSummaryLine(summary: MessageRepliesLogSummary): string {
  const threadWord = summary.totalRows === 1 ? "thread" : "threads";
  const batchWord = summary.batchesSent === 1 ? "batch" : "batches";
  const noticeWord = summary.noticeCount === 1 ? "notice" : "notices";
  return (
    `${summary.totalRows} ${threadWord} captured across ${summary.batchesSent} ${batchWord} - ` +
    `${summary.ready} drafted, ${summary.failed} failed, ${summary.answered} already answered, ` +
    `${summary.sent} sent, ${summary.savedDraft} saved as a draft, ${summary.noticeCount} ${noticeWord}.`
  );
}

// ---------------------------------------------------------------------------
// CSV. Every field through csvRow/escapeCsvValue (src/lib/course-tasks-view-
// csv.ts) - reused rather than a new local escaper, the same discipline
// discussionRepliesLogCsv's own header documents. Rows joined with \r\n,
// matching that file. FOUR SECTIONS IN ONE FILE (Run/Batches/Notices/
// Retries/Rows - five, actually, matching the discussion log's own layout),
// each its own header row, a single-cell `=== Name ===` row marking where
// each starts.
// ---------------------------------------------------------------------------

const RUN_CSV_HEADER = ["Field", "Value"];
const BATCH_CSV_HEADER = ["At", "Frames in batch", "Messages extracted", "Messages added", "Messages duplicate", "Capped", "Discarded", "Error"];
const NOTICE_CSV_HEADER = ["At", "Text"];
const RETRY_CSV_HEADER = ["At", "Row ID"];
// Section 8's own thirteen columns, in this order. Message bodies and the
// drafted reply are deliberately NOT here - "Message bodies and replies are
// JSON-only" (section 8) - see this file's own header for the full reasoning.
const ROW_CSV_HEADER = [
  "Row ID",
  "Subject",
  "Student",
  "Message count",
  "Latest incoming at",
  "Answered",
  "State",
  "User edited",
  "Retried",
  "Error",
  "Matched conversation ID",
  "Saved draft ID",
  "Sent at",
];

const numOrBlank = (n: number | null): string => (n === null ? "" : String(n));

export function formatMessageRepliesLogCsv(log: MessageRepliesRunLog): string {
  const lines: string[] = [];

  lines.push(csvRow(["=== Run ==="]));
  lines.push(csvRow(RUN_CSV_HEADER));
  lines.push(csvRow(["Started", log.startedAt]));
  lines.push(csvRow(["Ended", log.endedAt]));
  lines.push(csvRow(["Course", log.courseName]));
  lines.push(csvRow(["Ingredients", log.ingredients.join(", ")]));
  lines.push(csvRow(["Formality", log.formality]));
  lines.push(csvRow(["Address by name", yesNo(log.addressByName)]));
  lines.push(csvRow(["Signoff set", yesNo(log.signoffSet)]));
  lines.push(csvRow(["Skip answered threads", yesNo(log.skipAnswered)]));
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
        String(b.messagesExtracted),
        String(b.messagesAdded),
        String(b.messagesDuplicate),
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
        row.subject,
        row.student,
        String(row.messageCount),
        row.latestIncomingAt,
        yesNo(row.answered),
        row.state,
        yesNo(row.userEdited),
        yesNo(row.retried),
        row.error,
        numOrBlank(row.matchedConversationId),
        row.savedDraftId,
        numOrBlank(row.sentAt),
      ])
    );
  }

  return lines.join("\r\n");
}

/** The exhaustive JSON export - an OBJECT (never a bare array), same
 * reasoning as `formatDiscussionRepliesLogJson`'s own header: a later field
 * can be added without breaking anything already parsing these files.
 * Carries `messages`/`reply` on every row (unlike the CSV above) - this is
 * the one place a downloaded message-replies log ever contains message
 * bodies or drafted reply text. */
export function formatMessageRepliesLogJson(log: MessageRepliesRunLog, meta: { exportedAt: string }): string {
  return JSON.stringify({ exportedAt: meta.exportedAt, ...log }, null, 2);
}

// ---------------------------------------------------------------------------
// Filename, via the shared `logFileName` (src/lib/log-file-name.ts) - see
// this file's header for the full reasoning.
// ---------------------------------------------------------------------------

/** `message-replies-log-<course-slug>-<YYYYMMDD-HHMMSS>.<ext>` (section 8).
 * A course name that slugs to nothing (blank, no course selected) drops that
 * segment entirely rather than emitting a dangling double dash - same rule
 * as `discussionRepliesLogFileName`. */
export function messageRepliesLogFileName(courseName: string, extension: "csv" | "json", atIso: string): string {
  return logFileName("message-replies-log", courseName, extension, atIso);
}
