"use client";

// The Knowledge tab's bulk action bar - extracted out of KnowledgeTab.tsx
// during the K-series pass, then rebuilt in this aesthetics/UX pass (2026-09)
// after the repo owner reported the resting bar "covers almost all" of the
// page tree beneath it.
//
// THE REGRESSION THIS FIXES, AND WHY THE OLD FIX CANNOT JUST BE UNDONE: K2
// found a real bug - this bar used to mount in normal flow ABOVE the tree, so
// ticking the FIRST checkbox inserted a multi-row card and jumped every row
// (including the one just clicked) down under the cursor, and a fast second
// click landed on a different page. K2's fix made the bar an absolutely-
// positioned overlay (KnowledgeTab.module.css's kbOverlayAnchor/kbOverlayCard,
// still used below for the transient status line, and unchanged for the
// search-hit panel and delete banner in KnowledgeTab.tsx) - "it overlays
// whatever would otherwise render at that point instead of displacing it",
// that file's own comment states, and that is exactly the trade the owner is
// now hitting: at up to ~400px (four stacked bulkRow sections: Selected,
// Actions, a disclosure paragraph, Delete), the overlay hid nearly the whole
// 260-320px-wide tree column the moment anything was selected.
//
// THE FIX HERE IS TWO CHANGES, NOT ONE:
//   1. The RESTING bar shrinks to one row - count, Ask AI (the primary
//      action), an overflow menu ("..."), Clear - by moving everything else
//      (the named selection list + Show all/fewer, Start recording, Grade
//      via recording, the model-context disclosure, and delete) behind that
//      menu. A MUI `Menu` is a portaled popover (TakesPanel.tsx's own per-take
//      Menu, referenced in DiscussionReplyRow.tsx's header as "the idiom
//      copied here" - this file copies the same idiom a second time): it
//      never occupies layout space and never displaces anything while
//      closed, and while briefly OPEN it is dismissible (Escape, a backdrop
//      click, or picking an item) rather than a standing obstruction - no
//      page row is EVER permanently unreachable, satisfying the "never
//      cover" half of the brief on its own.
//   2. KnowledgeTab.tsx now mounts this component UNCONDITIONALLY (every
//      render, not gated behind `selected.size > 0`), and this file's own
//      resting row lives inside KnowledgeTab.module.css's `.kbBulkSlot`,
//      whose `min-height` is CONSTANT regardless of selectedCount - see that
//      class's own comment. Ticking the very first checkbox therefore never
//      inserts new flow height at all (the slot already occupied that exact
//      space, rendering nothing) - satisfying the "never jump" half by
//      construction, with no absolute-positioning trick needed for the
//      resting row itself. K2's overlay is reused for exactly one thing
//      below: the busy/outcome/armed status line, which - unlike the
//      resting row - genuinely does vary in whether it renders at all, and
//      only ever changes in response to the user's OWN click on the delete
//      item inside the (already-open) menu, never from a tree checkbox.
import { useState } from "react";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemText from "@mui/material/ListItemText";
import type { SelectedPagesDescription } from "./knowledge-helpers";
import { kbBulkActionConsequenceTag, kbBulkBarStatusText } from "./knowledge-helpers";
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

