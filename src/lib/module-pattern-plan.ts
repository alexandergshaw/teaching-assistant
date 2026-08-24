// Module-pattern-plan - the PURE composition of wave 1's three primitives
// into the actual deliverable of chunk D
// (docs/carry-module-pattern-forward-acceptance-criteria.md - section 5 is
// the FINAL CONTRACT; this file's brief is AC5, AC6, AC8, D3b, D4, D4b, D13).
//
// Given one source template (module-template.ts's ModuleTemplate) and a list
// of target modules, this file decides, per target module, per item, ONE of
// four outcomes:
//
//   "create"              - no matching item exists in the target; write it.
//   "skip"                - a matching item already exists and the instructor
//                            chose "skip" for that case (AC5's idempotency).
//   "overwrite"            - a matching item already exists and the instructor
//                            chose "overwrite" for that case (AC1's tier
//                            escalates to `destructive` whenever this is on
//                            offer).
//   "blocked-unnumbered"  - the item cannot be resolved to a title at all
//                            (D4), so it is never written and costs no model
//                            call.
//
// Nothing here calls Canvas, reads a clock, or renders anything - it composes
// module-pattern-inference.ts (the title), module-pattern-transpose.ts (the
// due date) and module-template.ts's read shape (the source data) into one
// deterministic decision table. No Date.now(), no `new Date()` with no
// argument - every date this file touches is a caller-supplied ISO string,
// handed straight to transposeModuleItemDueDate, which owns the actual
// decomposition/recomposition (see that file's own header for why that must
// happen in the browser).
//
// AC8 (titles are the idempotency key): every resolvedTitle below comes from
// renderItemPattern or is null (blocked) - never from a model, and never
// invented by this file. The match that turns a resolved title into
// skip/overwrite is case- and trim-insensitive, matching
// planBulkModuleCreation's own rule (bulk-module-plan.ts:178,187) EXACTLY:
// `name.trim().toLowerCase()`. That function does not export a standalone
// comparison helper to import - it builds `byNormalizedName` inline - so this
// file re-states the same one-line rule as `normalizeTitleForMatch` below,
// and module-pattern-plan.test.ts pins that the two implementations agree
// (entry 330's Limits recorded that chunk B duplicated this rule inline with
// no such pin; this file does not repeat that gap).
//
// SOURCE-EXCLUSION IS STRUCTURAL, NOT A UI FILTER. A module carrying its own
// pattern onto itself, with overwrite live, would regenerate over its own
// items - and Canvas has no undo. This file DROPS a target whose id equals
// the source's id (`excludedSourceTargetId` records that this happened, so a
// caller can surface it rather than silently losing a row), rather than
// rejecting the whole plan. The other N-1 targets the instructor legitimately
// selected are worth planning; failing all of them because one of the N was a
// mistake is a worse outcome for the instructor than dropping the one bad row
// and saying so.
//
// THE OUTCOME VOCABULARY IS DELIBERATELY NOT ModuleContentResult (AC6 / entry
// 330 check 11). ModuleContentResult (moduleContentActions.ts) and
// describeOrphans (useBulkModuleActions.ts) were read as directed. They
// describe what ACTUALLY HAPPENED after Canvas was called - success, failed,
// or "created but not linked". This file produces a PROPOSAL: a
// recommendation for what to do, before Canvas has been touched at all. There
// is no "orphaned" concept here because nothing has been created yet, and
// collapsing "what we recommend" and "what happened when we tried" into one
// union would hide exactly the distinction AC6 asks to preserve elsewhere -
// "the model returned nothing" and "Canvas rejected it" are both
// apply-time facts this file cannot have yet. A future apply step that
// EXECUTES this plan's create/overwrite rows is the place that should
// produce ModuleContentResult values per item and reuse describeOrphans for
// its own reporting - not this one. What this file DOES reuse from that pair
// is the underlying discipline: per-object failure is per-object, continued
// past rather than aborting the whole run. `sourceReadFailures` below carries
// exactly that principle for the one failure class visible before Canvas has
// been called at all - an item module-template.ts's reader could not read.
//
// D4 / D4b: an item whose inferred (or instructor-authored) pattern has zero
// tokens is never carried - "blocked-unnumbered" is a first-class decision,
// checked on titles alone, before any due-date work or model spend. D4's one
// affordance - an instructor-typed `{n}` pattern that unblocks a row - is
// `authoredPatterns` below: pass the item id and the typed text, and this
// file tries parseAuthoredItemPattern for that item INSTEAD of inferItemPattern.
//
// D3b: the false positive is not this file's problem to fix (see
// module-pattern-inference.ts's own header) - it is mitigated by making the
// resolved title visible next to the source title in every row this file
// emits (`sourceTitle` and `resolvedTitle` sit side by side on
// ModulePatternPlanItem), so a human skimming the proposal can catch
// "Chapter 12 Discussion" turning into "Chapter 03 Discussion" before
// anything is written.
//
// D13: an item with no `dueAt` is not blocked - transposeModuleItemDueDate's
// "course-due-rule" fallback handles that already; this file passes every
// item's `dueAt` (null or not) straight through and never blocks on a missing
// due date. The one thing this file adds on top of D13's own null handling:
// if the TARGET module's own name carries no extractable number, the item's
// TITLE cannot be rendered at all (there is nothing to substitute for `{n}`),
// which is a stronger failure than a missing due date - so that case blocks
// the whole item ("target-module-unnumbered") rather than falling through to
// "no-due-date", because there would be no title to create in the first
// place.
//
// FIXER-A CORRECTIONS (chunk D step 10, sections 5+6 of the AC - section 6
// wins):
//
// C1 (the exclude checkbox was a one-way trapdoor). `usableSourceItems` used
// to be `input.source.items.filter(i => !excludedItemIds.has(i.id))` -
// dropping an excluded item before ANY row was built for it in ANY target.
// Since the review modal's rows come from iterating `targets[].items`, an
// excluded item produced no row anywhere, so its own checkbox vanished from
// the DOM along with it - nothing left to click to bring it back. Fix,
// argued: exclusion is now a SEPARATE roster (`excludedItems` below, plus
// `sourceItemOrder` to keep the combined display in source order) rather
// than a fifth value folded into `ModulePatternItemDecision`, because
// `applyModulePatternCarryAction` (carry-module-pattern.ts, owned by a
// sibling fixer this brief forbids touching) treats every decision that is
// not "skip"/"blocked-unnumbered"/"overwrite" as a live "create" to write -
// a fifth decision value reaching `targets[].items` would get written
// despite being excluded. Keeping `targets[].items` exactly as before (an
// excluded item still never appears there, so apply's behavior for included
// items is byte-for-byte unchanged) while adding `excludedItems` purely for
// the review UI to bind a checkbox to is what makes the exclude/re-include
// round trip provably safe rather than merely convenient.
//
// C2 (the review over-promised on unwritable kinds). `decision` used to
// assign "create" to any item with a resolvable title, regardless of kind -
// so a template holding an ExternalUrl or ExternalTool link (or a File with
// no `contentId`) reviewed as "N to create" and applied as "N-2 created, 2
// unsupported". `isCarryWriteSupportedKind` below states, per item, whether
// ANY write path this app has wired can create it at all - exported so the
// sibling who owns carry-module-pattern.ts's apply action can import the
// same predicate instead of maintaining its own `isGeneratableKind` /
// passthrough check as an independently-drifting twin. Every
// `ModulePatternPlanItem` now carries `writeSupported`; a "create" decision
// whose kind cannot be written bumps `counts.unsupported` instead of
// `counts.create`, so "to create" in the proposal counts only what the
// apply action can actually produce.

