"use client";

import type { ChangeEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchCanvasMetaAction,
  postCanvasGradesAction,
  listGradingQueueAction,
  type GradeActionState,
  type TestGeminiState,
} from "../actions";
import type { PreviewFile } from "./FilePreviewModal";
import type { CanvasQueueItem } from "@/lib/canvas";
import type { LlmProvider } from "@/lib/llm";
import { parseGeneratedRubric } from "../utils/rubric";
import { useLlmProvider } from "@/lib/llm-provider";
import { useInstitutionSelection, readActiveInstitution } from "@/lib/institutions";
import InstitutionSwitcher from "./InstitutionSwitcher";
import { useInstitutionCounts } from "./InstitutionCounts";
import { detectCanvasUrlKind } from "@/lib/canvas-url";
import styles from "../page.module.css";

type GradingMode = "zip" | "canvas" | "livefeed";

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

// Pull the earned points out of a score string ("8/10" -> "8", "85%" -> "85").
function parseEarnedPoints(total: string): string {
  const fraction = total.match(/(-?\d+(?:\.\d+)?)\s*\/\s*-?\d+/);
  if (fraction) return fraction[1];
  const num = total.match(/-?\d+(?:\.\d+)?/);
  return num ? num[0] : "";
}

function parseScoreValue(value: string): number | null {
  const match = value.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0]);
  return Number.isNaN(parsed) ? null : parsed;
}

// Editable grade, overall comment, and per-criterion scores/comments per student
// (keyed by student name, then by rubric area name).
type AreaEdit = { score: string; comment: string };
type RowEdit = { total: string; overall: string; areas: Record<string, AreaEdit> };

function seedEdits(run: GradeActionState["run"]): Record<string, RowEdit> {
  const seeded: Record<string, RowEdit> = {};
  if (!run) return seeded;
  for (const result of run.results) {
    const areas: Record<string, AreaEdit> = {};
    for (const area of result.rubricAreas) {
      areas[area.area] = { score: area.score, comment: area.comment };
    }
    seeded[result.student] = {
      total: result.totalScore,
      overall: result.overallComment,
      areas,
    };
  }
  return seeded;
}

type PostState = { status: "idle" | "posting" | "posted" | "error"; message?: string };

// ── Grading utilities ──────────────────────────────────────────────────────

function formatFeedback(text: string): string {
  return text.replace(/\s*[–—]\s*/g, ", ");
}

function escapeCsvCell(value: string): string {
  const sanitized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return `"${sanitized.replace(/"/g, '""')}"`;
}

function buildCsvContent(state: GradeActionState, edits: Record<string, RowEdit>): string {
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
    const edit = edits[result.student];
    const row: string[] = [result.student];
    const areaMap = new Map(result.rubricAreas.map((area) => [area.area, area]));
    for (const areaName of state.run.rubricAreaNames) {
      const area = areaMap.get(areaName);
      const areaEdit = edit?.areas?.[areaName];
      row.push(areaEdit?.score ?? area?.score ?? "");
      row.push(areaEdit?.comment ?? area?.comment ?? "");
    }
    row.push(edit?.total ?? result.totalScore);
    row.push(edit?.overall ?? result.overallComment);
    row.push(result.submittedFiles.map((file) => file.name).join("; "));
    row.push(
      Array.from(new Set(result.submittedFiles.map((file) => file.extension))).join("; ")
    );
    rows.push(row.map((cell) => escapeCsvCell(cell)).join(","));
  }

  return rows.join("\n");
}

// ── Live Feed panel ─────────────────────────────────────────────────────────

