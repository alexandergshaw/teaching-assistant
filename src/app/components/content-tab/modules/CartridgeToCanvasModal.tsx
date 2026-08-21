"use client";

// The "Upload to Canvas" modal (docs/modules-cartridge-import-upload-
// acceptance-criteria.md AC15/AC16/AC18/AC19/AC20). Rendered from
// ModulesViewSecondaryModals.tsx, NEVER from ModulesHeaderBar / the sticky
// header (AC6/AC15) - see DownloadSelectionSection.tsx's and
// GeneratedPreviewModal.tsx's own header comments for exactly why: the
// sticky header is `position: sticky` with a `backdrop-filter`, which makes
// it BOTH a stacking context AND the containing block for `position: fixed`
// descendants, so a modal painted from inside it sizes to the header's own
// box instead of the viewport. ModalShell's backdrop is `position: fixed`,
// so this component must render at ModulesView's root (via
// ModulesViewSecondaryModals) and nowhere inside `styles.ccStickyHeader`.
//
// ALL STATE LIVES IN THE HOOK, NOT HERE (`cartridge` is
// `useCartridgeToCanvas`'s full return value, owned and instantiated by
// ModulesView.tsx per this feature's own file assignment). This component is
// deliberately pure presentation - every field it reads and every setter it
// calls belongs to `UseCartridgeToCanvasReturn`. One grouped prop rather than
// the ~20 flat props GeneratedPreviewModal.tsx takes for its own hook-backed
// state: that flat-prop shape is exactly what
// generatedPreviewModal.wiring.test.ts exists to police (a prop declared and
// then silently dropped at the render site), which is a cost worth paying
// there because that modal's props come from FIVE different call sites
// spread across ModulesView.tsx. This modal has exactly one call site
// (ModulesViewSecondaryModals.tsx) and one owner (the hook instance itself),
// so grouping the whole return value into one `cartridge` prop cannot drift
// the same way - there is nothing to bind field-by-field that the hook
// itself doesn't already guarantee.
import { Button, Checkbox, FormControlLabel, MenuItem, TextField } from "@mui/material";
import { useRef, type RefObject } from "react";
import styles from "../../../page.module.css";
import { ModalShell } from "../../ui/ModalShell";
import type { CartridgeUploadSource, UseCartridgeToCanvasReturn } from "./useCartridgeToCanvas";

// AC14's plain-language phase labels - the exact wording the AC specifies in
// parentheses next to each phase name.
const PHASE_LABEL: Record<string, string> = {
  idle: "",
  preparing: "Reading the cartridge file…",
  creating: "Asking Canvas to start the import…",
  uploading: "Uploading the cartridge to Canvas…",
  processing: "Canvas is unpacking the cartridge…",
  selecting: "Choose what to import…",
  done: "Done.",
  failed: "The import failed.",
};

export interface CartridgeToCanvasModalProps {
  cartridge: UseCartridgeToCanvasReturn;
  courseName?: string;
  onClose: () => void;
  /** The "Upload to Canvas" button that opened this modal - forwarded to
   * ModalShell for focus restoration. */
  restoreFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusRefs?: readonly RefObject<HTMLElement | null>[];
}

