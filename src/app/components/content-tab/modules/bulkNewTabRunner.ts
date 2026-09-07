// The stateful half of the bulk "set open-in-a-new-tab" action
// (docs/bulk-open-in-new-tab-acceptance-criteria.md, AC1/AC2/AC5/AC6). The
// PURE half - the outcome type, the pre-write classifier, the summariser,
// and every piece of instructor-facing copy - already lives in
// ./bulkNewTabSummary.ts and MUST be read first; this file adds nothing to
// that vocabulary, it only orchestrates it against a real Canvas write.
//
// A NEW LEAF, not folded into useBulkItemActions.ts: that file sits at 900
// of this repo's 1000-line ceiling and has already been split twice for
// exactly this reason (see its own header, and ./bulkOpRunners.ts's /
// ./bulkRubricGenerateSummary.ts's own headers for the two prior splits).
// Living here also makes this directly node-testable, since this repo's
// vitest is node-env and renders no component - see
// bulkNewTabRunner.test.ts.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: classify BEFORE writing, and
// NEVER write to an item classifyNewTabTarget has already resolved.
// classifyNewTabTarget (bulkNewTabSummary.ts) answers "skipped" (ineligible
// kind) or "unchanged" (already at the requested value) entirely from data
// already in memory - no Canvas call needed for either. Writing anyway and
// discarding the result would be a wasted request at best; for an
// ineligible item it would additionally be the exact hazard
// bulkNewTabSummary.ts's own header names: Canvas applies `new_tab` with NO
// content-type guard server-side, so a write against an Assignment/Page/
// Quiz/etc. would be silently accepted and 200-OK'd, and a careless caller
// could fold that into "updated" even though this file's classify-first
// order is the only thing standing between the instructor and exactly that
// false report.
//
// Do NOT copy runPerItem (./bulkOpRunners.ts) here: it counts successes and
// failures and discards the real Canvas error string entirely - explicitly
// not inherited for this action, per this chunk's own brief and
// bulkNewTabSummary.ts's header.
import type { CanvasModuleItem } from "@/lib/canvas-modules";
import { itemKey } from "../utils";
import {
  classifyNewTabTarget,
  describeNewTabRunNote,
  summarizeNewTabOutcomes,
  type NewTabBulkReport,
  type NewTabTargetOutcome,
} from "./bulkNewTabSummary";

export interface BulkNewTabRunResult {
  report: NewTabBulkReport;
  note: { kind: "success" | "error"; text: string };
}

/**
 * Runs the bulk "set open-in-a-new-tab" action over one selection.
 * `writeItem` is the caller's real Canvas write (useBulkItemActions.ts binds
 * it to updateModuleItemAction with courseUrl/acronym already applied) -
 * this file has no fetch of its own, matching bulkNewTabSummary.ts's own
 * purity contract for whatever calls it. It is only ever invoked for an
 * item classifyNewTabTarget has already said needs a write; the write's
 * real result (a returned `{ok:true}` or `{error}` - never a thrown
 * exception, matching every other server action in this app) becomes that
 * item's own "updated" or "failed" outcome, never invented ahead of time.
 *
 * `itemKey(moduleId, item.id)` (../utils.ts) is used as every outcome's
 * `itemId` - the same stable key useBulkItemActions.ts's own
 * bulkGenerateAndAssociateRubric already keys its per-item map by, not
 * Canvas's own item id alone.
 */
export async function runBulkNewTabAction(
  items: Array<{ item: CanvasModuleItem; moduleId: number }>,
  requestedNewTab: boolean,
  writeItem: (item: CanvasModuleItem, moduleId: number, newTab: boolean) => Promise<{ ok: true } | { error: string }>
): Promise<BulkNewTabRunResult> {
  const outcomes: NewTabTargetOutcome[] = [];

  for (const { item, moduleId } of items) {
    const itemId = itemKey(moduleId, item.id);
    const decision = classifyNewTabTarget(
      { itemId, kind: item.type, currentNewTab: item.newTab ?? null },
      requestedNewTab
    );
    if (!decision.shouldWrite) {
      // Already fully resolved (ineligible kind, or already at the
      // requested value) with NO Canvas call made for this item - the whole
      // point of classifying first. See this file's own header.
      outcomes.push(decision.outcome);
      continue;
    }
    const result = await writeItem(item, moduleId, requestedNewTab);
    outcomes.push(
      "error" in result
        ? { itemId, status: "failed", reason: result.error }
        : { itemId, status: "updated", newTab: requestedNewTab }
    );
  }

  const report = summarizeNewTabOutcomes(outcomes);
  return { report, note: describeNewTabRunNote(report, requestedNewTab) };
}
