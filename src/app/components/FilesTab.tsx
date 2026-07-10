"use client";

import { useEffect, useRef, useState } from "react";
import { Button, TextField, MenuItem, Checkbox, FormControlLabel } from "@mui/material";
import TabHeader from "./TabHeader";
import CoursePicker from "./CoursePicker";
import { CourseCopyModal } from "./content-tab/CourseCopyModal";
import { parseCanvasCourseId } from "@/lib/canvas-url";
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
import { stripAudio } from "@/lib/strip-audio";
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

const kindLabels: Record<string, string> = {
  recording: "Recording",
  captioned: "Captioned",
  narrated: "Narrated",
};

export default function FilesTab() {
  const { supabase, user } = useSupabase();
  const { active: activeInstitution } = useInstitutionSelection();

  // Files state
  const [files, setFiles] = useState<RecordingFile[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  // Toolbar state (persisted)
  const [search, setSearch] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-files-search") ?? "";
  });
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name" | "largest">(() => {
    if (typeof window === "undefined") return "newest";
    const stored = localStorage.getItem("ta-files-sort");
    return (stored as "newest" | "oldest" | "name" | "largest" | null) ?? "newest";
  });
  const [filterKind, setFilterKind] = useState<"all" | "recording" | "captioned" | "narrated">(() => {
    if (typeof window === "undefined") return "all";
    const stored = localStorage.getItem("ta-files-kind");
    return (stored as "all" | "recording" | "captioned" | "narrated" | null) ?? "all";
  });

  // Delete confirmation state
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  // Rename drafts state
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>({});

  // Bulk selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Inline player state (per-row)
  const [expandedPlay, setExpandedPlay] = useState<string | null>(null);

  // Play URLs state
  const [playUrls, setPlayUrls] = useState<Record<string, string>>({});

  // Upload state
  const [uploads, setUploads] = useState<Array<{ name: string; status: "uploading" | "done" | "error"; error?: string }>>([]);

  // Strip audio state
  const [stripping, setStripping] = useState<{ id: string; pct: number } | null>(null);

  // Bulk add-to-module state
  const [bulkAdd, setBulkAdd] = useState(false);
  const [bulkAddStatus, setBulkAddStatus] = useState<string>("");

  // Add-to-module panel state
  const [addTarget, setAddTarget] = useState<string | null>(null);
  const [courseUrl, setCourseUrl] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-files-course-url") ?? "";
  });
  const [courseName, setCourseName] = useState("");
  const [modules, setModules] = useState<CanvasModule[]>([]);
  const [modulesStatus, setModulesStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [moduleId, setModuleId] = useState<number | "">("");
  const [bulkModuleId, setBulkModuleId] = useState<number | "">("");
  const [adding, setAdding] = useState(false);
  const [addNote, setAddNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const pendingModuleRef = useRef<string | null>((() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("ta-files-module-id");
  })());

  // Course-copy modal state; the copy targets the add-to-module panel's
  // persisted course.
  const [copyOpen, setCopyOpen] = useState(false);
  const courseId = parseCanvasCourseId(courseUrl);

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

  const saveRename = async (file: RecordingFile) => {
    const draft = nameDrafts[file.id];
    if (draft === undefined) return;
    const trimmed = draft.trim();
    if (!trimmed || trimmed === file.name) {
      setNameDrafts((prev) => {
        const next = { ...prev };
        delete next[file.id];
        return next;
      });
      return;
    }
    setFiles((prev) =>
      prev
        ? prev.map((f) =>
            f.id === file.id ? { ...f, name: trimmed } : f
          )
        : null
    );
    try {
      await renameRecordingFile(supabase, file.id, trimmed);
      setNameDrafts((prev) => {
        const next = { ...prev };
        delete next[file.id];
        return next;
      });
      setNote({ kind: "success", text: "File renamed." });
    } catch (err) {
      setNote({
        kind: "error",
        text: err instanceof Error ? err.message : "Failed to rename",
      });
      void reload();
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

  const handleStripAudio = async (file: RecordingFile) => {
    if (!user || stripping) return;
    setStripping({ id: file.id, pct: 0 });
    setNote(null);
    try {
      const blob = await downloadRecordingFile(supabase, file);
      const out = await stripAudio(blob, (pct) => setStripping({ id: file.id, pct }));
      await saveRecordingFile(supabase, user.id, out, {
        name: `${file.name} (no audio)`,
        kind: "recording",
        mimeType: out.type || "video/webm",
        durationSec: file.durationSec,
      });
      setNote({ kind: "success", text: `Created "${file.name} (no audio)".` });
      await reload();
    } catch (err) {
      setNote({ kind: "error", text: err instanceof Error ? err.message : "Could not strip the audio." });
    } finally {
      setStripping(null);
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


  const addOneToModule = async (file: RecordingFile, mId: number | string): Promise<void> => {
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
      Number(mId),
      { type: "File", contentId: uploaded.id, title: file.name },
      activeInstitution || undefined
    );

    if ("error" in result) throw new Error(result.error);
  };

  const handleAddToModule = async (file: RecordingFile) => {
    setAdding(true);
    setAddNote(null);

    try {
      await addOneToModule(file, moduleId);
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

  const handleBulkAddToModule = async () => {
    if (bulkModuleId === "" || selected.size === 0) return;
    const ids = [...selected];
    setAdding(true);
    setBulkAddStatus("");
    setNote(null);
    let added = 0;
    let failed = 0;

    for (let i = 0; i < ids.length; i++) {
      const fileId = ids[i];
      const file = files?.find((f) => f.id === fileId);
      if (!file) {
        failed += 1;
        continue;
      }
      setBulkAddStatus(`Adding ${i + 1} of ${ids.length}...`);
      try {
        await addOneToModule(file, bulkModuleId);
        added += 1;
      } catch {
        failed += 1;
      }
    }

    setAdding(false);
    setBulkAddStatus("");
    setNote({
      kind: failed > 0 ? "error" : "success",
      text: `Added ${added} file${added === 1 ? "" : "s"}${failed > 0 ? `, ${failed} failed` : ""}.`,
    });
    setSelected(new Set());
    setBulkAdd(false);
    setBulkModuleId("");
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirmBulkDelete) {
      setConfirmBulkDelete(true);
      return;
    }
    setConfirmBulkDelete(false);
    const ids = [...selected];
    setSelected(new Set());
    setFiles((prev) => (prev ? prev.filter((f) => !ids.includes(f.id)) : null));

    setNote(null);
    let failed = 0;
    for (const fileId of ids) {
      const file = files?.find((f) => f.id === fileId);
      if (!file) continue;
      try {
        await deleteRecordingFile(supabase, file);
      } catch {
        failed += 1;
      }
    }

    setNote({
      kind: failed > 0 ? "error" : "success",
      text: `Deleted ${ids.length - failed} file${ids.length - failed === 1 ? "" : "s"}${failed > 0 ? `, ${failed} failed` : ""}.`,
    });

    if (failed > 0) {
      void reload();
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

  // Persist search to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-files-search", search);
  }, [search]);

  // Persist sortBy to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-files-sort", sortBy);
  }, [sortBy]);

  // Persist filterKind to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-files-kind", filterKind);
  }, [filterKind]);

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

  // Derived list: filter and sort files
  const shown = (files || [])
    .filter((f) => {
      // Filter by search term
      if (!f.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      // Filter by kind
      if (filterKind !== "all" && f.kind !== filterKind) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "name":
          return a.name.localeCompare(b.name);
        case "largest":
          return b.sizeBytes - a.sizeBytes;
        case "newest":
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

  const allShownSelected = shown.length > 0 && shown.every((f) => selected.has(f.id));
  const toggleSelectAll = () =>
    setSelected(allShownSelected ? new Set() : new Set(shown.map((f) => f.id)));

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
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
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
            <Button
              variant="outlined"
              size="small"
              onClick={() => setCopyOpen(true)}
              disabled={!courseId}
              title="Copy a page or file from another Canvas course into this course"
            >
              Copy from another course
            </Button>
            <TextField
              size="small"
              type="search"
              placeholder="Search videos by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ flex: "1 1 200px", maxWidth: 300 }}
            />
            <TextField
              select
              size="small"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "newest" | "oldest" | "name" | "largest")}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="newest">Newest</MenuItem>
              <MenuItem value="oldest">Oldest</MenuItem>
              <MenuItem value="name">Name</MenuItem>
              <MenuItem value="largest">Largest</MenuItem>
            </TextField>
            <TextField
              select
              size="small"
              value={filterKind}
              onChange={(e) => setFilterKind(e.target.value as "all" | "recording" | "captioned" | "narrated")}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="all">All kinds</MenuItem>
              <MenuItem value="recording">Recordings</MenuItem>
              <MenuItem value="captioned">Captioned</MenuItem>
              <MenuItem value="narrated">Narrated</MenuItem>
            </TextField>
            <span className={styles.fieldHint} style={{ margin: 0, whiteSpace: "nowrap" }}>
              {shown.length} of {files.length} video{files.length === 1 ? "" : "s"}
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

          {selected.size > 0 && (
            <div className={styles.bulkBar}>
              <div className={styles.bulkBarHead}>
                <span className={styles.bulkCount}>
                  {selected.size} file{selected.size === 1 ? "" : "s"} selected
                </span>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setSelected(new Set())}
                  sx={{ color: "#fff", borderColor: "rgba(255,255,255,0.4)" }}
                >
                  Clear
                </Button>
              </div>
              {!bulkAdd && (
                <div className={styles.bulkRow}>
                  <span className={styles.bulkLabel}>Files</span>
                  <span className={styles.bulkField}>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => {
                        setBulkAdd(true);
                        if (courseUrl && modulesStatus === "idle") {
                          void handleSelectCourse(courseUrl);
                        }
                      }}
                    >
                      Add to module...
                    </Button>
                  </span>
                  <Button
                    variant="outlined"
                    size="small"
                    color="error"
                    onClick={() => void handleBulkDelete()}
                  >
                    {confirmBulkDelete ? "Confirm delete" : "Delete"}
                  </Button>
                </div>
              )}
              {bulkAdd && (
                <div className={styles.bulkRow} style={{ flexDirection: "column", alignItems: "flex-start" }}>
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
                            value={bulkModuleId}
                            onChange={(e) => setBulkModuleId(e.target.value === "" ? "" : Number(e.target.value))}
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
                          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                            <Button
                              variant="contained"
                              size="small"
                              onClick={() => void handleBulkAddToModule()}
                              disabled={adding || bulkModuleId === ""}
                            >
                              {adding ? `${bulkAddStatus || "Adding..."}` : "Add"}
                            </Button>
                            <Button
                              variant="outlined"
                              size="small"
                              onClick={() => {
                                setBulkAdd(false);
                                setBulkModuleId("");
                              }}
                              disabled={adding}
                            >
                              Cancel
                            </Button>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {files.length === 0 ? (
            <div className={styles.emptyState}>
              No videos yet. Record one on the Recording tab or upload files here.
            </div>
          ) : (
            <div className={styles.ccModule}>
              <FormControlLabel
                className={styles.fieldHint}
                style={{ display: "inline-flex", gap: 6, alignItems: "center", margin: 0, padding: "8px 12px" }}
                control={<Checkbox size="small" checked={allShownSelected} onChange={toggleSelectAll} disabled={shown.length === 0} />}
                label="Select all"
              />
              <div className={styles.ccItems} style={{ borderTop: "1px solid var(--card-border)" }}>
                {shown.length === 0 && (
                  <p className={styles.ccHint} style={{ padding: "4px 6px" }}>
                    No videos match your search.
                  </p>
                )}
                {shown.map((file) => (
                  <div key={file.id}>
                    <div className={styles.ccItem}>
                      <Checkbox
                        size="small"
                        className={styles.ccCheckbox}
                        checked={selected.has(file.id)}
                        onChange={() => setSelected((prev) => {
                          const next = new Set(prev);
                          if (next.has(file.id)) next.delete(file.id);
                          else next.add(file.id);
                          return next;
                        })}
                        aria-label={`Select ${file.name}`}
                      />
                      <span className={styles.ccType} title={file.mimeType}>
                        {kindLabels[file.kind] || file.kind}
                      </span>
                      <TextField
                        size="small"
                        type="text"
                        className={styles.ccItemName}
                        title={file.name}
                        value={nameDrafts[file.id] ?? file.name}
                        onChange={(e) => setNameDrafts((prev) => ({ ...prev, [file.id]: e.target.value }))}
                        onBlur={() => void saveRename(file)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                      />
                      <span className={styles.ccCount} style={{ width: 64, textAlign: "right", flexShrink: 0 }}>
                        {fmt(file.durationSec)}
                      </span>
                      <span className={styles.ccCount} style={{ width: 78, textAlign: "right", flexShrink: 0 }}>
                        {formatBytes(file.sizeBytes)} MB
                      </span>
                      <span className={styles.ccCount} style={{ width: 150, textAlign: "right", flexShrink: 0 }}>
                        {new Date(file.createdAt).toLocaleDateString()} {new Date(file.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          const opening = expandedPlay !== file.id;
                          setExpandedPlay(opening ? file.id : null);
                          if (opening && !playUrls[file.id]) {
                            void (async () => {
                              try {
                                const url = await getRecordingFileUrl(supabase, file);
                                setPlayUrls((prev) => ({ ...prev, [file.id]: url }));
                              } catch (err) {
                                setNote({
                                  kind: "error",
                                  text: err instanceof Error ? err.message : "Failed to load video",
                                });
                              }
                            })();
                          }
                        }}
                      >
                        {expandedPlay === file.id ? "Close" : "Play"}
                      </Button>
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
                        disabled={stripping !== null}
                        onClick={() => void handleStripAudio(file)}
                        title="Create a copy of this video without its audio track"
                      >
                        {stripping?.id === file.id ? `Stripping... ${stripping.pct}%` : "Strip audio"}
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          const opening = addTarget !== file.id;
                          setAddTarget(opening ? file.id : null);
                          if (opening && courseUrl && modulesStatus === "idle") {
                            void handleSelectCourse(courseUrl);
                          }
                        }}
                      >
                        Add to module
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        onClick={() => void handleDelete(file)}
                      >
                        {confirmDelete === file.id ? "Confirm" : "Delete"}
                      </Button>
                    </div>

                    {expandedPlay === file.id && (
                      <div style={{ padding: "12px 6px", borderTop: "1px solid var(--card-border)" }}>
                        {!playUrls[file.id] ? (
                          <span className={styles.ccHint}>Loading video...</span>
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
                      <div className={styles.adaptPanel} style={{ marginTop: 8, margin: "8px 6px 0" }}>
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
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {copyOpen && courseId && (
        <CourseCopyModal
          mode="import"
          focus="pages-files"
          courseUrl={courseUrl}
          currentCourseId={courseId}
          acronym={activeInstitution || undefined}
          onClose={() => setCopyOpen(false)}
          onDone={() => {
            setCopyOpen(false);
            void reload();
          }}
        />
      )}
    </section>
  );
}
