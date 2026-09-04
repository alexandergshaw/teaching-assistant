// Message replies table serialization - the persisted row shape and the
// read/write functions for it. Sibling of
// src/app/components/recording/discussion-serialization.ts (docs/message-
// replies-acceptance-criteria.md M6), following that file's own discipline:
// no React, no hooks, no `document`, no `navigator`; deserializeMessageTable
// never throws, dropping what is malformed rather than failing the whole
// load (coerceMessageDraftPayload's discipline, src/lib/message-drafts.ts).
//
// Import direction: message-thread.ts imports types and constants FROM this
// file, never the reverse - the same one-owner, one-direction rule
// discussion-serialization.ts's own header states, so a cycle here can never
// silently yield `undefined` past tsc the way this repo's split-constants-
// into-the-leaf lesson records elsewhere. This file therefore implements its
// own tiny "find the latest incoming message" helper for the MAX_TABLE_BYTES
// trim below, rather than importing message-thread.ts's exported
// `latestIncoming` (which takes a full MessageThreadRow and would create
// exactly that cycle) - both are the same four-line scan, kept independently
// because one is not exported for the other to reach.

export type MessageRowState = "pending" | "drafting" | "ready" | "failed";

// M6: `ThreadMessage`. `precision` records how much of `sentAt` could
// actually be resolved to a real instant (message-thread.ts's
// parseInboxTimestamp) - "none" for a reading that could not be parsed at
// all, in which case `sentAt` (the raw string) is still kept and rendered,
// but `sentAtMs` is never set.
export interface ThreadMessage {
  sender: string;
  text: string;
  fromMe: boolean;
  sentAt?: string;
  sentAtMs?: number;
  precision: "minute" | "day" | "none";
}

// M6: the Canvas-match snapshot a matched row carries (M15's
// matchThreadToConversation writes this; message-canvas-match.ts, a sibling
// leaf, owns the predicate that PRODUCES it - this file only owns the
// persisted shape and its round trip).
export interface MessageThreadRow {
  id: string; // opaque, minted once: `msg-${now}-${counter}`. See M9.
  subject: string;
  student: string;
  messages: ThreadMessage[];
  omittedMessages: number; // count of messages dropped by the MAX_THREAD_MESSAGES cap below
  messagesTrimmed?: true; // set by the MAX_TABLE_BYTES trim in serializeMessageTable below
  previewOnly?: true; // known only from a list-pane reading - never drafted (M9's vocabulary)
  answered: boolean; // the newest message in `messages` is fromMe (M9's vocabulary)
  reply: string;
  state: MessageRowState;
  error?: string; // set only when state === "failed"
  userEdited: boolean;
  skipped?: boolean;
  handledAt?: number;
  firstSeenAt: number;
  order: number;
  canvas?: {
    conversationId: number;
    matchedBy: "subject+student" | "student+count";
    matchedAt: number;
    subject: string;
    participants: string[];
    messageCount: number;
  };
  savedDraft?: { id: string; at: number };
  sent?: { at: number; conversationId: number; messageCount: number; messageId?: number };
  // M15's match pass (message-draft-loop.ts's applyCanvasMatches): "none" or
  // "ambiguous" on every unmatched, non-preview row it examines - the UI
  // reads this instead of re-deriving the reason live, so the fieldHint
  // under the actions cell survives a reload with no extra Canvas call.
  // Cleared the moment `canvas` is set (setCanvasMatch, useMessageRows.ts) -
  // a matched row never carries a stale outcome.
  matchOutcome?: "none" | "ambiguous";
  // M17: written by `send()` BEFORE the send fetch goes out, so a reload
  // mid-flight still remembers an attempt was made; cleared on a confirmed
  // success (either send()'s own or checkSent()'s). `sendError` is the exact
  // M17 failure text, set on a failed send and cleared the same two ways.
  sendAttempt?: { at: number; conversationId: number };
  sendError?: string;
}

// M17: the exact failure text a failed send (or an attempt whose outcome
// could not be confirmed by the time of a reload) shows the instructor -
// shared between deserializeMessageTable's own hydration below and
// useMessageDelivery.ts's send(), so the two can never drift apart.
export const SEND_FAILURE_TEXT =
  "The reply may or may not have been sent - check the conversation before resending.";

