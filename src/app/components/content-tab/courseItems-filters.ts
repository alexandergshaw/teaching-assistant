// Pure facet-filtering logic for CourseItemsView (Assignments/Quizzes tabs).
// Extracted into its own leaf for the same reason courseItems-routing.ts and
// courseItems-modules.ts were: this repo's vitest is node-env and never
// renders a component (AGENTS.md's ac-sonnet-opus-loop memory), so any of
// this logic left inside CourseItemsView.tsx could only be regex-matched as
// source text, never actually exercised by calling it.
//
// THE FACETS - each independently confirmed against the data the row
// actually carries, not invented:
//   - Published: BulkItem.published is a plain boolean every row already has.
//   - Module: courseItems-modules.ts's ItemModuleInfo is a THREE-state fact
//     (in a module / not in any module / unknown - see the F2 note on
//     matchesCourseItemFilters below), not the two-state boolean the other
//     facets are.
//   - Due date: BulkItem.dueAt (ISO string or null).
//   - Points: BulkItem.pointsPossible (number or null).
//   - Quiz kind: BulkItem.isNewQuiz (present only on New Quiz rows, absent
//     for every Classic Quiz and every ordinary Assignment row) - the control
//     itself is Quizzes tab only. NOT because the Assignments tab is free of
//     New Quiz rows (it is not, since the live-report bug fix documented in
//     bulk.ts's own header: a New Quiz row now legitimately appears in EITHER
//     tab), but because this facet is worded around "classic vs new", a
//     distinction the Assignments tab has no reason to let a user filter by -
//     see CourseItemsView.tsx's own filter-bar comment.
//
// "filtered vs not" from the original request read as a slip for PUBLISHED
// vs not - the one boolean every row already displays as PUBLISHED/
// UNPUBLISHED in the row render - not a literal "already filtered" state,
// which the data has no way to answer. See CourseItemsView.tsx's own
// filter-bar comment for the fuller reasoning.

import type { BulkItem } from "@/lib/canvas-modules";
import type { ItemModuleInfo } from "./courseItems-modules";

export type PublishedFilter = "all" | "published" | "unpublished";
export type ModuleFilter = "all" | "in-module" | "no-module";
export type DueDateFilter = "all" | "has-due" | "no-due";
export type PointsFilter = "all" | "has-points" | "no-points";
/** Quizzes tab only - always "all" on the Assignments tab, which never
 *  renders the control that changes it (see CourseItemsView.tsx). */
export type QuizKindFilter = "all" | "classic" | "new-quiz";

export const PUBLISHED_FILTER_VALUES: readonly PublishedFilter[] = ["all", "published", "unpublished"];
export const MODULE_FILTER_VALUES: readonly ModuleFilter[] = ["all", "in-module", "no-module"];
export const DUE_DATE_FILTER_VALUES: readonly DueDateFilter[] = ["all", "has-due", "no-due"];
export const POINTS_FILTER_VALUES: readonly PointsFilter[] = ["all", "has-points", "no-points"];
export const QUIZ_KIND_FILTER_VALUES: readonly QuizKindFilter[] = ["all", "classic", "new-quiz"];

export interface CourseItemFilters {
  published: PublishedFilter;
  module: ModuleFilter;
  dueDate: DueDateFilter;
  points: PointsFilter;
  quizKind: QuizKindFilter;
}

export const DEFAULT_COURSE_ITEM_FILTERS: CourseItemFilters = {
  published: "all",
  module: "all",
  dueDate: "all",
  points: "all",
  quizKind: "all",
};

/** True when at least one facet has been narrowed away from "all" - drives
 *  the "Clear filters" affordance (F4) and the row-count wording. */
export function isFiltersActive(filters: CourseItemFilters): boolean {
  return (Object.keys(DEFAULT_COURSE_ITEM_FILTERS) as Array<keyof CourseItemFilters>).some(
    (key) => filters[key] !== DEFAULT_COURSE_ITEM_FILTERS[key]
  );
}

/** One row's inputs to filtering: the item itself plus its already-looked-up
 *  module association (computed once via buildModuleIndex/modulesForItem in
 *  courseItems-modules.ts - never recomputed here). */
export interface CourseItemFilterRow {
  item: BulkItem;
  moduleInfo: ItemModuleInfo;
}

/** The pre-existing title-only search (NIT13's own decision, unchanged): a
 *  plain case-insensitive substring match against the title, never the
 *  module name(s) - see courseItems-modules.ts's neighboring precedent for
 *  why widening this to module names was rejected. */
export function matchesTitleSearch(item: BulkItem, query: string): boolean {
  return item.title.toLowerCase().includes(query.trim().toLowerCase());
}

/**
 * One row's match against every facet (F1: facets combine with each other
 * AND with the title search - this function only ever narrows, an "all"
 * value on every facet is a no-op that admits every row).
 *
 * F2 DECISION: `moduleInfo.known === false` means the module tree failed to
 * load, or has not finished loading yet (courseItems-modules.ts's own
 * ItemModuleInfo doc comment) - the app genuinely does not know whether this
 * item is in a module. Such a row matches NEITHER "in-module" NOR
 * "no-module": counting it as "not in a module" would silently assert a fact
 * nobody observed (the exact lie F2 forbids), and counting it as "in a
 * module" would be an equally fabricated guess in the other direction.
 * Excluding it from both is the only answer that never states something the
 * app cannot back up. `hiddenUnknownModuleCount` below exists so the view
 * can tell the user how many rows this cost them instead of letting them
 * vanish unexplained (F4).
 */
