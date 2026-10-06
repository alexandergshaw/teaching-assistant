import { describe, it, expect } from "vitest";
import type { Course } from "./supabase/courses";
import { makeCourse } from "./courses-table-helpers.fixtures";
import { mergeHydratedCourses, heavyReadReady, HEAVY_CELL_COLUMNS, HEAVY_COURSE_FIELDS } from "./courses-hydration";
import { ALL_COLUMN_IDS } from "./courses-table-helpers";
import type { CellColumnId } from "./courses-table-labels";

function light(id: string, name: string): Course {
  return makeCourse({ id, name, roster: null, csvData: null, materialsFiles: [], description: null });
}
function full(id: string, name: string): Course {
  return makeCourse({
    id,
    name,
    roster: "Ann\nBob",
    csvData: "week,topic",
    description: "Long text",
    materialsFiles: [{ name: "a.pdf", path: "p/a.pdf", size: 1, addedAt: "2026-01-01" }],
  });
}

describe("mergeHydratedCourses", () => {
  it("keeps light order and ids, fills heavy fields from the full row", () => {
    const l = [light("b", "B"), light("a", "A"), light("c", "C")];
    const f = [full("a", "A"), full("c", "C"), full("b", "B")];
    const out = mergeHydratedCourses(l, f);
    expect(out.map((c) => c.id)).toEqual(["b", "a", "c"]);
    expect(out[0].csvData).toBe("week,topic");
    expect(out[0].roster).toBe("Ann\nBob");
    expect(out[0].materialsFiles).toHaveLength(1);
    expect(out[0].description).toBe("Long text");
  });

  it("does not overwrite light scalar fields with the full row's", () => {
    const l = [light("a", "Light name")];
    const f = [full("a", "Stale full name")];
    expect(mergeHydratedCourses(l, f)[0].name).toBe("Light name");
  });

  it("returns a light course with no full counterpart unchanged, and drops full-only rows", () => {
    const l = [light("a", "A")];
    const out = mergeHydratedCourses(l, [full("zzz", "Z")]);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(l[0]);
  });

  it("covers every declared heavy field", () => {
    expect(HEAVY_COURSE_FIELDS).toHaveLength(17);
  });
});

describe("heavyReadReady", () => {
  const FROZEN_HEAVY_COLUMNS: CellColumnId[] = [
    "weeklyChecklist", "roster", "studentRepos", "instructorBio", "description", "topicOutline",
    "scheduleCsv", "rubric", "materials", "lmsExports", "castletop", "miscFiles", "courseProject",
  ];

  it("heavy column set is frozen", () => {
    expect([...HEAVY_CELL_COLUMNS].sort()).toEqual([...FROZEN_HEAVY_COLUMNS].sort());
  });

  it("heavy columns are not ready before hydration, ready after", () => {
    for (const col of FROZEN_HEAVY_COLUMNS) {
      expect(heavyReadReady(false, col), col).toBe(false);
      expect(heavyReadReady(true, col), col).toBe(true);
    }
  });

  it("every other column is always ready", () => {
    const all: CellColumnId[] = [...ALL_COLUMN_IDS, "name"];
    for (const col of all) {
      if (FROZEN_HEAVY_COLUMNS.includes(col)) continue;
      expect(heavyReadReady(false, col), col).toBe(true);
    }
  });
});
