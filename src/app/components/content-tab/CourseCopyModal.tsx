"use client";

import { useEffect, useState } from "react";
import {
  bulkDeleteAction,
  createCourseCopyAction,
  deleteCourseFileAction,
  deleteModuleAction,
  getMigrationStateAction,
  getSelectiveDataAction,
  listBulkItemsAction,
  listCourseContentAction,
  listCourseFilesAction,
  listCoursesAction,
  selectCopyTypesAction,
  submitSelectiveImportAction,
} from "../../actions";
import type { BulkKind, SelectiveNode } from "@/lib/canvas-modules";
import { COURSE_COPY_TYPES } from "@/lib/canvas-modules";
import { Button, Checkbox, FormControlLabel, IconButton, MenuItem, TextField } from "@mui/material";
import styles from "../../page.module.css";

// ── Course copy / import ──────────────────────────────────────────────────────

// Content types that can be purged from a course before a copy. Each maps to the
// delete routine used in purgeDestination below.
const PURGE_TYPES: Array<{ key: string; label: string }> = [
  { key: "context_modules", label: "Modules" },
  { key: "assignments", label: "Assignments" },
  { key: "quizzes", label: "Quizzes" },
  { key: "discussion_topics", label: "Discussions" },
  { key: "wiki_pages", label: "Pages" },
  { key: "attachments", label: "Files" },
];

