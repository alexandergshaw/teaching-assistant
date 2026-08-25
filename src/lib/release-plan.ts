// The review plan for scheduled publishing from Modules.
// (docs/scheduled-publishing-from-modules-acceptance-criteria.md - "Post-
// design corrections" section is the FINAL CONTRACT; this file's brief is
// F10's target expansion, F4's per-target hide-state review, and the
// draft/review/commit staleness guard the rest of this app's comparable
// controls already use - entries 331 and 337.)
//
// PURE: no React, no I/O, no clock read internally. Every function that cares
// about "now" takes it as a parameter (mirrors isReleaseDue/isClaimStale in
// scheduled-releases.ts, and classifyCronHeartbeat/computeNextRunAt before
// that) so tests pin exact boundaries instead of racing the real clock.
// vitest here is node-env and collects only src/**/*.test.ts, so anything not
// in a pure module like this one is untestable forever - see that file's own
// header for the same note.
//
// -------------------------------------------------------------------------
// F10 - TARGETS ARE BOTH LEVELS, NOT ONE.
// -------------------------------------------------------------------------
// The repo owner's decision (F10): a release targets BOTH a selected module
// AND every item it holds, because that is the only target set that is
// correct regardless of which way F9's still-unrun experiment eventually
// answers ("does an item published inside an unpublished module actually
// become visible to students"). `buildReleaseTargets` below is that
// expansion. A selected item that is ALSO held by a selected module must
// still be exactly ONE target - `dedupeReleaseTargets` is the one place that
// invariant is enforced, deliberately kept separate from the traversal that
// builds candidates (see that function's own comment for why the separation
// itself is what makes the invariant testable and sabotage-able).
//
// -------------------------------------------------------------------------
// F4 - HIDE-STATE IS A REVIEW STEP, NOT A SILENT COMMIT-TIME SURPRISE.
// -------------------------------------------------------------------------
// F4 decided that Canvas's refusal to unpublish a quiz with student
// submissions (`can_unpublish?` false, exposed to this app as Canvas's own
// `unpublishable` field on quizzes/assignments) is surfaced BEFORE the
// instructor commits, in a review step that lists per target whether it can
// be hidden - never a silent success, never a post-hoc warning. Per this
// repo's standing lesson (the cron-heartbeat and workflow-schedule guards
// both learned this the hard way): a guard that cannot verify a fact must
// NOT silently claim the safe answer. `classifyReleaseHideState` therefore
// has a real fourth outcome, "unknown", for "the caller could not read
// enough to say" - it is never folded into "hideable", and the tests below
// pin that as its own case rather than trusting the switch never to grow
// that bug.
//
// This module classifies hide-state OVER FACTS a caller has already read
// (`ReleaseHideFacts`) - it never calls Canvas and never guesses a fact it
// was not given.
//
// -------------------------------------------------------------------------
// STALENESS - REUSES selectionSignature, NOT A NEW IDEA.
// -------------------------------------------------------------------------
// `command-proposal.ts`'s G14 already solved "a plan keyed to specific
// object ids must not be silently applied against a selection that has since
// changed" for the LLM command interface, by pinning a `selectionSignature`
// (confirmArming.ts) at build time and reconciling against it at apply time.
// That file already imports `selectionSignature` from a component-tree path
// (`@/app/components/content-tab/modules/confirmArming`) into a `src/lib`
// module, so doing the same here is a confirmed-importable pattern, not a
// new one. `buildReleasePlan` / `reconcileReleasePlanWithSelection` below are
// that same pairing, restated for `ReleasePlanRow` - simpler than G14's
// version because every `ReleasePlanRow` always carries a real target (no
// "create module" style target-less row exists in this feature).
//
// -------------------------------------------------------------------------
// TIMEZONE - NO LOCAL WALL-CLOCK DATES, ANYWHERE IN THIS FILE.
// -------------------------------------------------------------------------
// Entry 330 recorded the defect this rule exists to prevent: a wall-clock
// `Date` built with `setHours` and then serialized with `.toISOString()`
// encodes the CALLING PROCESS's offset, not the instructor's - and Vercel
// runs UTC, so a server-side computation silently shipped every "11:59 PM"
// four to eight hours early. The fix there was structural, not vigilance:
// the one `.toISOString()` call lives in a client-only pure leaf, and the
// server/lib side only ever carries the already-absolute result through.
// This file follows the same discipline in the other direction:
// `validateReleaseInstant` below NEVER constructs a `Date` from separate
// year/month/day/hour fields and never calls `.toISOString()` on anything -
// it only parses an ALREADY-ABSOLUTE ISO 8601 instant (the UTC timestamp
// AC4 requires the browser to have computed) via `Date.parse`, and compares
// it against a `now` the caller supplies. Neither operation depends on the
// process's local timezone.

