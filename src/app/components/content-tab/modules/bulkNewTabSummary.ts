// docs/bulk-open-in-new-tab-acceptance-criteria.md - AC1/AC5/AC6, plus the
// "Survey result" section at the end of that file, which corrects AC4/AC5/
// AC6/AC3 and MUST be read alongside the numbered criteria, not instead of
// them. This is the pure reporting core for the "set open-in-a-new-tab on
// every selected item that supports it" bulk control, split into its own
// leaf FROM THE START (never grown inside useBulkItemActions.ts, which the
// survey found already at 900 of this repo's 1000-line ceiling and split
// twice before for the identical reason) - this repo's vitest is node-env
// and renders no component, so a summariser living inside a hook or a JSX
// file would be untestable.
//
// WHY THIS EXISTS AT ALL - read before "simplifying" any of it away:
//
// Canvas honours `new_tab` for exactly two module-item types: ExternalUrl and
// ExternalTool (the API's own spelling - the DB's content_type for the
// latter is "ContextExternalTool", but every module-item payload this app
// reads reports type "ExternalTool"; the eligibility predicate below tests
// the API spelling, and Canvas's own published docs mislabel `new_tab` as
// "ExternalTool only" when the serializer source emits it for ExternalUrl
// too - see the survey's own "stale-documentation trap" note). Every other
// kind - Assignment, Quiz, Page, Discussion, File, SubHeader - cannot
// meaningfully carry the flag.
//
// Canvas's own controller applies `new_tab` with NO content-type guard:
//   @tag.new_tab = value_to_boolean(params[:module_item][:new_tab]) if params[:module_item][:new_tab]
// It will accept, store, and 200-OK a `new_tab` write on an Assignment. So an
// ineligible item does not fail loudly - it SILENTLY SUCCEEDS and would be
// counted as "done" by any reporting that trusts the HTTP response alone.
// The client-side eligibility check in this file (`isEligibleForNewTab`) is
// therefore not a nicety that avoids a 422 - it is THE ONLY GUARD standing
// between the instructor and a report that says "11 done" about eight items
// where nothing meaningful happened. Delete it, or route a write around it,
// and that guarantee is gone even though every existing test elsewhere would
// stay green.
//
// Every OTHER per-item bulk action in this app collapses failure into
// `N done, M failed` and discards the Canvas error string entirely. Do not
// make this file resemble that. The one precedent worth copying is
// ./bulkRubricGenerateSummary.ts (the rubric generate-and-associate report),
// the only other per-item reporting in this app that distinguishes SKIPPED
// from FAILED with named reasons and a separate counter per reason - this
// file mirrors that shape deliberately. Do NOT copy `bulkRubric` in
// useBulkItemActions.ts: that action silently filters out every ineligible
// item from its own `.filter(...)` before the Canvas call, so an ineligible
// item is never reported at all. That is a bad precedent living right next
// to this feature, explicitly not inherited here.
//
// THE "ALREADY AT THE REQUESTED VALUE" OUTCOME - decided and argued here,
// once: setting `new_tab` to a value it already holds is a no-op worth
// reporting as its own outcome ("unchanged"), never folded into "updated"
// (nothing observable changed) and never into "failed" (nothing went
// wrong). This matters most on a RE-RUN: an instructor who runs the action
// twice on the same selection must see "0 updated, 3 unchanged" the second
// time, not "3 updated" again (which would falsely suggest the second click
// did work) and not "3 failed" (which would falsely suggest something
// broke). AC3 (survey-corrected: `new_tab` rides the same response this app
// already reads for `external_url`, so the current value is already known
// once the module list has loaded, no extra fetch) makes this classification
// entirely pure and answerable BEFORE any Canvas call - see
// `classifyNewTabTarget` below, which a caller uses to skip a wasted write
// for items already correct rather than writing and then discarding the
// result.
//
// PURITY: every export in this file is a plain function of its arguments.
// No fetch, no Canvas client, no "use server" import, no ambient state. The
// caller (a stateful hook, not owned by this file) is responsible for
// issuing the actual Canvas write for every item this file says
// `shouldWrite: true`, and for turning that write's real outcome (success or
// thrown error) into a final `NewTabTargetOutcome` via the two-branch shape
// already defined below - this file never invents a status for a write it
// did not perform and cannot observe.