export function CourseCopyModal({
  mode,
  courseUrl,
  currentCourseId,
  acronym,
  onClose,
  onDone,
}: {
  mode: "export" | "import";
  courseUrl: string;
  currentCourseId: string;
  acronym?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const isExport = mode === "export";
  const [courses, setCourses] = useState<Array<{ id: string; name: string }>>([]);
  const [coursesState, setCoursesState] = useState<"loading" | "ready" | "error">(acronym ? "loading" : "ready");
  const [selectedCourses, setSelectedCourses] = useState<Set<string>>(new Set());
  const [granularity, setGranularity] = useState<"all" | "types" | "items">("all");
  const [types, setTypes] = useState<Set<string>>(() => new Set(COURSE_COPY_TYPES.map((t) => t.key)));
  const [phase, setPhase] = useState<"setup" | "selecting" | "done">("setup");
  const [running, setRunning] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nodes, setNodes] = useState<SelectiveNode[]>([]);
  const [props, setProps] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [migration, setMigration] = useState<{ id: number; destId: string } | null>(null);
  // Optional "clear the destination first": which content types to delete and an
  // explicit confirmation (destructive, so gated behind both).
  const [purgeEnabled, setPurgeEnabled] = useState(false);
  const [purgeTypes, setPurgeTypes] = useState<Set<string>>(new Set());
  const [purgeConfirm, setPurgeConfirm] = useState(false);
  const purgeBlocked = purgeEnabled && (purgeTypes.size === 0 || !purgeConfirm);

  useEffect(() => {
    if (!acronym) return;
    let cancelled = false;
    (async () => {
      const r = await listCoursesAction(acronym);
      if (cancelled) return;
      if ("error" in r) {
        setError(r.error);
        setCoursesState("error");
        return;
      }
      setCourses(r.courses.filter((c) => c.id !== currentCourseId));
      setCoursesState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [acronym, currentCourseId]);

  const toggleIn = (set: Set<string>, key: string) => {
    const n = new Set(set);
    if (n.has(key)) n.delete(key);
    else n.add(key);
    return n;
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // A course URL for some other course in this institution: the current URL with
  // its course id swapped out, so the existing course actions target it.
  const destUrlFor = (destCourseId: string) => courseUrl.replace(/\/courses\/\d+/, `/courses/${destCourseId}`);

  // Delete the chosen content types from one course before a copy runs. Best
  // effort: it lists each type's items and removes them; failures are skipped.
  const purgeDestination = async (destCourseId: string): Promise<void> => {
    const destUrl = destUrlFor(destCourseId);
    if (purgeTypes.has("context_modules")) {
      const content = await listCourseContentAction(destUrl, acronym);
      if (!("error" in content)) {
        for (const mod of content.modules) await deleteModuleAction(destUrl, mod.id, acronym);
      }
    }
    const kindMap: Array<[string, BulkKind]> = [
      ["assignments", "Assignment"],
      ["quizzes", "Quiz"],
      ["discussion_topics", "Discussion"],
      ["wiki_pages", "Page"],
    ];
    for (const [type, kind] of kindMap) {
      if (!purgeTypes.has(type)) continue;
      const list = await listBulkItemsAction(destUrl, kind, acronym);
      if (!("error" in list) && list.items.length > 0) {
        await bulkDeleteAction(destUrl, kind, list.items.map((i) => i.id), acronym);
      }
    }
    if (purgeTypes.has("attachments")) {
      const files = await listCourseFilesAction(destUrl, acronym);
      if (!("error" in files)) {
        for (const f of files.files) await deleteCourseFileAction(destUrl, f.id, acronym);
      }
    }
  };

  // Create the migration; for selective copies, poll until Canvas is ready to
  // accept a selection. Returns the migration id + destination, or null on error.
  const startMigration = async (selective: boolean, otherCourseId: string): Promise<{ id: number; destId: string } | null> => {
    const destId = isExport ? otherCourseId : currentCourseId;
    const sourceId = isExport ? currentCourseId : otherCourseId;
    setStatusText("Starting the copy in Canvas…");
    const created = await createCourseCopyAction(courseUrl, destId, sourceId, selective, acronym);
    if ("error" in created) {
      setError(created.error);
      return null;
    }
    if (!selective) return { id: created.migrationId, destId };
    setStatusText("Preparing the content selection…");
    for (let i = 0; i < 25; i++) {
      await sleep(1500);
      const st = await getMigrationStateAction(courseUrl, destId, created.migrationId, acronym);
      if ("error" in st) {
        setError(st.error);
        return null;
      }
      if (st.state === "waiting_for_select") return { id: created.migrationId, destId };
      if (st.state === "failed") {
        setError("Canvas could not prepare the copy.");
        return null;
      }
    }
    setError("Timed out preparing the copy. It may still be working in Canvas — try again shortly.");
    return null;
  };

  const start = async () => {
    const ids = [...selectedCourses];
    if (ids.length === 0) {
      setError("Choose at least one course.");
      return;
    }

    // Specific-item selection is interactive: prepare ONE migration to load the
    // selectable list, then (for export) the chosen items are submitted to every
    // selected course in submitItems. Importing draws items from a single source.
    if (granularity === "items") {
      if (!isExport && ids.length > 1) {
        setError("Pick a single course to import specific items from.");
        return;
      }
      setRunning(true);
      setError(null);
      const m = await startMigration(true, ids[0]);
      if (!m) {
        setRunning(false);
        return;
      }
      setStatusText("Loading items…");
      const data = await getSelectiveDataAction(courseUrl, m.destId, m.id, acronym);
      setRunning(false);
      if ("error" in data) {
        setError(data.error);
        return;
      }
      setNodes(data.nodes);
      setMigration(m);
      setPhase("selecting");
      setStatusText("");
      return;
    }

    const chosen = [...types];
    if (granularity === "types" && chosen.length === 0) {
      setError("Choose at least one content type.");
      return;
    }

    setRunning(true);
    setError(null);
    // Import clears the single destination (this course) once up front.
    if (purgeEnabled && !isExport) {
      setStatusText("Clearing this course…");
      await purgeDestination(currentCourseId);
    }
    let ok = 0;
    const failed: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const cid = ids[i];
      const name = courses.find((c) => c.id === cid)?.name ?? cid;
      if (purgeEnabled && isExport) {
        setStatusText(`Clearing ${name}…`);
        await purgeDestination(cid);
      }
      setStatusText(ids.length > 1 ? `Course ${i + 1} of ${ids.length}: ${name}…` : "Working…");
      const m = await startMigration(granularity === "types", cid);
      if (!m) {
        failed.push(name);
        continue;
      }
      if (granularity === "types") {
        const sel = await selectCopyTypesAction(courseUrl, m.destId, m.id, chosen, acronym);
        if ("error" in sel) {
          failed.push(name);
          continue;
        }
      }
      ok += 1;
    }
    setRunning(false);
    setPhase("done");
    setStatusText(
      failed.length === 0
        ? `Started ${ok} cop${ok === 1 ? "y" : "ies"}. Canvas is importing in the background.`
        : `Started ${ok}; failed for ${failed.length} (${failed.join(", ")}).`
    );
  };

  const submitItems = async () => {
    if (!migration) return;
    const chosen = [...props];
    if (chosen.length === 0) {
      setError("Select at least one item.");
      return;
    }
    setRunning(true);
    setError(null);

    // Import: one source into this course (optionally cleared first).
    if (!isExport) {
      if (purgeEnabled) {
        setStatusText("Clearing this course…");
        await purgeDestination(currentCourseId);
      }
      setStatusText("Submitting your selection…");
      const sel = await submitSelectiveImportAction(courseUrl, migration.destId, migration.id, chosen, acronym);
      setRunning(false);
      if ("error" in sel) {
        setError(sel.error);
        return;
      }
      setPhase("done");
      setStatusText("Copy started. Canvas is importing the selected items in the background.");
      return;
    }

    // Export: send the same selected items to every chosen destination. The first
    // already has a prepared migration; the rest get their own.
    const ids = [...selectedCourses];
    let ok = 0;
    const failed: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const cid = ids[i];
      const name = courses.find((c) => c.id === cid)?.name ?? cid;
      if (purgeEnabled) {
        setStatusText(`Clearing ${name}…`);
        await purgeDestination(cid);
      }
      setStatusText(ids.length > 1 ? `Course ${i + 1} of ${ids.length}: ${name}…` : "Submitting your selection…");
      let dest: { id: number; destId: string } | null = cid === migration.destId ? migration : null;
      if (!dest) {
        dest = await startMigration(true, cid);
        if (!dest) {
          failed.push(name);
          continue;
        }
      }
      const sel = await submitSelectiveImportAction(courseUrl, dest.destId, dest.id, chosen, acronym);
      if ("error" in sel) {
        failed.push(name);
        continue;
      }
      ok += 1;
    }
    setRunning(false);
    setPhase("done");
    setStatusText(
      failed.length === 0
        ? `Started ${ok} cop${ok === 1 ? "y" : "ies"} of ${chosen.length} item${chosen.length === 1 ? "" : "s"}. Canvas is importing in the background.`
        : `Started ${ok}; failed for ${failed.length} (${failed.join(", ")}).`
    );
  };

  const renderNode = (node: SelectiveNode, depth: number) => {
    const hasChildren = node.subItems.length > 0;
    const open = expanded.has(node.property);
    return (
      <div key={node.property} style={{ marginLeft: depth * 16 }}>
        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "2px 0" }}>
          {hasChildren ? (
            <IconButton size="small" onClick={() => setExpanded((s) => toggleIn(s, node.property))} aria-label={open ? "Collapse" : "Expand"} sx={{ width: 28, height: 28 }}>
              {open ? "▾" : "▸"}
            </IconButton>
          ) : (
            <span style={{ width: 28, flexShrink: 0 }} />
          )}
          <FormControlLabel
            control={<Checkbox size="small" checked={props.has(node.property)} onChange={() => setProps((s) => toggleIn(s, node.property))} />}
            label={
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {node.title}
                {typeof node.count === "number" && node.count > 0 && <span className={styles.ccCount}>({node.count})</span>}
              </span>
            }
            style={{ margin: 0 }}
          />
        </div>
        {open && hasChildren && node.subItems.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className={styles.previewBackdrop} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.previewModal} style={{ width: "min(640px, 94vw)", maxWidth: "none" }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.previewHeader}>
          <h3>{isExport ? "Copy this course to another" : "Import another course"}</h3>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Close
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "68vh", overflowY: "auto" }}>
          {phase === "done" ? (
            <>
              <p className={styles.fieldHint}>{statusText}</p>
              <Button variant="contained" size="small" style={{ alignSelf: "flex-start" }} onClick={onDone}>
                Done
              </Button>
            </>
          ) : phase === "selecting" ? (
            <>
              <p className={styles.fieldHint} style={{ margin: 0 }}>
                {isExport && selectedCourses.size > 1
                  ? `Choose the items to copy into all ${selectedCourses.size} selected courses.`
                  : "Choose the individual items to copy."}
              </p>
              <div style={{ border: "1px solid var(--card-border)", borderRadius: 10, padding: 10, maxHeight: "44vh", overflowY: "auto" }}>
                {nodes.length === 0 ? <p className={styles.fieldHint}>Canvas returned no selectable items.</p> : nodes.map((n) => renderNode(n, 0))}
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid var(--card-border)" }}>
                <Button variant="contained" size="small" onClick={() => void submitItems()} disabled={running || props.size === 0 || purgeBlocked}>
                  {running
                    ? "Working…"
                    : isExport && selectedCourses.size > 1
                      ? `Copy ${props.size} item${props.size === 1 ? "" : "s"} to ${selectedCourses.size} courses`
                      : `Copy ${props.size} selected`}
                </Button>
                {statusText && <span className={styles.fieldHint} style={{ margin: 0 }}>{statusText}</span>}
              </div>
              {error && <p className={styles.error}>{error}</p>}
            </>
          ) : (
            <>
              <div className={styles.field}>
                <label>{isExport ? "Copy to these courses" : "Import from these courses"}</label>
                {coursesState === "loading" ? (
                  <p className={styles.fieldHint}>Loading courses…</p>
                ) : coursesState === "error" ? (
                  <p className={styles.error}>{error}</p>
                ) : courses.length === 0 ? (
                  <p className={styles.fieldHint}>No other courses on this institution.</p>
                ) : (
                  <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--field-border)", borderRadius: 10, padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
                    {courses.map((c) => (
                      <FormControlLabel
                        key={c.id}
                        control={<Checkbox size="small" checked={selectedCourses.has(c.id)} onChange={() => setSelectedCourses((s) => toggleIn(s, c.id))} disabled={running} />}
                        label={c.name}
                        style={{ margin: 0 }}
                      />
                    ))}
                  </div>
                )}
                <p className={styles.fieldHint} style={{ margin: 0 }}>
                  {selectedCourses.size} selected.{" "}
                  {isExport ? "This course's content is copied into each." : "Each course's content is copied into this one."}
                </p>
              </div>

              <div className={styles.field}>
                <label htmlFor="copy-granularity">What to copy</label>
                <TextField
                  id="copy-granularity"
                  select
                  size="small"
                  fullWidth
                  value={granularity}
                  onChange={(e) => setGranularity(e.target.value as "all" | "types" | "items")}
                  disabled={running}
                >
                  <MenuItem value="all">All content</MenuItem>
                  <MenuItem value="types">Specific content types</MenuItem>
                  <MenuItem value="items" disabled={!isExport && selectedCourses.size > 1}>
                    Specific items{!isExport && selectedCourses.size > 1 ? " (one source only)" : ""}
                  </MenuItem>
                </TextField>
              </div>

              {granularity === "types" && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {COURSE_COPY_TYPES.map((t) => (
                    <FormControlLabel
                      key={t.key}
                      control={<Checkbox size="small" checked={types.has(t.key)} onChange={() => setTypes((s) => toggleIn(s, t.key))} disabled={running} />}
                      label={t.label}
                      style={{ margin: 0, flex: "0 0 140px" }}
                    />
                  ))}
                </div>
              )}

              {granularity === "items" && (
                <p className={styles.fieldHint} style={{ margin: 0 }}>
                  {isExport
                    ? "Canvas prepares the content first; you'll pick the items, then they're copied into every selected course."
                    : "Canvas prepares the course first; you'll then pick the individual items."}
                </p>
              )}

              <div className={styles.field}>
                <FormControlLabel
                  control={<Checkbox size="small" checked={purgeEnabled} onChange={(e) => setPurgeEnabled(e.target.checked)} disabled={running} />}
                  label={isExport ? "Clear destination courses before copying" : "Clear this course before importing"}
                  style={{ margin: 0 }}
                />
                {purgeEnabled && (
                  <>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                      {PURGE_TYPES.map((t) => (
                        <FormControlLabel
                          key={t.key}
                          control={<Checkbox size="small" checked={purgeTypes.has(t.key)} onChange={() => setPurgeTypes((s) => toggleIn(s, t.key))} disabled={running} />}
                          label={t.label}
                          style={{ margin: 0, flex: "0 0 130px" }}
                        />
                      ))}
                    </div>
                    <FormControlLabel
                      control={<Checkbox size="small" checked={purgeConfirm} onChange={(e) => setPurgeConfirm(e.target.checked)} disabled={running} />}
                      label={
                        <span className={styles.fieldHint} style={{ margin: 0, color: "#b91c1c" }}>
                          Permanently delete the checked content from {isExport ? "each destination course" : "this course"}{" "}
                          before copying. This cannot be undone.
                        </span>
                      }
                      style={{ marginTop: 8, alignItems: "flex-start" }}
                    />
                  </>
                )}
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", paddingTop: 8, borderTop: "1px solid var(--card-border)" }}>
                <Button variant="contained" size="small" onClick={() => void start()} disabled={running || selectedCourses.size === 0 || purgeBlocked}>
                  {running
                    ? "Working…"
                    : granularity === "items"
                      ? "Continue"
                      : isExport
                        ? `Copy to ${selectedCourses.size} course${selectedCourses.size === 1 ? "" : "s"}`
                        : "Import to this course"}
                </Button>
                {running && statusText && <span className={styles.fieldHint} style={{ margin: 0 }}>{statusText}</span>}
              </div>
              {error && coursesState !== "error" && <p className={styles.error}>{error}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Files (CRUD on the course's Files area) ───────────────────────────────────

