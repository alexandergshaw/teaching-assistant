import type { GradingDraft } from "./grading-drafts";
import type { GradingRunEntry, GradeResult } from "./grade";

// Pure view-model helpers behind the drafted grades tab's list: grouping each
// draft's runs/results into renderable sections, filtering by search/course,
// sorting drafts, summarizing counts, and safely reading the tab's persisted
// UI state. Kept plain (no React, no DOM) so the density overhaul - fitting
// more drafts on screen without losing any student's grade - is unit-
// testable without a component-rendering harness; see
// grading-draft-checklist.ts and grading-draft-edit.ts for the same pattern
// applied to other drafted-grades page behavior.

export type DraftSortOrder = "newest" | "oldest";

export interface DraftSectionGroup {
  entry: GradingRunEntry;
  runIdx: number;
  results: Array<{ result: GradeResult; resultIdx: number }>;
}

export interface DraftSection {
  draft: GradingDraft;
  /** Count of results that survived filtering, across every group - equal to
   * the sum of each group's results.length. Precomputed here so the summary
   * line and the section header don't need to re-walk `groups`. */
  passingGrades: number;
  groups: DraftSectionGroup[];
}

/**
 * True when a single grade result matches the free-text search and course
 * filter. Matching is case-insensitive against student, assignment, and
 * course name. An all-whitespace search is treated as no search at all.
 */
export function gradeMatchesFilters(
  entry: GradingRunEntry,
  result: GradeResult,
  filters: { search: string; courseFilter: string }
): boolean {
  const searchLower = filters.search.trim().toLowerCase();
  if (searchLower) {
    const matches =
      result.student.toLowerCase().includes(searchLower) ||
      entry.assignmentName.toLowerCase().includes(searchLower) ||
      entry.courseName.toLowerCase().includes(searchLower);
    if (!matches) return false;
  }
  if (filters.courseFilter !== "all" && entry.courseName !== filters.courseFilter) return false;
  return true;
}

/** Every distinct course name referenced across a set of drafts, sorted. */
export function collectCourseNames(drafts: GradingDraft[]): string[] {
  const names = new Set<string>();
  for (const draft of drafts) {
    for (const entry of draft.payload.runs) {
      names.add(entry.courseName);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/** Distinct course names referenced by a single draft, sorted - used for the
 * course chips in that draft's section header. */
export function draftCourseNames(draft: GradingDraft): string[] {
  return Array.from(new Set(draft.payload.runs.map((entry) => entry.courseName))).sort((a, b) =>
    a.localeCompare(b)
  );
}

/**
 * Falls back to "all" when the persisted course filter no longer matches any
 * loaded draft (e.g. that draft was reviewed and left the pending list), so
 * the tab never silently hides everything. This is purely a display
 * decision - the raw persisted value is left untouched, so the filter
 * re-activates if that course reappears.
 */
export function resolveEffectiveCourseFilter(courseFilter: string, courseNames: string[]): string {
  if (courseFilter === "all") return "all";
  return courseNames.includes(courseFilter) ? courseFilter : "all";
}

/**
 * Groups each draft's runs/results by assignment, applying the search/course
 * filters, and drops any assignment group - or whole draft - left with zero
 * matching results. Drafts are ordered by createdAt per `sort`. Never
 * mutates the input drafts array.
 */
export function buildDraftSections(
  drafts: GradingDraft[],
  filters: { search: string; courseFilter: string; sort: DraftSortOrder }
): DraftSection[] {
  const ordered = [...drafts].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return filters.sort === "newest" ? bTime - aTime : aTime - bTime;
  });

  const sections: DraftSection[] = [];

  for (const draft of ordered) {
    const groups: DraftSectionGroup[] = [];
    let passingGradesTotal = 0;

    draft.payload.runs.forEach((entry, runIdx) => {
      const results: Array<{ result: GradeResult; resultIdx: number }> = [];
      entry.run.results.forEach((result, resultIdx) => {
        if (gradeMatchesFilters(entry, result, filters)) {
          results.push({ result, resultIdx });
          passingGradesTotal += 1;
        }
      });
      if (results.length > 0) {
        groups.push({ entry, runIdx, results });
      }
    });

    if (passingGradesTotal > 0) {
      sections.push({ draft, passingGrades: passingGradesTotal, groups });
    }
  }

  return sections;
}

/** Total grades and drafts represented across a set of sections, for the
 * "N drafted grades across M drafts" summary line. */
export function summarizeSections(sections: DraftSection[]): { totalGrades: number; totalDrafts: number } {
  return {
    totalGrades: sections.reduce((total, s) => total + s.passingGrades, 0),
    totalDrafts: sections.length,
  };
}

/** True when the user has narrowed the list via search or a course filter -
 * used to pick between a "no drafts yet" and a "nothing matches" empty
 * state. */
export function hasActiveFilter(search: string, effectiveCourseFilter: string): boolean {
  return search.trim() !== "" || effectiveCourseFilter !== "all";
}

/** Human-readable local date + time for a draft's createdAt timestamp. */
export function formatDraftTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Parses the persisted set of collapsed draft-section ids from localStorage.
 * Defaults to an empty list (nothing collapsed) for a missing key, invalid
 * JSON, a non-array value, or an array containing non-string entries, so a
 * corrupt or hand-edited stored value can never hide every draft behind a
 * collapsed section on load.
 */
export function parseCollapsedDraftIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

/**
 * Normalizes a persisted sort-order value, defaulting to "newest" for a
 * missing key or any value other than the literal "oldest" - so a corrupt or
 * unknown stored value degrades to the default order instead of silently
 * sorting backwards.
 */
export function parseStoredSortOrder(raw: string | null): DraftSortOrder {
  return raw === "oldest" ? "oldest" : "newest";
}
