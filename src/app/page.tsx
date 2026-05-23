"use client";

import type { ChangeEvent } from "react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Tab, Tabs } from "@mui/material";
import { gradeAction, testGeminiAction, generateLessonPlanAction, generateAssignmentAction, generateAssignmentRubricAction, type GradeActionState, type TestGeminiState, type GenerateLessonPlanResult, type AssignmentData } from "./actions";
import styles from "./page.module.css";

type PreviewFile = {
  student: string;
  name: string;
  extension: string;
  content: string;
  truncated: boolean;
  rawBase64?: string;
  mimeType?: string;
};

const initialState: GradeActionState = { run: null, error: null };
const initialTestState: TestGeminiState = { result: null, error: null };

type SortDirection = "asc" | "desc";
type ActiveTab = "grading" | "lesson-planning";

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
  if (column.kind === "rubric") {
    return `rubric:${column.area}`;
  }

  return column.kind;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

function parseScoreValue(value: string): number | null {
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[0]);
  return Number.isNaN(parsed) ? null : parsed;
}

function hasDeduction(score: string): boolean {
  const match = score.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/)
  if (!match) return false;
  const earned = Number.parseFloat(match[1]);
  const possible = Number.parseFloat(match[2]);
  return Number.isFinite(earned) && Number.isFinite(possible) && possible > 0 && earned < possible;
}

function formatFeedback(text: string): string {
  return text.replace(/\s*[\u2013\u2014]\s*/g, ", ");
}

type RubricSubcategory = { label: string; description: string };
type RubricRow = { area: string; weight: string; description: string; subcategories: RubricSubcategory[] };

function parseGeneratedRubric(text: string): RubricRow[] | null {
  const lines = text.split("\n");
  const rows: RubricRow[] = [];
  let current: RubricRow | null = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (/^\s/.test(line)) {
      if (!current) continue;
      const subLine = line.trim().replace(/^[-•]\s*/, "");
      const subMatch = subLine.match(/^(.+?)\s*:\s*(.+)$/);
      if (subMatch) {
        current.subcategories.push({ label: subMatch[1].trim(), description: subMatch[2].trim() });
      }
    } else {
      const match = line.trim().match(/^(.+?)\s*\((\d+(?:\.\d+)?\s*%?)\)\s*:\s*(.*)$/);
      if (!match) continue;
      if (current) rows.push(current);
      current = { area: match[1].trim(), weight: match[2].trim(), description: match[3].trim(), subcategories: [] };
    }
  }
  if (current) rows.push(current);
  return rows.length > 0 ? rows : null;
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
      Array.from(new Set(result.submittedFiles.map((file) => file.extension))).join(
        "; "
      )
    );
    rows.push(row.map((cell) => escapeCsvCell(cell)).join(","));
  }

  return rows.join("\n");
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M7 3.5A2.5 2.5 0 0 1 9.5 1h6A2.5 2.5 0 0 1 18 3.5v8A2.5 2.5 0 0 1 15.5 14h-6A2.5 2.5 0 0 1 7 11.5v-8Zm2.5-1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-6Z" />
      <path d="M2 7.5A2.5 2.5 0 0 1 4.5 5h.75a.75.75 0 0 1 0 1.5H4.5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-.75a.75.75 0 0 1 1.5 0v.75A2.5 2.5 0 0 1 10.5 18h-6A2.5 2.5 0 0 1 2 15.5v-8Z" />
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

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
    </svg>
  );
}

