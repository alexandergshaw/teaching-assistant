"use client";

// Message replies - the M18 status-chip filter and the handledAt/skipped
// panel wiring, pulled out of the orchestrator into its own hook (mirrors
// src/app/components/recording/useDiscussionReplyFiltering.ts's own
// extraction, same "one hook call instead of a standalone cluster of
// useState/useCallback/useMemo" reasoning that file's header gives).
//
// Simpler than the discussion original: message-table-view.ts's own header
// records that this table "has no side-channel handledAt/skipped maps to
// thread through, since MessageThreadRow carries skipped on the row itself"
// (M6) - so there is no handledAtById/skippedById derivation here, and no
// discussion-table-view.ts status-filter import; M18 defines its own closed
// six-member union (message-table-view.ts, Group L, already landed) and this
// hook applies it directly to already-sorted-and-filtered rows.

import { useCallback, useMemo, useRef, useState } from "react";
import {
  isMessageStatusFilter,
  computeMessageStatusCounts,
  filterThreadsByStatus,
  type MessageStatusFilter,
} from "./message-table-view";
import type { MessageThreadRow } from "./message-serialization";

const STORAGE_KEY_STATUS_FILTER = "ta-rec-msg-status-filter";

export interface UseMessageReplyFilteringArgs {
  /** The UNFILTERED table - chip counts are computed over this, never the
   *  text-filtered array (the same whole-table discipline the discussion
   *  original's own header records). */
  rawRows: MessageThreadRow[];
  /** Already sorted and TEXT-filtered (useMessageReplies.ts's own `rows`). */
  rows: MessageThreadRow[];
  filterText: string;
  setFilterText: (next: string) => void;
  editReply: (id: string, text: string) => void;
  setHandledAt: (id: string, at: number | null) => void;
  setSkipped: (id: string, skipped: boolean) => void;
}

export interface UseMessageReplyFilteringReturn {
  statusFilter: MessageStatusFilter;
  setStatusFilter: (next: MessageStatusFilter) => void;
  statusCounts: Record<MessageStatusFilter, number>;
  /** `rows`, narrowed a second time by the status chip - what the table
   *  actually renders. */
  visibleRows: MessageThreadRow[];
  /** True when either filter (text or status) is narrowing the table. */
  filterActive: boolean;
  markHandled: (id: string) => void;
  toggleHandled: (id: string) => void;
  toggleSkipped: (id: string) => void;
  /** The one persistent element every "clear the filter" control refocuses. */
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  handleClearFilters: () => void;
  /** editReply wrapped to clear `handledAt` on any edit - forward this to
   *  the table INSTEAD of the raw mutator. */
  handleEditReply: (id: string, text: string) => void;
}

export function useMessageReplyFiltering({
  rawRows,
  rows,
  filterText,
  setFilterText,
  editReply,
  setHandledAt,
  setSkipped,
}: UseMessageReplyFilteringArgs): UseMessageReplyFilteringReturn {
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

  const [statusFilter, setStatusFilterState] = useState<MessageStatusFilter>(() => {
    if (typeof window === "undefined") return "all";
    const stored = window.localStorage.getItem(STORAGE_KEY_STATUS_FILTER);
    return isMessageStatusFilter(stored) ? stored : "all";
  });
  const setStatusFilter = useCallback((next: MessageStatusFilter) => {
    setStatusFilterState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY_STATUS_FILTER, next);
    } catch {
      // Best-effort, mirrors useMessageRows.ts's own low-stakes filter write.
    }
  }, []);

  const statusCounts = useMemo(() => computeMessageStatusCounts(rawRows), [rawRows]);
  const visibleRows = useMemo(() => filterThreadsByStatus(rows, statusFilter), [rows, statusFilter]);
  const filterActive = filterText.trim() !== "" || statusFilter !== "all";

  const searchInputRef = useRef<HTMLInputElement>(null);
  const handleClearFilters = useCallback(() => {
    setFilterText("");
    setStatusFilter("all");
    searchInputRef.current?.focus();
  }, [setFilterText, setStatusFilter]);

  const handleEditReply = useCallback(
    (id: string, text: string) => {
      clearHandled(id);
      editReply(id, text);
    },
    [editReply, clearHandled]
  );

  return {
    statusFilter,
    setStatusFilter,
    statusCounts,
    visibleRows,
    filterActive,
    markHandled,
    toggleHandled,
    toggleSkipped,
    searchInputRef,
    handleClearFilters,
    handleEditReply,
  };
}
