"use client";

// F2: "Extract from photo" - opened from the course row's Textbook cell (the
// button and wiring live in CourseRow.tsx, a later wave; this file only owns
// the modal itself).
//
// A1-A4: built on MUI `Dialog` (already imported and used elsewhere in this
// feature - CoursesTable.tsx's copy-confirmation dialog) rather than a
// hand-rolled `<section role="dialog" aria-modal="true">`. See
// RecommendTextbooksModal.tsx's file header for the full explanation (same
// fix, same file); the short version: Dialog is built on Modal, which always
// wraps its content in Unstable_TrapFocus (disableAutoFocus/
// disableEnforceFocus/disableRestoreFocus all default to `false` -
// node_modules/@mui/material/Modal/Modal.js), so focus-on-open, a focus
// trap, Escape-to-close, and focus-restore-on-close are all supplied for
// free, verified against @mui/material 9.0.1 source.
//
// AC13: three ways in - file picker, drag-and-drop, and Ctrl/Cmd-V paste of
// an image. Paste is the PRIMARY path (the actual ask is "a screencap"), so
// its listener is attached to the dialog's own Paper element (via
// paperRef below - Dialog always focuses this element on open, the same
// element AC13 needs the paste listener to be reachable from), not
// document, and removed on unmount.
import { useCallback, useEffect, useRef, useState } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import { extractTextbookFromImageAction } from "@/app/actions";
import { getStoredProvider } from "@/lib/llm-provider";
import { readFileBase64 } from "@/lib/courses-tab-helpers";
import { checkFileWireBudget } from "@/lib/upload-budget";
import {
  emptyFields,
  formatTextbookValue,
  TEXTBOOK_FIELD_LABELS,
  TEXTBOOK_FIELD_ORDER,
  type TextbookFields,
} from "@/lib/textbook-recommendations";
import type { UploadedFile } from "@/lib/llm-files";
import type { Course } from "@/lib/supabase/courses";
import styles from "../../page.module.css";
import tableStyles from "./CoursesTable.module.css";

export interface TextbookPhotoModalProps {
  course: Course;
  onSaveTextbook: (value: string) => Promise<boolean>;
  onClose: () => void;
}

function storageKey(courseId: string): string {
  return `ta-textbook-photo-${courseId}`;
}

/** AC20 restore: a corrupt/hand-edited entry falls back to empty fields
 *  rather than throwing, same defensive shape as the rest of the app's
 *  localStorage readers (see WeeklyChecklistOverviewModal.tsx's readJSON). */
function readStoredFields(courseId: string): TextbookFields {
  if (typeof window === "undefined") return emptyFields();
  try {
    const raw = window.localStorage.getItem(storageKey(courseId));
    if (!raw) return emptyFields();
    const parsed = JSON.parse(raw) as Partial<Record<keyof TextbookFields, unknown>>;
    const result = emptyFields();
    for (const key of TEXTBOOK_FIELD_ORDER) {
      const value = parsed[key];
      if (typeof value === "string") result[key] = value;
    }
    return result;
  } catch {
    return emptyFields();
  }
}

