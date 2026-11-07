import { describe, expect, it } from "vitest";
import { alignRubricScores, collectRubricOrder } from "./rubricAlignment";

describe("rubric alignment", () => {
  it("places scores in a shared order and reserves missing criteria", () => {
    const groups = [[{ area: "Design", score: "3/4" }, { area: "Tests", score: "2/2" }],
      [{ area: "Tests", score: "1/2" }, { area: "Readability", score: "4/4" }]];
    const order = collectRubricOrder(groups);
    expect(order).toEqual(["Design", "Tests", "Readability"]);
    expect(alignRubricScores(order, groups[1])).toEqual([
      { area: "Design", score: "" }, { area: "Tests", score: "1/2" }, { area: "Readability", score: "4/4" },
    ]);
  });
  it("preserves multiple criteria with the same label and reserves missing occurrences", () => {
    const groups = [[{ area: "Tests", score: "1/2" }, { area: "Tests", score: "2/2" }],
      [{ area: "Tests", score: "0/2" }]];
    const order = collectRubricOrder(groups);
    expect(order).toEqual(["Tests", "Tests"]);
    expect(alignRubricScores(order, groups[0])).toEqual(groups[0]);
    expect(alignRubricScores(order, groups[1])).toEqual([{ area: "Tests", score: "0/2" }, { area: "Tests", score: "" }]);
  });
  it("keeps feedback attached to its criterion while aligning", () => {
    const areas = [{ area: "Tests", score: "1/2", comment: "Add a boundary case" }];
    expect(alignRubricScores(["Design", "Tests"], areas)).toEqual([
      { area: "Design", score: "" }, areas[0],
    ]);
  });
});