import { extractModuleNumber } from "./workflows/module-value";
import {
  inferItemPattern,
  parseAuthoredItemPattern,
  renderItemPattern,
  type BlockedReasonCode,
  type RenderableItemPattern,
} from "./module-pattern-inference";
import { transposeModuleItemDueDate, type ModulePatternDueDateOutcome } from "./module-pattern-transpose";
import type { ModuleTemplate, TemplateItemFailure, NotCarriedField } from "@/app/actions/module-template";

/** One target module's existing items, as far as this planner needs them:
 * just enough to run AC8's by-title idempotency check and to name the
 * matched item for an "overwrite" row. Nothing else about a target module's
 * existing content is read here. */
export interface ModulePatternPlanTargetInput {
  id: number;
  name: string;
  existingItems: Array<{ id: number; title: string }>;
}

/**
 * `onExisting` decides what a by-title match resolves to - AC5's "SKIP" and
 * "OVERWRITE" are both real outcomes of the SAME match, distinguished by
 * which one the instructor asked for (AC1: the apply tier escalates to
 * `destructive` only when "overwrite" is actually on offer, so this is a
 * caller-supplied choice, not something this file defaults on its own).
 *
 * `authoredPatterns` is D4's affordance: an item id mapped to instructor-typed
 * pattern text (must contain `{n}`), tried via `parseAuthoredItemPattern`
 * INSTEAD of `inferItemPattern` for that one item id, so a blocked row can be
 * unblocked without touching any other item's inference.
 */
