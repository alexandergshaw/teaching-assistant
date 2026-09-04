"use client";

// Message replies (Manual > Recording > Message replies) - M14/M15/M16/M18's
// whole-table action bar. Mirrors DiscussionReplyToolbar.tsx's own sticky
// container (status chips, search box + "Showing N of M", the action
// cluster) - see that file's own header for the sticky recipe's origin
// (CoursesTable.module.css:70-76, reused here unchanged via
// panelStyles.stickyToolbar).
//
// Differs from the discussion toolbar in exactly what M14/M15/M16 add and
// remove: no table-level Redraft (message replies has no bulk-overwrite
// action - only the per-row Redraft in MessageThreadRowActions.tsx), no
// "Copy every reply"/"Find resources" (this feature has neither a resource
// lane nor a table-level copy export the AC names), and two new outlined
// buttons this feature owns outright - "Match to Canvas (N)" (M15) and
// "Save all as drafts (N)" (M16). "Delete table" is kept (mirrors the
// sibling's own ConfirmArmButtons danger control, pushed to the far edge) -
// the hook exposes `clearTable` with no other place in this file set for it
// to be reachable from.
//
// buttonVariant.test.ts's FROZEN_PRIMARY_SITES pins this file at exactly
// ONE primary spelling - "Draft the missing replies" below is the feature's
// only `variantFor(...)` site; every other button here is a plain outlined
// Button or a ConfirmArmButtons whose `idleVariant` is "outlined".

import type { RefObject } from "react";
import { Button, InputAdornment, IconButton, TextField } from "@mui/material";
import styles from "../../page.module.css";
import panelStyles from "../recording/DiscussionRepliesPanel.module.css";
import controls from "../recording/RecordingControls.module.css";
import { CloseIcon } from "../recording/discussion-icons";
import SegmentedToggle from "../ui/SegmentedToggle";
import ConfirmArmButtons from "../ui/ConfirmArmButtons";
import { variantFor } from "../ui/buttonVariant";
import { MESSAGE_STATUS_FILTERS, MESSAGE_STATUS_FILTER_LABELS, type MessageStatusFilter } from "./message-table-view";

export interface MessageReplyToolbarProps {
  totalCount: number;
  visibleCount: number;
  filterText: string;
  setFilterText: (next: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  statusFilter: MessageStatusFilter;
  setStatusFilter: (next: MessageStatusFilter) => void;
  statusCounts: Record<MessageStatusFilter, number>;

  drafting: boolean;
  onDraftMissing: () => void;
  primaryAction: "draft" | null;
  draftingRemaining: number;

  unmatchedCount: number;
  onMatchUnmatched: () => void;

  saveAllCount: number;
  onSaveAllDrafts: () => void;

  deleteArmed: boolean;
  onArmDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  deleteConsequenceId: string;
}

export default function MessageReplyToolbar({
  totalCount,
  visibleCount,
  filterText,
  setFilterText,
  searchInputRef,
  statusFilter,
  setStatusFilter,
  statusCounts,
  drafting,
  onDraftMissing,
  primaryAction,
  draftingRemaining,
  unmatchedCount,
  onMatchUnmatched,
  saveAllCount,
  onSaveAllDrafts,
  deleteArmed,
  onArmDelete,
  onConfirmDelete,
  onCancelDelete,
  deleteConsequenceId,
}: MessageReplyToolbarProps) {
  const filterActive = filterText.trim() !== "" || statusFilter !== "all";

  const handleClearFilters = () => {
    setFilterText("");
    setStatusFilter("all");
    searchInputRef.current?.focus();
  };

  const statusOptions = MESSAGE_STATUS_FILTERS.map((key) => ({
    value: key,
    label: MESSAGE_STATUS_FILTER_LABELS[key],
    count: statusCounts[key],
  }));

  return (
    <div className={panelStyles.stickyToolbar}>
      <SegmentedToggle label="Filter threads by status" options={statusOptions} value={statusFilter} onChange={setStatusFilter} />

      <div className={styles.adaptRow}>
        <TextField
          type="search"
          size="small"
          label="Search threads"
          placeholder="Search by name, subject or keyword"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          inputRef={searchInputRef}
          className={controls.fieldMd}
          slotProps={{
            input: {
              endAdornment: filterText ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label="Clear search"
                    title="Clear search"
                    onClick={() => {
                      setFilterText("");
                      searchInputRef.current?.focus();
                    }}
                  >
                    <CloseIcon />
                  </IconButton>
                </InputAdornment>
              ) : undefined,
            },
          }}
        />
        {filterActive && (
          <span className={styles.fieldHint}>
            {`Showing ${visibleCount} of ${totalCount} thread${totalCount === 1 ? "" : "s"}.`}{" "}
            <button type="button" className={styles.linkButton} onClick={handleClearFilters}>
              Clear
            </button>
          </span>
        )}
      </div>

      <div className={styles.ghActions}>
        <Button size="small" variant={variantFor(primaryAction === "draft")} loading={drafting} loadingPosition="start" onClick={onDraftMissing}>
          Draft the missing replies
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={unmatchedCount === 0}
          title={unmatchedCount === 0 ? "Every thread is matched" : undefined}
          onClick={onMatchUnmatched}
        >
          {`Match to Canvas (${unmatchedCount})`}
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={saveAllCount === 0}
          title={saveAllCount === 0 ? "No drafted replies are ready to save" : undefined}
          onClick={onSaveAllDrafts}
        >
          {`Save all as drafts (${saveAllCount})`}
        </Button>
        <span className={controls.pushEnd}>
          <ConfirmArmButtons
            armed={deleteArmed}
            idleLabel="Delete table"
            confirmLabel="Confirm delete"
            tone="danger"
            idleVariant="outlined"
            onArm={onArmDelete}
            onConfirm={onConfirmDelete}
            onCancel={onCancelDelete}
            consequenceId={deleteConsequenceId}
          />
        </span>
      </div>
      {drafting && draftingRemaining > 0 && <p className={styles.fieldHint}>{`Drafting ${draftingRemaining} remaining`}</p>}
    </div>
  );
}
