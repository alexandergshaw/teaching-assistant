"use client";

import { useActionState } from "react";
import { gradeAction, type GradeActionState } from "./actions";
import styles from "./page.module.css";

const initialState: GradeActionState = { run: null, error: null };

export default function Home() {
  const [state, formAction, pending] = useActionState(gradeAction, initialState);

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

        {state.run && state.run.results.length === 0 && (
          <p className={styles.emptyState}>
            No text-based submissions found in the zip archive.
          </p>
        )}

        {state.run && state.run.results.length > 0 && (
          <section className={styles.results}>
            <h2>Grading results</h2>
            {state.run.results.map((result) => (
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