export function CartridgeToCanvasModal({ cartridge, courseName, onClose, restoreFocusRef, fallbackFocusRefs }: CartridgeToCanvasModalProps) {
  const deviceFileInputRef = useRef<HTMLInputElement | null>(null);
  const busy = cartridge.phase !== "idle" && cartridge.phase !== "done" && cartridge.phase !== "failed";
  const statusText = cartridge.timedOut
    ? "Canvas is still working on this import. It will finish on its own - you can close this window; the import continues in the background."
    : PHASE_LABEL[cartridge.phase];

  return (
    <ModalShell
      label="Upload a cartridge to Canvas"
      onDismiss={onClose}
      restoreFocusRef={restoreFocusRef}
      fallbackFocusRefs={fallbackFocusRefs}
      contentStyle={{ width: "min(560px, 94vw)", maxWidth: "none" }}
    >
      <div className={styles.previewHeader}>
        <h3>Upload a cartridge to Canvas</h3>
        <button type="button" className={styles.previewCloseButton} onClick={onClose}>
          Close
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "72vh", overflowY: "auto" }}>
        <p className={styles.fieldHint} style={{ margin: 0 }}>
          Starts a Canvas content migration in {courseName || "the live course"} and imports the cartridge into it -
          this is separate from importing a cartridge into this app (see the &quot;Import cartridge&quot; button).
        </p>

        {/* AC4/AC20: rendered unconditionally - null on the live source, so
            there is nothing to show there. */}
        {cartridge.exportNote && <p className={styles.fieldHint} style={{ margin: 0 }}>{cartridge.exportNote}</p>}

        <div className={styles.field}>
          <label htmlFor="cartridge-upload-source">Cartridge source</label>
          <TextField
            id="cartridge-upload-source"
            select
            size="small"
            fullWidth
            value={cartridge.source}
            onChange={(e) => cartridge.setSource(e.target.value as CartridgeUploadSource)}
            disabled={busy}
          >
            <MenuItem value="device">A file from your device</MenuItem>
            <MenuItem value="export" disabled={!cartridge.exportSourceAvailable}>
              This course&apos;s stored export{cartridge.exportFileName ? ` (${cartridge.exportFileName})` : ""}
            </MenuItem>
          </TextField>
          {/* AC16: say why the export option is unavailable rather than hiding it. */}
          {!cartridge.exportSourceAvailable && cartridge.exportSourceUnavailableReason && (
            <p className={styles.fieldHint} style={{ margin: 0 }}>{cartridge.exportSourceUnavailableReason}</p>
          )}
        </div>

        {cartridge.source === "device" && (
          <div className={styles.field}>
            <label>Cartridge file (.imscc or .zip)</label>
            <input
              ref={deviceFileInputRef}
              type="file"
              accept=".imscc,.zip,application/zip"
              disabled={busy}
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null;
                cartridge.setDeviceFile(picked);
              }}
            />
            {cartridge.deviceFile && (
              <p className={styles.fieldHint} style={{ margin: 0 }}>
                {cartridge.deviceFile.name} ({(cartridge.deviceFile.size / (1024 * 1024)).toFixed(1)} MB)
              </p>
            )}
          </div>
        )}

        {cartridge.preflightError && <p className={styles.error}>{cartridge.preflightError}</p>}

        <FormControlLabel
          control={
            <Checkbox size="small" checked={cartridge.selective} onChange={(e) => cartridge.setSelective(e.target.checked)} disabled={busy} />
          }
          label="Choose what to import"
          style={{ margin: 0 }}
        />
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={cartridge.overwriteQuizzes}
              onChange={(e) => cartridge.setOverwriteQuizzes(e.target.checked)}
              disabled={busy}
            />
          }
          label={
            <span className={styles.fieldHint} style={{ margin: 0 }}>
              Overwrite existing quizzes with matching identifiers - replaces quiz content already in the live course.
            </span>
          }
          style={{ alignItems: "flex-start", margin: 0 }}
        />

        {cartridge.phase === "selecting" ? (
          <div className={styles.field}>
            <label>Content types to import</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {cartridge.copyTypes.map((t) => (
                <FormControlLabel
                  key={t.key}
                  control={<Checkbox size="small" checked={cartridge.chosenTypes.has(t.key)} onChange={() => cartridge.toggleType(t.key)} />}
                  label={t.label}
                  style={{ margin: 0, flex: "0 0 140px" }}
                />
              ))}
            </div>
            <Button
              variant="contained"
              size="small"
              style={{ alignSelf: "flex-start", marginTop: 8 }}
              onClick={cartridge.submitSelectedTypes}
              disabled={cartridge.chosenTypes.size === 0}
            >
              Submit selection
            </Button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid var(--card-border)" }}>
            <Button variant="contained" size="small" onClick={cartridge.start} disabled={!cartridge.canStart || busy}>
              {busy ? "Working…" : "Upload to Canvas"}
            </Button>
            {statusText && <span className={styles.fieldHint} style={{ margin: 0 }}>{statusText}</span>}
          </div>
        )}

        {cartridge.error && <p className={styles.error}>{cartridge.error}</p>}
        {cartridge.phase === "done" && <p style={{ fontSize: "0.85rem", color: "var(--success)", margin: 0 }}>Uploaded successfully.</p>}
      </div>
    </ModalShell>
  );
}
