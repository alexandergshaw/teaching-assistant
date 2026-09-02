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
// DiscussionReplyTable.tsx), and the status filter chips (D3, now a
// SegmentedToggle per CC4). The sticky recipe is copied VERBATIM from
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
//
// docs/recording-controls-ux-acceptance-criteria.md CC1/CC4/CC5: the status
// chips are now a SegmentedToggle (a track with a raised segment, not a row
// of contained/outlined primaries - a selected chip rendered as the screen's
// primary fill would breach CC1's one-filled-button rule), "Draft the
// missing replies" takes the new `primaryAction` prop through `variantFor`,
// and Delete table is a ConfirmArmButtons pushed to the far edge of the
// cluster.

import type { RefObject } from "react";
import { Button, IconButton, InputAdornment, TextField } from "@mui/material";
import styles from "../../page.module.css";
import panelStyles from "./DiscussionRepliesPanel.module.css";
import controls from "./RecordingControls.module.css";
import { CopyIcon, CheckIcon, CloseIcon } from "./discussion-icons";
import { REPLY_STATUS_FILTERS, REPLY_STATUS_FILTER_LABELS, type ReplyStatusFilter } from "./discussion-table-view";
import SegmentedToggle from "../ui/SegmentedToggle";
import ConfirmArmButtons from "../ui/ConfirmArmButtons";
import { variantFor } from "../ui/buttonVariant";

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
  /** CC1: capturing ? null : pendingEligible > 0 ? "draft" : null - the
   *  panel's own derivation; this component only reads it. Fixer pass
   *  finding 1: NOT `drafting || pendingEligible > 0` any more - a
   *  single-row Redraft also flips `drafting` true, and pendingEligible
   *  excludes rows already in flight, so that OR kept this the contained,
   *  spinning primary for the whole drain even after the last eligible row
   *  had been dispatched. */
  primaryAction: "draft" | null;
  /** CC1's "Drafting N remaining" reason line, shown under the toolbar while
   *  `drafting` is true AND this count is positive. Deliberately NOT the same
   *  `pendingEligible` count `primaryAction` reads - this one also counts
   *  rows already in state "drafting" (in flight), so it does not read
   *  "Drafting 0 remaining" for the stretch of a redraft where every
   *  remaining row has already been dispatched into the loop but has not
   *  resolved yet. Fixer pass finding 1: renamed from `pendingEligibleCount`
   *  - the old name claimed this was the same count that gates the primary
   *  (`pendingEligible`), which it never was (see the note above). */
  draftingRemaining: number;

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
  primaryAction,
  draftingRemaining,
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

  const statusOptions = REPLY_STATUS_FILTERS.map((key) => ({
    value: key,
    label: REPLY_STATUS_FILTER_LABELS[key],
    count: statusCounts[key],
  }));

  return (
    <div className={panelStyles.stickyToolbar}>
      <SegmentedToggle
        label="Filter replies by status"
        options={statusOptions}
        value={statusFilter}
        onChange={setStatusFilter}
      />

      <div className={styles.adaptRow}>
        <TextField
          type="search"
          size="small"
          label="Search replies"
          placeholder="Search by name or keyword"
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
        {/* F14, extended for the status chip: shown whenever EITHER filter is
            active, denominator always totalCount (F11). */}
        {filterActive && (
          <span className={styles.fieldHint}>
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
          title={copyAllDisabled ? "Nothing eligible to copy" : allCopied ? "Copied" : copyAllLabel}
          onClick={onCopyAll}
        >
          {copyAllLabel}
        </Button>
        <Button
          size="small"
          variant={variantFor(primaryAction === "draft")}
          loading={drafting}
          loadingPosition="start"
          onClick={onDraftMissing}
        >
          Draft the missing replies
        </Button>
        <Button
          size="small"
          variant="outlined"
          disabled={findResourcesCount === 0}
          title={findResourcesCount === 0 ? "No rows need resources" : undefined}
          onClick={onFindMissing}
        >
          {`Find resources (${findResourcesCount})`}
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
