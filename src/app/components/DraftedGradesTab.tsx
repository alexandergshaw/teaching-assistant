"use client";

import { Fragment, useEffect, useState } from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import TabHeader from "./TabHeader";
import { useSupabase } from "@/context/SupabaseProvider";
import { listPendingGradingDrafts, deleteGradingDraft, type GradingDraft, type GradingDraftPayload } from "@/lib/grading-drafts";
import type { GradingRunEntry, GradeResult } from "@/lib/grade";
import { useDraftedGradesInbox } from "./DraftedGradesInbox";
import { updateGradingDraftPayloadAction, postGradingDraftAction, pullSubmissionAction } from "../actions";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import type { CanvasSubmissionDetail } from "@/lib/canvas";
import { looksLikeGithubUrl } from "@/lib/submission-repo";
import TabShell from "./TabShell";
import CommentEditModal from "./drafted-grades/CommentEditModal";
import SubmissionCodePanel from "./drafted-grades/SubmissionCodePanel";
import AssignmentChecklistPanel from "./drafted-grades/AssignmentChecklistPanel";
import { buildAssignmentChecklistSections, applyDerivedChecklist } from "@/lib/grading-draft-checklist";
import {
  buildDraftSections,
  collectCourseNames,
  draftCourseNames,
  resolveEffectiveCourseFilter,
  summarizeSections,
  hasActiveFilter,
  formatDraftTimestamp,
  parseCollapsedDraftIds,
  parseStoredSortOrder,
  type DraftSortOrder,
} from "@/lib/grading-draft-view";
import styles from "../page.module.css";
import local from "./DraftedGradesTab.module.css";

type CommentEditState = {
  draftId: string;
  runIdx: number;
  resultIdx: number;
  areaName: string;
} | null;

