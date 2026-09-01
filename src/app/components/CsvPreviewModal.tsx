"use client";

import { useMemo, type RefObject } from "react";
import { parseCsvRows } from "@/lib/csv";
import styles from "../page.module.css";
import { ModalShell } from "./ui/ModalShell";

// Cap on rendered body rows so a large upload cannot mount an unbounded table.
const MAX_BODY_ROWS = 500;

export default function CsvPreviewModal({
  name,
  csv,
  onEditDocument,
  onClose,
  restoreFocusRef,
  fallbackFocusRefs,
}: {
  name: string;
  csv: string;
  /** Opens the shared document window on this text (edit + ask-AI). */
  onEditDocument?: () => void;
  onClose: () => void;
  /** The opener to return focus to on close, forwarded to ModalShell. */
  restoreFocusRef?: RefObject<HTMLElement | null>;
  /** Ordered fallbacks tried after `restoreFocusRef`. */
  fallbackFocusRefs?: readonly RefObject<HTMLElement | null>[];
}) {
  const nonEmptyRows = useMemo(
    () => parseCsvRows(csv).filter((row) => row.some((cell) => cell.trim())),
    [csv]
  );
  const dataRowCount = Math.max(0, nonEmptyRows.length - 1);
  const bodyRows = nonEmptyRows.slice(1, MAX_BODY_ROWS + 1);
  const truncated = dataRowCount > MAX_BODY_ROWS;

  return (
    <ModalShell
      label={`Preview of ${name}`}
      onDismiss={onClose}
      restoreFocusRef={restoreFocusRef}
      fallbackFocusRefs={fallbackFocusRefs}
    >
        <div className={styles.previewHeader}>
          <div>
            <h3>{name}</h3>
            <p className={styles.previewMeta}>
              {dataRowCount} row{dataRowCount !== 1 ? "s" : ""}
              {truncated ? ` - showing the first ${MAX_BODY_ROWS}` : ""}
            </p>
          </div>
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            {onEditDocument && (
              <button type="button" className={styles.previewCloseButton} onClick={onEditDocument}>
                Edit with AI
              </button>
            )}
            <button type="button" className={styles.previewCloseButton} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
        <div className={styles.previewContent} style={{ overflow: "auto" }}>
          {nonEmptyRows.length === 0 ? (
            <p className={styles.previewMeta}>This schedule is empty.</p>
          ) : (
            // fontSize left as 0.85em (AM14): this table sits inside .previewContent,
            // already --font-size-sm (13px, below the --font-size-md default), so an
            // em-relative size here is not eligible for the auto nearest-token
            // conversion - reported per AM14 rather than guessed.
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85em" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-soft)" }}>
                  {nonEmptyRows[0].map((cell, j) => (
                    <th
                      key={j}
                      style={{
                        padding: "var(--space-2)",
                        textAlign: "left",
                        fontWeight: 600,
                        backgroundColor: "var(--surface-subtle)",
                      }}
                    >
                      {cell.trim()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                    {row.map((cell, j) => (
                      <td key={j} style={{ padding: "var(--space-2)", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {cell.trim()}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
    </ModalShell>
  );
}