// M6: caps. MAX_THREAD_MESSAGES/MAX_MESSAGE_CHARS are ENFORCED by
// message-thread.ts's mergeCapturedMessages (which imports them from here) -
// this file only defines them and applies MAX_TABLE_BYTES below, which is a
// serialization-time (not merge-time) concern: the whole persisted table
// must fit a single localStorage value.
export const MESSAGE_TABLE_VERSION = 1;
export const MAX_THREAD_MESSAGES = 12;
export const MAX_MESSAGE_CHARS = 800;
export const MAX_TABLE_BYTES = 3_500_000;

const VALID_STATES = new Set<string>(["pending", "drafting", "ready", "failed"]);
const VALID_PRECISIONS = new Set<string>(["minute", "day", "none"]);
const VALID_MATCHED_BY = new Set<string>(["subject+student", "student+count"]);

// ---------------------------------------------------------------------------
// M6: coerceThreadMessages - "drops entries whose text is not a non-empty
// string, fromMe is v === true, sentAtMs kept only when finite".
// ---------------------------------------------------------------------------

export function coerceThreadMessages(raw: unknown): ThreadMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ThreadMessage[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    const text = typeof e.text === "string" ? e.text : "";
    if (!text) continue; // "drops entries whose text is not a non-empty string"

    const sender = typeof e.sender === "string" ? e.sender : "";
    const fromMe = e.fromMe === true;
    const sentAt = typeof e.sentAt === "string" && e.sentAt ? e.sentAt : undefined;
    const sentAtMs = typeof e.sentAtMs === "number" && Number.isFinite(e.sentAtMs) ? e.sentAtMs : undefined;
    const precisionRaw = typeof e.precision === "string" ? e.precision : "";
    const precision: ThreadMessage["precision"] = VALID_PRECISIONS.has(precisionRaw)
      ? (precisionRaw as ThreadMessage["precision"])
      : "none";

    const message: ThreadMessage = { sender, text, fromMe, precision };
    if (sentAt) message.sentAt = sentAt;
    if (sentAtMs !== undefined) message.sentAtMs = sentAtMs;
    out.push(message);
  }
  return out;
}

function latestIncomingMessage(messages: ReadonlyArray<ThreadMessage>): ThreadMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!messages[i].fromMe) return messages[i];
  }
  return undefined;
}

function coerceCanvasMatch(raw: unknown): MessageThreadRow["canvas"] {
  if (!raw || typeof raw !== "object") return undefined;
  const c = raw as Record<string, unknown>;
  if (typeof c.conversationId !== "number" || !Number.isFinite(c.conversationId)) return undefined;
  if (typeof c.matchedBy !== "string" || !VALID_MATCHED_BY.has(c.matchedBy)) return undefined;
  if (typeof c.matchedAt !== "number" || !Number.isFinite(c.matchedAt)) return undefined;
  if (typeof c.subject !== "string") return undefined;
  if (!Array.isArray(c.participants) || !c.participants.every((p) => typeof p === "string")) return undefined;
  if (typeof c.messageCount !== "number" || !Number.isFinite(c.messageCount)) return undefined;
  return {
    conversationId: c.conversationId,
    matchedBy: c.matchedBy as "subject+student" | "student+count",
    matchedAt: c.matchedAt,
    subject: c.subject,
    participants: c.participants as string[],
    messageCount: c.messageCount,
  };
}

function coerceSavedDraft(raw: unknown): MessageThreadRow["savedDraft"] {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Record<string, unknown>;
  if (typeof d.id !== "string" || !d.id) return undefined;
  if (typeof d.at !== "number" || !Number.isFinite(d.at)) return undefined;
  return { id: d.id, at: d.at };
}

function coerceSent(raw: unknown): MessageThreadRow["sent"] {
  if (!raw || typeof raw !== "object") return undefined;
  const s = raw as Record<string, unknown>;
  if (typeof s.at !== "number" || !Number.isFinite(s.at)) return undefined;
  if (typeof s.conversationId !== "number" || !Number.isFinite(s.conversationId)) return undefined;
  if (typeof s.messageCount !== "number" || !Number.isFinite(s.messageCount)) return undefined;
  const out: NonNullable<MessageThreadRow["sent"]> = { at: s.at, conversationId: s.conversationId, messageCount: s.messageCount };
  const messageId = typeof s.messageId === "number" && Number.isFinite(s.messageId) ? s.messageId : undefined;
  if (messageId !== undefined) out.messageId = messageId;
  return out;
}