// AC15: images and PDF only - everything else is rejected before any call
// is made.
function isAcceptedFile(file: File): boolean {
  return file.type.startsWith("image/") || file.type === "application/pdf";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TextbookPhotoModal({ course, onSaveTextbook, onClose }: TextbookPhotoModalProps) {
  const [fields, setFields] = useState<TextbookFields>(() => readStoredFields(course.id));
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // BUG-6 fix: a distinct, non-error notice for "the model read the image
  // but recognized nothing" - styled like the neutral fieldHint below rather
  // than the danger-colored `error` paragraph, since nothing actually failed.
  const [note, setNote] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const paperRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chooseFileButtonRef = useRef<HTMLButtonElement | null>(null);
  // Fix (with A1-A4): removeFile() unmounts the very "Remove" button the
  // user just activated, destroying focus mid-dialog. A ref (not state) so
  // the effect below can clear it with a plain mutation rather than a
  // setState call - "Choose file" is conditionally rendered on `!file`, so
  // it is not in the DOM yet during the same synchronous removeFile() call,
  // and only exists once the re-render this flag reacts to has happened.
  const pendingChooseFocusRef = useRef(false);

  // AC20: persist the editable field values under a per-course key, restored
  // on open via the lazy useState initializer above, cleared on a successful
  // save (see save() below). Writes on every change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey(course.id), JSON.stringify(fields));
    } catch {
      // Quota exceeded or private-browsing restriction - not fatal, the
      // instructor's edits still work for the rest of this session.
    }
  }, [fields, course.id]);

  // Fix: move focus to "Choose file" once it re-mounts after a removal - see
  // the pendingChooseFocusRef comment above. A ref read/mutation, not
  // setState, so this never triggers a cascading render.
  useEffect(() => {
    if (pendingChooseFocusRef.current && !file) {
      chooseFileButtonRef.current?.focus();
      pendingChooseFocusRef.current = false;
    }
  }, [file]);

  // Revoke the previous thumbnail's object URL whenever it changes, and on
  // unmount - one owner of the revoke call, so a file swap can never leak a
  // URL nor double-revoke a URL some other code path already freed.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFile = useCallback((candidate: File) => {
    setError(null);
    setNote(null);
    if (!isAcceptedFile(candidate)) {
      setError(`"${candidate.name}" is not an image or a PDF - attach an image or a PDF instead.`);
      return;
    }
    setFile(candidate);
    setPreviewUrl(candidate.type.startsWith("image/") ? URL.createObjectURL(candidate) : null);
  }, []);

  // AC13(c): the primary path. Attached to the dialog's own Paper element
  // (paperRef), never to document, and removed on unmount.
  useEffect(() => {
    const el = paperRef.current;
    if (!el) return;
    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.kind !== "file") continue;
        const pasted = item.getAsFile();
        if (!pasted) continue;
        event.preventDefault();
        handleFile(pasted);
        return;
      }
    };
    el.addEventListener("paste", handlePaste);
    return () => el.removeEventListener("paste", handlePaste);
  }, [handleFile]);

  const removeFile = () => {
    setFile(null);
    setPreviewUrl(null);
    setError(null);
    setNote(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    pendingChooseFocusRef.current = true;
  };

  // BUG-6 fix: when the model read the screenshot but recognized nothing,
  // every extracted field is empty. Previously this silently blanked the
  // form via setFields (wiping any hand-typed draft) and gave the
  // instructor no indication anything happened - "Save to textbook" would
  // just disable itself with no explanation. Detected via
  // formatTextbookValue's own "all fields empty" rule (AC44) rather than a
  // second empty-check, so this can never drift from what the formatter
  // considers empty. The existing fields are left untouched; only when at
  // least one field came back does the current overwrite behavior run.
  const extract = async () => {
    if (!file || extracting) return;
    setError(null);
    setNote(null);

    // Client-side, before any bytes are read: the file's type was already
    // checked in handleFile (isAcceptedFile) when it was selected, but its
    // size never was. Above the platform's request-body cap the request
    // sent from extractTextbookFromImageAction never reaches the server -
    // its promise rejects rather than resolving to {error} - so this needs
    // to be caught here, in FILE bytes, before that call is made.
    const sizeCheck = checkFileWireBudget(file.size, "That file");
    if (!sizeCheck.ok) {
      setError(sizeCheck.error ?? "That file is too large to upload.");
      return;
    }

    setExtracting(true);
    try {
      const base64 = await readFileBase64(file);
      const uploaded: UploadedFile = { name: file.name, base64, mimeType: file.type };
      const result = await extractTextbookFromImageAction([uploaded], getStoredProvider());
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSaved(false);
      if (formatTextbookValue(result.fields) === "") {
        setNote(
          "No textbook details could be read from that image - try a clearer screenshot, or type the details in below."
        );
        return;
      }
      setFields(result.fields);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read the attached file.");
    } finally {
      setExtracting(false);
    }
  };

  const formatted = formatTextbookValue(fields);

  const save = async () => {
    if (saving || !formatted) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const ok = await onSaveTextbook(formatted);
    setSaving(false);
    if (!ok) {
      setError("Could not save the textbook field.");
      return;
    }
    setSaved(true);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(storageKey(course.id));
      } catch {
        // Nothing left to clean up if storage is unavailable.
      }
    }
  };

  const updateField = (key: keyof TextbookFields, value: string) => {
    setSaved(false);
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={false}
      slotProps={{ paper: { className: styles.previewModal, ref: paperRef } }}
    >
      <div className={styles.previewHeader}>
        <div>
          <DialogTitle sx={{ padding: 0, fontSize: "var(--font-size-lg)", color: "var(--text-primary)", wordBreak: "break-word" }}>
            Extract from photo
          </DialogTitle>
          <p className={styles.previewMeta}>{course.name}</p>
        </div>
        <button type="button" className={styles.previewCloseButton} onClick={onClose}>
          Close
        </button>
      </div>

      <DialogContent sx={{ padding: "0 var(--space-4)", overflow: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) handleFile(dropped);
          }}
          className={tableStyles.dropZone}
          style={{
            // N2: drag-active is not colour-only - the border switches from
            // a thin dashed line to a thicker solid one, so the state also
            // reads for anyone who cannot distinguish the colour change. Both
            // the border and background genuinely depend on drag state, so
            // they stay inline over .dropZone's static shell (radius/padding/
            // gap/layout).
            border: dragActive ? "2px solid var(--accent)" : "1px dashed var(--field-border)",
            background: dragActive ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent",
          }}
        >
          {!file ? (
            <>
              <p className={styles.fieldHint} style={{ flex: "1 1 220px" }}>
                Drag and drop a screenshot or PDF here, paste one (Ctrl/Cmd-V) anywhere in this
                window, or choose a file.
              </p>
              <Button
                ref={chooseFileButtonRef}
                size="small"
                variant="outlined"
                onClick={() => fileInputRef.current?.click()}
                sx={{ textTransform: "none" }}
              >
                Choose file
              </Button>
            </>
          ) : (
            <>
              {previewUrl ? (
                // A transient client-side object URL (URL.createObjectURL),
                // not an app asset - next/image cannot optimize this.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  // N1: this is the user's confirmation that the right
                  // screenshot is attached, not decoration.
                  alt={`Selected image: ${file.name}`}
                  className={tableStyles.thumbImage}
                />
              ) : (
                <div className={tableStyles.thumbPlaceholder}>
                  PDF
                </div>
              )}
              <div style={{ flex: "1 1 200px" }}>
                <p style={{ wordBreak: "break-word" }}>{file.name}</p>
                <p className={styles.previewMeta}>{formatFileSize(file.size)}</p>
              </div>
              <Button size="small" variant="outlined" onClick={removeFile} sx={{ textTransform: "none" }}>
                Remove
              </Button>
              <Button size="small" variant="outlined" onClick={() => fileInputRef.current?.click()} sx={{ textTransform: "none" }}>
                Replace
              </Button>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className={tableStyles.hiddenInput}
            onChange={(e) => {
              const picked = e.target.files?.[0];
              if (picked) handleFile(picked);
              e.target.value = "";
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <Button
            size="small"
            variant="contained"
            disabled={!file || extracting}
            onClick={() => void extract()}
            sx={{ textTransform: "none" }}
          >
            Extract details
          </Button>
          {extracting && (
            <>
              <CircularProgress size={18} />
              <span style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>Extracting...</span>
            </>
          )}
        </div>

        {/* B4: always mounted (never conditional) so a screen reader
            registers these two regions before the first mutation and
            actually announces the arrival of an error or a notice -
            including the "no textbook details could be read" note, which
            exists specifically to explain why Save is disabled. Same rule
            A5 applies to CoursesTable.tsx's own status regions. */}
        <p role="alert" className={`${styles.previewMeta} ${tableStyles.dangerText}`}>
          {error ?? ""}
        </p>
        <p role="status" aria-live="polite" className={styles.fieldHint}>
          {note ?? ""}
        </p>

        <div className={tableStyles.stackSm}>
          {TEXTBOOK_FIELD_ORDER.map((key) => (
            <TextField
              key={key}
              size="small"
              fullWidth
              label={TEXTBOOK_FIELD_LABELS[key]}
              value={fields[key]}
              onChange={(e) => updateField(key, e.target.value)}
            />
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <Button
            size="small"
            variant="contained"
            disabled={saving || !formatted}
            onClick={() => void save()}
            sx={{ textTransform: "none" }}
          >
            Save to textbook
          </Button>
          {saving && (
            <>
              <CircularProgress size={18} />
              <span style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>Saving...</span>
            </>
          )}
          {saved && <span className={`${styles.ghBadge} ${styles.ghBadgeSuccess}`}>Saved to Textbook</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
