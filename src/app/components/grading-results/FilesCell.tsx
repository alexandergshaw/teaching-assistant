"use client";

// A16-1 (docs/REGRESSION.md entry 359, docs/a16-scope.md section 4.4): moved
// out of GradingResults.tsx ahead of that feature's own additions - the
// Files column's per-row content (originally GradingResults.tsx's inline
// ternary inside the second <td>), a pure MOVE with no behaviour change.
//
// Deliberately imports neither ModalShell nor any MUI Dialog, and renders no
// role="dialog"/"alertdialog" - modalAdoption.wiring.test.ts's isDialogSite
// would otherwise count this as a new dialog site and move its pinned
// DIALOG_SITES/ADOPTING_PATHS counts. This component previews and downloads
// one file at a time via callbacks the parent owns; it opens no modal of its
// own.
import IconButton from "@mui/material/IconButton";
import Button from "@mui/material/Button";
import type { PreviewFile } from "../FilePreviewModal";
import { EyeIcon, DownloadIcon } from "./icons";
import { filesColumnEmptyLabel, type GradeRow } from "./gradingResultsHelpers";
import styles from "../../page.module.css";

export interface FilesCellProps {
  result: GradeRow;
  filesRetained: boolean;
  onOpenPreview: (student: string, file: PreviewFile, trigger: HTMLElement) => void;
  onDownloadFile: (name: string, extension: string, rawBase64: string, mimeType: string) => void;
  onBrowseAll: (result: GradeRow) => void;
}

/** The Files column's cell content for one result row: the empty-state label
 * (filesColumnEmptyLabel - see that function's own doc comment for why it
 * differs between a fresh run and a restored one) or the file list plus a
 * "Browse all files" button. */
export function FilesCell({ result, filesRetained, onOpenPreview, onDownloadFile, onBrowseAll }: FilesCellProps) {
  if (result.submittedFiles.length === 0) {
    return <>{filesColumnEmptyLabel(filesRetained)}</>;
  }
  return (
    <>
      <ul className={styles.matrixFileList}>
        {result.submittedFiles.map((file) => (
          <li key={`${result.student}-file-name-${file.name}`} className={styles.matrixFileItem}>
            <span className={styles.matrixFileName}>
              {file.extension &&
              file.extension !== "(none)" &&
              !file.name.toLowerCase().endsWith(`.${file.extension.toLowerCase()}`)
                ? `${file.name}.${file.extension}`
                : file.name}
            </span>
            <div className={styles.fileIconGroup}>
              <IconButton
                size="small"
                title={`Preview ${file.name}`}
                aria-label={`Preview ${file.name}`}
                onClick={(event) =>
                  onOpenPreview(
                    result.student,
                    {
                      student: result.student,
                      name: file.name,
                      extension: file.extension,
                      content: file.previewContent || "No extracted text available for this file.",
                      truncated: file.previewTruncated,
                      // F3 requirement 3: a second, distinct cut - the whole
                      // submission (this file included) may have been
                      // trimmed again before the model saw it, even when
                      // this one file's own content was not.
                      submissionTruncated: result.submissionTruncated,
                      rawBase64: file.rawBase64,
                      mimeType: file.mimeType,
                    },
                    event.currentTarget
                  )
                }
              >
                <EyeIcon />
              </IconButton>
              {file.rawBase64 && (
                <IconButton
                  size="small"
                  title={`Download ${file.name}`}
                  aria-label={`Download ${file.name}`}
                  onClick={() =>
                    onDownloadFile(file.name, file.extension, file.rawBase64!, file.mimeType ?? "application/octet-stream")
                  }
                >
                  <DownloadIcon />
                </IconButton>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Button
        variant="text"
        size="small"
        onClick={() => onBrowseAll(result)}
        sx={{ minWidth: 0, textTransform: "none", p: "var(--space-1) var(--space-1)", mt: 0.5 }}
      >
        Browse all files
      </Button>
    </>
  );
}
