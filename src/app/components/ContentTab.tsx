"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  listCourseContentAction,
  getPageAction,
  updatePageAction,
  createPageAction,
  deletePageAction,
  createModuleAction,
  updateModuleAction,
  deleteModuleAction,
  createModuleItemAction,
  updateModuleItemAction,
  deleteModuleItemAction,
  listAddableContentAction,
  setModuleDueDatesAction,
  requestFileUploadAction,
  addFileToModuleAction,
  listBulkItemsAction,
  bulkUpdateAction,
  bulkDeleteAction,
  listRubricsAction,
  bulkAssociateRubricAction,
  getGradableAction,
  updateGradableAction,
  createGradableAction,
  previewFileAction,
  getOfficeEditableAction,
  saveOfficeEditsAction,
  revisePageWithAiAction,
} from "../actions";
import CoursePicker from "./CoursePicker";
import InstitutionSwitcher from "./InstitutionSwitcher";
import FilePreviewModal, { type PreviewFile } from "./FilePreviewModal";
import type { OfficeParagraph } from "@/lib/office-edit";
import type {
  CanvasModule,
  CanvasModuleItem,
  CanvasPageSummary,
  CanvasAddableContent,
  NewModuleItem,
  DueDateUpdate,
  FileUploadTicket,
  BulkItem,
  BulkKind,
  CanvasRubric,
  GradableKind,
} from "@/lib/canvas-modules";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import { useLlmProvider } from "@/lib/llm-provider";
import { useInstitutionSelection } from "@/lib/institutions";
import type { LlmProvider } from "@/lib/llm";
import styles from "../page.module.css";

const CONTENT_URL_KEY = "ta-content-course-url";
const VIEW_KEY = "ta-content-view";

const MAX_INDENT = 5;

type LoadState = { status: "idle" | "loading" | "error"; message: string };

