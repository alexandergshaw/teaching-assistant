// Pure-leaf unit tests for the New Quiz classifier (D1,
// docs/assignments-quizzes-tabs-acceptance-criteria.md Contract 1 / AC C, E3).
// See new-quiz.ts's header comment for the field evidence this rule relies
// on (fetched directly from the live Canvas API docs, since this repo had no
// prior reference to any of these fields to check against).

import { describe, it, expect } from "vitest";
import { isNewQuizAssignment, type NewQuizSignals } from "./new-quiz";

// A row shaped exactly like a real New Quiz's assignment JSON, per the
// evidence in new-quiz.ts: is_quiz_assignment true, submission_types
// ["external_tool"], no quiz_id.
const NEW_QUIZ: NewQuizSignals = {
  isQuizAssignment: true,
  submissionTypes: ["external_tool"],
  quizId: null,
};

describe("isNewQuizAssignment - positive case", () => {
  it("labels a row with both confirming signals and no quiz_id as a New Quiz", () => {
    expect(isNewQuizAssignment(NEW_QUIZ)).toBe(true);
  });

  it("still labels it a New Quiz when quiz_id is simply absent rather than null", () => {
    const { quizId: _quizId, ...withoutQuizId } = NEW_QUIZ;
    expect(isNewQuizAssignment(withoutQuizId)).toBe(true);
  });

  it("tolerates extra submission types alongside external_tool", () => {
    expect(
      isNewQuizAssignment({ ...NEW_QUIZ, submissionTypes: ["external_tool", "online_upload"] })
    ).toBe(true);
  });
});

describe("isNewQuizAssignment - conservative negatives (AC: absent/ambiguous signals must return false)", () => {
  it("rejects an ordinary assignment with no signals at all", () => {
    expect(isNewQuizAssignment({})).toBe(false);
  });

  it("rejects when is_quiz_assignment is false, even with external_tool present", () => {
    expect(isNewQuizAssignment({ ...NEW_QUIZ, isQuizAssignment: false })).toBe(false);
  });

  it("rejects when is_quiz_assignment is missing (undefined), even with external_tool present", () => {
    const { isQuizAssignment: _flag, ...rest } = NEW_QUIZ;
    expect(isNewQuizAssignment(rest)).toBe(false);
  });

  it('rejects an ordinary external-tool assignment that is not a quiz (submission_types alone is not sufficient)', () => {
    expect(isNewQuizAssignment({ submissionTypes: ["external_tool"] })).toBe(false);
  });

  it("rejects when submission_types does not include external_tool, even if is_quiz_assignment is true", () => {
    expect(isNewQuizAssignment({ isQuizAssignment: true, submissionTypes: ["online_upload"] })).toBe(false);
  });

  it("rejects when submission_types is missing entirely", () => {
    expect(isNewQuizAssignment({ isQuizAssignment: true })).toBe(false);
  });

  it("rejects a classic quiz's shadow assignment (quiz_id present) even if it otherwise looks like a New Quiz", () => {
    expect(isNewQuizAssignment({ ...NEW_QUIZ, quizId: 42 })).toBe(false);
  });

  it("rejects a classic quiz's real shape (online_quiz + quiz_id, no is_quiz_assignment)", () => {
    expect(
      isNewQuizAssignment({ submissionTypes: ["online_quiz"], quizId: 42, isQuizAssignment: undefined })
    ).toBe(false);
  });
});
