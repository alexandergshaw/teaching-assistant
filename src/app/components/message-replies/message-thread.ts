// Message replies threading - grouping captured inbox readings into threads,
// timestamp parsing, same-message dedupe, sorting and the sign-off appender.
// docs/message-replies-acceptance-criteria.md M9/M11.
//
// This file contains NO React, no hooks, no `document`, no `navigator` - the
// same discipline discussion-capture.ts's own header describes, and for the
// same reason: vitest in this repo is node-env and renders nothing, so every
// behaviour that needs a unit test lives here.
//
// Import direction: this file imports MessageThreadRow/ThreadMessage and the
// caps FROM message-serialization.ts, never the reverse - see that file's
// own header for why (a cycle here is exactly this repo's split-constants-
// into-the-leaf failure mode). It also imports the row-free discussion
// machinery per the AC's section 0: `normalizeForMatch`, `authorsMatch`,
// `PREFIX_TOKENS`, `SIMILARITY_THRESHOLD`, `MIN_TOKENS_FOR_SIMILARITY` and
// `MAX_TABLE_ROWS` from discussion-capture.ts (that file is not edited by
// only imported from, never edited).
//
// `tokenLevenshtein` is IMPORTED, not duplicated: discussion-capture.ts
// exports it precisely so the two features share one tested implementation
// rather than two private copies that could silently drift apart - the
// "tested copy nothing runs" shape REGRESSION 367 defect 4 warns about.

import {
  normalizeForMatch,
  authorsMatch,
  PREFIX_TOKENS,
  SIMILARITY_THRESHOLD,
  MIN_TOKENS_FOR_SIMILARITY,
  MAX_TABLE_ROWS,
  tokenLevenshtein,
} from "../recording/discussion-capture";
import { MAX_THREAD_MESSAGES, MAX_MESSAGE_CHARS, type MessageThreadRow, type ThreadMessage } from "./message-serialization";

// ---------------------------------------------------------------------------
// M9: thread key.
// ---------------------------------------------------------------------------

const NO_SUBJECT_KEY = normalizeForMatch("(no subject)");

/**
 * `normalizeForMatch(subject)` when non-empty and not "(no subject)", else
 * the sentinel "" - a thread with no usable subject (an empty reading, or a
 * literal "(no subject)" reading) is keyed the same way, so both collapse to
 * matching by student alone (see findMatchingThreadIndex below).
 */
export function threadKey(subject: string): string {
  const normalized = normalizeForMatch(subject);
  if (!normalized) return "";
  if (normalized === NO_SUBJECT_KEY) return "";
  return normalized;
}

// ---------------------------------------------------------------------------
// M9: timestamp parsing.
// ---------------------------------------------------------------------------

export interface ParsedInboxTimestamp {
  /** Only meaningful when `precision !== "none"` - a sort key, never
   *  rendered. NaN when nothing could be resolved. */
  ms: number;
  precision: "minute" | "day" | "none";
  /** What the UI and log render - always the trimmed input, verbatim. */
  raw: string;
}

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function monthIndex(token: string): number {
  return MONTH_NAMES.indexOf(token.toLowerCase().slice(0, 3));
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * "Sep 3 at 2:14pm" / "Sep 3, 2025" -> minute/day (year from `capturedAtMs`
 * for the first form, which carries none of its own, rolled back one year
 * when the result is more than 7 days in the future - the second form
 * already carries an explicit year and is never adjusted);
 * "Today"/"Yesterday" -> that date at 12:00 local, day; a bare "2:14 PM" ->
 * the capture date, minute; anything else -> precision "none", raw kept.
 */
export function parseInboxTimestamp(raw: string, capturedAtMs: number): ParsedInboxTimestamp {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ms: NaN, precision: "none", raw: trimmed };

  const captured = new Date(capturedAtMs);
  const lower = trimmed.toLowerCase();

  if (lower === "today" || lower === "yesterday") {
    const base = new Date(captured.getFullYear(), captured.getMonth(), captured.getDate());
    if (lower === "yesterday") base.setDate(base.getDate() - 1);
    base.setHours(12, 0, 0, 0);
    return { ms: base.getTime(), precision: "day", raw: trimmed };
  }

  let m = trimmed.match(/^([A-Za-z]{3,9})\s+(\d{1,2})\s+at\s+(\d{1,2}):(\d{2})\s*([ap]m)$/i);
  if (m) {
    const mi = monthIndex(m[1]);
    if (mi !== -1) {
      const day = parseInt(m[2], 10);
      let hour = parseInt(m[3], 10) % 12;
      if (m[5].toLowerCase() === "pm") hour += 12;
      const minute = parseInt(m[4], 10);
      const year = captured.getFullYear();
      let candidate = new Date(year, mi, day, hour, minute, 0, 0);
      if (candidate.getTime() - capturedAtMs > SEVEN_DAYS_MS) {
        candidate = new Date(year - 1, mi, day, hour, minute, 0, 0);
      }
      return { ms: candidate.getTime(), precision: "minute", raw: trimmed };
    }
  }

  m = trimmed.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),\s*(\d{4})$/);
  if (m) {
    const mi = monthIndex(m[1]);
    if (mi !== -1) {
      const day = parseInt(m[2], 10);
      const year = parseInt(m[3], 10);
      const candidate = new Date(year, mi, day, 12, 0, 0, 0);
      return { ms: candidate.getTime(), precision: "day", raw: trimmed };
    }
  }

  m = trimmed.match(/^(\d{1,2}):(\d{2})\s*([ap]m)$/i);
  if (m) {
    let hour = parseInt(m[1], 10) % 12;
    if (m[3].toLowerCase() === "pm") hour += 12;
    const minute = parseInt(m[2], 10);
    const candidate = new Date(captured.getFullYear(), captured.getMonth(), captured.getDate(), hour, minute, 0, 0);
    return { ms: candidate.getTime(), precision: "minute", raw: trimmed };
  }

  return { ms: NaN, precision: "none", raw: trimmed };
}

