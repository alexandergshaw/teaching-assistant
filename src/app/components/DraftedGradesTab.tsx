"use client";

import { useEffect, useState } from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import TabHeader from "./TabHeader";
import { useSupabase } from "@/context/SupabaseProvider";
import { listPendingGradingDrafts, deleteGradingDraft, type GradingDraft, type GradingDraftPayload } from "@/lib/grading-drafts";
import type { GradingRunEntry, GradeResult } from "@/lib/grade";
import { useDraftedGradesInbox } from "./DraftedGradesInbox";
import { updateGradingDraftPayloadAction, postGradingDraftAction, pullSubmissionAction } from "../actions";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import type { CanvasSubmissionDetail } from "@/lib/canvas";
import CommentEditModal from "./drafted-grades/CommentEditModal";
import styles from "../page.module.css";

type CommentEditState = {
  draftId: string;
  runIdx: number;
  resultIdx: number;
  areaName: string;
} | null;

export default function DraftedGradesTab({ onOpenWorkflow }: { onOpenWorkflow?: (id: string) => void }) {
  const { supabase, user } = useSupabase();
  const { refresh: refreshDraftsBadge } = useDraftedGradesInbox();

  // Data state
  const [drafts, setDrafts] = useState<GradingDraft[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { totalScore: string; overallComment: string }>>({});
  const [confirmPost, setConfirmPost] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState<Set<string>>(new Set());
  const [submissions, setSubmissions] = useState<
    Record<string, { status: "loading" | "ready" | "error"; data?: CanvasSubmissionDetail; error?: string }>
  >({});
  const [commentEditState, setCommentEditState] = useState<CommentEditState>(null);

  // Toolbar state (persisted)
  const [search, setSearch] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("ta-drafts-search") ?? "";
  });
  const [sort, setSort] = useState<"newest" | "oldest">(() => {
    if (typeof window === "undefined") return "newest";
    const stored = localStorage.getItem("ta-drafts-sort");
    return (stored as "newest" | "oldest" | null) ?? "newest";
  });
  const [courseFilter, setCourseFilter] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    return localStorage.getItem("ta-drafts-course") ?? "all";
  });

  // Load drafts on mount and when user changes
  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;

    (async () => {
      setStatus("loading");
      setError(null);
      try {
        const loaded = await listPendingGradingDrafts(supabase, user.id);
        if (!cancelled) {
          setDrafts(loaded);
          setStatus("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load drafted grades");
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  const reload = async () => {
    if (!user) return;
    setStatus("loading");
    try {
      const loaded = await listPendingGradingDrafts(supabase, user.id);
      setDrafts(loaded);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reload failed");
      setStatus("error");
    }
  };

  const handleDelete = async (draft: GradingDraft) => {
    if (confirmDelete !== draft.id) {
      setConfirmDelete(draft.id);
      return;
    }

    setConfirmDelete(null);
    setDrafts((prev) => (prev ? prev.filter((d) => d.id !== draft.id) : null));
    refreshDraftsBadge();

    try {
      await deleteGradingDraft(supabase, user!.id, draft.id);
      setNote({ kind: "success", text: "Drafted grade deleted." });
    } catch (err) {
      setNote({
        kind: "error",
        text: err instanceof Error ? err.message : "Delete failed",
      });
      void reload();
    }
  };

  const startEdit = (draft: GradingDraft) => {
    const seed: Record<string, { totalScore: string; overallComment: string }> = {};
    draft.payload.runs.forEach((entry, runIdx) => {
      entry.run.results.forEach((r, resultIdx) => {
        seed[`${draft.id}:${runIdx}:${resultIdx}`] = {
          totalScore: r.totalScore,
          overallComment: r.overallComment,
        };
      });
    });
    setEdits(seed);
    setEditingDraftId(draft.id);
    setConfirmPost(null);
  };

  const cancelEdit = () => {
    setEditingDraftId(null);
    setEdits({});
  };

  const saveEdit = async (draft: GradingDraft) => {
    const newPayload: GradingDraftPayload = {
      runs: draft.payload.runs.map((entry, runIdx) => ({
        ...entry,
        run: {
          ...entry.run,
          results: entry.run.results.map((r, resultIdx) => {
            const e = edits[`${draft.id}:${runIdx}:${resultIdx}`];
            return e ? { ...r, totalScore: e.totalScore, overallComment: e.overallComment } : r;
          }),
        },
      })),
    };
    setBusy(draft.id);
    try {
      const res = await updateGradingDraftPayloadAction(draft.id, newPayload);
      if ("error" in res) throw new Error(res.error);
      setDrafts((prev) => (prev ? prev.map((d) => (d.id === draft.id ? { ...d, payload: newPayload } : d)) : null));
      setNote({ kind: "success", text: "Draft updated." });
      cancelEdit();
    } catch (err) {
      setNote({ kind: "error", text: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setBusy(null);
    }
  };

  const handlePost = async (draft: GradingDraft) => {
    if (confirmPost !== draft.id) {
      setConfirmPost(draft.id);
      return;
    }
    setConfirmPost(null);
    setBusy(draft.id);
    try {
      const res = await postGradingDraftAction(draft.id);
      if ("error" in res) throw new Error(res.error);
      if (res.failed === 0) {
        setDrafts((prev) => (prev ? prev.filter((d) => d.id !== draft.id) : null));
      } else {
        void reload();
      }
      refreshDraftsBadge();
      setNote({
        kind: res.failed > 0 ? "error" : "success",
        text: `Posted ${res.posted} grade${res.posted === 1 ? "" : "s"}${res.failed > 0 ? `, ${res.failed} failed - draft kept for retry` : ""}.`,
      });
    } catch (err) {
      setNote({ kind: "error", text: err instanceof Error ? err.message : "Could not post grades." });
    } finally {
      setBusy(null);
    }
  };

  // Persist search to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-drafts-search", search);
  }, [search]);

  // Persist sort to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-drafts-sort", sort);
  }, [sort]);

  // Persist courseFilter to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("ta-drafts-course", courseFilter);
  }, [courseFilter]);

  // Derive filtered and sorted data
  const processedDrafts = [...(drafts || [])]
    .sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      return sort === "newest" ? bTime - aTime : aTime - bTime;
    });

  // Get list of distinct courses for filter
  const courseNames = new Set<string>();
  (drafts || []).forEach((d) => {
    d.payload.runs.forEach((entry) => {
      courseNames.add(entry.courseName);
    });
  });
  const sortedCourseNames = Array.from(courseNames).sort();

  // If the persisted course filter is no longer present among the loaded drafts
  // (e.g. that draft was reviewed and left the pending list), fall back to "all"
  // for display and filtering so the tab never silently hides everything. The raw
  // persisted value is kept, so the filter re-activates if that course reappears.
  const effectiveCourseFilter =
    courseFilter !== "all" && !courseNames.has(courseFilter) ? "all" : courseFilter;

  // Track whether any filter is active for the empty-state message
  const hasActiveFilter = search.trim() !== "" || effectiveCourseFilter !== "all";

  // Helper to check if a grade passes filters
  const gradePassesFilter = (entry: GradingRunEntry, result: GradeResult): boolean => {
    const searchLower = search.trim().toLowerCase();
    if (searchLower) {
      const matches =
        result.student.toLowerCase().includes(searchLower) ||
        entry.assignmentName.toLowerCase().includes(searchLower) ||
        entry.courseName.toLowerCase().includes(searchLower);
      if (!matches) return false;
    }
    if (effectiveCourseFilter !== "all" && entry.courseName !== effectiveCourseFilter) return false;
    return true;
  };

  // Build the rendered sections
  const sections: Array<{
    draft: GradingDraft;
    passingGrades: number;
    groups: Array<{
      entry: GradingRunEntry;
      runIdx: number;
      results: Array<{ result: GradeResult; resultIdx: number }>;
    }>;
  }> = [];

  processedDrafts.forEach((draft) => {
    const groups: Array<{
      entry: GradingRunEntry;
      runIdx: number;
      results: Array<{ result: GradeResult; resultIdx: number }>;
    }> = [];
    let passingGradesTotal = 0;

    draft.payload.runs.forEach((entry, runIdx) => {
      const results: Array<{ result: GradeResult; resultIdx: number }> = [];
      entry.run.results.forEach((result, resultIdx) => {
        if (gradePassesFilter(entry, result)) {
          results.push({ result, resultIdx });
          passingGradesTotal += 1;
        }
      });
      if (results.length > 0) {
        groups.push({ entry, runIdx, results });
      }
    });

    if (passingGradesTotal > 0) {
      sections.push({ draft, passingGrades: passingGradesTotal, groups });
    }
  });

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const submissionTarget = (entry: GradingRunEntry, result: GradeResult) => {
    if (typeof result.userId !== "number") return null;
    const courseId = parseCanvasCourseId(entry.canvasUrl);
    const assignmentId = entry.canvasUrl.match(/\/assignments\/(\d+)/)?.[1] ?? null;
    const code = (entry.institution ?? "").trim();
    if (!courseId || !assignmentId || !code) return null;
    return { code, courseId, assignmentId, userId: result.userId };
  };

  const togglePreview = (key: string, entry: GradingRunEntry, result: GradeResult) => {
    setPreviewOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); return next; }
      next.add(key);
      return next;
    });
    // Lazy-load once.
    if (previewOpen.has(key) || submissions[key]) return;
    const t = submissionTarget(entry, result);
    if (!t) return;
    setSubmissions((prev) => ({ ...prev, [key]: { status: "loading" } }));
    void (async () => {
      const res = await pullSubmissionAction(t.code, t.courseId, t.assignmentId, t.userId);
      setSubmissions((prev) => ({
        ...prev,
        [key]: "error" in res
          ? { status: "error", error: res.error }
          : { status: "ready", data: res.submission },
      }));
    })();
  };

  const formatDateTime = (iso: string): string => {
    const date = new Date(iso);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <section className={styles.card}>
      <TabHeader
        eyebrow="Grades"
        title="Drafted grades"
        subtitle="AI-drafted grades from the Grade submissions to a draft workflow live here until you review and post them. Nothing here has been sent to your LMS yet."
      />

      {note && (
        <div className={note.kind === "error" ? styles.error : styles.fieldHint}>
          {note.text}
        </div>
      )}

      {status === "loading" && (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <div className={styles.loadingTitle}>Loading drafted grades...</div>
        </div>
      )}

      {status === "error" && (
        <div className={styles.error}>{error || "Failed to load drafted grades"}</div>
      )}

      {status === "ready" && drafts !== null && (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => void reload()}
            >
              Refresh
            </Button>
            <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <TextField
                size="small"
                type="search"
                placeholder="Search by student, assignment, or course..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                sx={{ flex: "1 1 200px", maxWidth: 300 }}
              />
              <TextField
                select
                size="small"
                value={effectiveCourseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
                sx={{ minWidth: 140 }}
              >
                <MenuItem value="all">All courses</MenuItem>
                {sortedCourseNames.map((courseName) => (
                  <MenuItem key={courseName} value={courseName}>
                    {courseName}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                value={sort}
                onChange={(e) => setSort(e.target.value as "newest" | "oldest")}
                sx={{ minWidth: 120 }}
              >
                <MenuItem value="newest">Newest</MenuItem>
                <MenuItem value="oldest">Oldest</MenuItem>
              </TextField>
            </div>
          </div>

          <div className={styles.fieldHint} style={{ margin: 0 }}>
            {sections.reduce((total, s) => total + s.passingGrades, 0)} drafted grade{sections.reduce((total, s) => total + s.passingGrades, 0) === 1 ? "" : "s"} across {sections.length} draft{sections.length === 1 ? "" : "s"}
          </div>

          {drafts.length === 0 ? (
            <div className={styles.emptyState}>No drafted grades yet. Run the Grade submissions to a draft workflow (attended or scheduled) and its results will appear here for you to review and post.</div>
          ) : sections.length === 0 ? (
            <div className={styles.emptyState}>
              {hasActiveFilter
                ? "No drafted grades match your search."
                : "These drafts contain no gradable results yet."}
            </div>
          ) : (
            <div className={styles.draftList}>
              {sections.map(({ draft, groups }) => (
                <div key={draft.id} className={styles.draftSection}>
                  <div className={styles.draftSectionHead}>
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
                        <div className={styles.draftSectionTitle}>{draft.summary || "Grading draft"}</div>
                        {draft.source && (
                          <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>
                            {draft.source === "repos" ? "Repo grade" : draft.source === "lms" ? "LMS grade" : "Submissions zip grade"}
                          </span>
                        )}
                      </div>
                      {draft.payload.runs.length > 0 && (
                        <div className={styles.draftSectionMeta} style={{ marginBottom: 4 }}>
                          Class: {[...new Set(draft.payload.runs.map((r) => r.courseName))].sort().join(", ")}
                        </div>
                      )}
                      <div className={styles.draftSectionMeta}>
                        {formatDateTime(draft.createdAt)} · {groups.reduce((total, g) => total + g.results.length, 0)} grade{groups.reduce((total, g) => total + g.results.length, 0) === 1 ? "" : "s"}
                      </div>
                      {draft.workflowId && draft.workflowName && onOpenWorkflow && (
                        <button
                          type="button"
                          className={styles.linkButton}
                          style={{ marginTop: 4 }}
                          onClick={() => onOpenWorkflow(draft.workflowId!)}
                        >
                          From workflow: {draft.workflowName}
                        </button>
                      )}
                    </div>
                    <div className={styles.draftSectionActions}>
                      {editingDraftId === draft.id ? (
                        <>
                          <Button variant="contained" size="small" disabled={busy === draft.id} onClick={() => void saveEdit(draft)}>
                            {busy === draft.id ? "Saving..." : "Save"}
                          </Button>
                          <Button variant="outlined" size="small" disabled={busy === draft.id} onClick={cancelEdit}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="outlined" size="small" onClick={() => startEdit(draft)}>
                            Edit
                          </Button>
                          <Button variant="contained" size="small" disabled={busy === draft.id} onClick={() => void handlePost(draft)}>
                            {busy === draft.id ? "Posting..." : confirmPost === draft.id ? "Confirm post" : "Post"}
                          </Button>
                          <Button variant="outlined" size="small" color="error" onClick={() => void handleDelete(draft)}>
                            {confirmDelete === draft.id ? "Confirm delete" : "Delete"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {groups.map(({ entry, runIdx, results }) => (
                    <div key={`${draft.id}:${runIdx}`}>
                      <div className={styles.draftAssignmentHead}>
                        {entry.courseName} — {entry.assignmentName}
                        {entry.pointsPossible != null ? ` (out of ${entry.pointsPossible})` : ""}
                      </div>
                      {results.map(({ result, resultIdx }) => {
                        const expandKey = `${draft.id}:${runIdx}:${resultIdx}`;
                        const isExpanded = expanded.has(expandKey);
                        return (
                          <div key={expandKey}>
                            <div className={styles.draftGradeRow}>
                              <div className={styles.draftGradeStudent}>{result.student}</div>
                              {editingDraftId === draft.id ? (
                                <TextField
                                  size="small"
                                  value={edits[expandKey]?.totalScore ?? result.totalScore}
                                  onChange={(e) =>
                                    setEdits((prev) => ({ ...prev, [expandKey]: { ...(prev[expandKey] ?? { totalScore: result.totalScore, overallComment: result.overallComment }), totalScore: e.target.value } }))
                                  }
                                  sx={{ width: 90 }}
                                />
                              ) : (
                                <div className={styles.draftGradeScore}>{result.totalScore || "—"}</div>
                              )}
                              {editingDraftId === draft.id ? (
                                <TextField
                                  size="small"
                                  value={edits[expandKey]?.overallComment ?? result.overallComment}
                                  onChange={(e) =>
                                    setEdits((prev) => ({ ...prev, [expandKey]: { ...(prev[expandKey] ?? { totalScore: result.totalScore, overallComment: result.overallComment }), overallComment: e.target.value } }))
                                  }
                                  sx={{ flex: 1, minWidth: 160 }}
                                />
                              ) : (
                                <div className={styles.draftGradeComment} title={result.overallComment}>
                                  {result.overallComment || ""}
                                </div>
                              )}
                              <Button
                                size="small"
                                variant="text"
                                onClick={() => toggleExpand(expandKey)}
                              >
                                {isExpanded ? "Hide" : "Details"}
                              </Button>
                              {submissionTarget(entry, result) && (
                                <Button
                                  size="small"
                                  variant="text"
                                  onClick={() => togglePreview(expandKey, entry, result)}
                                >
                                  {previewOpen.has(expandKey) ? "Hide submission" : "Preview"}
                                </Button>
                              )}
                            </div>
                            {isExpanded && (
                              <div className={styles.draftExpand}>
                                {result.rubricAreas.length > 0 && (
                                  <>
                                    {result.rubricAreas.map((area, idx) => (
                                      <div key={idx} className={styles.draftRubricArea}>
                                        <span className={styles.draftRubricAreaName}>{area.area}</span>
                                        <span className={styles.draftRubricAreaScore}>{area.score}</span>
                                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1 }}>
                                          <span className={styles.fieldHint} style={{ margin: 0, flex: 1 }}>
                                            {area.comment}
                                          </span>
                                          <Button
                                            size="small"
                                            variant="text"
                                            onClick={() => setCommentEditState({ draftId: draft.id, runIdx, resultIdx, areaName: area.area })}
                                            style={{ whiteSpace: "nowrap", flexShrink: 0 }}
                                          >
                                            Preview / edit
                                          </Button>
                                        </div>
                                      </div>
                                    ))}
                                  </>
                                )}
                                {result.overallComment && (
                                  <>
                                    <div className={styles.fieldHint} style={{ margin: 0 }}>
                                      Comment
                                    </div>
                                    <p className={styles.draftFeedback}>{result.overallComment}</p>
                                  </>
                                )}
                                {result.feedback && result.feedback !== result.overallComment && (
                                  <>
                                    <div className={styles.fieldHint} style={{ margin: 0 }}>
                                      Feedback
                                    </div>
                                    <p className={styles.draftFeedback}>{result.feedback}</p>
                                  </>
                                )}
                                {result.rubricAreas.length === 0 && !result.overallComment && (!result.feedback || result.feedback === result.overallComment) && (
                                  <span className={styles.fieldHint}>No additional detail.</span>
                                )}
                              </div>
                            )}
                            {previewOpen.has(expandKey) && (
                              <div className={styles.draftExpand}>
                                {(() => {
                                  const sub = submissions[expandKey];
                                  if (!sub || sub.status === "loading") return <span className={styles.fieldHint}>Loading submission...</span>;
                                  if (sub.status === "error") return <div className={styles.error}>{sub.error || "Could not load the submission."}</div>;
                                  const d = sub.data!;
                                  return (
                                    <>
                                      <div className={styles.fieldHint} style={{ margin: 0 }}>
                                        Submission ({d.workflowState}{d.submittedAt ? `, ${new Date(d.submittedAt).toLocaleString()}` : ""})
                                      </div>
                                      {d.text && <p className={styles.draftFeedback}>{d.text}</p>}
                                      {d.files.map((f, i) => (
                                        <div key={i} className={styles.fieldHint} style={{ margin: 0 }}>File: {f.name}</div>
                                      ))}
                                      {!d.text && d.files.length === 0 && <span className={styles.fieldHint}>No submission content.</span>}
                                      {d.speedGraderUrl && (
                                        <a href={d.speedGraderUrl} target="_blank" rel="noreferrer" className={styles.linkButton} style={{ marginTop: 4 }}>
                                          Open in SpeedGrader
                                        </a>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {commentEditState && (() => {
            const draft = drafts.find((d) => d.id === commentEditState.draftId);
            const entry = draft?.payload.runs[commentEditState.runIdx];
            const result = entry?.run.results[commentEditState.resultIdx];
            const area = result?.rubricAreas.find((a) => a.area === commentEditState.areaName);

            if (!draft || !entry || !result || !area) {
              setCommentEditState(null);
              return null;
            }

            return (
              <CommentEditModal
                studentName={result.student}
                areaName={area.area}
                draftSummary={draft.summary}
                initialComment={area.comment}
                payload={draft.payload}
                runIndex={commentEditState.runIdx}
                resultIndex={commentEditState.resultIdx}
                draftId={draft.id}
                onSave={(newPayload) => {
                  setDrafts((prev) =>
                    prev ? prev.map((d) => (d.id === draft.id ? { ...d, payload: newPayload } : d)) : null
                  );
                }}
                onClose={() => setCommentEditState(null)}
              />
            );
          })()}
        </>
      )}
    </section>
  );
}