// Format a Canvas ISO timestamp for display; blank when absent.
function formatWhen(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Build a self-contained preview document so a page's HTML renders in isolation
// (sandboxed, no scripts) instead of bleeding into the app's own styles.
function previewDoc(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { font: 15px/1.6 system-ui, -apple-system, sans-serif; color: #1f2933; padding: 14px; margin: 0; }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; }
    td, th { border: 1px solid #d2d6dc; padding: 4px 8px; }
    a { color: #2563eb; }
  </style></head><body>${html}</body></html>`;
}

// Stable key for a module item in the selection / drag sets.
function itemKey(moduleId: number, itemId: number): string {
  return `${moduleId}:${itemId}`;
}

// Format an ISO timestamp as the local value a datetime-local input expects.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Turn a base64 payload into an object URL for previewing (images / PDFs).
function base64ToBlobUrl(base64: string, mimeType: string): string {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return URL.createObjectURL(new Blob([arr], { type: mimeType }));
}

// ── File upload helpers (browser side of the Canvas upload) ───────────────────

/** Step 2 of the Canvas upload: POST the file bytes to the pre-signed URL. */
async function uploadFileToCanvas(ticket: FileUploadTicket, file: File): Promise<number> {
  const form = new FormData();
  for (const [key, value] of Object.entries(ticket.uploadParams)) form.append(key, value);
  form.append("file", file);
  const response = await fetch(ticket.uploadUrl, { method: "POST", body: form });
  if (!response.ok) throw new Error(`Upload failed (HTTP ${response.status}).`);
  const data = (await response.json()) as { id?: number };
  if (typeof data.id !== "number") throw new Error("Upload did not return a file id.");
  return data.id;
}

/** Full pipeline for one file: pre-sign (server), upload (browser), attach (server). */
async function uploadFileToModule(
  courseUrl: string,
  acronym: string | undefined,
  moduleId: number,
  file: File
): Promise<void> {
  const ticket = await requestFileUploadAction(
    courseUrl,
    { name: file.name, size: file.size, contentType: file.type || undefined },
    acronym
  );
  if ("error" in ticket) throw new Error(ticket.error);
  const fileId = await uploadFileToCanvas(ticket.ticket, file);
  const attached = await addFileToModuleAction(courseUrl, moduleId, fileId, acronym);
  if ("error" in attached) throw new Error(attached.error);
}

// Tokenize a name for matching: drop the extension, lowercase, split on non-alphanumerics.
function matchTokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Best-matching module for a filename by shared tokens (numbers weighted), or "". */
function bestModuleIdFor(fileName: string, modules: CanvasModule[]): number | "" {
  const fileTokens = matchTokens(fileName);
  const fileNums = fileTokens.filter((t) => /^\d+$/.test(t));
  let best: { id: number; score: number } | null = null;
  for (const m of modules) {
    const modTokens = matchTokens(m.name);
    const modNums = modTokens.filter((t) => /^\d+$/.test(t));
    let score = 0;
    for (const t of fileTokens) if (t.length > 2 && modTokens.includes(t)) score += 1;
    for (const n of fileNums) if (modNums.includes(n)) score += 2;
    if (score > 0 && (!best || score > best.score)) best = { id: m.id, score };
  }
  return best ? best.id : "";
}

// A subtle pill that shows (and toggles) the published state of a module or item.
function PublishToggle({
  published,
  disabled,
  onClick,
}: {
  published: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.clearFileButton}
      onClick={onClick}
      disabled={disabled}
      title={published ? "Published — click to unpublish" : "Unpublished — click to publish"}
      style={{
        color: published ? "#15803d" : "#92400e",
        borderColor: published ? "#bbf7d0" : "#fde68a",
        fontWeight: 600,
      }}
    >
      {published ? "Published" : "Unpublished"}
    </button>
  );
}

// ── Page editor modal ─────────────────────────────────────────────────────────

function PageEditorModal({
  courseUrl,
  acronym,
  provider,
  pageUrl,
  onClose,
  onSaved,
}: {
  courseUrl: string;
  acronym?: string;
  provider: LlmProvider;
  /** Existing page slug to edit, or null to create a new page. */
  pageUrl: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = pageUrl === null;
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [aiInstr, setAiInstr] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [bodyBeforeAi, setBodyBeforeAi] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load the existing page's HTML body (await-first so no synchronous setState).
  useEffect(() => {
    if (pageUrl === null) return;
    let cancelled = false;
    (async () => {
      const result = await getPageAction(courseUrl, pageUrl, acronym);
      if (cancelled) return;
      if ("error" in result) {
        setLoadError(result.error);
        setLoading(false);
        return;
      }
      setTitle(result.page.title);
      setBody(result.page.body);
      setPublished(result.page.published);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [pageUrl, courseUrl, acronym]);

  const handleRevise = async () => {
    if (!aiInstr.trim()) return;
    setAiBusy(true);
    setNote(null);
    const result = await revisePageWithAiAction(body, aiInstr.trim(), provider);
    setAiBusy(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    setBodyBeforeAi(body);
    setBody(result.html);
    setNote({ kind: "success", text: "Applied the AI revision. Review the preview, then Save." });
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setNote({ kind: "error", text: "Give the page a title first." });
      return;
    }
    setSaving(true);
    setNote(null);
    const result = isNew
      ? await createPageAction(courseUrl, { title: title.trim(), body, published }, acronym)
      : await updatePageAction(courseUrl, pageUrl, { title: title.trim(), body, published }, acronym);
    setSaving(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    onSaved();
    onClose();
  };

  const handleDelete = async () => {
    if (pageUrl === null) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setNote(null);
    const result = await deletePageAction(courseUrl, pageUrl, acronym);
    setDeleting(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    onSaved();
    onClose();
  };

  const busy = saving || deleting || aiBusy;

  return (
    <div className={styles.previewBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={styles.previewModal}
        style={{ width: "min(1100px, 95vw)", maxWidth: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.previewHeader}>
          <h3>{isNew ? "New page" : "Edit page"}</h3>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Close
          </button>
        </div>

        {loading ? (
          <div className={styles.loadingState} role="status" aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            <div>
              <p className={styles.loadingTitle}>Loading page…</p>
            </div>
          </div>
        ) : loadError ? (
          <p className={styles.error}>{loadError}</p>
        ) : (
          <>
            <div className={styles.field}>
              <label htmlFor="content-page-title">Title</label>
              <input
                id="content-page-title"
                type="text"
                className={styles.textInput}
                placeholder="Page title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="content-page-ai">Revise with AI (optional)</label>
              <input
                id="content-page-ai"
                type="text"
                className={styles.textInput}
                placeholder="e.g. fix typos, add a section on submission steps, update the due date to Friday"
                value={aiInstr}
                onChange={(e) => setAiInstr(e.target.value)}
              />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
                <button
                  type="button"
                  className={styles.downloadButton}
                  onClick={handleRevise}
                  disabled={aiBusy || !aiInstr.trim()}
                >
                  {aiBusy ? "Revising…" : "Revise with AI"}
                </button>
                {bodyBeforeAi !== null && (
                  <button
                    type="button"
                    className={styles.clearFileButton}
                    onClick={() => {
                      setBody(bodyBeforeAi);
                      setBodyBeforeAi(null);
                      setNote(null);
                    }}
                  >
                    Undo AI change
                  </button>
                )}
              </div>
              <p className={styles.fieldHint}>
                The revision only edits the draft below — nothing is saved to Canvas until you click Save.
              </p>
            </div>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div className={styles.field} style={{ flex: "1 1 360px", minWidth: 280 }}>
                <label htmlFor="content-page-body">HTML source</label>
                <textarea
                  id="content-page-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  spellCheck={false}
                  style={{ fontFamily: "var(--font-mono, monospace)", minHeight: 360, width: "100%" }}
                />
              </div>
              <div className={styles.field} style={{ flex: "1 1 360px", minWidth: 280 }}>
                <label>Live preview</label>
                <iframe
                  title="Page preview"
                  sandbox=""
                  srcDoc={previewDoc(body)}
                  style={{
                    width: "100%",
                    minHeight: 360,
                    border: "1px solid var(--field-border)",
                    borderRadius: 8,
                    background: "#fff",
                  }}
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginTop: 14,
                paddingTop: 14,
                borderTop: "1px solid var(--field-border)",
              }}
            >
              <label style={{ display: "inline-flex", alignItems: "center", gap: 8, margin: 0 }}>
                <input
                  type="checkbox"
                  checked={published}
                  onChange={(e) => setPublished(e.target.checked)}
                />
                Published (visible to students)
              </label>
              <button
                type="button"
                className={styles.submitButton}
                onClick={handleSave}
                disabled={busy || !title.trim()}
              >
                {saving ? "Saving…" : isNew ? "Create page" : "Save to Canvas"}
              </button>
              {!isNew && (
                <button
                  type="button"
                  className={styles.clearFileButton}
                  onClick={handleDelete}
                  disabled={busy}
                  style={{ color: "#b91c1c", borderColor: "#fecaca" }}
                >
                  {deleting ? "Deleting…" : confirmDelete ? "Confirm delete" : "Delete page"}
                </button>
              )}
            </div>

            {note && (
              <p className={note.kind === "error" ? styles.error : styles.fieldHint} style={{ marginTop: 10 }}>
                {note.text}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Due-date scheduler ───────────────────────────────────────────────────────

const SCHEDULABLE_TYPES = new Set(["Assignment", "Quiz", "Discussion"]);

/** Items in a module that can carry a due date (gradable, with a content id). */
function schedulableItems(m: CanvasModule): CanvasModuleItem[] {
  return m.items.filter((it) => SCHEDULABLE_TYPES.has(it.type) && typeof it.contentId === "number");
}

function SchedulerModal({
  courseUrl,
  acronym,
  modules,
  onClose,
  onApplied,
}: {
  courseUrl: string;
  acronym?: string;
  modules: CanvasModule[];
  onClose: () => void;
  onApplied: (message: string) => void;
}) {
  const eligible = modules.filter((m) => schedulableItems(m).length > 0);
  const [anchorId, setAnchorId] = useState<number>(eligible[0]?.id ?? modules[0]?.id ?? 0);
  const [firstDue, setFirstDue] = useState("");
  const [intervalValue, setIntervalValue] = useState(1);
  const [unit, setUnit] = useState<"weeks" | "days">("weeks");
  const [applying, setApplying] = useState(false);
  const [note, setNote] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const anchorIndex = modules.findIndex((m) => m.id === anchorId);
  const intervalDays =
    (unit === "weeks" ? 7 : 1) * (Number.isFinite(intervalValue) ? Math.max(0, intervalValue) : 0);

  // The k-th scheduled module's date = the first due date shifted by k intervals.
  // setDate keeps the wall-clock time across daylight-saving boundaries.
  const computeByRank = (k: number): Date | null => {
    if (!firstDue) return null;
    const base = new Date(firstDue);
    if (Number.isNaN(base.getTime())) return null;
    const d = new Date(base);
    d.setDate(d.getDate() + k * intervalDays);
    return d;
  };

  // Step only across modules that actually have gradable items, so the interval
  // is the gap between consecutive due dates (empty modules don't consume a slot).
  const rows: Array<{ m: CanvasModule; i: number; count: number; willChange: boolean; date: Date | null }> = [];
  let rank = 0;
  modules.forEach((m, i) => {
    const items = schedulableItems(m);
    const willChange = i >= anchorIndex && items.length > 0;
    let date: Date | null = null;
    if (willChange) {
      date = computeByRank(rank);
      rank += 1;
    }
    rows.push({ m, i, count: items.length, willChange, date });
  });

  const totalItems = rows.reduce((sum, r) => (r.willChange && r.date ? sum + r.count : sum), 0);

  const handleApply = async () => {
    if (anchorIndex < 0) return;
    if (!firstDue || Number.isNaN(new Date(firstDue).getTime())) {
      setNote({ kind: "error", text: "Pick a valid first due date and time." });
      return;
    }
    if (intervalDays <= 0) {
      setNote({ kind: "error", text: "Enter a positive interval." });
      return;
    }
    const updates: DueDateUpdate[] = [];
    for (const r of rows) {
      if (!r.willChange || !r.date) continue;
      const iso = r.date.toISOString();
      for (const it of schedulableItems(r.m)) {
        updates.push({ type: it.type, contentId: it.contentId as number, dueAt: iso });
      }
    }
    if (updates.length === 0) {
      setNote({ kind: "error", text: "No assignments to schedule from this module onward." });
      return;
    }
    setApplying(true);
    setNote(null);
    const result = await setModuleDueDatesAction(courseUrl, updates, acronym);
    setApplying(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    if (result.failures.length > 0) {
      setNote({
        kind: "error",
        text: `Set ${result.updated} due date${result.updated === 1 ? "" : "s"}, ${result.failures.length} failed.`,
      });
      return;
    }
    onApplied(`Set due dates for ${result.updated} item${result.updated === 1 ? "" : "s"}.`);
  };

  return (
    <div className={styles.previewBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={styles.previewModal}
        style={{ width: "min(720px, 95vw)", maxWidth: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.previewHeader}>
          <h3>Schedule due dates</h3>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Close
          </button>
        </div>

        <p className={styles.fieldHint} style={{ marginTop: 0 }}>
          Pick a starting module and its due date, then a spacing. Every assignment, quiz, and graded
          discussion in that module and the modules after it gets a due date, stepped by the interval.
        </p>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div className={styles.field} style={{ flex: "1 1 220px" }}>
            <label htmlFor="sched-anchor">Start from module</label>
            <select
              id="sched-anchor"
              className={styles.textInput}
              value={anchorId}
              onChange={(e) => setAnchorId(Number(e.target.value))}
            >
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.field} style={{ flex: "1 1 220px" }}>
            <label htmlFor="sched-first">First due date</label>
            <input
              id="sched-first"
              type="datetime-local"
              className={styles.textInput}
              value={firstDue}
              onChange={(e) => setFirstDue(e.target.value)}
            />
          </div>
          <div className={styles.field} style={{ flex: "0 0 auto" }}>
            <label htmlFor="sched-interval">Spacing</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                id="sched-interval"
                type="number"
                min={1}
                className={styles.textInput}
                style={{ width: 80 }}
                value={intervalValue}
                onChange={(e) => setIntervalValue(Number(e.target.value))}
              />
              <select
                className={styles.textInput}
                style={{ width: 110 }}
                value={unit}
                onChange={(e) => setUnit(e.target.value as "weeks" | "days")}
                aria-label="Interval unit"
              >
                <option value="weeks">weeks</option>
                <option value="days">days</option>
              </select>
            </div>
          </div>
        </div>

        <div className={styles.field}>
          <label>Preview</label>
          <div style={{ border: "1px solid var(--field-border)", borderRadius: 10, overflow: "hidden" }}>
            {rows.map((r) => (
              <div
                key={r.m.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "8px 12px",
                  borderTop: r.i === 0 ? "none" : "1px solid var(--field-border)",
                  opacity: r.willChange ? 1 : 0.5,
                }}
              >
                <span style={{ fontWeight: 600 }}>
                  {r.m.name}
                  <span className={styles.fieldHint} style={{ fontWeight: 400, marginLeft: 8 }}>
                    {r.count === 0 ? "no assignments" : `${r.count} item${r.count === 1 ? "" : "s"}`}
                  </span>
                </span>
                <span className={styles.fieldHint} style={{ margin: 0, whiteSpace: "nowrap" }}>
                  {!r.willChange
                    ? r.i < anchorIndex
                      ? "unchanged"
                      : "—"
                    : r.date
                      ? r.date.toLocaleString(undefined, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "set a date"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className={styles.submitButton}
            onClick={handleApply}
            disabled={applying || totalItems === 0}
          >
            {applying ? "Applying…" : `Apply to ${totalItems} item${totalItems === 1 ? "" : "s"}`}
          </button>
          <span className={styles.fieldHint} style={{ margin: 0 }}>
            Writes due dates to Canvas.
          </span>
        </div>

        {note && <p className={note.kind === "error" ? styles.error : styles.fieldHint}>{note.text}</p>}
      </div>
    </div>
  );
}

// ── Bulk upload (match files to modules) ──────────────────────────────────────

function BulkUploadModal({
  courseUrl,
  acronym,
  modules,
  onClose,
  onDone,
}: {
  courseUrl: string;
  acronym?: string;
  modules: CanvasModule[];
  onClose: () => void;
  onDone: () => void;
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
    <div className={styles.previewBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={styles.previewModal}
        style={{ width: "min(760px, 95vw)", maxWidth: "none" }}
        onClick={(e) => e.stopPropagation()}
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
          style={{ border: "1px dashed var(--field-border)", borderRadius: 10, padding: 14, textAlign: "center" }}
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
          <span className={styles.fieldHint} style={{ marginLeft: 8 }}>
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
                borderRadius: 10,
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
                    gap: 10,
                    padding: "8px 12px",
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
                  <select
                    className={styles.textInput}
                    style={{ flex: "0 0 220px", maxWidth: 220 }}
                    value={assign[i]}
                    disabled={uploading}
                    onChange={(e) =>
                      setAssign((a) =>
                        a.map((v, idx) => (idx === i ? (e.target.value === "" ? "" : Number(e.target.value)) : v))
                      )
                    }
                  >
                    <option value="">Skip</option>
                    {modules.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <span
                    className={styles.fieldHint}
                    style={{ margin: 0, minWidth: 70, color: status[i] === "error" ? "var(--error, #b91c1c)" : undefined }}
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

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className={styles.submitButton}
            onClick={handleApply}
            disabled={uploading || matchedCount === 0}
          >
            {uploading ? "Uploading…" : `Upload ${matchedCount} file${matchedCount === 1 ? "" : "s"}`}
          </button>
        </div>

        {note && <p className={note.kind === "error" ? styles.error : styles.fieldHint}>{note.text}</p>}
      </div>
    </div>
  );
}

// ── Rename modules (find / replace) ───────────────────────────────────────────

function RenameModulesModal({
  courseUrl,
  acronym,
  modules,
  onClose,
  onApplied,
}: {
  courseUrl: string;
  acronym?: string;
  modules: CanvasModule[];
  onClose: () => void;
  onApplied: (message: string) => void;
}) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [applying, setApplying] = useState(false);
  const [note, setNote] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const computeName = (name: string) => (find ? name.split(find).join(replace) : name);
  const changed = modules.filter((m) => computeName(m.name) !== m.name);

  const handleApply = async () => {
    if (!find) {
      setNote({ kind: "error", text: "Enter the text to find." });
      return;
    }
    if (changed.length === 0) {
      setNote({ kind: "error", text: "No module names contain that text." });
      return;
    }
    setApplying(true);
    setNote(null);
    let updated = 0;
    let failed = 0;
    for (const m of changed) {
      const result = await updateModuleAction(courseUrl, m.id, { name: computeName(m.name) }, acronym);
      if ("error" in result) failed += 1;
      else updated += 1;
    }
    setApplying(false);
    if (failed) {
      setNote({ kind: "error", text: `Renamed ${updated}, ${failed} failed.` });
      return;
    }
    onApplied(`Renamed ${updated} module${updated === 1 ? "" : "s"}.`);
  };

  return (
    <div className={styles.previewBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={styles.previewModal}
        style={{ width: "min(640px, 95vw)", maxWidth: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.previewHeader}>
          <h3>Rename modules</h3>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Close
          </button>
        </div>

        <p className={styles.fieldHint} style={{ marginTop: 0 }}>
          Find and replace text in every module name. For example: find Module, replace with Week, and
          Module 1 becomes Week 1.
        </p>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <div className={styles.field} style={{ flex: "1 1 200px" }}>
            <label htmlFor="rename-find">Find</label>
            <input
              id="rename-find"
              type="text"
              className={styles.textInput}
              placeholder="Module"
              value={find}
              onChange={(e) => setFind(e.target.value)}
            />
          </div>
          <div className={styles.field} style={{ flex: "1 1 200px" }}>
            <label htmlFor="rename-replace">Replace with</label>
            <input
              id="rename-replace"
              type="text"
              className={styles.textInput}
              placeholder="Week"
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.field}>
          <label>Preview {find ? `(${changed.length} will change)` : ""}</label>
          <div
            style={{
              border: "1px solid var(--field-border)",
              borderRadius: 10,
              overflow: "hidden",
              maxHeight: "40vh",
              overflowY: "auto",
            }}
          >
            {modules.map((m, i) => {
              const next = computeName(m.name);
              const willChange = next !== m.name;
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "8px 12px",
                    borderTop: i === 0 ? "none" : "1px solid var(--field-border)",
                    opacity: willChange ? 1 : 0.5,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{m.name}</span>
                  <span className={styles.fieldHint} style={{ margin: 0, whiteSpace: "nowrap" }}>
                    {willChange ? `to ${next}` : "unchanged"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className={styles.submitButton}
            onClick={handleApply}
            disabled={applying || !find || changed.length === 0}
          >
            {applying ? "Renaming…" : `Rename ${changed.length} module${changed.length === 1 ? "" : "s"}`}
          </button>
          <span className={styles.fieldHint} style={{ margin: 0 }}>
            Writes module names to Canvas.
          </span>
        </div>

        {note && <p className={note.kind === "error" ? styles.error : styles.fieldHint}>{note.text}</p>}
      </div>
    </div>
  );
}

// ── Gradable editor (description + due date + points) ─────────────────────────

function GradableEditorModal({
  courseUrl,
  acronym,
  item,
  onClose,
  onSaved,
}: {
  courseUrl: string;
  acronym?: string;
  item: CanvasModuleItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const kind = item.type as GradableKind;
  const showPoints = kind === "Assignment" || kind === "Quiz";

  const [loading, setLoading] = useState(item.contentId != null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState("");
  const [due, setDue] = useState(toLocalInput(item.dueAt));
  const [points, setPoints] = useState(item.pointsPossible != null ? String(item.pointsPossible) : "");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [targetKind, setTargetKind] = useState<GradableKind | "">("");
  const [confirmChange, setConfirmChange] = useState(false);
  const [changing, setChanging] = useState(false);

  const otherKinds = (["Assignment", "Quiz", "Discussion"] as GradableKind[]).filter((k) => k !== kind);

  // Load the item's title + description (await-first so no synchronous setState).
  useEffect(() => {
    if (item.contentId == null) return;
    let cancelled = false;
    (async () => {
      const result = await getGradableAction(courseUrl, kind, item.contentId as number, acronym);
      if (cancelled) return;
      if ("error" in result) {
        setLoadError(result.error);
        setLoading(false);
        return;
      }
      setTitle(result.detail.title || item.title);
      setDescription(result.detail.description);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, kind, item.contentId, item.title, acronym]);

  const handleSave = async () => {
    if (item.contentId == null) return;
    if (!title.trim()) {
      setNote({ kind: "error", text: "Give it a title first." });
      return;
    }
    setSaving(true);
    setNote(null);
    const fields: { title?: string; description?: string; pointsPossible?: number } = {
      title: title.trim(),
      description,
    };
    if (showPoints && points.trim() !== "") {
      const p = Number(points);
      if (Number.isFinite(p)) fields.pointsPossible = p;
    }
    const saved = await updateGradableAction(courseUrl, kind, item.contentId, fields, acronym);
    if ("error" in saved) {
      setSaving(false);
      setNote({ kind: "error", text: saved.error });
      return;
    }
    const iso = due ? new Date(due).toISOString() : null;
    const dueRes = await setModuleDueDatesAction(
      courseUrl,
      [{ type: kind, contentId: item.contentId, dueAt: iso }],
      acronym
    );
    setSaving(false);
    if ("error" in dueRes) {
      setNote({ kind: "error", text: dueRes.error });
      return;
    }
    onSaved();
    onClose();
  };

  // Recreate this item as the target type (copying the current fields), drop the
  // new object into the same module slot, and delete the original.
  const handleChangeType = async () => {
    if (targetKind === "" || item.contentId == null) return;
    if (!confirmChange) {
      setConfirmChange(true);
      return;
    }
    setConfirmChange(false);
    setChanging(true);
    setNote(null);
    try {
      const pts = points.trim() !== "" && Number.isFinite(Number(points)) ? Number(points) : undefined;
      const iso = due ? new Date(due).toISOString() : null;
      const created = await createGradableAction(
        courseUrl,
        targetKind,
        { title: title.trim() || item.title, description, pointsPossible: pts, dueAt: iso },
        acronym
      );
      if ("error" in created) throw new Error(created.error);
      const added = await createModuleItemAction(
        courseUrl,
        item.moduleId,
        { type: targetKind, contentId: created.id, position: item.position, indent: item.indent },
        acronym
      );
      if ("error" in added) throw new Error(added.error);
      const removed = await bulkDeleteAction(courseUrl, kind as BulkKind, [String(item.contentId)], acronym);
      if ("error" in removed) throw new Error(removed.error);
      onSaved();
      onClose();
    } catch (err) {
      setChanging(false);
      setNote({ kind: "error", text: err instanceof Error ? err.message : "Could not change the type." });
    }
  };

  const busy = saving || changing;

  return (
    <div className={styles.previewBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={styles.previewModal}
        style={{ width: "min(820px, 95vw)", maxWidth: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.previewHeader}>
          <h3>Edit {kind.toLowerCase()}</h3>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Close
          </button>
        </div>

        {loading ? (
          <div className={styles.loadingState} role="status" aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            <div>
              <p className={styles.loadingTitle}>Loading…</p>
            </div>
          </div>
        ) : loadError ? (
          <p className={styles.error}>{loadError}</p>
        ) : (
          <>
            <div className={styles.field}>
              <label htmlFor="gradable-title">Title</label>
              <input
                id="gradable-title"
                type="text"
                className={styles.textInput}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div className={styles.field} style={{ flex: "1 1 220px" }}>
                <label htmlFor="gradable-due">Due date</label>
                <input
                  id="gradable-due"
                  type="datetime-local"
                  className={styles.textInput}
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                />
                {due && (
                  <button type="button" className={styles.clearFileButton} style={{ alignSelf: "flex-start", marginTop: 6 }} onClick={() => setDue("")}>
                    Clear due date
                  </button>
                )}
              </div>
              {showPoints && (
                <div className={styles.field} style={{ flex: "0 0 140px" }}>
                  <label htmlFor="gradable-points">Points</label>
                  <input
                    id="gradable-points"
                    type="number"
                    className={styles.textInput}
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className={styles.field}>
              <label htmlFor="gradable-desc">Description (HTML allowed)</label>
              <textarea
                id="gradable-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                spellCheck={false}
                style={{ minHeight: 240, width: "100%", fontFamily: "var(--font-mono, monospace)" }}
              />
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button" className={styles.submitButton} onClick={handleSave} disabled={busy || !title.trim()}>
                {saving ? "Saving…" : "Save to Canvas"}
              </button>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                paddingTop: 12,
                marginTop: 4,
                borderTop: "1px solid var(--field-border)",
              }}
            >
              <span className={styles.fieldHint} style={{ margin: 0 }}>
                Change type to:
              </span>
              <select
                className={styles.textInput}
                style={{ maxWidth: 160 }}
                value={targetKind}
                disabled={busy}
                onChange={(e) => {
                  setTargetKind(e.target.value === "" ? "" : (e.target.value as GradableKind));
                  setConfirmChange(false);
                }}
                aria-label="Change type"
              >
                <option value="">Choose…</option>
                {otherKinds.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.clearFileButton}
                onClick={handleChangeType}
                disabled={busy || targetKind === ""}
                style={{ color: "#b91c1c", borderColor: "#fecaca" }}
              >
                {changing ? "Changing…" : confirmChange ? "Confirm: recreate & delete original" : "Change type"}
              </button>
            </div>
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              Recreates this as the new type with these fields and deletes the original. Submissions and
              grades do not carry over.
            </p>

            {note && <p className={note.kind === "error" ? styles.error : styles.fieldHint}>{note.text}</p>}
          </>
        )}
      </div>
    </div>
  );
}

// ── Office file editor (.docx / .pptx, in place) ──────────────────────────────

function OfficeEditorModal({
  courseUrl,
  acronym,
  item,
  onClose,
  onSaved,
}: {
  courseUrl: string;
  acronym?: string;
  item: CanvasModuleItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(item.contentId != null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState(item.title);
  const [paragraphs, setParagraphs] = useState<OfficeParagraph[]>([]);
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    if (item.contentId == null) return;
    let cancelled = false;
    (async () => {
      const result = await getOfficeEditableAction(courseUrl, item.contentId as number, acronym);
      if (cancelled) return;
      if ("error" in result) {
        setLoadError(result.error);
        setLoading(false);
        return;
      }
      setName(result.name);
      setParagraphs(result.paragraphs);
      const seed = Object.fromEntries(result.paragraphs.map((p) => [p.id, p.text]));
      setOriginal(seed);
      setDraft(seed);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, item.contentId, acronym]);

  const changedCount = paragraphs.filter((p) => (draft[p.id] ?? "") !== (original[p.id] ?? "")).length;

  const handleSave = async () => {
    if (item.contentId == null) return;
    const edits: Record<string, string> = {};
    for (const p of paragraphs) {
      if ((draft[p.id] ?? "") !== (original[p.id] ?? "")) edits[p.id] = draft[p.id] ?? "";
    }
    if (Object.keys(edits).length === 0) {
      setNote({ kind: "error", text: "No changes to save." });
      return;
    }
    setSaving(true);
    setNote(null);
    const result = await saveOfficeEditsAction(courseUrl, item.contentId, edits, acronym);
    setSaving(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <div className={styles.previewBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className={styles.previewModal}
        style={{ width: "min(860px, 95vw)", maxWidth: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.previewHeader}>
          <h3>Edit {name}</h3>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Close
          </button>
        </div>

        {loading ? (
          <div className={styles.loadingState} role="status" aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            <div>
              <p className={styles.loadingTitle}>Loading…</p>
            </div>
          </div>
        ) : loadError ? (
          <p className={styles.error}>{loadError}</p>
        ) : paragraphs.length === 0 ? (
          <p className={styles.emptyState}>No editable text was found in this file.</p>
        ) : (
          <>
            <p className={styles.fieldHint} style={{ marginTop: 0 }}>
              Edit the text below. Formatting, images, and layout are kept; saving overwrites the file in
              Canvas.
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                maxHeight: "52vh",
                overflowY: "auto",
                paddingRight: 4,
              }}
            >
              {paragraphs.map((p, i) => {
                const showSlide = p.slide != null && (i === 0 || paragraphs[i - 1].slide !== p.slide);
                return (
                  <Fragment key={p.id}>
                    {showSlide && (
                      <p className={styles.fileMetaLabel} style={{ marginTop: i === 0 ? 0 : 8 }}>
                        Slide {p.slide}
                      </p>
                    )}
                    <textarea
                      value={draft[p.id] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [p.id]: e.target.value }))}
                      rows={Math.min(6, Math.max(1, (draft[p.id] ?? "").split("\n").length))}
                      style={{
                        width: "100%",
                        resize: "vertical",
                        padding: "8px 10px",
                        fontFamily: "inherit",
                        border: "1px solid var(--field-border)",
                        borderRadius: 8,
                        lineHeight: 1.4,
                        minHeight: 0,
                      }}
                    />
                  </Fragment>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className={styles.submitButton}
                onClick={handleSave}
                disabled={saving || changedCount === 0}
              >
                {saving
                  ? "Saving…"
                  : changedCount > 0
                    ? `Save ${changedCount} change${changedCount === 1 ? "" : "s"} to Canvas`
                    : "Save to Canvas"}
              </button>
            </div>
            {note && <p className={note.kind === "error" ? styles.error : styles.fieldHint}>{note.text}</p>}
          </>
        )}
      </div>
    </div>
  );
}

// ── Module tree ────────────────────────────────────────────────────────────---

function ModulesView({
  courseUrl,
  acronym,
  modules,
  pages,
  targets,
  targetsState,
  ensureTargets,
  busy,
  expanded,
  onToggleExpand,
  onEditPage,
  setModules,
  reload,
  setNote,
  setBusy,
}: {
  courseUrl: string;
  acronym?: string;
  modules: CanvasModule[];
  pages: CanvasPageSummary[];
  targets: CanvasAddableContent | null;
  targetsState: "idle" | "loading" | "error";
  ensureTargets: () => void;
  busy: boolean;
  expanded: Set<number>;
  onToggleExpand: (id: number) => void;
  onEditPage: (pageUrl: string) => void;
  setModules: React.Dispatch<React.SetStateAction<CanvasModule[]>>;
  reload: () => void;
  setNote: (n: { kind: "success" | "error"; text: string } | null) => void;
  setBusy: (b: boolean) => void;
}) {
  const [newModuleName, setNewModuleName] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [uploads, setUploads] = useState<
    Record<number, Array<{ name: string; status: "uploading" | "done" | "error"; error?: string }>>
  >({});
  // Per-module "add item" controls: chosen type, the selected content (page slug
  // or content id), and the external-url / header-text inputs.
  const [addType, setAddType] = useState<Record<number, string>>({});
  const [addValue, setAddValue] = useState<Record<number, string>>({});
  const [addUrl, setAddUrl] = useState<Record<number, string>>({});
  const [addTitle, setAddTitle] = useState<Record<number, string>>({});

  // ── Bulk selection across the module tree ──────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedModules, setSelectedModules] = useState<Set<number>>(new Set());
  const [rubrics, setRubrics] = useState<CanvasRubric[]>([]);
  const [opBusy, setOpBusy] = useState(false);
  const [bulkDue, setBulkDue] = useState("");
  const [bulkShift, setBulkShift] = useState(7);
  // How many modules a "Shift up/down" moves the selected items by.
  const [bulkModuleShift, setBulkModuleShift] = useState(1);
  // The module selected items are moved into by the "Move to module" control.
  const [bulkTargetModule, setBulkTargetModule] = useState<number | "">("");
  // "Add to selected modules": the content type to create in each module, and
  // the naming pattern (supports {module} and {n}) used to title each new item.
  const [bulkAddType, setBulkAddType] = useState("Assignment");
  const [bulkAddPattern, setBulkAddPattern] = useState("");
  const [bulkPoints, setBulkPoints] = useState("");
  const [bulkRubricId, setBulkRubricId] = useState<number | "">("");
  const [confirmDeleteContent, setConfirmDeleteContent] = useState(false);
  const [confirmDeleteModules, setConfirmDeleteModules] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CanvasModuleItem | null>(null);
  const [filePreview, setFilePreview] = useState<{ file: PreviewFile; blobUrl: string | null } | null>(null);
  const [editingFile, setEditingFile] = useState<CanvasModuleItem | null>(null);
  const [drag, setDrag] = useState<{ moduleId: number; itemId: number } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<number | null>(null);
  const [dragOverModule, setDragOverModule] = useState<number | null>(null);
  // Dragging a whole module to reorder it: the grabbed module's id, and the
  // module card currently hovered as a drop target. Kept separate from the item
  // drag state above so an item drag and a module drag never trip each other.
  const [moduleDrag, setModuleDrag] = useState<number | null>(null);
  const [dragOverModuleRow, setDragOverModuleRow] = useState<number | null>(null);

  // FLIP animation for reorders: remember each item row's DOM node and its
  // position just before a move, then slide every moved row from its old spot to
  // its new one. Web Animations API is used (not inline styles) so it never
  // fights React's own style updates mid-animation.
  const itemNodes = useRef(new Map<number, HTMLElement | null>());
  const flipPrev = useRef<Map<number, DOMRect> | null>(null);
  // Same FLIP machinery for whole-module cards, keyed by module id.
  const moduleNodes = useRef(new Map<number, HTMLElement | null>());
  const flipPrevModules = useRef<Map<number, DOMRect> | null>(null);
  const [flipTick, setFlipTick] = useState(0);

  useLayoutEffect(() => {
    // Slide moved DOM nodes from their pre-move position to their new one. Run
    // for items and modules independently: a reorder bumps flipTick and stashes
    // a rect map for whichever kind moved.
    const animate = (
      pending: React.MutableRefObject<Map<number, DOMRect> | null>,
      nodes: React.MutableRefObject<Map<number, HTMLElement | null>>
    ) => {
      const prev = pending.current;
      if (!prev) return;
      pending.current = null;
      nodes.current.forEach((el, id) => {
        if (!el) return;
        const before = prev.get(id);
        if (!before) return;
        const after = el.getBoundingClientRect();
        const dx = before.left - after.left;
        const dy = before.top - after.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        el.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0px, 0px)" }],
          { duration: 230, easing: "cubic-bezier(0.2, 0, 0, 1)" }
        );
      });
    };
    animate(flipPrev, itemNodes);
    animate(flipPrevModules, moduleNodes);
  }, [flipTick]);

  // Whether an item is part of the current drag (the grabbed item, plus the rest
  // of the selection when the grabbed item is itself selected).
  const dragSelected = drag ? selected.has(itemKey(drag.moduleId, drag.itemId)) : false;
  const isDraggingItem = (moduleId: number, itemId: number) => {
    if (!drag) return false;
    if (drag.moduleId === moduleId && drag.itemId === itemId) return true;
    return dragSelected && selected.size > 1 && selected.has(itemKey(moduleId, itemId));
  };

  // Move the dragged item(s) before `beforeItemId` (or to the end when null) in
  // the target module: reorder locally for instant feedback, then persist to
  // Canvas. Dragging a selected item moves the whole selection as one block.
  const performMove = (targetModuleId: number, beforeItemId: number | null) => {
    if (!drag) return;
    const grabbedKey = itemKey(drag.moduleId, drag.itemId);
    const grabbedSelected = selected.has(grabbedKey);
    const moveKeys = grabbedSelected && selected.size > 1 ? new Set(selected) : new Set([grabbedKey]);
    setDrag(null);
    setDragOverItem(null);
    setDragOverModule(null);

    // The items to move, in their current tree order (preserves relative order).
    const moved: CanvasModuleItem[] = [];
    const movedIds = new Set<number>();
    for (const mod of modules) {
      for (const it of mod.items) {
        if (moveKeys.has(itemKey(mod.id, it.id))) {
          moved.push(it);
          movedIds.add(it.id);
        }
      }
    }
    if (moved.length === 0) return;
    if (beforeItemId != null && movedIds.has(beforeItemId)) return; // dropped onto the moving block

    // Snapshot positions for the FLIP and a diff of where everything lives now.
    const prevRects = new Map<number, DOMRect>();
    itemNodes.current.forEach((el, id) => {
      if (el) prevRects.set(id, el.getBoundingClientRect());
    });
    const oldPos = new Map<number, { moduleId: number; index: number }>();
    modules.forEach((mod) => mod.items.forEach((it, idx) => oldPos.set(it.id, { moduleId: mod.id, index: idx })));

    // New tree: pull the moved items out everywhere, then drop them as one block
    // into the target module before `beforeItemId` (or at the end).
    const next = modules.map((mod) => ({ ...mod, items: mod.items.filter((it) => !movedIds.has(it.id)) }));
    const targetModule = next.find((mod) => mod.id === targetModuleId);
    if (!targetModule) return;
    const insertIdx =
      beforeItemId == null
        ? targetModule.items.length
        : (() => {
            const bi = targetModule.items.findIndex((it) => it.id === beforeItemId);
            return bi < 0 ? targetModule.items.length : bi;
          })();
    targetModule.items.splice(insertIdx, 0, ...moved.map((it) => ({ ...it, moduleId: targetModuleId })));

    const changed = next.some((mod) =>
      mod.items.some((it, idx) => {
        const old = oldPos.get(it.id);
        return !old || old.moduleId !== mod.id || old.index !== idx;
      })
    );
    if (!changed) return; // dropped in place

    setModules(next);
    if (grabbedSelected) setSelected(new Set());
    flipPrev.current = prevRects;
    setFlipTick((t) => t + 1);

    // Persist. A single item is one call (Canvas auto-shifts the rest). For a
    // multi-item move, re-set every slot that changed in ascending target order
    // so Canvas converges on the new arrangement.
    type Update = { srcModuleId: number; itemId: number; targetModuleId: number; position: number; cross: boolean };
    let updates: Update[];
    if (moved.length === 1) {
      const only = moved[0];
      const old = oldPos.get(only.id)!;
      const finalIdx = targetModule.items.findIndex((it) => it.id === only.id);
      updates = [
        { srcModuleId: old.moduleId, itemId: only.id, targetModuleId, position: finalIdx + 1, cross: old.moduleId !== targetModuleId },
      ];
    } else {
      updates = [];
      next.forEach((mod) =>
        mod.items.forEach((it, idx) => {
          const old = oldPos.get(it.id);
          if (!old) return;
          const cross = old.moduleId !== mod.id;
          if (cross || old.index !== idx) {
            updates.push({ srcModuleId: old.moduleId, itemId: it.id, targetModuleId: mod.id, position: idx + 1, cross });
          }
        })
      );
      updates.sort((a, b) => a.targetModuleId - b.targetModuleId || a.position - b.position);
    }

    void (async () => {
      setBusy(true);
      let failed = false;
      for (const u of updates) {
        const result = await updateModuleItemAction(
          courseUrl,
          u.srcModuleId,
          u.itemId,
          { position: u.position, ...(u.cross ? { targetModuleId: u.targetModuleId } : {}) },
          acronym
        );
        if ("error" in result) failed = true;
      }
      setBusy(false);
      if (failed) {
        setNote({ kind: "error", text: "Some items could not be moved." });
        reload();
      }
    })();
  };

  const openFilePreview = async (it: CanvasModuleItem) => {
    if (it.contentId == null) return;
    setFilePreview({ file: { student: "", name: it.title, extension: "", content: "Loading…", truncated: false }, blobUrl: null });
    const result = await previewFileAction(courseUrl, it.contentId, acronym);
    if ("error" in result) {
      setFilePreview({ file: { student: "", name: it.title, extension: "", content: result.error, truncated: false }, blobUrl: null });
      return;
    }
    const p = result.preview;
    const blobUrl = p.base64 ? base64ToBlobUrl(p.base64, p.mimeType) : null;
    setFilePreview({
      file: {
        student: "",
        name: p.name,
        extension: "",
        content: p.text,
        truncated: p.truncated,
        rawBase64: p.base64 || undefined,
        mimeType: p.mimeType,
      },
      blobUrl,
    });
  };

  const closeFilePreview = () =>
    setFilePreview((prev) => {
      if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl);
      return null;
    });

  // Load the course's rubrics once for the bulk rubric-association control.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listRubricsAction(courseUrl, acronym);
      if (cancelled || "error" in result) return;
      setRubrics(result.rubrics);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, acronym]);

  const selectedItems = (): Array<{ item: CanvasModuleItem; moduleId: number }> => {
    const out: Array<{ item: CanvasModuleItem; moduleId: number }> = [];
    for (const mod of modules) {
      for (const it of mod.items) {
        if (selected.has(itemKey(mod.id, it.id))) out.push({ item: it, moduleId: mod.id });
      }
    }
    return out;
  };
  const allKeys = modules.flatMap((mod) => mod.items.map((it) => itemKey(mod.id, it.id)));
  const allSelected = allKeys.length > 0 && allKeys.every((k) => selected.has(k));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allKeys));
  const clearSelection = () => {
    setSelected(new Set());
    setSelectedModules(new Set());
  };
  const toggleItemSelected = (moduleId: number, itemId: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const k = itemKey(moduleId, itemId);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  // Select (or, when all are already selected, deselect) every item in one module.
  const toggleModuleItems = (m: CanvasModule) => {
    const keys = m.items.map((it) => itemKey(m.id, it.id));
    if (keys.length === 0) return;
    const allOn = keys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (allOn) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  // Module-level selection (for deleting / publishing whole modules).
  const allModuleIds = modules.map((mod) => mod.id);
  const allModulesSelected = allModuleIds.length > 0 && allModuleIds.every((id) => selectedModules.has(id));
  const toggleAllModules = () => setSelectedModules(allModulesSelected ? new Set() : new Set(allModuleIds));
  const toggleModuleSelected = (id: number) =>
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const bulkPublishModules = (published: boolean) => {
    const moduleIds = [...selectedModules];
    if (moduleIds.length === 0) return;
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let updated = 0;
      let failed = 0;
      for (const id of moduleIds) {
        const result = await updateModuleAction(courseUrl, id, { published }, acronym);
        if ("error" in result) failed += 1;
        else updated += 1;
      }
      setOpBusy(false);
      setNote({
        kind: failed ? "error" : "success",
        text: `${published ? "Published" : "Unpublished"} modules: ${updated} done${failed ? `, ${failed} failed` : ""}.`,
      });
      reload();
    })();
  };

  const bulkDeleteModules = () => {
    if (!confirmDeleteModules) {
      setConfirmDeleteModules(true);
      return;
    }
    setConfirmDeleteModules(false);
    const moduleIds = [...selectedModules];
    if (moduleIds.length === 0) return;
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let updated = 0;
      let failed = 0;
      for (const id of moduleIds) {
        const result = await deleteModuleAction(courseUrl, id, acronym);
        if ("error" in result) failed += 1;
        else updated += 1;
      }
      setOpBusy(false);
      setNote({
        kind: failed ? "error" : "success",
        text: `Deleted modules: ${updated} done${failed ? `, ${failed} failed` : ""}.`,
      });
      setSelectedModules(new Set());
      reload();
    })();
  };

  // Fill a naming pattern for one module: {module} -> module name, {n} -> the
  // week/module number read from the module's title (e.g. "Week 5" -> 5, "Unit
  // 12: Foo" -> 12). Prefers a number that follows a week/module-ish word so a
  // leading year like "2024 Fall Week 3" still resolves to 3; otherwise uses the
  // first number in the title, and finally the 1-based selection index when the
  // title has no number at all.
  const fillNamePattern = (pattern: string, moduleName: string, fallbackN: number): string => {
    const labeled = moduleName.match(/(?:week|module|unit|chapter|wk|mod)\s*#?\s*(\d+)/i);
    const anyNumber = moduleName.match(/\d+/);
    const n = labeled ? labeled[1] : anyNumber ? anyNumber[0] : String(fallbackN);
    return pattern.replace(/\{module\}/g, moduleName).replace(/\{n\}/g, n).trim() || `Item ${n}`;
  };

  // Create one new item of `type` named `name` and add it to `moduleId`. Pages
  // and gradables are created first (to get a slug / content id) and then linked;
  // a SubHeader is just a titled module item with no underlying content.
  const addContentToModule = async (type: string, moduleId: number, name: string): Promise<boolean> => {
    try {
      if (type === "SubHeader") {
        const r = await createModuleItemAction(courseUrl, moduleId, { type: "SubHeader", title: name }, acronym);
        return !("error" in r);
      }
      if (type === "Page") {
        const created = await createPageAction(courseUrl, { title: name }, acronym);
        if ("error" in created) return false;
        const linked = await createModuleItemAction(courseUrl, moduleId, { type: "Page", pageUrl: created.page.url }, acronym);
        return !("error" in linked);
      }
      // Assignment / Quiz / Discussion
      const created = await createGradableAction(courseUrl, type as GradableKind, { title: name }, acronym);
      if ("error" in created) return false;
      const linked = await createModuleItemAction(courseUrl, moduleId, { type, contentId: created.id }, acronym);
      return !("error" in linked);
    } catch {
      return false;
    }
  };

  // Add one new item (named via the pattern) of the chosen type to every
  // selected module, in module order. New content is unpublished by default.
  const bulkAddToModules = () => {
    const targets = modules.filter((mod) => selectedModules.has(mod.id));
    if (targets.length === 0) return;
    const pattern = bulkAddPattern.trim();
    if (!pattern) {
      setNote({ kind: "error", text: "Enter a name pattern for the new items." });
      return;
    }
    const type = bulkAddType;
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let added = 0;
      let failed = 0;
      let n = 0;
      for (const mod of targets) {
        n += 1;
        const ok = await addContentToModule(type, mod.id, fillNamePattern(pattern, mod.name, n));
        if (ok) added += 1;
        else failed += 1;
      }
      setOpBusy(false);
      setNote({
        kind: failed ? "error" : "success",
        text: `Added to modules: ${added} done${failed ? `, ${failed} failed` : ""}.`,
      });
      reload();
    })();
  };

  // Run a bulk op that returns an {updated, failures} summary; report + refresh.
  const runBulkSummary = async (
    fn: () => Promise<{ updated: number; failures: unknown[] } | { error: string }>,
    label: string
  ) => {
    setOpBusy(true);
    setNote(null);
    const result = await fn();
    setOpBusy(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    setNote({
      kind: result.failures.length ? "error" : "success",
      text: `${label}: ${result.updated} done${result.failures.length ? `, ${result.failures.length} failed` : ""}.`,
    });
    reload();
  };

  // Run a per-item op (publish, remove) over the current selection.
  const runPerItem = async (
    items: Array<{ item: CanvasModuleItem; moduleId: number }>,
    fn: (item: CanvasModuleItem, moduleId: number) => Promise<{ ok: true } | { error: string }>,
    label: string
  ) => {
    setOpBusy(true);
    setNote(null);
    let updated = 0;
    let failed = 0;
    for (const { item, moduleId } of items) {
      const result = await fn(item, moduleId);
      if ("error" in result) failed += 1;
      else updated += 1;
    }
    setOpBusy(false);
    setNote({
      kind: failed ? "error" : "success",
      text: `${label}: ${updated} done${failed ? `, ${failed} failed` : ""}.`,
    });
    reload();
  };

  // Group selected items' ids by kind for the per-kind bulk endpoints.
  const idsByKind = (kinds: BulkKind[], usePageSlug = false): Record<string, string[]> => {
    const map: Record<string, string[]> = {};
    for (const { item } of selectedItems()) {
      if (!kinds.includes(item.type as BulkKind)) continue;
      const id =
        item.type === "Page"
          ? usePageSlug
            ? item.pageUrl
            : null
          : item.contentId != null
            ? String(item.contentId)
            : null;
      if (id) (map[item.type] ??= []).push(id);
    }
    return map;
  };

  const bulkPublish = (published: boolean) => {
    const items = selectedItems();
    if (items.length === 0) return;
    void runPerItem(
      items,
      (it, moduleId) => updateModuleItemAction(courseUrl, moduleId, it.id, { published }, acronym),
      published ? "Published" : "Unpublished"
    );
  };

  const bulkSetDue = () => {
    if (!bulkDue || Number.isNaN(new Date(bulkDue).getTime())) {
      setNote({ kind: "error", text: "Pick a valid due date first." });
      return;
    }
    const iso = new Date(bulkDue).toISOString();
    const updates = selectedItems()
      .filter(({ item }) => ["Assignment", "Quiz", "Discussion"].includes(item.type) && typeof item.contentId === "number")
      .map(({ item }) => ({ type: item.type, contentId: item.contentId as number, dueAt: iso }));
    if (updates.length === 0) {
      setNote({ kind: "error", text: "No selected items can take a due date." });
      return;
    }
    void runBulkSummary(() => setModuleDueDatesAction(courseUrl, updates, acronym), "Due date set");
  };

  const bulkShiftDue = () => {
    const updates = selectedItems()
      .filter(
        ({ item }) =>
          ["Assignment", "Quiz", "Discussion"].includes(item.type) && typeof item.contentId === "number" && item.dueAt
      )
      .map(({ item }) => {
        const d = new Date(item.dueAt!);
        d.setDate(d.getDate() + bulkShift);
        return { type: item.type, contentId: item.contentId as number, dueAt: d.toISOString() };
      });
    if (updates.length === 0) {
      setNote({ kind: "error", text: "No selected items have a due date to shift." });
      return;
    }
    void runBulkSummary(() => setModuleDueDatesAction(courseUrl, updates, acronym), "Due dates shifted");
  };

  // Move every selected item `dir * bulkModuleShift` modules along the module
  // list (negative = toward the top). Each item's target is clamped to the first
  // and last module, so items already at the edge in that direction stay put.
  // Items land at the end of their target module; when several move into the same
  // module their selection order is preserved.
  const bulkShiftModules = (dir: -1 | 1) => {
    const items = selectedItems();
    if (items.length === 0) return;
    const steps = Math.abs(Math.trunc(bulkModuleShift || 0));
    if (steps === 0) {
      setNote({ kind: "error", text: "Enter how many modules to shift by." });
      return;
    }
    if (modules.length < 2) {
      setNote({ kind: "error", text: "There is only one module to move items between." });
      return;
    }
    const delta = dir * steps;

    const moduleIndex = new Map<number, number>();
    modules.forEach((mod, idx) => moduleIndex.set(mod.id, idx));

    // Plan each move: source module + target module + the 1-based position the
    // item should take at the end of that target (accounting for others moving
    // into the same module ahead of it in this batch).
    const appended = new Map<number, number>();
    const plan = new Map<number, { srcModuleId: number; targetModuleId: number; position: number }>();
    for (const { item, moduleId } of items) {
      const srcIdx = moduleIndex.get(moduleId);
      if (srcIdx === undefined) continue;
      const targetIdx = Math.min(modules.length - 1, Math.max(0, srcIdx + delta));
      if (targetIdx === srcIdx) continue; // already at the top/bottom in this direction
      const target = modules[targetIdx];
      const n = appended.get(target.id) ?? 0;
      plan.set(item.id, { srcModuleId: moduleId, targetModuleId: target.id, position: target.items.length + n + 1 });
      appended.set(target.id, n + 1);
    }

    const moveItems = items.filter(({ item }) => plan.has(item.id));
    if (moveItems.length === 0) {
      setNote({ kind: "error", text: `Selected items are already at the ${dir < 0 ? "top" : "bottom"} module.` });
      return;
    }

    void (async () => {
      await runPerItem(
        moveItems,
        (it, moduleId) => {
          const p = plan.get(it.id)!;
          return updateModuleItemAction(
            courseUrl,
            moduleId,
            it.id,
            { targetModuleId: p.targetModuleId, position: p.position },
            acronym
          );
        },
        dir < 0 ? "Shifted up" : "Shifted down"
      );
      clearSelection();
    })();
  };

  // Move every selected item into one chosen module, appended to its end in
  // selection order. Items already in that module are left alone.
  const bulkMoveToModule = () => {
    if (bulkTargetModule === "") {
      setNote({ kind: "error", text: "Pick a module to move the items into." });
      return;
    }
    const targetId = bulkTargetModule;
    const target = modules.find((mod) => mod.id === targetId);
    if (!target) return;
    const items = selectedItems();
    if (items.length === 0) return;

    // Position each moved item at the end of the target, after any already there
    // plus the others moving in ahead of it in this batch.
    let appended = 0;
    const plan = new Map<number, number>();
    for (const { item, moduleId } of items) {
      if (moduleId === targetId) continue; // already in the target module
      plan.set(item.id, target.items.length + appended + 1);
      appended += 1;
    }

    const moveItems = items.filter(({ item }) => plan.has(item.id));
    if (moveItems.length === 0) {
      setNote({ kind: "error", text: `Selected items are already in "${target.name}".` });
      return;
    }

    void (async () => {
      await runPerItem(
        moveItems,
        (it, moduleId) =>
          updateModuleItemAction(
            courseUrl,
            moduleId,
            it.id,
            { targetModuleId: targetId, position: plan.get(it.id)! },
            acronym
          ),
        `Moved to "${target.name}"`
      );
      clearSelection();
    })();
  };

  const bulkSetPoints = () => {
    const p = Number(bulkPoints);
    if (bulkPoints.trim() === "" || !Number.isFinite(p)) {
      setNote({ kind: "error", text: "Enter a points value." });
      return;
    }
    const byKind = idsByKind(["Assignment", "Quiz"]);
    const kinds = Object.keys(byKind);
    if (kinds.length === 0) {
      setNote({ kind: "error", text: "No selected assignments or quizzes." });
      return;
    }
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let updated = 0;
      let failed = 0;
      for (const k of kinds) {
        const result = await bulkUpdateAction(courseUrl, k as BulkKind, byKind[k], { pointsPossible: p }, acronym);
        if ("error" in result) failed += byKind[k].length;
        else {
          updated += result.updated;
          failed += result.failures.length;
        }
      }
      setOpBusy(false);
      setNote({ kind: failed ? "error" : "success", text: `Points set: ${updated} done${failed ? `, ${failed} failed` : ""}.` });
      reload();
    })();
  };

  const bulkRubric = () => {
    if (bulkRubricId === "") {
      setNote({ kind: "error", text: "Pick a rubric first." });
      return;
    }
    const ids = selectedItems()
      .filter(({ item }) => item.type === "Assignment" && typeof item.contentId === "number")
      .map(({ item }) => String(item.contentId));
    if (ids.length === 0) {
      setNote({ kind: "error", text: "No selected assignments." });
      return;
    }
    void runBulkSummary(() => bulkAssociateRubricAction(courseUrl, Number(bulkRubricId), ids, acronym), "Rubric associated");
  };

  const bulkRemoveFromModule = () => {
    const items = selectedItems();
    if (items.length === 0) return;
    void (async () => {
      await runPerItem(items, (it, moduleId) => deleteModuleItemAction(courseUrl, moduleId, it.id, acronym), "Removed from module");
      clearSelection();
    })();
  };

  const bulkDeleteContent = () => {
    if (!confirmDeleteContent) {
      setConfirmDeleteContent(true);
      return;
    }
    setConfirmDeleteContent(false);
    const byKind = idsByKind(["Assignment", "Quiz", "Discussion", "Page"], true);
    const kinds = Object.keys(byKind);
    if (kinds.length === 0) {
      setNote({ kind: "error", text: "No selected items can be deleted from Canvas (try Remove from module)." });
      return;
    }
    void (async () => {
      setOpBusy(true);
      setNote(null);
      let updated = 0;
      let failed = 0;
      for (const k of kinds) {
        const result = await bulkDeleteAction(courseUrl, k as BulkKind, byKind[k], acronym);
        if ("error" in result) failed += byKind[k].length;
        else {
          updated += result.updated;
          failed += result.failures.length;
        }
      }
      setOpBusy(false);
      setNote({ kind: failed ? "error" : "success", text: `Deleted from Canvas: ${updated} done${failed ? `, ${failed} failed` : ""}.` });
      clearSelection();
      reload();
    })();
  };

  const patchModule = (id: number, patch: Partial<CanvasModule>) =>
    setModules((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const patchItems = (moduleId: number, items: CanvasModuleItem[]) =>
    setModules((prev) => prev.map((m) => (m.id === moduleId ? { ...m, items } : m)));

  // Run a write, surfacing errors and reloading from Canvas to recover on failure.
  const run = async (fn: () => Promise<{ error: string } | unknown>, fallbackMsg: string) => {
    setBusy(true);
    setNote(null);
    try {
      const result = (await fn()) as { error?: string };
      if (result && typeof result === "object" && "error" in result && result.error) {
        setNote({ kind: "error", text: result.error });
        reload();
      }
    } catch (err) {
      setNote({ kind: "error", text: err instanceof Error ? err.message : fallbackMsg });
      reload();
    } finally {
      setBusy(false);
    }
  };

  const handleAddModule = async () => {
    const name = newModuleName.trim();
    if (!name) return;
    setNewModuleName("");
    await run(
      () => createModuleAction(courseUrl, name, modules.length + 1, acronym),
      "Could not create the module."
    );
    reload();
  };

  const saveModuleName = async (m: CanvasModule) => {
    const draft = drafts[`m${m.id}`];
    if (draft === undefined || draft.trim() === m.name) return;
    const name = draft.trim();
    if (!name) return;
    patchModule(m.id, { name });
    await run(() => updateModuleAction(courseUrl, m.id, { name }, acronym), "Could not rename the module.");
  };

  const toggleModule = (m: CanvasModule) => {
    const published = !m.published;
    patchModule(m.id, { published });
    void run(
      () => updateModuleAction(courseUrl, m.id, { published }, acronym),
      "Could not update the module."
    );
  };

  const moveModule = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= modules.length) return;
    const reordered = [...modules];
    const [m] = reordered.splice(index, 1);
    reordered.splice(target, 0, m);
    setModules(reordered);
    void run(
      () => updateModuleAction(courseUrl, m.id, { position: target + 1 }, acronym),
      "Could not reorder the module."
    );
  };

  // Drop the dragged module onto another module's card: drag down lands it just
  // after the target, drag up lands it just before, so either end is reachable.
  // Reorder locally with a FLIP for instant feedback, then persist the new
  // 1-based position (Canvas shifts the rest).
  const performModuleMove = (targetId: number) => {
    if (moduleDrag === null) return;
    const srcId = moduleDrag;
    setModuleDrag(null);
    setDragOverModuleRow(null);
    if (srcId === targetId) return;

    const srcIdx = modules.findIndex((m) => m.id === srcId);
    const tgtIdx = modules.findIndex((m) => m.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;

    const prevRects = new Map<number, DOMRect>();
    moduleNodes.current.forEach((el, id) => {
      if (el) prevRects.set(id, el.getBoundingClientRect());
    });

    const dragged = modules[srcIdx];
    const reordered = modules.filter((m) => m.id !== srcId);
    const newTgtIdx = reordered.findIndex((m) => m.id === targetId);
    const insertAt = srcIdx < tgtIdx ? newTgtIdx + 1 : newTgtIdx;
    reordered.splice(insertAt, 0, dragged);

    setModules(reordered);
    flipPrevModules.current = prevRects;
    setFlipTick((t) => t + 1);

    void run(
      () => updateModuleAction(courseUrl, dragged.id, { position: insertAt + 1 }, acronym),
      "Could not reorder the module."
    );
  };

  const removeModule = async (m: CanvasModule) => {
    if (confirmId !== `m${m.id}`) {
      setConfirmId(`m${m.id}`);
      return;
    }
    setConfirmId(null);
    setModules((prev) => prev.filter((x) => x.id !== m.id));
    await run(() => deleteModuleAction(courseUrl, m.id, acronym), "Could not delete the module.");
  };

  const saveItemTitle = async (m: CanvasModule, it: CanvasModuleItem) => {
    const draft = drafts[`i${it.id}`];
    if (draft === undefined || draft.trim() === it.title) return;
    const title = draft.trim();
    if (!title) return;
    patchItems(m.id, m.items.map((x) => (x.id === it.id ? { ...x, title } : x)));
    await run(
      () => updateModuleItemAction(courseUrl, m.id, it.id, { title }, acronym),
      "Could not rename the item."
    );
  };

  const toggleItem = (m: CanvasModule, it: CanvasModuleItem) => {
    const published = !it.published;
    patchItems(m.id, m.items.map((x) => (x.id === it.id ? { ...x, published } : x)));
    void run(
      () => updateModuleItemAction(courseUrl, m.id, it.id, { published }, acronym),
      "Could not update the item."
    );
  };

  const moveItem = (m: CanvasModule, index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= m.items.length) return;
    const items = [...m.items];
    const [it] = items.splice(index, 1);
    items.splice(target, 0, it);
    patchItems(m.id, items);
    void run(
      () => updateModuleItemAction(courseUrl, m.id, it.id, { position: target + 1 }, acronym),
      "Could not reorder the item."
    );
  };

  const indentItem = (m: CanvasModule, it: CanvasModuleItem, delta: -1 | 1) => {
    const indent = Math.min(MAX_INDENT, Math.max(0, it.indent + delta));
    if (indent === it.indent) return;
    patchItems(m.id, m.items.map((x) => (x.id === it.id ? { ...x, indent } : x)));
    void run(
      () => updateModuleItemAction(courseUrl, m.id, it.id, { indent }, acronym),
      "Could not change the indent."
    );
  };

  const removeItem = async (m: CanvasModule, it: CanvasModuleItem) => {
    if (confirmId !== `i${it.id}`) {
      setConfirmId(`i${it.id}`);
      return;
    }
    setConfirmId(null);
    patchItems(m.id, m.items.filter((x) => x.id !== it.id));
    await run(
      () => deleteModuleItemAction(courseUrl, m.id, it.id, acronym),
      "Could not remove the item."
    );
  };

  // Item types whose target is picked from a dropdown of existing course content.
  const CONTENT_TYPES = ["Page", "Assignment", "Quiz", "Discussion", "File"];
  // Of those, the ones sourced from the lazily-loaded addable content.
  const TARGET_TYPES = ["Assignment", "Quiz", "Discussion", "File"];

  const optionsFor = (type: string): Array<{ value: string; label: string }> => {
    if (type === "Page") return pages.map((p) => ({ value: p.url, label: p.title }));
    if (!targets) return [];
    if (type === "Assignment") return targets.assignments.map((a) => ({ value: String(a.id), label: a.title }));
    if (type === "Quiz") return targets.quizzes.map((q) => ({ value: String(q.id), label: q.title }));
    if (type === "Discussion") return targets.discussions.map((d) => ({ value: String(d.id), label: d.title }));
    if (type === "File") return targets.files.map((f) => ({ value: String(f.id), label: f.title }));
    return [];
  };

  const contentPlaceholder = (type: string): string => {
    if (TARGET_TYPES.includes(type) && targetsState === "loading") return "Loading…";
    if (TARGET_TYPES.includes(type) && targetsState === "error") return "Could not load";
    return optionsFor(type).length === 0 ? `No ${type.toLowerCase()}s to add` : `Choose a ${type.toLowerCase()}…`;
  };

  const canAdd = (m: CanvasModule): boolean => {
    const type = addType[m.id] ?? "Page";
    if (type === "ExternalUrl") return !!(addUrl[m.id] ?? "").trim();
    if (type === "SubHeader") return !!(addTitle[m.id] ?? "").trim();
    return !!addValue[m.id];
  };

  const addItem = async (m: CanvasModule) => {
    const type = addType[m.id] ?? "Page";
    let item: NewModuleItem | null = null;
    if (type === "Page") {
      const pageUrl = addValue[m.id];
      if (pageUrl) item = { type: "Page", pageUrl };
    } else if (type === "ExternalUrl") {
      const externalUrl = (addUrl[m.id] ?? "").trim();
      const title = (addTitle[m.id] ?? "").trim();
      if (externalUrl) item = { type: "ExternalUrl", externalUrl, title: title || externalUrl };
    } else if (type === "SubHeader") {
      const title = (addTitle[m.id] ?? "").trim();
      if (title) item = { type: "SubHeader", title };
    } else {
      const id = addValue[m.id];
      if (id) item = { type, contentId: Number(id) };
    }
    if (!item) return;
    const newItem = item;
    setAddValue((p) => ({ ...p, [m.id]: "" }));
    setAddUrl((p) => ({ ...p, [m.id]: "" }));
    setAddTitle((p) => ({ ...p, [m.id]: "" }));
    await run(() => createModuleItemAction(courseUrl, m.id, newItem, acronym), "Could not add the item.");
    reload();
  };

  // Upload dropped/picked files straight into a module, tracking each file's
  // status, then refresh so the new File items appear.
  const handleModuleFiles = async (m: CanvasModule, list: FileList | File[]) => {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    setUploads((u) => ({ ...u, [m.id]: arr.map((f) => ({ name: f.name, status: "uploading" as const })) }));
    for (let i = 0; i < arr.length; i++) {
      try {
        await uploadFileToModule(courseUrl, acronym, m.id, arr[i]);
        setUploads((u) => ({
          ...u,
          [m.id]: (u[m.id] ?? []).map((row, idx) => (idx === i ? { ...row, status: "done" } : row)),
        }));
      } catch (err) {
        setUploads((u) => ({
          ...u,
          [m.id]: (u[m.id] ?? []).map((row, idx) =>
            idx === i ? { ...row, status: "error", error: err instanceof Error ? err.message : "Failed" } : row
          ),
        }));
      }
    }
    reload();
  };

  const arrowBtn = (label: string, onClick: () => void, disabled: boolean) => (
    <button
      type="button"
      className={styles.clearFileButton}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{ padding: "2px 8px" }}
    >
      {label === "Move up" ? "↑" : "↓"}
    </button>
  );

  return (
    <div className={styles.form}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <label className={styles.fieldHint} style={{ display: "inline-flex", gap: 6, alignItems: "center", margin: 0 }}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={allKeys.length === 0} />
            Select all items
          </label>
          <label className={styles.fieldHint} style={{ display: "inline-flex", gap: 6, alignItems: "center", margin: 0 }}>
            <input
              type="checkbox"
              checked={allModulesSelected}
              onChange={toggleAllModules}
              disabled={modules.length === 0}
            />
            Select all modules
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className={styles.downloadButton}
            onClick={() => setBulkUploadOpen(true)}
            disabled={busy || modules.length === 0}
          >
            Bulk upload
          </button>
          <button
            type="button"
            className={styles.downloadButton}
            onClick={() => setRenameOpen(true)}
            disabled={busy || modules.length === 0}
          >
            Rename modules
          </button>
          <button
            type="button"
            className={styles.downloadButton}
            onClick={() => setScheduleOpen(true)}
            disabled={busy || modules.length === 0}
          >
            Schedule due dates
          </button>
        </div>
      </div>

      {(selected.size > 0 || selectedModules.size > 0) && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            padding: "12px 14px",
            borderRadius: 12,
            background: "color-mix(in srgb, var(--accent) 7%, #fff)",
            border: "1px solid color-mix(in srgb, var(--accent) 28%, var(--field-border))",
            position: "sticky",
            top: "calc(var(--topbar-height) + 44px)",
            zIndex: 20,
            boxShadow: "0 6px 16px rgba(15, 23, 42, 0.1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700 }}>
              {[
                selectedModules.size > 0
                  ? `${selectedModules.size} module${selectedModules.size === 1 ? "" : "s"}`
                  : "",
                selected.size > 0 ? `${selected.size} item${selected.size === 1 ? "" : "s"}` : "",
              ]
                .filter(Boolean)
                .join(", ")}{" "}
              selected
            </span>
            <button type="button" className={styles.clearFileButton} onClick={clearSelection}>
              Clear
            </button>
          </div>

          {selectedModules.size > 0 && (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span className={styles.fieldHint} style={{ margin: 0, fontWeight: 600 }}>
                  Modules:
                </span>
                <button type="button" className={styles.downloadButton} disabled={opBusy} onClick={() => bulkPublishModules(true)}>
                  Publish
                </button>
                <button type="button" className={styles.downloadButton} disabled={opBusy} onClick={() => bulkPublishModules(false)}>
                  Unpublish
                </button>
                <button
                  type="button"
                  className={styles.clearFileButton}
                  disabled={opBusy}
                  onClick={bulkDeleteModules}
                  style={{ color: "#b91c1c", borderColor: "#fecaca" }}
                >
                  {confirmDeleteModules ? "Confirm delete modules" : "Delete modules"}
                </button>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <span className={styles.fieldHint} style={{ margin: 0, fontWeight: 600 }}>
                  Add to each:
                </span>
                <select
                  className={styles.textInput}
                  style={{ maxWidth: 150 }}
                  value={bulkAddType}
                  onChange={(e) => setBulkAddType(e.target.value)}
                  aria-label="Type of item to add to each selected module"
                >
                  <option value="Assignment">Assignment</option>
                  <option value="Quiz">Quiz</option>
                  <option value="Discussion">Discussion</option>
                  <option value="Page">Page</option>
                  <option value="SubHeader">Text header</option>
                </select>
                <input
                  type="text"
                  className={styles.textInput}
                  style={{ flex: "1 1 220px", minWidth: 180 }}
                  placeholder="Name pattern, e.g. {module} - Homework"
                  value={bulkAddPattern}
                  onChange={(e) => setBulkAddPattern(e.target.value)}
                  aria-label="Name pattern for the new items"
                />
                <button
                  type="button"
                  className={styles.downloadButton}
                  disabled={opBusy || !bulkAddPattern.trim()}
                  onClick={bulkAddToModules}
                >
                  Add to modules
                </button>
                <span className={styles.fieldHint} style={{ margin: 0, flexBasis: "100%" }}>
                  Use {"{module}"} for the module name and {"{n}"} for the week/module number in its title (e.g. &quot;Week 5&quot; -&gt; 5). New items are created unpublished.
                </span>
              </div>
            </>
          )}

          {selected.size > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span className={styles.fieldHint} style={{ margin: 0, fontWeight: 600 }}>
              Items:
            </span>
            <button type="button" className={styles.downloadButton} disabled={opBusy} onClick={() => bulkPublish(true)}>
              Publish
            </button>
            <button type="button" className={styles.downloadButton} disabled={opBusy} onClick={() => bulkPublish(false)}>
              Unpublish
            </button>
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input
                type="datetime-local"
                className={styles.textInput}
                style={{ width: 200 }}
                value={bulkDue}
                onChange={(e) => setBulkDue(e.target.value)}
              />
              <button type="button" className={styles.downloadButton} disabled={opBusy} onClick={bulkSetDue}>
                Set due
              </button>
            </span>
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input
                type="number"
                className={styles.textInput}
                style={{ width: 76 }}
                value={bulkShift}
                onChange={(e) => setBulkShift(Number(e.target.value))}
                aria-label="Days to shift"
              />
              <button type="button" className={styles.downloadButton} disabled={opBusy} onClick={bulkShiftDue}>
                Shift days
              </button>
            </span>
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input
                type="number"
                className={styles.textInput}
                style={{ width: 90 }}
                placeholder="points"
                value={bulkPoints}
                onChange={(e) => setBulkPoints(e.target.value)}
                aria-label="Points"
              />
              <button type="button" className={styles.downloadButton} disabled={opBusy} onClick={bulkSetPoints}>
                Set points
              </button>
            </span>
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <select
                className={styles.textInput}
                style={{ maxWidth: 180 }}
                value={bulkRubricId}
                disabled={rubrics.length === 0}
                onChange={(e) => setBulkRubricId(e.target.value === "" ? "" : Number(e.target.value))}
                aria-label="Rubric"
              >
                <option value="">{rubrics.length === 0 ? "No rubrics" : "Rubric…"}</option>
                {rubrics.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.downloadButton}
                disabled={opBusy || bulkRubricId === ""}
                onClick={bulkRubric}
              >
                Associate
              </button>
            </span>
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input
                type="number"
                min={1}
                className={styles.textInput}
                style={{ width: 76 }}
                value={bulkModuleShift}
                onChange={(e) => setBulkModuleShift(Number(e.target.value))}
                aria-label="Modules to shift by"
              />
              <button type="button" className={styles.downloadButton} disabled={opBusy} onClick={() => bulkShiftModules(-1)}>
                Shift up
              </button>
              <button type="button" className={styles.downloadButton} disabled={opBusy} onClick={() => bulkShiftModules(1)}>
                Shift down
              </button>
            </span>
            <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <select
                className={styles.textInput}
                style={{ maxWidth: 200 }}
                value={bulkTargetModule}
                disabled={modules.length === 0}
                onChange={(e) => setBulkTargetModule(e.target.value === "" ? "" : Number(e.target.value))}
                aria-label="Module to move items into"
              >
                <option value="">{modules.length === 0 ? "No modules" : "Move to module…"}</option>
                {modules.map((mod) => (
                  <option key={mod.id} value={mod.id}>
                    {mod.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.downloadButton}
                disabled={opBusy || bulkTargetModule === ""}
                onClick={bulkMoveToModule}
              >
                Move here
              </button>
            </span>
            <button type="button" className={styles.clearFileButton} disabled={opBusy} onClick={bulkRemoveFromModule}>
              Remove from module
            </button>
            <button
              type="button"
              className={styles.clearFileButton}
              disabled={opBusy}
              onClick={bulkDeleteContent}
              style={{ color: "#b91c1c", borderColor: "#fecaca" }}
            >
              {confirmDeleteContent ? "Confirm delete from Canvas" : "Delete from Canvas"}
            </button>
          </div>
          )}
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="content-new-module">Add a module</label>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            id="content-new-module"
            type="text"
            className={styles.textInput}
            style={{ flex: "1 1 240px" }}
            placeholder="New module name"
            value={newModuleName}
            onChange={(e) => setNewModuleName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddModule();
            }}
          />
          <button
            type="button"
            className={styles.downloadButton}
            onClick={handleAddModule}
            disabled={busy || !newModuleName.trim()}
          >
            Add module
          </button>
        </div>
      </div>

      {modules.length === 0 && <p className={styles.emptyState}>This course has no modules yet.</p>}

      {modules.map((m, mi) => {
        const open = expanded.has(m.id);
        const moduleItemsSelected = m.items.length > 0 && m.items.every((it) => selected.has(itemKey(m.id, it.id)));
        return (
          <div
            key={m.id}
            ref={(el) => {
              if (el) moduleNodes.current.set(m.id, el);
              else moduleNodes.current.delete(m.id);
            }}
            className={styles.syllabusSectionCard}
            onDragOver={(e) => {
              if (moduleDrag !== null) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverModuleRow(m.id);
              }
            }}
            onDragLeave={() => setDragOverModuleRow((cur) => (cur === m.id ? null : cur))}
            onDrop={(e) => {
              if (moduleDrag !== null) {
                e.preventDefault();
                performModuleMove(m.id);
              }
            }}
            style={{
              opacity: moduleDrag === m.id ? 0.55 : 1,
              boxShadow: moduleDrag === m.id ? "0 6px 16px rgba(15, 23, 42, 0.14)" : undefined,
              outline:
                dragOverModuleRow === m.id && moduleDrag !== null && moduleDrag !== m.id
                  ? "2px solid var(--accent)"
                  : undefined,
              transition: "opacity 0.15s ease, box-shadow 0.15s ease",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
              onDragOver={(e) => {
                if (drag) e.preventDefault();
              }}
              onDrop={(e) => {
                if (drag) {
                  e.preventDefault();
                  performMove(m.id, null);
                }
              }}
            >
              <span
                draggable
                onDragStart={(e) => {
                  setModuleDrag(m.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", `module-${m.id}`);
                }}
                onDragEnd={() => {
                  setModuleDrag(null);
                  setDragOverModuleRow(null);
                }}
                title="Drag to reorder modules"
                aria-label="Drag to reorder module"
                style={{
                  cursor: moduleDrag === m.id ? "grabbing" : "grab",
                  color: moduleDrag === m.id ? "var(--accent)" : "var(--text-secondary)",
                  userSelect: "none",
                  padding: "0 2px",
                  flexShrink: 0,
                  fontSize: "1.1em",
                  transition: "color 0.15s ease",
                }}
              >
                ⠿
              </span>
              <input
                type="checkbox"
                checked={selectedModules.has(m.id)}
                onChange={() => toggleModuleSelected(m.id)}
                aria-label={`Select module ${m.name}`}
                title="Select this module"
                style={{ flexShrink: 0 }}
              />
              <button
                type="button"
                className={styles.clearFileButton}
                onClick={() => onToggleExpand(m.id)}
                aria-expanded={open}
                style={{ padding: "2px 8px" }}
              >
                {open ? "▾" : "▸"}
              </button>
              <input
                type="text"
                className={styles.textInput}
                style={{ flex: "1 1 220px", fontWeight: 600 }}
                value={drafts[`m${m.id}`] ?? m.name}
                onChange={(e) => setDrafts((p) => ({ ...p, [`m${m.id}`]: e.target.value }))}
                onBlur={() => void saveModuleName(m)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
              <span className={styles.fieldHint} style={{ margin: 0 }}>
                {m.items.length} item{m.items.length === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                className={styles.clearFileButton}
                onClick={() => toggleModuleItems(m)}
                disabled={m.items.length === 0}
                title={moduleItemsSelected ? "Deselect every item in this module" : "Select every item in this module"}
                style={{ padding: "2px 8px" }}
              >
                {moduleItemsSelected ? "Deselect items" : "Select items"}
              </button>
              {arrowBtn("Move up", () => moveModule(mi, -1), busy || mi === 0)}
              {arrowBtn("Move down", () => moveModule(mi, 1), busy || mi === modules.length - 1)}
              <PublishToggle published={m.published} disabled={busy} onClick={() => toggleModule(m)} />
              <button
                type="button"
                className={styles.clearFileButton}
                onClick={() => void removeModule(m)}
                disabled={busy}
                style={{ color: "#b91c1c", borderColor: "#fecaca" }}
              >
                {confirmId === `m${m.id}` ? "Confirm delete" : "Delete"}
              </button>
            </div>

            {open && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {m.items.length === 0 && (
                  <p className={styles.fieldHint} style={{ marginLeft: 4 }}>
                    No items in this module.
                  </p>
                )}
                {m.items.map((it, ii) => (
                  <div
                    key={it.id}
                    ref={(el) => {
                      if (el) itemNodes.current.set(it.id, el);
                      else itemNodes.current.delete(it.id);
                    }}
                    onDragOver={(e) => {
                      if (drag) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        setDragOverItem(it.id);
                      }
                    }}
                    onDragLeave={() => setDragOverItem((cur) => (cur === it.id ? null : cur))}
                    onDrop={(e) => {
                      if (drag) {
                        e.preventDefault();
                        e.stopPropagation();
                        performMove(m.id, it.id);
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexWrap: "wrap",
                      marginLeft: it.indent * 18,
                      padding: "4px 4px",
                      borderRadius: 6,
                      borderTop:
                        dragOverItem === it.id
                          ? "2px solid var(--accent)"
                          : ii === 0
                            ? "none"
                            : "1px solid var(--field-border)",
                      background:
                        dragOverItem === it.id
                          ? "color-mix(in srgb, var(--accent) 9%, transparent)"
                          : isDraggingItem(m.id, it.id)
                            ? "color-mix(in srgb, var(--accent) 6%, transparent)"
                            : "transparent",
                      boxShadow: isDraggingItem(m.id, it.id) ? "0 4px 12px rgba(15, 23, 42, 0.12)" : "none",
                      opacity: isDraggingItem(m.id, it.id) ? 0.55 : 1,
                      transition: "opacity 0.15s ease, background 0.15s ease, box-shadow 0.15s ease",
                    }}
                  >
                    <span
                      draggable
                      onDragStart={(e) => {
                        setDrag({ moduleId: m.id, itemId: it.id });
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(it.id));
                      }}
                      onDragEnd={() => {
                        setDrag(null);
                        setDragOverItem(null);
                        setDragOverModule(null);
                      }}
                      title="Drag to reorder or move between modules"
                      aria-label="Drag to reorder"
                      style={{
                        cursor: isDraggingItem(m.id, it.id) ? "grabbing" : "grab",
                        color: isDraggingItem(m.id, it.id) ? "var(--accent)" : "var(--text-secondary)",
                        userSelect: "none",
                        padding: "0 2px",
                        flexShrink: 0,
                        transition: "color 0.15s ease",
                      }}
                    >
                      ⠿
                    </span>
                    <input
                      type="checkbox"
                      checked={selected.has(itemKey(m.id, it.id))}
                      onChange={() => toggleItemSelected(m.id, it.id)}
                      aria-label={`Select ${it.title}`}
                      style={{ flexShrink: 0 }}
                    />
                    <span
                      className={styles.fieldHint}
                      style={{ margin: 0, minWidth: 74, fontWeight: 600 }}
                    >
                      {it.type || "Item"}
                    </span>
                    <input
                      type="text"
                      className={styles.textInput}
                      style={{ flex: "1 1 200px" }}
                      value={drafts[`i${it.id}`] ?? it.title}
                      onChange={(e) => setDrafts((p) => ({ ...p, [`i${it.id}`]: e.target.value }))}
                      onBlur={() => void saveItemTitle(m, it)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                    {arrowBtn("Move up", () => moveItem(m, ii, -1), busy || ii === 0)}
                    {arrowBtn("Move down", () => moveItem(m, ii, 1), busy || ii === m.items.length - 1)}
                    <button
                      type="button"
                      className={styles.clearFileButton}
                      onClick={() => indentItem(m, it, -1)}
                      disabled={busy || it.indent === 0}
                      title="Outdent"
                      style={{ padding: "2px 8px" }}
                    >
                      &lt;
                    </button>
                    <button
                      type="button"
                      className={styles.clearFileButton}
                      onClick={() => indentItem(m, it, 1)}
                      disabled={busy || it.indent >= MAX_INDENT}
                      title="Indent"
                      style={{ padding: "2px 8px" }}
                    >
                      &gt;
                    </button>
                    <PublishToggle published={it.published} disabled={busy} onClick={() => toggleItem(m, it)} />
                    {it.type === "Page" && it.pageUrl && (
                      <button
                        type="button"
                        className={styles.downloadButton}
                        onClick={() => onEditPage(it.pageUrl!)}
                        style={{ padding: "2px 10px" }}
                      >
                        Edit page
                      </button>
                    )}
                    {["Assignment", "Quiz", "Discussion"].includes(it.type) && it.contentId != null && (
                      <button
                        type="button"
                        className={styles.downloadButton}
                        onClick={() => setEditingItem(it)}
                        style={{ padding: "2px 10px" }}
                      >
                        Edit
                      </button>
                    )}
                    {it.type === "File" && it.contentId != null && (
                      <button
                        type="button"
                        className={styles.downloadButton}
                        onClick={() => void openFilePreview(it)}
                        style={{ padding: "2px 10px" }}
                      >
                        Preview
                      </button>
                    )}
                    {it.type === "File" && it.contentId != null && /\.(docx|pptx)$/i.test(it.title) && (
                      <button
                        type="button"
                        className={styles.downloadButton}
                        onClick={() => setEditingFile(it)}
                        style={{ padding: "2px 10px" }}
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.clearFileButton}
                      onClick={() => void removeItem(m, it)}
                      disabled={busy}
                      style={{ color: "#b91c1c", borderColor: "#fecaca" }}
                    >
                      {confirmId === `i${it.id}` ? "Confirm" : "Remove"}
                    </button>
                  </div>
                ))}

                {drag && (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverModule(m.id);
                    }}
                    onDragLeave={() => setDragOverModule((cur) => (cur === m.id ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      performMove(m.id, null);
                    }}
                    style={{
                      marginTop: 4,
                      padding: dragOverModule === m.id ? "14px 12px" : "8px 12px",
                      borderRadius: 8,
                      border: `1px dashed ${dragOverModule === m.id ? "var(--accent)" : "var(--field-border)"}`,
                      background:
                        dragOverModule === m.id ? "color-mix(in srgb, var(--accent) 10%, #fff)" : "transparent",
                      color: dragOverModule === m.id ? "var(--accent)" : "var(--text-secondary)",
                      fontSize: "0.8rem",
                      textAlign: "center",
                      transition: "padding 0.15s ease, border-color 0.15s ease, background 0.15s ease, color 0.15s ease",
                    }}
                  >
                    Drop here to move to the end of this module
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "center",
                    marginTop: 8,
                    paddingTop: 8,
                    borderTop: "1px solid var(--field-border)",
                  }}
                >
                  <span className={styles.fieldHint} style={{ margin: 0 }}>
                    Add item:
                  </span>
                  <select
                    className={styles.textInput}
                    style={{ maxWidth: 150 }}
                    value={addType[m.id] ?? "Page"}
                    onChange={(e) => {
                      const t = e.target.value;
                      setAddType((p) => ({ ...p, [m.id]: t }));
                      setAddValue((p) => ({ ...p, [m.id]: "" }));
                      if (TARGET_TYPES.includes(t)) ensureTargets();
                    }}
                    disabled={busy}
                    aria-label="Item type"
                  >
                    <option value="Page">Page</option>
                    <option value="Assignment">Assignment</option>
                    <option value="Quiz">Quiz</option>
                    <option value="Discussion">Discussion</option>
                    <option value="File">File</option>
                    <option value="ExternalUrl">External URL</option>
                    <option value="SubHeader">Text header</option>
                  </select>

                  {CONTENT_TYPES.includes(addType[m.id] ?? "Page") && (
                    <select
                      className={styles.textInput}
                      style={{ flex: "1 1 200px", maxWidth: 320 }}
                      value={addValue[m.id] ?? ""}
                      onChange={(e) => setAddValue((p) => ({ ...p, [m.id]: e.target.value }))}
                      disabled={busy || optionsFor(addType[m.id] ?? "Page").length === 0}
                      aria-label="Content to add"
                    >
                      <option value="">{contentPlaceholder(addType[m.id] ?? "Page")}</option>
                      {optionsFor(addType[m.id] ?? "Page").map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}

                  {addType[m.id] === "ExternalUrl" && (
                    <>
                      <input
                        type="url"
                        className={styles.textInput}
                        style={{ flex: "1 1 200px", maxWidth: 280 }}
                        placeholder="https://example.com"
                        value={addUrl[m.id] ?? ""}
                        onChange={(e) => setAddUrl((p) => ({ ...p, [m.id]: e.target.value }))}
                      />
                      <input
                        type="text"
                        className={styles.textInput}
                        style={{ flex: "1 1 140px", maxWidth: 200 }}
                        placeholder="Link text (optional)"
                        value={addTitle[m.id] ?? ""}
                        onChange={(e) => setAddTitle((p) => ({ ...p, [m.id]: e.target.value }))}
                      />
                    </>
                  )}

                  {addType[m.id] === "SubHeader" && (
                    <input
                      type="text"
                      className={styles.textInput}
                      style={{ flex: "1 1 200px", maxWidth: 280 }}
                      placeholder="Header text"
                      value={addTitle[m.id] ?? ""}
                      onChange={(e) => setAddTitle((p) => ({ ...p, [m.id]: e.target.value }))}
                    />
                  )}

                  <button
                    type="button"
                    className={styles.downloadButton}
                    onClick={() => void addItem(m)}
                    disabled={busy || !canAdd(m)}
                  >
                    Add
                  </button>
                </div>

                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    void handleModuleFiles(m, e.dataTransfer.files);
                  }}
                  style={{
                    marginTop: 8,
                    border: "1px dashed var(--field-border)",
                    borderRadius: 10,
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span className={styles.fieldHint} style={{ margin: 0 }}>
                    Drop files to add to this module, or
                  </span>
                  <label className={styles.downloadButton} style={{ cursor: "pointer" }}>
                    choose files
                    <input
                      type="file"
                      multiple
                      style={{ display: "none" }}
                      onChange={(e) => {
                        if (e.target.files) void handleModuleFiles(m, e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
                {(uploads[m.id] ?? []).length > 0 && (
                  <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                    {(uploads[m.id] ?? []).map((row, idx) => (
                      <span
                        key={`${m.id}-up-${idx}`}
                        className={styles.fieldHint}
                        style={{ margin: 0, color: row.status === "error" ? "var(--error, #b91c1c)" : undefined }}
                      >
                        {row.name}:{" "}
                        {row.status === "uploading"
                          ? "uploading…"
                          : row.status === "done"
                            ? "added"
                            : `failed (${row.error})`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {scheduleOpen && (
        <SchedulerModal
          courseUrl={courseUrl}
          acronym={acronym}
          modules={modules}
          onClose={() => setScheduleOpen(false)}
          onApplied={(message) => {
            setScheduleOpen(false);
            setNote({ kind: "success", text: message });
          }}
        />
      )}

      {bulkUploadOpen && (
        <BulkUploadModal
          courseUrl={courseUrl}
          acronym={acronym}
          modules={modules}
          onClose={() => setBulkUploadOpen(false)}
          onDone={reload}
        />
      )}

      {renameOpen && (
        <RenameModulesModal
          courseUrl={courseUrl}
          acronym={acronym}
          modules={modules}
          onClose={() => setRenameOpen(false)}
          onApplied={(message) => {
            setRenameOpen(false);
            setNote({ kind: "success", text: message });
            reload();
          }}
        />
      )}

      {editingItem && (
        <GradableEditorModal
          courseUrl={courseUrl}
          acronym={acronym}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={reload}
        />
      )}

      {filePreview && (
        <FilePreviewModal
          selectedPreview={filePreview.file}
          previewBlobUrl={filePreview.blobUrl}
          onClose={closeFilePreview}
        />
      )}

      {editingFile && (
        <OfficeEditorModal
          courseUrl={courseUrl}
          acronym={acronym}
          item={editingFile}
          onClose={() => setEditingFile(null)}
          onSaved={() => setNote({ kind: "success", text: "Saved to Canvas." })}
        />
      )}
    </div>
  );
}

// ── Pages list ─────────────────────────────────────────────────────────────---

function PagesView({
  pages,
  onNewPage,
  onEditPage,
}: {
  pages: CanvasPageSummary[];
  onNewPage: () => void;
  onEditPage: (pageUrl: string) => void;
}) {
  return (
    <div className={styles.form}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <p className={styles.fieldHint} style={{ margin: 0 }}>
          {pages.length} page{pages.length === 1 ? "" : "s"}
        </p>
        <button type="button" className={styles.downloadButton} onClick={onNewPage}>
          New page
        </button>
      </div>

      {pages.length === 0 && <p className={styles.emptyState}>This course has no pages yet.</p>}

      {pages.map((p) => (
        <div key={p.url} className={styles.syllabusSectionCard}>
          <div className={styles.syllabusSectionTopRow}>
            <h3 className={styles.lessonSlideTitle}>{p.title}</h3>
            <button type="button" className={styles.downloadButton} onClick={() => onEditPage(p.url)}>
              Edit
            </button>
          </div>
          <p className={styles.fieldHint}>
            {[p.published ? "Published" : "Unpublished", p.updatedAt ? `Updated ${formatWhen(p.updatedAt)}` : ""]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Bulk edit ─────────────────────────────────────────────────────────────────

function BulkEditView({ courseUrl, acronym }: { courseUrl: string; acronym?: string }) {
  const [kind, setKind] = useState<BulkKind>("Assignment");
  const [items, setItems] = useState<BulkItem[]>([]);
  const [loadState, setLoadState] = useState<{ status: "idle" | "loading" | "error"; message: string }>({
    status: "loading",
    message: "",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [rubrics, setRubrics] = useState<CanvasRubric[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [shiftDays, setShiftDays] = useState(7);
  const [points, setPoints] = useState("");
  const [rubricId, setRubricId] = useState<number | "">("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset to a loading state during render when the kind changes (no effect setState).
  const [prevKind, setPrevKind] = useState(kind);
  if (kind !== prevKind) {
    setPrevKind(kind);
    setItems([]);
    setSelected(new Set());
    setLoadState({ status: "loading", message: "" });
    setConfirmDelete(false);
  }

  // Load items for the current kind (await-first so no synchronous setState).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listBulkItemsAction(courseUrl, kind, acronym);
      if (cancelled) return;
      if ("error" in result) {
        setLoadState({ status: "error", message: result.error });
        return;
      }
      setItems(result.items);
      setLoadState({ status: "idle", message: "" });
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, courseUrl, acronym]);

  // Load the course's rubrics once (for the assignment rubric association).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listRubricsAction(courseUrl, acronym);
      if (cancelled || "error" in result) return;
      setRubrics(result.rubrics);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseUrl, acronym]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? items.filter((it) => it.title.toLowerCase().includes(term)) : items;
  }, [items, search]);

  const allSelected = visible.length > 0 && visible.every((it) => selected.has(it.id));
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) for (const it of visible) next.delete(it.id);
      else for (const it of visible) next.add(it.id);
      return next;
    });
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const reloadItems = async () => {
    setLoadState({ status: "loading", message: "" });
    const result = await listBulkItemsAction(courseUrl, kind, acronym);
    if ("error" in result) {
      setLoadState({ status: "error", message: result.error });
      return;
    }
    setItems(result.items);
    setSelected(new Set());
    setLoadState({ status: "idle", message: "" });
  };

  const ids = () => [...selected];

  const runOp = async (
    fn: () => Promise<{ updated: number; failures: unknown[] } | { error: string }>,
    label: string
  ) => {
    if (selected.size === 0) return;
    setBusy(true);
    setNote(null);
    const result = await fn();
    setBusy(false);
    if ("error" in result) {
      setNote({ kind: "error", text: result.error });
      return;
    }
    setNote({
      kind: result.failures.length ? "error" : "success",
      text: `${label}: ${result.updated} updated${result.failures.length ? `, ${result.failures.length} failed` : ""}.`,
    });
    await reloadItems();
  };

  const setDue = () => {
    if (!dueDate || Number.isNaN(new Date(dueDate).getTime())) {
      setNote({ kind: "error", text: "Pick a valid due date first." });
      return;
    }
    const iso = new Date(dueDate).toISOString();
    void runOp(
      () => setModuleDueDatesAction(courseUrl, ids().map((id) => ({ type: kind, contentId: Number(id), dueAt: iso })), acronym),
      "Due date set"
    );
  };

  const shiftDue = () => {
    const updates = items
      .filter((it) => selected.has(it.id) && it.dueAt)
      .map((it) => {
        const d = new Date(it.dueAt!);
        d.setDate(d.getDate() + shiftDays);
        return { type: kind, contentId: Number(it.id), dueAt: d.toISOString() };
      });
    if (updates.length === 0) {
      setNote({ kind: "error", text: "No selected items have a due date to shift." });
      return;
    }
    void runOp(() => setModuleDueDatesAction(courseUrl, updates, acronym), "Due dates shifted");
  };

  const setPts = () => {
    const p = Number(points);
    if (points.trim() === "" || !Number.isFinite(p)) {
      setNote({ kind: "error", text: "Enter a points value." });
      return;
    }
    void runOp(() => bulkUpdateAction(courseUrl, kind, ids(), { pointsPossible: p }, acronym), "Points set");
  };

  const associate = () => {
    if (rubricId === "") {
      setNote({ kind: "error", text: "Pick a rubric first." });
      return;
    }
    void runOp(() => bulkAssociateRubricAction(courseUrl, Number(rubricId), ids(), acronym), "Rubric associated");
  };

  const remove = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setConfirmDelete(false);
    void runOp(() => bulkDeleteAction(courseUrl, kind, ids(), acronym), "Deleted");
  };

  const showDue = kind !== "Page";
  const showPoints = kind === "Assignment" || kind === "Quiz";
  const showRubric = kind === "Assignment";

  return (
    <div className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="bulk-kind">Edit which items</label>
        <select
          id="bulk-kind"
          className={styles.textInput}
          style={{ maxWidth: 240 }}
          value={kind}
          onChange={(e) => setKind(e.target.value as BulkKind)}
        >
          <option value="Assignment">Assignments</option>
          <option value="Quiz">Quizzes</option>
          <option value="Discussion">Discussions</option>
          <option value="Page">Pages</option>
        </select>
      </div>

      <input
        type="search"
        className={styles.textInput}
        placeholder="Search by title"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loadState.status === "loading" && (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <p className={styles.loadingTitle}>Loading…</p>
          </div>
        </div>
      )}
      {loadState.status === "error" && <p className={styles.error}>{loadState.message}</p>}
      {loadState.status === "idle" && visible.length === 0 && (
        <p className={styles.emptyState}>No items found.</p>
      )}

      {loadState.status === "idle" && visible.length > 0 && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, margin: 0 }}>
              <input type="checkbox" checked={allSelected} onChange={toggleAll} /> Select all ({visible.length})
            </label>
            <span className={styles.fieldHint} style={{ margin: 0 }}>
              {selected.size} selected
            </span>
          </div>

          <div
            style={{
              border: "1px solid var(--field-border)",
              borderRadius: 10,
              overflow: "hidden",
              maxHeight: "44vh",
              overflowY: "auto",
            }}
          >
            {visible.map((it, i) => (
              <label
                key={it.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  borderTop: i === 0 ? "none" : "1px solid var(--field-border)",
                  cursor: "pointer",
                }}
              >
                <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} />
                <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{it.title}</span>
                <span
                  className={styles.fieldHint}
                  style={{ margin: 0, color: it.published ? "#15803d" : "#92400e" }}
                >
                  {it.published ? "Published" : "Unpublished"}
                </span>
                {it.dueAt && (
                  <span className={styles.fieldHint} style={{ margin: 0 }}>
                    {formatWhen(it.dueAt)}
                  </span>
                )}
                {it.pointsPossible != null && (
                  <span className={styles.fieldHint} style={{ margin: 0 }}>
                    {it.pointsPossible} pts
                  </span>
                )}
              </label>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "center",
              paddingTop: 12,
              borderTop: "1px solid var(--field-border)",
            }}
          >
            <button
              type="button"
              className={styles.downloadButton}
              disabled={busy || selected.size === 0}
              onClick={() => void runOp(() => bulkUpdateAction(courseUrl, kind, ids(), { published: true }, acronym), "Published")}
            >
              Publish
            </button>
            <button
              type="button"
              className={styles.downloadButton}
              disabled={busy || selected.size === 0}
              onClick={() => void runOp(() => bulkUpdateAction(courseUrl, kind, ids(), { published: false }, acronym), "Unpublished")}
            >
              Unpublish
            </button>

            {showDue && (
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input
                  type="datetime-local"
                  className={styles.textInput}
                  style={{ width: 200 }}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
                <button type="button" className={styles.downloadButton} disabled={busy || selected.size === 0} onClick={setDue}>
                  Set due
                </button>
              </span>
            )}
            {showDue && (
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input
                  type="number"
                  className={styles.textInput}
                  style={{ width: 76 }}
                  value={shiftDays}
                  onChange={(e) => setShiftDays(Number(e.target.value))}
                  aria-label="Days to shift"
                />
                <button type="button" className={styles.downloadButton} disabled={busy || selected.size === 0} onClick={shiftDue}>
                  Shift days
                </button>
              </span>
            )}
            {showPoints && (
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input
                  type="number"
                  className={styles.textInput}
                  style={{ width: 90 }}
                  placeholder="points"
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  aria-label="Points possible"
                />
                <button type="button" className={styles.downloadButton} disabled={busy || selected.size === 0} onClick={setPts}>
                  Set points
                </button>
              </span>
            )}
            {showRubric && (
              <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <select
                  className={styles.textInput}
                  style={{ maxWidth: 200 }}
                  value={rubricId}
                  disabled={rubrics.length === 0}
                  onChange={(e) => setRubricId(e.target.value === "" ? "" : Number(e.target.value))}
                  aria-label="Rubric"
                >
                  <option value="">{rubrics.length === 0 ? "No rubrics" : "Rubric…"}</option>
                  {rubrics.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.downloadButton}
                  disabled={busy || selected.size === 0 || rubricId === ""}
                  onClick={associate}
                >
                  Associate
                </button>
              </span>
            )}
            <button
              type="button"
              className={styles.clearFileButton}
              disabled={busy || selected.size === 0}
              onClick={remove}
              style={{ color: "#b91c1c", borderColor: "#fecaca" }}
            >
              {confirmDelete ? "Confirm delete" : "Delete"}
            </button>
          </div>

          {note && <p className={note.kind === "error" ? styles.error : styles.fieldHint}>{note.text}</p>}
        </>
      )}
    </div>
  );
}

// ── Tab shell ───────────────────────────────────────────────────────────────-

type ContentView = "modules" | "pages" | "bulk";

export default function ContentTab() {
  const { active: activeInstitution } = useInstitutionSelection();
  const [provider] = useLlmProvider();

  const [courseUrl, setCourseUrl] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem(CONTENT_URL_KEY) ?? "" : ""
  );
  const [courseName, setCourseName] = useState("");
  const [modules, setModules] = useState<CanvasModule[]>([]);
  const [pages, setPages] = useState<CanvasPageSummary[]>([]);
  // Addable content (assignments/quizzes/discussions/files) for the item picker,
  // loaded lazily the first time the user adds a non-page item.
  const [targets, setTargets] = useState<CanvasAddableContent | null>(null);
  const [targetsState, setTargetsState] = useState<"idle" | "loading" | "error">("idle");
  const [loadState, setLoadState] = useState<LoadState>(() => {
    if (typeof window === "undefined") return { status: "idle", message: "" };
    const url = localStorage.getItem(CONTENT_URL_KEY) ?? "";
    return { status: parseCanvasCourseId(url) && activeInstitution ? "loading" : "idle", message: "" };
  });
  const [note, setNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [view, setViewState] = useState<ContentView>(() => {
    if (typeof window === "undefined") return "modules";
    const saved = localStorage.getItem(VIEW_KEY);
    return saved === "pages" || saved === "bulk" ? saved : "modules";
  });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorPageUrl, setEditorPageUrl] = useState<string | null>(null);

  const setView = (next: ContentView) => {
    setViewState(next);
    if (typeof window !== "undefined") localStorage.setItem(VIEW_KEY, next);
  };

  // Reset to a clean slate during render when the institution changes — the
  // loaded content belonged to the previous school.
  const [prevInstitution, setPrevInstitution] = useState(activeInstitution);
  if (activeInstitution !== prevInstitution) {
    setPrevInstitution(activeInstitution);
    setModules([]);
    setPages([]);
    setTargets(null);
    setTargetsState("idle");
    setCourseName("");
    setCourseUrl("");
    setExpanded(new Set());
    setLoadState({ status: "idle", message: "" });
    setNote(null);
    setEditorOpen(false);
  }

  const loadContent = async (url: string) => {
    const id = parseCanvasCourseId(url);
    if (!id) return;
    if (typeof window !== "undefined") localStorage.setItem(CONTENT_URL_KEY, url);
    setLoadState({ status: "loading", message: "" });
    setNote(null);
    // Addable content belongs to this course; clear it so it reloads on demand.
    setTargets(null);
    setTargetsState("idle");
    const result = await listCourseContentAction(url, activeInstitution || undefined);
    if ("error" in result) {
      setModules([]);
      setPages([]);
      setCourseName("");
      setLoadState({ status: "error", message: result.error });
      return;
    }
    setCourseName(result.courseName);
    setModules(result.modules);
    setPages(result.pages);
    setLoadState({ status: "idle", message: "" });
  };

  // Auto-load the remembered course on mount (await-first so no sync setState).
  useEffect(() => {
    const url = typeof window !== "undefined" ? localStorage.getItem(CONTENT_URL_KEY) ?? "" : "";
    if (!parseCanvasCourseId(url) || !activeInstitution) return;
    let cancelled = false;
    (async () => {
      const result = await listCourseContentAction(url, activeInstitution || undefined);
      if (cancelled) return;
      if ("error" in result) {
        setLoadState({ status: "error", message: result.error });
        return;
      }
      setCourseName(result.courseName);
      setModules(result.modules);
      setPages(result.pages);
      setLoadState({ status: "idle", message: "" });
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only: switching institutions clears the course via the reset above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectCourse = (url: string) => {
    setCourseUrl(url);
    setLoadState({ status: "idle", message: "" });
    void loadContent(url);
  };

  const reload = () => {
    if (courseUrl) void loadContent(courseUrl);
  };

  // Lazily fetch the assignments/quizzes/discussions/files for the item picker
  // the first time they're needed (or after a failed attempt is retried).
  const ensureTargets = async () => {
    if (targets || targetsState === "loading") return;
    setTargetsState("loading");
    const result = await listAddableContentAction(courseUrl, activeInstitution || undefined);
    if ("error" in result) {
      setTargetsState("error");
      return;
    }
    setTargets(result.content);
    setTargetsState("idle");
  };

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openEditor = (pageUrl: string | null) => {
    setEditorPageUrl(pageUrl);
    setEditorOpen(true);
  };

  const courseId = parseCanvasCourseId(courseUrl);
  const loaded = useMemo(() => loadState.status === "idle" && !!courseId, [loadState.status, courseId]);

  return (
    <div className={styles.card}>
      <header className={styles.header}>
        <span className={styles.eyebrow}>Course Content</span>
        <h1>Modules & Pages</h1>
        <p>
          Edit a Canvas course&apos;s module structure and page content without leaving the teaching
          assistant. Changes are staged here and only written to Canvas when you save.
        </p>
      </header>

      <div className={styles.field}>
        <label>Institution</label>
        <InstitutionSwitcher />
      </div>

      <CoursePicker
        activeInstitution={activeInstitution}
        courseUrl={courseUrl}
        onCourseUrlChange={(url) => {
          setCourseUrl(url);
          setLoadState({ status: "idle", message: "" });
        }}
        onSelect={handleSelectCourse}
        loading={loadState.status === "loading"}
        loadLabel="Load content"
        loadError={loadState.status === "error" ? loadState.message : null}
        courseName={courseName}
      />

      {loadState.status === "loading" && (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <p className={styles.loadingTitle}>Loading course content…</p>
          </div>
        </div>
      )}

      {loaded && (
        <>
          <div className={styles.resultsHeader}>
            <h2>{courseName || "Course content"}</h2>
            <button
              type="button"
              className={styles.downloadButton}
              onClick={reload}
              disabled={busy || loadState.status === "loading"}
            >
              Refresh
            </button>
          </div>

          {note && <p className={note.kind === "error" ? styles.error : styles.fieldHint}>{note.text}</p>}

          <div className={styles.lessonInnerTabs}>
            <button
              type="button"
              className={`${styles.lessonInnerTab} ${view === "modules" ? styles.lessonInnerTabActive : ""}`}
              onClick={() => setView("modules")}
            >
              Modules
            </button>
            <button
              type="button"
              className={`${styles.lessonInnerTab} ${view === "pages" ? styles.lessonInnerTabActive : ""}`}
              onClick={() => setView("pages")}
            >
              Pages
            </button>
            <button
              type="button"
              className={`${styles.lessonInnerTab} ${view === "bulk" ? styles.lessonInnerTabActive : ""}`}
              onClick={() => setView("bulk")}
            >
              Bulk edit
            </button>
          </div>

          {view === "modules" ? (
            <ModulesView
              courseUrl={courseUrl}
              acronym={activeInstitution || undefined}
              modules={modules}
              pages={pages}
              targets={targets}
              targetsState={targetsState}
              ensureTargets={() => void ensureTargets()}
              busy={busy}
              expanded={expanded}
              onToggleExpand={toggleExpand}
              onEditPage={(pageUrl) => openEditor(pageUrl)}
              setModules={setModules}
              reload={reload}
              setNote={setNote}
              setBusy={setBusy}
            />
          ) : view === "pages" ? (
            <PagesView pages={pages} onNewPage={() => openEditor(null)} onEditPage={(pageUrl) => openEditor(pageUrl)} />
          ) : (
            <BulkEditView courseUrl={courseUrl} acronym={activeInstitution || undefined} />
          )}
        </>
      )}

      {editorOpen && courseId && (
        <PageEditorModal
          courseUrl={courseUrl}
          acronym={activeInstitution || undefined}
          provider={provider}
          pageUrl={editorPageUrl}
          onClose={() => setEditorOpen(false)}
          onSaved={reload}
        />
      )}
    </div>
  );
}
