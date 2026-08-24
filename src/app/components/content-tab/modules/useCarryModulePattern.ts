"use client";

// "Carry pattern forward" (docs/carry-module-pattern-forward-acceptance-
// criteria.md, chunk D - sections 5 and 6 are the contract, section 6 wins
// wherever they disagree). This is agent 2E's slice: D14, D15, D16, D18,
// D19, D20, D21. Wave 1 already built the pure primitives this hook
// composes - module-pattern-inference.ts (the title), module-pattern-
// transpose.ts (the due date), module-template.ts's readModuleTemplateAction
// (the source read) and module-pattern-plan.ts's buildModulePatternPlan (the
// proposal). This file is the client-side orchestration: which module is the
// template, when to (re)fetch it, how to derive the plan as the target
// selection or authored patterns change, and how to apply it.
//
// D14 (the template is a SELECT, not a "use as template" button on a row):
// `templateOptions`/`sourceModuleId` below follow the postModuleOptionsFrom /
// defaultPostModuleChoiceFrom precedent (lmsGenerationModuleTarget.ts) in
// spirit - a pure options-builder plus a pure default-picker - but scoped to
// only the CURRENTLY SELECTED live modules (not the whole course tree, which
// is what postModuleOptionsFrom itself builds for an unrelated picker), and
// seeded to the lowest-numbered one (carryTemplateOptionsFrom sorts by
// extractModuleNumber). Exactly like that precedent, this select persists
// nothing (see bulkBarGroupCatalog.ts's own carryTemplateSelect comment) -
// its only correct value is a function of the CURRENT selection.
//
// D15 (roles live BESIDE the selection, re-resolved every render - the
// useVisualizerCoverage idiom): `sourceModuleId` is plain state, but it is
// checked against the live selection on every render (the block below the
// `useState` calls) and reseeded to the recomputed default the moment it
// falls outside the current selection - never a persisted role on the shared
// selection Sets. This is what makes a stale template choice (the module was
// deselected, or a whole new course loaded) impossible rather than merely
// unlikely - the same reasoning pruneSelectionForModules exists for, applied
// to a role instead of a Set membership. Comparing `selectionSignature`
// output (confirmArming.ts) is a plain comparison during render (React's own
// documented "adjust state when a prop changes" pattern, used elsewhere in
// this codebase - see GeneratedPreviewModal.tsx's own `draft`/`seededText`
// reseed) - it is not a `useEffect`, so this repo's react-hooks/set-state-
// in-effect rule never applies to it.
//
// D16 (the target list is NOT pre-filtered here): `targets` below is built
// from EVERY live selected module, the source module included.
// buildModulePatternPlan's own `excludedSourceTargetId` guard is what drops
// the source from its actual target list - filtering it out a second time
// here would mean that guard never runs in production. Let it run; the
// review modal renders whatever the plan says it excluded.
//
// D20 (the export/live mismatch, fixed at arming - entry 330 check 14 is the
// precedent): `facts.moduleCount` (bulkBarGroups.ts) counts every selected
// module KEY, live and export/repo alike, so a selection can satisfy the
// bar's own `visible` gate while this operation - which needs real Canvas
// modules to read a template from and write into - has too few (or zero)
// live ones to act on. `carryLiveSelectionRefusalReason` below is the one
// place that gate lives, checked at the very first line of
// `onReviewCarryPattern` (D14's own "with exactly one module selected... the
// group refuses with that reason stated" folds into the same check - one
// live module is exactly as unusable as zero export-sourced ones), so a
// click that cannot possibly do anything says why in one click rather than
// arming a doomed second one.
//
// D21 (arm the TEMPLATE READ, not the whole proposal - confirmArming.ts's
// technique at finer grain): `templateArmedFor` is a signature of
// `${courseUrl}::${sourceModuleId}` ONLY - never the target selection, never
// the authored patterns. `template` itself is derived exactly like
// useVisualizerCoverage.ts's own `coverage` (`isConfirmArmed(armedFor, sig)
// ? raw : null`), and `plan` is a `useMemo` over `template` plus the target
// list/authored patterns/exclusions. Changing which modules are selected as
// targets, or typing a `{n}` override for a blocked row, therefore never
// discards the fetched template or any other authored pattern - only
// picking a DIFFERENT template module (which changes the signature) forces
// a re-fetch. No effect performs the fetch (it runs from the button's own
// click handler), so eslint's setState-in-effect rule never applies here
// either.
//
// D18 (the review groups by SOURCE ITEM): `buildCarryReviewRows` collapses
// wave 1's per-target, per-item plan rows into one row per source item,
// aggregating create/skip/blocked counts across every target and surfacing
// ONE blocked message when every target blocks an item for the SAME
// non-target-specific reason (D3b/D4b) - never a repeated per-target list.
// "target-module-unnumbered" is deliberately excluded from that
// aggregation: it is a property of the TARGET, not the item (every item
// blocks identically for that one target), and it cannot be fixed by an
// authored per-item pattern (parseAuthoredItemPattern needs no module
// number at all, but module-pattern-plan.ts's own `targetWeek === null`
// check runs regardless of where the pattern came from) - so the review
// modal must not offer the `{n}` affordance for it.
//
// COORDINATOR CORRECTION (mid-flight, from the sibling who finished
// carry-module-pattern.ts): `onExisting` is hardcoded to "skip" below and no
// overwrite control is offered anywhere in this hook or its modal.
// applyModulePatternCarryAction's write paths only CREATE - a matched-item
// "overwrite" decision resolves to the outcome "overwrite-not-implemented",
// never an actual overwrite. Offering an overwrite toggle here would ship a
// control whose promised effect silently does not happen (this repo's
// recorded "capability ships dead with every gate green" failure). The same
// message named a second correction: a Discussion this reader could not
// clear of a checkpoint split (`checkpointsUnknown: true`) is excluded from
// the plan entirely (via `excludedItemIds`, alongside any instructor
// deselection) and shown separately as a REFUSED row with its reason, before
// apply ever runs - not discovered only from the outcome note afterward.
import { useMemo, useState } from "react";
import type { LlmProvider } from "@/lib/llm";
import type { CanvasModule } from "@/lib/canvas-modules";
import { isConfirmArmed, selectionSignature } from "./confirmArming";
import { describeOrphans, type OrphanNote } from "./useBulkModuleActions";
import { readModuleTemplateAction, type ModuleTemplate, type TemplateItem, type NotCarriedField } from "@/app/actions/module-template";
import { readCourseDeadlineContextAction } from "@/app/actions/current-events-assignments";
import { applyModulePatternCarryAction, type CarryModulePatternApplyOutcome } from "@/app/actions/carry-module-pattern";
import {
  buildModulePatternPlan,
  type ModulePatternPlan,
  type ModulePatternPlanBlockReasonCode,
  type ModulePatternPlanItem,
  type ModulePatternPlanTargetInput,
} from "@/lib/module-pattern-plan";
import { extractModuleNumber } from "@/lib/workflows/module-value";

