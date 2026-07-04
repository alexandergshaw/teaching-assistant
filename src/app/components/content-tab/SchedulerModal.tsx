"use client";

import { useState } from "react";
import { setModuleDueDatesAction } from "../../actions";
import type { CanvasModule, CanvasModuleItem, DueDateUpdate } from "@/lib/canvas-modules";
import styles from "../../page.module.css";

// ── Due-date scheduler ───────────────────────────────────────────────────────

const SCHEDULABLE_TYPES = new Set(["Assignment", "Quiz", "Discussion"]);

/** Items in a module that can carry a due date (gradable, with a content id). */
function schedulableItems(m: CanvasModule): CanvasModuleItem[] {
  return m.items.filter((it) => SCHEDULABLE_TYPES.has(it.type) && typeof it.contentId === "number");
}

export function SchedulerModal({
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