export interface ModulePatternPlanInput {
  source: ModuleTemplate;
  targets: ModulePatternPlanTargetInput[];
  /** Raw "YYYY-MM-DD" course column value - never a Date. Parsed only inside
   * transposeModuleItemDueDate, matching that file's own ownership of the
   * one parse-then-compute step. */
  courseStartDate: string | null;
  /** Raw "sun|23:59" course column value - never a parsed AssignmentDueRule. */
  assignmentDueRule: string | null;
  onExisting: "skip" | "overwrite";
  authoredPatterns?: Record<number, string>;
  /** D3b's mitigation, made real: an instructor can deselect a source item
   * after seeing it collide (e.g. "Chapter 12 Discussion" -> "Chapter 03
   * Discussion"). Structural, exactly like `excludedSourceTargetId` below -
   * an excluded item is dropped from EVERY target's item list before any
   * decision is computed for it, not merely hidden after the fact, so it
   * never occupies a create/skip/overwrite/blocked slot and never counts
   * toward any target's or the plan's totals. The collision is a property of
   * the item and is uniform across targets (D18), so one exclusion removes
   * it everywhere at once. */
  excludedItemIds?: number[];
}

/** The four decisions this file ever produces (D4: blocked is a first-class
 * member of this set, not the absence of one of the other three). */
export type ModulePatternItemDecision = "create" | "skip" | "overwrite" | "blocked-unnumbered";

/** module-pattern-inference.ts's three reasons, plus one this file adds of
 * its own: the TARGET module (not the source) carries no extractable number,
 * so there is nothing to substitute for `{n}` in an otherwise-valid pattern.
 * See this file's header for why that is a block rather than a fall-through
 * to "no due date". */
export type ModulePatternPlanBlockReasonCode = BlockedReasonCode | "target-module-unnumbered";

/** One item, resolved for one target module. `sourceTitle` and
 * `resolvedTitle` are both always present on a non-blocked row (D3b: side by
 * side, so a false-positive collision is visible on sight). `notCarried` and
 * `checkpointsUnknown` are plain passthrough from module-template.ts's own
 * per-kind disclosure (D7/D9) - this file makes no new decision about them,
 * it only carries them to the same row the title/date decisions live on so a
 * caller does not have to zip two lists back together. */
