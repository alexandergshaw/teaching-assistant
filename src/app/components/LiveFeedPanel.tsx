"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listGradingQueueAction,
  listGradingDismissalsAction,
  setAssignmentSeenAction,
  setCourseWatchedAction,
  type GradeActionState,
} from "../actions";
import type { CanvasQueueItem } from "@/lib/canvas";
import type { LlmProvider } from "@/lib/llm";
import type { PreviewFile } from "./FilePreviewModal";
import { formatRelative } from "../utils/time";
import { useInstitutionSelection, readActiveInstitution } from "@/lib/institutions";
import InstitutionSwitcher from "./InstitutionSwitcher";
import { useInstitutionCounts } from "./InstitutionCounts";
import GradingResults, { type GradingResultsHandle } from "./GradingResults";
import styles from "../page.module.css";

const AUTO_REFRESH_KEY = "ta-livefeed-autorefresh";
const AUTO_REFRESH_MS = 5 * 60 * 1000;
const DUE_SOON_MS = 3 * 24 * 60 * 60 * 1000;

type QueueSort = "due" | "count" | "course";
type KindFilter = "all" | "assignment" | "discussion";
type UrgencyFilter = "all" | "overdue" | "soon";
type Urgency = "overdue" | "soon" | "later" | "none";

const rowKeyOf = (row: CanvasQueueItem) => `${row.kind}-${row.id}`;

function urgencyOf(dueAt: string | null): Urgency {
  if (!dueAt) return "none";
  const t = Date.parse(dueAt);
  if (Number.isNaN(t)) return "none";
  const delta = t - Date.now();
  if (delta < 0) return "overdue";
  if (delta <= DUE_SOON_MS) return "soon";
  return "later";
}

function urgencyBadge(u: Urgency): { label: string; bg: string; color: string } | null {
  if (u === "overdue") return { label: "Overdue", bg: "#fee2e2", color: "#b91c1c" };
  if (u === "soon") return { label: "Due soon", bg: "#fef3c7", color: "#92400e" };
  return null;
}

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 700,
        padding: "1px 7px",
        borderRadius: 999,
        background: bg,
        color,
      }}
    >
      {label}
    </span>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        font: "inherit",
        fontSize: "0.8rem",
        fontWeight: 600,
        padding: "4px 11px",
        borderRadius: 999,
        cursor: "pointer",
        border: `1px solid ${active ? "var(--accent)" : "var(--field-border)"}`,
        background: active ? "var(--accent)" : "var(--field-background)",
        color: active ? "#fff" : "var(--text-secondary)",
      }}
    >
      {children}
    </button>
  );
}

