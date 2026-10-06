// Pure pieces of the Courses table's two-phase load: the light rows paint
// first, the full rows are merged in afterwards. No I/O, no React.

import type { Course } from "./supabase/courses";
import type { CellColumnId } from "./courses-table-labels";

/** The Course fields a light row carries as empty placeholders. */
export const HEAVY_COURSE_FIELDS = [
  "roster",
  "notes",
  "csvData",
  "rubricData",
  "description",
  "topicOutline",
  "courseProject",
  "materialsFiles",
  "castletopFiles",
  "miscFiles",
  "exportFiles",
  "customTiles",
  "studentRepos",
  "weeklyChecklist",
  "instructorBio",
  "repoModulePairing",
  "exportModuleAdditions",
] as const satisfies readonly (keyof Course)[];

/** One entry per light course, in light order: scalar/light fields stay as
 * the light row has them, heavy fields come from the full row with the same
 * id. A light course with no full counterpart is returned unchanged. */
export function mergeHydratedCourses(light: Course[], full: Course[]): Course[] {
  const byId = new Map(full.map((c) => [c.id, c] as const));
  return light.map((c) => {
    const f = byId.get(c.id);
    if (!f) return c;
    const merged: Course = { ...c };
    const target = merged as unknown as Record<string, unknown>;
    const source = f as unknown as Record<string, unknown>;
    for (const field of HEAVY_COURSE_FIELDS) target[field] = source[field];
    return merged;
  });
}

/** Table columns whose cell reads a heavy field (and so renders a placeholder
 * until the full rows land). Frozen by courses-hydration.test.ts. */
export const HEAVY_CELL_COLUMNS: readonly CellColumnId[] = [
  "weeklyChecklist",
  "roster",
  "studentRepos",
  "instructorBio",
  "description",
  "topicOutline",
  "scheduleCsv",
  "rubric",
  "materials",
  "lmsExports",
  "castletop",
  "miscFiles",
  "courseProject",
];

const HEAVY_CELL_SET: ReadonlySet<string> = new Set(HEAVY_CELL_COLUMNS);

/** True when reading `column`'s content is safe: always for a light column,
 * only after the full rows have merged for a heavy one. */
export function heavyReadReady(heavyReady: boolean, column: CellColumnId): boolean {
  return heavyReady || !HEAVY_CELL_SET.has(column);
}