export interface ModulePatternPlanItem {
  itemId: number;
  itemType: string;
  sourceTitle: string;
  decision: ModulePatternItemDecision;
  /** The re-renderable pattern text itself (e.g. "Week {n} Homework"),
   * straight off `RenderableItemPattern.template` (module-pattern-inference.ts)
   * - not derived or reformatted here. D18: this is the fastest
   * false-positive signal there is, because it shows what got tokenised
   * ("Chapter {n} Discussion" says the chapter number was mistaken for the
   * module number in a way the resolved title alone does not), and the
   * builder was computing this and discarding it before this field existed.
   * Null iff `decision` is "blocked-unnumbered" - there is no pattern to
   * show, inferred or authored, when nothing rendered. */
  patternTemplate: string | null;
  /** Null iff `decision` is "blocked-unnumbered" - there is nothing to render. */
  resolvedTitle: string | null;
  /** Null iff blocked, or iff the outcome is "no-due-date". */
  dueAtIso: string | null;
  /** Null iff `decision` is "blocked-unnumbered". */
  dueDateOutcome: ModulePatternDueDateOutcome | null;
  /** The target's existing item id this row matched by title - set iff
   * `decision` is "skip" or "overwrite", null otherwise. */
  matchedExistingId: number | null;
  blockedReasonCode: ModulePatternPlanBlockReasonCode | null;
  /** Prose for display only, exactly as module-pattern-inference.ts's own
   * `message` field documents - branch callers on `blockedReasonCode`, never
   * on this string. */
  blockedMessage: string | null;
  notCarried: NotCarriedField[];
  checkpointsUnknown: boolean;
  /** C2: whether ANY write path this app has wired can create this item's
   * KIND at all - `isCarryWriteSupportedKind(itemType, contentId)`, computed
   * once per item and constant across every target (it depends only on the
   * source item, never on the target). A "create" decision with
   * `writeSupported: false` is counted into `counts.unsupported`, not
   * `counts.create` - see this file's header. Independent of `decision`:
   * still meaningful (though inert) on a "skip"/"overwrite"/"blocked"
   * row, so a caller never has to guess it from the decision alone. */
  writeSupported: boolean;
}

/** Per-decision counts for one target module - AC5/D4's "so the instructor
 * sees at a glance how much carries", scoped to one target. `unsupported`
 * (C2) is carved out of what would otherwise be counted as `create`: a
 * "create" decision whose item kind cannot be written by any wired path
 * (`writeSupported: false`) lands here instead, so `create` only ever
 * counts what the apply action can actually produce. */
export interface ModulePatternPlanCounts {
  create: number;
  skip: number;
  overwrite: number;
  blocked: number;
  unsupported: number;
}

/** C1: one source item the instructor has excluded from this carry-forward,
 * kept OUTSIDE `targets[].items` entirely (see this file's header for why -
 * the apply action treats every non-skip/blocked/overwrite decision as a
 * live "create") so a review UI has something stable to bind an exclude
 * checkbox to even though no decision was ever computed for it. Identity
 * only - no decision, no resolved title, no counts, because none was
 * computed; re-including the item (removing it from the caller's
 * `excludedItemIds`) and rebuilding the plan is what restores its real row
 * in `targets[].items`, with its counts recomputed fresh. */
export interface ExcludedPlanItem {
  itemId: number;
  itemType: string;
  sourceTitle: string;
}

export interface ModulePatternPlanTargetResult {
  targetModuleId: number;
  targetModuleName: string;
  /** `extractModuleNumber(targetModuleName)` - null means this target's own
   * name carries no recognizable number, which blocks every item that needed
   * one substituted (see `ModulePatternPlanBlockReasonCode`). Exposed here so
   * a caller can render ONE explanation for the whole target instead of
   * repeating an identical per-item message N times (the same aggregation
   * D4b describes for the source-unnumbered case, available to the caller
   * for free from this one field rather than this file inventing a second,
   * possibly-inconsistent "whole target blocked" flag alongside it). */
  targetWeek: number | null;
  items: ModulePatternPlanItem[];
  counts: ModulePatternPlanCounts;
}

