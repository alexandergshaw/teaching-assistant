// docs/rubric-bulk-action-acceptance-criteria.md, chunk H, agent 2B's slice
// (AC4/AC5): "Generate & associate rubric" - the pure summarisation core
// extracted out of useBulkItemActions.ts (which was at 999 of this repo's
// 1000-line ceiling) so it is directly testable without a React render, per
// this repo's own "vitest is node-env... no component is ever rendered"
// constraint (see useCarryModulePattern.test.ts's own header for the
// identical reasoning). useBulkItemActions.ts's `bulkGenerateAndAssociateRubric`
// (the button's real onClick handler - see that file for the reachability
// chain from BulkItemsSection.tsx's control down to the Canvas write) is the
// only caller and stays there unmoved, since it is stateful (useState/async),
// not pure.
//
// AC4 IS THE PART MOST LIKELY TO BE GOT WRONG, AND THE BAD PRECEDENT SITS
// RIGHT NEXT TO THIS CODE (in useBulkItemActions.ts): `bulkRubric` (the
// shipped "Associate" button) silently drops every non-Assignment / no-
// contentId item from its own `.filter(...)` and carries no New Quiz guard
// at all. That is pre-existing, explicitly NOT inherited here per the
// chunk's own brief, and NOT fixed here either (out of scope) -
// `summarizeRubricGenerateOutcomes` below does not reuse `bulkRubric`'s
// filtering and must not be made to resemble it later without re-reading
// this comment.
import type { OrphanRubric, RubricTargetOutcome } from "@/app/actions/rubric-bulk";

/**
 * The generation source text (AC's own risk 2: an assignment DESCRIPTION,
 * not a title, is what `generateRubric` needs to produce a meaningful spec).
 * Pure and exported so the fallback-vs-join behaviour is directly testable
 * without a Canvas call. `parts` is every eligible-looking assignment's
 * "title\ndescription" text, already fetched by the caller - this function
 * only decides how to join them (or what to say when there is nothing to
 * join), never fetches anything itself.
 */
export function buildRubricGenerationInstructions(parts: string[]): string {
  const nonEmpty = parts.map((p) => p.trim()).filter((p) => p !== "");
  if (nonEmpty.length === 0) {
    return "Generate a general-purpose grading rubric suitable for the selected assignment(s).";
  }
  return nonEmpty.join("\n\n");
}

/**
 * AC4's three outcomes, counted distinctly - "already has a rubric" is never
 * folded into "cannot ever have one", and every ineligibility reason
 * (unsupported kind/type, missing content id, New Quiz) gets its own bucket
 * rather than one catch-all "skipped" count, so the instructor-facing note
 * (`describeRubricGenerateNote` below) can name them separately.
 */
export interface BulkRubricGenerateReport {
  /** Set only when the whole action call itself failed ({error} from the
   *  server boundary) - distinct from a generation failure below, since this
   *  means requireOwner()/the network call itself never got a chance to
   *  attempt generation at all. */
  actionError?: string;
  /** Set only when phase 1 (the LLM call) failed or produced an unparseable
   *  rubric - no Canvas write of any kind was attempted, and every item's
   *  eligibility is therefore unknown, not "ineligible". */
  generationFailedReason?: string;
  updated: number;
  alreadyHasRubric: number;
  ineligibleKind: number;
  ineligibleNewQuiz: number;
  ineligibleNoContentId: number;
  failed: number;
  orphans: OrphanRubric[];
}

export const EMPTY_REPORT_BASE: Omit<BulkRubricGenerateReport, "actionError" | "generationFailedReason"> = {
  updated: 0,
  alreadyHasRubric: 0,
  ineligibleKind: 0,
  ineligibleNewQuiz: 0,
  ineligibleNoContentId: 0,
  failed: 0,
  orphans: [],
};

/**
 * Pure summarizer over the server action's real outcome shapes
 * (`RubricTargetOutcome`/`OrphanRubric`, imported from the sibling action
 * file rather than re-declared here, per this repo's own "fixtures must
 * match the emitted shape" lesson). This is the ONE function that decides
 * whether AC4's three outcomes stay distinct - a bug here (e.g. merging
 * "already-has-rubric" into the same bucket as "ineligible-kind") silently
 * degrades the instructor-facing report without touching the server action
 * at all, so it is tested directly and sabotage-checked.
 */
export function summarizeRubricGenerateOutcomes(
  outcomes: RubricTargetOutcome[],
  orphans: OrphanRubric[]
): BulkRubricGenerateReport {
  const report = { ...EMPTY_REPORT_BASE, orphans };
  for (const outcome of outcomes) {
    if (outcome.status === "updated") {
      report.updated += 1;
    } else if (outcome.status === "failed") {
      report.failed += 1;
    } else if (outcome.reason === "already-has-rubric") {
      report.alreadyHasRubric += 1;
    } else if (outcome.reason === "new-quiz") {
      report.ineligibleNewQuiz += 1;
    } else if (outcome.reason === "no-content-id") {
      report.ineligibleNoContentId += 1;
    } else {
      // "ineligible-kind" - Pages/Files/SubHeaders/URLs, plus Quiz/Discussion
      // module items whose contentId is not an assignment id (AC4).
      report.ineligibleKind += 1;
    }
  }
  return report;
}

