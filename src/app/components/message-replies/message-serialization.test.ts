import { describe, it, expect } from "vitest";
import {
  MESSAGE_TABLE_VERSION,
  MAX_THREAD_MESSAGES,
  MAX_MESSAGE_CHARS,
  MAX_TABLE_BYTES,
  SEND_FAILURE_TEXT,
  serializeMessageTable,
  deserializeMessageTable,
  coerceThreadMessages,
  type MessageThreadRow,
  type ThreadMessage,
} from "./message-serialization";

function makeMessage(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return { sender: "Devon Alvarez", text: "Can you clarify part 2?", fromMe: false, precision: "minute", sentAtMs: 1000, sentAt: "Sep 3 at 2:14pm", ...overrides };
}

function makeRow(overrides: Partial<MessageThreadRow> = {}): MessageThreadRow {
  return {
    id: "msg-1-0",
    subject: "Question about HW3",
    student: "Devon Alvarez",
    messages: [makeMessage()],
    omittedMessages: 0,
    answered: false,
    reply: "",
    state: "pending",
    userEdited: false,
    firstSeenAt: 1000,
    order: 0,
    ...overrides,
  };
}

describe("constants", () => {
  it("MESSAGE_TABLE_VERSION / MAX_THREAD_MESSAGES / MAX_MESSAGE_CHARS / MAX_TABLE_BYTES", () => {
    expect(MESSAGE_TABLE_VERSION).toBe(1);
    expect(MAX_THREAD_MESSAGES).toBe(12);
    expect(MAX_MESSAGE_CHARS).toBe(800);
    expect(MAX_TABLE_BYTES).toBe(3_500_000);
  });
});