// ---------------------------------------------------------------------------
// M9: same-message dedupe.
// ---------------------------------------------------------------------------

/** Strips a leading quoted block - lines matching /^\s*(>|On .* wrote:)/ -
 * before tokenising, so a reply that echoes an earlier quoted message does
 * not get compared on quoted text neither side actually wrote fresh. */
function stripQuotedBlock(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*(>|On .* wrote:)/.test(line))
    .join("\n");
}

function tokensOfMessage(text: string): string[] {
  const normalized = normalizeForMatch(stripQuotedBlock(text));
  return normalized ? normalized.split(" ") : [];
}

function edgeDistance(tokensA: string[], tokensB: string[], fromEnd: boolean): number {
  const slice = (tokens: string[]) => (fromEnd ? tokens.slice(Math.max(0, tokens.length - PREFIX_TOKENS)) : tokens.slice(0, PREFIX_TOKENS));
  const a = slice(tokensA);
  const b = slice(tokensB);
  const minLen = Math.min(a.length, b.length);
  if (minLen === 0) return a.length === b.length ? 0 : 1;
  const trimmedA = fromEnd ? a.slice(a.length - minLen) : a.slice(0, minLen);
  const trimmedB = fromEnd ? b.slice(b.length - minLen) : b.slice(0, minLen);
  return tokenLevenshtein(trimmedA, trimmedB) / minLen;
}

/** Built on postSimilarityDistance's own tokeniser and constants
 * (discussion-capture.ts), but NEW here: strips a leading quoted block
 * before tokenising, and compares BOTH the first and the last PREFIX_TOKENS
 * (each truncated to the shorter side, like postSimilarityDistance's own
 * trick), taking the MAX of the two - a message that merely shares a quoted
 * prefix with another, unrelated message must not read as similar just
 * because one end lines up. */
