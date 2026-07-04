"use client";

import { useState } from "react";
import { updateModuleAction } from "../../actions";
import type { CanvasModule } from "@/lib/canvas-modules";
import styles from "../../page.module.css";

// ── Rename modules (find / replace) ───────────────────────────────────────────

export function RenameModulesModal({
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