describe("serializeMessageTable / deserializeMessageTable round trip", () => {
  it("round-trips a well-formed table", () => {
    const rows = [makeRow({ id: "a" }), makeRow({ id: "b", state: "ready", reply: "Sure, happy to help." })];
    const restored = deserializeMessageTable(serializeMessageTable(rows));
    expect(restored).toEqual(rows);
  });

  it("normalizes a drafting row to pending on write", () => {
    const rows = [makeRow({ id: "a", state: "drafting" })];
    const restored = deserializeMessageTable(serializeMessageTable(rows));
    expect(restored[0].state).toBe("pending");
  });

  it("preserves the error reason only for a failed row", () => {
    const rows = [makeRow({ id: "a", state: "failed", error: "Reading the screen failed: 429" })];
    const restored = deserializeMessageTable(serializeMessageTable(rows));
    expect(restored[0].state).toBe("failed");
    expect(restored[0].error).toBe("Reading the screen failed: 429");
  });

  it("drops a stale error on a row that is no longer failed", () => {
    const rows = [makeRow({ id: "a", state: "ready", error: "stale message" })];
    const restored = deserializeMessageTable(serializeMessageTable(rows));
    expect(restored[0].error).toBeUndefined();
  });

  it("round-trips canvas/savedDraft/sent when present", () => {
    const rows = [
      makeRow({
        id: "a",
        canvas: { conversationId: 42, matchedBy: "subject+student", matchedAt: 500, subject: "Question about HW3", participants: ["Devon Alvarez", "Dr. Ruiz"], messageCount: 3 },
        savedDraft: { id: "draft-1", at: 900 },
        sent: { at: 950, conversationId: 42, messageCount: 4, messageId: 77 },
      }),
    ];
    const restored = deserializeMessageTable(serializeMessageTable(rows));
    expect(restored[0].canvas).toEqual(rows[0].canvas);
    expect(restored[0].savedDraft).toEqual(rows[0].savedDraft);
    expect(restored[0].sent).toEqual(rows[0].sent);
  });

  it("preserves previewOnly/messagesTrimmed/skipped/handledAt when set, and leaves them absent when not", () => {
    const rows = [makeRow({ id: "a", previewOnly: true, skipped: true, handledAt: 1234 })];
    const restored = deserializeMessageTable(serializeMessageTable(rows));
    expect(restored[0].previewOnly).toBe(true);
    expect(restored[0].skipped).toBe(true);
    expect(restored[0].handledAt).toBe(1234);
    const plain = deserializeMessageTable(serializeMessageTable([makeRow({ id: "b" })]));
    expect(plain[0].previewOnly).toBeUndefined();
    expect(plain[0].skipped).toBeUndefined();
    expect(plain[0].handledAt).toBeUndefined();
  });

  it("round-trips matchOutcome, and never alongside a canvas match", () => {
    const rows = [makeRow({ id: "a", matchOutcome: "ambiguous" })];
    const restored = deserializeMessageTable(serializeMessageTable(rows));
    expect(restored[0].matchOutcome).toBe("ambiguous");

    const matchedAndOutcome = [
      makeRow({
        id: "b",
        matchOutcome: "none",
        canvas: { conversationId: 1, matchedBy: "subject+student", matchedAt: 1, subject: "s", participants: [], messageCount: 1 },
      }),
    ];
    const restoredMatched = deserializeMessageTable(serializeMessageTable(matchedAndOutcome));
    expect(restoredMatched[0].matchOutcome).toBeUndefined();
    expect(restoredMatched[0].canvas).toBeDefined();
  });

  it("hydrates a row with sendAttempt and no sent to the M17 failure text on load, but leaves a sent row's sendAttempt cleared", () => {
    const attemptOnly = [makeRow({ id: "a", sendAttempt: { at: 500, conversationId: 42 } })];
    const restored = deserializeMessageTable(serializeMessageTable(attemptOnly));
    expect(restored[0].sendAttempt).toEqual({ at: 500, conversationId: 42 });
    expect(restored[0].sendError).toBe(SEND_FAILURE_TEXT);

    const sentRow = [
      makeRow({
        id: "b",
        sendAttempt: { at: 500, conversationId: 42 },
        sent: { at: 600, conversationId: 42, messageCount: 1 },
      }),
    ];
    const restoredSent = deserializeMessageTable(serializeMessageTable(sentRow));
    expect(restoredSent[0].sendAttempt).toBeUndefined();
    expect(restoredSent[0].sendError).toBeUndefined();
  });

  it("keeps a row's own stored sendError verbatim rather than overwriting it with the generic text", () => {
    const rows = [makeRow({ id: "a", sendAttempt: { at: 500, conversationId: 42 }, sendError: "A specific, already-known failure." })];
    const restored = deserializeMessageTable(serializeMessageTable(rows));
    expect(restored[0].sendError).toBe("A specific, already-known failure.");
  });

  it("a previewOnly row survives with zero messages", () => {
    const raw = JSON.stringify({
      v: MESSAGE_TABLE_VERSION,
      rows: [{ ...makeRow({ id: "a" }), previewOnly: true, messages: [] }],
    });
    const restored = deserializeMessageTable(raw);
    expect(restored).toHaveLength(1);
    expect(restored[0].previewOnly).toBe(true);
    expect(restored[0].messages).toEqual([]);
  });
});

