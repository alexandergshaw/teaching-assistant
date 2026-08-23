"use client";

// Bulk bar row for downloading a course export (.imscc) and/or a plain zip
// of the current selection - docs/lms-selection-export-download-acceptance-
// criteria.md (AC1). Visual/structural sibling of GenerateFromSelectionSection
// (read in full before this was written): same bulkRow/bulkLabel/bulkHint
// grammar, and the same "one button per option, no select" idiom - only two
// options here too, so the same reasoning that file's own header comment
// gives for kind buttons over a dropdown holds unchanged.
//
// RENDERS NO MODAL, DIALOG, POPOVER OR FIXED-POSITION OVERLAY, on purpose:
// this row lives inside ModulesView's `<div className={styles.ccStickyHeader}>`,
// which is `position: sticky` with a backdrop-filter - both independently
// make it a stacking context AND the containing block for `position: fixed`
// descendants, so anything fixed rendered from inside here paints at the
// header's own size instead of the viewport (see GeneratedPreviewModal.tsx's
// own header comment, and generatedPreviewModal.wiring.test.ts, which fails
// any component the header renders that contains `styles.previewBackdrop`).
// This row never needs a modal in the first place - a download is a single
// click, not a multi-step flow - so the constraint costs nothing here.
//
// AC8: this row is a READ, never a write - it packages whatever the
// instructor already selected and hands back bytes; it does not create or
// change anything in Canvas. `gateOperation` (contentSourceGating.ts) is
// therefore deliberately NOT called here: every one of its "blocked"
// reasons is worded for a WRITE that has nowhere to land ("no Canvas
// destination", "no Canvas identity to write to"), and `hasLiveCourse` is
// hardcoded false for every export-sourced selection today (ContentTab.tsx)
// - calling gateOperation with any subject would therefore ALSO hide the
// .zip control whenever viewing an export, contradicting AC12 (an
// export-sourced selection must still be able to download a .zip). The two
// real constraints this feature has - AC12's cartridge/export fidelity rule,
// and the "no usable courseUrl to send" case a verification pass added (see
// useSelectionDownload.ts's own comment on COURSE_URL_UNAVAILABLE_REASON) -
// are both facts about whether THIS PARTICULAR request can succeed, not
// about write permission, so they are modelled as the
// imsccUnavailableReason/zipUnavailableReason strings computed by the hook,
// rather than forced through gateOperation's write-shaped vocabulary.
//
// UNAVAILABLE IS `aria-disabled`, NEVER A SILENT CLICK. Both controls stay
// keyboard-reachable and focusable while unavailable (native `disabled`
// removes a control from the tab order entirely, which would make the
// reason undiscoverable - the same split ModuleItemRow.tsx uses for its own
// due-date/points/remove controls; see that file's own header comment).
// Critically, `onClick` below always calls `onDownload` regardless of
// availability - the DECISION of whether to proceed or surface a reason
// lives entirely in useSelectionDownload's own download() (see that file's
// header comment for why), never in this button. A verification pass found
// an earlier draft of this file guarded `onClick` itself before calling
// `onDownload`, which made an aria-disabled, keyboard-reachable control
// produce NOTHING AT ALL on activation - worse than a plain disabled button,
// since it was reachable and gave no feedback either way.
//
// NO OPACITY MULTIPLIER ON LABEL TEXT. An unavailable control signals its
// state via `aria-disabled` plus the always-visible reason text rendered
// below it, and (optionally) a colour change to `var(--text-secondary)` -
// the SAME muted token this row's own bulkLabel/bulkHint already use.
// Multiplying the label's alpha (an earlier draft's `sx={{ opacity: 0.55 }}`)
// very likely drops it below the 4.5:1 text contrast floor this repo
// enforces elsewhere (src/app/focusRing.wiring.test.ts computes WCAG
// contrast itself; see docs/REGRESSION.md entries 256-257).
// `var(--text-secondary)` is already a measured, compliant colour against
// this row's own `--card-background` backdrop (see `.bulkLabel`/`.bulkHint`
// in page.module.css, both painted right next to these buttons), so reusing
// it costs nothing and introduces no new colour.
//
// NO PERSISTED CONTROL STATE: this row has no textbox/select/checkbox (just
// two one-click buttons), so this repo's "every new control persists across
// reloads under a ta- key" rule has nothing to apply to here.
//
// WAVE 2 (docs/bulk-bar-reorganization-acceptance-criteria.md, section 3b/D1,
// D5): this section now owns exactly one of the bar's thirteen catalog
// groups, "download", and wraps its own content in <BulkBarGroup> rather than
// the old bare `.bulkRow` + `.bulkLabel` pair - BulkBarGroup's own heading
// renders `group.label` ("Download"), so the `.bulkLabel` span is removed
// (AC2/D0). "download" is one of only two groups in the whole bar that
// DEFAULT CLOSED (`defaultOpen: false` in bulkBarGroupCatalog.ts), because it
// is genuinely read-only - it touches nothing beyond the instructor's own
// device (AC8's own header comment above). The `runtime` passed to
// `<BulkBarGroup>` below sets `hasUnavailableReason` whenever either control
// currently carries a live unavailable reason, which force-opens the group so
// that reason is never hidden behind a closed disclosure a keyboard/
// screen-reader user would have to think to open.
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
import type { SelectionDownloadBusy, SelectionDownloadFormat } from "./useSelectionDownload";

