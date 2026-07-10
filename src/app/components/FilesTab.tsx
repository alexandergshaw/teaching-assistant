"use client";

import { useEffect, useRef, useState } from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import TabHeader from "./TabHeader";
import CoursePicker from "./CoursePicker";
import { useSupabase } from "@/context/SupabaseProvider";
import { useInstitutionSelection } from "@/lib/institutions";
import {
  listRecordingFiles,
  deleteRecordingFile,
  renameRecordingFile,
  getRecordingFileUrl,
  downloadRecordingFile,
  saveRecordingFile,
  extForMime,
  type RecordingFile,
} from "@/lib/recording-files";
import { ensureFiniteDuration } from "@/lib/caption-burn";
import {
  listCourseContentAction,
  requestFileUploadAction,
  createModuleItemAction,
} from "../actions";
import type { CanvasModule } from "@/lib/canvas-modules";
import styles from "../page.module.css";

const fmt = (s: number | null) => {
  if (s === null) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};

const formatBytes = (bytes: number) => (bytes / 1048576).toFixed(1);

export default function FilesTab() {
  const { supabase, user } = useSupabase();
  const { active: activeInstitution } = useInstitutionSelection();

  // Files state
  const [files, setFiles] = useState<RecordingFile[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Delete confirmation state
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Play state
  const [playUrls, setPlayUrls] = useState<Record<string, string>>({});

  // Upload state
  const [uploads, setUploads] = useState<Array<{ name: string; status: "uploading" | "done" | "error"; error?: string }>>([]);

  // Add-to-module panel state
  const [addTarget, setAddTarget] = useState<string | null>(null);
  const [courseUrl, setCourseUrl] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-files-course-url") ?? "";
  });
  const [courseName, setCourseName] = useState("");
  const [modules, setModules] = useState<CanvasModule[]>([]);
  const [modulesStatus, setModulesStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  // The remembered module id is not restored eagerly - it is applied via
  // pendingModuleRef in handleSelectCourse once the course's modules load
  // and the id is confirmed present.
  const [moduleId, setModuleId] = useState<number | "">("");
  const [adding, setAdding] = useState(false);
  const [addNote, setAddNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const pendingModuleRef = useRef<string | null>((() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("ta-files-module-id");
  })());

  // Load files on mount and when user changes
  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;
    setStatus("loading");
    setError(null);

    (async () => {
      try {
        const loadedFiles = await listRecordingFiles(supabase, user.id);
        if (!cancelled) {
          setFiles(loadedFiles);
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load files");
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  const handleSelectCourse = async (url: string) => {
    setCourseUrl(url);
    setModules([]);
    setModuleId("");

    if (!url) return;

    setModulesStatus("loading");
    try {
      const result = await listCourseContentAction(
        url,
        activeInstitution || undefined
      );
      if ("error" in result) {
        setNote({ kind: "error", text: result.error });
        setModulesStatus("error");
      } else {
        setCourseName(result.courseName);
        setModules(result.modules);
        setModulesStatus("ready");
        const pending = pendingModuleRef.current;
        if (pending && result.modules.some((m) => String(m.id) === pending)) {
          setModuleId(Number(pending));
        }
      }
    } catch (err) {
      setNote({
        kind: "error",
        text: err instanceof Error ? err.message : "Failed to load course",
      });
      setModulesStatus("error");
    }
  };

  const handleRename = (file: RecordingFile) => {
    const newName = window.prompt("Rename file:", file.name);
    if (newName && newName.trim()) {
      const trimmed = newName.trim();
      (async () => {
        try {
          await renameRecordingFile(supabase, file.id, trimmed);
          setFiles((prev) =>
            prev
              ? prev.map((f) =>
                  f.id === file.id ? { ...f, name: trimmed } : f
                )
              : null
          );
          setNote({ kind: "success", text: "File renamed." });
        } catch (err) {
          setNote({
            kind: "error",
            text: err instanceof Error ? err.message : "Failed to rename",
          });
        }
      })();
    }
  };

  const handleDownload = async (file: RecordingFile) => {
    try {
      const blob = await downloadRecordingFile(supabase, file);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${file.name}.${extForMime(file.mimeType)}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setNote({
        kind: "error",
        text: err instanceof Error ? err.message : "Download failed",
      });
    }
  };

  const handleDelete = async (file: RecordingFile) => {
    if (confirmDelete !== file.id) {
      setConfirmDelete(file.id);
      return;
    }

    setConfirmDelete(null);
    setFiles((prev) => (prev ? prev.filter((f) => f.id !== file.id) : null));

    try {
      await deleteRecordingFile(supabase, file);
      setNote({ kind: "success", text: "File deleted." });
    } catch (err) {
      setNote({
        kind: "error",
        text: err instanceof Error ? err.message : "Delete failed",
      });
      // Reload on error
      if (user) {
        try {
          const reloaded = await listRecordingFiles(supabase, user.id);
          setFiles(reloaded);
        } catch {}
      }
    }
  };

  const handlePlayToggle = async (
    file: RecordingFile,
    e: React.SyntheticEvent<HTMLDetailsElement>
  ) => {
    if (e.currentTarget.open && !playUrls[file.id]) {
      try {
        const url = await getRecordingFileUrl(supabase, file);
        setPlayUrls((prev) => ({ ...prev, [file.id]: url }));
      } catch (err) {
        setNote({
          kind: "error",
          text: err instanceof Error ? err.message : "Failed to load video",
        });
      }
    }
  };

  const handleAddToModule = async (file: RecordingFile) => {
    setAdding(true);
    setAddNote(null);

    try {
      // Download the file
      const blob = await downloadRecordingFile(supabase, file);

      // Prepare upload
      const fileName = `${file.name.replace(/[^a-z0-9 _-]/gi, "_")}.${extForMime(file.mimeType)}`;
      const ticket = await requestFileUploadAction(
        courseUrl,
        {
          name: fileName,
          size: blob.size,
          contentType: file.mimeType,
          folderPath: "uploads",
        },
        activeInstitution || undefined
      );

      if ("error" in ticket) throw new Error(ticket.error);

      // Upload to Canvas
      const form = new FormData();
      for (const [k, v] of Object.entries(ticket.ticket.uploadParams)) {
        form.append(k, v);
      }
      form.append("file", blob, fileName);

      const up = await fetch(ticket.ticket.uploadUrl, {
        method: "POST",
        body: form,
      });

      if (!up.ok) {
        throw new Error(`Upload to Canvas failed (HTTP ${up.status}).`);
      }

      const uploaded = (await up.json().catch(() => null)) as { id?: number } | null;
      if (typeof uploaded?.id !== "number") {
        throw new Error("Canvas did not return the uploaded file id.");
      }

      // Add to module
      const result = await createModuleItemAction(
        courseUrl,
        Number(moduleId),
        { type: "File", contentId: uploaded.id, title: file.name },
        activeInstitution || undefined
      );

      if ("error" in result) throw new Error(result.error);

      setNote({
        kind: "success",
        text: `Added "${file.name}" to the module in ${courseName || "the course"}.`,
      });
      setAddNote(null);
      setAddTarget(null);
    } catch (err) {
      setAddNote({
        kind: "error",
        text: err instanceof Error ? err.message : "Failed to add to module",
      });
    } finally {
      setAdding(false);
    }
  };

  const reload = async () => {
    if (!user) return;
    setStatus("loading");
    try {
      const loaded = await listRecordingFiles(supabase, user.id);
      setFiles(loaded);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reload failed");
      setStatus("error");
    }
  };

  const readDuration = async (file: File): Promise<number | null> => {
    const url = URL.createObjectURL(file);
    try {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.src = url;
      await new Promise<void>((res, rej) => {
        v.addEventListener("loadedmetadata", () => res(), { once: true });
        v.addEventListener("error", () => rej(new Error("metadata failed")), { once: true });
      });
      const dur = await ensureFiniteDuration(v);
      return Number.isFinite(dur) && dur > 0 ? dur : null;
    } catch {
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !user) return;
    const arr = Array.from(fileList);
    setUploads(arr.map((f) => ({ name: f.name, status: "uploading" as const })));
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      try {
        const durationSec = await readDuration(file);
        await saveRecordingFile(supabase, user.id, file, {
          name: file.name.replace(/\.[^/.]+$/, "") || file.name,
          kind: "recording",
          mimeType: file.type || "video/webm",
          durationSec,
        });
        setUploads((u) => u.map((row, idx) => (idx === i ? { ...row, status: "done" as const } : row)));
      } catch (err) {
        setUploads((u) => u.map((row, idx) => (idx === i ? { ...row, status: "error" as const, error: err instanceof Error ? err.message : "Failed" } : row)));
      }
    }
    void reload();
  };

  // Persist courseUrl to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-files-course-url", courseUrl);
  }, [courseUrl]);

  // Persist moduleId to localStorage and update pendingModuleRef
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (moduleId === "") return;
    localStorage.setItem("ta-files-module-id", String(moduleId));
    pendingModuleRef.current = String(moduleId);
  }, [moduleId]);

  return (
    <section className={styles.card}>
      <TabHeader
        eyebrow="Files"
        title="Your video library"
        subtitle="Every video you record or caption is saved here. Play them back, download them, or add them to an LMS module."
      />

      {note && (
        <div className={note.kind === "error" ? styles.error : styles.fieldHint}>
          {note.text}
        </div>
      )}

      {status === "loading" && (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <div className={styles.loadingTitle}>Loading files...</div>
        </div>
      )}

      {status === "error" && (
        <div className={styles.error}>{error || "Failed to load files"}</div>
      )}

      {status === "ready" && files !== null && (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
            <label className={styles.downloadButton} style={{ cursor: "pointer" }}>
              Upload videos
              <input type="file" accept="video/*" multiple style={{ display: "none" }} onChange={(e) => { void handleUploadFiles(e.target.files); e.target.value = ""; }} />
            </label>
            <Button
              variant="outlined"
              size="small"
              onClick={() => void reload()}
              disabled={adding}
            >
              Refresh
            </Button>
            <span className={styles.fieldHint} style={{ margin: 0 }}>
              {files.length} file{files.length === 1 ? "" : "s"}
            </span>
          </div>

          <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void handleUploadFiles(e.dataTransfer.files); }} className={styles.ccDrop}>
            <span className={styles.ccHint}>Drop video files here to add them to your library.</span>
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

          {files.length === 0 ? (
            <div className={styles.emptyState}>
              No saved videos yet - record something on the Recording tab.
            </div>
          ) : (
            files.map((file) => (
              <div key={file.id} className={styles.ghRow}>
                <div className={styles.ghRowTop}>
                  <div className={styles.ghRowTitle}>
                    <div className={styles.ghRowName}>{file.name}</div>
                  </div>
                  <div className={styles.ghActions}>
                    <button
                      type="button"
                      className={styles.linkButton}
                      onClick={() => handleRename(file)}
                    >
                      Rename
                    </button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => void handleDownload(file)}
                    >
                      Download
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      onClick={() => void handleDelete(file)}
                    >
                      {confirmDelete === file.id ? "Confirm" : "Delete"}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        const opening = addTarget !== file.id;
                        setAddTarget(opening ? file.id : null);
                        // Auto-load the remembered course's modules when the
                        // panel opens for the first time.
                        if (opening && courseUrl && modulesStatus === "idle") {
                          void handleSelectCourse(courseUrl);
                        }
                      }}
                    >
                      Add to module
                    </Button>
                  </div>
                </div>

                <div className={styles.ghMeta}>
                  <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>
                    {file.kind === "recording" ? "Recording" : "Captioned"}
                  </span>
                  {file.durationSec !== null && <span>{fmt(file.durationSec)}</span>}
                  <span>{formatBytes(file.sizeBytes)} MB</span>
                  <span>{new Date(file.createdAt).toLocaleString()}</span>
                </div>

                {addTarget === file.id && (
                  <div className={styles.adaptPanel} style={{ marginTop: 8 }}>
                    {!activeInstitution ? (
                      <div className={styles.fieldHint}>
                        Pick an institution in the top bar first.
                      </div>
                    ) : (
                      <>
                        <CoursePicker
                          activeInstitution={activeInstitution}
                          courseUrl={courseUrl}
                          onSelect={handleSelectCourse}
                          courseName={courseName}
                        />

                        {courseUrl && (
                          <>
                            <TextField
                              select
                              value={moduleId}
                              onChange={(e) => setModuleId(e.target.value === "" ? "" : Number(e.target.value))}
                              placeholder="Choose a module..."
                              size="small"
                              sx={{ minWidth: 220, marginTop: 1 }}
                              disabled={modulesStatus !== "ready"}
                            >
                              {modulesStatus === "ready" && modules.length === 0 ? (
                                <MenuItem value="">No modules found</MenuItem>
                              ) : (
                                <>
                                  <MenuItem value="">Choose a module...</MenuItem>
                                  {modules.map((m) => (
                                    <MenuItem key={m.id} value={m.id}>
                                      {m.name}
                                    </MenuItem>
                                  ))}
                                </>
                              )}
                            </TextField>

                            <Button
                              variant="contained"
                              size="small"
                              onClick={() => void handleAddToModule(file)}
                              disabled={adding || moduleId === ""}
                              sx={{ marginTop: 1 }}
                            >
                              {adding ? "Adding..." : "Add"}
                            </Button>
                          </>
                        )}

                        {addNote && (
                          <div
                            className={
                              addNote.kind === "error"
                                ? styles.error
                                : styles.fieldHint
                            }
                            style={{ marginTop: 8 }}
                          >
                            {addNote.text}
                          </div>
                        )}

                        <Button
                          variant="text"
                          size="small"
                          onClick={() => {
                            setAddTarget(null);
                            setAddNote(null);
                          }}
                          sx={{ marginTop: 1 }}
                        >
                          Close
                        </Button>
                      </>
                    )}
                  </div>
                )}

                <details
                  style={{ marginTop: 8 }}
                  onToggle={(e) => void handlePlayToggle(file, e)}
                >
                  <summary
                    style={{
                      cursor: "pointer",
                      color: "var(--accent-ink)",
                      fontWeight: 600,
                    }}
                  >
                    Play
                  </summary>
                  {playUrls[file.id] && (
                    <video
                      controls
                      src={playUrls[file.id]}
                      style={{
                        maxWidth: "100%",
                        borderRadius: 8,
                        marginTop: 8,
                        background: "#0f172a",
                      }}
                    />
                  )}
                </details>
              </div>
            ))
          )}
        </>
      )}
    </section>
  );
}
