"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { stripAudio } from "@/lib/strip-audio";
import { getPreviewStrategy } from "@/lib/file-preview";
import { listCourseContentAction, sampleInUseAction } from "../actions";
import type { CanvasModule } from "@/lib/canvas-modules";
import TabShell from "./TabShell";
import styles from "../page.module.css";
import { FileList } from "./files/FileList";
import type { FileRowSharedProps } from "./files/FileRow";
import { FilterToolbar } from "./files/FilterToolbar";
// Signature-based two-click delete arming (B1): the bare boolean this tab
// used to arm bulk delete with survived a selection change untouched, so a
// confirm armed on 2 files could be spent on 40. This is the same mechanism
// every modules-side delete already uses - see that module's own header for
// the invariant ("the confirmation matches the thing that would be
// deleted").
import { isConfirmArmed, selectionSignature } from "./content-tab/modules/confirmArming";
import { UploadDropZone } from "./files/UploadDropZone";
import { BulkSelectionBar } from "./files/BulkSelectionBar";
import { useFilePreview } from "./files/useFilePreview";
import FilePreviewModal from "./FilePreviewModal";
// Pure/near-pure helpers extracted to keep this component under this
// project's 1000-line cap - see each module's own header for details.
import { filterAndSortFiles, type FilesFilterKind } from "./files/filter-sort";
import { classifyUploadFile } from "./files/upload-classify";
import { readDuration } from "./files/read-duration";
import { addFileToModule } from "./files/add-to-module";

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
  const [filterKind, setFilterKind] = useState<FilesFilterKind>(() => {
    if (typeof window === "undefined") return "all";
    const stored = localStorage.getItem("ta-files-kind");
    return (stored as FilesFilterKind | null) ?? "all";
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
  // Armed FOR a selection signature (confirmArming.ts), not a bare boolean -
  // see the derived `confirmBulkDelete` below, computed from the CURRENT
  // selection every render, so arming on {A,B} and then changing the
  // selection to {A,B,C,...} (e.g. via "Select all") disarms automatically.
  const [deleteArmedFor, setDeleteArmedFor] = useState<string | null>(null);

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

  // Focus restoration (docs/modal-focus-restoration-acceptance-criteria.md,
  // wave R3 slice B). CourseCopyModal's opener is threaded up from
  // FilterToolbar via the sibling onCopyTrigger callback (R2 convention) and
  // captured synchronously before setCopyOpen(true) - see FilterToolbar.tsx.
  // toolbarContainerRef is FilterToolbar's OWN root div, forwarded through
  // its new containerRef prop rather than wrapped a second time; it backs
  // both CourseCopyModal (whose button goes disabled={!canCopy} while the
  // modal can still be open, entry 291 AC4/entry 292) and FilePreviewModal.
  // filesTableFallbackRef is `.libTable`, the row list every FileRow lives
  // inside - nearer to FilePreviewModal's real opener than the toolbar, and
  // tried first for exactly that reason, even though it is itself swapped
  // out for the empty-state message whenever files.length is 0 (the same
  // "ordering, not omission" reasoning as FilesView.tsx's filesListFallbackRef).
  // subnavFallbackRef backstops both: they live inside
  // `status === "ready" && files !== null` below, and CourseCopyModal's
  // "Done" button calls setCopyOpen(false) then reload(), whose first
  // statement (setStatus("loading")) runs SYNCHRONOUSLY in that same click
  // handler - React batches both into one commit, so the modal, the toolbar
  // and the table unmount together on the modal's ordinary success path.
  // FilesView.tsx's toolbar dodges this by rendering unconditionally outside
  // any status ternary; FilterToolbar here does not, so that "ordering, not
  // omission" defence does not transfer to it (wave R3 bug report finding 1).
  // subnavFallbackRef is the Library/Submissions subnav below, which renders
  // regardless of status or filesView - nothing here can unmount alongside it.
  // previewTriggerRef (slice E) is FilePreviewModal's real opener, threaded
  // up via FileRow.tsx's sibling onPreviewTrigger callback -
  // handlePreviewTrigger below is the one callback identity passed at all
  // three FileRow render sites; see that file for why onPreview itself was
  // not widened to carry it.
  const filesTableFallbackRef = useRef<HTMLElement | null>(null);
  const toolbarContainerRef = useRef<HTMLElement | null>(null);
  const subnavFallbackRef = useRef<HTMLElement | null>(null);
  const copyTriggerRef = useRef<HTMLElement | null>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const handlePreviewTrigger = useCallback((el: HTMLElement) => {
    previewTriggerRef.current = el;
  }, []);

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

  // FilePreviewModal's restoreFocusRef (previewTriggerRef) is captured via
  // FileRow.tsx's sibling onPreviewTrigger callback, wired at each render
  // site below - not here, since this function never receives the click.
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

    // AC7.2: deleteRecordingFile removes the storage object before the row,
    // and knows nothing about likenesses. A sample still referenced by a
    // likeness that is training must not be deleted, because that would 404
    // the signed URL Tavus is mid-fetch on. See docs/REGRESSION.md,
    // "2026-08-06 - recording_files.kind as a five-place contract".
    //
    // sampleInUseAction (src/app/actions/media-likeness.ts) fails CLOSED: on
    // an internal error (DB blip, auth hiccup, etc.) it swallows the failure
    // and resolves { inUse: true } rather than throwing, so this call site
    // cannot tell "confirmed in use" apart from "could not verify" - both
    // arrive as the identical { inUse: true }. The copy below is worded to
    // stay true either way rather than asserting a likeness is definitely
    // training.
    if (file.kind === "sample") {
      try {
        const { inUse } = await sampleInUseAction(file.id);
        if (inUse) {
          setConfirmDelete(null);
          setNote({
            kind: "error",
            text: "This sample can't be deleted right now - it may still be in use by a likeness that is training. Wait for training to finish (or fail), then try again.",
          });
          return;
        }
      } catch (err) {
        setConfirmDelete(null);
        setNote({
          kind: "error",
          text: err instanceof Error ? err.message : "Could not check whether this sample is still in use.",
        });
        return;
      }
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


  const addOneToModule = (file: RecordingFile, mId: number | string): Promise<void> =>
    addFileToModule(supabase, courseUrl, activeInstitution, file, mId);

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

  // Signature of the CURRENT selection, recomputed every render - see
  // deleteArmedFor's own comment above.
  const bulkDeleteSig = selectionSignature(selected);
  const confirmBulkDelete = isConfirmArmed(deleteArmedFor, bulkDeleteSig);

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirmBulkDelete) {
      setDeleteArmedFor(bulkDeleteSig);
      return;
    }
    setDeleteArmedFor(null);
    const ids = [...selected];
    setSelected(new Set());

    setNote(null);
    let failed = 0;
    let blocked = 0;
    const deletedIds: string[] = [];
    for (const fileId of ids) {
      const file = files?.find((f) => f.id === fileId);
      if (!file) continue;
      // AC7.2 - same in-use guard as the single-file delete path, see there
      // for the rationale and for why the blocked-delete copy below is
      // worded as a possibility ("may still be in use") rather than a
      // certainty - sampleInUseAction fails closed, so inUse: true here can
      // mean either "confirmed in use" or "could not verify".
      if (file.kind === "sample") {
        try {
          const { inUse } = await sampleInUseAction(file.id);
          if (inUse) {
            blocked += 1;
            continue;
          }
        } catch {
          failed += 1;
          continue;
        }
      }
      try {
        await deleteRecordingFile(supabase, file);
        deletedIds.push(fileId);
      } catch {
        failed += 1;
      }
    }
    setFiles((prev) => (prev ? prev.filter((f) => !deletedIds.includes(f.id)) : null));

    const summary = [`Deleted ${deletedIds.length} file${deletedIds.length === 1 ? "" : "s"}`];
    if (blocked > 0) {
      summary.push(`${blocked} may still be in use by a training likeness and can't be deleted yet`);
    }
    if (failed > 0) {
      summary.push(`${failed} failed`);
    }
    setNote({
      kind: failed > 0 || blocked > 0 ? "error" : "success",
      text: `${summary.join(", ")}.`,
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
        const { kind, mimeType } = classifyUploadFile(file);
        const durationSec = file.type.startsWith("video/") ? await readDuration(file) : null;

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

  // Derived list: filter and sort files (filterAndSortFiles, files/filter-sort.ts)
  const shown = filterAndSortFiles(files || [], { search, filterWorkflow, filterKind, sortBy });

  const allShownSelected = shown.length > 0 && shown.every((f) => selected.has(f.id));
  const toggleSelectAll = () =>
    setSelected(allShownSelected ? new Set() : new Set(shown.map((f) => f.id)));

  // Shared by every <FileRow> render site inside <FileList> (grouped /
  // ungrouped / flat) - previously three identical inline closures, one per
  // site.
  const handleSelectToggle = (fileId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });

  const handleNameChange = (fileId: string, name: string) =>
    setNameDrafts((prev) => ({ ...prev, [fileId]: name }));

  const handleAddToModuleCancel = () => {
    setAddTarget(null);
    setAddNote(null);
  };

  // Every prop <FileRow> needs except `file` itself - one object, spread at
  // FileList.tsx's three render sites (files/FileList.tsx, files/FileRow.tsx's
  // FileRowSharedProps), replacing what used to be the same ~28 props
  // spelled out in full three times over.
  const fileRowProps: FileRowSharedProps = {
    selected,
    onSelectToggle: handleSelectToggle,
    onDelete: handleDelete,
    confirmDelete,
    onDownload: handleDownload,
    onStripAudio: handleStripAudio,
    stripping,
    nameDrafts,
    onNameChange: handleNameChange,
    onSaveRename: saveRename,
    expandedPlay,
    playUrls,
    onPlayToggle: setExpandedPlay,
    onPreview: handleFilePreview,
    onPreviewTrigger: handlePreviewTrigger,
    previewLoading: filePreview.loading,
    addTarget,
    onAddTargetToggle: setAddTarget,
    courseUrl,
    courseName,
    moduleId,
    modules,
    modulesStatus,
    onModuleSelect: setModuleId,
    onAddToModule: handleAddToModule,
    adding,
    addNote,
    onAddToModuleCancel: handleAddToModuleCancel,
    activeInstitution,
    onSelectCourse: handleSelectCourse,
  };

  return (
    <TabShell>
      <TabHeader
        eyebrow="Files"
        title="Your file library"
        subtitle="Recordings, audio, bundles, and any other files you save are kept here. Play or download them, or add them to an LMS module."
      />

      <div
        className={styles.manualSubnav}
        ref={(el) => {
          subnavFallbackRef.current = el;
        }}
        tabIndex={-1}
      >
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

      {/* S1 (docs/ux-audit-files-content.md): sole reporting channel for
          every rename/delete/strip-audio/add-to-module/bulk-delete outcome
          on this tab - role/aria-live make it audible to a screen reader,
          which it previously was not. */}
      {note && (
        <div
          role={note.kind === "error" ? "alert" : "status"}
          aria-live="polite"
          className={note.kind === "error" ? styles.error : styles.fieldHint}
        >
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
                onCopyTrigger={(el) => {
                  copyTriggerRef.current = el;
                }}
                onRefresh={() => void reload()}
                canCopy={!!courseId}
                isRefreshing={adding}
                containerRef={toolbarContainerRef}
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

          <FileList
            files={files}
            shown={shown}
            groupBy={groupBy}
            allShownSelected={allShownSelected}
            onToggleSelectAll={toggleSelectAll}
            onOpenWorkflow={onOpenWorkflow}
            listRef={(el) => {
              filesTableFallbackRef.current = el;
            }}
            fileRowProps={fileRowProps}
          />
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
              restoreFocusRef={copyTriggerRef}
              fallbackFocusRefs={[toolbarContainerRef, subnavFallbackRef]}
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
          // restoreFocusRef closes the gap R3 slice B left open (entry 291's
          // "Limits"): FileRow.tsx now forwards its Preview button via
          // onPreviewTrigger, wired at all three render sites above.
          // subnavFallbackRef (finding 1) is the new third candidate - the
          // other two still cover a row/toolbar that unmounted on its own
          // (search filter, delete, reload) while open.
          restoreFocusRef={previewTriggerRef}
          fallbackFocusRefs={[filesTableFallbackRef, toolbarContainerRef, subnavFallbackRef]}
        />
      )}
    </TabShell>
  );
}
