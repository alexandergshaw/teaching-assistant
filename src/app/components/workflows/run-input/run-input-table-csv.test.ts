// Tests for buildReviewTableCsv, added here (rather than in
// run-input-table-stats.test.ts) because that file must keep passing
// UNMODIFIED per this refactor's acceptance criteria - this is a separate
// test file for the one function DEFECT 3 added to that module.
import { describe, it, expect } from "vitest";
import { buildReviewTableCsv } from "../run-input-table-stats";

const identityCsvCell = (value: string) => value;

describe("buildReviewTableCsv", () => {
  it("builds a header row from the column labels and one row per visible row", () => {
    const columns = [{ key: "name", label: "Name" }, { key: "grade", label: "Grade" }];
    const visibleRows = [
      { row: { name: "Alice", grade: "90" }, index: 0 },
      { row: { name: "Bob", grade: "80" }, index: 1 },
    ];
    const csv = buildReviewTableCsv(columns, visibleRows, [], false, identityCsvCell);
    expect(csv).toBe("Name,Grade\nAlice,90\nBob,80");
  });

  it("excludes link columns from both the header and the row data", () => {
    const columns = [
      { key: "name", label: "Name" },
      { key: "url", label: "Submission", link: true },
    ];
    const visibleRows = [{ row: { name: "Alice", url: "https://example.com" }, index: 0 }];
    const csv = buildReviewTableCsv(columns, visibleRows, [], false, identityCsvCell);
    expect(csv).toBe("Name\nAlice");
  });

  it("appends a Selected column reflecting each row's own checked state when selectable", () => {
    const columns = [{ key: "name", label: "Name" }];
    const visibleRows = [
      { row: { name: "Alice" }, index: 0 },
      { row: { name: "Bob" }, index: 1 },
    ];
    const csv = buildReviewTableCsv(columns, visibleRows, [true, false], true, identityCsvCell);
    expect(csv).toBe("Name,Selected\nAlice,yes\nBob,no");
  });

  it("treats a row with no recorded checked entry as selected by default", () => {
    const columns = [{ key: "name", label: "Name" }];
    const visibleRows = [{ row: { name: "Alice" }, index: 0 }];
    const csv = buildReviewTableCsv(columns, visibleRows, [], true, identityCsvCell);
    expect(csv).toBe("Name,Selected\nAlice,yes");
  });

  it("reads a row's checked state by its ORIGINAL index, not its position in the visible list", () => {
    const columns = [{ key: "name", label: "Name" }];
    // Row at original index 2 is checked; index 0 is not - and it is the
    // only one visible (e.g. after a search filter), at display position 0.
    const visibleRows = [{ row: { name: "Carl" }, index: 2 }];
    const csv = buildReviewTableCsv(columns, visibleRows, [false, false, true], true, identityCsvCell);
    expect(csv).toBe("Name,Selected\nCarl,yes");
  });

  it("omits the Selected column entirely when not selectable", () => {
    const columns = [{ key: "name", label: "Name" }];
    const visibleRows = [{ row: { name: "Alice" }, index: 0 }];
    const csv = buildReviewTableCsv(columns, visibleRows, [true], false, identityCsvCell);
    expect(csv).toBe("Name\nAlice");
  });

  it("fills a missing cell value with an empty string rather than throwing", () => {
    const columns = [{ key: "name", label: "Name" }, { key: "grade", label: "Grade" }];
    const visibleRows = [{ row: { name: "Alice" }, index: 0 }];
    const csv = buildReviewTableCsv(columns, visibleRows, [], false, identityCsvCell);
    expect(csv).toBe("Name,Grade\nAlice,");
  });

  it("applies csvCell to every header and data cell (quoting/escaping delegated to the caller)", () => {
    const columns = [{ key: "name", label: "Name" }];
    const visibleRows = [{ row: { name: "a,b" }, index: 0 }];
    const csv = buildReviewTableCsv(columns, visibleRows, [], false, (v) => `"${v.replace(/"/g, '""')}"`);
    expect(csv).toBe('"Name"\n"a,b"');
  });
});