/**
 * The two Canvas module-item kinds `new_tab` is meaningful for. Deliberately
 * a `Set`, not a chain of `===`, so `isEligibleForNewTab` cannot silently
 * degrade into an accidental OR-of-something-else while looking similar at a
 * glance. Kept private: every call site outside this file goes through
 * `isEligibleForNewTab`, never re-lists these two strings itself, per this
 * chunk's own brief ("export whatever the UI needs... rather than making it
 * re-derive the predicate") - a second, drifted copy of this set anywhere
 * else in the app is exactly the failure mode that instruction exists to
 * prevent.
 */
const ELIGIBLE_KINDS: ReadonlySet<string> = new Set(["ExternalUrl", "ExternalTool"]);

/**
 * Whether a module item of this Canvas type can carry `new_tab` at all. The
 * ONLY guard between an instructor's click and Canvas silently accepting a
 * meaningless write on an Assignment/Page/Quiz/etc - see this file's header.
 * Takes a plain string (matching `CanvasModuleItem.type`'s own convention in
 * src/lib/canvas-modules/types.ts, and RubricTargetItem.kind's identical
 * choice in src/app/actions/rubric-bulk.ts) rather than importing that
 * sibling-owned type directly, so this leaf keeps compiling independently of
 * concurrent edits to src/lib/canvas-modules/ for this same feature.
 */
export function isEligibleForNewTab(kind: string): boolean {
  return ELIGIBLE_KINDS.has(kind);
}

// ---------------------------------------------------------------------------
// Per-item outcome (the "what actually happened to this one item" record).
// ---------------------------------------------------------------------------

/**
 * Named skip reasons, not a bare boolean or a single catch-all string - see
 * ./bulkRubricGenerateSummary.ts's RubricTargetSkipReason for the identical
 * pattern and the same reasoning (a future second skip reason, if this
 * action ever grows one, gets its own bucket rather than silently merging
 * into this one).
 */
export type NewTabSkipReason = "ineligible-kind";

/**
 * One item's outcome from an attempted bulk "set open-in-a-new-tab"
 * operation. Four branches, matching AC5/AC6 and the survey's "no
 * content-type guard" finding exactly:
 *
 *   - "updated": the item was eligible, its current value differed from the
 *     requested one, and the Canvas write succeeded. `newTab` echoes the
 *     value it is now set to (the requested value), so a caller never has to
 *     re-derive it from context.
 *   - "unchanged": the item was eligible but ALREADY held the requested
 *     value - a no-op, reported as its own outcome (see this file's header
 *     for why it is neither "updated" nor "failed").
 *   - "skipped": the item's type cannot take `new_tab` at all. `kind` names
 *     the actual Canvas type (per this chunk's own brief: "name the type"),
 *     so an instructor-facing detail view can say WHICH items were skipped
 *     and why, not just how many.
 *   - "failed": the write was attempted (the item WAS eligible and did need
 *     a change) and Canvas rejected it or the request threw. `reason` carries
 *     the real error text through - never discarded, unlike every other
 *     per-item bulk action in this app (see this file's header).
 */
export type NewTabTargetOutcome =
  | { itemId: string; status: "updated"; newTab: boolean }
  | { itemId: string; status: "unchanged"; newTab: boolean }
  | { itemId: string; status: "skipped"; reason: NewTabSkipReason; kind: string }
  | { itemId: string; status: "failed"; reason: string };

// ---------------------------------------------------------------------------
// Pre-write classification - decide BEFORE touching Canvas.
// ---------------------------------------------------------------------------

/**
 * One selected item as this file needs to see it: just enough to classify
 * it, nothing this file cannot already answer from data the caller has
 * in memory. `currentNewTab` mirrors the survey-corrected AC3 field
 * (`CanvasModuleItem.newTab: boolean | null`, read for free off the same
 * response `externalUrl` already comes from) - `null` for a type that
 * cannot carry the field, `boolean` for one that can. This file does not
 * import `CanvasModuleItem` itself (see the header on `isEligibleForNewTab`
 * for why), so a caller passes the three fields it needs explicitly.
 */
export interface NewTabSelectionItem {
  itemId: string;
  /** Canvas module-item type string, e.g. "ExternalUrl", "Assignment". */
  kind: string;
  /** The item's current `new_tab` value, or null when its kind cannot carry
   *  one at all (never a guessed default - see AC3's own reasoning). */
  currentNewTab: boolean | null;
}