const CONTROL_HEIGHT = "var(--control-height-md)";

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
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const menuOpen = menuAnchor !== null;
  const closeMenu = () => setMenuAnchor(null);

  // Resting-empty state: KnowledgeTab.tsx now renders this component on
  // EVERY render, not just once something is selected (see this file's
  // header comment, point 2). `.kbBulkSlot`'s own `min-height` is what keeps
  // this empty render from being a smaller-but-still-real height change - the
  // slot occupies the same space whether this returns an empty div or the
  // full resting row below.
  if (selectedCount === 0) {
    return <div className={kbStyles.kbBulkSlot} />;
  }

  // Handles the delete menu item's two-click arm/confirm (K10, unchanged
  // logic - useKbBulkActions.ts's requestBulkDelete arms on the first call
  // and deletes on the second while still armed for the same selection).
  // `wasArmed` is read BEFORE calling requestBulkDelete, mirroring
  // DiscussionReplyRow.tsx's own handleRemoveFromMenu: an ARMING click must
  // leave the menu open (so the same MenuItem, now relabeled "Confirm
  // delete", is still reachable for the second click without reopening
  // anything), while a CONFIRMING click closes it. Deliberately does NOT
  // disarm on menu close/reopen (no onClose handler resets anything here) -
  // confirmArming.ts's own contract is that arming is a property of the
  // SELECTION VALUE, not a timer or a menu's open state: re-opening this menu
  // against the same still-selected pages must show "Confirm delete" still
  // armed, exactly as if the menu had never closed.
  const handleDeleteClick = () => {
    const wasArmed = bulkDelete.armed;
    void bulkDelete.requestBulkDelete();
    if (wasArmed) closeMenu();
  };

  const statusText = kbBulkBarStatusText(bulkDelete.busy, bulkDelete.outcomeNote, bulkDelete.armed, bulkDelete.inclusiveCount);

  return (
    <div className={kbStyles.kbBulkSlot}>
      <div className={kbStyles.kbBulkSlotRow}>
        <span className={kbStyles.kbBulkCount}>
          {selectedCount} page{selectedCount === 1 ? "" : "s"} selected
        </span>
        <Button variant="contained" size="small" onClick={onAskAi} sx={{ height: CONTROL_HEIGHT, whiteSpace: "nowrap" }}>
          Ask AI
        </Button>
        <IconButton
          size="small"
          aria-label="More bulk actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(e) => setMenuAnchor(e.currentTarget)}
          sx={{ height: CONTROL_HEIGHT, width: CONTROL_HEIGHT, flexShrink: 0 }}
        >
          <span aria-hidden="true" className={kbStyles.kbBulkOverflowGlyph}>
            ⋯
          </span>
        </IconButton>
        <Button variant="outlined" size="small" onClick={onClear} sx={{ height: CONTROL_HEIGHT, flexShrink: 0 }}>
          Clear
        </Button>
      </div>

      {/* K2's overlay treatment, reused for exactly this one piece (see this
          file's header comment, point 2): a zero-height anchor plus an
          absolutely-positioned card, so an appearing/disappearing status line
          - unlike the resting row above - never changes this component's own
          flow height. K8's rule still holds: ONE bar-level live region, never
          one per control - kbBulkBarStatusText (knowledge-helpers.ts) is the
          single place that decides which of busy/outcome/armed wins if more
          than one were ever true, so there is only ever one such element in
          the DOM, not several gated separately. */}
      <div className={kbStyles.kbOverlayAnchor}>
        {statusText && (
          <span role="status" aria-live="polite" className={`${styles.fieldHint} ${kbStyles.kbOverlayCard}`}>
            {statusText}
          </span>
        )}
      </div>

      <Menu anchorEl={menuAnchor} open={menuOpen} onClose={closeMenu} slotProps={{ list: { "aria-label": "More bulk actions" } }}>
        {/* B5/K6: names the selection by title (including pages inside a
            collapsed branch, which have no checkbox visible right now) - kept
            reachable here rather than dropped, since it is better than the
            modules bulk bar's own count-only header. Show all/fewer stays a
            real control (not closeMenu()'d by its own click) so expanding the
            list does not also dismiss the menu that reveals it. */}
        <div className={kbStyles.kbMenuSection}>
          <span className={kbStyles.kbBulkLabel}>Selected</span>
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            {selectionDescription.text}
          </p>
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

        {/* K7: Ask AI's own consequence tag - the button itself stays outside
            as the primary action (so it cannot also live inside this menu),
            but its tag must stay just as reachable and just as visible as the
            other three actions' tags (never a `title`) - this plain
            informational row, not a MenuItem, gives it exactly that, at the
            same always-visible-text standard the clickable ones below get
            via ListItemText's secondary slot. */}
        <div className={kbStyles.kbMenuSection}>
          <span className={kbStyles.kbBulkLabel}>Ask AI</span>
          <span className={kbStyles.kbConsequenceTag}>{kbBulkActionConsequenceTag("read-only")}</span>
        </div>

        <MenuItem
          onClick={() => {
            closeMenu();
            onStartRecording();
          }}
        >
          <ListItemText
            primary="Start recording"
            secondary={kbBulkActionConsequenceTag("fan-out")}
            slotProps={{ secondary: { className: `${kbStyles.kbConsequenceTag} ${kbStyles.kbConsequenceTagFanOut}` } }}
          />
        </MenuItem>
        <MenuItem
          onClick={() => {
            closeMenu();
            onStartGrading();
          }}
        >
          <ListItemText
            primary="Grade via recording"
            secondary={kbBulkActionConsequenceTag("fan-out")}
            slotProps={{ secondary: { className: `${kbStyles.kbConsequenceTag} ${kbStyles.kbConsequenceTagFanOut}` } }}
          />
        </MenuItem>

        {/* B5: nothing else on this surface says selecting a page sends its
            text to the model - state it once, here, and make it match what
            each button ACTUALLY sends (K1): Ask AI is the only one of the
            three whose server-side path also includes attachments. */}
        <div className={kbStyles.kbMenuSection}>
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            Selected pages are sent to the model as context. Ask AI also includes any attached files; Start recording and
            Grade via recording send page text only, and may omit a page if the selection is too large for the context
            budget.
          </p>
        </div>

        {/* K10: bulk delete - armed exactly like the modules bulk bar's own
            deletes (selectionSignature/isConfirmArmed, useKbBulkActions.ts),
            stating the real descendant-inclusive count rather than the
            checkbox count. See handleDeleteClick above for why this does not
            close the menu on an ARMING click. */}
        {bulkDelete.canDelete && (
          <MenuItem onClick={handleDeleteClick} disabled={bulkDelete.busy} sx={{ color: "var(--danger)" }}>
            <ListItemText
              primary={
                bulkDelete.armed ? `Confirm delete (${bulkDelete.inclusiveCount})` : `Delete selected (${bulkDelete.inclusiveCount})`
              }
              secondary={kbBulkActionConsequenceTag("destructive")}
              slotProps={{ secondary: { className: `${kbStyles.kbConsequenceTag} ${kbStyles.kbConsequenceTagDanger}` } }}
            />
          </MenuItem>
        )}
      </Menu>
    </div>
  );
}
