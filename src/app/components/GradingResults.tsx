"use client";

import type { ReactNode, Ref } from "react";
import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from "react";
import { postCanvasGradesAction, type GradeActionState } from "../actions";
import type { PreviewFile } from "./FilePreviewModal";
import styles from "../page.module.css";

// Derived from the action's run shape so this file needs no server-code import.
type GradingRun = NonNullable<GradeActionState["run"]>;
type GradeRow = GradingRun["results"][number];

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

function ExpandIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M3 3.75A.75.75 0 0 1 3.75 3h4a.75.75 0 0 1 0 1.5H5.56l3.22 3.22a.75.75 0 1 1-1.06 1.06L4.5 5.56v2.19a.75.75 0 0 1-1.5 0v-4Zm14 12.5a.75.75 0 0 1-.75.75h-4a.75.75 0 0 1 0-1.5h2.19l-3.22-3.22a.75.75 0 1 1 1.06-1.06l3.22 3.22V12.25a.75.75 0 0 1 1.5 0v4Z" />
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

// Editable grade, overall comment, and per-criterion scores per student
// (keyed by student name, then by rubric area name).
type AreaEdit = { score: string };
type RowEdit = { total: string; overall: string; areas: Record<string, AreaEdit> };

function seedEdits(run: GradingRun): Record<string, RowEdit> {
  const seeded: Record<string, RowEdit> = {};
  for (const result of run.results) {
    const areas: Record<string, AreaEdit> = {};
    for (const area of result.rubricAreas) {
      areas[area.area] = { score: area.score };
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

// The denominator of a "X/Y" score, or null when there is no "/Y" part.
function parseDenominator(value: string): number | null {
  const match = value.match(/\/\s*(-?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

// Format a points number without trailing-zero noise (8 -> "8", 7.5 -> "7.5").
function formatPoints(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// Recompute a student's total as the sum of their per-criterion earned points.
// Keeps the existing total's denominator when it has one (e.g. "17/20"); else
// uses the summed criterion denominators when every criterion supplies one.
// Returns the current total unchanged when no criterion has a numeric score.
function recomputeTotal(
  areas: Record<string, AreaEdit>,
  areaNames: string[],
  currentTotal: string
): string {
  let earned = 0;
  let sawNumber = false;
  let denomSum = 0;
  let everyHasDenom = true;
  for (const name of areaNames) {
    const score = areas[name]?.score ?? "";
    if (!score.trim()) {
      everyHasDenom = false;
      continue;
    }
    const e = parseScoreValue(score);
    if (e !== null) {
      earned += e;
      sawNumber = true;
    }
    const d = parseDenominator(score);
    if (d !== null) denomSum += d;
    else everyHasDenom = false;
  }
  if (!sawNumber) return currentTotal;
  const denom = parseDenominator(currentTotal) ?? (everyHasDenom ? denomSum : null);
  return denom !== null ? `${formatPoints(earned)}/${formatPoints(denom)}` : formatPoints(earned);
}

function formatFeedback(text: string): string {
  return text.replace(/\s*[–—]\s*/g, ", ");
}

function escapeCsvCell(value: string): string {
  const sanitized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return `"${sanitized.replace(/"/g, '""')}"`;
}

function buildCsvContent(run: GradingRun, edits: Record<string, RowEdit>): string {
  const header = ["Student"];
  for (const area of run.rubricAreaNames) {
    header.push(`${area} Score`);
  }
  header.push("Total Score");
  header.push("Overall Comment");
  header.push("Submitted Files");
  header.push("Submitted Extensions");

  const rows = [header.map((cell) => escapeCsvCell(cell)).join(",")];

  for (const result of run.results) {
    const edit = edits[result.student];
    const row: string[] = [result.student];
    const areaMap = new Map(result.rubricAreas.map((area) => [area.area, area]));
    for (const areaName of run.rubricAreaNames) {
      const area = areaMap.get(areaName);
      const areaEdit = edit?.areas?.[areaName];
      row.push(areaEdit?.score ?? area?.score ?? "");
    }
    row.push(edit?.total ?? result.totalScore);
    row.push(edit?.overall ?? result.overallComment);
    row.push(result.submittedFiles.map((file) => file.name).join("; "));
    row.push(Array.from(new Set(result.submittedFiles.map((file) => file.extension))).join("; "));
    rows.push(row.map((cell) => escapeCsvCell(cell)).join(","));
  }

  return rows.join("\n");
}

// ── Component ──────────────────────────────────────────────────────────────

export type GradingResultsProps = {
  /** The grading run to display (non-null; callers gate on results.length). */
  run: GradingRun;
  /** Canvas assignment/discussion URL grades post back to. */
  canvasUrl: string;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => Promise<void>;
  onOpenPreview: (student: string, file: PreviewFile) => void;
  /** Called after any successful post (e.g. to refresh badges and the queue). */
  onPosted?: () => void;
  /** Optional context banner rendered above the results header. */
  banner?: ReactNode;
  /** Ref to the results section, for scroll-into-view in the classic flow. */
  sectionRef?: Ref<HTMLDivElement>;
};

/** Imperative handle so a parent (the Live Feed pane) can drive "Post & Next". */
export interface GradingResultsHandle {
  /** Post every gradable student. Pass false to skip the confirm prompt. */
  postAll: (confirm?: boolean) => Promise<void>;
}

/**
 * The grading results matrix: per-criterion scores/comments, an editable total
 * (auto-summed from the criteria), overall feedback, per-student and bulk Post
 * to Canvas, SpeedGrader deep links, and CSV export. Owns its own edit/post
 * state so it can be dropped into either the classic flow or the Live Feed
 * detail pane.
 */
const GradingResults = forwardRef<GradingResultsHandle, GradingResultsProps>(function GradingResults({
  run,
  canvasUrl,
  copiedKey,
  onCopy,
  onOpenPreview,
  onPosted,
  banner,
  sectionRef,
}: GradingResultsProps, ref) {
  const [edits, setEdits] = useState<Record<string, RowEdit>>(() => seedEdits(run));
  const [prevRun, setPrevRun] = useState(run);
  const [postStatus, setPostStatus] = useState<Record<string, PostState>>({});
  const [postSummary, setPostSummary] = useState("");
  const [posting, setPosting] = useState(false);
  const [sortState, setSortState] = useState(DEFAULT_SORT);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  // Re-seed editable rows when a new run arrives (adjust-state-on-prop-change).
  if (run !== prevRun) {
    setPrevRun(run);
    setEdits(seedEdits(run));
    setPostStatus({});
    setPostSummary("");
    setExpandedStudent(null);
  }

  const updateEdit = (student: string, patch: Partial<RowEdit>) =>
    setEdits((prev) => ({
      ...prev,
      [student]: { ...(prev[student] ?? { total: "", overall: "", areas: {} }), ...patch },
    }));

  const updateArea = (student: string, areaName: string, patch: Partial<AreaEdit>) =>
    setEdits((prev) => {
      const row = prev[student] ?? { total: "", overall: "", areas: {} };
      const area = row.areas[areaName] ?? { score: "" };
      const areas = { ...row.areas, [areaName]: { ...area, ...patch } };
      // Editing a criterion's points re-totals the student automatically.
      const total =
        patch.score !== undefined ? recomputeTotal(areas, run.rubricAreaNames, row.total) : row.total;
      return { ...prev, [student]: { ...row, areas, total } };
    });

  const gradableResults = useMemo(
    () => run.results.filter((r) => typeof r.userId === "number"),
    [run]
  );
  // Results carry Canvas user ids only when they came from Canvas (a single
  // assignment or a Live Feed row), which is exactly when posting back applies.
  const canvasGradable = gradableResults.length > 0;

  const handlePostGrades = useCallback(async (confirm = true) => {
    if (gradableResults.length === 0) return;
    if (
      confirm &&
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
          const ae = edit.areas[a.area] ?? { score: a.score };
          return { area: a.area, score: ae.score, comment: "" };
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
    onPosted?.();
  }, [gradableResults, edits, canvasUrl, onPosted]);

  // Expose post-all so the Live Feed pane's "Post & Next" can drive it.
  useImperativeHandle(ref, () => ({ postAll: (confirm = true) => handlePostGrades(confirm) }), [
    handlePostGrades,
  ]);

  // Post a single student's grade, leaving the rest untouched. Same payload
  // shape as the bulk post, with a one-element array.
  const handlePostOne = async (row: GradeRow) => {
    if (typeof row.userId !== "number") return;
    const edit = edits[row.student] ?? { total: row.totalScore, overall: row.overallComment, areas: {} };
    const payload = [
      {
        userId: row.userId,
        grade: parseEarnedPoints(edit.total),
        comment: edit.overall,
        rubricAreas: row.rubricAreas.map((a) => {
          const ae = edit.areas[a.area] ?? { score: a.score };
          return { area: a.area, score: ae.score, comment: "" };
        }),
      },
    ];

    setPostStatus((prev) => ({ ...prev, [row.student]: { status: "posting" } }));
    const res = await postCanvasGradesAction(canvasUrl, payload);
    if ("error" in res) {
      setPostStatus((prev) => ({ ...prev, [row.student]: { status: "error", message: res.error } }));
      return;
    }
    const failure = res.failures.find((f) => f.userId === row.userId);
    setPostStatus((prev) => ({
      ...prev,
      [row.student]: failure ? { status: "error", message: failure.error } : { status: "posted" },
    }));
    onPosted?.();
  };

  // Deep link to a single student's submission in SpeedGrader, when the run came
  // from a Canvas source (so we have the assignment's SpeedGrader base + userId).
  const speedGraderHref = (userId: number | undefined): string | null =>
    run.speedGraderUrl && typeof userId === "number"
      ? `${run.speedGraderUrl}&student_id=${userId}`
      : null;

  const sortedResults = useMemo(() => {
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
    a.download = name.toLowerCase().endsWith(`.${extension.toLowerCase()}`) ? name : `${name}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    const csvContent = buildCsvContent(run, edits);
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

  return (
    <section className={styles.results} ref={sectionRef}>
      {banner}
      <div className={styles.resultsHeader}>
        <h2>Grading Results</h2>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {canvasGradable && (
            <button className={styles.submitButton} type="button" onClick={() => handlePostGrades()} disabled={posting}>
              {posting ? "Posting…" : `Post ${gradableResults.length} grade(s) to Canvas`}
            </button>
          )}
          <button className={styles.downloadButton} type="button" onClick={handleExportCsv}>
            Export CSV
          </button>
        </div>
      </div>

      {canvasGradable && (
        <p className={styles.fieldHint}>
          Edit grades and comments in the table, then post. Grades write to the
          assignment&apos;s gradebook column and comments are added to each submission. If the Canvas
          assignment has an attached rubric, the per-criterion scores fill the SpeedGrader rubric too
          (matched by name). Use a row&apos;s Post to Canvas button to post just that student, or Open in
          SpeedGrader to jump straight to their submission.
          {postSummary ? ` ${postSummary}` : ""}
        </p>
      )}

      {run.fullCreditChecklist && run.fullCreditChecklist.length > 0 && (
        <section className={styles.resultsChecklist}>
          <h3>What earns full credit</h3>
          <ul>
            {run.fullCreditChecklist.map((item, index) => (
              <li key={`full-credit-${index + 1}`}>{item}</li>
            ))}
          </ul>
        </section>
      )}

      {run.sampleAnswer && run.sampleAnswer.trim() && (
        <section className={styles.resultsChecklist}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
            <h3 style={{ margin: 0 }}>Sample correct answer</h3>
            <button
              type="button"
              className={styles.copyIconButton}
              title={copiedKey === "sample-answer" ? "Copied" : "Copy sample answer"}
              aria-label="Copy sample correct answer"
              onClick={() => onCopy("sample-answer", run.sampleAnswer ?? "")}
            >
              <CopyIcon />
            </button>
          </div>
          <div style={{ whiteSpace: "pre-wrap", marginTop: "0.5rem" }}>{run.sampleAnswer}</div>
        </section>
      )}

      <div className={styles.matrixWrap}>
        <table className={styles.matrix}>
          <thead>
            <tr>
              <th>
                <button type="button" className={styles.sortButton} onClick={() => handleSort({ kind: "student" })}>
                  Student <span>{sortLabel({ kind: "student" })}</span>
                </button>
              </th>
              <th>
                <button type="button" className={styles.sortButton} onClick={() => handleSort({ kind: "files" })}>
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
                <button type="button" className={styles.sortButton} onClick={() => handleSort({ kind: "total" })}>
                  Total <span>{sortLabel({ kind: "total" })}</span>
                </button>
              </th>
              <th>
                <button type="button" className={styles.sortButton} onClick={() => handleSort({ kind: "overall" })}>
                  Overall Feedback <span>{sortLabel({ kind: "overall" })}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedResults.map((result) => {
              const areaMap = new Map(result.rubricAreas.map((area) => [area.area, area]));
              const edit = edits[result.student] ?? {
                total: result.totalScore,
                overall: result.overallComment,
                areas: {},
              };
              const status = postStatus[result.student];
              const sgHref = speedGraderHref(result.userId);
              const canPostRow = canvasGradable && typeof result.userId === "number";
              const rowPosting = posting || status?.status === "posting";

              return (
                <tr key={`${result.student}-matrix`}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{result.student}</div>
                    {sgHref && (
                      <a
                        href={sgHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.fieldHint}
                        style={{ display: "inline-block", marginTop: 2 }}
                      >
                        Open in SpeedGrader
                      </a>
                    )}
                    {canPostRow && (
                      <div style={{ marginTop: 6 }}>
                        <button
                          type="button"
                          className={styles.downloadButton}
                          style={{ padding: "4px 10px" }}
                          onClick={() => handlePostOne(result)}
                          disabled={rowPosting}
                        >
                          {status?.status === "posted" ? "Re-post" : "Post to Canvas"}
                        </button>
                      </div>
                    )}
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
                          <li key={`${result.student}-file-name-${file.name}`} className={styles.matrixFileItem}>
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
                                    content: file.previewContent || "No extracted text available for this file.",
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
                      ? edit.areas[areaName] ?? { score: area.score }
                      : null;
                    return (
                      <td key={`${result.student}-${areaName}`}>
                        {area && areaEdit ? (
                          <input
                            type="text"
                            className={styles.textInput}
                            style={{ minWidth: "64px" }}
                            aria-label={`${areaName} score for ${result.student}`}
                            value={areaEdit.score}
                            onChange={(e) => updateArea(result.student, areaName, { score: e.target.value })}
                          />
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
                        title={copiedKey === `${result.student}-overall-comment` ? "Copied" : "Copy Overall Feedback"}
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
                      <button
                        type="button"
                        className={styles.copyIconButton}
                        title="Expand feedback"
                        aria-label={`Expand overall feedback for ${result.student}`}
                        onClick={() => setExpandedStudent(result.student)}
                      >
                        <ExpandIcon />
                      </button>
                      <textarea
                        aria-label={`Overall feedback for ${result.student}`}
                        className={styles.feedbackText}
                        style={{ minHeight: "128px", width: "100%" }}
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

      {expandedStudent && (
        <div className={styles.previewBackdrop} onClick={() => setExpandedStudent(null)}>
          <section
            className={styles.previewModal}
            role="dialog"
            aria-modal="true"
            aria-label={`Overall feedback for ${expandedStudent}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.previewHeader}>
              <div>
                <p className={styles.previewMeta}>Student: {expandedStudent}</p>
                <h3>Overall Feedback</h3>
              </div>
              <button
                type="button"
                className={styles.previewCloseButton}
                onClick={() => setExpandedStudent(null)}
              >
                Close
              </button>
            </div>
            <textarea
              aria-label={`Overall feedback for ${expandedStudent} (expanded)`}
              className={styles.feedbackText}
              style={{ width: "100%", minHeight: "50vh" }}
              value={edits[expandedStudent]?.overall ?? ""}
              onChange={(event) => updateEdit(expandedStudent, { overall: event.target.value })}
            />
          </section>
        </div>
      )}
    </section>
  );
});

export default GradingResults;
