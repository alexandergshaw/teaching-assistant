// Unit tests for message-canvas-match.ts (M15, docs/message-replies-
// acceptance-criteria.md section 7 and 9).
//
// This file imports no helper from any sibling *.test.ts - duplicates its
// own fixture, per this repo's own "no cross-test-file imports" rule.

import { describe, it, expect } from "vitest";
import { matchThreadToConversation, type ThreadCanvasMatch } from "./message-canvas-match";
import type { MessageThreadRow } from "./message-serialization";
import type { CanvasConversationSummary } from "@/lib/canvas/inbox";

function makeRow(overrides: Partial<MessageThreadRow> & { id: string }): MessageThreadRow {
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

function makeConv(overrides: Partial<CanvasConversationSummary> & { id: number }): CanvasConversationSummary {
  return {
    subject: "Question about homework 3",
    lastMessage: "",
    participants: ["Ana Ruiz"],
    messageCount: 2,
    workflowState: "read",
    lastMessageAt: null,
    ...overrides,
  };
}

function messages(n: number): MessageThreadRow["messages"] {
  return Array.from({ length: n }, (_, i) => ({
    sender: "Ana Ruiz",
    text: `message ${i}`,
    fromMe: false,
    precision: "none" as const,
  }));
}

// ---------------------------------------------------------------------------
// Real subject: subject+student.
// ---------------------------------------------------------------------------

describe("matchThreadToConversation - real subject (subject+student)", () => {
  it("matches uniquely on normalized subject equality plus a participant match", () => {
    const row = makeRow({ id: "r1" });
    const conv = makeConv({ id: 101 });
    const result = matchThreadToConversation(row, [conv]);
    expect(result).toEqual<ThreadCanvasMatch>({
      kind: "matched",
      canvas: {
        conversationId: 101,
        matchedBy: "subject+student",
        subject: "Question about homework 3",
        participants: ["Ana Ruiz"],
        messageCount: 2,
      },
    });
  });

  it("matches through normalizeForMatch's case/punctuation insensitivity on the subject", () => {
    const row = makeRow({ id: "r1", subject: "Question About Homework, 3!" });
    const conv = makeConv({ id: 101, subject: "question about homework 3" });
    const result = matchThreadToConversation(row, [conv]);
    expect(result.kind).toBe("matched");
  });

  it("matches through authorsMatch's surname-anchored tolerance on the student", () => {
    // authorsMatch: surname agrees, and either the first tokens agree or one
    // side is a single token - a middle-initial read vs. a full read.
    const row = makeRow({ id: "r1", student: "Ana M. Ruiz" });
    const conv = makeConv({ id: 101, participants: ["Ana Ruiz"] });
    const result = matchThreadToConversation(row, [conv]);
    expect(result.kind).toBe("matched");
  });

  it("returns none when no conversation's subject matches", () => {
    const row = makeRow({ id: "r1" });
    const conv = makeConv({ id: 101, subject: "Something else entirely" });
    expect(matchThreadToConversation(row, [conv])).toEqual({ kind: "none" });
  });

  it("returns none when the subject matches but no participant matches the student", () => {
    const row = makeRow({ id: "r1", student: "Ana Ruiz" });
    const conv = makeConv({ id: 101, participants: ["Bob Chen"] });
    expect(matchThreadToConversation(row, [conv])).toEqual({ kind: "none" });
  });

  it("returns ambiguous when two conversations both match subject+student", () => {
    const row = makeRow({ id: "r1" });
    const convA = makeConv({ id: 101 });
    const convB = makeConv({ id: 102 });
    expect(matchThreadToConversation(row, [convA, convB])).toEqual({ kind: "ambiguous" });
  });

  it("returns none over an empty conversation list", () => {
    const row = makeRow({ id: "r1" });
    expect(matchThreadToConversation(row, [])).toEqual({ kind: "none" });
  });

  it("never falls back to participant-only matching when the subject is real, even if the subject-matched set is empty and a participant-only candidate exists", () => {
    const row = makeRow({ id: "r1", subject: "Real subject nobody shares" });
    const conv = makeConv({ id: 101, subject: "A totally different subject", messageCount: 0 });
    // Same student, wildly different subject, wildly different count - would
    // NOT satisfy the empty-subject participant+count path either, but the
    // point of this test is that path is never even attempted here.
    expect(matchThreadToConversation(row, [conv])).toEqual({ kind: "none" });
  });
});

// ---------------------------------------------------------------------------
// Empty / "(no subject)": participant+count.
// ---------------------------------------------------------------------------

describe("matchThreadToConversation - empty or '(no subject)' (student+count)", () => {
  it("matches uniquely on participant alone plus a message-count within tolerance (empty subject)", () => {
    const row = makeRow({ id: "r1", subject: "", messages: messages(2) });
    const conv = makeConv({ id: 101, subject: "(no subject)", messageCount: 3 }); // |3-2| = 1, within tolerance
    const result = matchThreadToConversation(row, [conv]);
    expect(result).toEqual<ThreadCanvasMatch>({
      kind: "matched",
      canvas: {
        conversationId: 101,
        matchedBy: "student+count",
        subject: "(no subject)",
        participants: ["Ana Ruiz"],
        messageCount: 3,
      },
    });
  });

  it("matches the same way for the literal '(no subject)' sentinel", () => {
    const row = makeRow({ id: "r1", subject: "(no subject)", messages: messages(2) });
    const conv = makeConv({ id: 101, messageCount: 2 });
    expect(matchThreadToConversation(row, [conv]).kind).toBe("matched");
  });

  it("does not treat a real subject that merely normalizes near 'no subject' as empty - a student who typed 'No Subject' keeps the subject+student path", () => {
    const row = makeRow({ id: "r1", subject: "No Subject", messages: messages(2) });
    const conv = makeConv({ id: 101, subject: "no subject", messageCount: 99 }); // count would fail tolerance if this went through the empty-subject path
    const result = matchThreadToConversation(row, [conv]);
    // Subject normalizes equal ("no subject" === "no subject") and the
    // participant matches, so this is a subject+student match - the huge
    // message-count difference (99 vs. 2) is irrelevant on this path.
    expect(result).toEqual({
      kind: "matched",
      canvas: { conversationId: 101, matchedBy: "subject+student", subject: "no subject", participants: ["Ana Ruiz"], messageCount: 99 },
    });
  });

  it("returns none when the single participant candidate's message count is outside the tolerance", () => {
    const row = makeRow({ id: "r1", subject: "", messages: messages(2) });
    const conv = makeConv({ id: 101, messageCount: 10 }); // |10-2| = 8
    expect(matchThreadToConversation(row, [conv])).toEqual({ kind: "none" });
  });

  it("returns ambiguous when two conversations both have a matching participant, regardless of their counts", () => {
    const row = makeRow({ id: "r1", subject: "", student: "Ana Ruiz", messages: messages(2) });
    const convA = makeConv({ id: 101, participants: ["Ana Ruiz"], messageCount: 2 });
    const convB = makeConv({ id: 102, participants: ["Ana Ruiz", "Bob Chen"], messageCount: 50 });
    expect(matchThreadToConversation(row, [convA, convB])).toEqual({ kind: "ambiguous" });
  });

  it("returns none when no participant matches at all", () => {
    const row = makeRow({ id: "r1", subject: "", student: "Ana Ruiz" });
    const conv = makeConv({ id: 101, participants: ["Bob Chen"] });
    expect(matchThreadToConversation(row, [conv])).toEqual({ kind: "none" });
  });

  it("accepts a message count that is exactly 1 apart in either direction (tolerance boundary)", () => {
    const rowFewer = makeRow({ id: "r1", subject: "", messages: messages(3) });
    expect(matchThreadToConversation(rowFewer, [makeConv({ id: 101, messageCount: 4 })]).kind).toBe("matched");
    const rowMore = makeRow({ id: "r2", subject: "", messages: messages(4) });
    expect(matchThreadToConversation(rowMore, [makeConv({ id: 102, messageCount: 3 })]).kind).toBe("matched");
  });

  it("rejects a message count that is exactly 2 apart (just outside tolerance)", () => {
    const row = makeRow({ id: "r1", subject: "", messages: messages(2) });
    expect(matchThreadToConversation(row, [makeConv({ id: 101, messageCount: 4 })])).toEqual({ kind: "none" });
  });
});
