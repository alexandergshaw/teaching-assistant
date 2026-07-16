"use client";

import { useEffect, useState } from "react";
import { Button, TextField, MenuItem } from "@mui/material";
import TabHeader from "./TabHeader";
import { useSupabase } from "@/context/SupabaseProvider";
import { listPendingGradingDrafts, deleteGradingDraft, type GradingDraft } from "@/lib/grading-drafts";
import type { GradingRunEntry, GradeResult } from "@/lib/grade";
import { useDraftedGradesInbox } from "./DraftedGradesInbox";
import styles from "../page.module.css";

export default function DraftedGradesTab({ onReviewDrafts }: { onReviewDrafts?: () => void }) {
  const { supabase, user } = useSupabase();
  const { refresh: refreshDraftsBadge } = useDraftedGradesInbox();

  // Data state
  const [drafts, setDrafts] = useState<GradingDraft[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
                      <div className={styles.draftSectionTitle}>{draft.summary || "Grading draft"}</div>
                      <div className={styles.draftSectionMeta}>
                        {formatDateTime(draft.createdAt)} · {groups.reduce((total, g) => total + g.results.length, 0)} grade{groups.reduce((total, g) => total + g.results.length, 0) === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className={styles.draftSectionActions}>
                      <Button variant="outlined" size="small" onClick={() => onReviewDrafts?.()}>
                        Review & post
                      </Button>
                      <Button
                        variant="outlined"
                        size="small"
                        color="error"
                        onClick={() => void handleDelete(draft)}
                      >
                        {confirmDelete === draft.id ? "Confirm delete" : "Delete"}
                      </Button>
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
                              <div className={styles.draftGradeScore}>{result.totalScore || "—"}</div>
                              <div className={styles.draftGradeComment} title={result.overallComment}>
                                {result.overallComment || ""}
                              </div>
                              <Button
                                size="small"
                                variant="text"
                                onClick={() => toggleExpand(expandKey)}
                              >
                                {isExpanded ? "Hide" : "Details"}
                              </Button>
                            </div>
                            {isExpanded && (
                              <div className={styles.draftExpand}>
                                {result.rubricAreas.length > 0 && (
                                  <>
                                    {result.rubricAreas.map((area, idx) => (
                                      <div key={idx} className={styles.draftRubricArea}>
                                        <span className={styles.draftRubricAreaName}>{area.area}</span>
                                        <span className={styles.draftRubricAreaScore}>{area.score}</span>
                                        <span className={styles.fieldHint} style={{ margin: 0 }}>
                                          {area.comment}
                                        </span>
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
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
