"use client";

// The bulk-bar "Scheduled release" group -
// docs/scheduled-publishing-from-modules-acceptance-criteria.md, whose
// "Post-design corrections" section (F1-F10) is THE FINAL CONTRACT and F10
// is this chunk's own owning decision: releases target BOTH the selected
// modules and their items, and F4's Canvas-refusal-to-hide question is
// surfaced BEFORE the instructor commits, in a review step - never a silent
// commit-time surprise. Structural sibling of useCarryModulePattern.ts (read
// in full before this was written) and useCommandInterface.ts: same shape -
// build a draft from the current selection, let the instructor review it,
// commit on a second, explicit action - but the plan here is built entirely
// from src/lib/release-plan.ts's pure functions plus one server round trip
// (no LLM, no client-held module tree mutation), so this hook is closer in
// spirit to useCarryModulePattern.ts than to useCommandInterface.ts.
//
// THE SERVER CONTRACT THIS HOOK CODES AGAINST (owned by a sibling agent,
// src/app/actions/scheduled-releases.ts - it may not exist on disk yet at
// the moment this file is written; that is expected mid-wave, the same
// posture useCommandInterface.ts's own header documents for a sibling field
// landing concurrently):
//   planScheduledReleaseAction(input: { courseUrl, code?, targets: ReleaseTargetRef[] })
//     => Promise<{ rows: ReleasePlanRow[] } | { error: string }>
//   commitScheduledReleaseAction(input: { courseUrl, code?, releaseAt: string, targets: ReleaseTargetRef[] })
//     => Promise<{ committed: number; failed: Array<{ selectionKey: string; reason: string }> } | { error: string }>
// This hook never re-derives a target's hide state itself (classifying
// "hideable"/"already-hidden"/"refused"/"unknown" needs a live Canvas read
// this hook has no business making a second time) - `planScheduledReleaseAction`
// is the one place that happens, and this hook only carries its ROWS forward
// through release-plan.ts's own pure staleness/summary helpers.
//
// F10 - THE TARGET SET IS BUILT HERE, FROM THE LIVE MODULE TREE THE BROWSER
// ALREADY HOLDS. `buildReleaseModuleTree` below is a thin, local mapping
// from `CanvasModule[]` (the `modules` prop every sibling hook in this file
// already receives) to release-plan.ts's own narrow `ReleasePlanModuleNode`
// shape - never importing `CanvasModule` into release-plan.ts itself (that
// file's own header explains why: its public surface must not widen every
// time the Canvas-shaped type gains a field this feature never reads).
// `buildReleaseTargets` (release-plan.ts) then does the real F10 expansion
// and dedupe; this file only supplies the two id sets and the tree.
//
// TIMEZONE (AC4, release-plan.ts's own header) - THE ONE `.toISOString()`
// CALL FOR THIS FEATURE LIVES HERE, in `releaseInstantIso`, a client-only
// pure leaf: it constructs a `Date` from the `datetime-local` input's wall-
// clock string (interpreted in THIS BROWSER's own timezone, because that is
// where the input rendered) and serializes it with `.toISOString()` exactly
// once. release-plan.ts's own `validateReleaseInstant` never constructs a
// `Date` from parts and never calls `.toISOString()` - it only ever parses
// the already-absolute instant this function hands it. Keeping the one
// timezone-sensitive operation in this client leaf, and nowhere else, is
// what entry 330's defect (a wall-clock Date built on a UTC server) exists
// to prevent from happening again.
//
// F6 - ARM THE COMMIT AGAINST THE SELECTION, NOT AGAINST TIME. `commitArmed`
// below is `isConfirmArmed` (confirmArming.ts) keyed to a signature of the
// CURRENT selection - the same idiom `confirmDeleteContent`
// (useBulkItemActions.ts) already uses for the bar's other destructive-in-
// effect write. Arming lives entirely in this hook's own state; the bulk
// bar's `scheduledRelease` group's DECLARED tier (`fan-out-write`, never
// `destructive` - see bulkBarGroupCatalog.ts's own comment on
// `scheduledReleaseGroup`) is independent of whether this control happens to
// be armed, exactly as F6 states.
//
// STALENESS - REUSES release-plan.ts's OWN reconciliation, never restates
// it: `reconciliation` below is `reconcileReleasePlanWithSelection` recomputed
// on every render from the LIVE selection (the same "never cached, recomputed
// every render" posture useCommandInterface.ts's own `reconciliation` takes),
// so a selection change while the review modal is open is reflected
// immediately, before Commit is ever clicked.
import { useMemo, useState } from "react";
import type { CanvasModule, CanvasModuleItem } from "@/lib/canvas-modules";
import { isConfirmArmed, selectionSignature } from "./confirmArming";
import {
  buildReleasePlan,
  buildReleaseTargets,
  reconcileReleasePlanWithSelection,
  summarizeReleasePlan,
  validateReleaseInstant,
  type ReleasePlan,
  type ReleasePlanModuleNode,
  type ReleasePlanReconciliation,
  type ReleasePlanRow,
  type ReleasePlanSummary,
  type ReleaseTimeValidation,
} from "@/lib/release-plan";
import { planScheduledReleaseAction, commitScheduledReleaseAction } from "@/app/actions/scheduled-releases";
import { itemKey, liveModuleKey, type ItemSource } from "../utils";