export function messageSimilarityDistance(aText: string, bText: string): number {
  const tokensA = tokensOfMessage(aText);
  const tokensB = tokensOfMessage(bText);
  const first = edgeDistance(tokensA, tokensB, false);
  const last = edgeDistance(tokensA, tokensB, true);
  return Math.max(first, last);
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/** `authorsMatch` AND `messageSimilarityDistance <= SIMILARITY_THRESHOLD`
 * (below MIN_TOKENS_FOR_SIMILARITY tokens, normalized equality on the
 * quote-stripped text is required instead). Timestamps CONFIRM, never
 * DISTINGUISH: a match is vetoed only when both sides parse to `minute`
 * precision more than 5 minutes apart. */
export function isSameMessage(
  a: { sender: string; text: string; sentAtMs?: number; precision?: "minute" | "day" | "none" },
  b: { sender: string; text: string; sentAtMs?: number; precision?: "minute" | "day" | "none" }
): boolean {
  if (!authorsMatch(a.sender, b.sender)) return false;

  const tokenCount = Math.min(tokensOfMessage(a.text).length, tokensOfMessage(b.text).length);
  const similar =
    tokenCount < MIN_TOKENS_FOR_SIMILARITY
      ? normalizeForMatch(stripQuotedBlock(a.text)) === normalizeForMatch(stripQuotedBlock(b.text))
      : messageSimilarityDistance(a.text, b.text) <= SIMILARITY_THRESHOLD;
  if (!similar) return false;

  if (
    a.precision === "minute" &&
    b.precision === "minute" &&
    typeof a.sentAtMs === "number" &&
    Number.isFinite(a.sentAtMs) &&
    typeof b.sentAtMs === "number" &&
    Number.isFinite(b.sentAtMs) &&
    Math.abs(a.sentAtMs - b.sentAtMs) > FIVE_MINUTES_MS
  ) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// M9: latestIncoming / sortThreads.
// ---------------------------------------------------------------------------

/** The newest message with `fromMe === false` - "newest" per the row's own
 * stored order (already ascending sentAtMs, none-precision entries riding
 * immediately after the dated message that preceded them - see
 * mergeCapturedMessages' own sortThreadMessages below), so this is simply
 * the last such entry scanning from the end. */
export function latestIncoming(row: { messages: ReadonlyArray<ThreadMessage> }): ThreadMessage | undefined {
  for (let i = row.messages.length - 1; i >= 0; i--) {
    if (!row.messages[i].fromMe) return row.messages[i];
  }
  return undefined;
}

/** Threads: descending latest-incoming ms (a thread with no latest-incoming
 * reading - every message fromMe, or none dated - sorts as if its ms were
 * -Infinity, i.e. last), then descending firstSeenAt, then ascending id. */
export function sortThreads(rows: ReadonlyArray<MessageThreadRow>): MessageThreadRow[] {
  const msOf = (row: MessageThreadRow): number => {
    const latest = latestIncoming(row);
    return latest && typeof latest.sentAtMs === "number" && Number.isFinite(latest.sentAtMs) ? latest.sentAtMs : -Infinity;
  };
  return rows.slice().sort((a, b) => {
    const aMs = msOf(a);
    const bMs = msOf(b);
    if (aMs !== bMs) return bMs - aMs;
    if (a.firstSeenAt !== b.firstSeenAt) return b.firstSeenAt - a.firstSeenAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// M11: sign-off.
// ---------------------------------------------------------------------------

/** Appends `\n\n${signoff.trim()}` when `signoff` is non-empty and the
 * drafted text does not already end with it - IN CODE, never by the model
 * (M11), so the row stores the reply WITH the sign-off and Copy/Save-as-
 * draft/Send are byte-identical. Trailing whitespace on `reply` is ignored
 * when checking "already ends with it", so a reply the model returned with a
 * trailing newline is not needlessly signed off twice. */
export function applySignoff(reply: string, signoff: string): string {
  const trimmedSignoff = signoff.trim();
  if (!trimmedSignoff) return reply;
  if (reply.trimEnd().endsWith(trimmedSignoff)) return reply;
  return `${reply}\n\n${trimmedSignoff}`;
}

// ---------------------------------------------------------------------------
// M9: mergeCapturedMessages.
// ---------------------------------------------------------------------------

// BL5/N2 precedent (discussion-capture.ts's own mergeIdCounter): module-scope
// so two calls sharing the same `now` never mint colliding ids.
let mergeIdCounter = 0;

function maxOrder(rows: ReadonlyArray<MessageThreadRow>): number {
  return rows.reduce((m, r) => Math.max(m, r.order), -1);
}

/** A message joins the thread whose key matches AND whose `student`
 * satisfies `authorsMatch` - for a `""`-key thread that check is ALWAYS
 * enforced (so two `""`-key threads with different students never merge);
 * for a real-subject thread it is enforced only once the thread's `student`
 * is actually known. This module never mints a real-subject row with an
 * empty student itself - a `fromMe` message only ever JOINS an existing
 * thread (see `matchFromMeThreadIndex` below), never creates one - so the
 * `!row.student` branch here is a defensive fallback for any such row
 * already present in previously-persisted rows. */
function findMatchingThreadIndex(rows: ReadonlyArray<MessageThreadRow>, key: string, sender: string): number {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (threadKey(row.subject) !== key) continue;
    if (key === "") {
      if (row.student && authorsMatch(row.student, sender)) return i;
      continue;
    }
    if (!row.student || authorsMatch(row.student, sender)) return i;
  }
  return -1;
}

/** A `fromMe` message joins by KEY ALONE (never checking student) and
 * inherits the thread's student - but only when exactly one thread carries
 * that key; zero or several candidates is "no thread to join" (M9). */
function matchFromMeThreadIndex(rows: ReadonlyArray<MessageThreadRow>, key: string): number {
  const candidates: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (threadKey(rows[i].subject) === key) candidates.push(i);
  }
  return candidates.length === 1 ? candidates[0] : -1;
}

function buildThreadMessage(entry: { sender: string; text: string; sentAt?: string }, fromMe: boolean, capturedAtMs: number): ThreadMessage {
  const parsed = parseInboxTimestamp(entry.sentAt ?? "", capturedAtMs);
  const message: ThreadMessage = { sender: entry.sender, text: entry.text, fromMe, precision: parsed.precision };
  if (entry.sentAt && entry.sentAt.trim()) message.sentAt = entry.sentAt.trim();
  if (Number.isFinite(parsed.ms)) message.sentAtMs = parsed.ms;
  return message;
}

/** Ordering inside a thread: ascending sentAtMs; `none`-precision entries
 * keep first-seen order immediately after the last dated message that
 * preceded them. Implemented by assigning each message an EFFECTIVE sort
 * key - its own `sentAtMs` when finite, otherwise the effective key of the
 * nearest PRECEDING message in the array's current (first-seen) order - then
 * stable-sorting by (key, original index). A brand-new message is appended
 * to the end (its natural first-seen position) before this runs. */
function sortThreadMessages(messages: ReadonlyArray<ThreadMessage>): ThreadMessage[] {
  let lastKey = -Infinity;
  const withKeys = messages.map((m, i) => {
    const key = typeof m.sentAtMs === "number" && Number.isFinite(m.sentAtMs) ? m.sentAtMs : lastKey;
    lastKey = key;
    return { m, i, key };
  });
  return withKeys.sort((a, b) => (a.key !== b.key ? a.key - b.key : a.i - b.i)).map((e) => e.m);
}

/** Merges one `"thread"`-pane message into `row`, deduping via
 * `isSameMessage`. Merge keeps the longer read - equal-or-shorter keeps the
 * existing entry entirely (object identity preserved: `row` itself is
 * returned unchanged when nothing actually changes). Always clears
 * `previewOnly` - a row only ever reaches this function once a real
 * `"thread"` entry has matched or created it, so `previewOnly` (which only
 * ever describes a row known from a list reading alone) can never still
 * apply. */
function mergeMessageIntoRow(row: MessageThreadRow, incoming: ThreadMessage): MessageThreadRow {
  const matchIndex = row.messages.findIndex((m) => isSameMessage(m, incoming));

  if (matchIndex === -1) {
    return { ...row, messages: sortThreadMessages([...row.messages, incoming]), previewOnly: undefined };
  }

  const existing = row.messages[matchIndex];
  if (incoming.text.length <= existing.text.length) return row; // equal-or-shorter: first read wins, no change at all

  const updated: ThreadMessage = { ...existing, sender: incoming.sender, text: incoming.text, precision: incoming.precision };
  if (incoming.sentAt) updated.sentAt = incoming.sentAt;
  else delete updated.sentAt;
  if (incoming.sentAtMs !== undefined) updated.sentAtMs = incoming.sentAtMs;
  else delete updated.sentAtMs;

  const messages = sortThreadMessages(row.messages.map((m, i) => (i === matchIndex ? updated : m)));
  return { ...row, messages, previewOnly: undefined };
}

/** MAX_THREAD_MESSAGES (keep the newest, count the rest in
 * `omittedMessages`) and MAX_MESSAGE_CHARS (every stored body except the
 * latest incoming, which is exempt - it was already capped to MAX_POST_CHARS
 * upstream, at extraction). Also recomputes `answered`: the newest message
 * in `messages` is `fromMe`. */
function commitRowChange(row: MessageThreadRow): MessageThreadRow {
  let messages = row.messages;
  let omittedMessages = row.omittedMessages;

  if (messages.length > MAX_THREAD_MESSAGES) {
    omittedMessages += messages.length - MAX_THREAD_MESSAGES;
    messages = messages.slice(messages.length - MAX_THREAD_MESSAGES);
  }

  let latestIncomingIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!messages[i].fromMe) {
      latestIncomingIndex = i;
      break;
    }
  }

  messages = messages.map((m, i) => {
    if (i === latestIncomingIndex) return m;
    if (m.text.length <= MAX_MESSAGE_CHARS) return m;
    return { ...m, text: `${m.text.slice(0, MAX_MESSAGE_CHARS)}...` };
  });

  const answered = messages.length > 0 && messages[messages.length - 1].fromMe === true;

  return { ...row, messages, omittedMessages, answered };
}

/**
 * Pure; takes `now`/`capturedAtMs` as parameters rather than reading the
 * clock. `opts.instructorName` derives `fromMe` per message
 * (`instructorName.trim().length > 0 && authorsMatch(sender, instructorName)`
 * - M9's own rule; while empty, every message is incoming and no thread is
 * ever answered).
 *
 * `"list"`-pane entries never become messages: they only create or confirm
 * a thread's subject/student and set `previewOnly` on a thread with no
 * `"thread"` entries yet (M9). `"thread"`-pane entries are deduped and
 * merged via `isSameMessage`/`mergeMessageIntoRow`, then capped via
 * `commitRowChange`.
 *
 * `capped` (BL5's own semantics, mergeCapturedPosts): true when at least one
 * entry that would have become a NEW row was refused because the table was
 * already at MAX_TABLE_ROWS.
 */
export function mergeCapturedMessages(
  rows: ReadonlyArray<MessageThreadRow>,
  entries: ReadonlyArray<{ subject: string; sender: string; text: string; sentAt?: string; pane: "list" | "thread" }>,
  opts: { instructorName: string; capturedAtMs: number; now: number }
): { rows: MessageThreadRow[]; addedIds: string[]; capped: boolean } {
  let nextRows = rows.slice();
  const addedIds: string[] = [];
  let capped = false;
  const instructorName = opts.instructorName.trim();

  for (const entry of entries) {
    const sender = entry.sender.trim();
    if (!sender) continue; // defensive: parseExtractedMessages already filters this

    const key = threadKey(entry.subject);
    const fromMe = instructorName.length > 0 && authorsMatch(sender, instructorName);

    if (entry.pane === "list") {
      if (fromMe) continue; // a list row's sender is always the OTHER participant, never the instructor - see message-reply-prompt.ts's extraction prompt

      const idx = findMatchingThreadIndex(nextRows, key, sender);
      if (idx === -1) {
        if (nextRows.length >= MAX_TABLE_ROWS) {
          capped = true;
          continue;
        }
        const id = `msg-${opts.now}-${mergeIdCounter++}`;
        const newRow: MessageThreadRow = {
          id,
          subject: entry.subject.trim(),
          student: sender,
          messages: [],
          omittedMessages: 0,
          previewOnly: true,
          answered: false,
          reply: "",
          state: "pending",
          userEdited: false,
          firstSeenAt: opts.now,
          order: maxOrder(nextRows) + 1,
        };
        nextRows = [...nextRows, newRow];
        addedIds.push(id);
      } else {
        const row = nextRows[idx];
        const subject = row.subject.trim() ? row.subject : entry.subject.trim();
        const student = row.student || sender;
        const previewOnly: MessageThreadRow["previewOnly"] = row.messages.length === 0 ? true : row.previewOnly;
        if (subject !== row.subject || student !== row.student || previewOnly !== row.previewOnly) {
          nextRows = nextRows.map((r, i) => (i === idx ? { ...r, subject, student, previewOnly } : r));
        }
      }
      continue;
    }

    // entry.pane === "thread"
    const message = buildThreadMessage(entry, fromMe, opts.capturedAtMs);

    if (fromMe) {
      const idx = matchFromMeThreadIndex(nextRows, key);
      if (idx === -1) continue; // M9: a fromMe message not attributable to exactly one existing thread is dropped, never becomes a new row
      const row = nextRows[idx];
      const merged = commitRowChange(mergeMessageIntoRow(row, message));
      if (merged !== row) nextRows = nextRows.map((r, i) => (i === idx ? merged : r));
      continue;
    }

    const idx = findMatchingThreadIndex(nextRows, key, sender);
    if (idx === -1) {
      if (nextRows.length >= MAX_TABLE_ROWS) {
        capped = true;
        continue;
      }
      const id = `msg-${opts.now}-${mergeIdCounter++}`;
      const newRow: MessageThreadRow = {
        id,
        subject: entry.subject.trim(),
        student: sender,
        messages: [message],
        omittedMessages: 0,
        answered: false,
        reply: "",
        state: "pending",
        userEdited: false,
        firstSeenAt: opts.now,
        order: maxOrder(nextRows) + 1,
      };
      nextRows = [...nextRows, commitRowChange(newRow)];
      addedIds.push(id);
    } else {
      const row = nextRows[idx];
      const withStudent = row.student ? row : { ...row, student: sender };
      const merged = commitRowChange(mergeMessageIntoRow(withStudent, message));
      if (merged !== row) nextRows = nextRows.map((r, i) => (i === idx ? merged : r));
    }
  }

  return { rows: nextRows, addedIds, capped };
}