export interface ModulePatternPlan {
  sourceModuleId: number;
  sourceModuleName: string;
  /** `extractModuleNumber(sourceModuleName)` - null means the SOURCE module's
   * own name carries no recognizable number, which blocks every non-excluded
   * item in every target with `blockedReasonCode: "source-module-unnumbered"`
   * (module-pattern-inference.ts). D4b: that per-item reason is identical for
   * every item and every target when this is null, so a caller renders ONE
   * message from this field instead of the same explanation once per row -
   * exactly the aggregation `targetWeek` already gives per target, mirrored
   * here at the source. */
  sourceWeek: number | null;
  targets: ModulePatternPlanTargetResult[];
  totals: ModulePatternPlanCounts;
  /** Set when `input.targets` named the source module itself - dropped
   * before planning (see this file's header). Null when no such target was
   * requested. */
  excludedSourceTargetId: number | null;
  /** Passthrough of `source.failures` (module-template.ts) - items this
   * planner never received data for at all, so they cannot appear as a
   * decision row for any target. Surfaced once, at the source level, rather
   * than duplicated identically into every target's item list. */
  sourceReadFailures: TemplateItemFailure[];
  /** C1: every source item currently excluded (identity only - see
   * `ExcludedPlanItem`), in source order. Never overlaps with any
   * `targets[].items` entry - an item is in exactly one of the two places. */
  excludedItems: ExcludedPlanItem[];
  /** C1: every item id from `source.items`, in that array's own order -
   * included AND excluded alike. A caller merging `targets[].items` (for
   * included items) with `excludedItems` (for excluded ones) into one
   * checkbox list uses this to render them in the template's own item order
   * rather than "included items first, excluded items appended after". */
  sourceItemOrder: number[];
}

/** planBulkModuleCreation's own match rule (bulk-module-plan.ts:178,187),
 * restated here because that function has no standalone export of it to
 * import - see this file's header and module-pattern-plan.test.ts's pinned
 * agreement test. */
function normalizeTitleForMatch(title: string): string {
  return title.trim().toLowerCase();
}

/** C2: the exact kinds `applyModulePatternCarryAction` (carry-module-
 * pattern.ts) can actually write, restated as a pure predicate and exported
 * so that file imports THIS instead of maintaining its own
 * `isGeneratableKind` / passthrough check as a second, driftable copy.
 * Mirrors that file's write-path fan-out exactly: Page/Assignment/Quiz/
 * Discussion go through generation, SubHeader and a File that already has a
 * `contentId` go through passthrough, and everything else - ExternalUrl,
 * ExternalTool, and a File with no `contentId` - has no write path wired at
 * all. */
export function isCarryWriteSupportedKind(itemType: string, contentId: number | null): boolean {
  if (itemType === "ExternalUrl" || itemType === "ExternalTool") return false;
  if (itemType === "File") return contentId != null;
  return true;
}

const emptyCounts = (): ModulePatternPlanCounts => ({ create: 0, skip: 0, overwrite: 0, blocked: 0, unsupported: 0 });

function addCounts(a: ModulePatternPlanCounts, b: ModulePatternPlanCounts): ModulePatternPlanCounts {
  return {
    create: a.create + b.create,
    skip: a.skip + b.skip,
    overwrite: a.overwrite + b.overwrite,
    blocked: a.blocked + b.blocked,
    unsupported: a.unsupported + b.unsupported,
  };
}

/** C2: a "create" decision whose kind cannot be written bumps `unsupported`
 * instead of `create`, so the proposal's "N to create" only ever counts what
 * the apply action can actually produce. Every other decision counts exactly
 * as before - `writeSupported` is irrelevant to skip/overwrite/blocked
 * because none of those write anything regardless of kind. */
function bumpCount(counts: ModulePatternPlanCounts, decision: ModulePatternItemDecision, writeSupported: boolean): void {
  switch (decision) {
    case "blocked-unnumbered":
      counts.blocked += 1;
      return;
    case "create":
      if (writeSupported) counts.create += 1;
      else counts.unsupported += 1;
      return;
    case "skip":
      counts.skip += 1;
      return;
    case "overwrite":
      counts.overwrite += 1;
      return;
  }
}

/**
 * Build the full carry-forward plan: one source template, N target modules,
 * one decision per item per target. See this file's header for the
 * source-exclusion rule, the outcome vocabulary's deliberate distinctness
 * from ModuleContentResult, and D13's null-due-date handling.
 */
