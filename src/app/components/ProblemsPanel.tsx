"use client";

import { useEffect, useState } from "react";
import { useSupabase } from "@/context/SupabaseProvider";
import { formatRelative } from "@/app/utils/time";
import {
  createProblem,
  updateProblem,
  deleteProblem,
  listProblems,
  listSolutionsForProblem,
  type Problem,
  type ProblemSolution,
} from "@/lib/problems";
import { createWorkflowTrigger, deleteWorkflowTrigger, listWorkflowTriggers, updateWorkflowTrigger } from "@/lib/workflow-triggers";
import styles from "../knowledge/knowledge.module.css";

/**
 * Panel for managing user problems and their proposed solutions.
 * Problems are items the user keeps track of; the problem-solving-companion
 * workflow can be set up to automatically propose solutions whenever any other
 * workflow completes.
 */
export default function ProblemsPanel() {
  const { supabase, user } = useSupabase();
  const [problems, setProblems] = useState<Problem[]>([]);
  const [solutions, setSolutions] = useState<Record<string, ProblemSolution[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "resolved" | "all">(() => {
    if (typeof window === "undefined") return "open";
    const stored = localStorage.getItem("ta-problems-filter");
    return stored === "resolved" || stored === "all" || stored === "open" ? stored : "open";
  });
  const [draftText, setDraftText] = useState(() =>
    typeof window === "undefined" ? "" : localStorage.getItem("ta-problems-draft") ?? ""
  );
  const [draftDetail, setDraftDetail] = useState(() =>
    typeof window === "undefined" ? "" : localStorage.getItem("ta-problems-draft-detail") ?? ""
  );
  const [expandedProblem, setExpandedProblem] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [autoProposalEnabled, setAutoProposalEnabled] = useState(false);
  const [checkingAutoProposal, setCheckingAutoProposal] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem("ta-problems-filter", filter);
  }, [filter]);

  useEffect(() => {
    localStorage.setItem("ta-problems-draft", draftText);
  }, [draftText]);

  useEffect(() => {
    localStorage.setItem("ta-problems-draft-detail", draftDetail);
  }, [draftDetail]);

  // Load problems and the auto-proposal trigger state on mount or when the
  // user changes. Inline async bodies with a cancelled flag; every setState
  // happens after an await, and mutation handlers update local state directly.
  useEffect(() => {
    if (!user || !supabase) return;
    let cancelled = false;
    (async () => {
      try {
        const allProblems = await listProblems(supabase, user.id);
        const newSolutions: Record<string, ProblemSolution[]> = {};
        for (const problem of allProblems) {
          newSolutions[problem.id] = await listSolutionsForProblem(supabase, user.id, problem.id);
        }
        if (!cancelled) {
          setProblems(allProblems);
          setSolutions(newSolutions);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load problems.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    (async () => {
      try {
        const triggers = await listWorkflowTriggers(supabase, user.id);
        const autoProposal = triggers.find(
          (t) =>
            t.eventType === "workflow-completed" &&
            t.workflowId === "problem-solving-companion" &&
            (t.eventConfig.workflow === "*" || t.eventConfig.sourceWorkflowId === "*")
        );
        if (!cancelled) setAutoProposalEnabled(!!autoProposal);
      } catch (err) {
        console.error("Failed to check auto-proposal trigger:", err);
      } finally {
        if (!cancelled) setCheckingAutoProposal(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  const handleAddProblem = async () => {
    if (!user || !supabase || !draftText.trim()) return;
    try {
      setSavingId("new");
      const newProblem = await createProblem(supabase, user.id, {
        title: draftText.trim(),
        detail: draftDetail.trim(),
      });
      setProblems((prev) => [newProblem, ...prev]);
      setSolutions((prev) => ({ ...prev, [newProblem.id]: [] }));
      setDraftText("");
      setDraftDetail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create problem.");
    } finally {
      setSavingId(null);
    }
  };

  const handleUpdateStatus = async (problemId: string, newStatus: "open" | "resolved") => {
    if (!user || !supabase) return;
    try {
      setSavingId(problemId);
      await updateProblem(supabase, user.id, problemId, { status: newStatus });
      setProblems((prev) =>
        prev.map((p) => (p.id === problemId ? { ...p, status: newStatus } : p))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update problem.");
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteProblem = async (problemId: string) => {
    if (!user || !supabase) return;
    try {
      setSavingId(problemId);
      await deleteProblem(supabase, user.id, problemId);
      setProblems((prev) => prev.filter((p) => p.id !== problemId));
      setSolutions((prev) => {
        const newSol = { ...prev };
        delete newSol[problemId];
        return newSol;
      });
      setPendingDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete problem.");
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteClick = (problemId: string) => {
    if (pendingDeleteId === problemId) {
      handleDeleteProblem(problemId);
    } else {
      setPendingDeleteId(problemId);
      setTimeout(() => setPendingDeleteId(null), 2000);
    }
  };

  const handleToggleAutoProposal = async () => {
    if (!user || !supabase) return;
    try {
      setCheckingAutoProposal(true);
      if (autoProposalEnabled) {
        const triggers = await listWorkflowTriggers(supabase, user.id);
        const autoProposal = triggers.find(
          (t) =>
            t.eventType === "workflow-completed" &&
            t.workflowId === "problem-solving-companion" &&
            (t.eventConfig.workflow === "*" || t.eventConfig.sourceWorkflowId === "*")
        );
        if (autoProposal) {
          await deleteWorkflowTrigger(supabase, user.id, autoProposal.id);
          setAutoProposalEnabled(false);
        }
      } else {
        const trigger = await createWorkflowTrigger(supabase, user.id, {
          eventType: "workflow-completed",
          eventConfig: { workflow: "*" },
          workflowId: "problem-solving-companion",
          workflowName: "Propose Solutions to Open Problems",
          unattended: true,
          fieldValues: {},
        });
        await updateWorkflowTrigger(supabase, user.id, trigger.id, { enabled: true });
        setAutoProposalEnabled(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update auto-proposal setting.");
    } finally {
      setCheckingAutoProposal(false);
    }
  };

  const filteredProblems = problems.filter((p) => {
    if (filter === "open") return p.status === "open";
    if (filter === "resolved") return p.status === "resolved";
    return true;
  });

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Problems</h2>
        <button
          className={styles.secondaryButton}
          onClick={handleToggleAutoProposal}
          disabled={checkingAutoProposal}
        >
          {checkingAutoProposal ? "Loading…" : autoProposalEnabled ? "Auto-proposal: On" : "Auto-proposal: Off"}
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 8 }}>
          <input
            className={styles.input}
            type="text"
            placeholder="Problem title"
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            disabled={savingId === "new"}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAddProblem();
              }
            }}
          />
        </div>
        <div style={{ marginBottom: 8 }}>
          <textarea
            className={styles.input}
            placeholder="Additional details (optional)"
            value={draftDetail}
            onChange={(e) => setDraftDetail(e.target.value)}
            disabled={savingId === "new"}
            rows={3}
          />
        </div>
        <button
          className={styles.button}
          onClick={handleAddProblem}
          disabled={!draftText.trim() || savingId === "new"}
        >
          {savingId === "new" ? "Adding…" : "Add Problem"}
        </button>
      </div>

      <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
        {(["open", "resolved", "all"] as const).map((f) => (
          <button
            key={f}
            className={filter === f ? styles.badge : styles.badgeOutline}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)} ({problems.filter((p) => f === "all" || p.status === f).length})
          </button>
        ))}
      </div>

      {loading ? (
        <p className={styles.status}>Loading problems…</p>
      ) : filteredProblems.length === 0 ? (
        <p className={styles.status}>No {filter === "all" ? "" : filter} problems yet.</p>
      ) : (
        <ul className={styles.list}>
          {filteredProblems.map((problem) => (
            <li key={problem.id} className={styles.card} style={{ marginBottom: 12 }}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{problem.title}</h3>
                <span className={`${styles.badge} ${problem.status === "resolved" ? styles.badgeResolved : styles.badgeOpen}`}>
                  {problem.status}
                </span>
              </div>

              {problem.detail && <p style={{ margin: "8px 0" }}>{problem.detail}</p>}

              <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 8 }}>
                {problem.status === "open" && (
                  <button
                    className={styles.secondaryButton}
                    onClick={() => handleUpdateStatus(problem.id, "resolved")}
                    disabled={savingId === problem.id}
                  >
                    {savingId === problem.id ? "Saving…" : "Mark Resolved"}
                  </button>
                )}
                {problem.status === "resolved" && (
                  <button
                    className={styles.secondaryButton}
                    onClick={() => handleUpdateStatus(problem.id, "open")}
                    disabled={savingId === problem.id}
                  >
                    {savingId === problem.id ? "Saving…" : "Reopen"}
                  </button>
                )}
                <button
                  className={styles.deleteButton}
                  onClick={() => handleDeleteClick(problem.id)}
                  disabled={savingId === problem.id}
                  title={pendingDeleteId === problem.id ? "Click again to confirm" : "Click to delete"}
                >
                  {savingId === problem.id ? "Deleting…" : pendingDeleteId === problem.id ? "Confirm Delete" : "Delete"}
                </button>
                <button
                  className={styles.secondaryButton}
                  onClick={() =>
                    setExpandedProblem(expandedProblem === problem.id ? null : problem.id)
                  }
                >
                  {expandedProblem === problem.id ? "Hide" : "Show"} Solutions (
                  {solutions[problem.id]?.length ?? 0})
                </button>
              </div>

              {expandedProblem === problem.id && solutions[problem.id] && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #ddd" }}>
                  {solutions[problem.id].length === 0 ? (
                    <p className={styles.status}>No solutions proposed yet.</p>
                  ) : (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                      {solutions[problem.id].map((sol) => (
                        <li key={sol.id} style={{ marginBottom: 12, paddingBottom: 8, borderBottom: "1px solid #f0f0f0" }}>
                          <p style={{ margin: "0 0 4px 0", fontWeight: "bold" }}>{sol.title}</p>
                          <p style={{ margin: "0 0 4px 0", fontSize: "0.9em" }}>{sol.approach}</p>
                          <p style={{ margin: 0, fontSize: "0.85em", color: "#666" }}>
                            Proposed {formatRelative(sol.createdAt)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