import { selectionSignature } from "@/app/components/content-tab/modules/confirmArming";

// ---------------------------------------------------------------------------
// Pinned shapes - two sibling agents (the actions/migration layer and the
// bulk-bar catalog) code directly against these. Do not rename or reshape
// without updating both.

export type ReleaseTargetKind = "module" | "module_item";

export interface ReleaseTargetRef {
  kind: ReleaseTargetKind;
  id: number;
  /** Owning module for an item; null for a module target. */
  moduleId: number | null;
  displayName: string;
  selectionKey: string;
}

export type ReleaseHideState = "hideable" | "already-hidden" | "refused" | "unknown";

export interface ReleasePlanRow {
  target: ReleaseTargetRef;
  hideState: ReleaseHideState;
  reason: string | null;
}

// ---------------------------------------------------------------------------
// F10 - target expansion.

/** One item as it appears in the loaded module tree - just enough to build a
 * target from and to resolve dedupe/ordering against. */
export interface ReleasePlanItemNode {
  id: number;
  moduleId: number;
  title: string;
  selectionKey: string;
}

/** One module as it appears in the loaded module tree, items included -
 * deliberately a narrow local shape rather than importing `CanvasModule`
 * directly, so this pure module's public surface does not widen every time
 * that Canvas-shaped type grows a field this feature never reads. */
export interface ReleasePlanModuleNode {
  id: number;
  name: string;
  selectionKey: string;
  items: ReleasePlanItemNode[];
}

function moduleTarget(moduleNode: ReleasePlanModuleNode): ReleaseTargetRef {
  return { kind: "module", id: moduleNode.id, moduleId: null, displayName: moduleNode.name, selectionKey: moduleNode.selectionKey };
}

function itemTarget(itemNode: ReleasePlanItemNode): ReleaseTargetRef {
  return { kind: "module_item", id: itemNode.id, moduleId: itemNode.moduleId, displayName: itemNode.title, selectionKey: itemNode.selectionKey };
}

/**
 * Walk the module tree once, in tree order, and push a CANDIDATE target for
 * every reason a target might exist - a selected module contributes itself
 * plus every one of its items (F10), and a directly selected item
 * contributes itself again independently of whether its module was also
 * selected. The candidate list is ALLOWED to contain the same (kind, id)
 * twice - `dedupeReleaseTargets` is the only thing that collapses that back
 * down, and the two concerns are kept in separate functions on purpose: it
 * is what turns "delete the dedupe step" into a real, one-line sabotage a
 * test can catch, instead of an invariant baked unfalsifiably into a single
 * combined traversal.
 */
function collectReleaseTargetCandidates(
  selectedModuleIds: ReadonlySet<number>,
  selectedItemIds: ReadonlySet<number>,
  moduleTree: readonly ReleasePlanModuleNode[]
): ReleaseTargetRef[] {
  const candidates: ReleaseTargetRef[] = [];
  for (const moduleNode of moduleTree) {
    const moduleSelected = selectedModuleIds.has(moduleNode.id);
    if (moduleSelected) {
      candidates.push(moduleTarget(moduleNode));
    }
    for (const itemNode of moduleNode.items) {
      if (moduleSelected) {
        candidates.push(itemTarget(itemNode));
      }
      if (selectedItemIds.has(itemNode.id)) {
        candidates.push(itemTarget(itemNode));
      }
    }
  }
  return candidates;
}

/** Collapse a candidate list down to one target per (kind, id), keeping the
 * FIRST occurrence's fields - the first occurrence is always tree-ordered
 * ahead of any later duplicate, so keeping it also preserves ordering. */
