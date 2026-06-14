"use client";

import type { ChangeEvent } from "react";
import { useMemo, useState } from "react";
import type { GradeActionState, TestGeminiState } from "../actions";
import type { PreviewFile } from "./FilePreviewModal";
import { parseGeneratedRubric } from "../utils/rubric";
import { useLlmProvider } from "@/lib/llm-provider";
import styles from "../page.module.css";

// ── Icons ──────────────────────────────────────────────────────────────────

function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M7 3.5A2.5 2.5 0 0 1 9.5 1h6A2.5 2.5 0 0 1 18 3.5v8A2.5 2.5 0 0 1 15.5 14h-6A2.5 2.5 0 0 1 7 11.5v-8Zm2.5-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-6Z" />
      <path d="M2 7.5A2.5 2.5 0 0 1 4.5 5h.75a.75.75 0 0 1 0 1.5H4.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-.75a.75.75 0 0 1 1.5 0v.75A2.5 2.5 0 0 1 10.5 18h-6A2.5 2.5 0 0 1 2 15.5v-8Z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
      <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
    </svg>
  );
}

// ── Sort helpers ───────────────────────────────────────────────────────────

type SortDirection = "asc" | "desc";

type SortColumn =
  | { kind: "student" }
  | { kind: "files" }
  | { kind: "rubric"; area: string }
  | { kind: "total" }
  | { kind: "overall" };

const DEFAULT_SORT: { column: SortColumn; direction: SortDirection } = {
  column: { kind: "student" },
  direction: "asc",
};

function sortColumnKey(column: SortColumn): string {
  return column.kind === "rubric" ? `rubric:${column.area}` : column.kind;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function parseScoreValue(value: string): number | null {
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0]);
  return Number.isNaN(parsed) ? null : parsed;
}

// ── Grading utilities ──────────────────────────────────────────────────────

function hasDeduction(score: string): boolean {
  const match = score.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return false;
  const earned = Number.parseFloat(match[1]);
  const possible = Number.parseFloat(match[2]);
  return Number.isFinite(earned) && Number.isFinite(possible) && possible > 0 && earned < possible;
}

function formatFeedback(text: string): string {
  return text.replace(/\s*[\u2013\u2014]\s*/g, ", ");
}

function escapeCsvCell(value: string): string {
  const sanitized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return `"${sanitized.replace(/"/g, '""')}"`;
}

function buildCsvContent(state: GradeActionState): string {
  if (!state.run) return "";

  const header = ["Student"];
  for (const area of state.run.rubricAreaNames) {
    header.push(`${area} Score`);
    header.push(`${area} Comment`);
  }
  header.push("Total Score");
  header.push("Overall Comment");
  header.push("Submitted Files");
  header.push("Submitted Extensions");

  const rows = [header.map((cell) => escapeCsvCell(cell)).join(",")];

  for (const result of state.run.results) {
    const row: string[] = [result.student];
    const areaMap = new Map(result.rubricAreas.map((area) => [area.area, area]));
    for (const areaName of state.run.rubricAreaNames) {
      const area = areaMap.get(areaName);
      row.push(area?.score ?? "");
      row.push(area?.comment ?? "");
    }
    row.push(result.totalScore);
    row.push(result.overallComment);
    row.push(result.submittedFiles.map((file) => file.name).join("; "));
    row.push(
      Array.from(new Set(result.submittedFiles.map((file) => file.extension))).join("; ")
    );
    rows.push(row.map((cell) => escapeCsvCell(cell)).join(","));
  }

  return rows.join("\n");
}

// ── Component ──────────────────────────────────────────────────────────────

type GradingTabProps = {
  formAction: (payload: FormData) => void;
  pending: boolean;
  state: GradeActionState;
  testState: TestGeminiState;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => Promise<void>;
  onOpenPreview: (student: string, file: PreviewFile) => void;
};

