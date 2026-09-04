// Unit tests for message-replies-log.ts (M19, docs/message-replies-
// acceptance-criteria.md section 8 and 9).
//
// This file imports no helper from any sibling *.test.ts - duplicates its
// own fixture, per this repo's own "no cross-test-file imports" rule.

import { describe, it, expect } from "vitest";
import {
  buildMessageRepliesLogRowEntry,
  buildMessageRepliesLog,
  makeMessageRepliesLogBatch,
  summarizeMessageRepliesLog,
  messageRepliesLogSummaryLine,
  formatMessageRepliesLogCsv,
  formatMessageRepliesLogJson,
  messageRepliesLogFileName,
  type MessageRepliesLogInput,
  type MessageRepliesRunLog,
} from "./message-replies-log";
import type { MessageThreadRow } from "./message-serialization";

const AT = "2026-08-31T09:00:00.000Z";

function row(overrides: Partial<MessageThreadRow> & { id: string }): MessageThreadRow {
  return {
    subject: "Question about homework 3",
    student: "Ana Ruiz",
    messages: [],
    omittedMessages: 0,
    answered: false,
    reply: "",
    state: "pending",
    userEdited: false,
    firstSeenAt: 0,
    order: 0,
    ...overrides,
  };
}

function emptyInput(overrides: Partial<MessageRepliesLogInput> = {}): MessageRepliesLogInput {
  return {
    startedAt: "",
    endedAt: "",
    courseName: "",
    ingredients: [],
    formality: "balanced",
    addressByName: true,
    signoffSet: false,
    skipAnswered: true,
    framesCaptured: 0,
    droppedFrames: 0,
    stalled: false,
    batches: [],
    notices: [],
    retries: [],
    rawRows: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildMessageRepliesLogRowEntry - per-row mapping (single-arg, per section
// 9's fixed signature).
// ---------------------------------------------------------------------------

describe("buildMessageRepliesLogRowEntry", () => {
  it("maps absent optional fields to their documented empty values, never undefined", () => {
    const r = row({ id: "r1" });
    const entry = buildMessageRepliesLogRowEntry(r);
    expect(entry).toEqual({
      rowId: "r1",
      subject: "Question about homework 3",
      student: "Ana Ruiz",
      messageCount: 0,
      latestIncomingAt: "",
      answered: false,
      state: "pending",
      userEdited: false,
      retried: false,
      error: "",
      matchedConversationId: null,
      savedDraftId: "",
      sentAt: null,
      messages: [],
      reply: "",
    });
  });

  it("is always retried: false from this function alone - buildMessageRepliesLog is the one that overlays the true value", () => {
    const r = row({ id: "r1" });
    expect(buildMessageRepliesLogRowEntry(r).retried).toBe(false);
  });

  it("carries a verbatim error message through unchanged", () => {
    const r = row({ id: "r1", state: "failed", error: "429 Too Many Requests from the model provider" });
    const entry = buildMessageRepliesLogRowEntry(r);
    expect(entry.error).toBe("429 Too Many Requests from the model provider");
    expect(entry.state).toBe("failed");
  });

  it("reads the latest incoming message's raw sentAt via latestIncoming(), not the newest message overall", () => {
    const r = row({
      id: "r1",
      messages: [
        { sender: "Ana Ruiz", text: "first", fromMe: false, sentAt: "Sep 1 at 9:00am", precision: "minute" },
        { sender: "Dr. Ruiz", text: "reply", fromMe: true, sentAt: "Sep 2 at 10:00am", precision: "minute" },
        { sender: "Ana Ruiz", text: "follow-up", fromMe: false, sentAt: "Sep 3 at 11:00am", precision: "minute" },
      ],
    });
    const entry = buildMessageRepliesLogRowEntry(r);
    expect(entry.latestIncomingAt).toBe("Sep 3 at 11:00am");
  });

  it("maps the canvas/savedDraft/sent snapshots when present", () => {
    const r = row({
      id: "r1",
      canvas: { conversationId: 42, matchedBy: "subject+student", matchedAt: 1000, subject: "x", participants: ["Ana Ruiz"], messageCount: 2 },
      savedDraft: { id: "draft-9", at: 2000 },
      sent: { at: 3000, conversationId: 42, messageCount: 3 },
    });
    const entry = buildMessageRepliesLogRowEntry(r);
    expect(entry.matchedConversationId).toBe(42);
    expect(entry.savedDraftId).toBe("draft-9");
    expect(entry.sentAt).toBe(3000);
  });

  it("carries messages and reply through verbatim (JSON-only fields)", () => {
    const r = row({
      id: "r1",
      reply: "Thanks for reaching out - here is the answer.",
      messages: [{ sender: "Ana Ruiz", text: "Can you help?", fromMe: false, precision: "none" }],
    });
    const entry = buildMessageRepliesLogRowEntry(r);
    expect(entry.reply).toBe("Thanks for reaching out - here is the answer.");
    expect(entry.messages).toEqual([{ sender: "Ana Ruiz", text: "Can you help?", fromMe: false, precision: "none" }]);
  });
});

// ---------------------------------------------------------------------------
// buildMessageRepliesLog - retried overlay, field pass-through, row ordering.
// ---------------------------------------------------------------------------

describe("buildMessageRepliesLog", () => {
  it("builds rows in rawRows order, never reordering", () => {
    const r1 = row({ id: "r1", student: "Bob" });
    const r2 = row({ id: "r2", student: "Ana" });
    const log = buildMessageRepliesLog(emptyInput({ rawRows: [r1, r2] }));
    expect(log.rows.map((r) => r.rowId)).toEqual(["r1", "r2"]);
  });

  it("overlays retried: true for exactly the row ids present in input.retries", () => {
    const r1 = row({ id: "r1" });
    const r2 = row({ id: "r2" });
    const log = buildMessageRepliesLog(emptyInput({ rawRows: [r1, r2], retries: [{ at: AT, rowId: "r1" }] }));
    expect(log.rows.find((r) => r.rowId === "r1")?.retried).toBe(true);
    expect(log.rows.find((r) => r.rowId === "r2")?.retried).toBe(false);
  });

  it("passes every run-level field through unchanged, and drops rawRows from the output", () => {
    const input = emptyInput({
      startedAt: AT,
      endedAt: "2026-08-31T09:05:00.000Z",
      courseName: "CS 101",
      ingredients: ["acknowledge", "answer"],
      addressByName: false,
      formality: "formal",
      signoffSet: true,
      skipAnswered: false,
      framesCaptured: 12,
      droppedFrames: 3,
      stalled: true,
    });
    const log = buildMessageRepliesLog(input);
    expect(log.startedAt).toBe(AT);
    expect(log.endedAt).toBe("2026-08-31T09:05:00.000Z");
    expect(log.courseName).toBe("CS 101");
    expect(log.ingredients).toEqual(["acknowledge", "answer"]);
    expect(log.addressByName).toBe(false);
    expect(log.formality).toBe("formal");
    expect(log.signoffSet).toBe(true);
    expect(log.skipAnswered).toBe(false);
    expect(log.framesCaptured).toBe(12);
    expect(log.droppedFrames).toBe(3);
    expect(log.stalled).toBe(true);
    expect((log as unknown as { rawRows?: unknown }).rawRows).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// makeMessageRepliesLogBatch - defaults and the derived messagesDuplicate.
// ---------------------------------------------------------------------------

describe("makeMessageRepliesLogBatch", () => {
  it("defaults every optional field to its 'nothing happened' value", () => {
    expect(makeMessageRepliesLogBatch({ at: AT, framesInBatch: 4 })).toEqual({
      at: AT,
      framesInBatch: 4,
      messagesExtracted: 0,
      messagesAdded: 0,
      messagesDuplicate: 0,
      capped: false,
      discarded: false,
      error: "",
    });
  });

  it("derives messagesDuplicate as messagesExtracted - messagesAdded", () => {
    const b = makeMessageRepliesLogBatch({ at: AT, framesInBatch: 2, messagesExtracted: 5, messagesAdded: 3 });
    expect(b.messagesDuplicate).toBe(2);
  });

  it("forces messagesDuplicate to 0 for a discarded batch", () => {
    const b = makeMessageRepliesLogBatch({ at: AT, framesInBatch: 1, messagesExtracted: 4, discarded: true });
    expect(b.messagesAdded).toBe(0);
    expect(b.messagesDuplicate).toBe(0);
    expect(b.messagesExtracted).toBe(4);
    expect(b.discarded).toBe(true);
  });

  it("clamps messagesDuplicate to 0 rather than going negative when messagesAdded exceeds messagesExtracted", () => {
    const b = makeMessageRepliesLogBatch({ at: AT, framesInBatch: 1, messagesExtracted: 2, messagesAdded: 5 });
    expect(b.messagesDuplicate).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// summarizeMessageRepliesLog.
// ---------------------------------------------------------------------------

describe("summarizeMessageRepliesLog", () => {
  it("counts every row into exactly one of the four exhaustive draft-state buckets, summing to totalRows", () => {
    const rawRows: MessageThreadRow[] = [
      row({ id: "r1", state: "pending" }),
      row({ id: "r2", state: "drafting" }),
      row({ id: "r3", state: "ready" }),
      row({ id: "r4", state: "failed", error: "boom" }),
      row({ id: "r5", state: "failed", error: "boom again" }),
    ];
    const log = buildMessageRepliesLog(emptyInput({ rawRows, retries: [{ at: AT, rowId: "r4" }] }));
    const summary = summarizeMessageRepliesLog(log);
    expect(summary.totalRows).toBe(5);
    expect(summary.pending).toBe(1);
    expect(summary.drafting).toBe(1);
    expect(summary.ready).toBe(1);
    expect(summary.failed).toBe(2);
    expect(summary.retriedRows).toBe(1);
    expect(summary.pending + summary.drafting + summary.ready + summary.failed).toBe(summary.totalRows);
  });

  // The real guard against a fifth, unhandled MessageRowState is TypeScript's
  // compile-time exhaustiveness check on the switch in
  // summarizeMessageRepliesLog (a widened union with no matching branch is a
  // `tsc` error, not a silent miscount, per REGRESSION entry 370's S2) - not
  // this test. This test only pins the CURRENT four buckets summing to
  // `totalRows`, matching discussion-replies-log.test.ts's own equivalent.
  it("draft-state buckets are exhaustive over the real MessageRowState union", () => {
    const rawRows: MessageThreadRow[] = [
      row({ id: "r1", state: "pending" }),
      row({ id: "r2", state: "drafting" }),
      row({ id: "r3", state: "ready" }),
      row({ id: "r4", state: "failed" }),
    ];
    const log = buildMessageRepliesLog(emptyInput({ rawRows }));
    const summary = summarizeMessageRepliesLog(log);
    expect(summary.pending).toBe(1);
    expect(summary.drafting).toBe(1);
    expect(summary.ready).toBe(1);
    expect(summary.failed).toBe(1);
  });

  it("counts answered, sent and savedDraft independently - a row can count toward more than one", () => {
    const rawRows: MessageThreadRow[] = [
      row({ id: "r1", state: "ready", answered: true }),
      row({ id: "r2", state: "ready", sent: { at: 1000, conversationId: 1, messageCount: 2 } }),
      row({ id: "r3", state: "ready", savedDraft: { id: "d1", at: 500 } }),
      row({
        id: "r4",
        state: "ready",
        answered: true,
        sent: { at: 1500, conversationId: 2, messageCount: 4 },
        savedDraft: { id: "d2", at: 600 },
      }),
    ];
    const log = buildMessageRepliesLog(emptyInput({ rawRows }));
    const summary = summarizeMessageRepliesLog(log);
    expect(summary.answered).toBe(2);
    expect(summary.sent).toBe(2);
    expect(summary.savedDraft).toBe(2);
  });

  it("sums extracted/added/duplicate across multiple batches, and counts capped/discarded batches separately", () => {
    const log = buildMessageRepliesLog(
      emptyInput({
        batches: [
          makeMessageRepliesLogBatch({ at: AT, framesInBatch: 2, messagesExtracted: 3, messagesAdded: 3 }),
          makeMessageRepliesLogBatch({ at: AT, framesInBatch: 2, messagesExtracted: 4, messagesAdded: 2, capped: true }),
          makeMessageRepliesLogBatch({ at: AT, framesInBatch: 1, messagesExtracted: 1, discarded: true }),
        ],
      })
    );
    const summary = summarizeMessageRepliesLog(log);
    expect(summary.batchesSent).toBe(3);
    expect(summary.messagesExtractedTotal).toBe(8);
    expect(summary.messagesAddedTotal).toBe(5);
    expect(summary.messagesDuplicateTotal).toBe(2); // 0 + 2 + 0(discarded), not 3
    expect(summary.cappedBatches).toBe(1);
    expect(summary.discardedBatches).toBe(1);
    expect(summary.messagesDiscardedTotal).toBe(1);
  });

  it("summarizes an empty/never-started run as all zeros, not an error", () => {
    const log = buildMessageRepliesLog(emptyInput());
    expect(summarizeMessageRepliesLog(log)).toEqual({
      totalRows: 0,
      pending: 0,
      drafting: 0,
      ready: 0,
      failed: 0,
      answered: 0,
      sent: 0,
      savedDraft: 0,
      retriedRows: 0,
      batchesSent: 0,
      framesCaptured: 0,
      messagesExtractedTotal: 0,
      messagesAddedTotal: 0,
      messagesDuplicateTotal: 0,
      cappedBatches: 0,
      discardedBatches: 0,
      messagesDiscardedTotal: 0,
      noticeCount: 0,
      droppedFrames: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// messageRepliesLogSummaryLine - M18's frozen oracle sentence.
// ---------------------------------------------------------------------------

describe("messageRepliesLogSummaryLine", () => {
  it("renders M18's exact frozen oracle sentence: '12 threads captured across 3 batches - 9 drafted, 0 failed, 3 already answered, 2 sent, 1 saved as a draft, 0 notices.'", () => {
    const rawRows: MessageThreadRow[] = [
      ...Array.from({ length: 9 }, (_, i) => row({ id: `ready-${i}`, state: "ready" as const })),
      ...Array.from({ length: 3 }, (_, i) => row({ id: `answered-${i}`, state: "pending" as const, answered: true })),
    ];
    // Overlay sent/savedDraft on two of the ready rows and one of them,
    // respectively, so the six quoted numbers are all independently correct.
    rawRows[0] = { ...rawRows[0], sent: { at: 1, conversationId: 1, messageCount: 1 } };
    rawRows[1] = { ...rawRows[1], sent: { at: 2, conversationId: 2, messageCount: 1 } };
    rawRows[2] = { ...rawRows[2], savedDraft: { id: "d1", at: 3 } };

    const log = buildMessageRepliesLog(
      emptyInput({
        rawRows,
        batches: [
          makeMessageRepliesLogBatch({ at: AT, framesInBatch: 4, messagesExtracted: 12, messagesAdded: 12 }),
          makeMessageRepliesLogBatch({ at: AT, framesInBatch: 4, messagesExtracted: 3, messagesAdded: 0 }),
          makeMessageRepliesLogBatch({ at: AT, framesInBatch: 2, messagesExtracted: 1, messagesAdded: 0 }),
        ],
      })
    );
    const summary = summarizeMessageRepliesLog(log);
    expect(summary.totalRows).toBe(12);
    expect(summary.batchesSent).toBe(3);
    expect(summary.ready).toBe(9);
    expect(summary.failed).toBe(0);
    expect(summary.answered).toBe(3);
    expect(summary.sent).toBe(2);
    expect(summary.savedDraft).toBe(1);
    expect(summary.noticeCount).toBe(0);
    expect(messageRepliesLogSummaryLine(summary)).toBe(
      "12 threads captured across 3 batches - 9 drafted, 0 failed, 3 already answered, 2 sent, 1 saved as a draft, 0 notices."
    );
  });

  it("never gates on there being any rows - an empty run still gets a true, useful sentence with singular batch/notice forms unused", () => {
    const summary = summarizeMessageRepliesLog(buildMessageRepliesLog(emptyInput()));
    expect(messageRepliesLogSummaryLine(summary)).toBe(
      "0 threads captured across 0 batches - 0 drafted, 0 failed, 0 already answered, 0 sent, 0 saved as a draft, 0 notices."
    );
  });

  it("uses the singular 'thread'/'batch'/'notice' forms at exactly 1", () => {
    const rawRows = [row({ id: "r1", state: "ready" })];
    const log = buildMessageRepliesLog(
      emptyInput({
        rawRows,
        batches: [makeMessageRepliesLogBatch({ at: AT, framesInBatch: 1, messagesExtracted: 1, messagesAdded: 1 })],
        notices: [{ at: AT, text: "one notice" }],
      })
    );
    const summary = summarizeMessageRepliesLog(log);
    expect(messageRepliesLogSummaryLine(summary)).toBe(
      "1 thread captured across 1 batch - 1 drafted, 0 failed, 0 already answered, 0 sent, 0 saved as a draft, 1 notice."
    );
  });
});

// ---------------------------------------------------------------------------
// formatMessageRepliesLogCsv - frozen header, message bodies/replies never
// appear in the CSV.
// ---------------------------------------------------------------------------

describe("formatMessageRepliesLogCsv", () => {
  it("renders the exact frozen CSV for a small run with a match, a save, a send, a failure, a notice and a retry", () => {
    const rows: MessageThreadRow[] = [
      row({
        id: "r1",
        subject: "Question about homework 3",
        student: "Ana Ruiz",
        state: "ready",
        messages: [{ sender: "Ana Ruiz", text: "Can you help?", fromMe: false, sentAt: "Sep 1 at 9:00am", precision: "minute" }],
        canvas: { conversationId: 42, matchedBy: "subject+student", matchedAt: 1000, subject: "Question about homework 3", participants: ["Ana Ruiz"], messageCount: 1 },
        savedDraft: { id: "draft-9", at: 2000 },
      }),
      row({
        id: "r2",
        subject: "Grade, question",
        student: "Bob, Jr.",
        state: "failed",
        error: "429 Too Many Requests, retry later",
      }),
      row({
        id: "r3",
        subject: "(no subject)",
        student: "Cy Lee",
        state: "ready",
        answered: true,
        sent: { at: 3000, conversationId: 43, messageCount: 4 },
      }),
    ];
    const log = buildMessageRepliesLog(
      emptyInput({
        startedAt: AT,
        endedAt: "2026-08-31T09:05:00.000Z",
        courseName: "CS 101",
        ingredients: ["acknowledge"],
        formality: "balanced",
        addressByName: true,
        signoffSet: true,
        skipAnswered: true,
        framesCaptured: 6,
        droppedFrames: 1,
        stalled: false,
        batches: [
          makeMessageRepliesLogBatch({ at: AT, framesInBatch: 3, messagesExtracted: 2, messagesAdded: 2 }),
          makeMessageRepliesLogBatch({ at: "2026-08-31T09:02:00.000Z", framesInBatch: 3, messagesExtracted: 1, messagesAdded: 0 }),
        ],
        notices: [{ at: AT, text: "Some of the screen could not be read: rate limited, try again" }],
        retries: [{ at: "2026-08-31T09:03:00.000Z", rowId: "r2" }],
        rawRows: rows,
      })
    );

    const csv = formatMessageRepliesLogCsv(log);
    const expected = [
      "=== Run ===",
      "Field,Value",
      "Started,2026-08-31T09:00:00.000Z",
      "Ended,2026-08-31T09:05:00.000Z",
      "Course,CS 101",
      "Ingredients,acknowledge",
      "Formality,balanced",
      "Address by name,Yes",
      "Signoff set,Yes",
      "Skip answered threads,Yes",
      "Frames captured,6",
      "Batches sent,2",
      "Dropped frames,1",
      "Stalled at export time,No",
      "",
      "=== Batches ===",
      "At,Frames in batch,Messages extracted,Messages added,Messages duplicate,Capped,Discarded,Error",
      "2026-08-31T09:00:00.000Z,3,2,2,0,No,No,",
      "2026-08-31T09:02:00.000Z,3,1,0,1,No,No,",
      "",
      "=== Notices ===",
      "At,Text",
      '2026-08-31T09:00:00.000Z,"Some of the screen could not be read: rate limited, try again"',
      "",
      "=== Retries ===",
      "At,Row ID",
      "2026-08-31T09:03:00.000Z,r2",
      "",
      "=== Rows ===",
      "Row ID,Subject,Student,Message count,Latest incoming at,Answered,State,User edited,Retried,Error,Matched conversation ID,Saved draft ID,Sent at",
      "r1,Question about homework 3,Ana Ruiz,1,Sep 1 at 9:00am,No,ready,No,No,,42,draft-9,",
      'r2,"Grade, question","Bob, Jr.",0,,No,failed,No,Yes,"429 Too Many Requests, retry later",,,',
      "r3,(no subject),Cy Lee,0,,Yes,ready,No,No,,,,3000",
    ].join("\r\n");
    expect(csv).toBe(expected);
  });

  it("escapes a double quote and an embedded newline in a cell, not only the comma path", () => {
    const r = row({
      id: "r1",
      subject: 'Say "hello" to the class',
      student: "Ana\nRuiz",
    });
    const csv = formatMessageRepliesLogCsv(buildMessageRepliesLog(emptyInput({ rawRows: [r] })));
    expect(csv).toContain('"Say ""hello"" to the class"');
    expect(csv).toContain('"Ana\nRuiz"');
  });

  it("never renders a message body or the drafted reply text anywhere in the CSV", () => {
    const r = row({
      id: "r1",
      reply: "THIS-REPLY-TEXT-MUST-NEVER-APPEAR-IN-CSV",
      messages: [{ sender: "Ana Ruiz", text: "THIS-MESSAGE-BODY-MUST-NEVER-APPEAR-IN-CSV", fromMe: false, precision: "none" }],
    });
    const csv = formatMessageRepliesLogCsv(buildMessageRepliesLog(emptyInput({ rawRows: [r] })));
    expect(csv).not.toContain("THIS-REPLY-TEXT-MUST-NEVER-APPEAR-IN-CSV");
    expect(csv).not.toContain("THIS-MESSAGE-BODY-MUST-NEVER-APPEAR-IN-CSV");
  });

  it("still produces a full, section-headed CSV for a run that captured nothing", () => {
    const csv = formatMessageRepliesLogCsv(buildMessageRepliesLog(emptyInput()));
    expect(csv).toContain("=== Run ===");
    expect(csv).toContain("=== Batches ===");
    expect(csv).toContain("=== Notices ===");
    expect(csv).toContain("=== Retries ===");
    expect(csv).toContain("=== Rows ===");
    expect(csv).toContain("Started,");
  });

  it("carries a verbatim error message through into the CSV text unmodified", () => {
    const r = row({ id: "r1", state: "failed", error: "TypeError: Cannot read properties of null (reading 'foo')" });
    const csv = formatMessageRepliesLogCsv(buildMessageRepliesLog(emptyInput({ rawRows: [r] })));
    expect(csv).toContain("TypeError: Cannot read properties of null (reading 'foo')");
  });
});

// ---------------------------------------------------------------------------
// formatMessageRepliesLogJson - carries messages/reply, unlike the CSV.
// ---------------------------------------------------------------------------

describe("formatMessageRepliesLogJson", () => {
  it("is an object (never a bare array) carrying exportedAt plus every run field, including rows with full message bodies and the reply", () => {
    const r = row({
      id: "r1",
      reply: "Here is the full reply text.",
      messages: [{ sender: "Ana Ruiz", text: "Full message body.", fromMe: false, precision: "none" }],
    });
    const log = buildMessageRepliesLog(emptyInput({ courseName: "CS 101", rawRows: [r] }));
    const json = formatMessageRepliesLogJson(log, { exportedAt: "2026-08-31T10:00:00.000Z" });
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(false);
    expect(parsed.exportedAt).toBe("2026-08-31T10:00:00.000Z");
    expect(parsed.courseName).toBe("CS 101");
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].reply).toBe("Here is the full reply text.");
    expect(parsed.rows[0].messages[0].text).toBe("Full message body.");
  });

  it("round-trips an empty run to valid, parseable JSON with an empty rows array", () => {
    const json = formatMessageRepliesLogJson(buildMessageRepliesLog(emptyInput()), { exportedAt: AT });
    const parsed = JSON.parse(json);
    expect(parsed.rows).toEqual([]);
    expect(parsed.batches).toEqual([]);
    expect(parsed.notices).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// messageRepliesLogFileName.
// ---------------------------------------------------------------------------

describe("messageRepliesLogFileName", () => {
  it("builds message-replies-log-<course-slug>-<YYYYMMDD-HHMMSS>.<ext>", () => {
    expect(messageRepliesLogFileName("CS 101: Intro", "csv", "2026-08-31T09:05:07.123Z")).toBe(
      "message-replies-log-cs-101-intro-20260831-090507.csv"
    );
  });

  it("drops the course segment entirely (no dangling dash) when the course name slugs to nothing", () => {
    expect(messageRepliesLogFileName("", "json", "2026-08-31T09:05:07.123Z")).toBe(
      "message-replies-log-20260831-090507.json"
    );
  });
});

// Type-only reference so `MessageRepliesRunLog` is exercised by the compiler
// in this test file too (tsc, not vitest, is the guard here).
const _typeCheck: MessageRepliesRunLog = buildMessageRepliesLog(emptyInput());
void _typeCheck;
