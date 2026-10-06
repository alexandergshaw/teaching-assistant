// Pure leaf: the Courses-table search filter, scoped to "all" or one column.
//
// "all" is the LEGACY global filter moved here verbatim from CoursesTab. Its
// field list (name, courseCode, term, institution, textbook, notes, topics,
// csvName, githubOrg, repos, integrations) deliberately does NOT equal the
// column set - it includes non-columns (courseCode, term, notes, topics) and
// omits real columns (description, roster, dayTime). Do not "tidy" it into a
// union of cellTextValue over every column: that changes which courses match.
//
// Import direction: this leaf imports cell-copy and courses-table-helpers; they
// must never import it back (a cycle would silently yield undefined).
import type { Course } from "./supabase/courses";
import { cellTextValue, type CellColumnId } from "./cell-copy";
import { ALL_COLUMN_IDS, type ColumnId, type SortContext } from "./courses-table-helpers";

export type SearchColumn = "all" | CellColumnId;

export function filterCoursesBySearch(
  courses: Course[],
  search: string,
  searchColumn: SearchColumn,
  ctx?: SortContext
): Course[] {
  const query = search.trim().toLowerCase();
  if (!query) return courses;
  if (searchColumn === "all") {
    return courses.filter((c) => {
      const hay = [
        c.name,
        c.courseCode,
        c.term,
        c.institution,
        c.textbook,
        c.notes,
        c.topics,
        c.csvName,
        c.githubOrg,
        ...c.repos.map((r) => r.repo),
        ...c.integrations.map((i) => i.name),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });
  }
  return courses.filter((c) => cellTextValue(c, searchColumn, ctx).toLowerCase().includes(query));
}

/**
 * Validates a persisted search-column value. Anything that is not "all", the
 * always-visible "name" column, or a currently visible column falls back to
 * "all" - a hidden column must not leave the search silently scoped to it.
 */
export function parseSearchColumn(raw: string | null | undefined, visibleColumns: readonly ColumnId[]): SearchColumn {
  if (!raw) return "all";
  if (raw === "name") return "name";
  const known = (ALL_COLUMN_IDS as readonly string[]).includes(raw);
  if (known && (visibleColumns as readonly string[]).includes(raw)) return raw as ColumnId;
  return "all";
}
