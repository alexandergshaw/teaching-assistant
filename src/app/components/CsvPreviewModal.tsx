"use client";

import { useMemo } from "react";
import { parseCsvRows } from "@/lib/csv";
import styles from "../page.module.css";

// Cap on rendered body rows so a large upload cannot mount an unbounded table.
const MAX_BODY_ROWS = 500;

export default function CsvPreviewModal({
  name,
  csv,
  onClose,
}: {
  name: string;
  csv: string;
  onClose: () => void;
}) {
  const nonEmptyRows = useMemo(
    () => parseCsvRows(csv).filter((row) => row.some((cell) => cell.trim())),
    [csv]
  );
  const dataRowCount = Math.max(0, nonEmptyRows.length - 1);
  const bodyRows = nonEmptyRows.slice(1, MAX_BODY_ROWS + 1);
  const truncated = dataRowCount > MAX_BODY_ROWS;

  return (
    <div className={styles.previewBackdrop} onClick={onClose}>
      <section
        className={styles.previewModal}
        role="dialog"
        aria-modal="true"
        aria-label={`Preview of ${name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.previewHeader}>
          <div>
            <h3>{name}</h3>
            <p className={styles.previewMeta}>
              {dataRowCount} row{dataRowCount !== 1 ? "s" : ""}
              {truncated ? ` - showing the first ${MAX_BODY_ROWS}` : ""}
            </p>
          </div>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Close
          </button>
        </div>
        <div className={styles.previewContent} style={{ overflow: "auto" }}>
          {nonEmptyRows.length === 0 ? (
            <p className={styles.previewMeta}>This schedule is empty.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85em" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border-soft)" }}>
                  {nonEmptyRows[0].map((cell, j) => (
                    <th
                      key={j}
                      style={{
                        padding: "8px",
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
                      <td key={j} style={{ padding: "8px", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {cell.trim()}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
