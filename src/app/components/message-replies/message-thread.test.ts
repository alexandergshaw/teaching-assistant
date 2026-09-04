import { describe, it, expect } from "vitest";
import {
  threadKey,
  parseInboxTimestamp,
  messageSimilarityDistance,
  isSameMessage,
  mergeCapturedMessages,
  latestIncoming,
  sortThreads,
  applySignoff,
} from "./message-thread";
import { MAX_THREAD_MESSAGES, MAX_MESSAGE_CHARS, type MessageThreadRow, type ThreadMessage } from "./message-serialization";

function makeMessage(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return { sender: "Devon Alvarez", text: "Can you clarify part 2?", fromMe: false, precision: "minute", sentAtMs: 1000, ...overrides };
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

describe("threadKey", () => {
  it("normalizes a real subject", () => {
    expect(threadKey("Question about HW3")).toBe(threadKey("  question about hw3  "));
    expect(threadKey("Question about HW3")).not.toBe("");
  });

  it("returns the '' sentinel for an empty subject", () => {
    expect(threadKey("")).toBe("");
    expect(threadKey("   ")).toBe("");
  });

  it("returns the '' sentinel for a literal '(no subject)' reading, case/spacing-insensitively", () => {
    expect(threadKey("(no subject)")).toBe("");
    expect(threadKey("(No Subject)")).toBe("");
    expect(threadKey("  (no subject)  ")).toBe("");
  });

  it("a real subject that merely CONTAINS 'no subject' as a substring is NOT the sentinel", () => {
    expect(threadKey("no subject line was printed here")).not.toBe("");
  });
});

describe("parseInboxTimestamp", () => {
  // capturedAtMs: 2026-09-03 (a Thursday), 10:00:00 local.
  const CAPTURED = new Date(2026, 8, 3, 10, 0, 0, 0).getTime();

  it("parses 'Mon D at H:MMam/pm' as minute precision, inferring the year", () => {
    const parsed = parseInboxTimestamp("Sep 2 at 2:14pm", CAPTURED);
    expect(parsed.precision).toBe("minute");
    expect(parsed.raw).toBe("Sep 2 at 2:14pm");
    const d = new Date(parsed.ms);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // September
    expect(d.getDate()).toBe(2);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(14);
  });

  it("rolls the inferred year back one when the no-year form would land more than 7 days in the future", () => {
    // "Sep 3 at 2:14pm" relative to a capture of Sep 3 (today) is fine (same
    // day), but a date more than 7 days ahead of the capture date (e.g. a
    // reading from late in the PREVIOUS year, captured now) must roll back.
    const parsed = parseInboxTimestamp("Dec 25 at 9:00am", CAPTURED);
    const d = new Date(parsed.ms);
    // Dec 25 of the CURRENT year (2026) is more than 7 days after the Sep 3
    // capture date, so the year rolls back to 2025.
    expect(d.getFullYear()).toBe(2025);
  });

  it("parses 'Mon D, YYYY' as day precision, using the explicit year given (never rolled back)", () => {
    const parsed = parseInboxTimestamp("Sep 3, 2025", CAPTURED);
    expect(parsed.precision).toBe("day");
    const d = new Date(parsed.ms);
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(3);
    expect(d.getHours()).toBe(12);
  });

  it("parses 'Today' and 'Yesterday' as day precision at 12:00 local", () => {
    const today = parseInboxTimestamp("Today", CAPTURED);
    expect(today.precision).toBe("day");
    const todayDate = new Date(today.ms);
    expect(todayDate.getDate()).toBe(3);
    expect(todayDate.getHours()).toBe(12);

    const yesterday = parseInboxTimestamp("Yesterday", CAPTURED);
    expect(yesterday.precision).toBe("day");
    const yesterdayDate = new Date(yesterday.ms);
    expect(yesterdayDate.getDate()).toBe(2);
    expect(yesterdayDate.getHours()).toBe(12);

    // Case-insensitive.
    expect(parseInboxTimestamp("today", CAPTURED).precision).toBe("day");
    expect(parseInboxTimestamp("YESTERDAY", CAPTURED).precision).toBe("day");
  });

  it("parses a bare time as minute precision, using the capture date", () => {
    const parsed = parseInboxTimestamp("2:14 PM", CAPTURED);
    expect(parsed.precision).toBe("minute");
    const d = new Date(parsed.ms);
    expect(d.getDate()).toBe(3);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(14);
  });

  it("anything unrecognised parses to precision 'none', keeping raw, with a non-finite ms", () => {
    const parsed = parseInboxTimestamp("last Tuesday", CAPTURED);
    expect(parsed.precision).toBe("none");
    expect(parsed.raw).toBe("last Tuesday");
    expect(Number.isFinite(parsed.ms)).toBe(false);
  });

  it("empty/whitespace-only input parses to precision 'none'", () => {
    expect(parseInboxTimestamp("", CAPTURED).precision).toBe("none");
    expect(parseInboxTimestamp("   ", CAPTURED).precision).toBe("none");
  });
});

describe("messageSimilarityDistance / isSameMessage", () => {
  it("identical text is distance 0", () => {
    expect(messageSimilarityDistance("hello there friend", "hello there friend")).toBe(0);
  });

  it("strips a leading quoted block before comparing, so a reply-with-quote matches its own plain re-read", () => {
    const withQuote = "Thanks so much for the help!\n\nOn Sep 2, Devon wrote:\n> can you clarify part 2";
    const plain = "Thanks so much for the help!";
    expect(isSameMessage({ sender: "Devon", text: withQuote }, { sender: "Devon", text: plain })).toBe(true);
  });

  it("isSameMessage requires authorsMatch regardless of text similarity", () => {
    expect(isSameMessage({ sender: "Devon Alvarez", text: "Can you clarify part 2?" }, { sender: "Priya Shah", text: "Can you clarify part 2?" })).toBe(
      false
    );
  });

  it("below MIN_TOKENS_FOR_SIMILARITY tokens, requires normalized equality rather than distance", () => {
    expect(isSameMessage({ sender: "Devon", text: "thanks" }, { sender: "Devon", text: "thanks!" })).toBe(true);
    expect(isSameMessage({ sender: "Devon", text: "thanks" }, { sender: "Devon", text: "no thanks" })).toBe(false);
  });

  it("a longer text below the similarity threshold still matches (partial re-read of the same message)", () => {
    const a = "Can you clarify part 2 of the homework about recursion please";
    const b = "Can you clarify part 2 of the homework about recursion";
    expect(isSameMessage({ sender: "Devon", text: a }, { sender: "Devon", text: b })).toBe(true);
  });

  it("timestamps confirm, never distinguish: matching minute-precision timestamps do not override a text mismatch", () => {
    expect(
      isSameMessage(
        { sender: "Devon", text: "Can you clarify part 2?", precision: "minute", sentAtMs: 1000 },
        { sender: "Devon", text: "Completely unrelated question about grading policy today", precision: "minute", sentAtMs: 1000 }
      )
    ).toBe(false);
  });

  it("a match is vetoed when both sides parse to minute precision more than 5 minutes apart", () => {
    const FIVE_MIN = 5 * 60 * 1000;
    const near = isSameMessage(
      { sender: "Devon", text: "Can you clarify part 2?", precision: "minute", sentAtMs: 1000 },
      { sender: "Devon", text: "Can you clarify part 2?", precision: "minute", sentAtMs: 1000 + FIVE_MIN }
    );
    expect(near).toBe(true);
    const far = isSameMessage(
      { sender: "Devon", text: "Can you clarify part 2?", precision: "minute", sentAtMs: 1000 },
      { sender: "Devon", text: "Can you clarify part 2?", precision: "minute", sentAtMs: 1000 + FIVE_MIN + 1 }
    );
    expect(far).toBe(false);
  });

  it("a veto never applies when either side is not minute precision", () => {
    const FAR = 999_999_999;
    expect(
      isSameMessage(
        { sender: "Devon", text: "Can you clarify part 2?", precision: "day", sentAtMs: 1000 },
        { sender: "Devon", text: "Can you clarify part 2?", precision: "minute", sentAtMs: 1000 + FAR }
      )
    ).toBe(true);
  });
});

describe("mergeCapturedMessages", () => {
  const OPTS = { instructorName: "Dr. Ruiz", capturedAtMs: 5000, now: 5000 };

  it("creates a new row from a fresh 'thread'-pane incoming message", () => {
    const result = mergeCapturedMessages([], [{ subject: "Question about HW3", sender: "Devon Alvarez", text: "Can you help?", pane: "thread" }], OPTS);
    expect(result.rows).toHaveLength(1);
    expect(result.addedIds).toEqual([result.rows[0].id]);
    expect(result.rows[0].student).toBe("Devon Alvarez");
    expect(result.rows[0].messages).toHaveLength(1);
    expect(result.rows[0].messages[0].fromMe).toBe(false);
    expect(result.capped).toBe(false);
  });

  it("a 'list'-pane entry creates a previewOnly row and adds no message", () => {
    const result = mergeCapturedMessages([], [{ subject: "Question about HW3", sender: "Devon Alvarez", text: "can you help...", pane: "list" }], OPTS);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].previewOnly).toBe(true);
    expect(result.rows[0].messages).toHaveLength(0);
    expect(result.rows[0].subject).toBe("Question about HW3");
    expect(result.rows[0].student).toBe("Devon Alvarez");
  });

  it("a 'list' entry confirms an existing previewOnly row's subject/student without adding a message", () => {
    const first = mergeCapturedMessages([], [{ subject: "Question about HW3", sender: "Devon Alvarez", text: "preview...", pane: "list" }], OPTS);
    const second = mergeCapturedMessages(first.rows, [{ subject: "Question about HW3", sender: "Devon Alvarez", text: "preview updated...", pane: "list" }], OPTS);
    expect(second.rows).toHaveLength(1);
    expect(second.rows[0].messages).toHaveLength(0);
    expect(second.rows[0].previewOnly).toBe(true);
    expect(second.addedIds).toEqual([]);
  });

  it("a 'thread' entry arriving after a 'list'-only row clears previewOnly and adds the real message", () => {
    const listOnly = mergeCapturedMessages([], [{ subject: "Question about HW3", sender: "Devon Alvarez", text: "preview...", pane: "list" }], OPTS);
    const withThread = mergeCapturedMessages(
      listOnly.rows,
      [{ subject: "Question about HW3", sender: "Devon Alvarez", text: "Can you help with part 2?", pane: "thread" }],
      OPTS
    );
    expect(withThread.rows).toHaveLength(1);
    expect(withThread.rows[0].previewOnly).toBeUndefined();
    expect(withThread.rows[0].messages).toHaveLength(1);
    expect(withThread.addedIds).toEqual([]);
  });

  it("a later 'list' entry never overwrites a previewOnly=false thread back to preview-only", () => {
    const withThread = mergeCapturedMessages([], [{ subject: "Question about HW3", sender: "Devon Alvarez", text: "Can you help?", pane: "thread" }], OPTS);
    const withList = mergeCapturedMessages(withThread.rows, [{ subject: "Question about HW3", sender: "Devon Alvarez", text: "preview...", pane: "list" }], OPTS);
    expect(withList.rows[0].previewOnly).toBeUndefined();
    expect(withList.rows[0].messages).toHaveLength(1);
  });

  it("a quoted-reply body merges/dedupes with its own plain re-read via isSameMessage, keeping the longer read", () => {
    const plain = mergeCapturedMessages([], [{ subject: "Q", sender: "Devon", text: "Thanks so much!", pane: "thread" }], OPTS);
    const withQuote = mergeCapturedMessages(
      plain.rows,
      [{ subject: "Q", sender: "Devon", text: "Thanks so much!\n\nOn Sep 2, Devon wrote:\n> can you clarify part 2", pane: "thread" }],
      OPTS
    );
    expect(withQuote.rows).toHaveLength(1);
    expect(withQuote.rows[0].messages).toHaveLength(1);
    expect(withQuote.rows[0].messages[0].text).toContain("On Sep 2, Devon wrote:");
  });

  it("an equal-or-shorter re-read of the same message changes nothing (first read wins)", () => {
    const first = mergeCapturedMessages([], [{ subject: "Q", sender: "Devon", text: "Can you clarify part 2 of the assignment please", pane: "thread" }], OPTS);
    const second = mergeCapturedMessages(first.rows, [{ subject: "Q", sender: "Devon", text: "Can you clarify part 2", pane: "thread" }], OPTS);
    expect(second.rows[0].messages[0].text).toBe("Can you clarify part 2 of the assignment please");
  });

  it("Yesterday/Today/bare-time/'Sep 3 at 2:14pm' sentAt readings all produce a stored message with the raw text kept", () => {
    for (const sentAt of ["Yesterday", "Today", "2:14 PM", "Sep 3 at 2:14pm"]) {
      const result = mergeCapturedMessages([], [{ subject: "Q", sender: "Devon", text: "hello", sentAt, pane: "thread" }], OPTS);
      expect(result.rows[0].messages[0].sentAt).toBe(sentAt);
    }
  });

  it("'(no subject)' and an empty subject both key threads by student alone, and two different students never merge under that sentinel", () => {
    const devon = mergeCapturedMessages([], [{ subject: "(no subject)", sender: "Devon Alvarez", text: "hi", pane: "thread" }], OPTS);
    const priya = mergeCapturedMessages(devon.rows, [{ subject: "", sender: "Priya Shah", text: "hi", pane: "thread" }], OPTS);
    expect(priya.rows).toHaveLength(2);
    // A second message from Devon under the OTHER empty-subject spelling
    // joins Devon's existing "" thread rather than creating a third row.
    const devonAgain = mergeCapturedMessages(priya.rows, [{ subject: "", sender: "Devon Alvarez", text: "follow up", pane: "thread" }], OPTS);
    expect(devonAgain.rows).toHaveLength(2);
    const devonRow = devonAgain.rows.find((r) => r.student === "Devon Alvarez");
    expect(devonRow?.messages).toHaveLength(2);
  });

  it("a fromMe message with no thread to join ('' key, no existing thread) is dropped", () => {
    const result = mergeCapturedMessages([], [{ subject: "", sender: "Dr. Ruiz", text: "Sure, happy to help.", pane: "thread" }], OPTS);
    expect(result.rows).toHaveLength(0);
    expect(result.addedIds).toHaveLength(0);
  });

  it("a fromMe message joins an existing thread by subject key alone and inherits the thread's student", () => {
    const incoming = mergeCapturedMessages([], [{ subject: "Question about HW3", sender: "Devon Alvarez", text: "Can you help?", pane: "thread" }], OPTS);
    const reply = mergeCapturedMessages(incoming.rows, [{ subject: "Question about HW3", sender: "Dr. Ruiz", text: "Sure, happy to help.", pane: "thread" }], OPTS);
    expect(reply.rows).toHaveLength(1);
    expect(reply.rows[0].student).toBe("Devon Alvarez");
    expect(reply.rows[0].messages).toHaveLength(2);
    expect(reply.rows[0].messages.some((m) => m.fromMe)).toBe(true);
    // The newest message is fromMe, so the thread is now answered.
    expect(reply.rows[0].answered).toBe(true);
  });

  it("while instructor-name is empty, every message is incoming and no thread is ever answered", () => {
    const noNameOpts = { ...OPTS, instructorName: "" };
    const result = mergeCapturedMessages(
      [],
      [
        { subject: "Q", sender: "Devon", text: "hi there, question incoming", pane: "thread" },
        { subject: "Q", sender: "Devon", text: "a second message from the same student", pane: "thread" },
      ],
      noNameOpts
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].messages.every((m) => m.fromMe === false)).toBe(true);
    expect(result.rows[0].answered).toBe(false);

    // With a name set, the SAME "Dr. Ruiz" sender in this same conversation
    // would instead be recognised as fromMe (sanity check that the empty-
    // name state above is really what suppresses it, not something else) -
    // and, with no existing thread to join, is dropped rather than creating
    // a new row.
    const withName = mergeCapturedMessages(
      [],
      [{ subject: "Q", sender: "Dr. Ruiz", text: "hi there, question incoming", pane: "thread" }],
      { ...OPTS, instructorName: "Dr. Ruiz" }
    );
    expect(withName.rows).toHaveLength(0);
  });

  it("the 12-message cap keeps the newest and counts the rest in omittedMessages", () => {
    const entries = Array.from({ length: 15 }, (_, i) => ({ subject: "Q", sender: "Devon", text: `message ${i}`, sentAt: undefined, pane: "thread" as const }));
    // Feed them one at a time so ordering/dedupe behaves like real capture
    // batches, rather than one call with 15 near-identical short texts that
    // would collide under isSameMessage's own similarity rule.
    let rows: MessageThreadRow[] = [];
    for (const entry of entries) {
      rows = mergeCapturedMessages(rows, [entry], { ...OPTS, capturedAtMs: OPTS.capturedAtMs + entries.indexOf(entry) }).rows;
    }
    expect(rows).toHaveLength(1);
    expect(rows[0].messages).toHaveLength(MAX_THREAD_MESSAGES);
    expect(rows[0].omittedMessages).toBe(15 - MAX_THREAD_MESSAGES);
    expect(rows[0].messages[rows[0].messages.length - 1].text).toBe("message 14");
  });

  it("the 800-char cap truncates every stored body except the latest incoming", () => {
    const longText = "a".repeat(MAX_MESSAGE_CHARS + 200);
    const first = mergeCapturedMessages([], [{ subject: "Q", sender: "Devon", text: longText, pane: "thread" }], OPTS);
    const second = mergeCapturedMessages(first.rows, [{ subject: "Q", sender: "Devon", text: "a short follow-up question here now", pane: "thread" }], { ...OPTS, capturedAtMs: OPTS.capturedAtMs + 1000 });
    const [olderMessage, latestMessage] = second.rows[0].messages;
    expect(olderMessage.text.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS + 3);
    expect(olderMessage.text.endsWith("...")).toBe(true);
    expect(latestMessage.text).toBe("a short follow-up question here now");
  });

  it("refuses to grow the table past MAX_TABLE_ROWS and reports capped: true", () => {
    let rows: MessageThreadRow[] = [];
    for (let i = 0; i < 501; i++) {
      const result = mergeCapturedMessages(rows, [{ subject: `Subject ${i}`, sender: `Student ${i}`, text: "hello", pane: "thread" }], {
        ...OPTS,
        now: OPTS.now + i,
      });
      rows = result.rows;
      if (i === 500) expect(result.capped).toBe(true);
    }
    expect(rows.length).toBeLessThanOrEqual(500);
  });
});

