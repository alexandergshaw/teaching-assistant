"use client";

import { useEffect, useMemo, useState } from "react";
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
  revisePageWithAiAction,
} from "../actions";
import CoursePicker from "./CoursePicker";
import InstitutionSwitcher from "./InstitutionSwitcher";
import type {
  CanvasModule,
  CanvasModuleItem,
  CanvasPageSummary,
  CanvasAddableContent,
  NewModuleItem,
  DueDateUpdate,
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
  // Per-module "add item" controls: chosen type, the selected content (page slug
  // or content id), and the external-url / header-text inputs.
  const [addType, setAddType] = useState<Record<number, string>>({});
  const [addValue, setAddValue] = useState<Record<number, string>>({});
  const [addUrl, setAddUrl] = useState<Record<number, string>>({});
  const [addTitle, setAddTitle] = useState<Record<number, string>>({});

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
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          className={styles.downloadButton}
          onClick={() => setScheduleOpen(true)}
          disabled={busy || modules.length === 0}
        >
          Schedule due dates
        </button>
      </div>

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
        return (
          <div key={m.id} className={styles.syllabusSectionCard}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      flexWrap: "wrap",
                      marginLeft: it.indent * 18,
                      padding: "4px 0",
                      borderTop: ii === 0 ? "none" : "1px solid var(--field-border)",
                    }}
                  >
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

// ── Tab shell ───────────────────────────────────────────────────────────────-

type ContentView = "modules" | "pages";

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
  const [view, setViewState] = useState<ContentView>(() =>
    typeof window !== "undefined" && localStorage.getItem(VIEW_KEY) === "pages" ? "pages" : "modules"
  );
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
          ) : (
            <PagesView pages={pages} onNewPage={() => openEditor(null)} onEditPage={(pageUrl) => openEditor(pageUrl)} />
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