export default function GradingTab({
  formAction,
  pending,
  state,
  testState,
  copiedKey,
  onCopy,
  onOpenPreview,
}: GradingTabProps) {
  const [selectedProvider] = useLlmProvider();
  const [assignmentInstructions, setAssignmentInstructions] = useState("");
  const [rubric, setRubric] = useState("");
  const [sortState, setSortState] = useState(DEFAULT_SORT);

  const run = state.run;

  const sortedResults = useMemo(() => {
    if (!run) return [];

    const directionMultiplier = sortState.direction === "asc" ? 1 : -1;
    const results = [...run.results];

    results.sort((a, b) => {
      const column = sortState.column;
      let comparison = 0;

      if (column.kind === "student") comparison = compareText(a.student, b.student);
      if (column.kind === "files") {
        comparison = compareText(
          a.submittedFiles.map((f) => f.name).join(", "),
          b.submittedFiles.map((f) => f.name).join(", ")
        );
      }
      if (column.kind === "rubric") {
        const aArea = a.rubricAreas.find((area) => area.area === column.area);
        const bArea = b.rubricAreas.find((area) => area.area === column.area);
        const aNum = parseScoreValue(aArea?.score ?? "");
        const bNum = parseScoreValue(bArea?.score ?? "");
        if (aNum !== null && bNum !== null) {
          comparison = aNum - bNum;
        } else {
          comparison = compareText(aArea?.score ?? "", bArea?.score ?? "");
        }
        if (comparison === 0) comparison = compareText(aArea?.comment ?? "", bArea?.comment ?? "");
      }
      if (column.kind === "total") {
        const aNum = parseScoreValue(a.totalScore);
        const bNum = parseScoreValue(b.totalScore);
        if (aNum !== null && bNum !== null) {
          comparison = aNum - bNum;
        } else {
          comparison = compareText(a.totalScore, b.totalScore);
        }
      }
      if (column.kind === "overall") comparison = compareText(a.overallComment, b.overallComment);
      if (comparison === 0) comparison = compareText(a.student, b.student);

      return comparison * directionMultiplier;
    });

    return results;
  }, [run, sortState]);

  const handleSort = (column: SortColumn) => {
    const nextKey = sortColumnKey(column);
    const currentKey = sortColumnKey(sortState.column);
    if (nextKey === currentKey) {
      setSortState((current) => ({
        ...current,
        direction: current.direction === "asc" ? "desc" : "asc",
      }));
      return;
    }
    setSortState({ column, direction: "asc" });
  };

  const sortLabel = (column: SortColumn) => {
    if (sortColumnKey(column) !== sortColumnKey(sortState.column)) return "↕";
    return sortState.direction === "asc" ? "↑" : "↓";
  };

  const handleDownloadFile = (
    name: string,
    extension: string,
    rawBase64: string,
    mimeType: string
  ) => {
    const byteChars = atob(rawBase64);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteArray], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name.toLowerCase().endsWith(`.${extension.toLowerCase()}`)
      ? name
      : `${name}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const csvContent = buildCsvContent(state);
    if (!csvContent) return;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "grading-results.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleAssignmentInstructionsChange = (e: ChangeEvent<HTMLTextAreaElement>) =>
    setAssignmentInstructions(e.target.value);

  const handleRubricChange = (e: ChangeEvent<HTMLTextAreaElement>) =>
    setRubric(e.target.value);

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h1>Grading</h1>
        <p>
          Add the student submissions and the grading context needed to review
          an assignment.
        </p>
      </div>

      <form className={styles.form} action={formAction}>
        <input type="hidden" name="provider" value={selectedProvider} />
        {pending && (
          <div className={styles.loadingState} role="status" aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            <div>
              <p className={styles.loadingTitle}>Grading In Progress</p>
              <p className={styles.loadingText}>
                Reviewing submissions now. This can take a moment for larger archives.
              </p>
            </div>
          </div>
        )}

        <div className={styles.field}>
          <label htmlFor="student-submissions">Student Submissions</label>
          <div className={styles.fileField}>
            <input
              id="student-submissions"
              name="studentSubmissions"
              type="file"
              accept=".zip,application/zip"
            />
            <p>Upload a zip archive that contains the student submissions.</p>
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="assignment-instructions">Assignment Instructions</label>
          <textarea
            id="assignment-instructions"
            name="assignmentInstructions"
            rows={10}
            value={assignmentInstructions}
            onChange={handleAssignmentInstructionsChange}
            placeholder="Paste the assignment brief, requirements, and any special directions."
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="rubric">Rubric</label>
          <textarea
            id="rubric"
            name="rubric"
            rows={10}
            value={rubric}
            onChange={handleRubricChange}
            placeholder="Paste the grading rubric, expectations, and scoring guidance."
          />
        </div>

        {selectedProvider === "other" && (
          <div className={styles.field}>
            <label htmlFor="rubric-file">Rubric file (CSV/JSON)</label>
            <input
              id="rubric-file"
              name="rubricFile"
              type="file"
              accept=".csv,.json,application/json,text/csv"
            />
            <p>
              Upload a check-based rubric for the deterministic grader (for example the
              rubric.csv produced by Course materials), or paste one in the Rubric box above.
            </p>
          </div>
        )}

        {state.error && (
          <p role="alert" className={styles.error}>
            {state.error}
          </p>
        )}

        <button className={styles.submitButton} type="submit" disabled={pending}>
          {pending ? "Grading..." : "Start Review"}
        </button>
      </form>

      {testState.result && (
        <p style={{ marginTop: "0.5rem", color: "green" }}>Gemini responded: {testState.result}</p>
      )}
      {testState.error && (
        <p style={{ marginTop: "0.5rem", color: "red" }}>Gemini error: {testState.error}</p>
      )}

      {run && run.results.length === 0 && (
        <p className={styles.emptyState}>
          No supported submission files were found in the zip archive.
        </p>
      )}

      {state.generatedRubric && (() => {
        const rows = parseGeneratedRubric(state.generatedRubric);
        return (
          <details className={styles.generatedRubricCard}>
            <summary>Rubric was auto-generated from assignment instructions</summary>
            {rows ? (
              <table className={styles.generatedRubricTable}>
                <thead>
                  <tr>
                    <th>Criterion</th>
                    <th>Weight</th>
                    <th>Performance Levels</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.area}>
                      <td>{row.area}</td>
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
            ) : (
              <pre className={styles.generatedRubricBody}>{state.generatedRubric}</pre>
            )}
          </details>
        );
      })()}

      {state.warnings && state.warnings.length > 0 && (
        <section className={styles.checklistCard}>
          <h2>Grading Notes</h2>
          <ul>
            {state.warnings.map((item, index) => (
              <li key={`grading-warning-${index + 1}`}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {run && run.fullCreditChecklist.length > 0 && (
        <section className={styles.checklistCard}>
          <h2>Full Credit Checklist</h2>
          <ul>
            {run.fullCreditChecklist.map((item, index) => (
              <li key={`full-credit-${index + 1}`}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {run && run.results.length > 0 && (
        <section className={styles.results}>
          <div className={styles.resultsHeader}>
            <h2>Grading Results</h2>
            <button
              className={styles.downloadButton}
              type="button"
              onClick={handleExportCsv}
            >
              Export CSV
            </button>
          </div>

          <div className={styles.matrixWrap}>
            <table className={styles.matrix}>
              <thead>
                <tr>
                  <th>
                    <button
                      type="button"
                      className={styles.sortButton}
                      onClick={() => handleSort({ kind: "student" })}
                    >
                      Student <span>{sortLabel({ kind: "student" })}</span>
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className={styles.sortButton}
                      onClick={() => handleSort({ kind: "files" })}
                    >
                      Files <span>{sortLabel({ kind: "files" })}</span>
                    </button>
                  </th>
                  {run.rubricAreaNames.map((area) => (
                    <th key={area}>
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => handleSort({ kind: "rubric", area })}
                      >
                        {area} <span>{sortLabel({ kind: "rubric", area })}</span>
                      </button>
                    </th>
                  ))}
                  <th>
                    <button
                      type="button"
                      className={styles.sortButton}
                      onClick={() => handleSort({ kind: "total" })}
                    >
                      Total <span>{sortLabel({ kind: "total" })}</span>
                    </button>
                  </th>
                  <th>
                    <button
                      type="button"
                      className={styles.sortButton}
                      onClick={() => handleSort({ kind: "overall" })}
                    >
                      Overall Feedback <span>{sortLabel({ kind: "overall" })}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((result) => {
                  const areaMap = new Map(
                    result.rubricAreas.map((area) => [area.area, area])
                  );

                  return (
                    <tr key={`${result.student}-matrix`}>
                      <td>{result.student}</td>
                      <td>
                        {result.submittedFiles.length > 0 ? (
                          <ul className={styles.matrixFileList}>
                            {result.submittedFiles.map((file) => (
                              <li
                                key={`${result.student}-file-name-${file.name}`}
                                className={styles.matrixFileItem}
                              >
                                <span className={styles.matrixFileName}>
                                  {file.extension && file.extension !== "(none)" && !file.name.toLowerCase().endsWith(`.${file.extension.toLowerCase()}`)
                                    ? `${file.name}.${file.extension}`
                                    : file.name}
                                </span>
                                <div className={styles.fileIconGroup}>
                                  <button
                                    type="button"
                                    className={styles.fileIconButton}
                                    title={`Preview ${file.name}`}
                                    aria-label={`Preview ${file.name}`}
                                    onClick={() =>
                                      onOpenPreview(result.student, {
                                        student: result.student,
                                        name: file.name,
                                        extension: file.extension,
                                        content:
                                          file.previewContent ||
                                          "No extracted text available for this file.",
                                        truncated: file.previewTruncated,
                                        rawBase64: file.rawBase64,
                                        mimeType: file.mimeType,
                                      })
                                    }
                                  >
                                    <EyeIcon />
                                  </button>
                                  {file.rawBase64 && (
                                    <button
                                      type="button"
                                      className={styles.fileIconButton}
                                      title={`Download ${file.name}`}
                                      aria-label={`Download ${file.name}`}
                                      onClick={() =>
                                        handleDownloadFile(
                                          file.name,
                                          file.extension,
                                          file.rawBase64!,
                                          file.mimeType ?? "application/octet-stream"
                                        )
                                      }
                                    >
                                      <DownloadIcon />
                                    </button>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          "-"
                        )}
                      </td>
                      {run.rubricAreaNames.map((areaName) => {
                        const area = areaMap.get(areaName);
                        return (
                          <td key={`${result.student}-${areaName}`}>
                            {area ? (
                              <div className={styles.matrixCellDetail}>
                                <button
                                  type="button"
                                  className={styles.copyIconButton}
                                  title={
                                    copiedKey === `${result.student}-${areaName}-comment`
                                      ? "Copied"
                                      : "Copy Feedback"
                                  }
                                  aria-label={
                                    copiedKey === `${result.student}-${areaName}-comment`
                                      ? "Copied"
                                      : `Copy feedback for ${result.student} - ${areaName}`
                                  }
                                  onClick={() =>
                                    onCopy(
                                      `${result.student}-${areaName}-comment`,
                                      formatFeedback(area.comment || "No feedback provided.")
                                    )
                                  }
                                >
                                  <CopyIcon />
                                </button>
                                <span className={`${styles.scoreBadge}${area && hasDeduction(area.score) ? ` ${styles.scoreBadgeDeducted}` : ""}`}>
                                  Score: {area.score || "-"}
                                </span>
                                <p>{formatFeedback(area.comment || "No feedback provided.")}</p>
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                        );
                      })}
                      <td>{result.totalScore || "-"}</td>
                      <td>
                        <div className={styles.overallFeedbackWrap}>
                          <button
                            type="button"
                            className={styles.copyIconButton}
                            title={
                              copiedKey === `${result.student}-overall-comment`
                                ? "Copied"
                                : "Copy Overall Feedback"
                            }
                            aria-label={
                              copiedKey === `${result.student}-overall-comment`
                                ? "Copied"
                                : `Copy overall feedback for ${result.student}`
                            }
                            onClick={() =>
                              onCopy(
                                `${result.student}-overall-comment`,
                                formatFeedback(result.overallComment || "No overall feedback provided.")
                              )
                            }
                          >
                            <CopyIcon />
                          </button>
                          <p className={styles.overallFeedbackCell}>
                            {formatFeedback(result.overallComment || "No overall feedback provided.")}
                          </p>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
