"use client";

import { Button, TextField, MenuItem, Checkbox } from "@mui/material";
import type { RecordingFile } from "@/lib/recording-files";
import { extForFile } from "@/lib/recording-files";
import type { CanvasModule } from "@/lib/canvas-modules";
import CoursePicker from "../CoursePicker";
import styles from "../../page.module.css";
import { fmt, formatBytes, getDisplayKind, canPlayInline } from "./helpers";

interface FileRowProps {
  file: RecordingFile;
  selected: Set<string>;
  onSelectToggle: (fileId: string) => void;
  onDelete: (file: RecordingFile) => void;
  confirmDelete: string | null;
  onDownload: (file: RecordingFile) => void;
  onStripAudio: (file: RecordingFile) => void;
  stripping: { id: string; pct: number } | null;
  nameDrafts: Record<string, string>;
  onNameChange: (fileId: string, name: string) => void;
  onSaveRename: (file: RecordingFile) => void;
  expandedPlay: string | null;
  playUrls: Record<string, string>;
  onPlayToggle: (fileId: string | null) => void;
  onPreview: (file: RecordingFile) => void;
  /** Focus restoration (docs/modal-focus-restoration-acceptance-criteria.md,
   * wave R3 slice E). `onPreview` above is typed `(file: RecordingFile) =>
   * void` - no element ever reaches it - and widening it to also carry a
   * trigger element would leak a DOM concern into a signature every other
   * caller of `onPreview` has to keep matching for no benefit of their own.
   * Sibling capture callback instead: the same convention
   * `ModuleItemRow.tsx` uses for `onPreviewAssignmentTrigger` and
   * `onGradableEditorTrigger`, and this file's own sibling `FilterToolbar.tsx`
   * uses for `onCopyTrigger`. Called with `event.currentTarget` in the
   * Preview button's own onClick, synchronously and BEFORE `onPreview`
   * itself - never from `document.activeElement`, and never after an await,
   * per decision 9/AC3 of the AC above. REQUIRED, not optional: FilesTab.tsx's
   * `previewTriggerRef` is ONE ref shared by THREE `<FileRow>` render sites,
   * so a dropped prop at any of them - present or future - would compile
   * clean and silently restore focus to whatever a PREVIOUS open captured.
   * A wrong-element restore is worse than no restore, so the type system
   * closes that class rather than leaving it to discipline. */
  onPreviewTrigger: (trigger: HTMLElement) => void;
  previewLoading: boolean;
  addTarget: string | null;
  onAddTargetToggle: (fileId: string | null) => void;
  courseUrl: string;
  courseName: string;
  moduleId: number | "";
  modules: CanvasModule[];
  modulesStatus: "idle" | "loading" | "ready" | "error";
  onModuleSelect: (mId: number | "") => void;
  onAddToModule: (file: RecordingFile) => void;
  adding: boolean;
  addNote: { kind: "success" | "error"; text: string } | null;
  onAddToModuleCancel: () => void;
  activeInstitution: string | null;
  onSelectCourse: (url: string) => void;
}

// Every FileList.tsx render site (grouped / ungrouped / flat) passes the
// exact same set of props to every <FileRow> except `file` itself - see
// FileList.tsx's own header comment. Named and exported here (mirroring
// ModuleCard.tsx's ModuleItemRowSharedProps / AddItemRowSharedProps idiom)
// so the two files share ONE type instead of FileList re-deriving it.
export type FileRowSharedProps = Omit<FileRowProps, "file">;

