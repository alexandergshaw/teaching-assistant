"use client";

import { useMemo } from "react";
import { parseGeneratedRubric } from "@/app/utils/rubric";
import styles from "../page.module.css";

export default function RubricPreviewModal({
  name,
  rubric,
  onClose,
}: {
  name: string;
  rubric: string;
  onClose: () => void;
}) {
  const rows = useMemo(() => parseGeneratedRubric(rubric), [rubric]);

  const criteriaCount = rows?.length ?? 0;
  const metaLabel =
    criteriaCount === 0
      ? "Rubric"
      : criteriaCount === 1
        ? "1 criterion"
        : `${criteriaCount} criteria`;

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
            <p className={styles.previewMeta}>{metaLabel}</p>
          </div>
          <button type="button" className={styles.previewCloseButton} onClick={onClose}>
            Close
          </button>
        </div>
        <div className={styles.previewContent} style={{ overflow: "auto" }}>
          {rows && rows.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85em" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--border-soft)" }}>
                  <th
                    style={{
                      padding: "8px",
                      textAlign: "left",
                      fontWeight: 600,
                      backgroundColor: "var(--surface-subtle)",
                    }}
                  >
                    Criterion
                  </th>
                  <th
                    style={{
                      padding: "8px",
                      textAlign: "left",
                      fontWeight: 600,
                      backgroundColor: "var(--surface-subtle)",
                    }}
                  >
                    Weight
                  </th>
                  <th
                    style={{
                      padding: "8px",
                      textAlign: "left",
                      fontWeight: 600,
                      backgroundColor: "var(--surface-subtle)",
                    }}
                  >
                    Description
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid var(--border-soft)" }}>
                    <td style={{ padding: "8px", fontWeight: 500 }}>{row.area}</td>
                    <td style={{ padding: "8px" }}>{row.weight}</td>
                    <td style={{ padding: "8px" }}>
                      <div>{row.description}</div>
                      {row.subcategories && row.subcategories.length > 0 && (
                        <ul style={{ margin: "6px 0 0 0", paddingLeft: "20px", fontSize: "0.9em" }}>
                          {row.subcategories.map((sub, j) => (
                            <li key={j}>
                              <strong>{sub.label}:</strong> {sub.description}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <pre style={{ whiteSpace: "pre-wrap", wordWrap: "break-word" }}>
              {rubric}
            </pre>
          )}
        </div>
      </section>
    </div>
  );
}