export interface DownloadSelectionSectionProps {
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
  busy: SelectionDownloadBusy;
  onDownload: (format: SelectionDownloadFormat) => void;
  /** Why the .imscc control cannot be used right now, or null when it can -
   * from useSelectionDownload's own selectionDownloadUnavailableReason
   * (AC12's export-fidelity refusal, or the "no usable courseUrl" case). A
   * reason STRING rather than a plain boolean, on purpose: the hook, not
   * this component, owns the decision of WHY a control might be
   * unavailable - see this file's own header comment. */
  imsccUnavailableReason: string | null;
  /** Same as imsccUnavailableReason, for the .zip control - today this only
   * ever fires for the "no usable courseUrl" case, since a plain .zip has no
   * format-driven restriction of its own. */
  zipUnavailableReason: string | null;
}

/** Assigns a stable DOM id to each DISTINCT reason among the two controls, so
 * `aria-describedby` can point both controls at ONE hint element when they
 * are unavailable for the identical reason (the "no usable courseUrl" case
 * disables both controls with the same sentence) rather than rendering that
 * sentence twice in the row. */
function reasonIds(reasons: Array<string | null>): Map<string, string> {
  const unique = [...new Set(reasons.filter((reason): reason is string => reason !== null))];
  return new Map(unique.map((reason, index) => [reason, `download-selection-reason-${index}`]));
}

export function DownloadSelectionSection({
  facts,
  groupsState,
  busy,
  onDownload,
  imsccUnavailableReason,
  zipUnavailableReason,
}: DownloadSelectionSectionProps) {
  const ids = reasonIds([imsccUnavailableReason, zipUnavailableReason]);
  const unavailableSx = { color: "var(--text-secondary)", borderColor: "var(--text-secondary)" } as const;
  // Force-opens this default-closed group whenever either control currently
  // carries a live unavailable reason (this file's own header comment,
  // "WAVE 2" section) - `groupOpen` (./bulkBarGroups.ts) treats
  // `hasUnavailableReason` exactly like `busy`/`armed`: it wins over both the
  // persisted value and the group's own declared default.
  const runtime: BulkBarGroupRuntime = {
    busy: busy !== "",
    armed: false,
    hasUnavailableReason: imsccUnavailableReason !== null || zipUnavailableReason !== null,
  };

  return (
    <BulkBarGroup group={groupById("download")} facts={facts} runtime={runtime} state={groupsState}>
      <div className={styles.bulkRow}>
        <Button
          variant="outlined"
          size="small"
          onClick={() => onDownload("imscc")}
          disabled={busy !== ""}
          // Native `disabled` alone covers the TRANSIENT busy reason;
          // `aria-disabled` + `aria-describedby` cover a PERMANENT unavailable
          // reason and keep the button reachable on keyboard focus while it
          // applies - see this file's header comment.
          aria-disabled={imsccUnavailableReason ? "true" : undefined}
          aria-describedby={imsccUnavailableReason ? ids.get(imsccUnavailableReason) : undefined}
          title={
            imsccUnavailableReason
              ? undefined
              : "Download a Common Cartridge (.imscc) built from the selected modules/items - nothing is written to Canvas or saved anywhere"
          }
          sx={imsccUnavailableReason ? unavailableSx : undefined}
        >
          {busy === "imscc" ? "Preparing course export…" : "Course export (.imscc)"}
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={() => onDownload("zip")}
          disabled={busy !== ""}
          aria-disabled={zipUnavailableReason ? "true" : undefined}
          aria-describedby={zipUnavailableReason ? ids.get(zipUnavailableReason) : undefined}
          title={
            zipUnavailableReason
              ? undefined
              : "Download a zip of the selected modules/items - nothing is written to Canvas or saved anywhere"
          }
          sx={zipUnavailableReason ? unavailableSx : undefined}
        >
          {busy === "zip" ? "Preparing files…" : "Files (.zip)"}
        </Button>
        {[...ids.entries()].map(([reason, id]) => (
          <span key={id} id={id} className={styles.bulkHint}>
            {reason}
          </span>
        ))}
        <span className={styles.bulkHint}>
          Downloads to your device as a course export or a zip of just the selected modules and items. Nothing is
          written to Canvas, to Supabase Storage, or to the course tile.
        </span>
      </div>
    </BulkBarGroup>
  );
}