// ---------------------------------------------------------------------------
// Pure helpers - exported for direct, renderer-free unit testing (this
// repo's vitest is node-env and never renders a component - see
// useVisualizerCoverage.ts's own header comment for the identical posture).

/** One entry in the template-select's option list, scoped to the CURRENTLY
 * SELECTED live modules only (D14) - never the whole course tree, which is
 * what the unrelated postModuleOptionsFrom precedent builds. `week` is
 * carried alongside `name`/`id` so the default-picker below needs no second
 * pass over `modules`. */
export interface CarryTemplateOption {
  id: number;
  name: string;
  week: number | null;
}

/** Options for `carryTemplateSelect`, sorted ascending by inferred week
 * number (a module with no recognizable number sorts last, tie-broken by id)
 * - the same ordering that makes `options[0]` the correct D14 default
 * ("seeded to the lowest-numbered selected module"). */
export function carryTemplateOptionsFrom(modules: CanvasModule[], liveModuleIds: Set<number>): CarryTemplateOption[] {
  const options: CarryTemplateOption[] = [];
  for (const mod of modules) {
    if (!liveModuleIds.has(mod.id)) continue;
    options.push({ id: mod.id, name: mod.name, week: extractModuleNumber(mod.name) });
  }
  options.sort((a, b) => {
    if (a.week === null && b.week === null) return a.id - b.id;
    if (a.week === null) return 1;
    if (b.week === null) return -1;
    if (a.week !== b.week) return a.week - b.week;
    return a.id - b.id;
  });
  return options;
}

