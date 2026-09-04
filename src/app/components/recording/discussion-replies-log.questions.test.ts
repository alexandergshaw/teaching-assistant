// docs/post-questions-acceptance-criteria.md Q9 - the run log's per-row
// question fields, split out of discussion-replies-log.test.ts purely to keep
// that file under recording-split.structure.test.ts's 1000-line ceiling (it
// stood at 993 with these blocks in it, seven lines of headroom for the next
// feature). Nothing about the subject changed in the move.
//
// The `row` helper below is DUPLICATED from the sibling test file rather than
// imported: importing a helper from another *.test.ts re-runs that file's own
// describe blocks a second time under this file's run (a recorded trap in
// this repo).

import { describe, it, expect } from "vitest";
import { buildDiscussionRepliesLogRowEntry } from "./discussion-replies-log";
import type { ReplyRow } from "./discussion-capture";
import type { PostQuestion } from "@/lib/discussion-reply-prompt";

function row(overrides: Partial<ReplyRow> & { id: string; author: string }): ReplyRow {
  return {
    post: "A post.",
    reply: "",
    userEdited: false,
    state: "ready",
    error: null,
    firstSeenAt: 0,
    order: 0,
    ...overrides,
  };
}

describe("buildDiscussionRepliesLogRowEntry - post questions", () => {
// ---------------------------------------------------------------------
// docs/post-questions-acceptance-criteria.md Q9: questionCount /
// questionsNeedingYou / questions - redacted question/needsYou TEXT plus
// the answer's LENGTH ONLY, never the answer text itself.
// ---------------------------------------------------------------------

describe("Q9: questionCount / questionsNeedingYou / questions", () => {
  const QA: PostQuestion = {
    question: "Diego, why does the loop run twice?",
    implied: false,
    answer: "Because the outer loop iterates twice before the inner one finishes.",
  };
  const QB: PostQuestion = {
    question: "What is the due date, Diego?",
    implied: true,
    answer: "",
    needsYou: "Diego needs the actual due date.",
  };

  it("questionCount and questionsNeedingYou are 0 when the row has no questions", () => {
    const r = row({ id: "r1", author: "Diego Chen" });
    const entry = buildDiscussionRepliesLogRowEntry(r, [r], new Set());
    expect(entry.questionCount).toBe(0);
    expect(entry.questionsNeedingYou).toBe(0);
    expect(entry.questions).toEqual([]);
  });

  it("questionCount counts every item; questionsNeedingYou counts only those with a needsYou note - SABOTAGE TARGET (deleting the questions read must turn this red)", () => {
    const r = row({ id: "r1", author: "Diego Chen", questions: [QA, QB] });
    const entry = buildDiscussionRepliesLogRowEntry(r, [r], new Set());
    expect(entry.questionCount).toBe(2);
    expect(entry.questionsNeedingYou).toBe(1);
  });

  it("needsYou is '' (never undefined) on an item that has none", () => {
    const r = row({ id: "r1", author: "Diego Chen", questions: [QA] });
    const entry = buildDiscussionRepliesLogRowEntry(r, [r], new Set());
    expect(entry.questions[0]!.needsYou).toBe("");
  });

  it("carries answerChars (the LENGTH only) and never the answer text itself", () => {
    const r = row({ id: "r1", author: "Diego Chen", questions: [QA] });
    const entry = buildDiscussionRepliesLogRowEntry(r, [r], new Set());
    expect(entry.questions[0]!.answerChars).toBe(QA.answer.length);
    expect(JSON.stringify(entry.questions)).not.toContain(QA.answer);
  });

  it("redacts the author's name out of question and needsYou text - SABOTAGE TARGET (deleting the redaction call must turn this red)", () => {
    const r = row({ id: "r1", author: "Diego Chen", questions: [QA, QB] });
    const entry = buildDiscussionRepliesLogRowEntry(r, [r], new Set());
    expect(entry.questions[0]!.question).not.toContain("Diego");
    expect(entry.questions[1]!.question).not.toContain("Diego");
    expect(entry.questions[1]!.needsYou).not.toContain("Diego");
  });

  it("preserves implied on each item", () => {
    const r = row({ id: "r1", author: "Diego Chen", questions: [QA, QB] });
    const entry = buildDiscussionRepliesLogRowEntry(r, [r], new Set());
    expect(entry.questions[0]!.implied).toBe(false);
    expect(entry.questions[1]!.implied).toBe(true);
  });
});
});