export function matchesCourseItemFilters(
  item: BulkItem,
  moduleInfo: ItemModuleInfo,
  filters: CourseItemFilters
): boolean {
  if (filters.published === "published" && !item.published) return false;
  if (filters.published === "unpublished" && item.published) return false;

  if (filters.module === "in-module" && !(moduleInfo.known && moduleInfo.names.length > 0)) return false;
  if (filters.module === "no-module" && !(moduleInfo.known && moduleInfo.names.length === 0)) return false;

  if (filters.dueDate === "has-due" && !item.dueAt) return false;
  if (filters.dueDate === "no-due" && item.dueAt) return false;

  if (filters.points === "has-points" && item.pointsPossible == null) return false;
  if (filters.points === "no-points" && item.pointsPossible != null) return false;

  if (filters.quizKind === "classic" && item.isNewQuiz) return false;
  if (filters.quizKind === "new-quiz" && !item.isNewQuiz) return false;

  return true;
}

/**
 * The view's whole `shown` list (F1): title search AND every facet, applied
 * together over the same row set - never a fallback/replacement for the
 * pre-existing search box, and never a separate pass that could disagree
 * with `hiddenUnknownModuleCount`'s own idea of which rows are unknown.
 */
export function filterCourseItems(
  rows: readonly CourseItemFilterRow[],
  filters: CourseItemFilters,
  searchQuery: string
): BulkItem[] {
  return rows
    .filter((row) => matchesTitleSearch(row.item, searchQuery))
    .filter((row) => matchesCourseItemFilters(row.item, row.moduleInfo, filters))
    .map((row) => row.item);
}

/**
 * How many rows the Module facet is hiding for the F2 reason (unknown status),
 * as opposed to hiding because they genuinely don't match - so the view can
 * surface an honest "N item(s) with unknown module status excluded" hint
 * rather than a silent gap between the search count and the facet count.
 * Deliberately ignores the OTHER facets/search (it answers "how many rows
 * does the module facet alone put in limbo", not "how many rows are hidden
 * overall") - always 0 while the module facet is "all", since nothing is
 * excluded by it in that state.
 */
export function hiddenUnknownModuleCount(rows: readonly CourseItemFilterRow[], filters: CourseItemFilters): number {
  if (filters.module === "all") return 0;
  return rows.filter((row) => !row.moduleInfo.known).length;
}

// ── Persistence (F5) ────────────────────────────────────────────────────────
//
// All five facets persist together under ONE ta- key per kind, rather than
// five parallel keys - the same grouping TasksTab.tsx already uses for its
// own `ta-tasks-${view}-columns` key (one JSON/serialized blob for a
// cohesive set of related settings, not independently-drifting keys for
// what the user experiences as a single "filter bar" preference). Every
// facet is validated independently against its own allowed-value list on
// read, so a corrupt value, a stale key from a future/older shape, or a
// partially-written blob degrades ONE field at a time to "all" - never the
// whole object collapsing to defaults, and never a thrown exception.
//
// None of the five are excluded from persistence: unlike the bulk-operation
// fields (bulkDue, bulkPoints, etc. in CourseItemsView.tsx, deliberately NOT
// persisted because they are one-shot values for whatever is CURRENTLY
// selected), every facet here is a standing VIEWING preference exactly like
// the pre-existing title search this file's search key already persists -
// there is no "selection" a stale filter value could silently mis-target.

export function courseItemFiltersStorageKey(kindLower: string): string {
  return `ta-course-items-filters-${kindLower}`;
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

export function serializeCourseItemFilters(filters: CourseItemFilters): string {
  return JSON.stringify(filters);
}

/** Parses a stored filters blob, falling back field-by-field to "all" for
 *  anything missing, malformed, or carrying a value outside that field's own
 *  allowed set. `raw === null` (nothing stored yet) returns the plain
 *  defaults with no parsing attempted at all. */
export function parseCourseItemFilters(raw: string | null): CourseItemFilters {
  if (raw === null) return DEFAULT_COURSE_ITEM_FILTERS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_COURSE_ITEM_FILTERS;
  }
  if (typeof parsed !== "object" || parsed === null) return DEFAULT_COURSE_ITEM_FILTERS;
  const p = parsed as Record<string, unknown>;
  return {
    published: isOneOf(p.published, PUBLISHED_FILTER_VALUES) ? p.published : "all",
    module: isOneOf(p.module, MODULE_FILTER_VALUES) ? p.module : "all",
    dueDate: isOneOf(p.dueDate, DUE_DATE_FILTER_VALUES) ? p.dueDate : "all",
    points: isOneOf(p.points, POINTS_FILTER_VALUES) ? p.points : "all",
    quizKind: isOneOf(p.quizKind, QUIZ_KIND_FILTER_VALUES) ? p.quizKind : "all",
  };
}
