"use client";

import { useRef, useState } from "react";
import styles from "../page.module.css";

type FileStatus = "pending" | "processing" | "done" | "error";

interface FileEntry {
  file: File;
  status: FileStatus;
  error?: string;
}

interface DocxReformatterModalProps {
  onClose: () => void;
}

function triggerDownload(base64: string, filename: string): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/\.docx$/i, "") + "_reformatted.docx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function DocxReformatterModal({ onClose }: DocxReformatterModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const next: FileEntry[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (f.name.toLowerCase().endsWith(".docx")) {
        next.push({ file: f, status: "pending" });
      }
    }
    setEntries((prev) => [...prev, ...next]);
  };

  const setTemplate = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const f = fileList[0];
    if (f.name.toLowerCase().endsWith(".docx")) {
      setTemplateFile(f);
    }
  };

  const removeEntry = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const handleReformat = async () => {
    if (entries.length === 0 || isRunning) return;
    setIsRunning(true);

    // Mark all pending as processing
    setEntries((prev) =>
      prev.map((e) => (e.status === "pending" ? { ...e, status: "processing" } : e))
    );

    const formData = new FormData();
    entries.forEach((e) => formData.append("files", e.file));
    if (templateFile) formData.append("template", templateFile);

    try {
      const response = await fetch("/api/reformat-docx", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as {
        results?: Array<{ filename: string; base64: string; error?: string }>;
        error?: string;
      };

      if (!response.ok || data.error) {
        setEntries((prev) =>
          prev.map((e) => ({
            ...e,
            status: "error" as FileStatus,
            error: data.error ?? "Request failed.",
          }))
        );
        return;
      }

      const resultMap = new Map<string, { base64: string; error?: string }>();
      for (const r of data.results ?? []) {
        resultMap.set(r.filename, { base64: r.base64, error: r.error });
      }

      setEntries((prev) =>
        prev.map((e) => {
          const result = resultMap.get(e.file.name);
          if (!result) return { ...e, status: "error" as FileStatus, error: "No result returned." };
          if (result.error) return { ...e, status: "error" as FileStatus, error: result.error };
          triggerDownload(result.base64, e.file.name);
          return { ...e, status: "done" as FileStatus };
        })
      );
    } catch {
      setEntries((prev) =>
        prev.map((e) => ({ ...e, status: "error" as FileStatus, error: "Failed to reach the server." }))
      );
    } finally {
      setIsRunning(false);
    }
  };

  const pendingCount = entries.filter((e) => e.status === "pending").length;
  const doneCount = entries.filter((e) => e.status === "done").length;
  const errorCount = entries.filter((e) => e.status === "error").length;

  return (
    <div
      className={styles.previewBackdrop}
      onClick={onClose}
    >
      <section
        className={styles.reformatterModal}
        role="dialog"
        aria-modal="true"
        aria-label="Reformat DOCX files"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles.previewHeader}>
          <div>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Reformat DOCX Files</h3>
            <p className={styles.previewMeta}>
              Upload .docx files to reformat their content using the document formatting rules, then
              download the results.
            </p>
          </div>
          <button
            type="button"
            className={styles.previewCloseButton}
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* Drop zone */}
        <div
          className={`${styles.reformatterDropzone} ${isDragging ? styles.reformatterDropzoneDragging : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <UploadIcon />
          <span>Drop .docx files here or <strong>click to browse</strong></span>
          <input
            ref={inputRef}
            type="file"
            accept=".docx"
            multiple
            style={{ display: "none" }}
            onChange={(e) => addFiles(e.target.files)}
            onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
          />
        </div>

        {/* Template (optional) */}
        <div className={styles.reformatterTemplateSection}>
          <div className={styles.reformatterTemplateLabel}>
            <span style={{ fontWeight: 650, color: "var(--text-primary)" }}>Template (optional)</span>
            <span className={styles.previewMeta}>
              Upload a .docx file whose structure and style the reformatted documents should match.
            </span>
          </div>
          {templateFile ? (
            <div className={styles.reformatterFileItem}>
              <span className={styles.reformatterFileName}>{templateFile.name}</span>
              <button
                type="button"
                className={styles.reformatterRemoveBtn}
                onClick={() => setTemplateFile(null)}
                aria-label="Remove template file"
              >
                ✕
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.reformatterTemplateButton}
              onClick={() => templateInputRef.current?.click()}
            >
              Choose template .docx
            </button>
          )}
          <input
            ref={templateInputRef}
            type="file"
            accept=".docx"
            style={{ display: "none" }}
            onChange={(e) => setTemplate(e.target.files)}
            onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
          />
        </div>

        {/* File list */}
        {entries.length > 0 && (
          <ul className={styles.reformatterFileList}>
            {entries.map((entry, i) => (
              <li key={`${entry.file.name}-${i}`} className={styles.reformatterFileItem}>
                <span className={styles.reformatterFileName}>{entry.file.name}</span>
                <span className={styles[`reformatterStatus${capitalize(entry.status)}`]}>
                  {statusLabel(entry.status, entry.error)}
                </span>
                {entry.status === "pending" && (
                  <button
                    type="button"
                    className={styles.reformatterRemoveBtn}
                    onClick={() => removeEntry(i)}
                    aria-label={`Remove ${entry.file.name}`}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Footer */}
        <div className={styles.reformatterFooter}>
          {doneCount + errorCount > 0 && entries.length > 0 && (
            <p className={styles.previewMeta}>
              {doneCount} reformatted{errorCount > 0 ? `, ${errorCount} failed` : ""}
            </p>
          )}
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleReformat}
            disabled={pendingCount === 0 || isRunning}
          >
            {isRunning ? "Reformatting…" : `Reformat & Download${pendingCount > 0 ? ` (${pendingCount})` : ""}`}
          </button>
        </div>
      </section>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function statusLabel(status: FileStatus, error?: string): string {
  switch (status) {
    case "pending":
      return "Ready";
    case "processing":
      return "Reformatting…";
    case "done":
      return "Downloaded ✓";
    case "error":
      return error ? `Error: ${error}` : "Error";
  }
}

function UploadIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M12 16V8M12 8l-3 3M12 8l3 3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 16.5A4.5 4.5 0 0016.5 12H15a5 5 0 10-9.9 1A4 4 0 004 20h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
