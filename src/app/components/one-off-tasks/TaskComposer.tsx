"use client";

// Add-a-task form. Title is required; college defaults to the active
// institution from the shared registry. The in-progress draft persists under
// ta-one-off-draft so a reload does not lose it.

import { useEffect, useState } from "react";
import { useInstitutionSelection } from "@/lib/institutions";
import {
  NOTES_MAX,
  TITLE_MAX,
  validateNotes,
  validateTaskTitle,
  type NewTaskInput,
} from "./one-off-task-model";
import styles from "./OneOffTasks.module.css";

const DRAFT_KEY = "ta-one-off-draft";
const UNASSIGNED_VALUE = "__unassigned__";

interface Draft {
  title: string;
  /** undefined = follow the active institution; "" = Unassigned. */
  college: string | undefined;
  notes: string;
  dueDate: string;
}

const EMPTY_DRAFT: Draft = { title: "", college: undefined, notes: "", dueDate: "" };

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const p = parsed as Record<string, unknown>;
    return {
      title: typeof p.title === "string" ? p.title : "",
      college: typeof p.college === "string" ? p.college : undefined,
      notes: typeof p.notes === "string" ? p.notes : "",
      dueDate: typeof p.dueDate === "string" ? p.dueDate : "",
    };
  } catch {
    return null;
  }
}

function writeDraft(draft: Draft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Storage unavailable: the draft still works for this session.
  }
}

export default function TaskComposer({
  onAdd,
}: {
  onAdd: (input: NewTaskInput) => Promise<boolean>;
}) {
  const { institutions, active } = useInstitutionSelection();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const saved = readDraft();
      if (saved) setDraft(saved);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const change = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    writeDraft(next);
    setProblem(null);
  };

  const effectiveCollege = draft.college ?? active;
  const selectValue = effectiveCollege === "" ? UNASSIGNED_VALUE : effectiveCollege;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const title = validateTaskTitle(draft.title);
    if (!title.ok) {
      setProblem(
        title.reason === "blank"
          ? "Enter a title for the task."
          : `Titles are limited to ${TITLE_MAX} characters.`
      );
      return;
    }
    const notes = validateNotes(draft.notes);
    if (!notes.ok) {
      setProblem(`Notes are limited to ${NOTES_MAX} characters.`);
      return;
    }
    setSaving(true);
    const ok = await onAdd({
      title: title.title,
      college: effectiveCollege === "" ? null : effectiveCollege,
      notes: notes.notes,
      dueDate: draft.dueDate === "" ? null : draft.dueDate,
    });
    setSaving(false);
    if (ok) {
      const cleared: Draft = { ...EMPTY_DRAFT, college: draft.college };
      setDraft(cleared);
      writeDraft(cleared);
    }
  };

  return (
    <form className={styles.panel} onSubmit={submit} aria-label="Add a task">
      <div className={styles.composerGrid}>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="one-off-new-title">
            Task
          </label>
          <input
            id="one-off-new-title"
            className={styles.input}
            type="text"
            value={draft.title}
            placeholder="What needs doing?"
            onChange={(e) => change({ title: e.target.value })}
          />
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="one-off-new-college">
            College
          </label>
          <select
            id="one-off-new-college"
            className={styles.select}
            value={selectValue}
            onChange={(e) =>
              change({ college: e.target.value === UNASSIGNED_VALUE ? "" : e.target.value })
            }
          >
            {institutions.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
            <option value={UNASSIGNED_VALUE}>Unassigned</option>
          </select>
        </div>
        <div className={styles.fieldGroup}>
          <label className={styles.fieldLabel} htmlFor="one-off-new-due">
            Due date
          </label>
          <input
            id="one-off-new-due"
            className={styles.input}
            type="date"
            value={draft.dueDate}
            onChange={(e) => change({ dueDate: e.target.value })}
          />
        </div>
      </div>
      <div className={styles.fieldGroup}>
        <label className={styles.fieldLabel} htmlFor="one-off-new-notes">
          Notes
        </label>
        <textarea
          id="one-off-new-notes"
          className={styles.textarea}
          rows={2}
          value={draft.notes}
          onChange={(e) => change({ notes: e.target.value })}
        />
      </div>
      {problem ? (
        <p className={styles.errorText} role="alert">
          {problem}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button
          type="submit"
          className={`${styles.button} ${styles.buttonPrimary}`}
          disabled={saving}
        >
          {saving ? "Adding..." : "Add task"}
        </button>
      </div>
    </form>
  );
}
