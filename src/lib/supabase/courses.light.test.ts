import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COLUMNS } from "./courses.row";
import { LIGHT_LIST_COLUMNS, HEAVY_ROW_COLUMNS, toCourseLight, type LightCourseRow } from "./courses.light";

const split = (s: string): string[] => s.split(",").map((c) => c.trim());

// Frozen literals, NOT derived from the production constants.
const FROZEN_LIGHT: string[] = [
  "id", "name", "course_code", "term", "canvas_url", "repos", "github_org", "textbook", "syllabus_id",
  "institution", "integrations", "topics", "csv_name", "rubric_name", "start_date", "weeks", "tests", "lms",
  "day_time", "modality", "syllabus_template_id", "course_kind", "end_date", "breaks", "assignment_due_rule",
  "email", "email_client", "class_length_minutes", "materials_zip_name", "materials_zip_path",
  "materials_zip_size", "hidden_tiles", "grades_due_date", "grades_due_time", "instructor_title",
  "instructor_credentials", "instructor_department", "updated_at",
];
const FROZEN_HEAVY: string[] = [
  "csv_data", "rubric_data", "topic_outline", "description", "roster", "notes", "weekly_checklist",
  "course_project", "materials_files", "castletop_files", "misc_files", "export_files",
  "repo_module_pairing", "export_module_additions", "custom_tiles", "student_repos", "instructor_bio",
];

describe("the light list column set", () => {
  it("is exactly the frozen light list", () => {
    expect(split(LIGHT_LIST_COLUMNS)).toEqual(FROZEN_LIGHT);
  });

  it("selects none of the heavy content columns", () => {
    const light = new Set(split(LIGHT_LIST_COLUMNS));
    for (const h of FROZEN_HEAVY) expect(light.has(h), `${h} leaked into the light query`).toBe(false);
  });

  it("heavy list is the frozen heavy set", () => {
    expect([...HEAVY_ROW_COLUMNS].sort()).toEqual([...FROZEN_HEAVY].sort());
  });

  it("light plus heavy partitions the full COLUMNS list exactly", () => {
    const full = split(COLUMNS).sort();
    const parts = [...split(LIGHT_LIST_COLUMNS), ...HEAVY_ROW_COLUMNS].sort();
    expect(parts).toEqual(full);
  });
});

describe("toCourseLight", () => {
  it("fills heavy fields with empty defaults and keeps light fields", () => {
    const base = Object.fromEntries(FROZEN_LIGHT.map((c) => [c, null]));
    const row = { ...base, id: "a", name: "Algo", term: "F26", updated_at: "2026-01-01T00:00:00Z" } as unknown as LightCourseRow;
    const c = toCourseLight(row);
    expect(c.id).toBe("a");
    expect(c.name).toBe("Algo");
    expect(c.term).toBe("F26");
    expect(c.csvData).toBeNull();
    expect(c.roster).toBeNull();
    expect(c.materialsFiles).toEqual([]);
    expect(c.studentRepos).toEqual([]);
    expect(c.customTiles).toEqual([]);
  });
});

describe("the shared listCourses is unchanged", () => {
  it("still selects the full COLUMNS and the light path is a separate function", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/supabase/courses.ts"), "utf8");
    const m = src.match(/export async function listCourses\(userId: string\)[\s\S]*?\n\}/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/\.select\(COLUMNS\)/);
    expect(m![0]).not.toMatch(/LIGHT_LIST_COLUMNS/);
    expect(src).not.toMatch(/listCoursesLight/);
  });
});
