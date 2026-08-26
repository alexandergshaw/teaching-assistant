"use client";

// Task 2 (docs/grading-results-file-viewer-acceptance-criteria.md): a per-row
// control to browse every one of a submission's files, with their contents,
// in one panel - the existing per-file Preview (eye) button
// (FilePreviewModal.tsx, reused as-is and unchanged by this file) only shows
// one file at a time.
//
// Steals the SHAPE of drafted-grades/SubmissionCodePanel.tsx (a file picker
// plus a read-only editor in one panel) but NOT the component: that one
// fetches live from GitHub and is explicitly documented as possibly not
// being the code a draft was graded against. Showing the instructor
// something other than what was graded is the exact failure this whole
// feature exists to avoid, so this panel renders ONLY `submittedFiles` - the
// content the grader actually read - never a live re-fetch.
import { useState } from "react";
import dynamic from "next/dynamic";
import { Button, TextField, MenuItem } from "@mui/material";
import styles from "../../page.module.css";
import { ModalShell } from "../ui/ModalShell";
import type { GradeRow } from "./gradingResultsHelpers";

// Monaco (the VS Code editor) is client-only; load it lazily with SSR
// disabled, matching SubmissionCodePanel.tsx's identical usage.
const MonacoFileEditor = dynamic(() => import("../MonacoFileEditor"), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 16, fontSize: "0.85rem", color: "var(--text-secondary)" }}>Loading editor...</div>
  ),
});

type SubmittedFile = GradeRow["submittedFiles"][number];

export type SubmittedFilesPanelProps = {
  student: string;
  /** result.submittedFiles - the files ACTUALLY graded. Never empty when this
   * panel is opened (GradingResults.tsx only renders the opening button
   * alongside a non-empty list). */
  files: SubmittedFile[];
  /** F3's second, separately-named cut, carried into this panel too: true
   * when the ASSEMBLED submission text was cut again, after ingestion,
   * before the model ever saw it - independent of any one file's own
   * `previewTruncated` below. See FilePreviewModal.tsx's identical notice
   * for the full rationale. */
  submissionTruncated?: boolean;
  onClose: () => void;
};

// Duplicated from GradingResults.tsx's handleDownloadFile rather than
// imported - the same precedent this file's own directory already uses
// (see GradingResults.tsx's "ExpandIcon moved to grading-results/
// RowFeedbackBoxes.tsx (duplicated, not imported...)" comment) for a small,
// self-contained DOM routine with no shared state to keep in sync.
function downloadFile(file: SubmittedFile) {
  if (!file.rawBase64) return;
  const byteChars = atob(file.rawBase64);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteArray], { type: file.mimeType ?? "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    file.extension && file.extension !== "(none)" && !file.name.toLowerCase().endsWith(`.${file.extension.toLowerCase()}`)
      ? `${file.name}.${file.extension}`
      : file.name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Browse every file from a graded submission in one panel: a file picker plus
 * a read-only Monaco editor. Single-file preview (images, PDFs, the
 * per-file truncation notice at the cut point) stays FilePreviewModal.tsx's
 * job, reached from the row's own Preview button - this panel is for
 * browsing everything at once, text content only.
 */
export default function SubmittedFilesPanel({ student, files, submissionTruncated, onClose }: SubmittedFilesPanelProps) {
  const [selectedName, setSelectedName] = useState(files[0]?.name ?? "");
  const selectedFile = files.find((f) => f.name === selectedName) ?? files[0];

  return (
    <ModalShell label={`Files for ${student}`} onDismiss={onClose}>
      <div className={styles.previewHeader}>
        <div>
          <p className={styles.previewMeta}>Student: {student}</p>
          <h3>All submitted files ({files.length})</h3>
        </div>
        <button type="button" className={styles.previewCloseButton} onClick={onClose}>
          Close
        </button>
      </div>

      {submissionTruncated && (
        <p className={styles.previewNotice}>
          The assembled submission was cut down again before the model graded it, so the grader may have read less
          than these files show - even where a file&apos;s own content below is not cut off.
        </p>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <TextField
          select
          size="small"
          value={selectedName}
          onChange={(e) => setSelectedName(e.target.value)}
          sx={{ minWidth: 220, flex: "1 1 220px" }}
          aria-label={`Select a file for ${student}`}
        >
          {files.map((f) => (
            <MenuItem key={f.name} value={f.name}>
              {f.name}
              {f.previewTruncated ? " (truncated)" : ""}
            </MenuItem>
          ))}
        </TextField>
        {selectedFile?.rawBase64 && (
          <Button variant="outlined" size="small" onClick={() => downloadFile(selectedFile)}>
            Download
          </Button>
        )}
      </div>

      {selectedFile && (
        <>
          <MonacoFileEditor
            path={selectedFile.name}
            value={selectedFile.previewContent || "No extracted text available for this file."}
            onChange={() => {}}
            height={360}
            readOnly
          />
          {/* F3 requirement 2, carried into this panel: restate the cut right
              where the reader's eye actually lands - immediately after the
              content, not only in the picker's "(truncated)" suffix above. */}
          {selectedFile.previewTruncated && (
            <p className={styles.previewNotice}>
              — cut off here. The rest of this file was not included when this run was graded.
            </p>
          )}
        </>
      )}
    </ModalShell>
  );
}
