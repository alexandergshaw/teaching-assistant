import styles from "./page.module.css";

export default function Home() {
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

        <form className={styles.form}>
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

          <button className={styles.submitButton} type="submit">
            Start review
          </button>
        </form>
      </section>
    </main>
  );
}
