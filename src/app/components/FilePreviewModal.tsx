"use client";

import { useState, type RefObject } from "react";
import { Button } from "@mui/material";
import styles from "../page.module.css";
import { runSubmissionCodeAction } from "../actions";
import type { CodeRunResult } from "@/lib/code-runner";
import { ModalShell } from "./ui/ModalShell";

const RUNNABLE_EXTENSIONS = new Set(["ts", "py", "java", "c", "cpp", "cc", "cxx", "hpp", "h", "js"]);

export type PreviewFile = {
  student: string;
  name: string;
  extension: string;
  content: string;
  /**
   * True when THIS file's own content was cut before being stored - the
   * digest ingest budget (github.digest.ts `perFileBytes`/`maxBytes`) on the
   * repo grading path, or the two other producers' own budgets. Distinct
   * from `submissionTruncated` below: this is about the file, that is about
   * the whole graded submission.
   */
  truncated: boolean;
  /**
   * True when the ASSEMBLED submission text (this file's content concatenated
   * with every other submitted file) was cut again, after ingestion, before
   * the model was ever asked to grade it (GradeResult.submissionTruncated -
   * see truncateSubmission in src/lib/grade/utils.ts). A file can show
   * `truncated: false` here - its own stored content is complete - while
   * still being one the grader saw only partially, or not at all, because the
   * cut landed earlier in the concatenated text. docs/grading-results-file-
   * viewer-acceptance-criteria.md F3 requires both cuts be named separately,
   * the same distinction useRepoGradesGradingActions.ts's `digestTruncated`
   * vs `submissionTruncated` handling already makes at the run level.
   */
  submissionTruncated?: boolean;
  rawBase64?: string;
  mimeType?: string;
};

type FilePreviewModalProps = {
  selectedPreview: PreviewFile;
  previewBlobUrl: string | null;
  onClose: () => void;
  /** The opener to return focus to on close, forwarded to ModalShell. */
  restoreFocusRef?: RefObject<HTMLElement | null>;
  /** Ordered fallbacks tried after `restoreFocusRef`. */
  fallbackFocusRefs?: readonly RefObject<HTMLElement | null>[];
};

export default function FilePreviewModal({
  selectedPreview,
  previewBlobUrl,
  onClose,
  restoreFocusRef,
  fallbackFocusRefs,
}: FilePreviewModalProps) {
  const isRunnable = RUNNABLE_EXTENSIONS.has((selectedPreview.extension || "").toLowerCase());
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<CodeRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const handleRun = async () => {
    setRunning(true);
    setRunError(null);
    setRunResult(null);
    try {
      const res = await runSubmissionCodeAction([
        {
          name: selectedPreview.name,
          extension: selectedPreview.extension,
          rawBase64: selectedPreview.rawBase64,
          previewContent: selectedPreview.content,
        },
      ]);
      if (!res) {
        setRunError("This file has no runnable code.");
      } else {
        setRunResult(res);
      }
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Run failed.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <ModalShell
      label={`Preview for ${selectedPreview.name}`}
      onDismiss={onClose}
      restoreFocusRef={restoreFocusRef}
      fallbackFocusRefs={fallbackFocusRefs}
    >
        <div className={styles.previewHeader}>
          <div>
            {selectedPreview.student && (
              <p className={styles.previewMeta}>Student: {selectedPreview.student}</p>
            )}
            <h3>{selectedPreview.name}</h3>
            {selectedPreview.extension && (
              <p className={styles.previewMeta}>Type: {selectedPreview.extension}</p>
            )}
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexShrink: 0 }}>
            {isRunnable && (
              <Button
                variant="outlined"
                size="small"
                onClick={handleRun}
                disabled={running}
              >
                {running ? "Running..." : "Run"}
              </Button>
            )}
            <button type="button" className={styles.previewCloseButton} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        {previewBlobUrl && selectedPreview.mimeType === "application/pdf" ? (
          <iframe
            src={previewBlobUrl}
            className={styles.previewIframe}
            title={`Preview of ${selectedPreview.name}`}
          />
        ) : previewBlobUrl && selectedPreview.mimeType?.startsWith("image/") ? (
          <div className={styles.previewImageWrap}>
            {/* Plain img: the source is a client-side blob/object URL, which
                next/image cannot fetch or optimize. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewBlobUrl}
              alt={`Preview of ${selectedPreview.name}`}
              className={styles.previewImage}
            />
          </div>
        ) : (
          <>
            {selectedPreview.truncated && (
              <p className={styles.previewNotice}>
                Showing a partial preview because the extracted file content is large.
              </p>
            )}
            {selectedPreview.submissionTruncated && (
              <p className={styles.previewNotice}>
                The assembled submission was cut down again before the model graded it, so the grader may have
                read less than this preview shows - even where this file&apos;s own content below is not cut off.
              </p>
            )}
            <pre className={styles.previewContent}>{selectedPreview.content}</pre>
            {/* F3 requirement 2: the same fact restated right where the text
                actually stops - a reader's eye is at the end of the content,
                which is exactly where the false "this is everything" reading
                forms if nothing is said here. */}
            {selectedPreview.truncated && (
              <p className={styles.previewNotice}>
                — cut off here. The rest of this file was not included when this run was graded.
              </p>
            )}
          </>
        )}
        {(runResult || runError) && (
          <div style={{ marginTop: "var(--space-3)", borderTop: "1px solid var(--field-border)", paddingTop: "var(--space-3)" }}>
            <p className={styles.previewMeta}>
              Code execution{runResult && !runResult.error ? ` (${runResult.language})` : ""}
            </p>
            {runError ? (
              <p className={styles.previewNotice}>{runError}</p>
            ) : runResult?.error ? (
              <p className={styles.previewNotice}>The code runner could not execute this file: {runResult.error}</p>
            ) : runResult ? (
              <>
                <p className={styles.previewMeta}>
                  Ran without errors: {runResult.neededStdin ? "no input available (not scored)" : runResult.ran ? "yes" : "no"}
                </p>
                {runResult.compileOutput && runResult.compileOutput.trim() && (
                  <>
                    <p className={styles.previewMeta}>Compiler output</p>
                    <pre className={styles.previewContent}>{runResult.compileOutput}</pre>
                  </>
                )}
                <p className={styles.previewMeta}>Output (stdout)</p>
                <pre className={styles.previewContent}>{runResult.stdout || "(none)"}</pre>
                {runResult.stderr && runResult.stderr.trim() && (
                  <>
                    <p className={styles.previewMeta}>Errors (stderr)</p>
                    <pre className={styles.previewContent}>{runResult.stderr}</pre>
                  </>
                )}
              </>
            ) : null}
          </div>
        )}
    </ModalShell>
  );
}