/**
 * D20/D14's combined arming-time gate: this operation needs at least two
 * LIVE Canvas modules (a template plus at least one target) among whatever
 * is currently selected, regardless of how many non-live (export/repo-
 * sourced) keys the selection also carries - `facts.moduleCount` counts
 * those too, which is exactly the mismatch D20 names. Returns `null` when
 * the operation can proceed; otherwise the reason to show, distinguishing
 * "the selection is mostly/entirely non-live" from "too few modules were
 * selected at all" so the instructor learns which one applies.
 */
export function carryLiveSelectionRefusalReason(totalSelectedCount: number, liveCount: number): string | null {
  if (liveCount >= 2) return null;
  if (totalSelectedCount > liveCount) {
    return (
      "Carrying a pattern forward needs at least two live Canvas modules - a template and at least one target - " +
      "but the current selection includes export- or repo-sourced modules this action cannot read from or write " +
      `to, leaving only ${liveCount} live module${liveCount === 1 ? "" : "s"}.`
    );
  }
  if (liveCount === 1) {
    return "Select at least one more module to use as a target - carrying a pattern forward needs a template and at least one target.";
  }
  return "Select at least two modules - one to use as the template and at least one target.";
}

/** One row of the review modal, grouped by SOURCE ITEM (D18) rather than by
 * target module: a D3b false positive, or a D4/D4b block, is a property of
 * the item and uniform across every target, so grouping by target would
 * show (and invite fixing) the same thing once per target instead of once. */
export interface CarryReviewItemRow {
  itemId: number;
  itemType: string;
  sourceTitle: string;
  /** Null when every target blocks this item (no target resolved a pattern
   * for it at all), or when the item is excluded (C1 - no target was ever
   * computed for it). */
  patternTemplate: string | null;
  /** One resolved title from the first target that isn't blocked, shown
   * beside `sourceTitle` as the fastest false-positive signal (D3b) - null
   * when every target is blocked, or when excluded. */
  exampleResolvedTitle: string | null;
  createCount: number;
  skipCount: number;
  blockedCount: number;
  /** C2: how many targets resolved this item to "create" but cannot actually
   * receive it, because `writeSupported` is false for this item's kind
   * (ExternalUrl, ExternalTool, or a File with no contentId - see
   * module-pattern-plan.ts's `isCarryWriteSupportedKind`). Disjoint from
   * `createCount` - a "create" decision is counted into exactly one of the
   * two, never both (see that file's `bumpCount`). */
  unsupportedCount: number;
  targetCount: number;
  /** Whether ANY wired write path could create this item's kind at all -
   * constant across every target (a kind property of the source item, not
   * of any one target). C1's excluded rows default this to `true` (nothing
   * about exclusion implies the kind is unwritable), so the modal must gate
   * the "not created" disclosure on `unsupportedCount > 0`, not on this
   * alone. */
  writeSupported: boolean;
  /** Set only when EVERY target blocks this item for the SAME reason, and
   * that reason is a property of the ITEM (source-module-unnumbered,
   * no-token-match, or an invalid authored pattern) rather than of a
   * specific target (target-module-unnumbered, which varies per target and
   * is surfaced once per target instead - see `buildCarryReviewRows`).
   * Non-null is what licenses showing the D4 `{n}` override affordance:
   * `target-module-unnumbered` can never be fixed by an authored per-item
   * pattern (module-pattern-plan.ts checks the target's own week
   * independently of where the pattern came from), so a row blocked only
   * for that reason must never offer it. */
  uniformBlockedMessage: string | null;
  /** C12: the reason code behind `uniformBlockedMessage`, so the modal can
   * suppress the per-row repeat of a message the plan's own top-level hint
   * already states in full - specifically "source-module-unnumbered", whose
   * message is identical for every item whenever `plan.sourceWeek === null`
   * (the two are the same underlying check - see module-pattern-plan.ts). A
   * "no-token-match" or authored-pattern-missing-token message is per-item
   * text (it names the item's own title/pattern), so it is never suppressed
   * by this. Null whenever `uniformBlockedMessage` is null. */
  uniformBlockedReasonCode: ModulePatternPlanBlockReasonCode | null;
  notCarried: NotCarriedField[];
  /** C1: true for a row built from `plan.excludedItems` rather than from any
   * `targets[].items` entry - no decision was ever computed for it, so
   * every count above is zero and `patternTemplate`/`exampleResolvedTitle`
   * are null. Re-including the item (via `onToggleExcludedItem`) and
   * rebuilding the plan replaces this row with a real, fully-computed one.
   * F3: this is now, by construction, ALWAYS a manual exclusion - a
   * checkpoint-refused item never reaches `plan.excludedItems` as a row here
   * at all (see `buildCarryReviewRows`'s `checkpointRefusedIds` parameter),
   * so this flag's own checkbox always genuinely round-trips: it toggles
   * `manualExcluded`, and `manualExcluded` is the only thing that can put
   * this particular item back into `excludedItemIds`. */
  excluded: boolean;
}

