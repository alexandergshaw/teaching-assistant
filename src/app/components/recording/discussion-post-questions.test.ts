import { describe, it, expect } from "vitest";
import {
  QUESTION_BADGE_LABELS,
  questionBadgeLabel,
  questionAnswerDisplay,
  copyAnswerAriaLabel,
  removeQuestionAriaLabel,
  neighbourQuestionAfterRemove,
  COPY_RESET_MS,
  ANSWER_CLIPBOARD_FAILURE_MESSAGE,
  clampQuestion,
  copiedAnswerAnnouncement,
} from "./discussion-post-questions";

// docs/answers-in-the-reply-acceptance-criteria.md A4/section 6 (GROUP C):
// every export of the pure leaf gets its own test here (vitest is node-env
// and renders no component in this repo - see discussion-reply-controls.ts's
// own header for why this leaf exists as a plain .ts file at all).
//
// NOTE: this leaf imports `truncateWithMarker` from
// `@/lib/discussion-reply-prompt` (Group A's file). Until that export lands,
// every test below that reaches `clampQuestion` (the two remaining aria
// builders) fails at module load, not at assertion - report that as expected
// red, per the AC's "red until [sibling group] lands" instruction for
// cross-group contract names.

describe("QUESTION_BADGE_LABELS", () => {
  it("is the exact five-key vocabulary - one table, never a second", () => {
    expect(QUESTION_BADGE_LABELS).toEqual({
      asked: "Asked",
      implied: "Implied",
      needsYou: "Needs you",
      inReply: "In the reply",
      notInReply: "Not in the reply",
    });
  });
});

describe("COPY_RESET_MS", () => {
  it("is 1500 - the same reset delay every copy confirmation in this feature uses", () => {
    expect(COPY_RESET_MS).toBe(1500);
  });
});

describe("ANSWER_CLIPBOARD_FAILURE_MESSAGE", () => {
  it('says "answer text", not "reply box" (Q7: the row-level message is false here)', () => {
    expect(ANSWER_CLIPBOARD_FAILURE_MESSAGE).toBe("Could not copy automatically. Select the answer text and copy it.");
    expect(ANSWER_CLIPBOARD_FAILURE_MESSAGE).not.toContain("reply box");
  });
});

describe("questionBadgeLabel", () => {
  it('returns "Asked" for implied: false', () => {
    expect(questionBadgeLabel({ implied: false })).toBe("Asked");
  });

  it('returns "Implied" for implied: true', () => {
    expect(questionBadgeLabel({ implied: true })).toBe("Implied");
  });
});

// ---------------------------------------------------------------------------
// A4's state table (the doc's `| answer present, inReply | answer present,
// not inReply | answer empty |` table), as a pure function of the two
// booleans the component derives per item. `hasAnswer: false` always wins
// regardless of `inReply` - the component only ever passes
// `inReply = hasAnswer && replyContainsAnswer(...)`, so that combination
// cannot occur in practice, but the function's own contract must still hold
// it (an empty answer can never be "in the reply").
// ---------------------------------------------------------------------------

describe("questionAnswerDisplay", () => {
  it("answer empty: no badge, no answer text, no Copy", () => {
    expect(questionAnswerDisplay(false, false)).toEqual({
      badgeLabel: null,
      showAnswerText: false,
      showCopy: false,
    });
  });

  it("answer empty even if inReply were somehow true: still no badge, text, or Copy", () => {
    expect(questionAnswerDisplay(false, true)).toEqual({
      badgeLabel: null,
      showAnswerText: false,
      showCopy: false,
    });
  });

  it('answer present and inReply: "In the reply" badge, no answer text, no Copy', () => {
    expect(questionAnswerDisplay(true, true)).toEqual({
      badgeLabel: "In the reply",
      showAnswerText: false,
      showCopy: false,
    });
  });

  it('answer present and NOT inReply: "Not in the reply" badge, answer text, and Copy', () => {
    expect(questionAnswerDisplay(true, false)).toEqual({
      badgeLabel: "Not in the reply",
      showAnswerText: true,
      showCopy: true,
    });
  });
});

describe("neighbourQuestionAfterRemove", () => {
  const q1 = { question: "Why does the loop run twice?" };
  const q2 = { question: "What does pass-by-reference mean here?" };
  const q3 = { question: "Is this graded?" };

  it("returns the next item's question when one exists", () => {
    expect(neighbourQuestionAfterRemove([q1, q2, q3], q1.question)).toBe(q2.question);
  });

  it("prefers the NEXT item over the previous one when both exist (removing a middle item)", () => {
    expect(neighbourQuestionAfterRemove([q1, q2, q3], q2.question)).toBe(q3.question);
  });

  it("returns the previous item's question when removing the last item", () => {
    expect(neighbourQuestionAfterRemove([q1, q2, q3], q3.question)).toBe(q2.question);
  });

  it("returns null when the list has only the removed item", () => {
    expect(neighbourQuestionAfterRemove([q1], q1.question)).toBe(null);
  });

  it("returns null when the removed question is not found in the list", () => {
    expect(neighbourQuestionAfterRemove([q1, q2], "Some question not in the list?")).toBe(null);
  });
});

describe("copyAnswerAriaLabel", () => {
  it("names only the question, never the author", () => {
    const item = { question: "Is this graded?" };
    expect(copyAnswerAriaLabel(item)).toBe('Copy the answer to "Is this graded?"');
    expect(copyAnswerAriaLabel(item)).not.toContain("reply to");
  });
});

describe("removeQuestionAriaLabel", () => {
  it('names the question and the author, via "from the list for the reply to" (A4: one word changed from the pre-existing wording, since removal never touches reply text)', () => {
    const item = { question: "Is this graded?" };
    expect(removeQuestionAriaLabel(item, "Diego Chen")).toBe(
      'Remove the question "Is this graded?" from the list for the reply to Diego Chen'
    );
  });
});

// ---------------------------------------------------------------------------
// The one remaining spoken announcement (Copy - Insert's own announcement,
// `insertedAnswerAnnouncement`, is deleted end to end with D5). Lives here
// (not inline in the .tsx) so it HAS a test surface - vitest here is
// node-env and renders no component, so a string built inside
// DiscussionReplyQuestions.tsx is never exercised by anything.
// ---------------------------------------------------------------------------

describe("clampQuestion", () => {
  it("leaves a short question exactly as written", () => {
    expect(clampQuestion("Why does the loop run twice?")).toBe("Why does the loop run twice?");
  });

  it("clamps a long question on a word boundary with three ASCII periods", () => {
    const long = "Why does the recursive Fibonacci implementation take so much longer than the iterative one for larger inputs?";
    const out = clampQuestion(long);
    expect(out.length).toBeLessThanOrEqual(63);
    expect(out.endsWith("...")).toBe(true);
    expect(out).not.toContain("  ");
  });
});

describe("copiedAnswerAnnouncement", () => {
  const q1 = { question: "Why does the loop run twice?" };
  const q2 = { question: "Is the lab due Friday or Sunday?" };

  it("names the question", () => {
    expect(copiedAnswerAnnouncement(q1)).toContain("Why does the loop run twice?");
  });

  it("two questions in ONE row give two DIFFERENT copy strings - the live region only speaks a string that actually changed", () => {
    expect(copiedAnswerAnnouncement(q1)).not.toBe(copiedAnswerAnnouncement(q2));
  });

  it("clamps the question inside the announcement, so a 300-character question does not become a 300-character utterance", () => {
    const long = { question: "a".repeat(300) };
    expect(copiedAnswerAnnouncement(long).length).toBeLessThan(100);
  });
});
