// Regression guard for a pre-existing defect found while building the cell
// copy menus (F6).
//
// `computeFieldPatch`'s default arm returns `{ [field]: rawValue }`. For the
// "csv" inline field that produces `{ csv: "..." }` - and CourseInput has no
// `csv` key (it has csvData/csvName). `courseToInput(course)` spread with that
// patch therefore drops it entirely, so CoursesTab's Schedule-of-Topics
// document editor ("Save" in the CSV preview window, CoursesTab.tsx) reported
// success while writing nothing.
//
// These tests pin the mapping directly rather than round-tripping through the
// component, so they stay meaningful if that call site moves.
import { describe, it, expect } from "vitest";
import { computeFieldPatch } from "./courses-table-helpers";

describe("computeFieldPatch - the csv inline field maps to csvData", () => {
  it("writes the schedule text to csvData, not to a non-existent csv key", () => {
    const patch = computeFieldPatch("csv", "week,topic\n1,Intro");
    expect(patch).toEqual({ csvData: "week,topic\n1,Intro" });
    expect(patch).not.toHaveProperty("csv");
  });

  it("clears csvData with an empty string rather than dropping the key", () => {
    const patch = computeFieldPatch("csv", "");
    expect(patch).toEqual({ csvData: "" });
    expect(Object.prototype.hasOwnProperty.call(patch, "csvData")).toBe(true);
  });

  it("leaves the other text fields' existing mapping untouched", () => {
    // Guards against "fix csv by special-casing everything" - the default
    // passthrough arm must keep working for fields whose name already matches.
    expect(computeFieldPatch("textbook", "Title: X")).toEqual({ textbook: "Title: X" });
    expect(computeFieldPatch("description", "A course.")).toEqual({ description: "A course." });
    expect(computeFieldPatch("roster", "a\nb")).toEqual({ roster: "a\nb" });
  });
});