const COLLAPSED_DRAFTS_KEY = "ta-drafts-collapsed";

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
  const [sort, setSort] = useState<DraftSortOrder>(() => {
    if (typeof window === "undefined") return "newest";
    return parseStoredSortOrder(localStorage.getItem("ta-drafts-sort"));
  });
  const [courseFilter, setCourseFilter] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    return localStorage.getItem("ta-drafts-course") ?? "all";
  });

  // Which draft sections are collapsed to just their header - a density
  // control, persisted like every other ta- control so a reload doesn't
  // silently re-expand (or re-collapse) everything the instructor already
  // triaged. A corrupt/unknown stored value degrades to "nothing collapsed"
  // via parseCollapsedDraftIds, never to hiding every draft.
  const [collapsedDrafts, setCollapsedDrafts] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    return new Set(parseCollapsedDraftIds(localStorage.getItem(COLLAPSED_DRAFTS_KEY)));
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

  const setDraftCollapsed = (draftId: string, collapsed: boolean) => {
    setCollapsedDrafts((prev) => {
      const next = new Set(prev);
      if (collapsed) next.add(draftId);
      else next.delete(draftId);
      return next;
    });
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
    // Editing needs the rows visible - uncollapse so the inputs aren't hidden.
    setDraftCollapsed(draft.id, false);
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

  // Cache a freshly derived per-assignment checklist onto the draft so
  // reopening this page never re-derives (and re-bills) it. Optimistic: the
  // local draft state updates immediately so the panel can collapse the
  // "derive" control right away, and the save happens in the background -
  // matching saveEdit/CommentEditModal's existing pattern for editing a
  // draft's payload.
  const handleChecklistDerived = async (draft: GradingDraft, runIdx: number, items: string[]) => {
    const newPayload = applyDerivedChecklist(draft.payload, runIdx, items);
    setDrafts((prev) => (prev ? prev.map((d) => (d.id === draft.id ? { ...d, payload: newPayload } : d)) : null));
    try {
      const res = await updateGradingDraftPayloadAction(draft.id, newPayload);
      if ("error" in res) {
        setNote({ kind: "error", text: `Checklist derived, but could not be saved: ${res.error}` });
      }
    } catch (err) {
      setNote({
        kind: "error",
        text: `Checklist derived, but could not be saved: ${err instanceof Error ? err.message : "unknown error"}`,
      });
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

  // Persist which draft sections are collapsed
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(COLLAPSED_DRAFTS_KEY, JSON.stringify(Array.from(collapsedDrafts)));
  }, [collapsedDrafts]);

  // Get list of distinct courses for filter
  const courseNames = collectCourseNames(drafts || []);

  // If the persisted course filter is no longer present among the loaded drafts
  // (e.g. that draft was reviewed and left the pending list), fall back to "all"
  // for display and filtering so the tab never silently hides everything. The raw
  // persisted value is kept, so the filter re-activates if that course reappears.
  const effectiveCourseFilter = resolveEffectiveCourseFilter(courseFilter, courseNames);

  const activeFilter = hasActiveFilter(search, effectiveCourseFilter);

  // Build the rendered sections: grouped, filtered, and sorted.
  const sections = buildDraftSections(drafts || [], { search, courseFilter: effectiveCourseFilter, sort });
  const { totalGrades, totalDrafts } = summarizeSections(sections);

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

  return (
    <TabShell>
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
            {sections.length > 0 && (
              <Button
                variant="text"
                size="small"
                onClick={() =>
                  setCollapsedDrafts((prev) => {
                    const allCollapsed = sections.every((s) => prev.has(s.draft.id));
                    return allCollapsed ? new Set() : new Set(sections.map((s) => s.draft.id));
                  })
                }
              >
                {sections.every((s) => collapsedDrafts.has(s.draft.id)) ? "Expand all" : "Collapse all"}
              </Button>
            )}
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
                {courseNames.map((courseName) => (
                  <MenuItem key={courseName} value={courseName}>
                    {courseName}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                size="small"
                value={sort}
                onChange={(e) => setSort(e.target.value as DraftSortOrder)}
                sx={{ minWidth: 120 }}
              >
                <MenuItem value="newest">Newest</MenuItem>
                <MenuItem value="oldest">Oldest</MenuItem>
              </TextField>
            </div>
          </div>

          <div className={styles.fieldHint} style={{ margin: 0 }}>
            {totalGrades} drafted grade{totalGrades === 1 ? "" : "s"} across {totalDrafts} draft{totalDrafts === 1 ? "" : "s"}
          </div>

          {drafts.length === 0 ? (
            <div className={styles.emptyState}>No drafted grades yet. Run the Grade submissions to a draft workflow (attended or scheduled) and its results will appear here for you to review and post.</div>
          ) : sections.length === 0 ? (
            <div className={styles.emptyState}>
              {activeFilter
                ? "No drafted grades match your search."
                : "These drafts contain no gradable results yet."}
            </div>
          ) : (
            <div className={styles.draftList}>
              {sections.map(({ draft, groups }) => {
                const checklistSections = buildAssignmentChecklistSections(draft.payload);
                const isCollapsed = collapsedDrafts.has(draft.id);
                const gradeCount = groups.reduce((total, g) => total + g.results.length, 0);
                const courses = draftCourseNames(draft);
                return (
                <div key={draft.id} className={styles.draftSection}>
                  <div className={styles.draftSectionHead}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className={styles.linkButton}
                          onClick={() => setDraftCollapsed(draft.id, !isCollapsed)}
                          aria-expanded={!isCollapsed}
                          style={{ fontWeight: 700 }}
                        >
                          {isCollapsed ? "▸" : "▾"}
                        </button>
                        <div className={styles.draftSectionTitle}>{draft.summary || "Grading draft"}</div>
                        {draft.source && (
                          <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>
                            {draft.source === "repos" ? "Repo grade" : draft.source === "lms" ? "LMS grade" : "Submissions zip grade"}
                          </span>
                        )}
                      </div>
                      {courses.length > 0 && (
                        <div className={local.courseChips}>
                          {courses.map((courseName) => (
                            <span key={courseName} className={styles.typeChip}>
                              {courseName}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className={styles.draftSectionMeta} style={{ marginTop: 3 }}>
                        {formatDraftTimestamp(draft.createdAt)} · {gradeCount} grade{gradeCount === 1 ? "" : "s"}
                        {draft.workflowId && draft.workflowName && onOpenWorkflow && (
                          <>
                            {" · "}
                            <button
                              type="button"
                              className={styles.linkButton}
                              onClick={() => onOpenWorkflow(draft.workflowId!)}
                            >
                              From workflow: {draft.workflowName}
                            </button>
                          </>
                        )}
                      </div>
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

                  {!isCollapsed && (
                    <div className={local.tableWrap}>
                      <table className={local.table}>
                        <thead>
                          <tr>
                            <th className={local.colStudent}>Student</th>
                            <th className={local.colScore}>Score</th>
                            <th className={local.colComment}>Comment</th>
                            <th className={local.colActions}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {groups.map(({ entry, runIdx, results }) => {
                            const checklistSection = checklistSections.find((s) => s.runIndex === runIdx);
                            return (
                              <Fragment key={`${draft.id}:${runIdx}`}>
                                <tr className={local.groupRow}>
                                  <td colSpan={4}>
                                    <div className={local.groupHeader}>
                                      <span className={local.groupTitle}>
                                        {entry.courseName} — {entry.assignmentName}
                                        {entry.pointsPossible != null ? ` (out of ${entry.pointsPossible})` : ""}
                                      </span>
                                      <span className={local.groupCount}>
                                        {results.length} student{results.length === 1 ? "" : "s"}
                                      </span>
                                      {checklistSection && (
                                        <AssignmentChecklistPanel
                                          section={checklistSection}
                                          entry={entry}
                                          onChecklistDerived={(items) => void handleChecklistDerived(draft, runIdx, items)}
                                        />
                                      )}
                                    </div>
                                  </td>
                                </tr>
                                {results.map(({ result, resultIdx }, idx) => {
                                  const expandKey = `${draft.id}:${runIdx}:${resultIdx}`;
                                  const isExpanded = expanded.has(expandKey);
                                  const isPreviewOpen = previewOpen.has(expandKey);
                                  const hasSubmissionTarget = !!submissionTarget(entry, result);
                                  return (
                                    <Fragment key={expandKey}>
                                      <tr className={`${local.dataRow} ${idx % 2 === 1 ? local.rowEven : ""}`}>
                                        <td className={local.colStudent}>
                                          <span className={local.studentName}>{result.student}</span>
                                        </td>
                                        <td className={local.colScore}>
                                          {editingDraftId === draft.id ? (
                                            <TextField
                                              size="small"
                                              value={edits[expandKey]?.totalScore ?? result.totalScore}
                                              onChange={(e) =>
                                                setEdits((prev) => ({ ...prev, [expandKey]: { ...(prev[expandKey] ?? { totalScore: result.totalScore, overallComment: result.overallComment }), totalScore: e.target.value } }))
                                              }
                                              sx={{ width: 74 }}
                                              slotProps={{ htmlInput: { style: { padding: "4px 6px" } } }}
                                            />
                                          ) : (
                                            <span className={local.score}>{result.totalScore || "—"}</span>
                                          )}
                                        </td>
                                        <td className={local.colComment}>
                                          {editingDraftId === draft.id ? (
                                            <TextField
                                              size="small"
                                              fullWidth
                                              value={edits[expandKey]?.overallComment ?? result.overallComment}
                                              onChange={(e) =>
                                                setEdits((prev) => ({ ...prev, [expandKey]: { ...(prev[expandKey] ?? { totalScore: result.totalScore, overallComment: result.overallComment }), overallComment: e.target.value } }))
                                              }
                                              slotProps={{ htmlInput: { style: { padding: "4px 6px" } } }}
                                            />
                                          ) : (
                                            <span className={local.comment} title={result.overallComment}>
                                              {result.overallComment || ""}
                                            </span>
                                          )}
                                        </td>
                                        <td className={local.colActions}>
                                          <div className={local.actionsCell}>
                                            <Button
                                              size="small"
                                              variant="text"
                                              style={{ minWidth: 0 }}
                                              onClick={() => toggleExpand(expandKey)}
                                            >
                                              {isExpanded ? "Hide" : "Details"}
                                            </Button>
                                            {hasSubmissionTarget && (
                                              <Button
                                                size="small"
                                                variant="text"
                                                style={{ minWidth: 0 }}
                                                onClick={() => togglePreview(expandKey, entry, result)}
                                              >
                                                {isPreviewOpen ? "Hide submission" : "Preview"}
                                              </Button>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                      {isExpanded && (
                                        <tr>
                                          <td colSpan={4} className={local.detailCell}>
                                            <div className={styles.draftExpand}>
                                              {result.gradedRepo && (
                                                <div className={styles.fieldHint} style={{ margin: "0 0 6px" }}>
                                                  Graded from: {result.gradedRepo} @ {(result.gradedRef ?? "").slice(0, 12)}
                                                </div>
                                              )}
                                              {result.rubricAreas.length > 0 && (
                                                <>
                                                  {result.rubricAreas.map((area, areaIdx) => (
                                                    <div key={areaIdx} className={styles.draftRubricArea}>
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
                                          </td>
                                        </tr>
                                      )}
                                      {isPreviewOpen && (
                                        <tr>
                                          <td colSpan={4} className={local.detailCell}>
                                            <div className={styles.draftExpand}>
                                              {(() => {
                                                const sub = submissions[expandKey];
                                                if (!sub || sub.status === "loading") return <span className={styles.fieldHint}>Loading submission...</span>;
                                                if (sub.status === "error") return <div className={styles.error}>{sub.error || "Could not load the submission."}</div>;
                                                const d = sub.data!;
                                                const isGithubSubmission = !!d.url && looksLikeGithubUrl(d.url);
                                                return (
                                                  <>
                                                    <div className={styles.fieldHint} style={{ margin: 0 }}>
                                                      Submission ({d.workflowState}{d.submittedAt ? `, ${new Date(d.submittedAt).toLocaleString()}` : ""})
                                                    </div>
                                                    {d.text && <p className={styles.draftFeedback}>{d.text}</p>}
                                                    {d.files.map((f, i) => (
                                                      <div key={i} className={styles.fieldHint} style={{ margin: 0 }}>File: {f.name}</div>
                                                    ))}
                                                    {!d.text && d.files.length === 0 && !d.url && (
                                                      <span className={styles.fieldHint}>No submission content.</span>
                                                    )}
                                                    {d.url && isGithubSubmission && (
                                                      <div style={{ marginTop: 4 }}>
                                                        <div className={styles.fieldHint} style={{ margin: "0 0 6px" }}>
                                                          Submitted link: {d.url}
                                                        </div>
                                                        <SubmissionCodePanel submissionUrl={d.url} />
                                                      </div>
                                                    )}
                                                    {d.url && !isGithubSubmission && (
                                                      <div className={styles.fieldHint} style={{ margin: 0 }}>
                                                        Submitted link:{" "}
                                                        <a href={d.url} target="_blank" rel="noreferrer" className={styles.linkButton}>
                                                          {d.url}
                                                        </a>
                                                      </div>
                                                    )}
                                                    {d.speedGraderUrl && (
                                                      <a href={d.speedGraderUrl} target="_blank" rel="noreferrer" className={styles.linkButton} style={{ marginTop: 4 }}>
                                                        Open in SpeedGrader
                                                      </a>
                                                    )}
                                                  </>
                                                );
                                              })()}
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  );
                                })}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                );
              })}
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
    </TabShell>
  );
}
