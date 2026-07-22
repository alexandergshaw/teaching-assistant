"use client";

import styles from "../../page.module.css";

interface UploadDropZoneProps {
  uploads: Array<{ name: string; status: "uploading" | "done" | "error"; error?: string }>;
  onDrop: (files: FileList | null) => void;
  fileCount: number;
}

export function UploadDropZone({ uploads, onDrop, fileCount }: UploadDropZoneProps) {
  return (
    <>
      <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onDrop(e.dataTransfer.files); }} className={styles.ccDrop}>
        <span className={styles.ccHint}>Drop files here to add them to your library.</span>
      </div>

      {uploads.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {uploads.map((row, idx) => (
            <span key={idx} className={styles.ccHint} style={{ color: row.status === "error" ? "var(--danger)" : undefined }}>
              {row.name}: {row.status === "uploading" ? "uploading..." : row.status === "done" ? "uploaded" : `failed (${row.error})`}
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span className={styles.fieldHint} style={{ margin: 0, whiteSpace: "nowrap" }}>
          {fileCount} file{fileCount === 1 ? "" : "s"}
        </span>
      </div>
    </>
  );
}
