"use client";

import Button from "@mui/material/Button";
import { parseGeneratedRubric } from "../utils/rubric";
import type { LlmProvider } from "@/lib/llm";
import styles from "../page.module.css";

type Props = {
  provider: LlmProvider;
  rubricStatus: "idle" | "loading" | "done" | "error";
  rubricError: string | null;
  generatedRubric: string | null;
  rubricCopied: boolean;
  onGenerate: () => void;
  onCopy: () => void;
  onDownloadCsv: () => void;
};

// Extracted from LecturePlanningTab.tsx to keep that file under this
// project's 1000-line cap. Also carries three audit fixes local to this
// block:
// - D3: the table could push the whole page sideways (two `nowrap` columns,
//   no scroll container). Now wrapped in the app's existing
//   `.courseScheduleWrap` (page.module.css), the same idiom the course
//   schedule table already uses elsewhere.
// - A3: header cells need `scope="col"`; the criterion cell is the row's
//   identity and needs `scope="row"`, not a plain `<td>`. The visual style
//   that used to come from `.generatedRubricTable td:first-child` now comes
//   from `.generatedRubricTable th[scope="row"]` (page.module.css) - added
//   alongside, not replacing, the old rule (which is now simply unused
//   rather than risking anything else that might reference it).
// - A6: the error paragraph needs `role="alert"` - `.error`'s only styling
//   is `color`, so colour alone was the sole signal something went wrong.
export default function LecturePlanningRubricSection({
  provider,
  rubricStatus,
  rubricError,
  generatedRubric,
  rubricCopied,
  onGenerate,
  onCopy,
  onDownloadCsv,
}: Props) {
  return (
    <div style={{ borderTop: "1px solid var(--field-border)", marginTop: 32, paddingTop: 28 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: "0 0 6px", fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)" }}>
          Course-Wide Rubric
        </h2>
        <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--text-secondary)" }}>
          {provider === "other"
            ? "The grading rubric is produced together with the lecture package above — generate it there and it will appear here. It can be copied and pasted into the Grading tab."
            : "Generate a universal grading rubric derived from all assignment instructions in the uploaded zip. This rubric can be copied and pasted into the Grading tab."}
        </p>
      </div>

      {rubricError && (
        <p className={styles.error} role="alert">
          {rubricError}
        </p>
      )}

      {provider !== "other" && (
        <>
          <Button
            variant="contained"
            size="small"
            onClick={onGenerate}
            disabled={rubricStatus === "loading"}
            sx={{ marginBottom: 2 }}
          >
            {rubricStatus === "loading" ? "Generating Rubric…" : "Generate Course Rubric"}
          </Button>
          {rubricStatus === "loading" && (
            <p aria-live="polite" style={{ margin: "0 0 12px", fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              This can take a few minutes for a large course. Keep this tab open — closing it or navigating away
              cancels the request.
            </p>
          )}
        </>
      )}

      {rubricStatus === "done" && generatedRubric && (() => {
        const rows = parseGeneratedRubric(generatedRubric);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <span style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--text-primary)" }}>
                Generated rubric — applies to all assignments
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="outlined" size="small" onClick={onCopy}>
                  {rubricCopied ? "Copied!" : "Copy Rubric"}
                </Button>
                <Button variant="outlined" size="small" onClick={onDownloadCsv}>
                  Download CSV
                </Button>
              </div>
            </div>
            {rows ? (
              <div className={styles.courseScheduleWrap}>
                <table className={styles.generatedRubricTable}>
                  <thead>
                    <tr>
                      <th scope="col">Criterion</th>
                      <th scope="col">Weight</th>
                      <th scope="col">Performance Levels</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.area}>
                        <th scope="row">{row.area}</th>
                        <td>{row.weight.endsWith("%") ? row.weight : `${row.weight}%`}</td>
                        <td>
                          {row.subcategories.length > 0 ? (
                            <ul className={styles.rubricSubcategoryList}>
                              {row.subcategories.map((sub) => (
                                <li key={sub.label}><strong>{sub.label}:</strong> {sub.description}</li>
                              ))}
                            </ul>
                          ) : row.description}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <pre className={styles.generatedRubricBody}>{generatedRubric}</pre>
            )}
          </div>
        );
      })()}
    </div>
  );
}
