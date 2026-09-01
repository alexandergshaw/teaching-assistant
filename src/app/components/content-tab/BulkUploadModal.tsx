"use client";

import { useState } from "react";
import type { RefObject } from "react";
import type { CanvasModule } from "@/lib/canvas-modules";
import styles from "../../page.module.css";
import { bestModuleIdFor, uploadFileToModule } from "./utils";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { ModalShell } from "../ui/ModalShell";

// ── Bulk upload (match files to modules) ──────────────────────────────────────

export function BulkUploadModal({
  courseUrl,
  acronym,
  modules,
  onClose,
  onDone,
  restoreFocusRef,
  fallbackFocusRefs,
}: {
  courseUrl: string;
  acronym?: string;
  modules: CanvasModule[];
  onClose: () => void;
  onDone: () => void;
  /** Opener to restore focus to on close, captured by the caller at click
   * time - forwarded to ModalShell (see its own props for the full rules). */
  restoreFocusRef?: RefObject<HTMLElement | null>;
  /** Fallback candidates tried after restoreFocusRef - see ModalShell. */
  fallbackFocusRefs?: readonly RefObject<HTMLElement | null>[];
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [assign, setAssign] = useState<Array<number | "">>([]);
  const [status, setStatus] = useState<Array<"pending" | "uploading" | "done" | "error">>([]);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const onSelect = (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    setFiles(arr);
    setAssign(arr.map((f) => bestModuleIdFor(f.name, modules)));
    setStatus(arr.map(() => "pending"));
    setNote(null);
  };

  const matchedCount = assign.filter((a) => a !== "").length;

  const handleApply = async () => {
    const targets = files.map((f, i) => ({ f, i })).filter((t) => assign[t.i] !== "");
    if (targets.length === 0) {
      setNote({ kind: "error", text: "Assign at least one file to a module." });
      return;
    }
    setUploading(true);
    setNote(null);
    let done = 0;
    for (const t of targets) {
      setStatus((s) => s.map((v, idx) => (idx === t.i ? "uploading" : v)));
      try {
        await uploadFileToModule(courseUrl, acronym, assign[t.i] as number, t.f);
        setStatus((s) => s.map((v, idx) => (idx === t.i ? "done" : v)));
        done += 1;
      } catch {
        setStatus((s) => s.map((v, idx) => (idx === t.i ? "error" : v)));
      }
    }
    setUploading(false);
    setNote({
      kind: done === targets.length ? "success" : "error",
      text: `Uploaded ${done} of ${targets.length} file${targets.length === 1 ? "" : "s"}.`,
    });
    onDone();
  };

  return (
    // width/maxWidth restore this modal's pre-ModalShell size (760px, capped
    // at 95vw) instead of the shell's 980px default - see git history on
    // this file for the inline style this replaces.
    <ModalShell
      label="Bulk upload & match to modules"
      onDismiss={onClose}
      restoreFocusRef={restoreFocusRef}
      fallbackFocusRefs={fallbackFocusRefs}
      contentStyle={{ width: "min(760px, 95vw)", maxWidth: "none" }}
    >
        <div className={styles.previewHeader}>
          <h3>Bulk upload &amp; match to modules</h3>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Close
          </button>
        </div>

        <p className={styles.fieldHint} style={{ marginTop: 0 }}>
          Pick files; each is matched to the closest module by name. Adjust any match (or skip), then
          upload. Files go to Canvas and are added to their module.
        </p>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onSelect(e.dataTransfer.files);
          }}
          style={{ border: "1px dashed var(--field-border)", borderRadius: "var(--radius-sm)", padding: "var(--space-3)", textAlign: "center" }}
        >
          <label className={styles.downloadButton} style={{ cursor: "pointer" }}>
            Choose files
            <input
              type="file"
              multiple
              style={{ display: "none" }}
              onChange={(e) => {
                if (e.target.files) onSelect(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <span className={styles.fieldHint} style={{ marginLeft: "var(--space-2)" }}>
            or drop them here
          </span>
        </div>

        {files.length > 0 && (
          <div className={styles.field}>
            <label>
              {files.length} file{files.length === 1 ? "" : "s"} · {matchedCount} matched
            </label>
            <div
              style={{
                border: "1px solid var(--field-border)",
                borderRadius: "var(--radius-sm)",
                overflow: "hidden",
                overflowY: "auto",
                maxHeight: "42vh",
              }}
            >
              {files.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    padding: "var(--space-2) var(--space-3)",
                    borderTop: i === 0 ? "none" : "1px solid var(--field-border)",
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      flex: "1 1 200px",
                      minWidth: 0,
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {f.name}
                  </span>
                  <TextField
                    select
                    size="small"
                    value={assign[i]}
                    disabled={uploading}
                    onChange={(e) =>
                      setAssign((a) =>
                        a.map((v, idx) => (idx === i ? (e.target.value === "" ? "" : Number(e.target.value)) : v))
                      )
                    }
                    sx={{ flex: "0 0 220px", maxWidth: 220 }}
                  >
                    <MenuItem value="">Skip</MenuItem>
                    {modules.map((m) => (
                      <MenuItem key={m.id} value={m.id}>
                        {m.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <span
                    className={styles.fieldHint}
                    style={{ margin: 0, minWidth: 70, color: status[i] === "error" ? "var(--danger)" : undefined }}
                  >
                    {status[i] === "uploading"
                      ? "uploading…"
                      : status[i] === "done"
                        ? "added"
                        : status[i] === "error"
                          ? "failed"
                          : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
          <Button
            variant="contained"
            size="small"
            onClick={handleApply}
            disabled={uploading || matchedCount === 0}
          >
            {uploading ? "Uploading…" : `Upload ${matchedCount} file${matchedCount === 1 ? "" : "s"}`}
          </Button>
        </div>

        {note && <p className={note.kind === "error" ? styles.error : styles.fieldHint}>{note.text}</p>}
    </ModalShell>
  );
}
