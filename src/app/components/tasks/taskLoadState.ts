// Pure empty-vs-failed decisions for the Tasks tab's load state (BLOCKER 3
// from the Tasks-tab UX audit). Before this fix, TasksTab.tsx rendered "No
// courses yet. Add one on the Courses tab." whenever `courses.length === 0`
// - including while `state === "error"`, so a network failure and a
// genuinely empty account were told apart only by whichever OTHER banner
// happened to also be on screen, and the "no courses" sentence pointed the
// instructor at the wrong tab. Both decisions live here, pure, so the
// distinction is provable from frozen literals - vitest is node-env and
// renders no component (this repo's own AGENTS.md-linked notes), so nothing
// left inline in TasksTab.tsx's JSX conditions could be tested directly.
export type TaskLoadState = "loading" | "idle" | "error";

/** The "No courses yet..." empty state is correct ONLY once loading has
 * actually finished successfully (`state === "idle"`) and there is truly
 * nothing to show. `state === "error"` - even with zero cached courses - now
 * renders NEITHER this nor the main content; the error banner alone
 * (errorBannerText below) is the only thing on screen, so the instructor is
 * never told "you have no courses" when the real story is "the load
 * failed". */
export function shouldShowEmptyState(state: TaskLoadState, courseCount: number): boolean {
  return state === "idle" && courseCount === 0;
}

/** The toolbar + grid render whenever there is data to show, regardless of
 * whether the CURRENT load succeeded - a hard failure never clears
 * previously-loaded courses (useCourseTasksData.ts's reload returns before
 * touching `courses` on a failure), so stale-but-real data stays visible
 * underneath the error banner rather than being replaced by either the
 * empty state or a blank page. */
export function shouldShowMainContent(state: TaskLoadState, courseCount: number): boolean {
  return state !== "loading" && courseCount > 0;
}

/** BLOCKER 3 + SHOULD 8: one error banner covers both a hard failure (no
 * usable data at all, `state === "error"`) and a SILENT background refresh
 * that failed while stale data stays on screen (`state` stays "idle",
 * useCourseTasksData.ts still records `error`) - the two need different
 * wording, since the silent case must not read like the whole tab is down.
 * Returns null when there is nothing to report, so the caller's JSX can gate
 * on a single value instead of re-deriving the "is there an error" check a
 * second time. */
export function errorBannerText(state: TaskLoadState, error: string | null): string | null {
  if (!error) return null;
  if (state === "error") return error;
  return `Could not refresh - showing the last loaded data. ${error}`;
}