export function FileRow({
  file,
  selected,
  onSelectToggle,
  onDelete,
  confirmDelete,
  onDownload,
  onStripAudio,
  stripping,
  nameDrafts,
  onNameChange,
  onSaveRename,
  expandedPlay,
  playUrls,
  onPlayToggle,
  onPreview,
  onPreviewTrigger,
  previewLoading,
  addTarget,
  onAddTargetToggle,
  courseUrl,
  courseName,
  moduleId,
  modules,
  modulesStatus,
  onModuleSelect,
  onAddToModule,
  adding,
  addNote,
  onAddToModuleCancel,
  activeInstitution,
  onSelectCourse,
}: FileRowProps) {
  const displayKind = getDisplayKind(file);
  const isAudio = file.mimeType.startsWith("audio/");

  return (
    <div key={file.id}>
      <div className={styles.libRow}>
        <div>
          <Checkbox
            size="small"
            checked={selected.has(file.id)}
            onChange={() => onSelectToggle(file.id)}
            aria-label={`Select ${file.name}`}
          />
        </div>
        <div className={styles.libKindCell}>
          <span className={`${styles.ghBadge} ${displayKind.badgeClass}`}>
            {displayKind.label}
          </span>
        </div>
        <div className={styles.libNum} style={{ textTransform: "uppercase" }} title={file.mimeType}>{extForFile(file)}</div>
        <div>
          <TextField
            size="small"
            type="text"
            title={file.name}
            value={nameDrafts[file.id] ?? file.name}
            onChange={(e) => onNameChange(file.id, e.target.value)}
            onBlur={() => void onSaveRename(file)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            sx={{ width: "100%" }}
          />
          {file.source === "workflow" && (
            <div className={styles.fieldHint} style={{ margin: "4px 0 0 0", fontSize: "0.85em" }}>
              Generated by {file.workflowName || "a workflow"}
            </div>
          )}
        </div>
        <div className={styles.libNum}>{fmt(file.durationSec)}</div>
        <div className={styles.libNum}>{formatBytes(file.sizeBytes)} MB</div>
        <div className={styles.libNum}>
          {new Date(file.createdAt).toLocaleDateString()} {new Date(file.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
        <div className={styles.libActions}>
          {canPlayInline(file) && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => {
                const opening = expandedPlay !== file.id;
                onPlayToggle(opening ? file.id : null);
                if (opening && !playUrls[file.id]) {
                  // Play URL will be fetched by parent handler
                }
              }}
            >
              {expandedPlay === file.id ? "Close" : "Play"}
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            disabled={previewLoading}
            onClick={(e) => {
              onPreviewTrigger(e.currentTarget);
              void onPreview(file);
            }}
          >
            {previewLoading ? "Loading..." : "Preview"}
          </Button>
          <Button
            size="small"
            variant="outlined"
            onClick={() => void onDownload(file)}
          >
            Download
          </Button>
          {file.mimeType.startsWith("video/") && !isAudio && displayKind.label !== "Bundle" && (
            <Button
              size="small"
              variant="outlined"
              disabled={stripping !== null}
              onClick={() => void onStripAudio(file)}
              title="Create a copy of this video without its audio track"
            >
              {stripping?.id === file.id ? `Stripping... ${stripping.pct}%` : "Strip audio"}
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              const opening = addTarget !== file.id;
              onAddTargetToggle(opening ? file.id : null);
              if (opening && courseUrl && modulesStatus === "idle") {
                void onSelectCourse(courseUrl);
              }
            }}
          >
            Add to module
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={() => void onDelete(file)}
          >
            {confirmDelete === file.id ? "Confirm" : "Delete"}
          </Button>
        </div>
      </div>

      {expandedPlay === file.id && (
        <div className={styles.libExpand}>
          {!playUrls[file.id] ? (
            <span className={styles.ccHint}>Loading...</span>
          ) : isAudio ? (
            <audio
              controls
              src={playUrls[file.id]}
              style={{
                width: "100%",
                maxWidth: "400px",
              }}
            />
          ) : (
            <video
              controls
              src={playUrls[file.id]}
              style={{
                maxWidth: "100%",
                borderRadius: 8,
                background: "#0f172a",
              }}
            />
          )}
        </div>
      )}

      {addTarget === file.id && (
        <div className={styles.libExpand}>
          {!activeInstitution ? (
            <div className={styles.fieldHint}>
              Pick an institution in the top bar first.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <CoursePicker
                activeInstitution={activeInstitution}
                courseUrl={courseUrl}
                onSelect={onSelectCourse}
                courseName={courseName}
              />

              {courseUrl && (
                <>
                  <TextField
                    select
                    value={moduleId}
                    onChange={(e) => onModuleSelect(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="Choose a module..."
                    size="small"
                    sx={{ minWidth: 220 }}
                    disabled={modulesStatus !== "ready"}
                    aria-label={`Module to add ${file.name} to`}
                  >
                    {modulesStatus === "ready" && modules.length === 0 ? (
                      <MenuItem value="">No modules found</MenuItem>
                    ) : (
                      [
                        <MenuItem key="none" value="">
                          Choose a module...
                        </MenuItem>,
                        ...modules.map((m) => (
                          <MenuItem key={m.id} value={m.id}>
                            {m.name}
                          </MenuItem>
                        )),
                      ]
                    )}
                  </TextField>

                  <div style={{ display: "flex", gap: 8 }}>
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => void onAddToModule(file)}
                      disabled={adding || moduleId === ""}
                    >
                      {adding ? "Adding..." : "Add"}
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={onAddToModuleCancel}
                      disabled={adding}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}

              {addNote && (
                <div
                  className={
                    addNote.kind === "error"
                      ? styles.error
                      : styles.fieldHint
                  }
                >
                  {addNote.text}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