export default function LiveFeedPanel({
  provider,
  pending,
  run,
  gradingRowKey,
  refreshSignal,
  canvasUrl,
  copiedKey,
  onCopy,
  onOpenPreview,
  onAutoGrade,
  onPosted,
}: {
  provider: LlmProvider;
  pending: boolean;
  run: GradeActionState["run"];
  gradingRowKey: string | null;
  refreshSignal: number;
  canvasUrl: string;
  copiedKey: string | null;
  onCopy: (key: string, value: string) => Promise<void>;
  onOpenPreview: (student: string, file: PreviewFile) => void;
  onAutoGrade: (row: CanvasQueueItem) => void;
  onPosted: () => void;
}) {
  const { active } = useInstitutionSelection();
  const { refresh: refreshCounts } = useInstitutionCounts();
  const [rows, setRows] = useState<CanvasQueueItem[]>([]);
  const [queueErrors, setQueueErrors] = useState<Array<{ acronym: string; error: string }>>([]);
  const [queueState, setQueueState] = useState<{ status: "idle" | "loading" | "error"; message: string }>(
    () => ({ status: readActiveInstitution() ? "loading" : "idle", message: "" })
  );
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>("all");
  const [sort, setSort] = useState<QueueSort>("due");
  const [autoRefresh, setAutoRefresh] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(AUTO_REFRESH_KEY) === "1"
  );

  // Triage/grading focus: the open item, an optional bulk "grade in sequence"
  // walk, and a multi-select set for batch actions.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [sequence, setSequence] = useState<string[] | null>(null);
  const [bulk, setBulk] = useState<Set<string>>(new Set());

  // Seen assignments + unwatched courses for the active institution (Supabase).
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [unwatched, setUnwatched] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);

  const resultsHandle = useRef<GradingResultsHandle>(null);

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
      void loadDismissals(active);
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

  // Clear the queue + focus the instant the institution changes (adjust state
  // during render, not an effect).
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    setRows([]);
    setQueueErrors([]);
    setQueueState({ status: active ? "loading" : "idle", message: "" });
    setSelectedKey(null);
    setSequence(null);
    setBulk(new Set());
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
  // (after posting). Await-first so the effect performs no synchronous setState.
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
      if (urgencyFilter !== "all" && urgencyOf(r.dueAt) !== urgencyFilter) return false;
      if (!showHidden && (unwatched.has(r.courseId) || seen.has(r.assignmentId))) return false;
      return true;
    });
    if (term) {
      filtered = filtered.filter(
        (r) => r.title.toLowerCase().includes(term) || r.courseName.toLowerCase().includes(term)
      );
    }
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sort === "count") return b.needsGradingCount - a.needsGradingCount;
      if (sort === "course") {
        return a.courseName.localeCompare(b.courseName) || a.title.localeCompare(b.title);
      }
      // "due": soonest (and overdue) first; items with no due date sort last.
      const at = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY;
      const bt = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY;
      return at - bt;
    });
    return sorted;
  }, [rows, search, kindFilter, urgencyFilter, sort, showHidden, seen, unwatched]);

  const hiddenCount = useMemo(
    () => rows.filter((r) => unwatched.has(r.courseId) || seen.has(r.assignmentId)).length,
    [rows, seen, unwatched]
  );

  // Triage summary across the currently-visible rows.
  const summary = useMemo(() => {
    const total = viewRows.reduce((s, r) => s + r.needsGradingCount, 0);
    const overdue = viewRows.filter((r) => urgencyOf(r.dueAt) === "overdue").length;
    const courses = new Set(viewRows.map((r) => r.courseId)).size;
    return { total, overdue, courses };
  }, [viewRows]);

  const selectedRow = selectedKey ? rows.find((r) => rowKeyOf(r) === selectedKey) ?? null : null;

  const selectRow = (key: string) => {
    setSelectedKey(key);
    setSequence(null); // manual navigation exits any active sequence
  };

  // Advance to the next item in the active order (a bulk sequence, else the
  // visible list). Optionally auto-grade it (used while walking a sequence).
  const advance = (autoGradeNext: boolean) => {
    const order = sequence ?? viewRows.map(rowKeyOf);
    const idx = selectedKey ? order.indexOf(selectedKey) : -1;
    const nextKey = idx >= 0 && idx + 1 < order.length ? order[idx + 1] : null;
    setSelectedKey(nextKey);
    if (nextKey === null && sequence) setSequence(null);
    if (autoGradeNext && nextKey) {
      const nextRow = rows.find((r) => rowKeyOf(r) === nextKey);
      if (nextRow) onAutoGrade(nextRow);
    }
  };

  const inSequence = sequence !== null;

  const handlePostAndNext = async () => {
    await resultsHandle.current?.postAll(false);
    advance(inSequence);
  };

  const toggleBulk = (key: string) => {
    setBulk((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const bulkMarkSeen = async () => {
    const targets = viewRows.filter((r) => bulk.has(rowKeyOf(r)));
    setBulk(new Set());
    for (const row of targets) await markSeen(row, true);
  };

  const startSequence = () => {
    const keys = viewRows.filter((r) => bulk.has(rowKeyOf(r))).map(rowKeyOf);
    if (keys.length === 0) return;
    setSequence(keys);
    setBulk(new Set());
    setSelectedKey(keys[0]);
    const firstRow = rows.find((r) => rowKeyOf(r) === keys[0]);
    if (firstRow) onAutoGrade(firstRow);
  };

  // Whether the current grading run belongs to the open item.
  const activeRun = gradingRowKey && gradingRowKey === selectedKey ? run : null;
  const isGradingSelected = pending && gradingRowKey === selectedKey;

  const renderDetail = (row: CanvasQueueItem) => {
    const badge = urgencyBadge(urgencyOf(row.dueAt));
    const isUnwatched = unwatched.has(row.courseId);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h2 className={styles.lessonSlideTitle} style={{ margin: 0 }}>
              {row.title}
            </h2>
            {badge && <Badge {...badge} />}
            <Badge label={row.kind} bg="var(--field-background)" color="var(--text-secondary)" />
          </div>
          <p className={styles.fieldHint} style={{ marginTop: 4 }}>
            {[
              row.courseName,
              row.dueAt ? `Due ${formatRelative(row.dueAt)}` : "No due date",
              `${row.needsGradingCount} needs grading`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
            <a href={row.htmlUrl} target="_blank" rel="noopener noreferrer" className={styles.fieldHint}>
              Open in Canvas
            </a>
            <a href={row.speedGraderUrl} target="_blank" rel="noopener noreferrer" className={styles.fieldHint}>
              SpeedGrader
            </a>
            <button
              type="button"
              className={styles.clearFileButton}
              onClick={() => markSeen(row, !seen.has(row.assignmentId))}
            >
              {seen.has(row.assignmentId) ? "Unmark seen" : "Mark seen"}
            </button>
            <button
              type="button"
              className={styles.clearFileButton}
              onClick={() => setWatched(row.courseId, isUnwatched)}
            >
              {isUnwatched ? "Resume watching course" : "Stop watching course"}
            </button>
          </div>
        </div>

        <details className={styles.generatedRubricCard}>
          <summary>Description &amp; rubric</summary>
          <p className={styles.fileMetaLabel}>Description</p>
          <pre className={styles.previewContent}>{row.description || "No description in Canvas."}</pre>
          <p className={styles.fileMetaLabel} style={{ marginTop: 12 }}>
            Rubric
          </p>
          <pre className={styles.previewContent}>{row.rubricText || "No rubric in Canvas."}</pre>
        </details>

        {isGradingSelected ? (
          <div className={styles.loadingState} role="status" aria-live="polite">
            <span className={styles.spinner} aria-hidden="true" />
            <div>
              <p className={styles.loadingTitle}>Grading {row.title}…</p>
              <p className={styles.loadingText}>Using the {graderLabel}.</p>
            </div>
          </div>
        ) : activeRun && activeRun.results.length > 0 ? (
          <>
            <GradingResults
              ref={resultsHandle}
              run={activeRun}
              canvasUrl={canvasUrl}
              copiedKey={copiedKey}
              onCopy={onCopy}
              onOpenPreview={onOpenPreview}
              onPosted={onPosted}
            />
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
                paddingTop: 12,
                borderTop: "1px solid var(--field-border)",
              }}
            >
              <button type="button" className={styles.submitButton} onClick={handlePostAndNext}>
                Post &amp; next
              </button>
              <button type="button" className={styles.downloadButton} onClick={() => advance(inSequence)}>
                {inSequence ? "Skip to next" : "Next item"}
              </button>
              {inSequence && (
                <span className={styles.fieldHint} style={{ margin: 0 }}>
                  Sequence: {(sequence?.indexOf(selectedKey ?? "") ?? 0) + 1} of {sequence?.length}
                </span>
              )}
            </div>
          </>
        ) : activeRun && activeRun.results.length === 0 ? (
          <div>
            <p className={styles.emptyState}>No submissions were found to grade for this item.</p>
            <button type="button" className={styles.downloadButton} onClick={() => advance(inSequence)}>
              {inSequence ? "Skip to next" : "Next item"}
            </button>
          </div>
        ) : (
          <div>
            <button
              type="button"
              className={styles.submitButton}
              onClick={() => onAutoGrade(row)}
              disabled={pending}
            >
              {pending ? "Grading…" : "Auto Grade"}
            </button>
            <p className={styles.fieldHint} style={{ marginTop: 8 }}>
              Runs the {graderLabel} on every submission, then shows the editable results here to post
              back to Canvas.
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.form}>
      <div className={styles.field}>
        <label>Institution</label>
        <InstitutionSwitcher metric="grading" />
      </div>

      {!active ? null : (
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* Queue rail */}
          <div style={{ flex: "1 1 360px", minWidth: 300, maxWidth: 540, display: "flex", flexDirection: "column", gap: 10 }}>
            <div className={styles.resultsHeader} style={{ paddingTop: 0 }}>
              <h2>Needs grading</h2>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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

            {queueState.status === "idle" && rows.length > 0 && (
              <p className={styles.fieldHint} style={{ margin: 0 }}>
                {summary.total} to grade across {summary.courses} course{summary.courses === 1 ? "" : "s"}
                {summary.overdue > 0 ? ` · ${summary.overdue} overdue` : ""}
                {updatedAt ? ` · updated ${formatRelative(updatedAt)}` : ""}
              </p>
            )}

            {rows.length > 0 && (
              <>
                <input
                  type="search"
                  className={styles.textInput}
                  placeholder="Search assignment or course"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Chip active={urgencyFilter === "all" && kindFilter === "all"} onClick={() => { setUrgencyFilter("all"); setKindFilter("all"); }}>
                    All
                  </Chip>
                  <Chip active={urgencyFilter === "overdue"} onClick={() => setUrgencyFilter(urgencyFilter === "overdue" ? "all" : "overdue")}>
                    Overdue
                  </Chip>
                  <Chip active={urgencyFilter === "soon"} onClick={() => setUrgencyFilter(urgencyFilter === "soon" ? "all" : "soon")}>
                    Due soon
                  </Chip>
                  <Chip active={kindFilter === "assignment"} onClick={() => setKindFilter(kindFilter === "assignment" ? "all" : "assignment")}>
                    Assignments
                  </Chip>
                  <Chip active={kindFilter === "discussion"} onClick={() => setKindFilter(kindFilter === "discussion" ? "all" : "discussion")}>
                    Discussions
                  </Chip>
                  <select
                    className={styles.textInput}
                    style={{ maxWidth: 170, padding: "4px 8px" }}
                    value={sort}
                    onChange={(e) => setSort(e.target.value as QueueSort)}
                    aria-label="Sort"
                  >
                    <option value="due">Sort: due soonest</option>
                    <option value="count">Sort: most needing grading</option>
                    <option value="course">Sort: course</option>
                  </select>
                  {hiddenCount > 0 && (
                    <Chip active={showHidden} onClick={() => setShowHidden((v) => !v)}>
                      Hidden ({hiddenCount})
                    </Chip>
                  )}
                </div>
              </>
            )}

            {bulk.size > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  flexWrap: "wrap",
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "var(--field-background)",
                  border: "1px solid var(--field-border)",
                }}
              >
                <span className={styles.fieldHint} style={{ margin: 0, fontWeight: 600 }}>
                  {bulk.size} selected
                </span>
                <button type="button" className={styles.submitButton} style={{ padding: "6px 12px" }} onClick={startSequence}>
                  Grade in sequence
                </button>
                <button type="button" className={styles.downloadButton} onClick={() => void bulkMarkSeen()}>
                  Mark seen
                </button>
                <button type="button" className={styles.clearFileButton} onClick={() => setBulk(new Set())}>
                  Clear
                </button>
              </div>
            )}

            {queueState.status === "loading" && (
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
            {queueState.status === "idle" && rows.length === 0 && (
              <p className={styles.emptyState}>Nothing is waiting to be graded right now.</p>
            )}
            {queueState.status === "idle" && rows.length > 0 && viewRows.length === 0 && (
              <p className={styles.emptyState}>No items match your search or filters.</p>
            )}

            {viewRows.map((row) => {
              const key = rowKeyOf(row);
              const badge = urgencyBadge(urgencyOf(row.dueAt));
              const selected = key === selectedKey;
              const isRowGrading = pending && gradingRowKey === key;
              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectRow(key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      selectRow(key);
                    }
                  }}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: "10px 12px",
                    borderRadius: 10,
                    cursor: "pointer",
                    border: `1px solid ${selected ? "var(--accent)" : "var(--field-border)"}`,
                    background: selected ? "var(--field-background)" : "var(--card-background)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={bulk.has(key)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleBulk(key)}
                    aria-label={`Select ${row.title}`}
                    style={{ marginTop: 3 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600 }}>{row.title}</span>
                      {badge && <Badge {...badge} />}
                    </div>
                    <div className={styles.fieldHint} style={{ marginTop: 2 }}>
                      {[
                        row.courseName,
                        row.kind,
                        row.dueAt ? formatRelative(row.dueAt) : "no due date",
                        `${row.needsGradingCount} to grade`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.submitButton}
                    style={{ minWidth: 0, padding: "6px 12px" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      selectRow(key);
                      onAutoGrade(row);
                    }}
                    disabled={pending}
                  >
                    {isRowGrading ? "Grading…" : "Grade"}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Detail / grading pane */}
          <div style={{ flex: "2 1 420px", minWidth: 320 }}>
            {selectedRow ? (
              renderDetail(selectedRow)
            ) : selectedKey ? (
              <p className={styles.emptyState}>
                This item is no longer in the queue. Pick another from the list.
              </p>
            ) : (
              <p className={styles.emptyState}>
                Select an assignment or discussion to review and grade it here. Institutions are managed
                in Settings (top right).
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
