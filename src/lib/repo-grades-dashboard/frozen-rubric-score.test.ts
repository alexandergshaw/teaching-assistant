import { describe, expect, it } from "vitest";
import { matchesFrozenRubricScore } from "./frozen-rubric-score";

describe("reconciling a model score with its frozen rubric", () => {
  const rubric = "Correctness (40%): Implementation\nTesting (60%): Tests";
  const areas = [{ area: "Correctness", score: "8/10" }, { area: "Testing", score: "5/10" }];
  it("accepts the weighted score using all frozen criteria", () => {
    expect(matchesFrozenRubricScore(rubric, areas, { earned: 62, possible: 100 })).toBe(true);
  });
  it("rejects omitted, invented and duplicate criteria", () => {
    expect(matchesFrozenRubricScore(rubric, areas.slice(0, 1), { earned: 80, possible: 100 })).toBe(false);
    expect(matchesFrozenRubricScore(rubric, [areas[0], { ...areas[1], area: "Invented" }], { earned: 62, possible: 100 })).toBe(false);
    expect(matchesFrozenRubricScore(rubric, [areas[0], areas[0]], { earned: 80, possible: 100 })).toBe(false);
    expect(matchesFrozenRubricScore("Correctness (50%): First\nCorrectness (50%): Duplicate", [areas[0]], { earned: 80, possible: 100 })).toBe(false);
    expect(matchesFrozenRubricScore("Correctness (10 points): Work\nTesting: 10 points", [areas[0]], { earned: 8, possible: 10 })).toBe(false);
    expect(matchesFrozenRubricScore("Correctness (10 points): Work\n  Testing (10 points): Tests", [areas[0]], { earned: 8, possible: 10 })).toBe(false);
    expect(matchesFrozenRubricScore("Correctness (10 points): Work; Testing (10 points): Tests", [areas[0]], { earned: 8, possible: 10 })).toBe(false);
  });
  it("rejects inconsistent totals and invalid points", () => {
    expect(matchesFrozenRubricScore(rubric, areas, { earned: 80, possible: 100 })).toBe(false);
    expect(matchesFrozenRubricScore("A (10 points): Work", [{ area: "A", score: "8/20" }], { earned: 8, possible: 10 })).toBe(false);
    expect(matchesFrozenRubricScore("A (10 points): Work", [{ area: "A", score: "8/10 or 4/10" }], { earned: 8, possible: 10 })).toBe(false);
    expect(matchesFrozenRubricScore("unparseable", areas, { earned: 62, possible: 100 })).toBe(false);
  });
});
