"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Checkbox } from "@mui/material";
import TabHeader from "./TabHeader";
import { CourseCopyModal } from "./content-tab/CourseCopyModal";
import CartridgeDropPanel from "./CartridgeDropPanel";
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
  extForFile,
  stripMatchingExt,
  type RecordingFile,
} from "@/lib/recording-files";
import { ensureFiniteDuration } from "@/lib/caption-burn";
import { stripAudio } from "@/lib/strip-audio";
import { groupRecordingFiles } from "@/lib/recording-file-groups";
import { getPreviewStrategy } from "@/lib/file-preview";
import { formatRelative } from "@/app/utils/time";
import {
  listCourseContentAction,
  requestFileUploadAction,
  createModuleItemAction,
} from "../actions";
import type { CanvasModule } from "@/lib/canvas-modules";
import styles from "../page.module.css";
import { FileRow } from "./files/FileRow";
import { FilterToolbar } from "./files/FilterToolbar";
import { UploadDropZone } from "./files/UploadDropZone";
import { BulkSelectionBar } from "./files/BulkSelectionBar";
import { useFilePreview } from "./files/useFilePreview";
import FilePreviewModal from "./FilePreviewModal";

export default function FilesTab({ onOpenWorkflow }: { onOpenWorkflow?: (workflowId: string) => void } = {}) {
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
  const [filterKind, setFilterKind] = useState<"all" | "recording" | "captioned" | "narrated" | "audio" | "bundle" | "file">(() => {
    if (typeof window === "undefined") return "all";
    const stored = localStorage.getItem("ta-files-kind");
    return (stored as "all" | "recording" | "captioned" | "narrated" | "audio" | "bundle" | "file" | null) ?? "all";
  });
  const [filterWorkflow, setFilterWorkflow] = useState<"all" | "workflow">(() => {
    if (typeof window === "undefined") return "all";
    const stored = localStorage.getItem("ta-files-workflow");
    return (stored as "all" | "workflow" | null) ?? "all";
  });
  const [groupBy, setGroupBy] = useState<"flat" | "grouped">(() => {
    if (typeof window === "undefined") return "grouped";
    const stored = localStorage.getItem("ta-files-group");
    return (stored as "flat" | "grouped" | null) ?? "grouped";
  });

  // Files view (Library or Submissions) - persisted
  const [filesView, setFilesViewState] = useState<"library" | "submissions">(() => {
    if (typeof window === "undefined") return "library";
    return localStorage.getItem("ta-files-view") === "submissions" ? "submissions" : "library";
  });
  const setFilesView = (v: "library" | "submissions") => {
    setFilesViewState(v);
    if (typeof window !== "undefined") localStorage.setItem("ta-files-view", v);
  };

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

  // File preview state
  const filePreview = useFilePreview();

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
      const ext = extForFile(file);
      const nameWithoutExt = stripMatchingExt(file.name, ext);
      const downloadName = nameWithoutExt === file.name ? `${file.name}.${ext}` : file.name;
      a.download = downloadName;
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

  const handleFilePreview = (file: RecordingFile) => {
    const strategy = getPreviewStrategy(file.mimeType, extForFile(file));
    if (strategy === "media-play") {
      setExpandedPlay(file.id);
      return;
    }
    void filePreview.openPreview(file, supabase);
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
    const fileName = `${file.name.replace(/[^a-z0-9 _-]/gi, "_")}.${extForFile(file)}`;
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
        // Derive extension from filename
        const dotIdx = file.name.lastIndexOf(".");
        const fileExt = dotIdx > 0 ? file.name.slice(dotIdx + 1).toLowerCase() : "";

        // Decide kind and mime based on file.type
        let kind: "recording" | "captioned" | "narrated" | "bundle" | "file" = "file";
        let mimeType = file.type || "application/octet-stream";
        let durationSec: number | null = null;

        if (file.type.startsWith("video/")) {
          kind = "recording";
          mimeType = file.type;
          durationSec = await readDuration(file);
        } else if (file.type.startsWith("audio/")) {
          kind = "recording";
          mimeType = file.type;
          durationSec = null;
        } else if (mimeType.includes("zip")) {
          kind = "bundle";
        }

        await saveRecordingFile(supabase, user.id, file, {
          name: file.name.replace(/\.[^/.]+$/, "") || file.name,
          kind,
          mimeType,
          durationSec,
          fileExt: fileExt || undefined,
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

  // Persist filterWorkflow to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-files-workflow", filterWorkflow);
  }, [filterWorkflow]);

  // Persist groupBy to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-files-group", groupBy);
  }, [groupBy]);

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

  const handlePlayUrlLoad = useCallback(async (file: RecordingFile) => {
    try {
      const url = await getRecordingFileUrl(supabase, file);
      setPlayUrls((prev) => ({ ...prev, [file.id]: url }));
    } catch (err) {
      setNote({
        kind: "error",
        text: err instanceof Error ? err.message : "Failed to load file",
      });
    }
  }, [supabase]);

  // Load play URL when a file is expanded
  useEffect(() => {
    if (!expandedPlay || playUrls[expandedPlay]) return;
    const file = files?.find((f) => f.id === expandedPlay);
    if (!file) return;
    void handlePlayUrlLoad(file);
  }, [expandedPlay, playUrls, files, handlePlayUrlLoad]);

  // Derived list: filter and sort files
  const shown = (files || [])
    .filter((f) => {
      // Filter by search term
      if (!f.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      // Filter by workflow source
      if (filterWorkflow === "workflow") {
        if (f.source !== "workflow") return false;
      }
      // Filter by kind
      if (filterKind === "audio") {
        return f.mimeType.startsWith("audio/");
      }
      if (filterKind === "bundle") {
        return f.kind === "bundle" || f.mimeType.includes("zip");
      }
      if (filterKind === "file") {
        return f.kind === "file";
      }
      if (filterKind !== "all") {
        return f.kind === filterKind && !f.mimeType.startsWith("audio/");
      }
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
        title="Your file library"
        subtitle="Recordings, audio, bundles, and any other files you save are kept here. Play or download them, or add them to an LMS module."
      />

      <div className={styles.manualSubnav}>
        <div className={styles.lessonInnerTabs} role="tablist" aria-label="Files">
          <button
            type="button"
            role="tab"
            aria-selected={filesView === "library"}
            className={`${styles.lessonInnerTab}${filesView === "library" ? ` ${styles.lessonInnerTabActive}` : ""}`}
            onClick={() => setFilesView("library")}
          >
            Library
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filesView === "submissions"}
            className={`${styles.lessonInnerTab}${filesView === "submissions" ? ` ${styles.lessonInnerTabActive}` : ""}`}
            onClick={() => setFilesView("submissions")}
          >
            Submissions
          </button>
        </div>
      </div>

      {note && (
        <div className={note.kind === "error" ? styles.error : styles.fieldHint}>
          {note.text}
        </div>
      )}

      {filesView === "library" && (
        <>
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
              <FilterToolbar
                search={search}
                onSearchChange={setSearch}
                sortBy={sortBy}
                onSortChange={setSortBy}
                filterKind={filterKind}
                onFilterKindChange={setFilterKind}
                filterWorkflow={filterWorkflow}
                onFilterWorkflowChange={setFilterWorkflow}
                groupBy={groupBy}
                onGroupByChange={setGroupBy}
                onUploadChange={(files) => void handleUploadFiles(files)}
                onCopyClick={() => setCopyOpen(true)}
                onRefresh={() => void reload()}
                canCopy={!!courseId}
                isRefreshing={adding}
              />

              <UploadDropZone
                uploads={uploads}
                onDrop={(fileList) => void handleUploadFiles(fileList)}
                fileCount={shown.length}
              />

              {selected.size > 0 && (
                <BulkSelectionBar
                  selectedCount={selected.size}
                  onClearSelection={() => setSelected(new Set())}
                  bulkAdd={bulkAdd}
                  onToggleBulkAdd={setBulkAdd}
                  bulkModuleId={bulkModuleId}
                  onBulkModuleSelect={setBulkModuleId}
                  modules={modules}
                  modulesStatus={modulesStatus}
                  courseUrl={courseUrl}
                  courseName={courseName}
                  activeInstitution={activeInstitution}
                  onSelectCourse={handleSelectCourse}
                  onAddToModule={() => void handleBulkAddToModule()}
                  adding={adding}
                  bulkAddStatus={bulkAddStatus}
                  confirmBulkDelete={confirmBulkDelete}
                  onDelete={() => void handleBulkDelete()}
                />
              )}

          {files.length === 0 ? (
            <div className={styles.emptyState}>
              No files yet. Record one on the Recording tab or upload files here.
            </div>
          ) : (
            <div className={styles.libTable}>
              <div className={styles.libHead}>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <Checkbox size="small" checked={allShownSelected} onChange={toggleSelectAll} disabled={shown.length === 0} />
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
                              <FileRow
                                key={file.id}
                                file={file}
                                selected={selected}
                                onSelectToggle={(fileId) => setSelected((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(fileId)) next.delete(fileId);
                                  else next.add(fileId);
                                  return next;
                                })}
                                onDelete={handleDelete}
                                confirmDelete={confirmDelete}
                                onDownload={handleDownload}
                                onStripAudio={handleStripAudio}
                                stripping={stripping}
                                nameDrafts={nameDrafts}
                                onNameChange={(fileId, name) => setNameDrafts((prev) => ({ ...prev, [fileId]: name }))}
                                onSaveRename={saveRename}
                                expandedPlay={expandedPlay}
                                playUrls={playUrls}
                                onPlayToggle={setExpandedPlay}
                                onPreview={handleFilePreview}
                                previewLoading={filePreview.loading}
                                addTarget={addTarget}
                                onAddTargetToggle={setAddTarget}
                                courseUrl={courseUrl}
                                courseName={courseName}
                                moduleId={moduleId}
                                modules={modules}
                                modulesStatus={modulesStatus}
                                onModuleSelect={setModuleId}
                                onAddToModule={handleAddToModule}
                                adding={adding}
                                addNote={addNote}
                                onAddToModuleCancel={() => {
                                  setAddTarget(null);
                                  setAddNote(null);
                                }}
                                activeInstitution={activeInstitution}
                                onSelectCourse={handleSelectCourse}
                              />
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
                              <FileRow
                                key={file.id}
                                file={file}
                                selected={selected}
                                onSelectToggle={(fileId) => setSelected((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(fileId)) next.delete(fileId);
                                  else next.add(fileId);
                                  return next;
                                })}
                                onDelete={handleDelete}
                                confirmDelete={confirmDelete}
                                onDownload={handleDownload}
                                onStripAudio={handleStripAudio}
                                stripping={stripping}
                                nameDrafts={nameDrafts}
                                onNameChange={(fileId, name) => setNameDrafts((prev) => ({ ...prev, [fileId]: name }))}
                                onSaveRename={saveRename}
                                expandedPlay={expandedPlay}
                                playUrls={playUrls}
                                onPlayToggle={setExpandedPlay}
                                onPreview={handleFilePreview}
                                previewLoading={filePreview.loading}
                                addTarget={addTarget}
                                onAddTargetToggle={setAddTarget}
                                courseUrl={courseUrl}
                                courseName={courseName}
                                moduleId={moduleId}
                                modules={modules}
                                modulesStatus={modulesStatus}
                                onModuleSelect={setModuleId}
                                onAddToModule={handleAddToModule}
                                adding={adding}
                                addNote={addNote}
                                onAddToModuleCancel={() => {
                                  setAddTarget(null);
                                  setAddNote(null);
                                }}
                                activeInstitution={activeInstitution}
                                onSelectCourse={handleSelectCourse}
                              />
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </>
              ) : (
                shown.map((file) => (
                  <FileRow
                    key={file.id}
                    file={file}
                    selected={selected}
                    onSelectToggle={(fileId) => setSelected((prev) => {
                      const next = new Set(prev);
                      if (next.has(fileId)) next.delete(fileId);
                      else next.add(fileId);
                      return next;
                    })}
                    onDelete={handleDelete}
                    confirmDelete={confirmDelete}
                    onDownload={handleDownload}
                    onStripAudio={handleStripAudio}
                    stripping={stripping}
                    nameDrafts={nameDrafts}
                    onNameChange={(fileId, name) => setNameDrafts((prev) => ({ ...prev, [fileId]: name }))}
                    onSaveRename={saveRename}
                    expandedPlay={expandedPlay}
                    playUrls={playUrls}
                    onPlayToggle={setExpandedPlay}
                    onPreview={handleFilePreview}
                    previewLoading={filePreview.loading}
                    addTarget={addTarget}
                    onAddTargetToggle={setAddTarget}
                    courseUrl={courseUrl}
                    courseName={courseName}
                    moduleId={moduleId}
                    modules={modules}
                    modulesStatus={modulesStatus}
                    onModuleSelect={setModuleId}
                    onAddToModule={handleAddToModule}
                    adding={adding}
                    addNote={addNote}
                    onAddToModuleCancel={() => {
                      setAddTarget(null);
                      setAddNote(null);
                    }}
                    activeInstitution={activeInstitution}
                    onSelectCourse={handleSelectCourse}
                  />
                ))
              )}
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
        </>
      )}

      {filesView === "submissions" && <CartridgeDropPanel />}

      {filePreview.file && (
        <FilePreviewModal
          selectedPreview={filePreview.file}
          previewBlobUrl={filePreview.blobUrl}
          onClose={filePreview.closePreview}
        />
      )}
    </section>
  );
}