// ---------------------------------------------------------------------------
// Pure helpers - exported for direct, renderer-free unit testing (this
// repo's vitest is node-env and never renders a component).

/**
 * Map the live module tree this hook's `modules` parameter already holds
 * into release-plan.ts's own narrow `ReleasePlanModuleNode` shape - the one
 * piece of Canvas-shaped-type knowledge this feature needs, kept out of
 * release-plan.ts itself (see that file's own header comment on why). Every
 * module and item gets the SAME selection key the rest of this bar's
 * selection Sets use (`liveModuleKey`/`itemKey`, ../utils.ts) so
 * `reconcileReleasePlanWithSelection` can compare a target's `selectionKey`
 * directly against the live `selected`/`selectedModules` Sets with no second
 * key format to keep in sync.
 */
export function buildReleaseModuleTree(modules: readonly CanvasModule[]): ReleasePlanModuleNode[] {
  return modules.map((mod) => ({
    id: mod.id,
    name: mod.name,
    selectionKey: liveModuleKey(mod.id),
    items: mod.items.map((item) => ({
      id: item.id,
      moduleId: mod.id,
      title: item.title,
      selectionKey: itemKey(mod.id, item.id),
    })),
  }));
}

/**
 * C8-style predicate (see useCarryModulePattern.ts's `isCarryReviewVisible`
 * and useCommandInterface.ts's `isCommandReviewVisible` for the precedent
 * this copies verbatim): the ONE fact that licenses showing the review modal
 * at all, and, via ModulesView.tsx's own `releaseReviewOpen` bulk-bar fact,
 * the ONE fact that raises the "scheduledRelease" group's tier to
 * fan-out-write (F6). `reviewOpen` alone is not this fact: nothing here
 * re-derives the plan from the live selection mid-fetch, but `plan` still
 * starts `null` before the first "Review release plan" click resolves.
 */
export function isReleaseReviewVisible(reviewOpen: boolean, plan: unknown): boolean {
  return reviewOpen && plan != null;
}

/**
 * The ONE `.toISOString()` call this feature's client half makes (see this
 * file's own header, "TIMEZONE"). `releaseDateLocalValue` is a `datetime-
 * local` input's raw value ("2026-09-01T09:00", no timezone of its own) -
 * `new Date(...)` interprets it in THIS BROWSER's timezone, which is exactly
 * the instructor's own clock, and `.toISOString()` then serializes that
 * instant as an absolute UTC timestamp (AC4). Returns `null` for a blank or
 * unparseable value rather than throwing - callers feed that straight into
 * `validateReleaseInstant`, whose own "could not be parsed" reason string is
 * then the ONE place that message is spelled, never restated here.
 */
