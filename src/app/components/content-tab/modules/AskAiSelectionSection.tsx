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
//
// WAVE 2 (docs/bulk-bar-reorganization-acceptance-criteria.md, section 3b/D1,
// D5): this section now owns exactly one of the bar's thirteen catalog
// groups, "askAi", and wraps its own content in <BulkBarGroup> rather than
// the old bare `.bulkRow` + `.bulkLabel` pair - BulkBarGroup's own heading
// renders `group.label` ("Ask AI"), so the `.bulkLabel` span is removed
// (AC2/D0). "askAi" is one of only two groups in the whole bar that DEFAULT
// CLOSED (`defaultOpen: false` in bulkBarGroupCatalog.ts), because it is
// genuinely read-only - a read, per this file's own header comment above,
// exactly like Download. Unlike Download this row has no PERMANENT
// unavailable-reason concept (see the header comment above on why), so
// `runtime.hasUnavailableReason` is always false here - only `busy` is real.
//
// HARD RULE (D3): the body below is NEVER gated on `open`. A native
// `<details>` hides its content without unmounting it, so `<BulkBarGroup>`
// always renders `children` unconditionally - only the native `open`
// attribute (mirrored from `groupOpen`'s result) controls visibility.
import { Button } from "@mui/material";
import styles from "../../../page.module.css";
import { BulkBarGroup } from "./BulkBarGroup";
import { groupById, type BulkBarFacts, type BulkBarGroupRuntime } from "./bulkBarGroups";
import type { BulkBarGroupsApi } from "./useBulkBarGroups";

export interface AskAiSelectionSectionProps {
  /** The bar's shared fact bag (./bulkBarGroups.ts) - ONE object, built once
   * by ModulesView and threaded to every section unchanged, so this group's
   * collapse/tier decision can never drift from what the rest of the bar
   * sees for the same selection. Only ever read through the pure functions
   * `<BulkBarGroup>` itself calls - this file does not branch on any field
   * directly. */
  facts: BulkBarFacts;
  /** The bar's one shared open/closed persistence API (useBulkBarGroups.ts),
   * owned by ModulesView (called exactly once there) and passed down
   * unchanged - never constructed here (D3: a second instance would corrupt
   * the persisted map). */
  groupsState: BulkBarGroupsApi;
  busy: boolean;
  onAskAi: () => void;
}

export function AskAiSelectionSection({ facts, groupsState, busy, onAskAi }: AskAiSelectionSectionProps) {
  const runtime: BulkBarGroupRuntime = { busy, armed: false, hasUnavailableReason: false };

  return (
    <BulkBarGroup group={groupById("askAi")} facts={facts} runtime={runtime} state={groupsState}>
      <div className={styles.bulkRow}>
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
    </BulkBarGroup>
  );
}