function excludedReviewRow(item: { itemId: number; itemType: string; sourceTitle: string }): CarryReviewItemRow {
  return {
    itemId: item.itemId,
    itemType: item.itemType,
    sourceTitle: item.sourceTitle,
    patternTemplate: null,
    exampleResolvedTitle: null,
    createCount: 0,
    skipCount: 0,
    blockedCount: 0,
    unsupportedCount: 0,
    targetCount: 0,
    writeSupported: true,
    uniformBlockedMessage: null,
    uniformBlockedReasonCode: null,
    notCarried: [],
    excluded: true,
  };
}

/**
 * Collapse one ModulePatternPlan's per-target, per-item rows into one row
 * per source item (D18), merged with `plan.excludedItems` (C1) so EVERY
 * MANUALLY excluded source item has exactly one row, in the template's own
 * item order (`plan.sourceItemOrder`). Pure and independent of React - the
 * plan itself already carries everything this needs.
 *
 * F3: `checkpointRefusedIds` names the subset of `plan.excludedItems` that
 * were excluded because their checkpoint structure could not be read back
 * (`useCarryModulePattern.ts`'s `checkpointRefusedItems`), never by an
 * instructor's own checkbox. Those items are deliberately given NO row here
 * at all - they are already shown, with their real reason and no interactive
 * affordance, in the modal's dedicated "Refused (not included)" list, and a
 * second generic "excluded" row for the same item offered a checkbox that
 * could never do anything (checking it only ever touches `manualExcluded`,
 * while `checkpointRefusedIds` unconditionally puts the item back into
 * `excludedItemIds` regardless). Distinguishing the two kinds of exclusion
 * HERE, in the row model, is what makes that dead affordance impossible to
 * render rather than merely something the modal remembers not to draw.
 */
