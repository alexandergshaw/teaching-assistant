"use client";

// One task: done checkbox, inline edit, and a two-step delete. Edit fields are
// transient (they mirror a saved row), so they are not persisted.

import { useState } from "react";
import {
  NOTES_MAX,
  TITLE_MAX,
  validateNotes,
  validateTaskTitle,
  type OneOffTask,
  type TaskPatch,
} from "./one-off-task-model";
import styles from "./OneOffTasks.module.css";

const UNASSIGNED_VALUE = "__unassigned__";

export default function TaskRow({
  task,
  institutions,
  onToggleDone,
  onUpdate,
  onRemove,
}: {
  task: OneOffTask;
  institutions: string[];
  onToggleDone: (id: string, done: boolean) => Promise<boolean>;
  onUpdate: (id: string, patch: TaskPatch) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [college, setCollege] = useState<string>(task.college ?? UNASSIGNED_VALUE);
  const [notes, setNotes] = useState(task.notes);
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [problem, setProblem] = useState<string | null>(null);

  const startEdit = () => {
    setTitle(task.title);
    setCollege(task.college ?? UNASSIGNED_VALUE);
    setNotes(task.notes);
    setDueDate(task.dueDate ?? "");
    setProblem(null);
    setEditing(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const checkedTitle = validateTaskTitle(title);
    if (!checkedTitle.ok) {
      setProblem(
        checkedTitle.reason === "blank"
          ? "A task needs a title."
          : `Titles are limited to ${TITLE_MAX} characters.`
      );
      return;
    }
    const checkedNotes = validateNotes(notes);
    if (!checkedNotes.ok) {
      setProblem(`Notes are limited to ${NOTES_MAX} characters.`);
      return;
    }
    setEditing(false);
    await onUpdate(task.id, {
      title: checkedTitle.title,
      college: college === UNASSIGNED_VALUE ? null : college,
      notes: checkedNotes.notes,
      dueDate: dueDate === "" ? null : dueDate,
    });
  };

  if (editing) {
    // A college no longer in the registry must stay selectable for this row.
    const options =
      task.college !== null && !institutions.includes(task.college)
        ? [...institutions, task.college]
        : institutions;
    return (
      <li className={styles.row}>
        <form className={styles.editForm} onSubmit={save} aria-label="Edit task">
          <div className={styles.composerGrid}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor={`edit-title-${task.id}`}>
                Task
              </label>
              <input
                id={`edit-title-${task.id}`}
                className={styles.input}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor={`edit-college-${task.id}`}>
                College
              </label>
              <select
                id={`edit-college-${task.id}`}
                className={styles.select}
                value={college}
                onChange={(e) => setCollege(e.target.value)}
              >
                {options.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
                <option value={UNASSIGNED_VALUE}>Unassigned</option>
              </select>
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel} htmlFor={`edit-due-${task.id}`}>
                Due date
              </label>
              <input
                id={`edit-due-${task.id}`}
                className={styles.input}
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel} htmlFor={`edit-notes-${task.id}`}>
              Notes
            </label>
            <textarea
              id={`edit-notes-${task.id}`}
              className={styles.textarea}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {problem ? (
            <p className={styles.errorText} role="alert">
              {problem}
            </p>
          ) : null}
          <div className={styles.actions}>
            <button type="submit" className={`${styles.button} ${styles.buttonPrimary}`}>
              Save
            </button>
            <button type="button" className={styles.button} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className={styles.row}>
      <input
        type="checkbox"
        className={styles.checkbox}
        checked={task.done}
        aria-label={`Mark "${task.title}" ${task.done ? "not done" : "done"}`}
        onChange={(e) => void onToggleDone(task.id, e.target.checked)}
      />
      <div className={styles.rowBody}>
        <span className={`${styles.rowTitle}${task.done ? ` ${styles.rowTitleDone}` : ""}`}>
          {task.title}
        </span>
        {task.dueDate ? <span className={styles.rowMeta}>Due {task.dueDate}</span> : null}
        {task.notes ? <p className={styles.rowNotes}>{task.notes}</p> : null}
      </div>
      <div className={styles.rowActions}>
        {confirming ? (
          <>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonDanger}`}
              onClick={() => void onRemove(task.id)}
            >
              Confirm delete
            </button>
            <button type="button" className={styles.button} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" className={styles.button} onClick={startEdit}>
              Edit
            </button>
            <button type="button" className={styles.button} onClick={() => setConfirming(true)}>
              Delete
            </button>
          </>
        )}
      </div>
    </li>
  );
}
