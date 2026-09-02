"use client";

// D3 (status filter chips) + D4 (sticky review bar) -
// docs/aesthetics-pass-acceptance-criteria.md section 4b.
//
// Landed in a NEW sibling file rather than inline in DiscussionRepliesPanel.tsx
// (932 of its 1000-line ceiling per AM12 at the time this group started) or
// DiscussionReplyTable.tsx - the same "extract before the next feature hits
// the wall" discipline this panel has already used three times
// (DiscussionReplyControls.tsx, DiscussionResourceSettings.tsx,
// DiscussionReplyTable.tsx itself). AC33 forbids a `recording/discussions/`
// subdirectory, so this is a flat sibling, matching every other extraction in
// this folder.
//
// Combines, in ONE sticky container (D4): the whole-table action bar (moved
// from the panel), the search box + "Showing N of M" (moved from
// DiscussionReplyTable.tsx), and the new status filter chips (D3). The sticky
// recipe is copied VERBATIM from
// src/app/components/courses/CoursesTable.module.css:70-76 (.actionBar) -
// see .stickyToolbar in DiscussionRepliesPanel.module.css for the five
// carried-over declarations and what was added on top.
//
// D7: both Clear controls here focus the search input rather than letting
// the click that unmounts them drop focus to <body>
// (docs/modal-focus-restoration-acceptance-criteria.md AC2) - the search box
// itself never unmounts when either filter clears, so a plain synchronous
// `.focus()` call is enough; no keyed-ref/useLayoutEffect dance is needed the
// way row removal (DiscussionRepliesPanel.tsx) and resource removal
// (DiscussionReplyRow.tsx) require, because those targets DO unmount.
//
// Every callback prop is expected to be a stable reference from the panel,
// mirroring DiscussionReplyTable.tsx's own header note on the same
// discipline (this component sits beside the row list, not inside a
// React.memo boundary itself, but the panel's own re-render cost while
// capturing - elapsedSec ticks once a second - is exactly why that discipline
// exists at all).

import type { RefObject } from "react";
import { Button, IconButton, InputAdornment, TextField } from "@mui/material";
import styles from "../../page.module.css";
import panelStyles from "./DiscussionRepliesPanel.module.css";
import { CopyIcon, CheckIcon, CloseIcon } from "./discussion-icons";
import { REPLY_STATUS_FILTERS, REPLY_STATUS_FILTER_LABELS, type ReplyStatusFilter } from "./discussion-table-view";

export interface DiscussionReplyToolbarProps {
  /** F0-2/F11: the UNFILTERED row count - never the display array's length. */
  totalCount: number;
  /** Rows actually rendered after BOTH filters (text + status). */
  visibleCount: number;
  filterText: string;
  setFilterText: (next: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  statusFilter: ReplyStatusFilter;
  setStatusFilter: (next: ReplyStatusFilter) => void;
  /** D3: computed over rawRows (F11's own discipline) so a chip's own count
   *  cannot silently disagree with what the search box is doing at the same
   *  moment. */
  statusCounts: Record<ReplyStatusFilter, number>;

  copyAllLabel: string;
  allCopied: boolean;
  onCopyAll: () => void;
  copyAllDisabled: boolean;

  drafting: boolean;
  onDraftMissing: () => void;

  findResourcesCount: number;
  onFindMissing: () => void;

  deleteArmed: boolean;
  onArmDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  /** The panel still renders the consequence paragraph itself (right after
   *  this component) - only the id needs to cross the boundary so
   *  `aria-describedby` resolves. */
  deleteConsequenceId: string;
}

export default function DiscussionReplyToolbar({
  totalCount,
  visibleCount,
  filterText,
  setFilterText,
  searchInputRef,
  statusFilter,
  setStatusFilter,
  statusCounts,
  copyAllLabel,
  allCopied,
  onCopyAll,
  copyAllDisabled,
  drafting,
  onDraftMissing,
  findResourcesCount,
  onFindMissing,
  deleteArmed,
  onArmDelete,
  onConfirmDelete,
  onCancelDelete,
  deleteConsequenceId,
}: DiscussionReplyToolbarProps) {
  const filterActive = filterText.trim() !== "" || statusFilter !== "all";

  const handleClearFilters = () => {
    setFilterText("");
    setStatusFilter("all");
    // D7: refocus the search box rather than letting this click's own
    // "Clear" control (which stays mounted either way here) leave focus
    // wherever it happened to land.
    searchInputRef.current?.focus();
  };

  return (
    <div className={panelStyles.stickyToolbar}>
      {/* D3: same segmented-toggle idiom as the audience row above
          (DiscussionRepliesPanel.tsx) - MUI Button, variant contained/
          outlined, size small, aria-pressed. Not a new chip component. */}
      <div className={styles.ghActions} role="group" aria-label="Filter replies by status">
        {REPLY_STATUS_FILTERS.map((key) => (
          <Button
            key={key}
            size="small"
            variant={statusFilter === key ? "contained" : "outlined"}
            aria-pressed={statusFilter === key}
            onClick={() => setStatusFilter(key)}
          >
            {`${REPLY_STATUS_FILTER_LABELS[key]} (${statusCounts[key]})`}
          </Button>
        ))}
      </div>

      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
        <TextField
          type="search"
          size="small"
          label="Search replies"
          placeholder="Search by name or keyword"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          inputRef={searchInputRef}
          sx={{ minWidth: 220, maxWidth: 320 }}
          slotProps={{
            input: {
              endAdornment: filterText ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label="Clear search"
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
        {/* F14, extended for the status chip: shown whenever EITHER filter is
            active, denominator always totalCount (F11). */}
        {filterActive && (
          <span className={styles.fieldHint} style={{ margin: 0 }}>
            {`Showing ${visibleCount} of ${totalCount} repl${totalCount === 1 ? "y" : "ies"}.`}{" "}
            <button type="button" className={styles.linkButton} onClick={handleClearFilters}>
              Clear
            </button>
          </span>
        )}
      </div>

      <div className={styles.ghActions}>
        <Button
          size="small"
          variant="outlined"
          startIcon={allCopied ? <CheckIcon /> : <CopyIcon />}
          disabled={copyAllDisabled}
          title={allCopied ? "Copied" : copyAllLabel}
          onClick={onCopyAll}
        >
          {copyAllLabel}
        </Button>
        <Button size="small" variant="outlined" disabled={drafting} onClick={onDraftMissing}>
          Draft the missing replies
        </Button>
        <Button size="small" variant="outlined" disabled={findResourcesCount === 0} onClick={onFindMissing}>
          {`Find resources (${findResourcesCount})`}
        </Button>
        {deleteArmed ? (
          <>
            <Button size="small" color="error" onClick={onConfirmDelete} aria-describedby={deleteConsequenceId}>
              Confirm delete
            </Button>
            <Button size="small" onClick={onCancelDelete}>
              Cancel
            </Button>
          </>
        ) : (
          <Button size="small" color="error" variant="outlined" onClick={onArmDelete}>
            Delete table
          </Button>
        )}
      </div>
    </div>
  );
}