describe("M9 fixtures: Yesterday/Today ordering, same-subject different-student non-merge, multi-candidate fromMe", () => {
  // 2026-09-03 (a Thursday), 10:00:00 local - same reference date used by
  // the parseInboxTimestamp describe block above.
  const CAPTURED = new Date(2026, 8, 3, 10, 0, 0, 0).getTime();
  const OPTS = { instructorName: "Dr. Ruiz", capturedAtMs: CAPTURED, now: CAPTURED };

  it("'Yesterday' parses to the previous calendar day at 12:00 local with precision 'day', and sorts before a same-thread 'Today' message", () => {
    const parsed = parseInboxTimestamp("Yesterday", CAPTURED);
    expect(parsed.precision).toBe("day");
    const d = new Date(parsed.ms);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8); // September
    expect(d.getDate()).toBe(2); // one day before the captured Sep 3
    expect(d.getHours()).toBe(12);
    expect(d.getMinutes()).toBe(0);

    // Ordering: feed 'Today' first, then 'Yesterday' second. If the
    // Yesterday/Today branch were removed, both readings would parse to
    // precision "none" (sentAtMs left unset), and sortThreadMessages would
    // then keep first-seen order - Today, then Yesterday - which is the
    // OPPOSITE of the ascending-sentAtMs order asserted below, so this
    // assertion would fail.
    const withToday = mergeCapturedMessages(
      [],
      [{ subject: "Question about HW3", sender: "Devon Alvarez", text: "Today's message about the homework question", sentAt: "Today", pane: "thread" }],
      OPTS
    );
    const withBoth = mergeCapturedMessages(
      withToday.rows,
      [{ subject: "Question about HW3", sender: "Devon Alvarez", text: "Yesterday's earlier message about a different topic", sentAt: "Yesterday", pane: "thread" }],
      OPTS
    );
    expect(withBoth.rows).toHaveLength(1);
    expect(withBoth.rows[0].messages).toHaveLength(2);
    expect(withBoth.rows[0].messages[0].sentAt).toBe("Yesterday");
    expect(withBoth.rows[0].messages[1].sentAt).toBe("Today");
  });

  it("two threads with the same real subject and different students never merge, but the same student's second message joins the first thread", () => {
    const devon = mergeCapturedMessages(
      [],
      [{ subject: "Question about HW3", sender: "Devon Alvarez", text: "Can you clarify part 2 of the assignment", pane: "thread" }],
      OPTS
    );
    // Same real subject, a different student: if the student check in
    // findMatchingThreadIndex were removed (key-only matching for real
    // subjects), this entry would join Devon's row instead of creating its
    // own, and the length-2 assertion below would fail.
    const withPriya = mergeCapturedMessages(
      devon.rows,
      [{ subject: "Question about HW3", sender: "Priya Shah", text: "I have a different question about part 3", pane: "thread" }],
      OPTS
    );
    expect(withPriya.rows).toHaveLength(2);
    expect(withPriya.rows.map((r) => r.student).sort()).toEqual(["Devon Alvarez", "Priya Shah"]);
    expect(withPriya.rows.every((r) => r.messages.length === 1)).toBe(true);

    // The same student's second message on that subject joins the FIRST
    // (Devon's) thread rather than creating a third row.
    const devonAgain = mergeCapturedMessages(
      withPriya.rows,
      [{ subject: "Question about HW3", sender: "Devon Alvarez", text: "Following up on my earlier question here", pane: "thread" }],
      OPTS
    );
    expect(devonAgain.rows).toHaveLength(2);
    const devonRow = devonAgain.rows.find((r) => r.student === "Devon Alvarez");
    expect(devonRow?.messages).toHaveLength(2);
    const priyaRow = devonAgain.rows.find((r) => r.student === "Priya Shah");
    expect(priyaRow?.messages).toHaveLength(1);
  });

  it("a fromMe message matching two threads by key ('' subject sentinel, two different students) is dropped - neither thread gains a message - while one matching exactly one thread joins it and inherits its student", () => {
    // Two "" -key threads (the no-subject sentinel: subject "" and the
    // spelled-out "(no subject)" collapse to the same key) for two
    // different students. matchFromMeThreadIndex returning -1 for multiple
    // candidates drops the message under the general rule - a fromMe
    // message not attributable to exactly one existing thread is always
    // dropped, whatever its key (see the real-subject test below, which
    // exercises the same rule for a non-"" key).
    const devon = mergeCapturedMessages([], [{ subject: "", sender: "Devon Alvarez", text: "hi, a question about grading please", pane: "thread" }], OPTS);
    const both = mergeCapturedMessages(
      devon.rows,
      [{ subject: "(no subject)", sender: "Priya Shah", text: "a different question about attendance today", pane: "thread" }],
      OPTS
    );
    expect(both.rows).toHaveLength(2);

    // Two candidates share the "" key (Devon's row and Priya's row). If
    // matchFromMeThreadIndex picked the first candidate instead of
    // requiring exactly one, this reply would join one of the two rows and
    // the "every row still has exactly 1 message" assertion below would
    // fail; if the "" -key drop were removed entirely, a third orphan row
    // would be created and the length-2 assertion below would fail.
    const afterFromMe = mergeCapturedMessages(both.rows, [{ subject: "", sender: "Dr. Ruiz", text: "Sure, happy to help both of you.", pane: "thread" }], OPTS);
    expect(afterFromMe.rows).toHaveLength(2);
    expect(afterFromMe.rows.every((r) => r.messages.length === 1)).toBe(true);
    expect(afterFromMe.addedIds).toEqual([]);

    // Now a fresh scenario with only ONE "" -key thread: the fromMe reply
    // has exactly one candidate, so it joins it and inherits the thread's
    // student.
    const onlyDevon = mergeCapturedMessages([], [{ subject: "", sender: "Devon Alvarez", text: "hi, a question about grading please", pane: "thread" }], OPTS);
    const reply = mergeCapturedMessages(onlyDevon.rows, [{ subject: "", sender: "Dr. Ruiz", text: "Sure, happy to help you out.", pane: "thread" }], OPTS);
    expect(reply.rows).toHaveLength(1);
    expect(reply.rows[0].student).toBe("Devon Alvarez");
    expect(reply.rows[0].messages).toHaveLength(2);
    expect(reply.rows[0].messages.some((m) => m.fromMe)).toBe(true);
  });

  it("the same drop-unless-exactly-one-candidate rule applies to a REAL subject key: two candidate threads drops with both rows unchanged, no thread also drops, one thread joins", () => {
    // Two threads sharing the same real subject, for two different
    // students - mirrors the "" -sentinel two-candidate case above, but with
    // a non-"" key, to prove the general rule (not a "" -only special case).
    const devon = mergeCapturedMessages(
      [],
      [{ subject: "Question about HW3", sender: "Devon Alvarez", text: "Can you clarify part 2 of the assignment", pane: "thread" }],
      OPTS
    );
    const both = mergeCapturedMessages(
      devon.rows,
      [{ subject: "Question about HW3", sender: "Priya Shah", text: "I have a different question about part 3", pane: "thread" }],
      OPTS
    );
    expect(both.rows).toHaveLength(2);

    const afterFromMe = mergeCapturedMessages(
      both.rows,
      [{ subject: "Question about HW3", sender: "Dr. Ruiz", text: "Sure, happy to help both of you.", pane: "thread" }],
      OPTS
    );
    // Neither row gains a message, and no orphan third row is created.
    expect(afterFromMe.rows).toHaveLength(2);
    expect(afterFromMe.rows.every((r) => r.messages.length === 1)).toBe(true);
    expect(afterFromMe.rows.map((r) => r.student).sort()).toEqual(["Devon Alvarez", "Priya Shah"]);
    expect(afterFromMe.addedIds).toEqual([]);

    // A real subject with no existing thread at all: also dropped, never
    // creates an orphan row with an empty student.
    const noThread = mergeCapturedMessages(
      [],
      [{ subject: "Question about HW4", sender: "Dr. Ruiz", text: "Following up on your question.", pane: "thread" }],
      OPTS
    );
    expect(noThread.rows).toHaveLength(0);
    expect(noThread.addedIds).toEqual([]);

    // Exactly one candidate thread: joins it and inherits its student.
    const onlyDevon = mergeCapturedMessages(
      [],
      [{ subject: "Question about HW3", sender: "Devon Alvarez", text: "Can you clarify part 2 of the assignment", pane: "thread" }],
      OPTS
    );
    const reply = mergeCapturedMessages(
      onlyDevon.rows,
      [{ subject: "Question about HW3", sender: "Dr. Ruiz", text: "Sure, happy to help.", pane: "thread" }],
      OPTS
    );
    expect(reply.rows).toHaveLength(1);
    expect(reply.rows[0].student).toBe("Devon Alvarez");
    expect(reply.rows[0].messages).toHaveLength(2);
    expect(reply.rows[0].messages.some((m) => m.fromMe)).toBe(true);
  });
});