/**
 * AC3's idempotency key depends entirely on knowing whether an item ALREADY
 * carries a rubric - and a failed per-item detail fetch tells you nothing
 * about that either way. Reading a failed fetch as "no existing rubric" is
 * exactly the C3 defect this function exists to close: a Canvas 500 on ONE
 * assignment's detail GET would otherwise make classifyRubricEligibility
 * (rubric-bulk-plan.ts) call that assignment eligible, generate a rubric, and
 * POST it over a hand-built grading rubric this control has no way to know
 * exists. "We could not read whether it has one" must not collapse into "it
 * has none" - this is the one place that decision gets made, pure and
 * directly testable, so a regression that folds the two back together fails
 * here rather than only being noticed after a live course loses a rubric.
 *
 * CHOICE (argued once, here): a fetch-failed item is DROPPED from the
 * server's `targets` array entirely (never sent through with a guessed
 * `existingRubricId`), and reported as its own "failed" outcome carrying the
 * fetch's own error text - see `detailFetchFailureOutcome` below. The
 * alternative the AC allows - a `detailUnknown` flag with its own skip
 * reason - would need a new member on `RubricTargetSkipReason`
 * (src/app/actions/rubric-bulk.ts), a closed union in a sibling file this
 * fixer does not own. Reporting a synthetic `RubricTargetOutcome` client-side
 * needs no change to that file at all and still satisfies AC4's "reported,
 * never silently dropped": the caller folds it into the very report
 * `summarizeRubricGenerateOutcomes` builds from the server's own outcomes.
 */
export type AssignmentDetailFetchResult = { error: string } | { detail: { description: string; rubricId?: number } };

export type AssignmentDetailOutcome =
  | { key: string; status: "ok"; existingRubricId?: number; description: string }
  | { key: string; status: "fetch-failed"; error: string };

export function classifyAssignmentDetailFetch(key: string, res: AssignmentDetailFetchResult): AssignmentDetailOutcome {
  if ("error" in res) {
    return { key, status: "fetch-failed", error: res.error };
  }
  return { key, status: "ok", existingRubricId: res.detail.rubricId, description: res.detail.description };
}

/** Turns a fetch-failed detail outcome into the same `RubricTargetOutcome`
 *  shape the server action itself emits, so it can be merged straight into
 *  `summarizeRubricGenerateOutcomes`'s input alongside the real per-item
 *  outcomes - one report, one code path, instead of a second parallel
 *  reporting mechanism for "the fetch never got a chance to run". */
export function detailFetchFailureOutcome(outcome: Extract<AssignmentDetailOutcome, { status: "fetch-failed" }>): RubricTargetOutcome {
  return {
    itemId: outcome.key,
    status: "failed",
    reason: `Could not check for an existing rubric: ${outcome.error}`,
  };
}

/** C7: `bulkGenerateAndAssociateRubric`'s own per-assignment detail fetch
 *  (`getGradableAction`) used to fan out via a bare `Promise.all` - one
 *  Canvas GET per selected assignment, unbounded (forty selected assignments
 *  meant forty concurrent GETs), and the throttle failures that produced fed
 *  straight into the C3 defect above, since a throttled fetch looks exactly
 *  like every other failure. Sized well under `bulkAssociateRubric`'s own
 *  sequential writes (canvas-modules/rubrics.ts), which share ONE throttle
 *  budget deliberately - this fan-out is reads, not writes, but "no bound at
 *  all" was never the right number either. */
export const RUBRIC_DETAIL_FETCH_CONCURRENCY = 5;

/**
 * Runs `fn` over `items` with at most `limit` in flight at once, preserving
 * result order (results[i] corresponds to items[i] regardless of finish
 * order). Pure enough to test directly: given a `fn` that records how many
 * calls are concurrently in flight, the peak recorded is exactly `limit`
 * (never more, and, for `items.length >= limit`, never less).
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/** The instructor-facing note built from a finished report - pure, and the
 *  one place AC4's three outcomes are turned into words, so a future edit
 *  that collapses "already has one" and "can never have one" back into the
 *  same phrase fails here rather than only being noticeable by reading the
 *  bar after the fact. */
export function describeRubricGenerateNote(report: BulkRubricGenerateReport): { kind: "success" | "error"; text: string } {
  if (report.actionError) {
    return { kind: "error", text: report.actionError };
  }
  if (report.generationFailedReason) {
    return { kind: "error", text: `Could not generate the rubric: ${report.generationFailedReason}` };
  }
  const ineligibleTotal = report.ineligibleKind + report.ineligibleNewQuiz + report.ineligibleNoContentId;
  const parts = [`${report.updated} rubric association${report.updated === 1 ? "" : "s"} created`];
  if (report.alreadyHasRubric > 0) {
    parts.push(`${report.alreadyHasRubric} already had a rubric (left unchanged)`);
  }
  if (ineligibleTotal > 0) {
    parts.push(`${ineligibleTotal} item${ineligibleTotal === 1 ? "" : "s"} cannot take a rubric`);
  }
  if (report.failed > 0) {
    parts.push(`${report.failed} failed`);
  }
  if (report.orphans.length > 0) {
    parts.push(`${report.orphans.length} rubric${report.orphans.length === 1 ? "" : "s"} created but not attached to anything (see below)`);
  }
  return {
    kind: report.failed > 0 || report.orphans.length > 0 ? "error" : "success",
    text: `Generate & associate rubric: ${parts.join("; ")}.`,
  };
}