/**
 * What a caller should do with one item, decided ENTIRELY from data already
 * in memory (no Canvas call has happened yet at this point):
 *
 *   - `{ shouldWrite: false, outcome }` - the final outcome is already known
 *     (ineligible, or already at the requested value) and no Canvas request
 *     should be made for this item at all. Writing anyway and discarding the
 *     result would be the wasted-request version of the same mistake AC4's
 *     survey correction warns against for a different reason (a write with
 *     no signal is worse than no write).
 *   - `{ shouldWrite: true }` - the item is eligible and its current value
 *     differs from the requested one. The caller must issue the Canvas
 *     write and turn its real result into a "updated" or "failed" outcome
 *     itself (this file cannot do that part - it has no fetch).
 */
export type NewTabWriteDecision =
  | { shouldWrite: false; outcome: Extract<NewTabTargetOutcome, { status: "skipped" | "unchanged" }> }
  | { shouldWrite: true };

/**
 * The one place eligibility and "already correct" are decided, so every
 * caller (the pre-click preview below, and the real write path a sibling
 * hook owns) reads the same answer for the same item. A caller that
 * re-implements either check by hand instead of calling this is exactly the
 * drift this chunk's brief warns against.
 */
export function classifyNewTabTarget(item: NewTabSelectionItem, requestedNewTab: boolean): NewTabWriteDecision {
  if (!isEligibleForNewTab(item.kind)) {
    return {
      shouldWrite: false,
      outcome: { itemId: item.itemId, status: "skipped", reason: "ineligible-kind", kind: item.kind },
    };
  }
  if (item.currentNewTab === requestedNewTab) {
    return { shouldWrite: false, outcome: { itemId: item.itemId, status: "unchanged", newTab: requestedNewTab } };
  }
  return { shouldWrite: true };
}

// ---------------------------------------------------------------------------
// Pre-click preview - AC1's "state plainly how many it will affect".
// ---------------------------------------------------------------------------

/**
 * Counts behind the pre-click control, all derived from `classifyNewTabTarget`
 * so they can never disagree with the post-run report's own accounting of
 * the same selection.
 */
export interface NewTabActionPreview {
  /** Every item in the selection, eligible or not. */
  selectedCount: number;
  /** Eligible items (ExternalUrl/ExternalTool), regardless of current value. */
  eligibleCount: number;
  /** Eligible items that already hold the requested value - clicking would
   *  change nothing for these. */
  alreadySetCount: number;
  /** Eligible items whose value would actually change if the action ran now.
   *  This, not `eligibleCount`, is the number this chunk's brief means by
   *  "how many it will affect" once AC3's current-value read exists - an
   *  eligible item that already matches the requested value would not be
   *  "affected" by clicking, however eligible it is. */
  wouldChangeCount: number;
}

/**
 * Pure preview of what running the action now would do, built without
 * touching Canvas (every value it needs is already in `items`). AC1's own
 * decided rule ("the action is offered whenever the selection contains at
 * least one eligible item") is about ENABLEMENT and is applied by
 * `describeNewTabOfferedAction` below, not here - this function only counts.
 */
export function previewNewTabAction(items: NewTabSelectionItem[], requestedNewTab: boolean): NewTabActionPreview {
  let eligibleCount = 0;
  let alreadySetCount = 0;

  for (const item of items) {
    if (!isEligibleForNewTab(item.kind)) continue;
    eligibleCount += 1;
    const decision = classifyNewTabTarget(item, requestedNewTab);
    if (!decision.shouldWrite) {
      // Reachable only via the "unchanged" branch, since eligibility was
      // already checked above - classifyNewTabTarget is still the single
      // source of truth for the equality test itself.
      alreadySetCount += 1;
    }
  }

  return {
    selectedCount: items.length,
    eligibleCount,
    alreadySetCount,
    wouldChangeCount: eligibleCount - alreadySetCount,
  };
}

/** "open in a new tab" / "open in the same tab" - AC2's two explicit,
 *  set-not-toggle actions, named identically everywhere this file describes
 *  either direction, so the two never drift into slightly different wording
 *  in different messages. */
function describeTarget(requestedNewTab: boolean): string {
  return requestedNewTab ? "open in a new tab" : "open in the same tab";
}

function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