describe("version-mismatch and malformed-row paths", () => {
  it("returns [] for a version mismatch", () => {
    const raw = JSON.stringify({ v: 999, rows: [makeRow()] });
    expect(deserializeMessageTable(raw)).toEqual([]);
  });

  it("returns [] for null, unparseable JSON, a non-object, and a missing/non-array rows field", () => {
    expect(deserializeMessageTable(null)).toEqual([]);
    expect(deserializeMessageTable("not json")).toEqual([]);
    expect(deserializeMessageTable("42")).toEqual([]);
    expect(deserializeMessageTable(JSON.stringify({ v: MESSAGE_TABLE_VERSION }))).toEqual([]);
    expect(deserializeMessageTable(JSON.stringify({ v: MESSAGE_TABLE_VERSION, rows: "not an array" }))).toEqual([]);
  });

  it("drops a row with no usable id", () => {
    const raw = JSON.stringify({ v: MESSAGE_TABLE_VERSION, rows: [{ ...makeRow(), id: "" }] });
    expect(deserializeMessageTable(raw)).toEqual([]);
  });

  it("drops a row that coerces to zero messages", () => {
    const raw = JSON.stringify({ v: MESSAGE_TABLE_VERSION, rows: [{ ...makeRow(), messages: [] }] });
    expect(deserializeMessageTable(raw)).toEqual([]);
    const raw2 = JSON.stringify({ v: MESSAGE_TABLE_VERSION, rows: [{ ...makeRow(), messages: [{ sender: "X", text: "", fromMe: false, precision: "none" }] }] });
    expect(deserializeMessageTable(raw2)).toEqual([]);
  });

  it("skips a non-object row entry without failing the whole load", () => {
    const raw = JSON.stringify({ v: MESSAGE_TABLE_VERSION, rows: [null, 42, makeRow({ id: "ok" })] });
    const restored = deserializeMessageTable(raw);
    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe("ok");
  });

  it("drops a malformed canvas/savedDraft/sent field but keeps the row", () => {
    const raw = JSON.stringify({
      v: MESSAGE_TABLE_VERSION,
      rows: [{ ...makeRow(), canvas: { conversationId: "not a number" }, savedDraft: { id: "" }, sent: { at: "nope" } }],
    });
    const restored = deserializeMessageTable(raw);
    expect(restored).toHaveLength(1);
    expect(restored[0].canvas).toBeUndefined();
    expect(restored[0].savedDraft).toBeUndefined();
    expect(restored[0].sent).toBeUndefined();
  });

  it("falls back to defaults for missing/invalid scalar fields rather than throwing", () => {
    const raw = JSON.stringify({ v: MESSAGE_TABLE_VERSION, rows: [{ id: "a", messages: [makeMessage()] }] });
    const restored = deserializeMessageTable(raw);
    expect(restored[0].subject).toBe("");
    expect(restored[0].student).toBe("");
    expect(restored[0].reply).toBe("");
    expect(restored[0].state).toBe("pending");
    expect(restored[0].userEdited).toBe(false);
    expect(restored[0].answered).toBe(false);
    expect(restored[0].omittedMessages).toBe(0);
    expect(restored[0].order).toBe(0);
  });
});

describe("coerceThreadMessages", () => {
  it("drops entries whose text is not a non-empty string", () => {
    expect(coerceThreadMessages([{ sender: "X", text: "", fromMe: false, precision: "none" }])).toEqual([]);
    expect(coerceThreadMessages([{ sender: "X", fromMe: false, precision: "none" }])).toEqual([]);
    expect(coerceThreadMessages([{ sender: "X", text: 42, fromMe: false, precision: "none" }])).toEqual([]);
  });

  it("coerces fromMe strictly to v === true - any other value is false", () => {
    expect(coerceThreadMessages([{ sender: "X", text: "hi", fromMe: true, precision: "none" }])[0].fromMe).toBe(true);
    expect(coerceThreadMessages([{ sender: "X", text: "hi", fromMe: "true", precision: "none" }])[0].fromMe).toBe(false);
    expect(coerceThreadMessages([{ sender: "X", text: "hi", fromMe: 1, precision: "none" }])[0].fromMe).toBe(false);
    expect(coerceThreadMessages([{ sender: "X", text: "hi", precision: "none" }])[0].fromMe).toBe(false);
  });

  it("keeps sentAtMs only when finite, otherwise drops the field", () => {
    expect(coerceThreadMessages([{ sender: "X", text: "hi", fromMe: false, precision: "minute", sentAtMs: 500 }])[0].sentAtMs).toBe(500);
    expect(coerceThreadMessages([{ sender: "X", text: "hi", fromMe: false, precision: "minute", sentAtMs: NaN }])[0].sentAtMs).toBeUndefined();
    expect(coerceThreadMessages([{ sender: "X", text: "hi", fromMe: false, precision: "minute", sentAtMs: "500" }])[0].sentAtMs).toBeUndefined();
    expect(coerceThreadMessages([{ sender: "X", text: "hi", fromMe: false, precision: "minute" }])[0].sentAtMs).toBeUndefined();
  });

  it("falls back precision to 'none' for anything outside the three-member set", () => {
    expect(coerceThreadMessages([{ sender: "X", text: "hi", fromMe: false, precision: "bogus" }])[0].precision).toBe("none");
    expect(coerceThreadMessages([{ sender: "X", text: "hi", fromMe: false }])[0].precision).toBe("none");
  });

  it("returns [] for a non-array", () => {
    expect(coerceThreadMessages(null)).toEqual([]);
    expect(coerceThreadMessages("not an array")).toEqual([]);
  });

  it("skips non-object entries", () => {
    expect(coerceThreadMessages([null, 42, { sender: "X", text: "hi", fromMe: false, precision: "none" }])).toHaveLength(1);
  });
});

