"use client";

// K10 - bulk delete over the Knowledge tab's checkbox selection. Added
// because the audit that produced docs/knowledge-bulk-actions-ask-ai-
// acceptance-criteria.md's K-series measured retiring twelve scattered pages
// at 36+ clicks today (select, delete, confirm, repeat - twelve times) with
// no bulk path at all.
//
// Armed exactly like the modules bulk bar's own deletes
// (content-tab/modules/confirmArming.ts's selectionSignature/isConfirmArmed,
// reused unmodified rather than re-implemented - REGRESSION entry 380 names
// that file as the local exemplar for arming). The confirm states the
// DEDUPED DESCENDANT-INCLUSIVE count (bulkDeleteInclusiveCount), never the
// raw checkbox count - a page whose ancestor is also selected is not sent to
// deleteInstitutionPageAction a second time (the server cascade already
// removes it), but it IS counted in what the confirm states, so "Delete 12
// pages" never understates a cascade that actually removes more.
//
// {done, failed, skipped} (REGRESSION 380's own shape) is rendered as one
// note after every run. Reusing S4's own self-pruning: rather than hand-
// tracking which ids succeeded, this calls the existing `refresh()` and lets
// useKbSelection's compare-and-adjust prune the selection against the FRESH
// page list on the next render - a page that was actually deleted (whether
// it was a direct target or a skipped descendant swept in by cascade) is no
// longer in `pages` and drops out of the selection for free; a page whose
// delete FAILED is still in `pages` and stays selected, so "click again"
// retries exactly what is left, with no separate bookkeeping to keep in
// sync with the server's own truth.
import { useCallback, useState } from "react";
import type { InstitutionPage, InstitutionPageNode } from "@/lib/knowledge-base";
import { deleteInstitutionPageAction } from "../../actions";
import { selectionSignature, isConfirmArmed } from "../content-tab/modules/confirmArming";
import {
  computeBulkDeleteTargets,
  bulkDeleteInclusiveCount,
  describeBulkDeleteOutcome,
  type BulkDeleteFailure,
  type BulkDeleteSkip,
} from "./knowledge-helpers";

export interface UseKbBulkActionsArgs {
  active: string;
  pages: InstitutionPage[] | null;
  tree: InstitutionPageNode[];
  selected: Set<string>;
  refresh: (selectId?: string | null) => Promise<void>;
  setActionError: (message: string | null) => void;
}

export interface UseKbBulkActionsReturn {
  /** Nothing to delete (empty selection, or pages not loaded yet). */
  canDelete: boolean;
  /** Two-click arm state - true once a second click on the same selection
   *  would actually delete. Invalidated by ANY selection change (arming is a
   *  property of the selection VALUE, not a timer - confirmArming.ts's own
   *  contract). */
  armed: boolean;
  busy: boolean;
  /** The real blast radius (K10) - always >= the checkbox count. */
  inclusiveCount: number;
  /** {done, failed, skipped}, already rendered - null until the first run. */
  outcomeNote: string | null;
  /** Arms on the first call, deletes on the second (while still armed for
   *  the same selection). */
  requestBulkDelete: () => Promise<void>;
}

export function useKbBulkActions({
  active,
  pages,
  tree,
  selected,
  refresh,
  setActionError,
}: UseKbBulkActionsArgs): UseKbBulkActionsReturn {
  const [armedFor, setArmedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcomeNote, setOutcomeNote] = useState<string | null>(null);

  // Reset on institution change - an armed/reported state from a different
  // institution's selection has nothing to do with this one.
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    setArmedFor(null);
    setOutcomeNote(null);
  }

  const signature = selectionSignature(selected);
  const armed = isConfirmArmed(armedFor, signature);
  const { topLevelIds, skippedIds } = pages ? computeBulkDeleteTargets(pages, selected) : { topLevelIds: [], skippedIds: [] };
  const inclusiveCount = bulkDeleteInclusiveCount(tree, topLevelIds);

  const requestBulkDelete = useCallback(async () => {
    if (topLevelIds.length === 0 || !pages) return;
    if (!armed) {
      setArmedFor(signature);
      return;
    }
    setArmedFor(null);
    setOutcomeNote(null);
    setActionError(null);
    setBusy(true);

    const titleOf = (id: string) => pages.find((p) => p.id === id)?.title.trim() || "Untitled page";
    const failed: BulkDeleteFailure[] = [];
    let doneCount = 0;
    for (const id of topLevelIds) {
      const result = await deleteInstitutionPageAction(id);
      if ("error" in result) failed.push({ title: titleOf(id), message: result.error });
      else doneCount += 1;
    }
    const skipped: BulkDeleteSkip[] = skippedIds.map((id) => ({ title: titleOf(id) }));

    setBusy(false);
    setOutcomeNote(describeBulkDeleteOutcome(inclusiveCount, { doneCount, failed, skipped }));
    // S4's own self-pruning (useKbSelection.ts) drops every id that no
    // longer exists in the refreshed `pages` list - done, and cascaded-away
    // skipped ids, disappear from the selection for free; a FAILED top-level
    // id is still in `pages` and stays selected, so a retry click targets
    // exactly what is left.
    await refresh(null);
  }, [armed, signature, topLevelIds, skippedIds, pages, inclusiveCount, refresh, setActionError]);

  return {
    canDelete: topLevelIds.length > 0,
    armed,
    busy,
    inclusiveCount,
    outcomeNote,
    requestBulkDelete,
  };
}
