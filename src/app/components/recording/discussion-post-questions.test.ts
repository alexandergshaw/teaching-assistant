import { describe, it, expect } from "vitest";
import {
  QUESTION_BADGE_LABELS,
  questionBadgeLabel,
  insertAnswerAriaLabel,
  copyAnswerAriaLabel,
  removeQuestionAriaLabel,
  neighbourQuestionAfterRemove,
  COPY_RESET_MS,
  ANSWER_CLIPBOARD_FAILURE_MESSAGE,
  clampQuestion,
  insertedAnswerAnnouncement,
  copiedAnswerAnnouncement,
} from "./discussion-post-questions";

// docs/post-questions-acceptance-criteria.md Q10/Q11: every export of the
// pure leaf gets its own test here (vitest is node-env and renders no
// component in this repo - see discussion-reply-controls.ts's own header for
// why this leaf exists as a plain .ts file at all).
//
// NOTE: this leaf imports `truncateWithMarker` from
// `@/lib/discussion-reply-prompt` (Group A's file, Q1). Until Group A lands
// that export, every test below that reaches `clampQuestion` (the three aria
// builders) fails at module load, not at assertion - report that as expected
// red, per the AC's "red until [sibling group] lands" instruction for
// cross-group contract names.

describe("QUESTION_BADGE_LABELS", () => {
  it("is the exact three-key vocabulary", () => {
    expect(QUESTION_BADGE_LABELS).toEqual({ asked: "Asked", implied: "Implied", needsYou: "Needs you" });
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

describe("insertAnswerAriaLabel", () => {
  it("names the question and the author, clamped to 60 chars via truncateWithMarker", () => {
    const short = { question: "Why does the loop run twice?" };
    expect(insertAnswerAriaLabel(short, "Diego Chen")).toBe(
      'Insert the answer to "Why does the loop run twice?" into the reply to Diego Chen'
    );
  });

  it("clamps a question longer than 60 characters", () => {
    const long = { question: "a".repeat(80) };
    const label = insertAnswerAriaLabel(long, "Diego Chen");
    // truncateWithMarker cuts to 60 chars then appends "..." (no word
    // boundary exists in a run of "a"s, so it cuts at exactly 60).
    expect(label).toBe(`Insert the answer to "${"a".repeat(60)}..." into the reply to Diego Chen`);
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
  it("names the question and the author", () => {
    const item = { question: "Is this graded?" };
    expect(removeQuestionAriaLabel(item, "Diego Chen")).toBe(
      'Remove the question "Is this graded?" from the reply to Diego Chen'
    );
  });
});

// ---------------------------------------------------------------------------
// VERIFIER FINDING 3/5: the two spoken announcements. Both live here (not
// inline in the .tsx) so they HAVE a test surface - vitest here is node-env
// and renders no component, so a string built inside DiscussionReplyQuestions
// .tsx is never exercised by anything.
//
// The property that matters is not the wording, it is that two DIFFERENT
// questions in the SAME row produce two DIFFERENT strings: the panel's live
// region is `setAdhocAnnouncement(text)`, and re-setting an identical string
// re-renders nothing, so an announcement that varied only by author would be
// spoken on the first Insert of a row and then stay silent for the second and
// third - which is the designed flow.
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

describe("insertedAnswerAnnouncement / copiedAnswerAnnouncement", () => {
  const q1 = { question: "Why does the loop run twice?" };
  const q2 = { question: "Is the lab due Friday or Sunday?" };

  it("names the question AND the author on insert", () => {
    const out = insertedAnswerAnnouncement(q1, "Priya Natarajan");
    expect(out).toContain("Why does the loop run twice?");
    expect(out).toContain("Priya Natarajan");
  });

  it("names the question on copy", () => {
    expect(copiedAnswerAnnouncement(q1)).toContain("Why does the loop run twice?");
  });

  it("two questions in ONE row give two DIFFERENT insert strings - the live region only speaks a string that actually changed", () => {
    const author = "Priya Natarajan";
    expect(insertedAnswerAnnouncement(q1, author)).not.toBe(insertedAnswerAnnouncement(q2, author));
  });

  it("two questions in ONE row give two DIFFERENT copy strings, for the same reason", () => {
    expect(copiedAnswerAnnouncement(q1)).not.toBe(copiedAnswerAnnouncement(q2));
  });

  it("clamps the question inside both announcements, so a 300-character question does not become a 300-character utterance", () => {
    const long = { question: "a".repeat(300) };
    expect(insertedAnswerAnnouncement(long, "Priya Natarajan").length).toBeLessThan(140);
    expect(copiedAnswerAnnouncement(long).length).toBeLessThan(100);
  });
});
