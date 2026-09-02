"use client";

// D1/D3/D7/D9 (docs/aesthetics-pass-acceptance-criteria.md section 4b): the
// panel-side wiring for handledAt/skipped and the status filter chips
// (discussion-table-view.ts), pulled out of DiscussionRepliesPanel.tsx into
// its own hook - this panel is 932 of its 1000-line ceiling (AM12-capped)
// before this group started, and every other feature added to it in this
// same folder has been extracted into a sibling file or hook rather than
// grown inline (DiscussionReplyControls.tsx, DiscussionResourceSettings.tsx,
// DiscussionReplyTable.tsx, and now DiscussionReplyToolbar.tsx). One hook
// call here, rather than the ~10 individual useState/useCallback/useMemo
// calls this used to be inline in the panel, also keeps that component's own
// hook shape close to what it was before this group - see this repo's own
// convention of splitting a growing component's hooks into a dedicated file
// (useDiscussionCourses.ts, useDiscussionKnowledgeContext.ts,
// useDiscussionPersistedControls.ts are the precedent, all doing exactly
// this for the SAME panel).
//
// handledAt/skipped used to live in a side-channel localStorage map
// (discussion-reply-flags.ts, since deleted) because the mutator that would
// set them on ReplyRow had no path back through useDiscussionReplies.ts's
// pinned return shape at the time - see useReplyRows.ts's own migration
// effect for how a returning user's side-channel marks were folded onto the
// promoted fields exactly once. Now that the fields are real, this hook
// derives handledAtById/skippedById straight off `rawRows` (a plain reduce,
// memoized) instead of running its own localStorage-backed hook, and reaches
// the two real mutators (setHandledAt/setSkipped) forwarded from
// useReplyRows.ts through useDiscussionReplies.ts.

import { useCallback, useMemo, useRef, useState } from "react";
import type { ReplyRow, ReplyResource } from "./discussion-capture";
import {
  isReplyStatusFilter,
  computeReplyStatusCounts,
  filterRowsByStatus,
  isAnyReplyFilterActive,
  type ReplyStatusFilter,
} from "./discussion-table-view";

const STORAGE_KEY_STATUS_FILTER = "ta-rec-disc-status-filter";

export interface UseDiscussionReplyFilteringArgs {
  /** F0-2/F11: the UNFILTERED table. */
  rawRows: ReplyRow[];
  /** Already sorted and TEXT-filtered (useDiscussionReplies.ts's own `rows`). */
  rows: ReplyRow[];
  filterText: string;
  setFilterText: (next: string) => void;
  editReply: (id: string, text: string) => void;
  insertResource: (id: string, resource: ReplyResource) => void;
  /** D1/D9: the real ReplyRow mutators, forwarded from useReplyRows.ts
   *  through useDiscussionReplies.ts (UseDiscussionRepliesReturn). */
  setHandledAt: (id: string, at: number | null) => void;
  setSkipped: (id: string, skipped: boolean) => void;
}

export interface UseDiscussionReplyFilteringReturn {
  statusFilter: ReplyStatusFilter;
  setStatusFilter: (next: ReplyStatusFilter) => void;
  statusCounts: Record<ReplyStatusFilter, number>;
  /** `rows`, narrowed a SECOND time by the status chip - what the table
   *  actually renders. */
  visibleRows: ReplyRow[];
  /** True when either filter (text or status) is narrowing the table -
   *  D3/S4's own "must count as filterActive" requirement. */
  filterActive: boolean;
  handledAtById: Readonly<Record<string, number>>;
  skippedById: Readonly<Record<string, boolean>>;
  markHandled: (id: string) => void;
  toggleHandled: (id: string) => void;
  toggleSkipped: (id: string) => void;
  /** D7: the one persistent element every "clear the filter" control
   *  refocuses. */
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  handleClearFilters: () => void;
  /** D1: editReply/insertResource wrapped to clear `handledAt` on any edit -
   *  forward these to the table INSTEAD of the raw mutators. */
  handleEditReply: (id: string, text: string) => void;
  handleInsertResourceForRow: (id: string, resource: ReplyResource) => void;
}

