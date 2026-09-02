"use client";

// The Knowledge tab's bulk action bar - extracted out of KnowledgeTab.tsx
// during this K-series pass once the fixes below (K1-K10) pushed that file
// past the repo's 950-line soft cap. Pure structural split: every prop here
// is a value or callback KnowledgeTab.tsx already owned; no behaviour moved.
//
// K2: the CALLER wraps this component in `.kbOverlayAnchor` (this feature's
// own zero-height flow placeholder - see KnowledgeTab.module.css's doc
// comment) so this bar mounting/unmounting never shifts the page tree
// beneath it. That wrapping stays in KnowledgeTab.tsx (it also wraps the
// search-hit panel and the delete banner, which this component does not
// own), not here.
import Button from "@mui/material/Button";
import type { SelectedPagesDescription } from "./knowledge-helpers";
import { kbBulkActionConsequenceTag } from "./knowledge-helpers";
import type { UseKbBulkActionsReturn } from "./useKbBulkActions";
import styles from "../../page.module.css";
import kbStyles from "../KnowledgeTab.module.css";

export interface KnowledgeBulkBarProps {
  selectedCount: number;
  selectionDescription: SelectedPagesDescription;
  showAllSelected: boolean;
  onShowAllSelectedChange: (next: boolean) => void;
  onClear: () => void;
  onAskAi: () => void;
  onStartRecording: () => void;
  onStartGrading: () => void;
  bulkDelete: UseKbBulkActionsReturn;
}

export default function KnowledgeBulkBar({
  selectedCount,
  selectionDescription,
  showAllSelected,
  onShowAllSelectedChange,
  onClear,
  onAskAi,
  onStartRecording,
  onStartGrading,
  bulkDelete,
}: KnowledgeBulkBarProps) {
  return (
    <div className={`${styles.bulkBar} ${kbStyles.kbOverlayCard}`}>
      <div className={styles.bulkBarHead}>
        <span className={styles.bulkCount}>
          {selectedCount} page{selectedCount === 1 ? "" : "s"} selected
        </span>
        {/* K8: ONE bar-level live region (BulkBarHead.tsx's shape, not one
            per control) announcing the bulk-delete busy state and its final
            {done, failed, skipped} outcome. */}
        {(bulkDelete.busy || bulkDelete.outcomeNote) && (
          <span role="status" aria-live="polite" className={styles.fieldHint}>
            {bulkDelete.busy ? "Working…" : bulkDelete.outcomeNote}
          </span>
        )}
        <Button variant="outlined" size="small" onClick={onClear}>
          Clear
        </Button>
      </div>

      {/* B5: names the selection by title (including pages inside a
          collapsed branch, which have no checkbox visible right now) so the
          count above is legible without expanding the tree. K6: raised the
          shown cap and added a "Show all" expander rather than leaving
          anything beyond it as a dead-end "+N more". */}
      <div className={styles.bulkRow}>
        <span className={kbStyles.kbBulkLabel}>Selected</span>
        <span className={styles.fieldHint} style={{ margin: 0 }}>
          {selectionDescription.text}
        </span>
        {selectionDescription.overflowCount > 0 && !showAllSelected && (
          <Button size="small" onClick={() => onShowAllSelectedChange(true)}>
            Show all
          </Button>
        )}
        {showAllSelected && (
          <Button size="small" onClick={() => onShowAllSelectedChange(false)}>
            Show fewer
          </Button>
        )}
      </div>

      <div className={styles.bulkRow}>
        <span className={kbStyles.kbBulkLabel}>Actions</span>
        {/* K7: consequence tiering - three buttons of unequal blast radius no
            longer share the same visual weight. Tags are always-visible
            text (never a `title`). */}
        <span style={{ display: "inline-flex", flexDirection: "column", gap: "2px" }}>
          <Button variant="contained" size="small" onClick={onAskAi}>
            Ask AI
          </Button>
          <span className={kbStyles.kbConsequenceTag}>{kbBulkActionConsequenceTag("read-only")}</span>
        </span>
        <span style={{ display: "inline-flex", flexDirection: "column", gap: "2px" }}>
          <Button variant="outlined" size="small" onClick={onStartRecording}>
            Start recording
          </Button>
          <span className={`${kbStyles.kbConsequenceTag} ${kbStyles.kbConsequenceTagFanOut}`}>
            {kbBulkActionConsequenceTag("fan-out")}
          </span>
        </span>
        <span style={{ display: "inline-flex", flexDirection: "column", gap: "2px" }}>
          <Button variant="outlined" size="small" onClick={onStartGrading}>
            Grade via recording
          </Button>
          <span className={`${kbStyles.kbConsequenceTag} ${kbStyles.kbConsequenceTagFanOut}`}>
            {kbBulkActionConsequenceTag("fan-out")}
          </span>
        </span>
      </div>

      {/* B5: nothing else on this surface says selecting a page sends its
          text to the model - state it once, here, and make it match what
          each button ACTUALLY sends (K1): Ask AI is the only one of the
          three whose server-side path also includes attachments. */}
      <p className={styles.fieldHint} style={{ margin: 0 }}>
        Selected pages are sent to the model as context. Ask AI also includes any attached files; Start recording and
        Grade via recording send page text only, and may omit a page if the selection is too large for the context
        budget.
      </p>

      {/* K10: bulk delete - armed exactly like the modules bulk bar's own
          deletes (selectionSignature/isConfirmArmed, useKbBulkActions.ts),
          stating the real descendant-inclusive count rather than the
          checkbox count. */}
      {bulkDelete.canDelete && (
        <div className={styles.bulkRow}>
          <span className={kbStyles.kbBulkLabel}>Delete</span>
          <span style={{ display: "inline-flex", flexDirection: "column", gap: "2px" }}>
            <Button
              variant="outlined"
              size="small"
              color="error"
              disabled={bulkDelete.busy}
              onClick={() => void bulkDelete.requestBulkDelete()}
            >
              {bulkDelete.armed ? `Confirm delete (${bulkDelete.inclusiveCount})` : `Delete selected (${bulkDelete.inclusiveCount})`}
            </Button>
            <span className={`${kbStyles.kbConsequenceTag} ${kbStyles.kbConsequenceTagDanger}`}>
              {kbBulkActionConsequenceTag("destructive")}
            </span>
          </span>
          {bulkDelete.armed && (
            <span role="status" aria-live="polite" className={styles.fieldHint}>
              Click &quot;Confirm delete&quot; again to permanently delete {bulkDelete.inclusiveCount} page
              {bulkDelete.inclusiveCount === 1 ? "" : "s"} (including sub-pages of anything selected). This cannot be
              undone.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
