// Pure gap-detection / report / dispatch-prep helpers for the Course Build
// "audit-visualizer-coverage" workflow step (registry/steps.visualizer.ts).
//
// Kept as its own pure module - no "use server", no network, no LLM call -
// so the actual DECISION logic (which concept counts as a gap, how gaps get
// deduped/capped/reported, what a batched Copilot task looks like, and how an
// already-open task is recognized for idempotence) is directly unit-testable.
// vitest here runs environment:"node" over src/**/*.test.ts only, and the
// orchestration action (src/app/actions/visualizer-coverage.ts) that calls an
// LLM (planWeekConcepts) and GitHub is "use server" and hard to exercise
// cheaply - this module is where the actual behavior this feature is judged
// on lives and gets covered.
//
// REUSE, NOT REBUILD: concept-to-page matching is resolveVisualizerLinks
// (src/lib/live-class/links.ts) - the SAME code answerLiveQuestionAction uses
// to resolve a visualizer link live, in front of a class. A concept that
// resolves to nothing there IS the gap this module reports; this file never
// re-implements or second-guesses that match, and never writes a second
// index parser (loadVisualizerIndexAction/parseNavItems stay the only one).

import { resolveVisualizerLinks, type VisualizerIndexEntry } from "@/lib/live-class/links";
import { normalizeConceptKey } from "@/lib/visualizer";

/** A GitHub issue's OPEN/CLOSED state, as GraphQL's IssueState enum returns
 * it (see src/lib/github.copilot.ts's listCopilotTasks). Duplicated as a
 * narrow local type (rather than importing CopilotTask from "@/lib/github")
 * so this module keeps its "no network module in the import graph" property
 * even transitively - findExistingGapTask only ever needs these two fields. */
export interface GapTaskCandidate {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
}

/** One week's CONCEPT PLAN (planWeekConcepts, src/lib/lecture-concepts.ts),
 * already computed by the caller - this module never calls an LLM itself. */
export interface WeekConceptInput {
  week: number;
  topic: string;
  concepts: string[];
}

/** One (week, concept) pair's outcome against the visualizer index - `url`
 * is null exactly when the concept is a gap. */
export interface ConceptCheckResult {
  week: number;
  topic: string;
  concept: string;
  url: string | null;
}

/** One deduped gap, keeping the first week/topic it was seen in for report
 * and Copilot-task context. */
export interface GapEntry {
  concept: string;
  week: number;
  topic: string;
}

/**
 * Check every week's planned concepts against the visualizer's already-
 * parsed nav index. Returns one result per (week, concept) pair, in input
 * order, plus the deduped gap list. Dedup key is normalizeConceptKey (the
 * SAME normalization resolveVisualizerLinks/matchConcept use internally), so
 * "For Loops" in week 2 and "for loops" in week 5 collapse to one gap - the
 * first week/topic it was seen in is kept, later repeats are silently folded
 * in rather than reported as a second, redundant gap.
 */
export function checkConceptsAgainstIndex(
  weeks: WeekConceptInput[],
  index: VisualizerIndexEntry[]
): { results: ConceptCheckResult[]; gaps: GapEntry[] } {
  const results: ConceptCheckResult[] = [];
  const gapsByKey = new Map<string, GapEntry>();

  for (const week of Array.isArray(weeks) ? weeks : []) {
    for (const rawConcept of Array.isArray(week.concepts) ? week.concepts : []) {
      const concept = (rawConcept ?? "").trim();
      if (!concept) continue;

      const resolved = resolveVisualizerLinks([concept], index);
      const url = resolved.length > 0 ? resolved[0].url : null;
      results.push({ week: week.week, topic: week.topic, concept, url });

      if (!url) {
        const key = normalizeConceptKey(concept);
        if (key && !gapsByKey.has(key)) {
          gapsByKey.set(key, { concept, week: week.week, topic: week.topic });
        }
      }
    }
  }

  return { results, gaps: [...gapsByKey.values()] };
}

/**
 * Cap the gap list at `cap` (order-preserving - the first `cap` gaps in
 * sweep order are kept), reporting exactly how many were dropped. A
 * truncated list that just stops silently reads as "covered everything" when
 * it did not - `droppedCount` exists so the step's own report/summary can say
 * so instead of staying quiet about it.
 */
export function capGaps(gaps: GapEntry[], cap: number): { included: GapEntry[]; droppedCount: number } {
  const list = Array.isArray(gaps) ? gaps : [];
  const safeCap = Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : list.length;
  if (list.length <= safeCap) return { included: list, droppedCount: 0 };
  return { included: list.slice(0, safeCap), droppedCount: list.length - safeCap };
}

/** Render the full per-week, per-concept coverage report - one line per
 * concept checked, found or gap. */
export function buildCoverageReport(results: ConceptCheckResult[]): string {
  if (!Array.isArray(results) || results.length === 0) {
    return "No concepts were planned for any week.";
  }
  return results
    .map(
      (r) =>
        `Week ${r.week} (${r.topic || "untitled"}) - ${r.concept}: ${
          r.url ? `found at ${r.url}` : "GAP - no visualizer page"
        }`
    )
    .join("\n");
}

const GAP_TASK_TITLE_PREFIX = "Visualizer concept gaps";

