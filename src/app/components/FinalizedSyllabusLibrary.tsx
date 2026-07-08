"use client";

import { useEffect, useState } from "react";
import {
  listFinalizedSyllabiAction,
  getFinalizedSyllabusAction,
  renameFinalizedSyllabusAction,
  deleteFinalizedSyllabusAction,
} from "../actions";
import type { FinalizedSyllabusMeta } from "@/lib/supabase/course-syllabi";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import styles from "../page.module.css";

// Turn a bare base64 .docx into a download in the browser.
function downloadDocx(base64: string, fileName: string): void {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

interface FinalizedSyllabusLibraryProps {
  /** Bump this to force a reload after the parent saves a new syllabus. */
  reloadToken?: number;
}

export default function FinalizedSyllabusLibrary({ reloadToken = 0 }: FinalizedSyllabusLibraryProps) {
  const [syllabi, setSyllabi] = useState<FinalizedSyllabusMeta[]>([]);
  const [state, setState] = useState<"loading" | "idle" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setState("loading");
    const r = await listFinalizedSyllabiAction();
    if ("error" in r) {
      setState("error");
      setError(r.error);
      return;
    }
    setSyllabi(r.syllabi);
    setState("idle");
  };

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    void load();
  }, [reloadToken]);

  const handleDownload = async (s: FinalizedSyllabusMeta) => {
    setBusyId(s.id);
    setError(null);
    const r = await getFinalizedSyllabusAction(s.id);
    setBusyId(null);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    downloadDocx(r.syllabus.content, r.syllabus.fileName);
  };

  const handleRename = async (s: FinalizedSyllabusMeta) => {
    const name = typeof window !== "undefined" ? window.prompt("Rename syllabus", s.name) : null;
    if (name === null || !name.trim() || name.trim() === s.name) return;
    setBusyId(s.id);
    setError(null);
    const r = await renameFinalizedSyllabusAction(s.id, name.trim());
    setBusyId(null);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    await load();
  };

  const handleDelete = async (s: FinalizedSyllabusMeta) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete "${s.name}"? This cannot be undone.`)) return;
    setBusyId(s.id);
    setError(null);
    const r = await deleteFinalizedSyllabusAction(s.id);
    setBusyId(null);
    if ("error" in r) {
      setError(r.error);
      return;
    }
    await load();
  };

  return (
    <div className={styles.finalizedList}>
      {state === "loading" && (
        <div className={styles.finalizedLoading}>
          <CircularProgress size={20} />
        </div>
      )}
      {state === "error" && <p className={styles.error}>{error}</p>}
      {state === "idle" && syllabi.length === 0 && (
        <p className={styles.fieldHint}>
          No saved syllabi yet. Build a syllabus above, then choose &ldquo;Save to library&rdquo; to keep it here.
        </p>
      )}
      {state === "idle" &&
        syllabi.map((s) => (
          <div key={s.id} className={styles.finalizedRow}>
            <div className={styles.finalizedRowMain}>
              <span className={styles.finalizedName}>{s.name}</span>
              <div className={styles.finalizedMeta}>
                {s.courseCode ? `${s.courseCode} · ` : ""}
                {s.fileName}
                {formatDate(s.updatedAt) ? ` · saved ${formatDate(s.updatedAt)}` : ""}
              </div>
            </div>
            <Button variant="contained" size="small" disabled={busyId === s.id} onClick={() => handleDownload(s)}>
              Download
            </Button>
            <Button variant="text" size="small" disabled={busyId === s.id} onClick={() => handleRename(s)}>
              Rename
            </Button>
            <Button variant="text" size="small" color="error" disabled={busyId === s.id} onClick={() => handleDelete(s)}>
              Delete
            </Button>
          </div>
        ))}
      {state === "idle" && error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
