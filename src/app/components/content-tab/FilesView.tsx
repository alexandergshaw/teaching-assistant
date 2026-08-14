"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createModuleItemAction,
  deleteCourseFileAction,
  listCourseFilesAction,
  previewFileAction,
  renameCourseFileAction,
  requestFileUploadAction,
} from "../../actions";
import type { CanvasModule, CourseFile } from "@/lib/canvas-modules";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import styles from "../../page.module.css";
import { base64ToBlobUrl, fileKindLabel, findDuplicateGroups, formatBytes } from "./utils";
import DocStructureEditor from "../DocStructureEditor";
import FilePreviewModal, { type PreviewFile } from "../FilePreviewModal";
import { OfficeEditorModal } from "./OfficeEditorModal";
import { CourseCopyModal } from "./CourseCopyModal";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import { LIVE_CONTENT_SOURCE, gateOperation, type ContentSourceContext } from "./contentSourceGating";

export function FilesView({
  courseUrl,
  acronym,
  modules,
  sourceContext,
}: {
  courseUrl: string;
  acronym?: string;
  modules: CanvasModule[];
  /** Which Course Content source is active - see contentSourceGating.ts.
   * Optional, defaulted to LIVE_CONTENT_SOURCE so the existing call site
   * (which doesn't pass this yet) is unaffected. */
  sourceContext?: ContentSourceContext;
}) {
  const ctx = sourceContext ?? LIVE_CONTENT_SOURCE;
  // Gated as ONE unit (entry 263 check 5): a cartridge carries no standalone
  // files list at all - files exist only as File-type items inside modules,
  // title only, no size/content-type/download URL/id. There is no partial,
  // honest version of this view to show from an export, so the whole view
  // is replaced by one explanation below rather than rendering an upload box
  // with no visibility into what (if anything) already exists.
  const filesGate = gateOperation(ctx, "files");
  const [files, setFiles] = useState<CourseFile[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ file: PreviewFile; blobUrl: string | null } | null>(null);
  const [uploads, setUploads] = useState<Array<{ name: string; status: "uploading" | "done" | "error"; error?: string }>>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkModule, setBulkModule] = useState<number | "">("");
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [editFile, setEditFile] = useState<CourseFile | null>(null);
  const [structureFile, setStructureFile] = useState<CourseFile | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const courseId = parseCanvasCourseId(courseUrl);

  // Focus restoration (docs/modal-focus-restoration-acceptance-criteria.md,
  // wave R3). Every opener below writes `event.currentTarget` into its own
  // ref, synchronously in the same onClick (decision 3) - openPreview awaits,
  // so its capture happens before that await, not inside the async
  // continuation that follows it.
  //
  // Two fallback tiers, nearest-first (matching R2's ordering -
  // ModulesView.tsx's [modulesListFallbackRef, headerFallbackRef]):
  // filesListFallbackRef (the row-list wrapper just above `shown.map(...)`)
  // is tried before filesToolbarFallbackRef (a screenful further up), for
  // the three row-scoped dialogs (FilePreviewModal, OfficeEditorModal,
  // DocStructureEditor) whose openers live inside those rows and can unmount
  // from a search filter, a delete, or the row simply going away on reload.
  // Naming the row list first is safe even though it is ITSELF conditionally
  // rendered - the status ternary below swaps it out for a loading/error/
  // empty state whenever `files` is empty or a load is in flight -
  // because ORDERING, not omission, is what handles that: `restoreTarget`
  // skips a disconnected first candidate and falls through to the next one
  // automatically, which is exactly what the ordered array is for. The
  // toolbar renders unconditionally for as long as `filesGate.allowed` stays
  // true (see the early return below), so it remains the backstop. Both
  // wrapper elements need `tabIndex={-1}` for `.focus()` to do anything; a
  // non-focusable container is a silent no-op (useModalDismiss.ts).
  const filesToolbarFallbackRef = useRef<HTMLElement | null>(null);
  const filesListFallbackRef = useRef<HTMLElement | null>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const officeEditorTriggerRef = useRef<HTMLElement | null>(null);
  const structureTriggerRef = useRef<HTMLElement | null>(null);
  // CourseCopyModal's only opener is the toolbar's own "Copy from another
  // course" button. The button unmounting is not the risk here - the
  // toolbar is rendered unconditionally and outlives it - the risk is the
  // button going DISABLED (disabled={!courseId}) while the modal stays
  // open: restoreTarget's own candidate check does more than `isConnected`
  // (see modalFocus.ts's canReceiveFocus), so a disabled opener is correctly
  // treated as unusable, and without a fallback here that leaves nothing to
  // fall through to - focus would land on <body>, looking exactly like
  // success. filesToolbarFallbackRef (the button's own parent) is already
  // refed and focusable, so it is passed as this dialog's fallback too.
  const copyTriggerRef = useRef<HTMLElement | null>(null);

  const shown = files.filter((f) => f.displayName.toLowerCase().includes(search.trim().toLowerCase()));
  const dupGroups = useMemo(() => findDuplicateGroups(files), [files]);
  const strayCount = dupGroups.reduce((n, g) => n + g.strays.length, 0);
  // Select every older copy across duplicate groups so the user can review the
  // selection and remove them through the existing (confirm-guarded) bulk delete.
  const selectStrays = () => setSelected(new Set(dupGroups.flatMap((g) => g.strays.map((s) => s.id))));
  const toggleSelected = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allShownSelected = shown.length > 0 && shown.every((f) => selected.has(f.id));
  const toggleSelectAll = () => setSelected(allShownSelected ? new Set() : new Set(shown.map((f) => f.id)));
  // Modules whose items reference this file (as a File module item).
  const fileModules = (fileId: number) =>
    modules.filter((m) => m.items.some((it) => it.type === "File" && it.contentId === fileId)).map((m) => m.name);

  const bulkAddToModule = async () => {
    if (bulkModule === "" || selected.size === 0) return;
    const ids = [...selected];
    setBusy(true);
    setNote(null);
    let added = 0;
    let failed = 0;
    for (const fileId of ids) {
      const result = await createModuleItemAction(courseUrl, bulkModule, { type: "File", contentId: fileId }, acronym);
      if ("error" in result) failed += 1;
      else added += 1;
    }
    setBusy(false);
    setNote({ kind: failed ? "error" : "success", text: `Added to module: ${added} done${failed ? `, ${failed} failed` : ""}.` });
    setSelected(new Set());
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirmBulkDelete) {
      setConfirmBulkDelete(true);
      return;
    }
    setConfirmBulkDelete(false);
    const ids = [...selected];
    setSelected(new Set());
    setFiles((fs) => fs.filter((x) => !ids.includes(x.id)));
    setBusy(true);
    setNote(null);
    let failed = 0;
    for (const fileId of ids) {
      const result = await deleteCourseFileAction(courseUrl, fileId, acronym);
      if ("error" in result) failed += 1;
    }
    setBusy(false);
    setNote({ kind: failed ? "error" : "success", text: `Deleted ${ids.length - failed} file${ids.length - failed === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}.` });
    if (failed) {
      const r = await listCourseFilesAction(courseUrl, acronym);
      if (!("error" in r)) setFiles(r.files);
    }
  };

  const reload = async () => {
    // Never hits the live Canvas Files API while viewing a stored export -
    // that would silently show LIVE data under a view whose whole point is
    // reading the export instead (see the whole-view gate above this
    // component's state, and `filesGate` used in the render below).
    if (ctx.source === "export") {
      setFiles([]);
      setStatus("ready");
      return;
    }
    const result = await listCourseFilesAction(courseUrl, acronym);
    if ("error" in result) {
      setError(result.error);
      setStatus("error");
      return;
    }
    setFiles(result.files);
    setStatus("ready");
  };

  useEffect(() => {
    if (!courseUrl || ctx.source === "export") {
      setFiles([]);
      setStatus("ready");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    (async () => {
      const result = await listCourseFilesAction(courseUrl, acronym);
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
        setStatus("error");
        return;
      }
      setFiles(result.files);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, acronym, ctx.source]);

  const saveRename = async (f: CourseFile) => {
    const draft = drafts[f.id];
    if (draft === undefined) return;
    const name = draft.trim();
    if (!name || name === f.displayName) return;
    setFiles((fs) => fs.map((x) => (x.id === f.id ? { ...x, displayName: name } : x)));
    setBusy(true);
    setNote(null);
    const result = await renameCourseFileAction(courseUrl, f.id, name, acronym);
    setBusy(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      void reload();
    }
  };

  const removeFile = async (f: CourseFile) => {
    if (confirmDelete !== f.id) {
      setConfirmDelete(f.id);
      return;
    }
    setConfirmDelete(null);
    setFiles((fs) => fs.filter((x) => x.id !== f.id));
    setBusy(true);
    setNote(null);
    const result = await deleteCourseFileAction(courseUrl, f.id, acronym);
    setBusy(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      void reload();
    } else {
      setNote({ kind: "success", text: "File deleted." });
    }
  };

  const openPreview = async (f: CourseFile, trigger: HTMLElement) => {
    // Captured synchronously, before the await below (decision 3) - this
    // function itself performs the await, so capture cannot happen from the
    // onClick's async continuation.
    previewTriggerRef.current = trigger;
    setPreview({ file: { student: "", name: f.displayName, extension: "", content: "Loading…", truncated: false }, blobUrl: null });
    const result = await previewFileAction(courseUrl, f.id, acronym);
    if ("error" in result) {
      setPreview({ file: { student: "", name: f.displayName, extension: "", content: result.error, truncated: false }, blobUrl: null });
      return;
    }
    const p = result.preview;
    const blobUrl = p.base64 ? base64ToBlobUrl(p.base64, p.mimeType) : null;
    setPreview({
      file: { student: "", name: p.name, extension: "", content: p.text, truncated: p.truncated, rawBase64: p.base64 || undefined, mimeType: p.mimeType },
      blobUrl,
    });
  };
  const closePreview = () =>
    setPreview((prev) => {
      if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl);
      return null;
    });

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const arr = Array.from(fileList);
    setUploads(arr.map((f) => ({ name: f.name, status: "uploading" as const })));
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      try {
        const ticket = await requestFileUploadAction(
          courseUrl,
          { name: file.name, size: file.size, contentType: file.type, folderPath: "uploads" },
          acronym
        );
        if ("error" in ticket) throw new Error(ticket.error);
        const form = new FormData();
        for (const [k, v] of Object.entries(ticket.ticket.uploadParams)) form.append(k, v);
        form.append("file", file);
        const up = await fetch(ticket.ticket.uploadUrl, { method: "POST", body: form });
        if (!up.ok) throw new Error(`Upload failed (HTTP ${up.status}).`);
        setUploads((u) => u.map((row, idx) => (idx === i ? { ...row, status: "done" as const } : row)));
      } catch (err) {
        setUploads((u) =>
          u.map((row, idx) => (idx === i ? { ...row, status: "error" as const, error: err instanceof Error ? err.message : "Failed" } : row))
        );
      }
    }
    void reload();
  };

  if (!filesGate.allowed) {
    return (
      <div className={styles.form}>
        <p className={styles.emptyState}>{filesGate.reason}</p>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <div
        ref={(el) => {
          filesToolbarFallbackRef.current = el;
        }}
        tabIndex={-1}
        style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
      >
        <label className={styles.downloadButton} style={{ cursor: "pointer" }}>
          Upload files
          <input
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <Button variant="outlined" size="small" onClick={() => void reload()} disabled={busy}>
          Refresh
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={(e) => {
            copyTriggerRef.current = e.currentTarget;
            setCopyOpen(true);
          }}
          disabled={!courseId}
          title="Copy a page or file from another Canvas course into this course"
        >
          Copy from another course
        </Button>
        <TextField
          size="small"
          type="search"
          placeholder="Search files by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ flex: "1 1 200px", maxWidth: 300 }}
        />
        <span className={styles.fieldHint} style={{ margin: 0 }}>
          {search.trim() ? `${shown.length} of ${files.length}` : files.length} file{files.length === 1 ? "" : "s"}
        </span>
      </div>

      <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void handleFiles(e.dataTransfer.files); }} className={styles.ccDrop}>
        <span className={styles.ccHint}>Drop files here to upload them to the course&apos;s Files area.</span>
      </div>

      {uploads.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {uploads.map((row, idx) => (
            <span key={idx} className={styles.ccHint} style={{ color: row.status === "error" ? "var(--danger)" : undefined }}>
              {row.name}: {row.status === "uploading" ? "uploading…" : row.status === "done" ? "uploaded" : `failed (${row.error})`}
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
            <Button variant="outlined" size="small" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
          <div className={styles.bulkRow}>
            <span className={styles.bulkLabel}>Files</span>
            <span className={styles.bulkField}>
              <TextField
                select
                size="small"
                value={bulkModule}
                disabled={modules.length === 0}
                onChange={(e) => setBulkModule(e.target.value === "" ? "" : Number(e.target.value))}
                aria-label="Module to add the files to"
                sx={{ minWidth: 200 }}
              >
                <MenuItem value="">{modules.length === 0 ? "No modules" : "Add to module…"}</MenuItem>
                {modules.map((mod) => (
                  <MenuItem key={mod.id} value={mod.id}>
                    {mod.name}
                  </MenuItem>
                ))}
              </TextField>
              <Button variant="outlined" size="small" disabled={busy || bulkModule === ""} onClick={() => void bulkAddToModule()}>
                Add
              </Button>
            </span>
            <Button variant="outlined" size="small" color="error" disabled={busy} onClick={() => void bulkDelete()}>
              {confirmBulkDelete ? "Confirm delete" : "Delete"}
            </Button>
          </div>
        </div>
      )}

      {note && <p className={note.kind === "error" ? styles.error : styles.fieldHint}>{note.text}</p>}

      {strayCount > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            padding: "10px 14px",
            border: "1px solid var(--warning-border)",
            background: "var(--warning-surface)",
            borderRadius: 8,
          }}
        >
          <span style={{ fontSize: "0.85rem", color: "var(--warning-ink)", flex: "1 1 240px" }}>
            {strayCount} duplicate {strayCount === 1 ? "copy" : "copies"} found across{" "}
            {dupGroups.length} {dupGroups.length === 1 ? "file" : "files"} (e.g. &ldquo;{dupGroups[0].strays[0].displayName}&rdquo;).
            The newest copy of each is kept.
          </span>
          <Button variant="outlined" size="small" onClick={selectStrays} disabled={busy}>
            Select {strayCount} older {strayCount === 1 ? "copy" : "copies"}
          </Button>
        </div>
      )}

      {status === "loading" ? (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <p className={styles.loadingTitle}>Loading files…</p>
          </div>
        </div>
      ) : status === "error" ? (
        <p className={styles.error}>{error}</p>
      ) : files.length === 0 ? (
        <p className={styles.emptyState}>This course has no files yet.</p>
      ) : (
        <div
          ref={(el) => {
            filesListFallbackRef.current = el;
          }}
          tabIndex={-1}
          className={styles.ccModule}
        >
          <FormControlLabel
            className={styles.fieldHint}
            style={{ display: "inline-flex", gap: 6, alignItems: "center", margin: 0, padding: "8px 12px" }}
            control={<Checkbox size="small" checked={allShownSelected} onChange={toggleSelectAll} disabled={shown.length === 0} />}
            label="Select all"
          />
          <div className={styles.ccItems} style={{ borderTop: "1px solid var(--card-border)" }}>
            {shown.length === 0 && (
              <p className={styles.ccHint} style={{ padding: "4px 6px" }}>
                No files match your search.
              </p>
            )}
            {shown.map((f) => (
              <div key={f.id} className={styles.ccItem}>
                <Checkbox
                  size="small"
                  className={styles.ccCheckbox}
                  checked={selected.has(f.id)}
                  onChange={() => toggleSelected(f.id)}
                  aria-label={`Select ${f.displayName}`}
                />
                <span className={styles.ccType} title={f.contentType}>
                  {fileKindLabel(f.contentType, f.fileName)}
                </span>
                <TextField
                  size="small"
                  type="text"
                  className={styles.ccItemName}
                  title={f.displayName}
                  value={drafts[f.id] ?? f.displayName}
                  onChange={(e) => setDrafts((p) => ({ ...p, [f.id]: e.target.value }))}
                  onBlur={() => void saveRename(f)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                />
                {(() => {
                  const mods = fileModules(f.id);
                  return (
                    <span
                      className={styles.ccCount}
                      title={mods.length ? `In: ${mods.join(", ")}` : "Not in any module"}
                      style={{ width: 150, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {mods.length === 0 ? "—" : mods.length === 1 ? mods[0] : `${mods[0]} +${mods.length - 1}`}
                    </span>
                  );
                })()}
                <span className={styles.ccCount} style={{ width: 78, textAlign: "right", flexShrink: 0 }}>
                  {formatBytes(f.size)}
                </span>
                <Button variant="outlined" size="small" onClick={(e) => void openPreview(f, e.currentTarget)}>
                  Preview
                </Button>
                {f.url && (
                  <a className={styles.ccBtn} href={f.url} target="_blank" rel="noreferrer">
                    Download
                  </a>
                )}
                {/\.(docx|pptx)$/i.test(f.fileName || f.displayName) && (
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={(e) => {
                      officeEditorTriggerRef.current = e.currentTarget;
                      setEditFile(f);
                    }}
                  >
                    Edit
                  </Button>
                )}
                {/\.docx$/i.test(f.fileName || f.displayName) && (
                  <Button
                    variant="outlined"
                    size="small"
                    title="Set the document title and mark headings (accessibility)"
                    onClick={(e) => {
                      structureTriggerRef.current = e.currentTarget;
                      setStructureFile(f);
                    }}
                  >
                    Structure
                  </Button>
                )}
                <Button variant="outlined" size="small" color="error" onClick={() => void removeFile(f)} disabled={busy}>
                  {confirmDelete === f.id ? "Confirm" : "Delete"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {preview && (
        <FilePreviewModal
          selectedPreview={preview.file}
          previewBlobUrl={preview.blobUrl}
          onClose={closePreview}
          restoreFocusRef={previewTriggerRef}
          fallbackFocusRefs={[filesListFallbackRef, filesToolbarFallbackRef]}
        />
      )}

      {editFile && (
        <OfficeEditorModal
          courseUrl={courseUrl}
          acronym={acronym}
          fileId={editFile.id}
          fileName={editFile.displayName}
          onClose={() => setEditFile(null)}
          onSaved={() => {
            setEditFile(null);
            setNote({ kind: "success", text: "Saved to Canvas." });
            void reload();
          }}
          restoreFocusRef={officeEditorTriggerRef}
          fallbackFocusRefs={[filesListFallbackRef, filesToolbarFallbackRef]}
        />
      )}

      {structureFile && (
        <DocStructureEditor
          courseUrl={courseUrl}
          acronym={acronym}
          fileId={structureFile.id}
          title={structureFile.displayName}
          onClose={(resolved) => {
            setStructureFile(null);
            // `resolved` is defined (possibly empty) only when a save happened;
            // undefined means the editor was cancelled.
            if (resolved) {
              setNote({ kind: "success", text: "Saved to Canvas." });
              void reload();
            }
          }}
          restoreFocusRef={structureTriggerRef}
          fallbackFocusRefs={[filesListFallbackRef, filesToolbarFallbackRef]}
        />
      )}

      {copyOpen && courseId && (
        <CourseCopyModal
          mode="import"
          focus="pages-files"
          courseUrl={courseUrl}
          currentCourseId={courseId}
          acronym={acronym}
          onClose={() => setCopyOpen(false)}
          onDone={() => { setCopyOpen(false); void reload(); }}
          restoreFocusRef={copyTriggerRef}
          fallbackFocusRefs={[filesToolbarFallbackRef]}
        />
      )}
    </div>
  );
}

