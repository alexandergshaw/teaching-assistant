"use client";

import { useState } from "react";
import styles from "../page.module.css";
import { runSubmissionCodeAction } from "../actions";
import type { CodeRunResult } from "@/lib/code-runner";

const RUNNABLE_EXTENSIONS = new Set(["ts", "py", "java", "c", "cpp", "cc", "cxx", "hpp", "h", "js"]);

export type PreviewFile = {
  student: string;
  name: string;
  extension: string;
  content: string;
  truncated: boolean;
  rawBase64?: string;
  mimeType?: string;
};

type FilePreviewModalProps = {
  selectedPreview: PreviewFile;
  previewBlobUrl: string | null;
  onClose: () => void;
};

export default function FilePreviewModal({
  selectedPreview,
  previewBlobUrl,
  onClose,
}: FilePreviewModalProps) {
  const isRunnable = RUNNABLE_EXTENSIONS.has((selectedPreview.extension || "").toLowerCase());
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<CodeRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const handleRun = async () => {
    setRunning(true);
    setRunError(null);
    setRunResult(null);
    const res = await runSubmissionCodeAction([
      {
        name: selectedPreview.name,
        extension: selectedPreview.extension,
        rawBase64: selectedPreview.rawBase64,
        previewContent: selectedPreview.content,
      },
    ]);
    setRunning(false);
    if (!res) {
      setRunError("This file has no runnable code.");
    } else {
      setRunResult(res);
    }
  };

  return (
    <div className={styles.previewBackdrop} onClick={onClose}>
      <section
        className={styles.previewModal}
        role="dialog"
        aria-modal="true"
        aria-label={`Preview for ${selectedPreview.name}`}
        onClick={(event) => event.stopPropagation()}
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
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            {isRunnable && (
              <button
                type="button"
                className={styles.downloadButton}
                onClick={handleRun}
                disabled={running}
              >
                {running ? "Running..." : "Run"}
              </button>
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
            <pre className={styles.previewContent}>{selectedPreview.content}</pre>
          </>
        )}
        {(runResult || runError) && (
          <div style={{ marginTop: 12, borderTop: "1px solid var(--field-border)", paddingTop: 12 }}>
            <p className={styles.previewMeta}>
              Code execution{runResult && !runResult.error ? ` (${runResult.language})` : ""}
            </p>
            {runError ? (
              <p className={styles.previewNotice}>{runError}</p>
            ) : runResult?.error ? (
              <p className={styles.previewNotice}>The code runner could not execute this file: {runResult.error}</p>
            ) : runResult ? (
              <>
                <p className={styles.previewMeta}>Ran without errors: {runResult.ran ? "yes" : "no"}</p>
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
      </section>
    </div>
  );
}
