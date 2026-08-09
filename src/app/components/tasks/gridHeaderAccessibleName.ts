// Pure accessible-name builders for the Tasks grid's two frozen headers
// (Course, Progress) - AC-D item 223: with visible text content already
// present, `title` is at most a description, never the accessible name, so
// an `aria-label` has to state the active constraint in words the same way
// the per-task headers already do. Pulled out of TasksGrid.tsx (which sits
// at a 1000-line hard cap) so that file has real headroom rather than a
// squeeze, the same reason useColumnDrag.ts (useColumnDrag.ts:3-11) and
// gridFocus.ts were split out before it. Like gridNavigation.ts (and
// gridFocus.ts, gridFocus.ts:1-9), this is PURE string logic - no DOM, no
// React - so it belongs in a plain `.ts` module a real vitest test can
// exercise; see gridHeaderAccessibleName.test.ts.
import { appendSentence, terminated, type TaskSortDirection } from "@/lib/course-tasks-view";

function sortedSuffix(direction: TaskSortDirection): string {
  return `Sorted ${direction === "asc" ? "ascending" : "descending"}`;
}

/** B3 (item 223): built from the SAME institution/term state the corner
 * header menu and the toolbar's own selects share (item 220), so it can
 * never read differently from what those controls show. `isSorted` is
 * whether the Course header currently carries aria-sort (it speaks for
 * name/institution/term - see COURSE_SORT_FIELDS in TasksGrid.tsx). */
export function courseHeaderAccessibleName(
  institution: string,
  term: string,
  allFilterValue: string,
  isSorted: boolean,
  sortDirection: TaskSortDirection
): string {
  let name = "Course";
  const constraints: string[] = [];
  if (institution !== allFilterValue) constraints.push(`Institution: ${institution}`);
  if (term !== allFilterValue) constraints.push(`Term: ${term}`);
  if (constraints.length > 0) name = terminated(`${name}, filtered to ${constraints.join(", ")}`);
  if (isSorted) name = appendSentence(name, sortedSuffix(sortDirection));
  return name;
}

/** B3 (item 223): built from the SAME `effectiveOutstandingOnly` state the
 * corner header menu and the toolbar's own checkbox share (item 220). */
export function progressHeaderAccessibleName(
  outstandingOnly: boolean,
  isSorted: boolean,
  sortDirection: TaskSortDirection
): string {
  let name = "Progress";
  if (outstandingOnly) name = terminated(`${name}, filtered to rows with outstanding work`);
  if (isSorted) name = appendSentence(name, sortedSuffix(sortDirection));
  return name;
}