const VALID_MATCH_OUTCOMES = new Set<string>(["none", "ambiguous"]);

function coerceMatchOutcome(raw: unknown): MessageThreadRow["matchOutcome"] {
  return typeof raw === "string" && VALID_MATCH_OUTCOMES.has(raw) ? (raw as "none" | "ambiguous") : undefined;
}

function coerceSendAttempt(raw: unknown): MessageThreadRow["sendAttempt"] {
  if (!raw || typeof raw !== "object") return undefined;
  const a = raw as Record<string, unknown>;
  if (typeof a.at !== "number" || !Number.isFinite(a.at)) return undefined;
  if (typeof a.conversationId !== "number" || !Number.isFinite(a.conversationId)) return undefined;
  return { at: a.at, conversationId: a.conversationId };
}

// ---------------------------------------------------------------------------
// M6: serialize / deserialize.
// ---------------------------------------------------------------------------

// A byte length, per M6 ("MAX_TABLE_BYTES") - `.length` on a JSON string is
// UTF-16 code units, not bytes, and this table's bodies are free-text student
// messages that routinely carry multi-byte characters; comparing code units
// against a byte budget silently lets a table through that is actually over
// it (or trims one that was not). One shared TextEncoder instance - this
// function is called on every debounced save, so a fresh encoder per call
// would be pure churn.
const byteEncoder = new TextEncoder();
function byteLength(json: string): number {
  return byteEncoder.encode(json).length;
}

/**
 * `serialize spreads` (M6): nothing is in flight after a reload, so a
 * "drafting" row is written as "pending"; `error` is preserved only for
 * "failed" rows, mirroring serializeReplyTable's own BL4 discipline (a stale
 * error string left on a row later re-drafted successfully must not
 * resurrect itself as a mystery message after a reload).
 *
 * MAX_TABLE_BYTES (M6): when the serialized JSON exceeds it, oldest threads
 * first (ascending firstSeenAt) have `messages` reduced to the latest
 * incoming message only and get `messagesTrimmed: true`, until it fits (or
 * every row has been tried). Trimmed in GEOMETRIC BATCHES (1, 2, 4, 8, ...
 * rows at a time) rather than one row at a time: a full `JSON.stringify` of
 * the whole table is the expensive step here, and re-running it after every
 * single row's trim is O(rows) stringify calls on a table that can hold up
 * to MAX_TABLE_ROWS (500) rows, each debounced save. Doubling the batch size
 * bounds that to O(log rows) calls instead, and still trims no more than it
 * has to - the common case (a handful of oversized rows) still stops after
 * the first batch or two.
 */
export function serializeMessageTable(rows: ReadonlyArray<MessageThreadRow>): string {
  const normalized = rows.map((r) => {
    const state: MessageRowState = r.state === "drafting" ? "pending" : r.state;
    return {
      ...r,
      state,
      error: state === "failed" ? r.error : undefined,
    };
  });

  let json = JSON.stringify({ v: MESSAGE_TABLE_VERSION, rows: normalized });
  if (byteLength(json) <= MAX_TABLE_BYTES) return json;

  const oldestFirst = normalized
    .map((r, i) => ({ i, firstSeenAt: r.firstSeenAt }))
    .sort((a, b) => a.firstSeenAt - b.firstSeenAt);

  const working = normalized.slice();
  let trimmedThrough = 0;
  let batchSize = 1;
  while (byteLength(json) > MAX_TABLE_BYTES && trimmedThrough < oldestFirst.length) {
    const batchEnd = Math.min(trimmedThrough + batchSize, oldestFirst.length);
    for (let k = trimmedThrough; k < batchEnd; k++) {
      const { i } = oldestFirst[k];
      const row = working[i];
      if (row.messagesTrimmed) continue;
      const latest = latestIncomingMessage(row.messages);
      working[i] = {
        ...row,
        messages: latest ? [latest] : row.messages.slice(-1),
        messagesTrimmed: true,
      };
    }
    trimmedThrough = batchEnd;
    batchSize *= 2;
    json = JSON.stringify({ v: MESSAGE_TABLE_VERSION, rows: working });
  }

  return json;
}