describe("latestIncoming", () => {
  it("returns the newest message with fromMe === false", () => {
    const row = makeRow({
      messages: [makeMessage({ text: "first", fromMe: false }), makeMessage({ text: "reply", fromMe: true }), makeMessage({ text: "second", fromMe: false })],
    });
    expect(latestIncoming(row)?.text).toBe("second");
  });

  it("returns undefined when every message is fromMe", () => {
    const row = makeRow({ messages: [makeMessage({ fromMe: true })] });
    expect(latestIncoming(row)).toBeUndefined();
  });
});

describe("sortThreads", () => {
  it("sorts descending by latest-incoming ms, then descending firstSeenAt, then ascending id", () => {
    const a = makeRow({ id: "a", firstSeenAt: 100, messages: [makeMessage({ sentAtMs: 500 })] });
    const b = makeRow({ id: "b", firstSeenAt: 200, messages: [makeMessage({ sentAtMs: 900 })] });
    const c = makeRow({ id: "c", firstSeenAt: 300, messages: [makeMessage({ sentAtMs: 500 })] });
    const sorted = sortThreads([a, b, c]);
    expect(sorted.map((r) => r.id)).toEqual(["b", "c", "a"]);
  });

  it("a thread with no latest-incoming reading sorts last", () => {
    const withIncoming = makeRow({ id: "x", messages: [makeMessage({ sentAtMs: 100 })] });
    const answered = makeRow({ id: "y", messages: [makeMessage({ fromMe: true })] });
    const sorted = sortThreads([answered, withIncoming]);
    expect(sorted.map((r) => r.id)).toEqual(["x", "y"]);
  });
});