function LiveFeedPanel({
  provider,
  pending,
  onAutoGrade,
}: {
  provider: LlmProvider;
  pending: boolean;
  onAutoGrade: (row: CanvasQueueItem) => void;
}) {
  const { active } = useInstitutionSelection();
  const { refresh: refreshCounts } = useInstitutionCounts();
  const [rows, setRows] = useState<CanvasQueueItem[]>([]);
  const [queueErrors, setQueueErrors] = useState<Array<{ acronym: string; error: string }>>([]);
  const [queueState, setQueueState] = useState<{
    status: "idle" | "loading" | "error";
    message: string;
  }>(() => ({ status: readActiveInstitution() ? "loading" : "idle", message: "" }));

  // Show the loading screen the instant the institution changes (before the
  // effect's fetch starts), clearing the previous school's rows. This is the
  // React "adjust state during render" pattern, not an effect.
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    setRows([]);
    setQueueErrors([]);
    setQueueState({ status: active ? "loading" : "idle", message: "" });
  }

  const loadQueue = useCallback(async (code: string) => {
    setQueueState({ status: "loading", message: "" });
    const result = await listGradingQueueAction([code]);
    if ("error" in result) {
      setQueueState({ status: "error", message: result.error });
      return;
    }
    setRows(result.rows);
    setQueueErrors(result.errors);
    setQueueState({ status: "idle", message: "" });
  }, []);

  // Load the queue for the active institution on mount and whenever it changes.
  // Await-first so the effect body performs no synchronous setState.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      const result = await listGradingQueueAction([active]);
      if (cancelled) return;
      if ("error" in result) {
        setQueueState({ status: "error", message: result.error });
        return;
      }
      setRows(result.rows);
      setQueueErrors(result.errors);
      setQueueState({ status: "idle", message: "" });
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  const graderLabel = provider === "other" ? "deterministic grader" : "AI grader";

  return (
    <div className={styles.form}>
      <div className={styles.field}>
        <label>Institution</label>
        <InstitutionSwitcher metric="grading" />
      </div>

      {active && (
        <div className={styles.resultsHeader} style={{ paddingTop: 0 }}>
          <h2>Needs grading</h2>
          <button
            type="button"
            className={styles.downloadButton}
            onClick={() => {
              void loadQueue(active);
              refreshCounts();
            }}
            disabled={queueState.status === "loading"}
          >
            {queueState.status === "loading" ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      )}

      {active && queueState.status === "loading" && (
        <div className={styles.loadingState} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <div>
            <p className={styles.loadingTitle}>Loading {active}…</p>
            <p className={styles.loadingText}>Fetching everything that needs grading.</p>
          </div>
        </div>
      )}
      {queueState.status === "error" && <p className={styles.error}>{queueState.message}</p>}
      {queueErrors.map((e) => (
        <p key={e.acronym} className={styles.error}>
          {e.acronym}: {e.error}
        </p>
      ))}
      {active && queueState.status === "idle" && rows.length === 0 && (
        <p className={styles.emptyState}>Nothing is waiting to be graded right now.</p>
      )}

      {rows.length > 0 && (
        <div className={styles.liveFeedTableWrap}>
          <table className={styles.liveFeedTable}>
            <thead>
              <tr>
                <th>Course</th>
                <th>Assignment / Discussion</th>
                <th>Description</th>
                <th>Rubric</th>
                <th>Needs grading</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.kind}-${row.id}`}>
                  <td>{row.courseName}</td>
                  <td>
                    <a href={row.htmlUrl} target="_blank" rel="noopener noreferrer">
                      {row.title}
                    </a>
                    <div style={{ fontSize: "0.78rem", opacity: 0.8 }}>{row.kind}</div>
                  </td>
                  <td style={{ maxWidth: 320 }}>
                    {row.description ? (
                      <details>
                        <summary>View</summary>
                        <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{row.description}</div>
                      </details>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={{ maxWidth: 320 }}>
                    {row.rubricText ? (
                      <details>
                        <summary>View</summary>
                        <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{row.rubricText}</div>
                      </details>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{row.needsGradingCount}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.submitButton}
                      style={{ minWidth: 0, padding: "8px 14px" }}
                      onClick={() => onAutoGrade(row)}
                      disabled={pending}
                    >
                      Auto Grade
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.fieldHint}>
        Auto Grade runs the same workflow as a single Canvas URL, using the {graderLabel}. Results
        appear below, where you can edit and post them back to Canvas. Institutions are managed in
        Settings (top right).
      </p>
    </div>
  );
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
  const { refresh: refreshCounts } = useInstitutionCounts();
  const [source, setSource] = useState<GradingMode>(() => {
    if (typeof window === "undefined") return "zip";
    const saved = localStorage.getItem("ta-grading-source");
    return saved === "canvas" || saved === "livefeed" ? saved : "zip";
  });
  const [canvasUrl, setCanvasUrl] = useState("");
  const [canvasRetrieved, setCanvasRetrieved] = useState(false);
  const [assignmentInstructions, setAssignmentInstructions] = useState("");
  const [rubric, setRubric] = useState("");
  const [sortState, setSortState] = useState(DEFAULT_SORT);

  const [canvasMeta, setCanvasMeta] = useState<{ status: "idle" | "loading" | "done" | "error"; message: string }>({ status: "idle", message: "" });

  const selectSource = (next: GradingMode) => {
    setSource(next);
    if (typeof window !== "undefined") localStorage.setItem("ta-grading-source", next);
  };

  const canvasUrlKind = detectCanvasUrlKind(canvasUrl);
  const graderLabel =
    selectedProvider === "other"
      ? "deterministic grader (against your CSV/JSON rubric)"
      : "AI grader";

  // Retrieve the assignment/discussion description + rubric from Canvas and show
  // them as read-only fields. Triggered by the button below the URL.
  const handleRetrieveCanvas = async () => {
    const url = canvasUrl.trim();
    if (!url || !detectCanvasUrlKind(url)) {
      setCanvasMeta({ status: "error", message: "Enter a valid Canvas discussion or assignment URL first." });
      return;
    }
    setCanvasMeta({ status: "loading", message: "Retrieving details from Canvas…" });

    const result = await fetchCanvasMetaAction(url);
    if ("error" in result) {
      setCanvasMeta({ status: "error", message: result.error });
      return;
    }

    setAssignmentInstructions(result.description);
    setRubric(result.rubricText);
    setCanvasRetrieved(true);

    const parts: string[] = [];
    if (result.description) parts.push("instructions");
    if (result.rubricText) parts.push("rubric");
    const base = parts.length
      ? `Retrieved ${parts.join(" + ")} from Canvas.`
      : "Retrieved from Canvas.";
    const noRubric = result.rubricText
      ? ""
      : " No rubric was found in Canvas; none will be synthesized. Grading uses the assignment instructions only (attach a rubric in Canvas for per-criterion scoring).";
    const caveat =
      selectedProvider === "other" && result.rubricText
        ? " Note: the deterministic grader needs a check-based CSV/JSON rubric; this Canvas rubric may not map to automated checks."
        : "";
    setCanvasMeta({ status: "done", message: base + noRubric + caveat });
  };

  const run = state.run;

  const [edits, setEdits] = useState<Record<string, RowEdit>>(() => seedEdits(run));
  const [prevRun, setPrevRun] = useState(run);
  const [postStatus, setPostStatus] = useState<Record<string, PostState>>({});
  const [postSummary, setPostSummary] = useState("");
  const [posting, setPosting] = useState(false);

  // Re-seed editable rows when a new run arrives (adjust-state-on-prop-change).
  if (run !== prevRun) {
    setPrevRun(run);
    setEdits(seedEdits(run));
    setPostStatus({});
    setPostSummary("");
  }

  const updateEdit = (student: string, patch: Partial<RowEdit>) =>
    setEdits((prev) => ({
      ...prev,
      [student]: { ...(prev[student] ?? { total: "", overall: "", areas: {} }), ...patch },
    }));

  const updateArea = (student: string, areaName: string, patch: Partial<AreaEdit>) =>
    setEdits((prev) => {
      const row = prev[student] ?? { total: "", overall: "", areas: {} };
      const area = row.areas[areaName] ?? { score: "", comment: "" };
      return {
        ...prev,
        [student]: { ...row, areas: { ...row.areas, [areaName]: { ...area, ...patch } } },
      };
    });

  const gradableResults = useMemo(
    () => (run?.results ?? []).filter((r) => typeof r.userId === "number"),
    [run]
  );
  // Results carry Canvas user ids only when they came from Canvas (a single
  // assignment or a Live Feed row), which is exactly when posting back applies.
  const canvasGradable = gradableResults.length > 0;

  // Live Feed "Auto Grade": grade a queue row through the very same pipeline as
  // the Single Assignment form. Set canvasUrl so a later "Post grades" targets
  // this assignment, then dispatch the grade action with the row's context.
  const handleAutoGrade = (row: CanvasQueueItem) => {
    setCanvasUrl(row.canvasUrl);
    const fd = new FormData();
    fd.set("canvasUrl", row.canvasUrl);
    fd.set("assignmentInstructions", row.description || row.title);
    fd.set("rubric", row.rubricText);
    fd.set("provider", selectedProvider);
    fd.set("institution", row.institution);
    formAction(fd);
  };

  const handlePostGrades = async () => {
    if (gradableResults.length === 0) return;
    if (
      !window.confirm(
        `Post ${gradableResults.length} grade(s) to Canvas? This writes to the live gradebook.`
      )
    ) {
      return;
    }

    const userIdToStudent = new Map<number, string>();
    const payload = gradableResults.map((r) => {
      const edit = edits[r.student] ?? { total: r.totalScore, overall: r.overallComment, areas: {} };
      userIdToStudent.set(r.userId as number, r.student);
      return {
        userId: r.userId as number,
        grade: parseEarnedPoints(edit.total),
        comment: edit.overall,
        rubricAreas: r.rubricAreas.map((a) => {
          const ae = edit.areas[a.area] ?? { score: a.score, comment: a.comment };
          return { area: a.area, score: ae.score, comment: ae.comment };
        }),
      };
    });

    setPosting(true);
    setPostSummary("");
    setPostStatus(() => {
      const next: Record<string, PostState> = {};
      for (const r of gradableResults) next[r.student] = { status: "posting" };
      return next;
    });

    const result = await postCanvasGradesAction(canvasUrl, payload);
    setPosting(false);

    if ("error" in result) {
      setPostSummary(result.error);
      setPostStatus(() => {
        const next: Record<string, PostState> = {};
        for (const r of gradableResults) next[r.student] = { status: "error", message: result.error };
        return next;
      });
      return;
    }

    const failedByStudent = new Map<string, string>();
    for (const failure of result.failures) {
      const student = userIdToStudent.get(failure.userId);
      if (student) failedByStudent.set(student, failure.error);
    }
    setPostStatus(() => {
      const next: Record<string, PostState> = {};
      for (const r of gradableResults) {
        next[r.student] = failedByStudent.has(r.student)
          ? { status: "error", message: failedByStudent.get(r.student) }
          : { status: "posted" };
      }
      return next;
    });
    setPostSummary(
      `Posted ${result.posted}${result.failures.length ? `, ${result.failures.length} failed` : ""}.`
    );
    // Posting grades clears submissions from the queue — update the badge.
    refreshCounts();
  };

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
    const csvContent = buildCsvContent(state, edits);
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

  const showContextFields = source === "zip" || canvasRetrieved;

  return (
    <section className={styles.card}>
      <div className={styles.header}>
        <h1>Grading</h1>
        <p>
          Add the student submissions and the grading context needed to review
          an assignment.
        </p>
      </div>

      <div className={styles.lessonInnerTabs}>
        <button
          type="button"
          className={`${styles.lessonInnerTab}${source === "zip" ? ` ${styles.lessonInnerTabActive}` : ""}`}
          onClick={() => selectSource("zip")}
        >
          Upload ZIP
        </button>
        <button
          type="button"
          className={`${styles.lessonInnerTab}${source === "canvas" ? ` ${styles.lessonInnerTabActive}` : ""}`}
          onClick={() => selectSource("canvas")}
        >
          Single Assignment
        </button>
        <button
          type="button"
          className={`${styles.lessonInnerTab}${source === "livefeed" ? ` ${styles.lessonInnerTabActive}` : ""}`}
          onClick={() => selectSource("livefeed")}
        >
          Live Feed
        </button>
      </div>

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

      {state.error && (
        <p role="alert" className={styles.error}>
          {state.error}
        </p>
      )}

      {source === "livefeed" ? (
        <LiveFeedPanel
          provider={selectedProvider}
          pending={pending}
          onAutoGrade={handleAutoGrade}
        />
      ) : (
      <form className={styles.form} action={formAction}>
        <input type="hidden" name="provider" value={selectedProvider} />
        {source === "zip" ? (
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
        ) : (
          <div className={styles.field}>
            <label htmlFor="canvas-url">Canvas URL</label>
            <input
              id="canvas-url"
              name="canvasUrl"
              type="url"
              required
              className={styles.textInput}
              placeholder="Paste a discussion or assignment link (.../discussion_topics/… or .../assignments/…)"
              value={canvasUrl}
              onChange={(e) => {
                setCanvasUrl(e.target.value);
                setCanvasRetrieved(false);
                setCanvasMeta({ status: "idle", message: "" });
              }}
            />
            <button
              type="button"
              className={styles.downloadButton}
              onClick={handleRetrieveCanvas}
              disabled={canvasMeta.status === "loading" || !canvasUrlKind}
              style={{ alignSelf: "flex-start" }}
            >
              {canvasMeta.status === "loading" ? "Retrieving…" : "Retrieve from Canvas"}
            </button>
            <p className={styles.fieldHint}>
              {canvasUrlKind === "discussion"
                ? `Detected: discussion board. Each student's posts and replies are pulled via the Canvas API and graded with the ${graderLabel}.`
                : canvasUrlKind === "assignment"
                  ? `Detected: assignment. Each student's submission text and uploaded files are pulled via the Canvas API and graded with the ${graderLabel}.`
                  : canvasUrl.trim()
                    ? "Unrecognized Canvas URL. Expecting a link like .../courses/123/discussion_topics/456 or .../courses/123/assignments/456."
                    : `Paste a Canvas discussion or assignment link, then retrieve it. The type is detected automatically and graded with the ${graderLabel}.`}
            </p>
            {canvasMeta.status !== "idle" && (
              <p
                className={styles.fieldHint}
                style={{ color: canvasMeta.status === "error" ? "var(--error, #b91c1c)" : undefined }}
              >
                {canvasMeta.message}
              </p>
            )}
          </div>
        )}

        {showContextFields && (
          <>
            <div className={styles.field}>
              <label htmlFor="assignment-instructions">Assignment Instructions</label>
              <textarea
                id="assignment-instructions"
                name="assignmentInstructions"
                rows={10}
                readOnly={source === "canvas"}
                value={assignmentInstructions}
                onChange={handleAssignmentInstructionsChange}
                placeholder="Paste the assignment brief, requirements, and any special directions."
              />
            </div>

            {(source === "zip" || rubric.trim()) && (
              <div className={styles.field}>
                <label htmlFor="rubric">Rubric</label>
                <textarea
                  id="rubric"
                  name="rubric"
                  rows={10}
                  readOnly={source === "canvas"}
                  value={rubric}
                  onChange={handleRubricChange}
                  placeholder="Paste the grading rubric, expectations, and scoring guidance."
                />
              </div>
            )}
          </>
        )}

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

        <button
          className={styles.submitButton}
          type="submit"
          disabled={pending || (source === "canvas" && !canvasRetrieved)}
        >
          {pending ? "Grading..." : "Start Review"}
        </button>
      </form>
      )}

      {testState.result && (
        <p style={{ marginTop: "0.5rem", color: "green" }}>Gemini responded: {testState.result}</p>
      )}
      {testState.error && (
        <p style={{ marginTop: "0.5rem", color: "red" }}>Gemini error: {testState.error}</p>
      )}

      {run && run.results.length === 0 && (
        <p className={styles.emptyState}>
          {source === "zip"
            ? "No supported submission files were found in the zip archive."
            : "No discussion posts were found for that topic."}
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
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              {canvasGradable && (
                <button
                  className={styles.submitButton}
                  type="button"
                  onClick={handlePostGrades}
                  disabled={posting}
                >
                  {posting ? "Posting…" : `Post ${gradableResults.length} grade(s) to Canvas`}
                </button>
              )}
              <button
                className={styles.downloadButton}
                type="button"
                onClick={handleExportCsv}
              >
                Export CSV
              </button>
            </div>
          </div>

          {canvasGradable && (
            <p className={styles.fieldHint}>
              Edit grades and comments in the table, then post. Grades write to the
              assignment&apos;s gradebook column and comments are added to each
              submission. If the Canvas assignment has an attached rubric, the
              per-criterion scores fill the SpeedGrader rubric too (matched by name).
              {postSummary ? ` ${postSummary}` : ""}
            </p>
          )}

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
                  const edit = edits[result.student] ?? {
                    total: result.totalScore,
                    overall: result.overallComment,
                    areas: {},
                  };
                  const status = postStatus[result.student];

                  return (
                    <tr key={`${result.student}-matrix`}>
                      <td>
                        {result.student}
                        {status && status.status !== "idle" && (
                          <div
                            className={styles.fieldHint}
                            style={{ color: status.status === "error" ? "var(--error, #b91c1c)" : undefined }}
                          >
                            {status.status === "posted"
                              ? "Posted to Canvas"
                              : status.status === "posting"
                                ? "Posting…"
                                : `Failed: ${status.message ?? ""}`}
                          </div>
                        )}
                      </td>
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
                        const areaEdit = area
                          ? edit.areas[areaName] ?? { score: area.score, comment: area.comment }
                          : null;
                        return (
                          <td key={`${result.student}-${areaName}`}>
                            {area && areaEdit ? (
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
                                      formatFeedback(areaEdit.comment || "No feedback provided.")
                                    )
                                  }
                                >
                                  <CopyIcon />
                                </button>
                                <input
                                  type="text"
                                  className={styles.textInput}
                                  style={{ minWidth: "64px", marginBottom: "4px" }}
                                  aria-label={`${areaName} score for ${result.student}`}
                                  value={areaEdit.score}
                                  onChange={(e) =>
                                    updateArea(result.student, areaName, { score: e.target.value })
                                  }
                                />
                                <textarea
                                  aria-label={`${areaName} feedback for ${result.student}`}
                                  style={{ minHeight: "70px", width: "100%" }}
                                  value={areaEdit.comment}
                                  onChange={(e) =>
                                    updateArea(result.student, areaName, { comment: e.target.value })
                                  }
                                />
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                        );
                      })}
                      <td>
                        <input
                          type="text"
                          className={styles.textInput}
                          style={{ minWidth: "72px" }}
                          aria-label={`Grade for ${result.student}`}
                          value={edit.total}
                          onChange={(e) => updateEdit(result.student, { total: e.target.value })}
                        />
                      </td>
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
                                formatFeedback(edit.overall || "No overall feedback provided.")
                              )
                            }
                          >
                            <CopyIcon />
                          </button>
                          <textarea
                            aria-label={`Overall feedback for ${result.student}`}
                            style={{ minHeight: "90px", width: "100%" }}
                            value={edit.overall}
                            onChange={(e) => updateEdit(result.student, { overall: e.target.value })}
                          />
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
