"use client";

// Bulk bar row for opening the AI Chatbot with the current module/item
// selection loaded as context - docs/modules-selection-ask-ai-acceptance-
// criteria.md (section A). Visual/structural sibling of
// DownloadSelectionSection (read in full before this was written): same
// bulkRow/bulkLabel/bulkHint grammar, and the same aria-disabled/native-
// disabled split for a control that can be unavailable.
//
// RENDERS NO MODAL, DIALOG, POPOVER OR FIXED-POSITION OVERLAY, on purpose
// (D4): this row lives inside ModulesView's `<div className={styles.ccStickyHeader}>`,
// which is `position: sticky` with a backdrop-filter - both independently
// make it a stacking context AND the containing block for `position: fixed`
// descendants, so anything fixed rendered from inside here paints at the
// header's own size instead of the viewport (see GeneratedPreviewModal.tsx's
// own header comment, and generatedPreviewModal.wiring.test.ts, which fails
// any component the header renders that contains `styles.previewBackdrop`).
// D2: one click, no intermediate dialog - the bulk bar IS the selection UI,
// so there is nothing left for a dialog to configure.
//
// D3: this row is a READ, never a write - it gathers whatever the
// instructor already selected and hands it to the chat as reference text; it
// does not create or change anything in Canvas. `gateOperation`
// (contentSourceGating.ts) is therefore deliberately NOT called here, for the
// same reason DownloadSelectionSection's own header comment gives: every one
// of its "blocked" reasons is worded for a WRITE that has nowhere to land,
// and would wrongly hide this row for every export-sourced selection.
//
// UNLIKE DownloadSelectionSection, this row has no PERMANENT "cannot do this
// right now" reason to model - useSelectionChatContext.ts resolves the
// course row and re-enforces the item cap entirely server-side, reporting
// any refusal through `setNote` once the instructor actually activates the
// control (see that hook's own header comment). The only state this button
// ever has is the TRANSIENT one-gather-at-a-time busy flag, which native
// `disabled` already covers correctly (it is momentary, not something a
// keyboard/screen-reader user needs a persistent, discoverable reason for -
// the same split DownloadSelectionSection's own header comment draws between
// its native-`disabled` busy guard and its `aria-disabled` unavailable-reason
// controls). `onClick` still always calls `onAskAi` regardless - the decision
// to proceed or explain (busy guard, empty-selection no-op, cap refusal,
// server error) lives entirely in the hook, never in this button, matching
// A7 and the precedent DownloadSelectionSection's own header comment
// documents for why that split matters.
//
// NO PERSISTED CONTROL STATE (D5): this row has no textbox/select/checkbox -
// just one button - so this repo's "every new control persists across
// reloads under a ta- key" rule has nothing to apply to here.
import { Button } from "@mui/material";
import styles from "../../../page.module.css";

export interface AskAiSelectionSectionProps {
  busy: boolean;
  onAskAi: () => void;
}

export function AskAiSelectionSection({ busy, onAskAi }: AskAiSelectionSectionProps) {
  return (
    <div className={styles.bulkRow}>
      <span className={styles.bulkLabel}>Ask AI</span>
      <Button
        variant="outlined"
        size="small"
        onClick={onAskAi}
        disabled={busy}
        title="Open the AI Chatbot with the selected modules/items loaded as context - nothing is written to Canvas or saved anywhere"
      >
        {busy ? "Loading selection…" : "Ask AI"}
      </Button>
      <span className={styles.bulkHint}>
        Opens the AI Chatbot with the selected modules and items loaded as reference context. Nothing is written to
        Canvas, to Supabase Storage, or to the course tile.
      </span>
    </div>
  );
}
