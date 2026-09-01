// Pure helper for the pre-run scope badge (WorkflowPanel.tsx) - B3(c) of the
// workflows/lecture UX audit.
//
// describeWorkflowScope (src/lib/workflows/types.ts) already turns a "*"
// scope into "all Canvas courses" / "all course tiles" / "all institutions",
// but names no COUNT - an instructor reading the badge before clicking Run
// cannot tell whether "*" means 2 courses or 200. WorkflowPanel already has
// the matched option lists in scope where the badge renders
// (optionsForFields.lmsCourseOptions/hubCourses/institutions), so this
// appends the resolved count onto exactly those three phrases, without
// re-deriving describeWorkflowScope's own text - a future wording change
// there needs no matching change here.
//
// Kept a thin post-processing pass (not a reimplementation of
// describeWorkflowScope) deliberately: this module intentionally has no
// import of WorkflowScope's structure beyond the three "*" checks it needs,
// so it stays a leaf, unit-testable with frozen literal counts.
import { describeWorkflowScope } from "@/lib/workflows/types";
import type { WorkflowScope } from "@/lib/workflows/types";

export interface ScopeResolutionCounts {
  /** Matched institution count, or null/undefined when not yet loaded. */
  institutionCount?: number | null;
  /** Matched course-tile count, or null/undefined when not yet loaded. */
  hubCourseCount?: number | null;
  /** Matched Canvas-course count, or null/undefined when not yet loaded. */
  lmsCourseCount?: number | null;
}

/** describeWorkflowScope's text, with "(N)" appended to any "all ..." phrase
 * whose matching count is known. A count that is null/undefined (still
 * loading, or failed to load) leaves that phrase exactly as
 * describeWorkflowScope produced it - this never invents a number. */
export function describeWorkflowScopeWithCounts(
  scope: WorkflowScope | undefined,
  counts: ScopeResolutionCounts
): string {
  let text = describeWorkflowScope(scope);
  if (!text) return text;

  if (scope?.institution?.trim() === "*" && typeof counts.institutionCount === "number") {
    text = text.replace("all institutions", `all institutions (${counts.institutionCount})`);
  }
  if (scope?.hubCourse?.trim() === "*" && typeof counts.hubCourseCount === "number") {
    text = text.replace("all course tiles", `all course tiles (${counts.hubCourseCount})`);
  }
  if (scope?.lmsCourse?.trim() === "*" && typeof counts.lmsCourseCount === "number") {
    text = text.replace("all Canvas courses", `all Canvas courses (${counts.lmsCourseCount})`);
  }
  return text;
}
