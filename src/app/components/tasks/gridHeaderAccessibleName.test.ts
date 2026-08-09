// Coverage for the Tasks grid's two frozen-header accessible-name builders
// (AC-D item 223) - pulled out of TasksGrid.tsx into
// gridHeaderAccessibleName.ts purely for line budget (see that file's header
// comment), not because of a behavior change; this suite pins the existing
// contract the extraction must not disturb.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { courseHeaderAccessibleName, progressHeaderAccessibleName } from "./gridHeaderAccessibleName";

const ALL = "__all__";

describe("courseHeaderAccessibleName", () => {
  it("is the bare label with no institution/term filter and no sort", () => {
    expect(courseHeaderAccessibleName(ALL, ALL, ALL, false, "asc")).toBe("Course");
  });

  it("states an institution filter, a term filter, or both, joined by a comma", () => {
    expect(courseHeaderAccessibleName("Acme U", ALL, ALL, false, "asc")).toBe("Course, filtered to Institution: Acme U.");
    expect(courseHeaderAccessibleName(ALL, "Fall 2026", ALL, false, "asc")).toBe("Course, filtered to Term: Fall 2026.");
    expect(courseHeaderAccessibleName("Acme U", "Fall 2026", ALL, false, "asc")).toBe(
      "Course, filtered to Institution: Acme U, Term: Fall 2026."
    );
  });

  it("appends the sort direction as its own sentence when sorted", () => {
    expect(courseHeaderAccessibleName(ALL, ALL, ALL, true, "asc")).toBe("Course. Sorted ascending.");
    expect(courseHeaderAccessibleName(ALL, ALL, ALL, true, "desc")).toBe("Course. Sorted descending.");
  });

  it("combines a filter and a sort without a double terminator", () => {
    expect(courseHeaderAccessibleName("Acme U", ALL, ALL, true, "asc")).toBe(
      "Course, filtered to Institution: Acme U. Sorted ascending."
    );
  });
});

describe("progressHeaderAccessibleName", () => {
  it("is the bare label with outstandingOnly off and no sort", () => {
    expect(progressHeaderAccessibleName(false, false, "asc")).toBe("Progress");
  });

  it("states the outstanding-only constraint when active", () => {
    expect(progressHeaderAccessibleName(true, false, "asc")).toBe("Progress, filtered to rows with outstanding work.");
  });

  it("appends the sort direction as its own sentence when sorted", () => {
    expect(progressHeaderAccessibleName(false, true, "desc")).toBe("Progress. Sorted descending.");
  });

  it("combines outstanding-only and a sort without a double terminator", () => {
    expect(progressHeaderAccessibleName(true, true, "asc")).toBe(
      "Progress, filtered to rows with outstanding work. Sorted ascending."
    );
  });
});

describe("gridHeaderAccessibleName module", () => {
  it("stays a pure module - no component, MUI or CSS import", () => {
    const source = readFileSync(new URL("./gridHeaderAccessibleName.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from\s+["'](\.\/[A-Z]|@mui|[^"']*\.module\.css)/);
  });
});
