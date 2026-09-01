"use client";

import { useMemo, type RefObject } from "react";
import { parseGeneratedRubric } from "@/app/utils/rubric";
import styles from "../page.module.css";
import { ModalShell } from "./ui/ModalShell";

export default function RubricPreviewModal({
  name,
  rubric,
  onEditDocument,
  onClose,
  restoreFocusRef,
  fallbackFocusRefs,
}: {
  name: string;
  rubric: string;
  /** Opens the shared document window on this text (edit + ask-AI). */
  onEditDocument?: () => void;
  onClose: () => void;
  /** The opener to return focus to on close, forwarded to ModalShell. */
  restoreFocusRef?: RefObject<HTMLElement | null>;
  /** Ordered fallbacks tried after `restoreFocusRef`. */
  fallbackFocusRefs?: readonly RefObject<HTMLElement | null>[];
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
    <ModalShell
      label={`Preview of ${name}`}
      onDismiss={onClose}
      restoreFocusRef={restoreFocusRef}
      fallbackFocusRefs={fallbackFocusRefs}
    >
        <div className={styles.previewHeader}>
          <div>
            <h3>{name}</h3>
            <p className={styles.previewMeta}>{metaLabel}</p>
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
          {rows && rows.length > 0 ? (
            // fontSize left as 0.85em / 0.9em below (AM14): this table sits inside
            // .previewContent, already --font-size-sm (13px, below the
            // --font-size-md default), so an em-relative size here is not
            // eligible for the auto nearest-token conversion - reported per
            // AM14 rather than guessed.
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85em" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border-soft)" }}>
                  <th
                    style={{
                      padding: "var(--space-2)",
                      textAlign: "left",
                      fontWeight: 600,
                      backgroundColor: "var(--surface-subtle)",
                    }}
                  >
                    Criterion
                  </th>
                  <th
                    style={{
                      padding: "var(--space-2)",
                      textAlign: "left",
                      fontWeight: 600,
                      backgroundColor: "var(--surface-subtle)",
                    }}
                  >
                    Weight
                  </th>
                  <th
                    style={{
                      padding: "var(--space-2)",
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
                    <td style={{ padding: "var(--space-2)", fontWeight: 500 }}>{row.area}</td>
                    <td style={{ padding: "var(--space-2)" }}>{row.weight}</td>
                    <td style={{ padding: "var(--space-2)" }}>
                      <div>{row.description}</div>
                      {row.subcategories && row.subcategories.length > 0 && (
                        <ul style={{ margin: "var(--space-1) 0 0 0", paddingLeft: "var(--space-5)", fontSize: "0.9em" }}>
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
    </ModalShell>
  );
}
