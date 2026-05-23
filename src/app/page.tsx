"use client";

import type { ChangeEvent } from "react";
import { useActionState, useEffect, useRef, useState } from "react";
import { gradeAction, type GradeActionState } from "./actions";
import styles from "./page.module.css";

const initialState: GradeActionState = { run: null, error: null };
const STORAGE_KEYS = {
  assignmentInstructions: "ta.assignmentInstructions",
  rubric: "ta.rubric",
  fileName: "ta.studentSubmissions.fileName",
  fileType: "ta.studentSubmissions.fileType",
  fileData: "ta.studentSubmissions.fileData",
};

function readSessionItem(key: string): string {
  if (typeof window === "undefined") {
    return "";
  }

  return sessionStorage.getItem(key) ?? "";
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

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
  const [assignmentInstructions, setAssignmentInstructions] = useState(() =>
    readSessionItem(STORAGE_KEYS.assignmentInstructions)
  );
  const [rubric, setRubric] = useState(() => readSessionItem(STORAGE_KEYS.rubric));
  const [storedFileName, setStoredFileName] = useState<string | null>(() => {
    const saved = readSessionItem(STORAGE_KEYS.fileName);
    return saved || null;
  });
  const [fileStorageError, setFileStorageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const run = state.run;

  useEffect(() => {
    const savedFileName = sessionStorage.getItem(STORAGE_KEYS.fileName);
    const savedFileType = sessionStorage.getItem(STORAGE_KEYS.fileType) ?? "application/zip";
    const savedFileData = sessionStorage.getItem(STORAGE_KEYS.fileData);

    if (!savedFileName || !savedFileData || !fileInputRef.current) {
      return;
    }

    try {
      const restoredBytes = fromBase64(savedFileData);
      const restoredBuffer = new ArrayBuffer(restoredBytes.byteLength);
      new Uint8Array(restoredBuffer).set(restoredBytes);

      const restoredFile = new File([restoredBuffer], savedFileName, {
        type: savedFileType,
      });
      const transfer = new DataTransfer();
      transfer.items.add(restoredFile);
      fileInputRef.current.files = transfer.files;
    } catch {
      sessionStorage.removeItem(STORAGE_KEYS.fileName);
      sessionStorage.removeItem(STORAGE_KEYS.fileType);
      sessionStorage.removeItem(STORAGE_KEYS.fileData);
    }
  }, []);

  const handleAssignmentInstructionsChange = (
    event: ChangeEvent<HTMLTextAreaElement>
  ) => {
    const next = event.target.value;
    setAssignmentInstructions(next);
    sessionStorage.setItem(STORAGE_KEYS.assignmentInstructions, next);
  };

  const handleRubricChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value;
    setRubric(next);
    sessionStorage.setItem(STORAGE_KEYS.rubric, next);
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      setStoredFileName(null);
      setFileStorageError(null);
      sessionStorage.removeItem(STORAGE_KEYS.fileName);
      sessionStorage.removeItem(STORAGE_KEYS.fileType);
      sessionStorage.removeItem(STORAGE_KEYS.fileData);
      return;
    }

    try {
      const fileBuffer = await file.arrayBuffer();
      const encoded = toBase64(fileBuffer);
      sessionStorage.setItem(STORAGE_KEYS.fileName, file.name);
      sessionStorage.setItem(STORAGE_KEYS.fileType, file.type || "application/zip");
      sessionStorage.setItem(STORAGE_KEYS.fileData, encoded);
      setStoredFileName(file.name);
      setFileStorageError(null);
    } catch {
      setFileStorageError(
        "Could not keep this upload in session storage. You can still submit now, but refresh may require re-uploading the zip."
      );
    }
  };

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
          {pending && (
            <div className={styles.loadingState} role="status" aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              <div>
                <p className={styles.loadingTitle}>Grading in progress</p>
                <p className={styles.loadingText}>
                  Reviewing submissions now. This can take a moment for larger archives.
                </p>
              </div>
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="student-submissions">student submissions</label>
            <div className={styles.fileField}>
              <input
                ref={fileInputRef}
                id="student-submissions"
                name="studentSubmissions"
                type="file"
                accept=".zip,application/zip"
                onChange={handleFileChange}
              />
              <p>Upload a zip archive that contains the student submissions.</p>
              {storedFileName && <p>Restored upload: {storedFileName}</p>}
              {fileStorageError && <p role="alert">{fileStorageError}</p>}
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
              value={assignmentInstructions}
              onChange={handleAssignmentInstructionsChange}
              placeholder="Paste the assignment brief, requirements, and any special directions."
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="rubric">rubric</label>
            <textarea
              id="rubric"
              name="rubric"
              rows={10}
              value={rubric}
              onChange={handleRubricChange}
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
            No supported submission files were found in the zip archive.
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