/**
 * Never throws (deserializeReplyTable's own discipline). A version mismatch,
 * or a row with no usable `id`, or a row that coerces to zero messages, is
 * dropped rather than failing the whole load.
 */
export function deserializeMessageTable(raw: string | null): MessageThreadRow[] {
  try {
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const obj = parsed as Record<string, unknown>;
    if (obj.v !== MESSAGE_TABLE_VERSION) return [];
    if (!Array.isArray(obj.rows)) return [];

    const rows: MessageThreadRow[] = [];
    obj.rows.forEach((rawRow: unknown, index: number) => {
      if (!rawRow || typeof rawRow !== "object") return;
      const r = rawRow as Record<string, unknown>;

      const id = typeof r.id === "string" ? r.id.trim() : "";
      if (!id) return; // no usable primary key - this row is unrecoverable

      const previewOnly: MessageThreadRow["previewOnly"] = r.previewOnly === true ? true : undefined;
      const messages = coerceThreadMessages(r.messages);
      // M6: "a row that coerces to zero messages is dropped" - EXCEPT a
      // previewOnly row, which is known only from a list-pane reading and
      // legitimately carries no messages at all (M9's own vocabulary; a
      // previewOnly row is never drafted until a thread-pane frame supplies
      // a body, but it must still survive a reload so the instructor does
      // not lose the subject/student the list pane already gave them).
      if (messages.length === 0 && !previewOnly) return;

      const subject = typeof r.subject === "string" ? r.subject : "";
      const student = typeof r.student === "string" ? r.student : "";
      const omittedMessages = typeof r.omittedMessages === "number" && Number.isFinite(r.omittedMessages) ? r.omittedMessages : 0;
      const messagesTrimmed: MessageThreadRow["messagesTrimmed"] = r.messagesTrimmed === true ? true : undefined;
      const answered = r.answered === true;
      const reply = typeof r.reply === "string" ? r.reply : "";

      const stateRaw = typeof r.state === "string" ? r.state : "";
      let state: MessageRowState = VALID_STATES.has(stateRaw) ? (stateRaw as MessageRowState) : "pending";
      if (state === "drafting") state = "pending";

      const error = state === "failed" && typeof r.error === "string" ? r.error : undefined;
      const userEdited = typeof r.userEdited === "boolean" ? r.userEdited : false;
      const skipped: MessageThreadRow["skipped"] = r.skipped === true ? true : undefined;
      const handledAt = typeof r.handledAt === "number" && Number.isFinite(r.handledAt) ? r.handledAt : undefined;
      const firstSeenAt = typeof r.firstSeenAt === "number" && Number.isFinite(r.firstSeenAt) ? r.firstSeenAt : 0;
      const order = typeof r.order === "number" && Number.isFinite(r.order) ? r.order : index;

      const canvas = coerceCanvasMatch(r.canvas);
      const savedDraft = coerceSavedDraft(r.savedDraft);
      const sent = coerceSent(r.sent);
      const matchOutcome = canvas ? undefined : coerceMatchOutcome(r.matchOutcome); // never both (M15: cleared when canvas is set)
      const sendAttempt = coerceSendAttempt(r.sendAttempt);
      // M17: "on load a row with sendAttempt and no sent gets the M17
      // failure text as sendError" - a send that was still in flight when
      // the page closed/reloaded has no way to confirm what happened, so it
      // is hydrated as failed (showing the Check control) rather than
      // silently looking untouched. A row that already carries its own
      // stored sendError keeps it verbatim.
      const storedSendError = typeof r.sendError === "string" && r.sendError ? r.sendError : undefined;
      const sendError = !sent && sendAttempt ? storedSendError ?? SEND_FAILURE_TEXT : undefined;

      rows.push({
        id,
        subject,
        student,
        messages,
        omittedMessages,
        messagesTrimmed,
        previewOnly,
        answered,
        reply,
        state,
        error,
        userEdited,
        skipped,
        handledAt,
        firstSeenAt,
        order,
        canvas,
        savedDraft,
        sent,
        matchOutcome,
        sendAttempt: sent ? undefined : sendAttempt,
        sendError,
      });
    });

    return rows;
  } catch {
    return [];
  }
}
