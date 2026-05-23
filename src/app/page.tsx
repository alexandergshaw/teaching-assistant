"use client";

import { useActionState } from "react";
import { gradeAction, type GradeActionState } from "./actions";
import styles from "./page.module.css";

const initialState: GradeActionState = { run: null, error: null };

function escapeCsvCell(value: string): string {
  const sanitized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return `"${sanitized.replace(/"/g, '""')}"`;
}

function buildCsvContent(state: GradeActionState): string {
  if (!state.run) {
    return "";
  }

  const header = ["Student"];

  for (const area of state.run.rubricAreaNames) {
    header.push(`${area} Score`);
    header.push(`${area} Comment`);
  }

  header.push("Total Score");
  header.push("Overall Comment");

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
    rows.push(row.map((cell) => escapeCsvCell(cell)).join(","));
  }

  return rows.join("\n");
}

export default function Home() {
  const [state, formAction, pending] = useActionState(gradeAction, initialState);
  const run = state.run;

  const handleExportCsv = () => {
    if (!state.run) {
      return;
    }

    const csvContent = buildCsvContent(state);
    if (!csvContent) {
      return;
    }

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

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.header}>
          <p className={styles.eyebrow}>Teaching Assistant</p>
          <h1>Prepare a grading run</h1>
          <p>
            Add the student submissions and the grading context needed to review
            an assignment.
          </p>
        </div>

        <form className={styles.form} action={formAction}>
          <div className={styles.field}>
            <label htmlFor="student-submissions">student submissions</label>
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
            <label htmlFor="assignment-instructions">
              assignment instructions
            </label>
            <textarea
              id="assignment-instructions"
              name="assignmentInstructions"
              rows={10}
              placeholder="Paste the assignment brief, requirements, and any special directions."
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="rubric">rubric</label>
            <textarea
              id="rubric"
              name="rubric"
              rows={10}
              placeholder="Paste the grading rubric, expectations, and scoring guidance."
            />
          </div>

          {state.error && (
            <p role="alert" className={styles.error}>
              {state.error}
            </p>
          )}

          <button className={styles.submitButton} type="submit" disabled={pending}>
            {pending ? "Grading…" : "Start review"}
          </button>
        </form>

        {run && run.results.length === 0 && (
          <p className={styles.emptyState}>
            No text-based submissions found in the zip archive.
          </p>
        )}

        {run && run.results.length > 0 && (
          <section className={styles.results}>
            <div className={styles.resultsHeader}>
              <h2>Grading results</h2>
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
                    <th>Student</th>
                    {run.rubricAreaNames.map((area) => (
                      <th key={area}>{area}</th>
                    ))}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {run.results.map((result) => {
                    const areaMap = new Map(
                      result.rubricAreas.map((area) => [area.area, area])
                    );

                    return (
                      <tr key={`${result.student}-matrix`}>
                        <td>{result.student}</td>
                        {run.rubricAreaNames.map((areaName) => (
                          <td key={`${result.student}-${areaName}`}>
                            {areaMap.get(areaName)?.score || "-"}
                          </td>
                        ))}
                        <td>{result.totalScore || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {run.results.map((result) => (
              <div key={result.student} className={styles.result}>
                <h3>{result.student}</h3>
                <pre className={styles.feedback}>{result.feedback}</pre>
              </div>
            ))}
          </section>
        )}
      </section>
    </main>
  );
}
