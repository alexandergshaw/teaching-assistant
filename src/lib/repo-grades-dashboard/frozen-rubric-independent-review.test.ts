import { expect, it } from "vitest";
import { matchesFrozenRubricScore } from "./frozen-rubric-score";

it("does not award a complete score when a duplicate frozen criterion is omitted", () => {
  const rubric = "Correctness (10 points): first requirement\nCorrectness (10 points): second requirement";
  expect(matchesFrozenRubricScore(rubric, [{ area: "Correctness", score: "10/10" }], { earned: 10, possible: 10 })).toBe(false);
});

it("does not award a complete score when a frozen criterion uses an unparsed format", () => {
  const rubric = "Correctness (10 points): implementation\nTesting: 10 points";
  expect(matchesFrozenRubricScore(rubric, [{ area: "Correctness", score: "10/10" }], { earned: 10, possible: 10 })).toBe(false);
});

it("rejects an unparsed criterion with a description after its points", () => {
  const rubric = "Correctness (10 points): implementation\nTesting: 10 points - run tests";
  expect(matchesFrozenRubricScore(rubric, [{ area: "Correctness", score: "10/10" }], { earned: 10, possible: 10 })).toBe(false);
});

it("rejects a differently formatted indented criterion", () => {
  const rubric = "Correctness (10 points): implementation\n  Testing: 10 points - run tests";
  expect(matchesFrozenRubricScore(rubric, [{ area: "Correctness", score: "10/10" }], { earned: 10, possible: 10 })).toBe(false);
});

it("rejects extra material before an otherwise valid flattened table", () => {
  const rubric = "Testing: 10 points\nCriteria\nMeets Expectations (100%)\nPartially Meets Expectations (70%)\nDoes Not Meet Expectations (0%)\nValue\nCorrectness\nGood\nSome\nNone\n100\nTotal\n100%";
  expect(matchesFrozenRubricScore(rubric, [{ area: "Correctness", score: "100/100" }], { earned: 100, possible: 100 })).toBe(false);
});

it("rejects an indented criterion with omitted point units", () => {
  const rubric = "Correctness (10 points): implementation\n  Testing (10): run tests";
  expect(matchesFrozenRubricScore(rubric, [{ area: "Correctness", score: "10/10" }], { earned: 10, possible: 10 })).toBe(false);
});

it("does not ignore a criterion preceding an otherwise recognized table", () => {
  const rubric = "Testing (10 points): run tests\nCriteria\nMeets Expectations (100%)\nPartially Meets Expectations (70%)\nDoes Not Meet Expectations (0%)\nValue\nCorrectness\nGood\nPartial\nNone\n100\nTotal\n100%";
  expect(matchesFrozenRubricScore(rubric, [{ area: "Correctness", score: "100/100" }], { earned: 100, possible: 100 })).toBe(false);
});

it("rejects a criterion hidden after a Unicode line separator", () => {
  const rubric = "Correctness (10 points): implementation\u2028Testing (10 points): tests";
  expect(matchesFrozenRubricScore(rubric, [{ area: "Correctness", score: "10/10" }], { earned: 10, possible: 10 })).toBe(false);
});

it("rejects a criterion hidden after a carriage-return-only separator", () => {
  const rubric = "Correctness (10 points): implementation\rTesting (10 points): tests";
  expect(matchesFrozenRubricScore(rubric, [{ area: "Correctness", score: "10/10" }], { earned: 10, possible: 10 })).toBe(false);
});

it.each(["\v", "\f"])("rejects a criterion hidden after control separator %j", (separator) => {
  const rubric = `Correctness (10 points): implementation${separator}Testing (10 points): tests`;
  expect(matchesFrozenRubricScore(rubric, [{ area: "Correctness", score: "10/10" }], { earned: 10, possible: 10 })).toBe(false);
});

it("rejects an extra criterion separated only by a tab", () => {
  const rubric = "Correctness (10 points): implementation\tTesting (10 points): tests";
  expect(matchesFrozenRubricScore(rubric, [{ area: "Correctness", score: "10/10" }], { earned: 10, possible: 10 })).toBe(false);
});

it("rejects a second point-valued criterion embedded on a heading line", () => {
  const rubric = "Correctness (10 points): implementation; Testing: 10 points";
  expect(matchesFrozenRubricScore(rubric, [{ area: "Correctness", score: "10/10" }], { earned: 10, possible: 10 })).toBe(false);
});