export default function Home() {
  const [state, formAction, pending] = useActionState(gradeAction, initialState);
  const [testState, testAction, testPending] = useActionState(testGeminiAction, initialTestState);
  const [assignmentInstructions, setAssignmentInstructions] = useState("");
  const [rubric, setRubric] = useState("");
  const [sortState, setSortState] = useState(DEFAULT_SORT);
  const [activeTab, setActiveTab] = useState<ActiveTab>("grading");
  const [selectedPreview, setSelectedPreview] = useState<PreviewFile | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const [moduleObjectives, setModuleObjectives] = useState("");
  const [lessonContext, setLessonContext] = useState("");
  const [isGeneratingLesson, setIsGeneratingLesson] = useState(false);
  const [lessonError, setLessonError] = useState<string | null>(null);
  const [lessonPlanPreview, setLessonPlanPreview] = useState<GenerateLessonPlanResult | null>(null);
  const [assignmentPreview, setAssignmentPreview] = useState<AssignmentData | null>(null);
  const [previewTab, setPreviewTab] = useState<"slides" | "assignment" | "rubric">("slides");
  const [rubricPreview, setRubricPreview] = useState<string | null>(null);
  const [savedLessonFiles, setSavedLessonFiles] = useState<Array<{ name: string; base64: string; mimeType: string }>>([]);
  const [revisionPrompt, setRevisionPrompt] = useState("");
  const [isRegenerating, setIsRegenerating] = useState(false);
  const lessonContextFileRef = useRef<HTMLInputElement>(null);
  const run = state.run;

  const sortedResults = useMemo(() => {
    if (!run) {
      return [];
    }

    const directionMultiplier = sortState.direction === "asc" ? 1 : -1;
    const results = [...run.results];

    results.sort((a, b) => {
      const column = sortState.column;
      let comparison = 0;

      if (column.kind === "student") {
        comparison = compareText(a.student, b.student);
      }

      if (column.kind === "files") {
        const aFiles = a.submittedFiles.map((file) => file.name).join(", ");
        const bFiles = b.submittedFiles.map((file) => file.name).join(", ");
        comparison = compareText(aFiles, bFiles);
      }

      if (column.kind === "rubric") {
        const aArea = a.rubricAreas.find((area) => area.area === column.area);
        const bArea = b.rubricAreas.find((area) => area.area === column.area);
        const aNumeric = parseScoreValue(aArea?.score ?? "");
        const bNumeric = parseScoreValue(bArea?.score ?? "");

        if (aNumeric !== null && bNumeric !== null) {
          comparison = aNumeric - bNumeric;
        } else {
          comparison = compareText(aArea?.score ?? "", bArea?.score ?? "");
        }

        if (comparison === 0) {
          comparison = compareText(aArea?.comment ?? "", bArea?.comment ?? "");
        }
      }

      if (column.kind === "total") {
        const aNumeric = parseScoreValue(a.totalScore);
        const bNumeric = parseScoreValue(b.totalScore);

        if (aNumeric !== null && bNumeric !== null) {
          comparison = aNumeric - bNumeric;
        } else {
          comparison = compareText(a.totalScore, b.totalScore);
        }
      }

      if (column.kind === "overall") {
        comparison = compareText(a.overallComment, b.overallComment);
      }

      if (comparison === 0) {
        comparison = compareText(a.student, b.student);
      }

      return comparison * directionMultiplier;
    });

    return results;
  }, [run, sortState]);

  const handleDownloadFile = (name: string, extension: string, rawBase64: string, mimeType: string) => {
    const byteChars = atob(rawBase64);
    const byteArray = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) {
      byteArray[i] = byteChars.charCodeAt(i);
    }
    const blob = new Blob([byteArray], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name.toLowerCase().endsWith(`.${extension.toLowerCase()}`) ? name : `${name}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
    const nextKey = sortColumnKey(column);
    const currentKey = sortColumnKey(sortState.column);

    if (nextKey !== currentKey) {
      return "↕";
    }

    return sortState.direction === "asc" ? "↑" : "↓";
  };

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const handleAssignmentInstructionsChange = (
    event: ChangeEvent<HTMLTextAreaElement>
  ) => {
    setAssignmentInstructions(event.target.value);
  };

  const handleRubricChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setRubric(event.target.value);
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

  const handleOpenPreview = (student: string, file: PreviewFile) => {
    setSelectedPreview({ ...file, student });
    if (file.rawBase64 && file.mimeType) {
      const byteChars = atob(file.rawBase64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteArray], { type: file.mimeType });
      setPreviewBlobUrl(URL.createObjectURL(blob));
    } else {
      setPreviewBlobUrl(null);
    }
  };

  const handleClosePreview = () => {
    setSelectedPreview(null);
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
  };

  const handleGenerateLesson = async () => {
    if (!moduleObjectives.trim()) {
      setLessonError("Please enter module objectives before generating.");
      return;
    }
    setIsGeneratingLesson(true);
    setLessonError(null);
    try {
      const fileList = lessonContextFileRef.current?.files;
      const files: Array<{ name: string; base64: string; mimeType: string }> = [];
      if (fileList) {
        for (const file of Array.from(fileList)) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result.split(",")[1] ?? "");
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          files.push({ name: file.name, base64, mimeType: file.type || "application/octet-stream" });
        }
      }

      setSavedLessonFiles(files);

      const [slideResult, assignmentResult, rubricResult] = await Promise.all([
        generateLessonPlanAction(moduleObjectives, lessonContext, files),
        generateAssignmentAction(moduleObjectives, lessonContext, files),
        generateAssignmentRubricAction(moduleObjectives, lessonContext),
      ]);

      if ("error" in slideResult) {
        setLessonError(slideResult.error);
        return;
      }

      setLessonPlanPreview(slideResult);
      setAssignmentPreview("error" in assignmentResult ? null : assignmentResult);
      setRubricPreview(typeof rubricResult === "string" ? rubricResult : null);
      setPreviewTab("slides");
      setRevisionPrompt("");
    } catch (err) {
      setLessonError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setIsGeneratingLesson(false);
    }
  };

  const handleRegenerateLesson = async () => {
    if (!lessonPlanPreview) return;
    setIsRegenerating(true);
    setLessonError(null);
    try {
      const result = await generateLessonPlanAction(
        moduleObjectives,
        lessonContext,
        savedLessonFiles,
        revisionPrompt.trim() || undefined,
        lessonPlanPreview.slides
      );
      if ("error" in result) {
        setLessonError(result.error);
        return;
      }
      setLessonPlanPreview(result);
      // assignment is not regenerated on revision — keep existing
      setRevisionPrompt("");
    } catch (err) {
      setLessonError(err instanceof Error ? err.message : "Regeneration failed.");
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleDownloadLessonPlan = async () => {
    if (!lessonPlanPreview) return;
    try {
      const { default: PptxGenJS } = await import("pptxgenjs");
      const prs = new PptxGenJS();
      prs.layout = "LAYOUT_WIDE";

      const titleSlide = prs.addSlide();
      titleSlide.addText(lessonPlanPreview.presentationTitle, {
        x: 0.5, y: 2.2, w: "90%", h: 1.8,
        fontSize: 40, bold: true, align: "center", color: "1a1a2e",
      });

      for (const slide of lessonPlanPreview.slides) {
        const s = prs.addSlide();
        s.addText(slide.title, {
          x: 0.5, y: 0.3, w: "90%", h: 1,
          fontSize: 28, bold: true, color: "1a1a2e",
        });
        if (slide.bullets.length > 0) {
          s.addText(
            slide.bullets.map((b) => ({ text: b, options: { bullet: true, paraSpaceBefore: 8 } })),
            { x: 0.5, y: 1.55, w: "90%", h: 4, fontSize: 18, color: "2d2d2d", valign: "top" }
          );
        }
      }

      const safeName = lessonPlanPreview.presentationTitle.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");
      await prs.writeFile({ fileName: `${safeName}.pptx` });
    } catch (err) {
      setLessonError(err instanceof Error ? err.message : "Download failed.");
    }
  };

  const handleCopy = async (copyKey: string, value: string) => {
    const text = value.trim();
    if (!text) {
      return;
    }

    const copyViaFallback = () => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    };

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        copyViaFallback();
      }
    } catch {
      copyViaFallback();
    }

    setCopiedKey(copyKey);

    if (copyResetTimerRef.current !== null) {
      window.clearTimeout(copyResetTimerRef.current);
    }

    copyResetTimerRef.current = window.setTimeout(() => {
      setCopiedKey(null);
      copyResetTimerRef.current = null;
    }, 1600);
  };

  return (
    <main className={styles.page}>
      <div className={styles.tabContainer}>
        <Tabs
          value={activeTab}
          onChange={(_, v: ActiveTab) => setActiveTab(v)}
          sx={{
            borderBottom: "1px solid var(--field-border)",
            marginBottom: "0",
            "& .MuiTabs-indicator": { backgroundColor: "var(--accent)" },
            "& .MuiTab-root": {
              fontFamily: "inherit",
              fontSize: "0.9rem",
              fontWeight: 500,
              textTransform: "none",
              color: "var(--text-secondary)",
              minHeight: 44,
              padding: "10px 20px",
            },
            "& .Mui-selected": {
              color: "var(--accent) !important",
              fontWeight: 600,
            },
            minHeight: 44,
          }}
        >
          <Tab label="Grading" value="grading" disableRipple />
          <Tab label="Lesson Planning" value="lesson-planning" disableRipple />
        </Tabs>

        {activeTab === "grading" && (
          <section className={styles.card}>
        <div className={styles.header}>
          <h1>Grading</h1>
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
                                        handleOpenPreview(result.student, {
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
                                        onClick={() => handleDownloadFile(file.name, file.extension, file.rawBase64!, file.mimeType ?? "application/octet-stream")}
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
                            <td
                              key={`${result.student}-${areaName}`}
                            >
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
                                      handleCopy(
                                        `${result.student}-${areaName}-comment`,
                                        formatFeedback(area.comment || "No feedback provided.")
                                      )
                                    }
                                  >
                                    <CopyIcon />
                                  </button>
                                  <span className={`${styles.scoreBadge}${area && hasDeduction(area.score) ? ` ${styles.scoreBadgeDeducted}` : ''}`}>
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
                                handleCopy(
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
        )}

        {activeTab === "lesson-planning" && (
          <section className={styles.card}>
            <div className={styles.header}>
              <h1>Lesson Planning</h1>
              <p>Plan and generate lesson content with AI assistance.</p>
            </div>
            <div className={styles.field}>
              <label htmlFor="moduleObjectives">Module Objectives</label>
              <textarea
                id="moduleObjectives"
                placeholder="Describe the learning objectives for this module…"
                style={{ minHeight: "260px" }}
                value={moduleObjectives}
                onChange={(e) => setModuleObjectives(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="lessonContext">Context</label>
              <textarea
                id="lessonContext"
                placeholder="Add any background context, notes, or relevant information…"
                style={{ minHeight: "180px" }}
                value={lessonContext}
                onChange={(e) => setLessonContext(e.target.value)}
              />
              <div className={styles.fileField}>
                <input id="lessonContextFile" type="file" multiple ref={lessonContextFileRef} />
                <p>Optionally attach any files for additional context.</p>
              </div>
            </div>
            {lessonError && <p className={styles.error}>{lessonError}</p>}
            <button
              type="button"
              className={styles.submitButton}
              onClick={handleGenerateLesson}
              disabled={isGeneratingLesson}
            >
              {isGeneratingLesson ? "Generating…" : "Generate"}
            </button>
          </section>
        )}
      </div>

      {lessonPlanPreview && (
        <div className={styles.previewBackdrop} onClick={() => setLessonPlanPreview(null)}>
          <section
            className={styles.lessonPreviewModal}
            role="dialog"
            aria-modal="true"
            aria-label="Lesson plan preview"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.previewHeader}>
              <div>
                <h3>{lessonPlanPreview.presentationTitle}</h3>
                <p className={styles.previewMeta}>
                  {previewTab === "slides"
                    ? `${lessonPlanPreview.slides.length} slides`
                    : previewTab === "assignment"
                      ? (assignmentPreview?.title ?? "Assignment")
                      : "Grading Rubric"}
                </p>
              </div>
              <button
                type="button"
                className={styles.previewCloseButton}
                onClick={() => setLessonPlanPreview(null)}
              >
                Close
              </button>
            </div>

            <div className={styles.lessonInnerTabs}>
              <button
                type="button"
                className={`${styles.lessonInnerTab}${previewTab === "slides" ? ` ${styles.lessonInnerTabActive}` : ""}`}
                onClick={() => setPreviewTab("slides")}
              >
                Slides
              </button>
              <button
                type="button"
                className={`${styles.lessonInnerTab}${previewTab === "assignment" ? ` ${styles.lessonInnerTabActive}` : ""}`}
                onClick={() => setPreviewTab("assignment")}
              >
                Assignment
              </button>
              <button
                type="button"
                className={`${styles.lessonInnerTab}${previewTab === "rubric" ? ` ${styles.lessonInnerTabActive}` : ""}`}
                onClick={() => setPreviewTab("rubric")}
              >
                Rubric
              </button>
            </div>

            {previewTab === "slides" && (
              <ol className={styles.lessonSlideList}>
                {lessonPlanPreview.slides.map((slide, i) => (
                  <li key={i} className={styles.lessonSlideCard}>
                    <span className={styles.lessonSlideNum}>Slide {i + 1}</span>
                    <p className={styles.lessonSlideTitle}>{slide.title}</p>
                    {slide.bullets.length > 0 && (
                      <ul className={styles.lessonSlideBullets}>
                        {slide.bullets.map((b, j) => <li key={j}>{b}</li>)}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}

            {previewTab === "assignment" && (
              <div className={styles.assignmentContent}>
                {assignmentPreview ? (
                  <>
                    <p className={styles.assignmentOverview}>{assignmentPreview.overview}</p>
                    <div className={styles.assignmentSection}>
                      <p className={styles.assignmentSectionLabel}>Steps</p>
                      <ol className={styles.assignmentStepList}>
                        {assignmentPreview.steps.map((step, i) => (
                          <li key={i} className={styles.assignmentStepCard}>
                            <p className={styles.assignmentStepTitle}>{step.stepTitle}</p>
                            <p className={styles.assignmentStepDesc}>{step.description}</p>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className={styles.assignmentSection}>
                      <p className={styles.assignmentSectionLabel}>Free Tools</p>
                      <ul className={styles.assignmentList}>
                        {assignmentPreview.tools.map((t, i) => <li key={i}>{t}</li>)}
                      </ul>
                    </div>
                    <div className={styles.assignmentSection}>
                      <p className={styles.assignmentSectionLabel}>Deliverables</p>
                      <ul className={styles.assignmentList}>
                        {assignmentPreview.deliverables.map((d, i) => <li key={i}>{d}</li>)}
                      </ul>
                    </div>
                  </>
                ) : (
                  <p className={styles.emptyState}>Assignment generation failed — try regenerating.</p>
                )}
              </div>
            )}

            {previewTab === "rubric" && (
              <div className={styles.assignmentContent}>
                {rubricPreview ? (() => {
                  const rows = parseGeneratedRubric(rubricPreview);
                  return rows ? (
                    <table className={styles.generatedRubricTable}>
                      <thead>
                        <tr>
                          <th>Area</th>
                          <th>Weight</th>
                          <th>Performance Levels</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, i) => (
                          <tr key={i}>
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
                    <pre className={styles.generatedRubricBody}>{rubricPreview}</pre>
                  );
                })() : (
                  <p className={styles.emptyState}>Rubric generation failed — try regenerating.</p>
                )}
              </div>
            )}

            <div className={styles.lessonRevisionRow}>
              <textarea
                className={styles.lessonRevisionArea}
                placeholder="Revision instructions — e.g. add a slide on X, make analogies more sports-focused, shorten slide 3…"
                value={revisionPrompt}
                onChange={(e) => setRevisionPrompt(e.target.value)}
                rows={2}
              />
              <button
                type="button"
                className={styles.submitButton}
                onClick={handleRegenerateLesson}
                disabled={isRegenerating}
              >
                {isRegenerating ? "Regenerating…" : "Regenerate"}
              </button>
            </div>

            <div className={styles.lessonPreviewFooter}>
              <button
                type="button"
                className={styles.submitButton}
                onClick={handleDownloadLessonPlan}
              >
                Download PPTX
              </button>
              <button
                type="button"
                className={styles.downloadButton}
                onClick={() => setLessonPlanPreview(null)}
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {selectedPreview && (
        <div className={styles.previewBackdrop} onClick={handleClosePreview}>
          <section
            className={styles.previewModal}
            role="dialog"
            aria-modal="true"
            aria-label={`Preview for ${selectedPreview.name}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.previewHeader}>
              <div>
                <p className={styles.previewMeta}>Student: {selectedPreview.student}</p>
                <h3>{selectedPreview.name}</h3>
                <p className={styles.previewMeta}>Type: {selectedPreview.extension}</p>
              </div>
              <button
                type="button"
                className={styles.previewCloseButton}
                onClick={handleClosePreview}
              >
                Close
              </button>
            </div>
            {previewBlobUrl && selectedPreview.mimeType === "application/pdf" ? (
              <iframe
                src={previewBlobUrl}
                className={styles.previewIframe}
                title={`Preview of ${selectedPreview.name}`}
              />
            ) : previewBlobUrl && selectedPreview.mimeType?.startsWith("image/") ? (
              <div className={styles.previewImageWrap}>
                <img
                  src={previewBlobUrl}
                  alt={`Preview of ${selectedPreview.name}`}
                  className={styles.previewImage}
                />
              </div>
            ) : (
              <>
                {selectedPreview.truncated && (
                  <p className={styles.previewNotice}>
                    Showing a partial preview because the extracted file content is large.
                  </p>
                )}
                <pre className={styles.previewContent}>{selectedPreview.content}</pre>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