/**
 * The batched Copilot task's title - stable and deterministic (no date, no
 * random suffix) so findExistingGapTask below can recognize a task this same
 * course already opened. This is the idempotence check: the same
 * "check-before-creating" shape ensureCourseProject uses via hasProject()
 * (steps.course-project.ts) - look for the thing first, only create when it
 * is genuinely missing.
 */
export function buildGapTaskTitle(courseName: string): string {
  const name = (courseName ?? "").trim();
  return name ? `${GAP_TASK_TITLE_PREFIX}: ${name}` : GAP_TASK_TITLE_PREFIX;
}

/**
 * The batched Copilot task's body: every INCLUDED gap with its week/topic
 * context, plus an explicit, non-silent note of how many more were found but
 * left out when the list was capped - see capGaps' own doc comment for why
 * that note is not optional.
 */
export function buildGapTaskBody(courseName: string, included: GapEntry[], droppedCount: number): string {
  const list = Array.isArray(included) ? included : [];
  const name = (courseName ?? "").trim();
  const lines: string[] = [];

  lines.push(
    `The following concept${list.length === 1 ? "" : "s"}${name ? ` from "${name}"` : ""} ${
      list.length === 1 ? "has" : "have"
    } no page on the programming concept visualizer (https://programming-concept-visualizer.vercel.app/):`
  );
  lines.push("");
  for (const gap of list) {
    lines.push(`- ${gap.concept} (Week ${gap.week}${gap.topic ? `: ${gap.topic}` : ""})`);
  }

  if (droppedCount > 0) {
    lines.push("");
    lines.push(
      `NOTE: ${droppedCount} additional gap concept${
        droppedCount === 1 ? " was" : "s were"
      } found but is not listed above - this task is capped at ${list.length} concept${
        list.length === 1 ? "" : "s"
      } per run. Re-run the sweep after these are added to pick up the rest.`
    );
  }

  lines.push("");
  lines.push(
    "For each concept above, add a new concept page following the existing pattern for its topic area (see components/pageComponents/ and navItems.ts)."
  );

  return lines.join("\n");
}

/**
 * Find an already-OPEN Copilot task with this exact batched-gap title - the
 * idempotence check a re-run uses to avoid opening a duplicate issue (mirrors
 * ensureCourseProject's hasProject() early-return: check first, only create
 * when genuinely missing). A CLOSED/MERGED prior task does not count: that
 * batch was already handled, so a fresh sweep is free to open a new one.
 */
export function findExistingGapTask<T extends GapTaskCandidate>(tasks: T[], title: string): T | undefined {
  return (Array.isArray(tasks) ? tasks : []).find((t) => t.state === "OPEN" && t.title === title);
}

/**
 * The four states a coverage sweep's dispatch outcome can land in - the
 * step's own summary and the persisted run-report section built from it
 * (buildRunReportMarkdown, server-runner.ts) must read differently for each
 * one, so a silent no-action run (dispatch off, or Copilot unavailable) is
 * never mistaken for full coverage, and a genuine zero-gap sweep is never
 * mistaken for a skipped step:
 *  - "no-gaps": every planned concept resolved to a visualizer page.
 *  - "dispatch-off": gaps exist, but the caller left "Dispatch Copilot task
 *    for gaps" off, so nothing was opened.
 *  - "task-open": gaps exist, dispatch was on, and a Copilot task is open -
 *    either just created this run, or already open from an earlier run
 *    (idempotent reuse) - both count as "a task IS open" for reporting
 *    purposes.
 *  - "copilot-unavailable": gaps exist, dispatch was on, but opening/finding
 *    the Copilot task itself failed (see auditVisualizerCoverageAction's own
 *    degradation posture) - no task exists as a result.
 */
export type CoverageOutcome = "no-gaps" | "dispatch-off" | "task-open" | "copilot-unavailable";

/**
 * Classify a coverage sweep's dispatch outcome purely from the three facts
 * auditVisualizerCoverageAction (src/app/actions/visualizer-coverage.ts)
 * already has in hand once it has computed its own gap count, read the
 * caller's dispatch choice, and attempted a dispatch (or not) - no new state
 * is threaded through the result type just to support this classification.
 */
export function classifyCoverageOutcome(gapCount: number, dispatch: boolean, taskUrl: string): CoverageOutcome {
  if (gapCount <= 0) return "no-gaps";
  if (!dispatch) return "dispatch-off";
  return taskUrl ? "task-open" : "copilot-unavailable";
}

/**
 * A short, state-distinguishing label for the coverage step's own summary
 * heading (and, via buildRunReportMarkdown, the persisted run report's
 * section for this step) - see CoverageOutcome's own doc comment for the
 * four states this names explicitly rather than leaving to be inferred from
 * a bare gap count or a bare link.
 */
export function coverageSummaryLabel(gapCount: number, outcome: CoverageOutcome): string {
  const gapsWord = `${gapCount} gap${gapCount === 1 ? "" : "s"}`;
  switch (outcome) {
    case "no-gaps":
      return "Visualizer coverage: 0 gaps - full coverage";
    case "dispatch-off":
      return `Visualizer coverage: ${gapsWord} found - dispatch off, no Copilot task opened`;
    case "task-open":
      return `Visualizer coverage: ${gapsWord} - Copilot task open`;
    case "copilot-unavailable":
      return `Visualizer coverage: ${gapsWord} found - Copilot unavailable, no task opened`;
  }
}
