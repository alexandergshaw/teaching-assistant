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
    <div style={{ borderTop: "1px solid var(--border-soft)", marginTop: "var(--space-8)", paddingTop: "var(--space-6)" }}>
      <div style={{ marginBottom: "var(--space-4)" }}>
        <h2 style={{ margin: "0 0 var(--space-1)", fontSize: "var(--font-size-xl)", fontWeight: 700, color: "var(--text-primary)" }}>
          Course-Wide Rubric
        </h2>
        <p style={{ margin: 0, fontSize: "var(--font-size-md)", color: "var(--text-secondary)" }}>
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
            <div className={styles.loadingState} role="status" aria-live="polite">
              <div className={styles.spinner} />
              <div>
                <p className={styles.loadingTitle}>Generating Rubric…</p>
                <p className={styles.loadingText}>
                  This can take a few minutes for a large course. Keep this tab open — closing it or navigating
                  away cancels the request.
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {rubricStatus === "done" && generatedRubric && (() => {
        const rows = parseGeneratedRubric(generatedRubric);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-2)" }}>
              <span style={{ fontWeight: 600, fontSize: "var(--font-size-md)", color: "var(--text-primary)" }}>
                Generated rubric — applies to all assignments
              </span>
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
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
