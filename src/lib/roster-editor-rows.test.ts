import { describe, it, expect } from "vitest";
import { updateEditorRow, removeEditorRow, addEditorRow } from "./roster-editor-rows";
import { rosterToRows, rowsToRoster } from "./courses-tab-helpers";

interface Row {
  id: string;
  student: string;
  username: string;
}

describe("updateEditorRow (R1)", () => {
  it("a row whose name is cleared mid-edit still exists, and is not filtered until Save", () => {
    let rows: Row[] = [{ id: "r1", student: "Jo Smith", username: "" }];
    // Simulates backspacing the whole name while correcting it - the OLD
    // behavior (deriving `rows` from `rowsToRoster(rows)` every keystroke)
    // dropped this row the instant BOTH fields were blank, before the new
    // name could even be typed.
    rows = updateEditorRow(rows, "r1", { student: "" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ id: "r1", student: "", username: "" });

    rows = updateEditorRow(rows, "r1", { student: "Jo Ann Smith" });
    expect(rows).toHaveLength(1);

    const saved = rowsToRoster(rows.map(({ student, username }) => ({ student, username })));
    expect(saved).toBe("Jo Ann Smith");
  });

  it("updating one row never touches a sibling row", () => {
    const rows: Row[] = [
      { id: "a", student: "A", username: "" },
      { id: "b", student: "B", username: "" },
    ];
    const next = updateEditorRow(rows, "a", { username: "ahandle" });
    expect(next[1]).toEqual(rows[1]);
    expect(next[0]).toEqual({ id: "a", student: "A", username: "ahandle" });
  });

  it("a name containing '|' is not corrupted by a single Save-time serialization - only a re-parse (the OLD per-keystroke round trip) does that", () => {
    const rows: Row[] = [{ id: "r1", student: "Ruiz|Ana", username: "" }];
    const saved = rowsToRoster(rows.map(({ student, username }) => ({ student, username })));
    expect(saved).toBe("Ruiz|Ana");

    // Demonstrates the defect this fix removes: feeding that saved text
    // BACK through rosterToRows (what the old per-keystroke derivation did
    // on every change) fabricates a username, because rosterToRows itself
    // splits on the LAST "|" and is unchanged/frozen (REGRESSION 361).
    const reparsed = rosterToRows(saved);
    expect(reparsed).toEqual([{ student: "Ruiz", username: "Ana" }]);
  });
});

describe("removeEditorRow (R4)", () => {
  const rows: Row[] = [
    { id: "a", student: "A", username: "" },
    { id: "b", student: "B", username: "" },
    { id: "c", student: "C", username: "" },
  ];

  it("removes only the targeted row and focuses the row that shifted into its place", () => {
    const result = removeEditorRow(rows, "b");
    expect(result.rows.map((r) => r.id)).toEqual(["a", "c"]);
    expect(result.focusRowId).toBe("c");
  });

  it("focuses the previous row when the LAST row is removed", () => {
    const result = removeEditorRow(rows, "c");
    expect(result.rows.map((r) => r.id)).toEqual(["a", "b"]);
    expect(result.focusRowId).toBe("b");
  });

  it("returns null focusRowId when the only row is removed - the caller then focuses Add student", () => {
    const result = removeEditorRow([{ id: "solo", student: "Solo", username: "" }], "solo");
    expect(result.rows).toEqual([]);
    expect(result.focusRowId).toBeNull();
  });

  it("is a no-op (same array reference back) when the id does not exist", () => {
    const result = removeEditorRow(rows, "nope");
    expect(result.rows).toBe(rows);
    expect(result.focusRowId).toBeNull();
  });
});

describe("addEditorRow (R2)", () => {
  it("appends an entirely blank row - never a 'New student' placeholder", () => {
    const rows: Row[] = [];
    const next = addEditorRow(rows, { id: "new1", student: "", username: "" });
    expect(next).toEqual([{ id: "new1", student: "", username: "" }]);
  });

  it("a still-blank added row is dropped by rowsToRoster only at Save, matching the existing empty-row filter", () => {
    const rows: Row[] = addEditorRow([{ id: "a", student: "Jo", username: "" }], { id: "new1", student: "", username: "" });
    const saved = rowsToRoster(rows.map(({ student, username }) => ({ student, username })));
    expect(saved).toBe("Jo");
  });
});
