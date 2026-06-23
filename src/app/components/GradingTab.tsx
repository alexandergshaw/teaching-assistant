"use client";

import type { ChangeEvent } from "react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchCanvasMetaAction,
  postCanvasGradesAction,
  listGradingQueueAction,
  listGradingDismissalsAction,
  setAssignmentSeenAction,
  setCourseWatchedAction,
  type GradeActionState,
  type TestGeminiState,
} from "../actions";
import type { PreviewFile } from "./FilePreviewModal";
import type { CanvasQueueItem } from "@/lib/canvas";
import type { LlmProvider } from "@/lib/llm";
import { parseGeneratedRubric } from "../utils/rubric";
import { formatRelative } from "../utils/time";
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

// One graded student row (mirrors GradeResult without importing server code).
type GradeRow = NonNullable<GradeActionState["run"]>["results"][number];

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

const AUTO_REFRESH_KEY = "ta-livefeed-autorefresh";
const AUTO_REFRESH_MS = 5 * 60 * 1000;

type QueueSort = "course" | "count" | "due";
type KindFilter = "all" | "assignment" | "discussion";

const rowKeyOf = (row: CanvasQueueItem) => `${row.kind}-${row.id}`;

function LiveFeedPanel({
  provider,
  pending,
  onAutoGrade,
  gradingRowKey,
  refreshSignal,
}: {
  provider: LlmProvider;
  pending: boolean;
  onAutoGrade: (row: CanvasQueueItem) => void;
  gradingRowKey: string | null;
  refreshSignal: number;
}) {
  const { active } = useInstitutionSelection();
  const { refresh: refreshCounts } = useInstitutionCounts();
  const [rows, setRows] = useState<CanvasQueueItem[]>([]);
  const [queueErrors, setQueueErrors] = useState<Array<{ acronym: string; error: string }>>([]);
  const [queueState, setQueueState] = useState<{
    status: "idle" | "loading" | "error";
    message: string;
  }>(() => ({ status: readActiveInstitution() ? "loading" : "idle", message: "" }));
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [sort, setSort] = useState<QueueSort>("course");
  const [groupByCourse, setGroupByCourse] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(AUTO_REFRESH_KEY) === "1"
  );
  const [drawer, setDrawer] = useState<CanvasQueueItem | null>(null);

  // Seen assignments + unwatched courses for the active institution (kept in
  // Supabase). Membership tested by id; "Show hidden" reveals them with undo.
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [unwatched, setUnwatched] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);

  const loadDismissals = useCallback(async (code: string) => {
    const result = await listGradingDismissalsAction();
    if ("error" in result) return;
    setSeen(new Set(result.assignments.filter((d) => d.institution === code).map((d) => d.refId)));
    setUnwatched(new Set(result.courses.filter((d) => d.institution === code).map((d) => d.refId)));
  }, []);

  // Await-first so the effect performs no synchronous setState.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      const result = await listGradingDismissalsAction();
      if (cancelled || "error" in result) return;
      setSeen(new Set(result.assignments.filter((d) => d.institution === active).map((d) => d.refId)));
      setUnwatched(new Set(result.courses.filter((d) => d.institution === active).map((d) => d.refId)));
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  const markSeen = async (row: CanvasQueueItem, value: boolean) => {
    setSeen((prev) => {
      const next = new Set(prev);
      if (value) next.add(row.assignmentId);
      else next.delete(row.assignmentId);
      return next;
    });
    const result = await setAssignmentSeenAction(active, row.assignmentId, value);
    if ("error" in result) {
      void loadDismissals(active); // revert to server truth
      return;
    }
    refreshCounts();
  };

  const setWatched = async (courseId: string, value: boolean) => {
    setUnwatched((prev) => {
      const next = new Set(prev);
      if (value) next.delete(courseId);
      else next.add(courseId);
      return next;
    });
    const result = await setCourseWatchedAction(active, courseId, value);
    if ("error" in result) {
      void loadDismissals(active);
      return;
    }
    refreshCounts();
  };

  // Show the loading screen the instant the institution changes (before the
  // effect's fetch starts), clearing the previous school's rows. React's
  // "adjust state during render" pattern, not an effect.
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
    setUpdatedAt(new Date().toISOString());
  }, []);

  // Load on mount, on institution change, and when the parent bumps refreshSignal
  // (after posting grades). Await-first so the effect performs no sync setState.
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
      setUpdatedAt(new Date().toISOString());
    })();
    return () => {
      cancelled = true;
    };
  }, [active, refreshSignal]);

  // Opt-in auto-refresh on an interval.
  useEffect(() => {
    if (!autoRefresh || !active) return;
    const timer = setInterval(() => void loadQueue(active), AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, active, loadQueue]);

  const toggleAutoRefresh = () => {
    setAutoRefresh((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") localStorage.setItem(AUTO_REFRESH_KEY, next ? "1" : "0");
      return next;
    });
  };

  const graderLabel = provider === "other" ? "deterministic grader" : "AI grader";

  const viewRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    let filtered = rows.filter((r) => {
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      // Hide seen assignments and unwatched courses unless "Show hidden" is on.
      if (!showHidden && (unwatched.has(r.courseId) || seen.has(r.assignmentId))) return false;
      return true;
    });
    if (term) {
      filtered = filtered.filter(
        (r) =>
          r.title.toLowerCase().includes(term) || r.courseName.toLowerCase().includes(term)
      );
    }
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === "count") return b.needsGradingCount - a.needsGradingCount;
      if (sort === "due") {
        const at = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY;
        const bt = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY;
        return at - bt;
      }
      return a.courseName.localeCompare(b.courseName) || a.title.localeCompare(b.title);
    });
    return sorted;
  }, [rows, search, kindFilter, sort, showHidden, seen, unwatched]);

  // Count of currently-hidden rows, to label the "Show hidden" toggle.
  const hiddenCount = useMemo(
    () => rows.filter((r) => unwatched.has(r.courseId) || seen.has(r.assignmentId)).length,
    [rows, seen, unwatched]
  );

  // Group the rows for rendering when "group by course" is on.
  const groups = useMemo(() => {
    if (!groupByCourse) return [{ course: "", items: viewRows }];
    const map = new Map<string, CanvasQueueItem[]>();
    for (const row of viewRows) {
      const list = map.get(row.courseName) ?? [];
      list.push(row);
      map.set(row.courseName, list);
    }
    return [...map.entries()].map(([course, items]) => ({ course, items }));
  }, [viewRows, groupByCourse]);

  const renderRow = (row: CanvasQueueItem) => {
    const key = rowKeyOf(row);
    const isGrading = pending && gradingRowKey === key;
    return (
      <tr key={key}>
        <td>
          <a href={row.htmlUrl} target="_blank" rel="noopener noreferrer">
            {row.title}
          </a>
          <div className={styles.liveFeedSub}>
            {row.kind}
            {!groupByCourse && row.courseName ? ` · ${row.courseName}` : ""}
            {" · "}
            <a href={row.speedGraderUrl} target="_blank" rel="noopener noreferrer">
              SpeedGrader
            </a>
          </div>
        </td>
        <td>{row.dueAt ? formatRelative(row.dueAt) : "—"}</td>
        <td>{row.needsGradingCount}</td>
        <td>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              className={styles.liveFeedGhostButton}
              onClick={() => setDrawer(row)}
            >
              Details
            </button>
            <button
              type="button"
              className={styles.liveFeedGhostButton}
              onClick={() => markSeen(row, !seen.has(row.assignmentId))}
              title="Hide this assignment from the feed and the badge"
            >
              {seen.has(row.assignmentId) ? "Unmark seen" : "Mark seen"}
            </button>
            <button
              type="button"
              className={styles.submitButton}
              style={{ minWidth: 0, padding: "8px 14px" }}
              onClick={() => onAutoGrade(row)}
              disabled={pending}
            >
              {isGrading ? "Grading…" : "Auto Grade"}
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className={styles.form}>
      <div className={styles.field}>
        <label>Institution</label>
        <InstitutionSwitcher metric="grading" />
      </div>

      {active && (
        <>
          <div className={styles.resultsHeader} style={{ paddingTop: 0 }}>
            <h2>Needs grading</h2>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              {updatedAt && <span className={styles.fieldHint}>Updated {formatRelative(updatedAt)}</span>}
              <label className={styles.fieldHint} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={autoRefresh} onChange={toggleAutoRefresh} />
                Auto-refresh
              </label>
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
          </div>

          {rows.length > 0 && (
            <div className={styles.liveFeedToolbar}>
              <input
                type="search"
                className={styles.textInput}
                style={{ maxWidth: 260 }}
                placeholder="Search assignment or course"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className={styles.textInput}
                style={{ maxWidth: 170 }}
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value as KindFilter)}
                aria-label="Filter by type"
              >
                <option value="all">All types</option>
                <option value="assignment">Assignments</option>
                <option value="discussion">Discussions</option>
              </select>
              <select
                className={styles.textInput}
                style={{ maxWidth: 190 }}
                value={sort}
                onChange={(e) => setSort(e.target.value as QueueSort)}
                aria-label="Sort"
              >
                <option value="course">Sort: course</option>
                <option value="count">Sort: most needing grading</option>
                <option value="due">Sort: due soonest</option>
              </select>
              <label className={styles.fieldHint} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={groupByCourse}
                  onChange={(e) => setGroupByCourse(e.target.checked)}
                />
                Group by course
              </label>
              {hiddenCount > 0 && (
                <label className={styles.fieldHint} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={showHidden}
                    onChange={(e) => setShowHidden(e.target.checked)}
                  />
                  Show hidden ({hiddenCount})
                </label>
              )}
            </div>
          )}
        </>
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
      {active && queueState.status === "idle" && rows.length > 0 && viewRows.length === 0 && (
        <p className={styles.emptyState}>No rows match your search or filter.</p>
      )}

      {viewRows.length > 0 && (
        <div className={styles.liveFeedTableWrap}>
          <table className={styles.liveFeedTable}>
            <thead>
              <tr>
                <th>Assignment / Discussion</th>
                <th>Due</th>
                <th>Needs grading</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <Fragment key={group.course || "all"}>
                  {groupByCourse && (() => {
                    const courseId = group.items[0]?.courseId;
                    const isUnwatched = courseId ? unwatched.has(courseId) : false;
                    return (
                      <tr className={styles.liveFeedGroupRow}>
                        <td colSpan={4}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <span>
                              {group.course} ({group.items.length})
                              {isUnwatched ? " · not watching" : ""}
                            </span>
                            {courseId && (
                              <button
                                type="button"
                                className={styles.liveFeedGhostButton}
                                onClick={() => setWatched(courseId, isUnwatched)}
                                title="Stop receiving notifications for this course"
                              >
                                {isUnwatched ? "Resume watching" : "Stop watching"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })()}
                  {group.items.map(renderRow)}
                </Fragment>
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

      {drawer && (
        <div
          className={styles.previewBackdrop}
          role="dialog"
          aria-modal="true"
          onClick={() => setDrawer(null)}
        >
          <div className={styles.previewModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.previewHeader}>
              <h3>{drawer.title}</h3>
              <button type="button" className={styles.previewCloseButton} onClick={() => setDrawer(null)}>
                Close
              </button>
            </div>
            <p className={styles.previewMeta}>{drawer.courseName}</p>
            <div style={{ overflow: "auto" }}>
              <p className={styles.fileMetaLabel}>Description</p>
              <pre className={styles.previewContent}>{drawer.description || "No description in Canvas."}</pre>
              <p className={styles.fileMetaLabel} style={{ marginTop: 12 }}>Rubric</p>
              <pre className={styles.previewContent}>{drawer.rubricText || "No rubric in Canvas."}</pre>
            </div>
          </div>
        </div>
      )}
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
  // Grade-in-context: which Live Feed row is being graded, a signal to refetch
  // the queue after posting, and a ref to scroll the results into view.
  const [gradingTarget, setGradingTarget] = useState<{
    title: string;
    courseName: string;
    key: string;
  } | null>(null);
  const [queueRefreshSignal, setQueueRefreshSignal] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);
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
      const areas = { ...row.areas, [areaName]: { ...area, ...patch } };
      // Editing a criterion's points re-totals the student automatically.
      const total =
        patch.score !== undefined && run
          ? recomputeTotal(areas, run.rubricAreaNames, row.total)
          : row.total;
      return { ...prev, [student]: { ...row, areas, total } };
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
    setGradingTarget({ title: row.title, courseName: row.courseName, key: `${row.kind}-${row.id}` });
    const fd = new FormData();
    fd.set("canvasUrl", row.canvasUrl);
    fd.set("assignmentInstructions", row.description || row.title);
    fd.set("rubric", row.rubricText);
    fd.set("provider", selectedProvider);
    fd.set("institution", row.institution);
    formAction(fd);
  };

  // Scroll the results into view when a new grading run arrives (so Auto Grade
  // from the tall queue lands you on the results instead of leaving you scrolled up).
  useEffect(() => {
    if (run && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [run]);

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
    // Posting grades clears submissions from the queue — update the badge and
    // refetch the Live Feed so the graded row drops off.
    refreshCounts();
    setQueueRefreshSignal((n) => n + 1);
  };

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
          const ae = edit.areas[a.area] ?? { score: a.score, comment: a.comment };
          return { area: a.area, score: ae.score, comment: ae.comment };
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
    refreshCounts();
    setQueueRefreshSignal((n) => n + 1);
  };

  // Deep link to a single student's submission in SpeedGrader, when the run came
  // from a Canvas source (so we have the assignment's SpeedGrader base + userId).
  const speedGraderHref = (userId: number | undefined): string | null =>
    run?.speedGraderUrl && typeof userId === "number"
      ? `${run.speedGraderUrl}&student_id=${userId}`
      : null;

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
          gradingRowKey={gradingTarget?.key ?? null}
          refreshSignal={queueRefreshSignal}
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
        <section className={styles.results} ref={resultsRef}>
          {gradingTarget && (
            <div className={styles.gradingBanner}>
              Grading <strong>{gradingTarget.title}</strong>
              {gradingTarget.courseName ? ` — ${gradingTarget.courseName}` : ""}
            </div>
          )}
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
              Use a row&apos;s Post to Canvas button to post just that student, or Open in
              SpeedGrader to jump straight to their submission.
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
