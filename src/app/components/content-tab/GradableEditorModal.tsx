"use client";

import { useEffect, useState } from "react";
import {
  bulkDeleteAction,
  createGradableAction,
  createModuleItemAction,
  getGradableAction,
  setModuleDueDatesAction,
  updateGradableAction,
} from "../../actions";
import type { BulkKind, CanvasModuleItem, GradableKind } from "@/lib/canvas-modules";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import styles from "../../page.module.css";
import { QuizQuestionsEditor } from "./QuizQuestionsEditor";
import { toLocalInput } from "./utils";
import { HtmlEditor } from "./HtmlEditor";

// ── Gradable editor (description + due date + points) ─────────────────────────

export function GradableEditorModal({
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
  const isQuiz = kind === "Quiz";

  const [loading, setLoading] = useState(item.contentId != null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState("");
  const [due, setDue] = useState(toLocalInput(item.dueAt));
  const [points, setPoints] = useState(item.pointsPossible != null ? String(item.pointsPossible) : "");
  const [submissionType, setSubmissionType] = useState("online_text_entry");
  const [saving, setSaving] = useState(false);
  // Set when a quiz question is saved/deleted, so closing reloads the module list.
  const [questionsChanged, setQuestionsChanged] = useState(false);
  const [note, setNote] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  // Close, reloading the list first if quiz questions changed (the quiz's point
  // total may have moved). Used by the header Close button and the backdrop.
  const closeModal = () => {
    if (questionsChanged) onSaved();
    onClose();
  };
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
      if (kind === "Assignment") {
        setSubmissionType(result.detail.submissionTypes[0] ?? "online_text_entry");
      }
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
    const fields: { title?: string; description?: string; pointsPossible?: number; submissionType?: string } = {
      title: title.trim(),
      description,
    };
    if (showPoints && points.trim() !== "") {
      const p = Number(points);
      if (Number.isFinite(p)) fields.pointsPossible = p;
    }
    if (kind === "Assignment") {
      fields.submissionType = submissionType;
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
    // Re-scan this item's accessibility so its badge updates immediately.
    if (item.contentId != null) {
      window.dispatchEvent(
        new CustomEvent("ta-content-saved", { detail: { type: kind.toLowerCase(), id: String(item.contentId) } })
      );
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
    <div className={styles.previewBackdrop} role="dialog" aria-modal="true" onClick={closeModal}>
      <div
        className={styles.previewModal}
        style={{ width: "min(560px, 94vw)", maxWidth: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.previewHeader}>
          <h3>Edit {kind.toLowerCase()}</h3>
          <button type="button" className={styles.previewCloseButton} onClick={closeModal}>
            Close
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
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
              <TextField
                id="gradable-title"
                type="text"
                size="small"
                fullWidth
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                label="Title"
              />
            </div>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div className={styles.field} style={{ flex: "1 1 220px" }}>
                <TextField
                  id="gradable-due"
                  type="datetime-local"
                  size="small"
                  fullWidth
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  label="Due date"
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                {due && (
                  <Button type="button" size="small" variant="outlined" style={{ alignSelf: "flex-start", marginTop: 6 }} onClick={() => setDue("")}>
                    Clear due date
                  </Button>
                )}
              </div>
              {showPoints && (
                <div className={styles.field} style={{ flex: "0 0 140px" }}>
                  <TextField
                    id="gradable-points"
                    type="number"
                    size="small"
                    fullWidth
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                    label="Points"
                  />
                </div>
              )}
              {kind === "Assignment" && (
                <div className={styles.field} style={{ flex: "0 0 180px" }}>
                  <TextField
                    id="gradable-submission-type"
                    select
                    size="small"
                    fullWidth
                    value={submissionType}
                    onChange={(e) => setSubmissionType(e.target.value)}
                    label="Submission type"
                  >
                    <MenuItem value="online_text_entry">Text entry</MenuItem>
                    <MenuItem value="online_upload">File upload</MenuItem>
                    <MenuItem value="online_url">Website URL</MenuItem>
                    <MenuItem value="on_paper">On paper</MenuItem>
                    <MenuItem value="none">No submission</MenuItem>
                  </TextField>
                </div>
              )}
            </div>

            <div className={styles.field}>
              <label>Description</label>
              <HtmlEditor value={description} onChange={setDescription} minHeight={isQuiz ? 160 : 220} ariaLabel="Description" />
            </div>

            {isQuiz && item.contentId != null && (
              <QuizQuestionsEditor
                courseUrl={courseUrl}
                acronym={acronym}
                quizId={item.contentId}
                onChanged={() => setQuestionsChanged(true)}
              />
            )}

            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <Button variant="contained" size="small" onClick={handleSave} disabled={busy || !title.trim()}>
                {saving ? "Saving…" : "Save to Canvas"}
              </Button>
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
              <TextField
                select
                size="small"
                sx={{ minWidth: 160 }}
                value={targetKind}
                disabled={busy}
                onChange={(e) => {
                  setTargetKind(e.target.value === "" ? "" : (e.target.value as GradableKind));
                  setConfirmChange(false);
                }}
                slotProps={{ htmlInput: { "aria-label": "Change type" } }}
              >
                <MenuItem value="">Choose…</MenuItem>
                {otherKinds.map((k) => (
                  <MenuItem key={k} value={k}>
                    {k}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                type="button"
                variant="outlined"
                size="small"
                onClick={handleChangeType}
                disabled={busy || targetKind === ""}
                sx={{ color: "var(--danger)", borderColor: "var(--danger-border)" }}
              >
                {changing ? "Changing…" : confirmChange ? "Confirm: recreate & delete original" : "Change type"}
              </Button>
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
    </div>
  );
}

// ── Quiz questions editor ─────────────────────────────────────────────────────