describe("applySignoff", () => {
  it("appends the signoff with a blank line when non-empty and not already present", () => {
    expect(applySignoff("Sure, happy to help.", "Best, Dr. Ruiz")).toBe("Sure, happy to help.\n\nBest, Dr. Ruiz");
  });

  it("returns the reply unchanged when signoff is empty or whitespace-only", () => {
    expect(applySignoff("Sure, happy to help.", "")).toBe("Sure, happy to help.");
    expect(applySignoff("Sure, happy to help.", "   ")).toBe("Sure, happy to help.");
  });

  it("does not double-append when the reply already ends with the signoff", () => {
    const reply = "Sure, happy to help.\n\nBest, Dr. Ruiz";
    expect(applySignoff(reply, "Best, Dr. Ruiz")).toBe(reply);
  });

  it("trims the signoff before comparing/appending", () => {
    expect(applySignoff("Sure, happy to help.", "  Best, Dr. Ruiz  ")).toBe("Sure, happy to help.\n\nBest, Dr. Ruiz");
  });

  it("trailing whitespace on the reply does not defeat the already-ends-with check", () => {
    const reply = "Sure, happy to help.\n\nBest, Dr. Ruiz\n";
    expect(applySignoff(reply, "Best, Dr. Ruiz")).toBe(reply);
  });
});
