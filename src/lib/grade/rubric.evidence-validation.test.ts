import { describe, expect, it } from "vitest";
import { extractRubricCriteria, extractRubricCriteriaForEvidence } from "./rubric";
describe("audited rubric before legacy deduplication", () => {
  it("keeps strict-first semantics and exposes exact numeric maxima", () => {
    const rubric = "Algorithm (6 pts): logic\n  Rating (4 pts)\nExplanation (4 pts): prose";
    expect(extractRubricCriteriaForEvidence(rubric)).toEqual({ ok: true, criteria: [{ name: "Algorithm", points: 6 }, { name: "Explanation", points: 4 }] });
  });
  it.each(["Algorithm (6 pts): first\nAlgorithm (4 pts): second", "Algorithm (6 pts): first\nALGORITHM! (4 pts): alias", "  Algorithm (6 pts)\n  ALGORITHM! (4 pts)", "Unknown (50%): first", "plain text"])("refuses raw collisions or unknown maxima %s", (rubric) => expect(extractRubricCriteriaForEvidence(rubric)).toEqual({ ok: false, reason: "ambiguous-rubric" }));
  it("preserves the old deduplicating export unchanged", () => expect(extractRubricCriteria("Algorithm (6 pts): first\nALGORITHM! (4 pts): alias")).toEqual([{ name: "Algorithm", points: 6 }]));
});