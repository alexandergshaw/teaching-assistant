"use client";

// D1/D3/D7/D9 (docs/aesthetics-pass-acceptance-criteria.md section 4b): the
// panel-side wiring for handledAt/skipped (discussion-reply-flags.ts) and the
// status filter chips (discussion-table-view.ts), pulled out of
// DiscussionRepliesPanel.tsx into its own hook - this panel is 932 of its
// 1000-line ceiling (AM12-capped) before this group started, and every other
// feature added to it in this same folder has been extracted into a sibling
// file or hook rather than grown inline (DiscussionReplyControls.tsx,
// DiscussionResourceSettings.tsx, DiscussionReplyTable.tsx, and now
// DiscussionReplyToolbar.tsx). One hook call here, rather than the ~10
// individual useState/useCallback/useMemo calls this used to be inline in the
// panel, also keeps that component's own hook shape close to what it was
// before this group - see this repo's own convention of splitting a growing
// component's hooks into a dedicated file (useDiscussionCourses.ts,
// useDiscussionKnowledgeContext.ts, useDiscussionPersistedControls.ts are the
// precedent, all doing exactly this for the SAME panel).

import { useCallback, useMemo, useRef, useState } from "react";
import type { ReplyRow, ReplyResource } from "./discussion-capture";
import { useDiscussionReplyFlags } from "./discussion-reply-flags";
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
}: UseDiscussionReplyFilteringArgs): UseDiscussionReplyFilteringReturn {
  // D1/D9: see discussion-reply-flags.ts's own header for the full account
  // of why handledAt/skipped live here rather than as ReplyRow fields.
  const liveIds = useMemo(() => rawRows.map((r) => r.id), [rawRows]);
  const { handledAt: handledAtById, skipped: skippedById, markHandled, clearHandled, toggleHandled, toggleSkipped } = useDiscussionReplyFlags(liveIds);

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
