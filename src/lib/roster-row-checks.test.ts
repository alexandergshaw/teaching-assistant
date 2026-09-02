import { describe, it, expect } from "vitest";
import { findRosterRowDuplicates, describeRosterDuplicate } from "./roster-row-checks";

describe("findRosterRowDuplicates", () => {
  it("marks BOTH occurrences of a duplicated normalized name", () => {
    const rows = [
      { student: "Jo Smith", username: "" },
      { student: "Ana Ruiz", username: "" },
      { student: "  jo   smith ", username: "" },
    ];
    const dup = findRosterRowDuplicates(rows);
    expect(dup.duplicateNameIndexes).toEqual(new Set([0, 2]));
    expect(dup.duplicateHandleIndexes.size).toBe(0);
  });

  it("marks both occurrences of a duplicated handle, case-insensitively", () => {
    const rows = [
      { student: "A", username: "JSmith" },
      { student: "B", username: "other" },
      { student: "C", username: "jsmith" },
    ];
    const dup = findRosterRowDuplicates(rows);
    expect(dup.duplicateHandleIndexes).toEqual(new Set([0, 2]));
  });

  it("ignores blank names/handles - they never collide with each other", () => {
    const rows = [
      { student: "", username: "" },
      { student: "", username: "" },
    ];
    const dup = findRosterRowDuplicates(rows);
    expect(dup.duplicateNameIndexes.size).toBe(0);
    expect(dup.duplicateHandleIndexes.size).toBe(0);
  });

  it("three-way collision marks all three indexes", () => {
    const rows = [{ student: "Jo Smith", username: "" }, { student: "Jo Smith", username: "" }, { student: "Jo Smith", username: "" }];
    const dup = findRosterRowDuplicates(rows);
    expect(dup.duplicateNameIndexes).toEqual(new Set([0, 1, 2]));
  });
});

describe("describeRosterDuplicate", () => {
  const rows = [
    { student: "Jo Smith", username: "jsmith" },
    { student: "Jo Smith", username: "other" },
  ];
  const dup = findRosterRowDuplicates(rows);

  it("names the shared repo suffix for a name collision", () => {
    const message = describeRosterDuplicate(rows[0], 0, dup);
    expect(message).toBe('Same name as another row - both would generate the repo suffix "jo-smith".');
  });

  it("returns null for a row with no collision", () => {
    const cleanDup = findRosterRowDuplicates([{ student: "Solo", username: "solo1" }]);
    expect(describeRosterDuplicate({ student: "Solo", username: "solo1" }, 0, cleanDup)).toBeNull();
  });

  it("reports a combined message when both name and handle collide", () => {
    const bothRows = [
      { student: "Jo Smith", username: "same" },
      { student: "Jo Smith", username: "same" },
    ];
    const bothDup = findRosterRowDuplicates(bothRows);
    const message = describeRosterDuplicate(bothRows[0], 0, bothDup);
    expect(message).toContain("Same name and GitHub username");
  });
});
