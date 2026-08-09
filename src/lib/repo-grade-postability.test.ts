import { describe, it, expect } from "vitest";
import { repoGradePostability, type PostabilityInput } from "./repo-grade-postability";

// Every expectation below is a frozen literal, hand-written against AC5 item
// 28 (docs/repo-grades-view-acceptance-criteria.md), never computed from the
// implementation.

/** A fully-postable baseline input; each matrix case mutates exactly one
 * field off this baseline so every test isolates a single failure cause. */
const BASELINE: PostabilityInput = {
  bindingState: "confirmed",
  canvasUserId: "101",
  assignmentId: "5001",
  folderPresent: true,
  score: "92",
};

describe("repoGradePostability", () => {
  it("is postable when every requirement is met, returning the parsed numeric userId and score", () => {
    expect(repoGradePostability(BASELINE)).toEqual({ postable: true, userId: 101, score: 92 });
  });

  it("parses a decimal score", () => {
    expect(repoGradePostability({ ...BASELINE, score: "87.5" })).toEqual({
      postable: true,
      userId: 101,
      score: 87.5,
    });
  });

  it("trims surrounding whitespace on the score before parsing", () => {
    expect(repoGradePostability({ ...BASELINE, score: "  92  " })).toEqual({
      postable: true,
      userId: 101,
      score: 92,
    });
  });

  describe("binding state", () => {
    it.each(["suggested", "ambiguous", "unbound"] as const)(
      "is not postable when bindingState is %s",
      (state) => {
        const result = repoGradePostability({ ...BASELINE, bindingState: state });
        expect(result).toEqual({
          postable: false,
          reason: `The student binding is "${state}", not confirmed - accept or resolve the binding first.`,
        });
      }
    );

    it("binding-state failure is reported even when every other field would otherwise be postable", () => {
      const result = repoGradePostability({ ...BASELINE, bindingState: "unbound", canvasUserId: null });
      expect(result.postable).toBe(false);
    });
  });

  describe("canvasUserId digit-ness", () => {
    it("is not postable when canvasUserId is null", () => {
      expect(repoGradePostability({ ...BASELINE, canvasUserId: null })).toEqual({
        postable: false,
        reason: "No numeric Canvas user id is bound to this row.",
      });
    });

    it("is not postable when canvasUserId is blank", () => {
      expect(repoGradePostability({ ...BASELINE, canvasUserId: "" })).toEqual({
        postable: false,
        reason: "No numeric Canvas user id is bound to this row.",
      });
    });

    it("is not postable when canvasUserId is non-numeric", () => {
      expect(repoGradePostability({ ...BASELINE, canvasUserId: "abc123" })).toEqual({
        postable: false,
        reason: "No numeric Canvas user id is bound to this row.",
      });
    });
  });

  describe("assignment mapping", () => {
    it("is not postable when assignmentId is null (column unmapped)", () => {
      expect(repoGradePostability({ ...BASELINE, assignmentId: null })).toEqual({
        postable: false,
        reason: "This column has no mapped Canvas assignment.",
      });
    });

    it("is not postable when assignmentId is blank", () => {
      expect(repoGradePostability({ ...BASELINE, assignmentId: "   " })).toEqual({
        postable: false,
        reason: "This column has no mapped Canvas assignment.",
      });
    });
  });

  describe("folder presence", () => {
    it("is not postable when folderPresent is false", () => {
      expect(repoGradePostability({ ...BASELINE, folderPresent: false })).toEqual({
        postable: false,
        reason: "This repo has no folder for this assignment.",
      });
    });
  });

  describe("score parseability", () => {
    it("is not postable when score is empty", () => {
      expect(repoGradePostability({ ...BASELINE, score: "" })).toEqual({
        postable: false,
        reason: "Enter a score before posting.",
      });
    });

    it("is not postable when score is only whitespace", () => {
      expect(repoGradePostability({ ...BASELINE, score: "   " })).toEqual({
        postable: false,
        reason: "Enter a score before posting.",
      });
    });

    it("is not postable when score is not a number", () => {
      expect(repoGradePostability({ ...BASELINE, score: "not-a-number" })).toEqual({
        postable: false,
        reason: '"not-a-number" is not a valid score.',
      });
    });

    it("is not postable when score is Infinity", () => {
      expect(repoGradePostability({ ...BASELINE, score: "Infinity" })).toEqual({
        postable: false,
        reason: '"Infinity" is not a valid score.',
      });
    });

    it("is not postable when score is NaN literal text", () => {
      expect(repoGradePostability({ ...BASELINE, score: "NaN" })).toEqual({
        postable: false,
        reason: '"NaN" is not a valid score.',
      });
    });
  });

  // The full matrix over binding state x digit-ness x column mapping x
  // folder presence x score parseability, as required by the acceptance
  // criteria's pre-written test list item 3. Each row is independent and
  // frozen by hand.
  describe("full postability matrix", () => {
    const cases: Array<{ name: string; input: PostabilityInput; expected: ReturnType<typeof repoGradePostability> }> = [
      {
        name: "all requirements met",
        input: { bindingState: "confirmed", canvasUserId: "42", assignmentId: "9", folderPresent: true, score: "100" },
        expected: { postable: true, userId: 42, score: 100 },
      },
      {
        name: "suggested + everything else fine",
        input: { bindingState: "suggested", canvasUserId: null, assignmentId: "9", folderPresent: true, score: "100" },
        expected: {
          postable: false,
          reason: 'The student binding is "suggested", not confirmed - accept or resolve the binding first.',
        },
      },
      {
        name: "confirmed but non-numeric canvasUserId (stored-bad-id case)",
        input: { bindingState: "confirmed", canvasUserId: "not-numeric", assignmentId: "9", folderPresent: true, score: "100" },
        expected: { postable: false, reason: "No numeric Canvas user id is bound to this row." },
      },
      {
        name: "confirmed, numeric id, unmapped column",
        input: { bindingState: "confirmed", canvasUserId: "42", assignmentId: null, folderPresent: true, score: "100" },
        expected: { postable: false, reason: "This column has no mapped Canvas assignment." },
      },
      {
        name: "confirmed, numeric id, mapped column, no folder",
        input: { bindingState: "confirmed", canvasUserId: "42", assignmentId: "9", folderPresent: false, score: "100" },
        expected: { postable: false, reason: "This repo has no folder for this assignment." },
      },
      {
        name: "confirmed, numeric id, mapped column, folder present, blank score",
        input: { bindingState: "confirmed", canvasUserId: "42", assignmentId: "9", folderPresent: true, score: "" },
        expected: { postable: false, reason: "Enter a score before posting." },
      },
      {
        name: "confirmed, numeric id, mapped column, folder present, unparseable score",
        input: { bindingState: "confirmed", canvasUserId: "42", assignmentId: "9", folderPresent: true, score: "xyz" },
        expected: { postable: false, reason: '"xyz" is not a valid score.' },
      },
      {
        name: "ambiguous + everything else fine",
        input: { bindingState: "ambiguous", canvasUserId: null, assignmentId: "9", folderPresent: true, score: "100" },
        expected: {
          postable: false,
          reason: 'The student binding is "ambiguous", not confirmed - accept or resolve the binding first.',
        },
      },
      {
        name: "unbound + everything else fine",
        input: { bindingState: "unbound", canvasUserId: null, assignmentId: "9", folderPresent: true, score: "100" },
        expected: {
          postable: false,
          reason: 'The student binding is "unbound", not confirmed - accept or resolve the binding first.',
        },
      },
      {
        name: "every requirement failing at once still reports the FIRST failure (binding state)",
        input: { bindingState: "unbound", canvasUserId: "bad", assignmentId: null, folderPresent: false, score: "" },
        expected: {
          postable: false,
          reason: 'The student binding is "unbound", not confirmed - accept or resolve the binding first.',
        },
      },
    ];

    it.each(cases)("$name", ({ input, expected }) => {
      expect(repoGradePostability(input)).toEqual(expected);
    });
  });
});

