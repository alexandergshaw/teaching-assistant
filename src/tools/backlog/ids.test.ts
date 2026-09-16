import { describe, it, expect } from "vitest";
import { findDuplicateIds } from "./ids";
import type { BacklogItem } from "./types";

function item(id: string): BacklogItem {
  return {
    id,
    state: "unscoped",
    kind: "chore",
    area: "loop-and-docs-maintenance",
    title: "t",
    owns: [],
    verify: null,
    blocked_by: [],
    instrument: "",
    from: "",
    note: "",
  };
}

describe("findDuplicateIds (Ruling BA-4 / Blocker B3)", () => {
  it("returns [] for a unique set - the only pass", () => {
    expect(findDuplicateIds([item("V1"), item("D1"), item("N1")])).toEqual([]);
  });

  // The mutant this test kills: today's docs/BACKLOG.md numbers items PER
  // SECTION, so three sections could each contain an item literally named
  // "1". A selector keyed on that bare number would merge them; this proves
  // the duplicate count catches it rather than silently picking one.
  it("reports an exact duplicate COUNT, not just a boolean, when three sections reuse the same bare number", () => {
    const items = [item("1"), item("1"), item("1"), item("2")];
    expect(findDuplicateIds(items)).toEqual([{ id: "1", count: 3 }]);
  });

  it("reports every distinct duplicated id, sorted, when more than one id collides", () => {
    const items = [item("B"), item("A"), item("A"), item("B"), item("C")];
    expect(findDuplicateIds(items)).toEqual([
      { id: "A", count: 2 },
      { id: "B", count: 2 },
    ]);
  });

  it("is deterministic across repeated calls on the same input", () => {
    const items = [item("A"), item("A")];
    expect(findDuplicateIds(items)).toEqual(findDuplicateIds(items));
  });
});