export function useDiscussionReplyFiltering({
  rawRows,
  rows,
  filterText,
  setFilterText,
  editReply,
  insertResource,
  setHandledAt,
  setSkipped,
}: UseDiscussionReplyFilteringArgs): UseDiscussionReplyFilteringReturn {
  // D1/D9: handledAt/skipped are now real ReplyRow fields - these are plain
  // derived id -> value lookups, not a second copy of the state, and there is
  // nothing left to prune (a removed row simply disappears from `rawRows`,
  // taking its own fields with it). Each downstream row still only ever
  // receives its OWN primitive value (handledAtById[row.id], never the whole
  // map), so an unrelated row's flag changing does not defeat
  // DiscussionReplyRow's own React.memo (see that file's own header).
  const handledAtById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of rawRows) if (r.handledAt !== undefined) map[r.id] = r.handledAt;
    return map;
  }, [rawRows]);
  const skippedById = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const r of rawRows) if (r.skipped === true) map[r.id] = true;
    return map;
  }, [rawRows]);

  const markHandled = useCallback((id: string) => setHandledAt(id, Date.now()), [setHandledAt]);
  const clearHandled = useCallback((id: string) => setHandledAt(id, null), [setHandledAt]);
  const toggleHandled = useCallback(
    (id: string) => {
      const row = rawRows.find((r) => r.id === id);
      setHandledAt(id, row?.handledAt !== undefined ? null : Date.now());
    },
    [rawRows, setHandledAt]
  );
  const toggleSkipped = useCallback(
    (id: string) => {
      const row = rawRows.find((r) => r.id === id);
      setSkipped(id, row?.skipped !== true);
    },
    [rawRows, setSkipped]
  );

  // D3: the status filter chips. Persisted the same read-once-in-the-
  // initializer way useReplyRows.ts's own `sort`/`filterText` are.
  const [statusFilter, setStatusFilterState] = useState<ReplyStatusFilter>(() => {
    if (typeof window === "undefined") return "all";
    const stored = window.localStorage.getItem(STORAGE_KEY_STATUS_FILTER);
    return isReplyStatusFilter(stored) ? stored : "all";
  });
  const setStatusFilter = useCallback((next: ReplyStatusFilter) => {
    setStatusFilterState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY_STATUS_FILTER, next);
    } catch {
      // Best-effort, mirrors useReplyRows.ts's own low-stakes filter write.
    }
  }, []);

  const statusCounts = computeReplyStatusCounts(rawRows, handledAtById, skippedById);
  const visibleRows = filterRowsByStatus(rows, statusFilter, handledAtById, skippedById);
  const filterActive = isAnyReplyFilterActive(filterText, statusFilter);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const handleClearFilters = useCallback(() => {
    setFilterText("");
    setStatusFilter("all");
    searchInputRef.current?.focus();
  }, [setFilterText, setStatusFilter]);

  // D1: editReply and insertResource both change `reply` - handledAt must be
  // cleared by either, the same invalidation DiscussionReplyRow.tsx's own
  // `removeArmed` already applies to itself on an edit.
  const handleEditReply = useCallback(
    (id: string, text: string) => {
      clearHandled(id);
      editReply(id, text);
    },
    [editReply, clearHandled]
  );
  const handleInsertResourceForRow = useCallback(
    (id: string, resource: ReplyResource) => {
      clearHandled(id);
      insertResource(id, resource);
    },
    [insertResource, clearHandled]
  );

  return {
    statusFilter,
    setStatusFilter,
    statusCounts,
    visibleRows,
    filterActive,
    handledAtById,
    skippedById,
    markHandled,
    toggleHandled,
    toggleSkipped,
    searchInputRef,
    handleClearFilters,
    handleEditReply,
    handleInsertResourceForRow,
  };
}