export function releaseInstantIso(releaseDateLocalValue: string): string | null {
  const trimmed = releaseDateLocalValue.trim();
  if (!trimmed) return null;
  const ms = new Date(trimmed).getTime();
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/** One row of the review modal - a `ReleasePlanRow` plus whether it dropped
 * out of the CURRENT selection since the plan was built (G14-style
 * staleness, restated for this feature's own, simpler plan shape). Built
 * from `plan.rows` (release-plan.ts's own tree-ordered list) rather than
 * from `reconciliation.applicableRows`/`droppedRows` concatenated, so the
 * modal renders every row in the SAME order the plan itself already
 * justifies - never reordered by which bucket a row fell into. */
export interface ReleaseReviewRow {
  row: ReleasePlanRow;
  dropped: boolean;
}

/**
 * Collapse a plan and its live reconciliation into one row per
 * `plan.rows` entry - the single function both the review modal's list AND
 * `onCommitRelease` (via `reconciliation.applicableRows` directly) read, so
 * "what the modal shows" and "what Commit actually sends" can never drift
 * apart from each other.
 */
export function buildReleaseReviewRows(plan: ReleasePlan, reconciliation: ReleasePlanReconciliation): ReleaseReviewRow[] {
  const droppedKeys = new Set(reconciliation.droppedRows.map((row) => row.target.selectionKey));
  return plan.rows.map((row) => ({ row, dropped: droppedKeys.has(row.target.selectionKey) }));
}

/** Summarize one commit's server result into a note, mirroring
 * describeCommandApplyOutcome's/describeCarryApplyOutcome's shape for this
 * feature's own, smaller outcome vocabulary. */
export function describeReleaseCommitOutcome(
  result: { committed: number; failed: Array<{ selectionKey: string; reason: string }> },
  droppedCount: number
): { kind: "success" | "error"; text: string } {
  const parts = [`${result.committed} target${result.committed === 1 ? "" : "s"} scheduled`];
  if (result.failed.length > 0) parts.push(`${result.failed.length} failed`);
  if (droppedCount > 0) parts.push(`${droppedCount} dropped because the selection changed`);
  return { kind: result.failed.length > 0 ? "error" : "success", text: parts.join(", ") + "." };
}

// ---------------------------------------------------------------------------
// The hook

export interface UseScheduledReleaseReturn {
  // The bar's own controls (releaseDate, releaseReview).
  releaseDate: string;
  setReleaseDate: (v: string) => void;
  /** Live validation of the CURRENT `releaseDate` value against the CURRENT
   * clock - `null` only while `releaseDate` is blank (nothing to validate
   * yet, not an error to show). Read by ScheduledReleaseSection.tsx to show
   * F3/AC4's "must be in the future" refusal inline, under the field, rather
   * than only after a click. */
  dateValidation: ReleaseTimeValidation | null;
  reviewBusy: boolean;
  onReviewRelease: () => void;

  // The review modal (rendered at ModulesView root, same as
  // carryModulePattern/commandInterface).
  reviewOpen: boolean;
  /** See `isReleaseReviewVisible`'s own doc comment above - the single fact
   * ModulesView.tsx's `releaseReviewOpen` bulk-bar fact AND
   * ModulesViewSecondaryModals.tsx's modal mount gate must both read. */
  reviewVisible: boolean;
  closeReview: () => void;
  plan: ReleasePlan | null;
  reconciliation: ReleasePlanReconciliation | null;
  /** Counts over `reconciliation.applicableRows` ONLY - the targets that
   * would actually be committed right now, not the plan's original,
   * possibly-stale row count. This is what the review modal's header
   * renders (F10's per-target hide-state summary). */
  summary: ReleasePlanSummary | null;
  reviewRows: ReleaseReviewRow[];
  /** The absolute UTC instant the CURRENT `releaseDate` value resolves to,
   * recomputed live (see `releaseInstantIso`) - `null` while `releaseDate`
   * is blank or unparseable. */
  releaseAtIso: string | null;
  /** F6: whether the commit is currently armed for the CURRENT selection
   * (confirmArming.ts's idiom) - independent of the group's declared tier. */
  commitArmed: boolean;
  commitBusy: boolean;
  onCommitRelease: () => void;
}

export function useScheduledRelease(
  courseUrl: string,
  acronym: string | undefined,
  modules: CanvasModule[],
  /** `selection.selectedItems` (ModulesView.tsx) - a bulk hook receives the
   * raw selector and calls it itself, the same shape useCommandInterface.ts's
   * own signature already takes (reuse survey). */
  selectedItems: () => Array<{ item: CanvasModuleItem; moduleId: number; source: ItemSource }>,
  /** `selection.selected` / `selection.selectedModules` - the raw key Sets,
   * used ONLY to compute the selection signature a built plan is pinned to
   * and later reconciled against, and the one the commit arm is keyed to
   * (F6/F10). Which objects actually become TARGETS is filtered separately,
   * from `selectedItems()`'s own `source` field and `liveModuleIds` below -
   * never from these two Sets directly, since either can carry export/repo
   * keys this feature cannot act on. */
  selected: Set<string>,
  selectedModules: Set<string>,
  liveModuleIds: Set<number>,
  setBusy: (b: boolean) => void,
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void,
  reload: () => void
): UseScheduledReleaseReturn {
  const [releaseDate, setReleaseDate] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [plan, setPlan] = useState<ReleasePlan | null>(null);
  const [commitArmedFor, setCommitArmedFor] = useState<string | null>(null);
  const [commitBusy, setCommitBusy] = useState(false);

  const releaseAtIso = releaseInstantIso(releaseDate);
  const dateValidation: ReleaseTimeValidation | null =
    releaseDate.trim() === "" ? null : validateReleaseInstant(releaseAtIso ?? "", new Date());

  // Never cached - recomputed every render from the LIVE selection, the same
  // posture useCommandInterface.ts's own `reconciliation` takes and for the
  // same reason: a selection change while the review modal is open must be
  // reflected here immediately, before Commit is ever clicked.
  const currentSelectionKeys = useMemo(() => [...selected, ...selectedModules], [selected, selectedModules]);
  const currentSelectionSig = selectionSignature(currentSelectionKeys);
  const commitArmed = isConfirmArmed(commitArmedFor, currentSelectionSig);

  const reconciliation = useMemo(
    () => (plan ? reconcileReleasePlanWithSelection(plan, currentSelectionKeys) : null),
    [plan, currentSelectionKeys]
  );
  const summary = useMemo(() => (reconciliation ? summarizeReleasePlan(reconciliation.applicableRows) : null), [reconciliation]);
  const reviewRows = useMemo(
    () => (plan && reconciliation ? buildReleaseReviewRows(plan, reconciliation) : []),
    [plan, reconciliation]
  );

  const reviewVisible = isReleaseReviewVisible(reviewOpen, plan);

  const onReviewRelease = () => {
    const liveItemIds = new Set(
      selectedItems()
        .filter((si) => si.source === "live")
        .map(({ item }) => item.id)
    );
    if (liveItemIds.size === 0 && liveModuleIds.size === 0) {
      setNote({
        kind: "error",
        text: "Select at least one module or item this app can write to (a live Canvas selection) before scheduling a release.",
      });
      return;
    }
    if (releaseDate.trim() === "") {
      setNote({ kind: "error", text: "Choose a release date and time first." });
      return;
    }
    const iso = releaseInstantIso(releaseDate);
    const validation = validateReleaseInstant(iso ?? "", new Date());
    if (!validation.valid || !iso) {
      setNote({ kind: "error", text: validation.reason ?? "The release time is invalid." });
      return;
    }

    const moduleTree = buildReleaseModuleTree(modules);
    const targets = buildReleaseTargets(liveModuleIds, liveItemIds, moduleTree);
    const generationSelectionKeys = [...selected, ...selectedModules];

    void (async () => {
      setReviewBusy(true);
      setNote(null);
      const result = await planScheduledReleaseAction({ courseUrl, code: acronym, targets });
      setReviewBusy(false);

      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }

      setPlan(buildReleasePlan(result.rows, generationSelectionKeys));
      setCommitArmedFor(null);
      setReviewOpen(true);
    })();
  };

  const closeReview = () => setReviewOpen(false);

  const onCommitRelease = () => {
    if (!plan || !reconciliation) return;

    const iso = releaseInstantIso(releaseDate);
    const validation = validateReleaseInstant(iso ?? "", new Date());
    if (!validation.valid || !iso) {
      setNote({ kind: "error", text: validation.reason ?? "The release time is invalid." });
      return;
    }
    if (reconciliation.applicableRows.length === 0) {
      setNote({ kind: "error", text: "Nothing to commit - every target dropped out of the current selection." });
      return;
    }
    // F6: arm against the CURRENT selection's signature before writing
    // anything. A selection change between the two clicks changes
    // `currentSelectionSig`, so `commitArmed` (isConfirmArmed) goes false
    // again by construction - never a stale arm pointed at a different set
    // of targets.
    if (!commitArmed) {
      setCommitArmedFor(currentSelectionSig);
      return;
    }
    setCommitArmedFor(null);

    // F11.2: the commit persists what it hid, so cancel can later RESTORE on
    // fact rather than guess (F11.1). The published state travels with the
    // target from the plan row that read it - never re-derived from
    // hideState, which cannot tell "published but unreadable" from "unknown".
    const targets = reconciliation.applicableRows.map((row) => ({ ...row.target, wasPublished: row.wasPublished }));
    const droppedCount = reconciliation.droppedRows.length;

    void (async () => {
      setCommitBusy(true);
      setBusy(true);
      setNote(null);
      const result = await commitScheduledReleaseAction({ courseUrl, code: acronym, releaseAt: iso, targets });
      setCommitBusy(false);
      setBusy(false);

      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        return;
      }
      setNote(describeReleaseCommitOutcome(result, droppedCount));
      setReviewOpen(false);
      reload();
    })();
  };

  return {
    releaseDate,
    setReleaseDate,
    dateValidation,
    reviewBusy,
    onReviewRelease,
    reviewOpen,
    reviewVisible,
    closeReview,
    plan,
    reconciliation,
    summary,
    reviewRows,
    releaseAtIso,
    commitArmed,
    commitBusy,
    onCommitRelease,
  };
}
