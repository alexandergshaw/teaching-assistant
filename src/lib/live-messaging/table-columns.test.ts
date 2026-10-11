import { describe, expect, it } from "vitest";
import { TABLE_COLUMNS } from "./table-columns";
import { FILTER_COLUMNS, SORT_KEYS } from "./table-filter-model";

describe("Success Tracking columns", () => {
  it("are exactly the six owner-specified columns, in order", () => {
    expect(TABLE_COLUMNS.map((c) => c.label)).toEqual([
      "Student",
      "Course",
      "Section",
      "Term",
      "Current Status",
      "# of Missing Assignments",
    ]);
  });

  it("has NO Institution column (institution is the switcher chrome)", () => {
    expect(TABLE_COLUMNS.some((c) => /institution/i.test(c.label) || /institution/i.test(c.id))).toBe(false);
  });

  it("only references sort keys and funnel columns the L3 model supports", () => {
    for (const col of TABLE_COLUMNS) {
      expect(SORT_KEYS as readonly string[]).toContain(col.sortKey);
      if (col.filter) expect(FILTER_COLUMNS as readonly string[]).toContain(col.filter);
    }
  });
});
