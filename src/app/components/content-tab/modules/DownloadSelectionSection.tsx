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
import { Button } from "@mui/material";
import styles from "../../../page.module.css";
import type { SelectionDownloadBusy, SelectionDownloadFormat } from "./useSelectionDownload";

export interface DownloadSelectionSectionProps {
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
  busy,
  onDownload,
  imsccUnavailableReason,
  zipUnavailableReason,
}: DownloadSelectionSectionProps) {
  const ids = reasonIds([imsccUnavailableReason, zipUnavailableReason]);
  const unavailableSx = { color: "var(--text-secondary)", borderColor: "var(--text-secondary)" } as const;

  return (
    <div className={styles.bulkRow}>
      <span className={styles.bulkLabel}>Download</span>
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
  );
}