// --------------------------------------------------------------------------
// SABOTAGE-CHECK LOG (each verified by hand: broke the behavior, ran
// `npx vitest run src/lib/repo-grade-postability.test.ts`, confirmed a
// failure, then reverted before re-running to confirm green again).
//
// 1. Score parseability: changed `Number.isFinite(parsedScore)` to
//    `!Number.isNaN(parsedScore)` in repo-grade-postability.ts. Result: "is
//    not postable when score is Infinity" failed - Number("Infinity") is
//    Infinity, which is not NaN, so the sabotaged check let it through as
//    postable, contradicting the frozen `postable: false` expectation.
//    Reverted to `Number.isFinite`; suite green again.
// 2. Empty-score guard: removed the `if (!scoreTrimmed) return {...}` early
//    check entirely (relying only on Number.isFinite). Result: "is not
//    postable when score is empty" failed - Number("") is 0, a finite
//    number, so the sabotaged version returned `{ postable: true, userId:
//    101, score: 0 }` instead of the frozen "Enter a score before posting."
//    reason. Reverted; suite green again.
// 3. canvasUserId digit check: changed `/^\d+$/.test(idTrimmed)` to
//    `idTrimmed.length > 0`. Result: "is not postable when canvasUserId is
//    non-numeric" failed - "abc123" has length > 0, so the sabotaged version
//    returned `postable: true` instead of the frozen digit-ness failure.
//    Reverted; suite green again.
// --------------------------------------------------------------------------