function dedupeReleaseTargets(candidates: readonly ReleaseTargetRef[]): ReleaseTargetRef[] {
  const seen = new Set<string>();
  const deduped: ReleaseTargetRef[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.kind}:${candidate.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

/**
 * F10's expansion: a selected module contributes the module target AND one
 * target per item it holds; a selected item contributes itself. An item that
 * is both selected directly and held by a selected module is ONE target, not
 * two. The result is already in a stable, readable order for review - see
 * this function's own ordering note below - so no caller needs to re-sort
 * it.
 *
 * ORDERING, justified: modules appear before their own items, because that
 * is the same order the instructor already sees in the module tree itself,
 * and it groups each item's writes next to the module that explains why the
 * item is in the plan at all (either "this whole module was selected" or
 * "this item was selected directly" - both read naturally directly beneath
 * their owning module's row). Ties within a module preserve the module's own
 * item order (Canvas's `position` ordering, as loaded into `items`).
 */
export function buildReleaseTargets(
  selectedModuleIds: Iterable<number>,
  selectedItemIds: Iterable<number>,
  moduleTree: readonly ReleasePlanModuleNode[]
): ReleaseTargetRef[] {
  const moduleIdSet = new Set(selectedModuleIds);
  const itemIdSet = new Set(selectedItemIds);
  return dedupeReleaseTargets(collectReleaseTargetCandidates(moduleIdSet, itemIdSet, moduleTree));
}

// ---------------------------------------------------------------------------
// F4 - hide-state classification, over facts a caller has already read.

export interface ReleaseHideFacts {
  /** Whether Canvas currently reports this target as published, or null when
   * the caller could not read it (a failed fetch, an unresolved id, etc). */
  published: boolean | null;
  /** Canvas's own `unpublishable` flag (true only when Canvas will actually
   * accept the publish-state change - false for e.g. a classic quiz with
   * student submissions), or null when the caller never read it, or the
   * target's kind does not expose the concept at all (a module always
   * accepts an unpublish - a caller may simply pass `true` for a module
   * target without making a Canvas call to confirm it). */
  canUnpublish: boolean | null;
}

/**
 * The four hide-state outcomes, decided purely from facts the caller already
 * read:
 *   - `published` unknown -> "unknown" (we cannot even say whether hiding is
 *     necessary).
 *   - `published === false` -> "already-hidden" (nothing to do).
 *   - `published === true` and `canUnpublish` unknown -> "unknown" (per this
 *     repo's standing rule, a guard that cannot verify must not silently
 *     claim the safe "hideable" answer).
 *   - `published === true` and `canUnpublish === true` -> "hideable".
 *   - `published === true` and `canUnpublish === false` -> "refused".
 */
export function classifyReleaseHideState(facts: ReleaseHideFacts): ReleaseHideState {
  if (facts.published === null) return "unknown";
  if (facts.published === false) return "already-hidden";
  if (facts.canUnpublish === null) return "unknown";
  return facts.canUnpublish ? "hideable" : "refused";
}

/** Short, reviewable prose for a hide-state - never asserted on verbatim by
 * this file's own tests (a short distinctive substring only), per this
 * project's standing rule against over-specified source-text assertions. */
export function describeReleaseHideState(state: ReleaseHideState, target: ReleaseTargetRef): string | null {
  switch (state) {
    case "hideable":
      return null;
    case "already-hidden":
      return `${target.displayName} is already unpublished - nothing will change for it at commit time.`;
    case "refused":
      return `Canvas will not allow ${target.displayName} to be unpublished (this usually means it already has student submissions). The release will still be scheduled; this target will simply stay visible in the meantime.`;
    case "unknown":
      return `Could not determine whether ${target.displayName} can be hidden. Treat this one as needing a manual check before relying on the release to hide it.`;
  }
}

/** One target plus the facts a caller already read for it - the input shape
 * `buildReleasePlanRows` consumes. */
export interface ReleasePlanRowInput {
  target: ReleaseTargetRef;
  facts: ReleaseHideFacts;
}

/** Classify one target into its reviewable row. */
export function planReleaseRow(input: ReleasePlanRowInput): ReleasePlanRow {
  const hideState = classifyReleaseHideState(input.facts);
  return { target: input.target, hideState, reason: describeReleaseHideState(hideState, input.target) };
}

/** Classify every target into its reviewable row, preserving input order
 * (which, when fed `buildReleaseTargets`' own output, is the ordering that
 * function already justified). */
export function buildReleasePlanRows(inputs: readonly ReleasePlanRowInput[]): ReleasePlanRow[] {
  return inputs.map(planReleaseRow);
}

// ---------------------------------------------------------------------------
// Summary for the review modal's header.

export interface ReleasePlanSummary {
  total: number;
  hideable: number;
  alreadyHidden: number;
  refused: number;
  unknown: number;
}

/** Pure counts over a set of rows - no reason strings, no ordering
 * assumptions, safe to call on any subset (e.g. after a stale-selection
 * reconcile drops some rows). */
export function summarizeReleasePlan(rows: readonly ReleasePlanRow[]): ReleasePlanSummary {
  const summary: ReleasePlanSummary = { total: rows.length, hideable: 0, alreadyHidden: 0, refused: 0, unknown: 0 };
  for (const row of rows) {
    if (row.hideState === "hideable") summary.hideable += 1;
    else if (row.hideState === "already-hidden") summary.alreadyHidden += 1;
    else if (row.hideState === "refused") summary.refused += 1;
    else summary.unknown += 1;
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Staleness - a plan pinned to the selection it was built for, reconciled
// against the CURRENT selection before it may be committed. See this file's
// header for why this reuses `selectionSignature` rather than restating it.

export interface ReleasePlan {
  rows: ReleasePlanRow[];
  selectionSignature: string;
}

/** Pin `rows` to a signature of the selection they were built from. */
export function buildReleasePlan(rows: ReleasePlanRow[], currentSelectionKeys: Iterable<string | number>): ReleasePlan {
  return { rows, selectionSignature: selectionSignature(currentSelectionKeys) };
}

export interface ReleasePlanReconciliation {
  applicableRows: ReleasePlanRow[];
  droppedRows: ReleasePlanRow[];
  /** True iff `currentSelectionKeys`'s signature no longer matches the one
   * the plan was built against - informational: even when true,
   * `droppedRows` may still be empty (every row's target happened to remain
   * selected). */
  selectionChanged: boolean;
}

/**
 * Intersect a (possibly stale) plan against the CURRENT selection. A row
 * whose target is still present in `currentSelectionKeys` (by
 * `target.selectionKey`) is applicable; a row whose target dropped out of
 * the selection is reported dropped, never silently committed - mirroring
 * `reconcileCommandProposalWithSelection` (command-proposal.ts, G14), simpler
 * here because every `ReleasePlanRow` always carries a real target (unlike
 * that file's target-less "create module" rows).
 */
export function reconcileReleasePlanWithSelection(
  plan: ReleasePlan,
  currentSelectionKeys: Iterable<string | number>
): ReleasePlanReconciliation {
  const currentSignature = selectionSignature(currentSelectionKeys);
  if (currentSignature === plan.selectionSignature) {
    return { applicableRows: plan.rows, droppedRows: [], selectionChanged: false };
  }

  const currentKeys = new Set(Array.from(currentSelectionKeys, String));
  const applicableRows: ReleasePlanRow[] = [];
  const droppedRows: ReleasePlanRow[] = [];
  for (const row of plan.rows) {
    if (currentKeys.has(row.target.selectionKey)) {
      applicableRows.push(row);
    } else {
      droppedRows.push(row);
    }
  }
  return { applicableRows, droppedRows, selectionChanged: true };
}

// ---------------------------------------------------------------------------
// Release-time validation - no local wall-clock dates; see this file's header.

export interface ReleaseTimeValidation {
  valid: boolean;
  /** Non-null iff `valid` is false. */
  reason: string | null;
}

/**
 * Whether `releaseAtIso` (an already-absolute ISO 8601 instant, per AC4 -
 * this function never constructs one) is strictly in the future relative to
 * `now`. A release requested for EXACTLY `now` is refused, not accepted -
 * the deliberate mirror image of `isReleaseDue` in scheduled-releases.ts,
 * which treats a row due at exactly `now` as due (`<=`). Here the same
 * instant must fail validation (`<=` is invalid), because a schedule that is
 * already due the moment it is created has not scheduled anything - it
 * should simply be an immediate action instead, and silently accepting it
 * as "scheduled" would hide that from the instructor.
 */
export function validateReleaseInstant(releaseAtIso: string, now: Date): ReleaseTimeValidation {
  const releaseAt = Date.parse(releaseAtIso);
  if (Number.isNaN(releaseAt)) {
    return { valid: false, reason: "The release time could not be parsed." };
  }
  if (releaseAt <= now.getTime()) {
    return { valid: false, reason: "The release time must be in the future." };
  }
  return { valid: true, reason: null };
}
