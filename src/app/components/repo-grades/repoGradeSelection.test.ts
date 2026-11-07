import { describe, expect, it } from "vitest";
import { gradeSelectionKey, groupGradeSelection, toggleGradeSelection } from "./repoGradeSelection";

describe("gradebook selection", () => {
  it("selects a whole column and clears it when all are selected", () => {
    const cells = [{ repo: "org/a", folder: "Lab" }, { repo: "org/b", folder: "Lab" }];
    const selected = toggleGradeSelection(new Set(), cells);
    expect(selected.has(gradeSelectionKey("org/a", "Lab"))).toBe(true);
    expect(selected.has(gradeSelectionKey("org/b", "Lab"))).toBe(true);
    expect(toggleGradeSelection(selected, cells).size).toBe(0);
  });
  it("does not add extra cells when grouping an irregular selection", () => {
    expect(groupGradeSelection([
      { repo: "org/a", folder: "Lab 1" }, { repo: "org/b", folder: "Lab 1" },
      { repo: "org/a", folder: "Lab 2" }, { repo: "org/a", folder: "Lab 3" },
    ])).toEqual([
      { folders: ["Lab 1"], repos: ["org/a", "org/b"] },
      { folders: ["Lab 2", "Lab 3"], repos: ["org/a"] },
    ]);
  });
});