export function buildCarryReviewRows(plan: ModulePatternPlan, checkpointRefusedIds: Set<number> = new Set()): CarryReviewItemRow[] {
  const byItem = new Map<number, ModulePatternPlanItem[]>();
  for (const target of plan.targets) {
    for (const item of target.items) {
      const list = byItem.get(item.itemId);
      if (list) list.push(item);
      else byItem.set(item.itemId, [item]);
    }
  }

  const rowById = new Map<number, CarryReviewItemRow>();
  for (const items of byItem.values()) {
    if (items.length === 0) continue;
    const first = items[0];
    const createCount = items.filter((i) => i.decision === "create" && i.writeSupported).length;
    const unsupportedCount = items.filter((i) => i.decision === "create" && !i.writeSupported).length;
    const skipCount = items.filter((i) => i.decision === "skip").length;
    const blockedCount = items.filter((i) => i.decision === "blocked-unnumbered").length;
    const nonBlocked = items.find((i) => i.decision !== "blocked-unnumbered");

    const allBlocked = blockedCount === items.length;
    const itemLevelBlocked = items.filter((i) => i.blockedReasonCode !== null && i.blockedReasonCode !== "target-module-unnumbered");
    const uniformlyBlocked = allBlocked && itemLevelBlocked.length === items.length;
    const uniformBlockedMessage = uniformlyBlocked ? (itemLevelBlocked[0]?.blockedMessage ?? null) : null;
    const uniformBlockedReasonCode = uniformlyBlocked ? (itemLevelBlocked[0]?.blockedReasonCode ?? null) : null;

    rowById.set(first.itemId, {
      itemId: first.itemId,
      itemType: first.itemType,
      sourceTitle: first.sourceTitle,
      patternTemplate: nonBlocked?.patternTemplate ?? null,
      exampleResolvedTitle: nonBlocked?.resolvedTitle ?? null,
      createCount,
      skipCount,
      blockedCount,
      unsupportedCount,
      targetCount: items.length,
      writeSupported: first.writeSupported,
      uniformBlockedMessage,
      uniformBlockedReasonCode,
      notCarried: first.notCarried,
      excluded: false,
    });
  }

  for (const excludedItem of plan.excludedItems) {
    if (checkpointRefusedIds.has(excludedItem.itemId)) continue;
    rowById.set(excludedItem.itemId, excludedReviewRow(excludedItem));
  }

  const rows: CarryReviewItemRow[] = [];
  for (const itemId of plan.sourceItemOrder) {
    const row = rowById.get(itemId);
    if (row) rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// C9: two predicates extracted out of CarryModulePatternReviewModal.tsx's own
// JSX so this repo's "source-text tests over-specify" failure does not repeat
// here. The wiring test for that component previously pinned the LITERAL
// ternary/boolean-expression source text driving these two decisions
// (`useState(authoredText ?? row.sourceTitle)`, `disabled={!draft.includes
// ("{n}")}`) - a rename, a helper extraction, or an inverted ternary would
// redden those assertions with no behavior change at all. Extracting the
// predicates here and testing THEM (useCarryModulePattern.test.ts) pins the
// FACT each one decides; the modal's own wiring test then only pins that the
// call site invokes the named predicate with the right arguments, in the
// right order - never the surrounding expression's exact spelling.

/** D4's Unblock-button gate: an authored draft must contain the literal
 * `{n}` token before it can unblock a row (parseAuthoredItemPattern's own
 * requirement, restated here as a pure predicate for the modal to call
 * rather than inlining `draft.includes("{n}")` directly in JSX). */
export function draftContainsPatternToken(draft: string): boolean {
  return draft.includes("{n}");
}

/** The Unblock text field's seed value: an already-authored pattern for this
 * item wins over the row's own source title, which is used only as a
 * starting point for the instructor to edit into a pattern (D4). */
export function initialCarryDraftText(authoredText: string | undefined, sourceTitle: string): string {
  return authoredText ?? sourceTitle;
}

/** Whether a review row's `{n}` override affordance and amber "Blocked" tag
 * should render at all - true exactly when every target blocked the item for
 * the same item-level reason (D18/`buildCarryReviewRows`'s
 * `uniformBlockedMessage`). */
export function isUniformlyBlockedRow(row: Pick<CarryReviewItemRow, "uniformBlockedMessage">): boolean {
  return row.uniformBlockedMessage !== null;
}

/**
 * C8: the ONE fact that licenses showing the review modal at all - and, via
 * `buildBulkBarFacts.ts`'s `carryReviewOpen` (thread-through only, not owned
 * by this file), the ONE fact that raises the bulk bar's `carryPattern` group
 * to its `fan-out-write` tier (D17). `reviewOpen` alone is NOT this fact: a
 * selection change mid-fetch reseeds `sourceModuleId` (D15's own re-resolve-
 * every-render block above), which changes `templateSig` and can null out
 * `template` (and therefore `plan`) while `reviewOpen` is still true from the
 * click that started the fetch - nothing else ever resets `reviewOpen`, so
 * without this check the bar would keep asserting a destructive path is
 * reachable (the modal that offers `onApply`/`closeReview`) when it no longer
 * is, and the review modal itself can no longer mount to offer `closeReview`.
 * Extracted as a pure, independently-testable predicate (the C9 idiom above)
 * specifically so `ModulesView.tsx`'s bulk-bar fact and
 * `ModulesViewSecondaryModals.tsx`'s mount gate can both be wired to read the
 * SAME hook field (`reviewVisible` below) rather than each re-stating this
 * boolean expression in its own words, which is exactly how the two drifted
 * apart in the first place.
 */
export function isCarryReviewVisible(reviewOpen: boolean, template: unknown, plan: unknown): boolean {
  return reviewOpen && template != null && plan != null;
}

/**
 * Summarize an apply run's outcomes (AC6's per-object vocabulary) into one
 * note, reusing `describeOrphans` (useBulkModuleActions.ts) for the
 * "created but not linked" clause exactly the way useCurrentEventsAssignments
 * already does. `kind: "error"` only when at least one row genuinely failed
 * (write-failed/generation-failed/orphaned) - skip/blocked/refused rows are
 * expected, disclosed outcomes, not failures.
 */
export function describeCarryApplyOutcome(outcomes: CarryModulePatternApplyOutcome[]): { kind: "success" | "error"; text: string } {
  const counts: Partial<Record<CarryModulePatternApplyOutcome["status"], number>> = {};
  const orphans: OrphanNote[] = [];
  for (const outcome of outcomes) {
    counts[outcome.status] = (counts[outcome.status] ?? 0) + 1;
    if (outcome.status === "orphaned") orphans.push({ kind: outcome.kind, title: outcome.title, contentId: outcome.contentId });
  }

  const success = counts.success ?? 0;
  const parts: string[] = [`${success} item${success === 1 ? "" : "s"} created`];
  if (counts.skipped) parts.push(`${counts.skipped} already present, skipped`);
  if (counts.blocked) parts.push(`${counts.blocked} blocked`);
  if (counts["refused-checkpoint-unknown"]) parts.push(`${counts["refused-checkpoint-unknown"]} discussion(s) refused (checkpoint structure unreadable)`);
  // F2: applyModulePatternCarryAction refuses an ExternalTool item rather
  // than carrying it as a plain text-entry assignment, because Canvas needs
  // an external-tool launch URL this app cannot read back - carrying it
  // anyway would silently change what students are asked to do. This status
  // existed on CarryModulePatternApplyOutcome before this line did (added by
  // a sibling working in carry-module-pattern.ts); see the completeness test
  // below (useCarryModulePattern.test.ts) that fails if a status is ever
  // added again without a matching line here.
  if (counts["refused-external-tool"]) {
    parts.push(
      `${counts["refused-external-tool"]} external-tool item(s) refused (Canvas needs a launch URL this app cannot read back, so carrying it as a plain assignment would silently change what students are asked to do)`
    );
  }
  if (counts["unsupported-kind"]) parts.push(`${counts["unsupported-kind"]} unsupported item kind(s)`);
  if (counts["overwrite-not-implemented"]) parts.push(`${counts["overwrite-not-implemented"]} matched an existing item and need overwrite, which is not implemented`);
  if (counts["generation-failed"]) parts.push(`${counts["generation-failed"]} failed to generate`);
  if (counts["write-failed"]) parts.push(`${counts["write-failed"]} failed to write to Canvas`);
  if (counts.orphaned) parts.push(`${counts.orphaned} created but not linked`);

  const failureCount = (counts["write-failed"] ?? 0) + (counts["generation-failed"] ?? 0) + (counts.orphaned ?? 0);
  return { kind: failureCount > 0 ? "error" : "success", text: parts.join(", ") + "." + describeOrphans(orphans) };
}

// ---------------------------------------------------------------------------
// The hook

export interface UseCarryModulePatternReturn {
  // The bar's own controls (carryTemplateSelect, carryReviewButton).
  templateOptions: CarryTemplateOption[];
  sourceModuleId: number | null;
  setSourceModuleId: (id: number) => void;
  reviewBusy: boolean;
  onReviewCarryPattern: () => void;

  // The review modal (D19 - rendered at ModulesView root).
  reviewOpen: boolean;
  /** C8: `isCarryReviewVisible(reviewOpen, template, plan)` - the single fact
   * `ModulesView.tsx`'s bulk-bar `carryReviewOpen` fact AND
   * `ModulesViewSecondaryModals.tsx`'s modal mount gate must both read,
   * instead of each re-deriving "open and resolved" in its own words. See
   * `isCarryReviewVisible`'s own doc comment above for why `reviewOpen` alone
   * is not sufficient. */
  reviewVisible: boolean;
  closeReview: () => void;
  template: ModuleTemplate | null;
  plan: ModulePatternPlan | null;
  reviewRows: CarryReviewItemRow[];
  checkpointRefusedItems: TemplateItem[];
  excludedItemIds: Set<number>;
  onToggleExcludedItem: (itemId: number) => void;
  authoredPatterns: Record<number, string>;
  onAuthoredPatternChange: (itemId: number, text: string) => void;
  applyBusy: boolean;
  onApply: () => void;
}

export function useCarryModulePattern(
  courseUrl: string,
  acronym: string | undefined,
  exportCourseId: string | undefined,
  provider: LlmProvider,
  modules: CanvasModule[],
  /** Live-only Canvas module ids from the current selection - `selection.
   * liveModuleIds` (ModulesView.tsx), the same derived Set<number> view
   * useBulkModuleActions/useCurrentEventsAssignments already consume. */
  liveModuleIds: Set<number>,
  /** The FULL selection count, live and non-live keys alike -
   * `selection.selectedModules.size` - used only to distinguish the two
   * D20 refusal messages (mostly non-live vs. simply too few selected). */
  totalSelectedModuleCount: number,
  setBusy: (b: boolean) => void,
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void,
  reload: () => void
): UseCarryModulePatternReturn {
  const templateOptions = useMemo(() => carryTemplateOptionsFrom(modules, liveModuleIds), [modules, liveModuleIds]);
  const defaultSourceId = templateOptions.length > 0 ? templateOptions[0].id : null;

  // D15: re-resolved through the live selection on every render, never a
  // role on the shared Sets. Comparing signatures during render (not inside
  // an effect) is what makes an invalid choice impossible instead of merely
  // unlikely - see this file's header comment.
  const [sourceModuleId, setSourceModuleIdState] = useState<number | null>(defaultSourceId);
  const [seededForSelectionSig, setSeededForSelectionSig] = useState(selectionSignature(liveModuleIds));
  const currentSelectionSig = selectionSignature(liveModuleIds);
  if (currentSelectionSig !== seededForSelectionSig) {
    setSeededForSelectionSig(currentSelectionSig);
    if (sourceModuleId === null || !liveModuleIds.has(sourceModuleId)) {
      setSourceModuleIdState(defaultSourceId);
    }
  }
  const setSourceModuleId = (id: number) => setSourceModuleIdState(id);

  // D21: the template read is armed at `${courseUrl}::${sourceModuleId}` -
  // never at the target selection or authored patterns, which live in their
  // own state below and are untouched by a re-arm.
  const [rawTemplate, setRawTemplate] = useState<ModuleTemplate | null>(null);
  const [templateArmedFor, setTemplateArmedFor] = useState<string | null>(null);
  const [deadlineContext, setDeadlineContext] = useState<{ startDate: string | null; assignmentDueRule: string | null }>({
    startDate: null,
    assignmentDueRule: null,
  });
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [manualExcluded, setManualExcluded] = useState<Set<number>>(new Set());
  const [authoredPatterns, setAuthoredPatterns] = useState<Record<number, string>>({});
  const [applyBusy, setApplyBusy] = useState(false);

  const templateSig = sourceModuleId != null ? `${courseUrl}::${sourceModuleId}` : null;
  const template = templateSig && isConfirmArmed(templateArmedFor, templateSig) ? rawTemplate : null;

  const onReviewCarryPattern = () => {
    const refusal = carryLiveSelectionRefusalReason(totalSelectedModuleCount, liveModuleIds.size);
    if (refusal) {
      setNote({ kind: "error", text: refusal });
      return;
    }
    if (sourceModuleId == null) {
      setNote({ kind: "error", text: "Choose a module to use as the template first." });
      return;
    }
    const sig = `${courseUrl}::${sourceModuleId}`;
    if (isConfirmArmed(templateArmedFor, sig) && rawTemplate) {
      setReviewOpen(true);
      return;
    }

    void (async () => {
      setReviewBusy(true);
      setNote(null);
      const [templateResult, deadlineResult] = await Promise.all([
        readModuleTemplateAction(courseUrl, sourceModuleId, acronym),
        readCourseDeadlineContextAction(courseUrl, exportCourseId, acronym),
      ]);
      setReviewBusy(false);

      if ("error" in templateResult) {
        setNote({ kind: "error", text: templateResult.error });
        return;
      }
      setRawTemplate(templateResult.template);
      setTemplateArmedFor(sig);
      // D13: a deadline-context failure never blocks the review - it simply
      // means every item's due date falls through to "no due date" (the
      // plan's own null handling), the same non-fatal posture
      // useCurrentEventsAssignments already takes for the identical read.
      setDeadlineContext("error" in deadlineResult ? { startDate: null, assignmentDueRule: null } : deadlineResult);
      setManualExcluded(new Set());
      setAuthoredPatterns({});
      setReviewOpen(true);
    })();
  };

  const closeReview = () => setReviewOpen(false);

  const onToggleExcludedItem = (itemId: number) => {
    setManualExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const onAuthoredPatternChange = (itemId: number, text: string) => {
    setAuthoredPatterns((prev) => ({ ...prev, [itemId]: text }));
  };

  // COORDINATOR CORRECTION: a Discussion this reader could not clear of a
  // checkpoint split is excluded from the plan altogether (never a
  // "create" row that the apply action would later refuse on its own) and
  // shown separately, before apply runs - see this file's header comment.
  const checkpointRefusedItems = useMemo(
    () => (template ? template.items.filter((it) => it.type === "Discussion" && it.checkpointsUnknown) : []),
    [template]
  );

  const excludedItemIds = useMemo(() => {
    const combined = new Set(manualExcluded);
    for (const item of checkpointRefusedItems) combined.add(item.id);
    return combined;
  }, [manualExcluded, checkpointRefusedItems]);

  // D16: every live selected module is a target candidate, the source
  // included - buildModulePatternPlan's own excludedSourceTargetId guard is
  // what drops it, not this list.
  const targets: ModulePatternPlanTargetInput[] = useMemo(() => {
    if (!template) return [];
    return Array.from(liveModuleIds).map((id) => {
      const mod = modules.find((m) => m.id === id);
      return {
        id,
        name: mod?.name ?? String(id),
        existingItems: (mod?.items ?? []).map((it) => ({ id: it.id, title: it.title })),
      };
    });
  }, [template, liveModuleIds, modules]);

  // D21: derived, not stored - a target-selection or authored-pattern
  // change recomputes this without touching `rawTemplate`/`templateArmedFor`.
  const plan: ModulePatternPlan | null = useMemo(() => {
    if (!template) return null;
    return buildModulePatternPlan({
      source: template,
      targets,
      courseStartDate: deadlineContext.startDate,
      assignmentDueRule: deadlineContext.assignmentDueRule,
      // COORDINATOR CORRECTION: always "skip" - see this file's header.
      onExisting: "skip",
      authoredPatterns,
      excludedItemIds: Array.from(excludedItemIds),
    });
  }, [template, targets, deadlineContext, authoredPatterns, excludedItemIds]);

  // F3: checkpoint-refused items are already rendered, with their real
  // reason and no interactive affordance, in the modal's own dedicated
  // "Refused (not included)" list (`checkpointRefusedItems` above) - passing
  // their ids here keeps `buildCarryReviewRows` from ALSO emitting a generic
  // excluded row for them, which is what produced the double-listing (once
  // Refused, once "Excluded... check the box above") with an inert checkbox,
  // since checking that box could only ever touch `manualExcluded` and
  // `checkpointRefusedItems` puts the id right back into `excludedItemIds`
  // regardless. A row now only ever renders here for a MANUAL exclusion,
  // whose checkbox genuinely round-trips.
  const checkpointRefusedIds = useMemo(() => new Set(checkpointRefusedItems.map((it) => it.id)), [checkpointRefusedItems]);
  const reviewRows = useMemo(() => (plan ? buildCarryReviewRows(plan, checkpointRefusedIds) : []), [plan, checkpointRefusedIds]);

  // C8: see `isCarryReviewVisible`'s own doc comment above.
  const reviewVisible = isCarryReviewVisible(reviewOpen, template, plan);

  const onApply = () => {
    if (!template || !plan) return;
    // AC7's idempotency pre-check, applied here too: nothing to create means
    // nothing worth a round trip.
    if (plan.totals.create === 0) {
      setNote({ kind: "success", text: "Nothing to create - every eligible item already exists in its target module, or is blocked." });
      setReviewOpen(false);
      return;
    }

    void (async () => {
      setApplyBusy(true);
      setBusy(true);
      setNote(null);
      const result = await applyModulePatternCarryAction(courseUrl, template, plan, provider, exportCourseId, acronym);
      setApplyBusy(false);
      setBusy(false);

      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      setNote(describeCarryApplyOutcome(result.outcomes));
      setReviewOpen(false);
      reload();
    })();
  };

  return {
    templateOptions,
    sourceModuleId,
    setSourceModuleId,
    reviewBusy,
    onReviewCarryPattern,
    reviewOpen,
    reviewVisible,
    closeReview,
    template,
    plan,
    reviewRows,
    checkpointRefusedItems,
    excludedItemIds,
    onToggleExcludedItem,
    authoredPatterns,
    onAuthoredPatternChange,
    applyBusy,
    onApply,
  };
}