describe("MAX_TABLE_BYTES trimming", () => {
  it("leaves a small table untouched", () => {
    const rows = [makeRow({ id: "a" }), makeRow({ id: "b" })];
    const json = serializeMessageTable(rows);
    expect(json.length).toBeLessThan(MAX_TABLE_BYTES);
    const restored = deserializeMessageTable(json);
    expect(restored[0].messagesTrimmed).toBeUndefined();
  });

  it("trims oldest threads first, reducing messages to the latest incoming only, until the table fits", () => {
    const bigText = "x".repeat(200_000);
    const manyMessages = (n: number): ThreadMessage[] =>
      Array.from({ length: n }, (_, i) => makeMessage({ text: bigText, fromMe: i % 2 === 1, sentAtMs: 1000 + i, sentAt: undefined }));

    // Three rows, each already at the (post-merge) MAX_THREAD_MESSAGES cap
    // with large bodies - together well over MAX_TABLE_BYTES. firstSeenAt
    // ascending: "oldest" is trimmed first.
    const rows = [
      makeRow({ id: "oldest", firstSeenAt: 1, messages: manyMessages(MAX_THREAD_MESSAGES) }),
      makeRow({ id: "middle", firstSeenAt: 2, messages: manyMessages(MAX_THREAD_MESSAGES) }),
      makeRow({ id: "newest", firstSeenAt: 3, messages: manyMessages(MAX_THREAD_MESSAGES) }),
    ];

    const json = serializeMessageTable(rows);
    expect(json.length).toBeLessThanOrEqual(MAX_TABLE_BYTES);

    const restored = deserializeMessageTable(json);
    const byId = Object.fromEntries(restored.map((r) => [r.id, r]));
    // The oldest row was trimmed to its latest incoming message alone.
    expect(byId.oldest.messagesTrimmed).toBe(true);
    expect(byId.oldest.messages.length).toBe(1);
    expect(byId.oldest.messages[0].fromMe).toBe(false); // the latest incoming, not the newest overall (which is fromMe)
  });

  it("a row with no incoming message at all falls back to keeping its single newest message when trimmed", () => {
    const bigText = "x".repeat(200_000);
    const manyMessages = (n: number): ThreadMessage[] =>
      Array.from({ length: n }, (_, i) => makeMessage({ text: bigText, fromMe: true, sentAtMs: 1000 + i, sentAt: undefined }));

    const rows = [
      makeRow({ id: "oldest", firstSeenAt: 1, messages: manyMessages(MAX_THREAD_MESSAGES) }),
      makeRow({ id: "newest", firstSeenAt: 2, messages: manyMessages(MAX_THREAD_MESSAGES) }),
    ];
    const json = serializeMessageTable(rows);
    const restored = deserializeMessageTable(json);
    const oldest = restored.find((r) => r.id === "oldest");
    expect(oldest?.messagesTrimmed).toBe(true);
    expect(oldest?.messages).toHaveLength(1);
  });
});