/**
 * The offered-action copy: whether the control should be enabled, and the
 * sentence that states how many items it will affect BEFORE the click (this
 * chunk's brief requires the count live here, not be re-derived by the UI).
 *
 * Enablement follows AC1's own decided rule literally - offered whenever at
 * least one eligible item exists, even if every eligible item already holds
 * the requested value (running it again would simply be a no-op, which is
 * harmless and still worth being able to confirm). When there is truly
 * nothing eligible, this repo's standing rule applies: disabled WITH ITS
 * REASON VISIBLE, never enabled-then-rejected.
 */
export function describeNewTabOfferedAction(
  items: NewTabSelectionItem[],
  requestedNewTab: boolean
): { enabled: boolean; text: string } {
  const preview = previewNewTabAction(items, requestedNewTab);
  const target = describeTarget(requestedNewTab);

  if (preview.eligibleCount === 0) {
    return {
      enabled: false,
      text: `None of the selected items can ${target} - only external links and external tool items support this setting.`,
    };
  }

  if (preview.wouldChangeCount === 0) {
    const item = pluralize(preview.eligibleCount, "item");
    return { enabled: true, text: `All ${preview.eligibleCount} eligible ${item} already ${target}.` };
  }

  const item = pluralize(preview.selectedCount, "item");
  return {
    enabled: true,
    text: `Set ${preview.wouldChangeCount} of ${preview.selectedCount} selected ${item} to ${target}.`,
  };
}

// ---------------------------------------------------------------------------
// Post-run summariser and copy.
// ---------------------------------------------------------------------------

/** Per-reason counts over a finished run's outcomes. AC5/AC6: "skipped"
 *  (ineligible) and "failed" are separate counters, never one shared bucket -
 *  a regression that merges them is exactly what the sabotage check on this
 *  file's summariser targets. */
export interface NewTabBulkReport {
  updated: number;
  unchanged: number;
  ineligible: number;
  failed: number;
  /** Every failed item's own id + reason, carried through rather than
   *  discarded (AC5) - the one-line note below only states a COUNT of
   *  failures; a details view can list these. */
  failures: Array<{ itemId: string; reason: string }>;
}

export const EMPTY_NEW_TAB_REPORT: NewTabBulkReport = {
  updated: 0,
  unchanged: 0,
  ineligible: 0,
  failed: 0,
  failures: [],
};

/**
 * Pure summariser over a finished run's per-item outcomes. The one function
 * that decides whether "skipped" and "failed" stay distinct counters - see
 * this file's header on why conflating them makes a successful run look
 * broken, and this chunk's brief's own sabotage-check instruction to fold
 * them together and confirm the tests catch it.
 */
export function summarizeNewTabOutcomes(outcomes: NewTabTargetOutcome[]): NewTabBulkReport {
  const report: NewTabBulkReport = { ...EMPTY_NEW_TAB_REPORT, failures: [] };

  for (const outcome of outcomes) {
    if (outcome.status === "updated") {
      report.updated += 1;
    } else if (outcome.status === "unchanged") {
      report.unchanged += 1;
    } else if (outcome.status === "skipped") {
      report.ineligible += 1;
    } else {
      report.failed += 1;
      report.failures.push({ itemId: outcome.itemId, reason: outcome.reason });
    }
  }

  return report;
}

/**
 * The instructor-facing note for a finished run - pure, and the ONE place
 * this file turns counts into words. Every clause is joined with "; " and
 * each names exactly one concept, so "cannot take this setting" (skipped)
 * and "failed" never share a clause - collapsing them into one sentence like
 * "3 done, 8 failed" is precisely the false report this chunk exists to
 * replace (see this file's header). Denominator is derived from the report's
 * own counts (never a second caller-supplied total) so it can never drift
 * out of sync with the outcomes actually summarised.
 */
export function describeNewTabRunNote(
  report: NewTabBulkReport,
  requestedNewTab: boolean
): { kind: "success" | "error"; text: string } {
  const target = describeTarget(requestedNewTab);
  const total = report.updated + report.unchanged + report.ineligible + report.failed;

  const parts = [`Set ${report.updated} of ${total} selected ${pluralize(total, "item")} to ${target}`];

  if (report.unchanged > 0) {
    parts.push(`${report.unchanged} already ${target}`);
  }
  if (report.ineligible > 0) {
    parts.push(`${report.ineligible} cannot take this setting`);
  }
  if (report.failed > 0) {
    parts.push(`${report.failed} failed`);
  }

  return {
    kind: report.failed > 0 ? "error" : "success",
    text: `${parts.join("; ")}.`,
  };
}
