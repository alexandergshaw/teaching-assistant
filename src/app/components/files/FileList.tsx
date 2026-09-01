"use client";

import { Button, Checkbox } from "@mui/material";
import type { RecordingFile } from "@/lib/recording-files";
import { groupRecordingFiles } from "@/lib/recording-file-groups";
import { formatRelative } from "@/app/utils/time";
import styles from "../../page.module.css";
import { FileRow, type FileRowSharedProps } from "./FileRow";

// Extracted structurally out of FilesTab.tsx (which was at 999 of this
// repo's 1000-line ceiling) - a pure move of the row-rendering block
// (grouped / ungrouped / flat), not a behaviour change. See
// docs/DEV_LOOP.md's ceiling rule and buildModuleCardProps.ts /
// ModuleCard.tsx for the shared-props idiom this mirrors: FileRow.tsx's own
// header comment used to warn that `previewTriggerRef` was "ONE ref shared
// by THREE <FileRow> render sites, so a dropped prop at any of them -
// present or future - would compile clean and silently restore focus to
// whatever a PREVIOUS open captured." Collapsing the three duplicated prop
// lists into one `fileRowProps` object (built once in FilesTab.tsx, spread
// here at all three sites) makes that class of drift structurally
// impossible instead of type-system-enforced one prop at a time.
export interface FileListProps {
  /** The full (unfiltered) file list - only its length is read, to decide
   * the "No files yet" empty state vs. "No files match your search". */
  files: RecordingFile[];
  /** The filtered + sorted list actually rendered. */
  shown: RecordingFile[];
  groupBy: "flat" | "grouped";
  allShownSelected: boolean;
  onToggleSelectAll: () => void;
  onOpenWorkflow?: (workflowId: string) => void;
  /** Forwarded to the table wrapper's own ref callback - FilesTab.tsx uses
   * this as `filesTableFallbackRef`, a focus-restoration fallback for
   * FilePreviewModal (docs/modal-focus-restoration-acceptance-criteria.md).
   * A callback ref (not a RefObject) for the same reason FilterToolbar.tsx's
   * `containerRef` is: `RefObject<HTMLElement | null>` is not assignable to
   * a `<div>`'s `Ref<HTMLDivElement>`. */
  listRef: (el: HTMLElement | null) => void;
  /** Every prop `<FileRow>` needs EXCEPT `file` itself - identical at all
   * three render sites below. */
  fileRowProps: FileRowSharedProps;
}

export function FileList({
  files,
  shown,
  groupBy,
  allShownSelected,
  onToggleSelectAll,
  onOpenWorkflow,
  listRef,
  fileRowProps,
}: FileListProps) {
  if (files.length === 0) {
    return (
      <div className={styles.emptyState}>
        No files yet. Record one on the Recording tab or upload files here.
      </div>
    );
  }

  return (
    <div
      ref={(el) => listRef(el)}
      tabIndex={-1}
      className={styles.libTable}
    >
      <div className={styles.libHead}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <Checkbox size="small" checked={allShownSelected} onChange={onToggleSelectAll} disabled={shown.length === 0} />
        </div>
        <div>Kind</div>
        <div>Type</div>
        <div>Name</div>
        <div>Length</div>
        <div>Size</div>
        <div>Added</div>
        <div>Actions</div>
      </div>

      {shown.length === 0 ? (
        <div style={{ padding: "12px", textAlign: "center", color: "var(--text-secondary)" }}>
          No files match your search.
        </div>
      ) : groupBy === "grouped" ? (
        <>
          {(() => {
            const grouped = groupRecordingFiles(shown);
            return (
              <>
                {grouped.groups.map((group) => (
                  <div key={group.key}>
                    <div style={{
                      padding: "12px",
                      backgroundColor: "var(--bg-secondary)",
                      borderBottom: "1px solid var(--border-color)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 500 }}>
                          {group.workflowName || "Workflow run"}
                        </div>
                        <div className={styles.fieldHint} style={{ margin: "4px 0 0 0", fontSize: "0.9em" }}>
                          {group.files.length} file{group.files.length === 1 ? "" : "s"} {formatRelative(group.newest)}
                        </div>
                      </div>
                      {group.workflowId && onOpenWorkflow && (
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => onOpenWorkflow(group.workflowId!)}
                        >
                          Open workflow
                        </Button>
                      )}
                    </div>
                    {group.files.map((file) => (
                      <FileRow key={file.id} file={file} {...fileRowProps} />
                    ))}
                  </div>
                ))}
                {grouped.ungrouped.length > 0 && (
                  <div>
                    <div style={{
                      padding: "12px",
                      backgroundColor: "var(--bg-secondary)",
                      borderBottom: "1px solid var(--border-color)",
                      fontWeight: 500,
                    }}>
                      Other files
                    </div>
                    {grouped.ungrouped.map((file) => (
                      <FileRow key={file.id} file={file} {...fileRowProps} />
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </>
      ) : (
        shown.map((file) => (
          <FileRow key={file.id} file={file} {...fileRowProps} />
        ))
      )}
    </div>
  );
}