export function buildModulePatternPlan(input: ModulePatternPlanInput): ModulePatternPlan {
  const excluded = input.targets.find((t) => t.id === input.source.moduleId);
  const usableTargets = input.targets.filter((t) => t.id !== input.source.moduleId);
  const excludedItemIds = new Set(input.excludedItemIds ?? []);
  const usableSourceItems = input.source.items.filter((item) => !excludedItemIds.has(item.id));
  // C1: identity-only roster for every excluded item, kept OUTSIDE
  // `targets[].items` (see this file's header) - never a decision row a
  // caller could hand to the apply action.
  const excludedItems: ExcludedPlanItem[] = input.source.items
    .filter((item) => excludedItemIds.has(item.id))
    .map((item) => ({ itemId: item.id, itemType: item.type, sourceTitle: item.title }));

  const targets: ModulePatternPlanTargetResult[] = usableTargets.map((target) => {
    const targetWeek = extractModuleNumber(target.name);
    const existingByNormalized = new Map<string, { id: number; title: string }>();
    for (const existing of target.existingItems) {
      existingByNormalized.set(normalizeTitleForMatch(existing.title), existing);
    }

    const counts = emptyCounts();
    const items: ModulePatternPlanItem[] = usableSourceItems.map((item) => {
      const authored = input.authoredPatterns?.[item.id];
      const patternResult = authored !== undefined ? parseAuthoredItemPattern(authored) : inferItemPattern(input.source.moduleName, item.title);

      const writeSupported = isCarryWriteSupportedKind(item.type, item.contentId);
      const base = {
        itemId: item.id,
        itemType: item.type,
        sourceTitle: item.title,
        notCarried: item.notCarried,
        checkpointsUnknown: item.checkpointsUnknown,
        writeSupported,
      };

      if (patternResult.kind === "blocked") {
        const blocked: ModulePatternPlanItem = {
          ...base,
          decision: "blocked-unnumbered",
          patternTemplate: null,
          resolvedTitle: null,
          dueAtIso: null,
          dueDateOutcome: null,
          matchedExistingId: null,
          blockedReasonCode: patternResult.reasonCode,
          blockedMessage: patternResult.message,
        };
        bumpCount(counts, blocked.decision, blocked.writeSupported);
        return blocked;
      }

      if (targetWeek === null) {
        const blocked: ModulePatternPlanItem = {
          ...base,
          decision: "blocked-unnumbered",
          patternTemplate: null,
          resolvedTitle: null,
          dueAtIso: null,
          dueDateOutcome: null,
          matchedExistingId: null,
          blockedReasonCode: "target-module-unnumbered",
          blockedMessage: `The target module's name ("${target.name}") carries no recognizable module or week number, so "${item.title}" cannot be resolved for it.`,
        };
        bumpCount(counts, blocked.decision, blocked.writeSupported);
        return blocked;
      }

      const pattern: RenderableItemPattern = patternResult;
      const resolvedTitle = renderItemPattern(pattern, targetWeek);
      const due = transposeModuleItemDueDate({
        sourceDueAtIso: item.dueAt,
        startDate: input.courseStartDate,
        assignmentDueRule: input.assignmentDueRule,
        targetWeek,
      });

      const matched = existingByNormalized.get(normalizeTitleForMatch(resolvedTitle));
      const decision: ModulePatternItemDecision = matched ? input.onExisting : "create";

      const resolved: ModulePatternPlanItem = {
        ...base,
        decision,
        patternTemplate: pattern.template,
        resolvedTitle,
        dueAtIso: due.dueAtIso,
        dueDateOutcome: due.outcome,
        matchedExistingId: matched ? matched.id : null,
        blockedReasonCode: null,
        blockedMessage: null,
      };
      bumpCount(counts, resolved.decision, resolved.writeSupported);
      return resolved;
    });

    return {
      targetModuleId: target.id,
      targetModuleName: target.name,
      targetWeek,
      items,
      counts,
    };
  });

  const totals = targets.reduce((acc, t) => addCounts(acc, t.counts), emptyCounts());

  return {
    sourceModuleId: input.source.moduleId,
    sourceModuleName: input.source.moduleName,
    sourceWeek: extractModuleNumber(input.source.moduleName),
    targets,
    totals,
    excludedSourceTargetId: excluded ? excluded.id : null,
    sourceReadFailures: input.source.failures,
    excludedItems,
    sourceItemOrder: input.source.items.map((item) => item.id),
  };
}
