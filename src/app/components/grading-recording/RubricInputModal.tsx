"use client";

// REACHABILITY NOTICE - READ BEFORE CHANGING HOW THIS MODAL IS WIRED.
//
// This modal IS reachable, as of the assembly wave that wired grading-via-
// recording together: src/app/components/grading-recording/
// GradingRecordingPanel.tsx (grading-via-recording's own inner view, reached
// from Manual > Recording > "Grading (from a recording)") renders it behind
// an "Add rubric"/"Edit rubric" button, and it also opens automatically the
// moment an instructor lands there from the Knowledge base's "Grade via
// recording" bulk-bar button (src/app/components/KnowledgeTab.tsx, via
// `openRecordingTool({ view: "grading", openRubric: true, ... })` -
// see src/lib/recording-launch.ts's own RecordingLaunch.openRubric doc
// comment). Grep the repo and confirm before trusting any comment, including
// this one, if that ever changes again - this repo has been bitten by a
// stale reachability claim before (LegibilityProbeModal.tsx's own notice
// documents the same discipline).
//
// The two conditions this file used to wait on (R1/R1b's legibility
// measurement passing, and a grading-via-recording view existing to host it)
// are both satisfied: the owner ran the legibility probe against a real
// submission and reported it legible (see grading-row.ts's own header), and
// GradingRecordingPanel.tsx is that view.
//
// What this modal DOES do: it ONLY collects and lets the
// instructor review rubric text; it does not capture a recording, does not
// grade anything, and does not render a table - those are separate, later
// pieces. Per requirement 5, the text is handed to the caller via onSubmit
// and NOTHING here persists it - no localStorage, no persisted-control key of
// any kind, no server record. That is a deliberate exception to this repo's
// usual "every new textbox persists" rule (memory: persist-ui-control-state):
// a rubric is exactly as sensitive as a syllabus (AC section 2) and this
// feature's whole point is that nothing about it lingers once the instructor
// moves on.
//
// R2a - PLAIN-TEXT PASTE IS THE PRIMARY PATH. The textarea below works with
// zero uploads: type or paste, "Use this rubric" enables the moment there is
// non-blank text (rubric-input.ts's isRubricTextUsable/canSubmitRubric).
// Upload is a convenience that FILLS THE SAME TEXTAREA rather than a
// competing, separately-submitted mode - so "the extracted text is shown for
// review before it is used" (R2c) falls out of the one control the
// instructor already has to look at to submit anything, and an instructor
// who wants to fix a mangled extraction edits it right there, in place,
// rather than starting over.
//
// REUSE, NOT NEW MACHINERY (see this feature's reuse survey):
//  - `validateFileUpload` (src/lib/syllabus-upload-validation.ts) - the same
//    pure gate SyllabusUploadControl.tsx runs client-side before a byte
//    uploads, and extractSyllabusTextAction runs again server-side, so this
//    control cannot accept anything either of those would refuse.
//  - The direct-to-Storage upload idiom SyllabusUploadControl.tsx uses:
//    upload straight to the private "course-files" bucket, never through a
//    server action body.
//  - `extractSyllabusTextAction` (src/app/actions/syllabus-upload.ts),
//    reused WHOLE and unmodified: it downloads the object, extracts text,
//    and ALWAYS deletes the object afterwards (success or failure) - a
//    rubric gets the identical "extract, then forget" lifecycle a syllabus
//    gets, and none of that download/extract/delete code is duplicated here.
//    The storage path below is still built with `syllabusUploadStoragePath`
//    (src/lib/syllabus-upload-source.ts) - reusing the ACTION whole means
//    reusing that one path builder too - but passed its own
//    `"rubric-uploads"` segment rather than the default `"syllabus-uploads"`,
//    so the object this control writes lives somewhere honestly named for
//    a rubric rather than under a path segment named for a different
//    feature. `withUploadedSyllabusFile`'s path guard, `isKnownUploadPath`,
//    accepts both segments (and only those two - see
//    UPLOAD_PATH_SEGMENTS in syllabus-upload-source.ts), so this control
//    cannot accidentally invent a third.
//
// NOT BUILT THIS WAVE: the scanned-PDF vision-model fallback R2b describes
// (sending the PDF inline to the vision model when extraction comes back
// empty - llm-files.ts's isGeminiInlineSupported already passes
// "application/pdf" through as inline data, so the capability exists). The
// AC explicitly allows deferring it ("If you judge the vision fallback too
// large for this wave, say so and make the empty-extraction message
// specific and actionable instead") and this wave takes that option: a real
// vision call needs its own server action, its own wire-budget check
// against the file bytes (the object is already deleted by the time
// extraction comes back empty, so the fallback would need the browser to
// resend the original File's bytes, not re-read from Storage), and its own
// failure handling - more than an assembly wave over already-shipped pieces
// should add. Instead, an empty or near-empty extraction gets a SPECIFIC,
// actionable message (rubric-input.ts's describeExtractionErrorMessage /
// describeSuspiciousExtractionMessage) that names the scanned-PDF
// possibility, states plainly that this app has no OCR, and tells the
// instructor to paste the text directly instead - never a generic failure.
import { useCallback, useId, useRef, useState, type ChangeEvent, type DragEvent, type RefObject } from "react";
import Button from "@mui/material/Button";
import { extractSyllabusTextAction } from "@/app/actions";
import { useSupabase } from "@/context/SupabaseProvider";
import { validateFileUpload } from "@/lib/syllabus-upload-validation";
import { SYLLABUS_UPLOAD_BUCKET, syllabusUploadStoragePath } from "@/lib/syllabus-upload-source";
import { ModalShell } from "../ui/ModalShell";
import styles from "../../page.module.css";
import {
  canSubmitRubric,
  describeRubricSourceLabel,
  describeStorageUploadFailureMessage,
  deriveUploadOutcomeNotice,
  NOT_SIGNED_IN_MESSAGE,
  type RubricTextSource,
  type RubricUploadNotice,
} from "./rubric-input";

export interface RubricInputModalProps {
  /** Called once, with the reviewed rubric text (already non-blank -
   * enforced by the disabled state of the submit button), when the
   * instructor confirms. This modal never persists the text itself
   * (requirement 5) - what the caller does with it, and where it flows
   * next (there is nothing to wire it to yet - AC section 5), is entirely
   * up to them. */
  onSubmit: (rubricText: string) => void;
  onClose: () => void;
  /** Forwarded to ModalShell - see its own props for the capture/connected
   * rules every caller follows. */
  restoreFocusRef?: RefObject<HTMLElement | null>;
  fallbackFocusRefs?: readonly RefObject<HTMLElement | null>[];
}

const ACCEPTED_EXTENSIONS = ".docx,.pdf,.txt,.md";

export function RubricInputModal({
  onSubmit,
  onClose,
  restoreFocusRef,
  fallbackFocusRefs,
}: RubricInputModalProps): React.ReactNode {
  const { supabase, user } = useSupabase();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaId = useId();

  const [rubricText, setRubricText] = useState("");
  const [source, setSource] = useState<RubricTextSource>("paste");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<RubricUploadNotice | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleTextChange = useCallback((event: ChangeEvent<HTMLTextAreaElement>) => {
    setRubricText(event.target.value);
    // Typing after an upload means the instructor is editing what came
    // back (or starting over) - the source label should track what is
    // ACTUALLY in the box, not what filled it a moment ago.
    setSource("paste");
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setNotice(null);

      // Client-side gate BEFORE a single byte uploads - the exact same
      // pure check the server runs again after downloading
      // (extractSyllabusTextAction -> validateAndExtractSyllabusText), so
      // the two gates can never disagree on what a rubric upload accepts.
      const validation = validateFileUpload(file.name, file.type, file.size);
      if (!validation.valid) {
        setNotice({ kind: "error", text: validation.error });
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      if (!user) {
        setNotice({ kind: "error", text: NOT_SIGNED_IN_MESSAGE });
        return;
      }

      setBusy(true);
      try {
        const uploadId = crypto.randomUUID();
        // Reuses the syllabus upload's own path builder - see this file's
        // header comment - but with the "rubric-uploads" segment, which
        // extractSyllabusTextAction's internal path guard (isKnownUploadPath)
        // also accepts, so this object lives under its own honestly-named
        // path rather than a "syllabus-uploads" one.
        const storagePath = syllabusUploadStoragePath(user.id, uploadId, validation.extension, "rubric-uploads");

        const { error: uploadError } = await supabase.storage
          .from(SYLLABUS_UPLOAD_BUCKET)
          .upload(storagePath, file, { contentType: file.type || undefined, upsert: false });

        if (uploadError) {
          setNotice({ kind: "error", text: describeStorageUploadFailureMessage(file.name) });
          return;
        }

        const result = await extractSyllabusTextAction({
          name: file.name,
          storagePath,
          mimeType: file.type,
        });

        const outcome = deriveUploadOutcomeNotice(file.name, validation.extension.replace(/^\./, ""), result);
        setNotice(outcome);

        if ("text" in result) {
          // R2c: the extracted text is shown for review, editable, before
          // it is used - even a suspiciously-short ("warning") result is
          // populated rather than swallowed, so the instructor sees
          // exactly what came back instead of taking this app's word for
          // it.
          setRubricText(result.text);
          setSource("upload");
          setUploadedFileName(file.name);
        }
      } catch (err) {
        setNotice({
          kind: "error",
          text: err instanceof Error ? err.message : "Could not read that file.",
        });
      } finally {
        setBusy(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [supabase, user]
  );

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile]
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOver(false);
      const file = event.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile]
  );

  const handleSubmit = useCallback(() => {
    if (!canSubmitRubric(rubricText, busy)) return;
    onSubmit(rubricText.trim());
  }, [rubricText, busy, onSubmit]);

  const canSubmit = canSubmitRubric(rubricText, busy);

  return (
    <ModalShell
      label="Paste or upload a rubric"
      onDismiss={onClose}
      restoreFocusRef={restoreFocusRef}
      fallbackFocusRefs={fallbackFocusRefs}
      contentStyle={{ width: "min(720px, 95vw)", maxWidth: "none" }}
    >
      <div className={styles.previewHeader}>
        <div>
          <h3>Paste or upload a rubric</h3>
          <p className={styles.previewMeta}>
            Paste the rubric text below, or upload a file to fill it in - either way, review the text before
            continuing.
          </p>
        </div>
        <button type="button" className={styles.previewCloseButton} onClick={onClose}>
          Close
        </button>
      </div>

      <div className={styles.previewContent}>
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            border: `1px dashed ${dragOver ? "var(--accent)" : "var(--field-border)"}`,
            borderRadius: "var(--radius-sm)",
            padding: "var(--space-3)",
            textAlign: "center",
            marginBottom: "var(--space-4)",
          }}
        >
          <label className={styles.downloadButton} style={{ cursor: busy ? "not-allowed" : "pointer" }}>
            {busy ? "Reading file…" : "Choose a file"}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleFileInputChange}
              disabled={busy}
              style={{ display: "none" }}
              aria-describedby={`${textareaId}-file-hint`}
            />
          </label>
          <span id={`${textareaId}-file-hint`} className={styles.fieldHint} style={{ marginLeft: "var(--space-2)" }}>
            or drop it here - .docx, .pdf, .txt or .md, up to 25 MB
          </span>
        </div>

        {notice && (
          // "warning" (a suspiciously-short extraction, R1a/R2b) gets the
          // SAME danger styling as a hard "error" - it must visually read
          // as "look at this before trusting it", never as the same quiet
          // confirmation a clean extraction gets. Only its urgency differs:
          // an error is announced immediately (role="alert"), a warning
          // politely (role="status"), since the extraction did technically
          // complete and the instructor is not blocked from continuing.
          <p
            className={notice.kind === "success" ? styles.fieldHint : styles.error}
            role={notice.kind === "error" ? "alert" : "status"}
            aria-live={notice.kind === "error" ? "assertive" : "polite"}
          >
            {notice.text}
          </p>
        )}

        <div className={styles.field}>
          <label htmlFor={textareaId}>
            Rubric text - {describeRubricSourceLabel(source, uploadedFileName)}
          </label>
          <textarea
            id={textareaId}
            value={rubricText}
            onChange={handleTextChange}
            disabled={busy}
            rows={14}
            placeholder="Paste the grading rubric here, or use the upload above."
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
          />
        </div>
      </div>

      <div className={styles.previewFooter}>
        <Button variant="outlined" size="small" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" size="small" onClick={handleSubmit} disabled={!canSubmit}>
          Use this rubric
        </Button>
      </div>
    </ModalShell>
  );
}
