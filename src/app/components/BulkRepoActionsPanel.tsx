"use client";

import { useEffect, useRef, useState } from "react";
import { createCopilotTaskAction, listPullRequestsAction, mergePullRequestAction, markPullRequestReadyAction, listCopilotTasksAction } from "../actions";
import type { PullRequestInfo, CopilotTask } from "@/lib/github";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import styles from "../page.module.css";

interface BulkRepoActionsPanelProps {
  repos: string[];
}

type CopilotRow = { repo: string; status: "pending" | "done" | "failed" | "skipped"; detail?: string };
type PrMatch = { repo: string; pr: PullRequestInfo; include: boolean };

export default function BulkRepoActionsPanel({ repos }: BulkRepoActionsPanelProps) {
  // Section 1: Repo Selection
  const [filterText, setFilterText] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("ta-vc-bulk-filter") ?? "" : ""
  );
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    const stored = localStorage.getItem("ta-vc-bulk-repos");
    if (!stored) return new Set();
    try {
      const parsed = JSON.parse(stored) as string[];
      const valid = parsed.filter((r) => repos.includes(r));
      return new Set(valid);
    } catch {
      return new Set();
    }
  });

  // Persist filter and selected repos
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-vc-bulk-filter", filterText);
  }, [filterText]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ta-vc-bulk-repos", JSON.stringify([...selectedRepos]));
    }
  }, [selectedRepos]);

  const shown = repos.filter((r) => !filterText.trim() || r.toLowerCase().includes(filterText.trim().toLowerCase()));
  const allShownSelected = shown.length > 0 && shown.every((r) => selectedRepos.has(r));

  const handleSelectAll = () => {
    if (allShownSelected) {
      setSelectedRepos((prev) => {
        const next = new Set(prev);
        for (const r of shown) next.delete(r);
        return next;
      });
    } else {
      setSelectedRepos((prev) => {
        const next = new Set(prev);
        for (const r of shown) next.add(r);
        return next;
      });
    }
  };

  const handleClear = () => {
    setSelectedRepos(new Set());
  };

  // Section 2: Start Copilot Agents
  const [copilotTitle, setCopilotTitle] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("ta-vc-bulk-copilot-title") ?? "" : ""
  );
  const [copilotBody, setCopilotBody] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("ta-vc-bulk-copilot-body") ?? "" : ""
  );
  const [copilotRows, setCopilotRows] = useState<CopilotRow[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem("ta-vc-bulk-copilot-rows");
    if (!stored) return [];
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (!Array.isArray(parsed)) return [];
      const rows = parsed.filter((row): row is CopilotRow => {
        const r = row as Record<string, unknown>;
        return (
          typeof row === "object" &&
          row !== null &&
          typeof r.repo === "string" &&
          typeof r.status === "string" &&
          ["pending", "done", "failed", "skipped"].includes(r.status)
        );
      });
      return rows.map((row) => ({
        ...row,
        status: row.status === "pending" ? "skipped" : row.status,
      }));
    } catch {
      return [];
    }
  });
  const [copilotRunning, setCopilotRunning] = useState(false);
  const copilotCancelRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-vc-bulk-copilot-title", copilotTitle);
  }, [copilotTitle]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-vc-bulk-copilot-body", copilotBody);
  }, [copilotBody]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-vc-bulk-copilot-rows", JSON.stringify(copilotRows));
  }, [copilotRows]);

  const handleStartCopilot = async () => {
    const selected = [...selectedRepos];
    if (selected.length === 0 || !copilotTitle.trim()) return;

    setCopilotRunning(true);
    copilotCancelRef.current = false;
    setCopilotRows(selected.map((r) => ({ repo: r, status: "pending" })));

    for (let i = 0; i < selected.length; i++) {
      if (copilotCancelRef.current) {
        setCopilotRows((prev) =>
          prev.map((row, idx) => (idx > i ? { ...row, status: "skipped" } : row))
        );
        break;
      }

      const repo = selected[i];
      setCopilotRows((prev) =>
        prev.map((row) => (row.repo === repo ? { ...row, status: "pending" } : row))
      );

      const result = await createCopilotTaskAction(repo, copilotTitle.trim(), copilotBody);
      if (copilotCancelRef.current) {
        setCopilotRows((prev) =>
          prev.map((row) => (row.repo === repo ? { ...row, status: "skipped" } : row))
        );
        break;
      }

      if ("error" in result) {
        setCopilotRows((prev) =>
          prev.map((row) =>
            row.repo === repo ? { ...row, status: "failed", detail: result.error } : row
          )
        );
      } else {
        setCopilotRows((prev) =>
          prev.map((row) =>
            row.repo === repo
              ? { ...row, status: "done", detail: result.issueUrl }
              : row
          )
        );
      }
    }

    setCopilotRunning(false);
  };

  const handleCancelCopilot = () => {
    copilotCancelRef.current = true;
  };

  // Running agents status - not persisted (live data)
  const [agentStatus, setAgentStatus] = useState<Record<string, CopilotTask[]>>({});
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [agentChecking, setAgentChecking] = useState(false);
  const agentCancelRef = useRef(false);

  const handleCheckAgentStatus = async () => {
    const reposToCheck = new Set<string>([
      ...selectedRepos,
      ...copilotRows.map((r) => r.repo),
    ]);
    if (reposToCheck.size === 0) return;

    setAgentChecking(true);
    agentCancelRef.current = false;
    const newStatus: Record<string, CopilotTask[]> = {};

    for (const repo of reposToCheck) {
      if (agentCancelRef.current) break;

      const result = await listCopilotTasksAction(repo);
      if (agentCancelRef.current) break;

      if (!("error" in result)) {
        newStatus[repo] = result.tasks;
      }
    }

    setAgentStatus(newStatus);
    setCheckedAt(Date.now());
    setAgentChecking(false);
  };

  const handleCancelAgentCheck = () => {
    agentCancelRef.current = true;
  };

  // Section 3: Merge Pull Requests
  const [prTitleFilter, setPrTitleFilter] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("ta-vc-bulk-pr-title") ?? "" : ""
  );
  const [prAuthorFilter, setPrAuthorFilter] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("ta-vc-bulk-pr-author") ?? "" : ""
  );
  const [prBranchFilter, setPrBranchFilter] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("ta-vc-bulk-pr-branch") ?? "" : ""
  );
  const [mergeMethod, setMergeMethod] = useState<"merge" | "squash" | "rebase">(() => {
    if (typeof window === "undefined") return "merge";
    const stored = localStorage.getItem("ta-vc-bulk-merge-method");
    if (stored === "merge" || stored === "squash" || stored === "rebase") return stored;
    return "merge";
  });
  const [prMatches, setPrMatches] = useState<PrMatch[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem("ta-vc-bulk-pr-matches");
    if (!stored) return [];
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((match): match is PrMatch => {
        const m = match as Record<string, unknown>;
        const pr = m.pr as Record<string, unknown>;
        return (
          typeof match === "object" &&
          match !== null &&
          typeof m.repo === "string" &&
          typeof m.include === "boolean" &&
          typeof m.pr === "object" &&
          m.pr !== null &&
          typeof pr.number === "number" &&
          typeof pr.state === "string" &&
          typeof pr.htmlUrl === "string"
        );
      });
    } catch {
      return [];
    }
  });
  const [prPreviewing, setPrPreviewing] = useState(false);
  const [prMerging, setPrMerging] = useState(false);
  const [mergeConfirm, setMergeConfirm] = useState(false);
  const [mergeSummary, setMergeSummary] = useState<string | null>(null);
  const prCancelRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-vc-bulk-pr-title", prTitleFilter);
  }, [prTitleFilter]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-vc-bulk-pr-author", prAuthorFilter);
  }, [prAuthorFilter]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-vc-bulk-pr-branch", prBranchFilter);
  }, [prBranchFilter]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-vc-bulk-merge-method", mergeMethod);
  }, [mergeMethod]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-vc-bulk-pr-matches", JSON.stringify(prMatches));
  }, [prMatches]);

  const handlePreviewPrs = async () => {
    const selected = [...selectedRepos];
    if (selected.length === 0) return;

    setPrPreviewing(true);
    prCancelRef.current = false;
    setPrMatches([]);

    const collected: PrMatch[] = [];
    for (let i = 0; i < selected.length; i++) {
      if (prCancelRef.current) break;

      const repo = selected[i];
      const result = await listPullRequestsAction(repo, "open");

      if (prCancelRef.current) break;

      if (!("error" in result)) {
        const filtered = result.pulls.filter((pr) => {
          if (prTitleFilter.trim() && !pr.title.toLowerCase().includes(prTitleFilter.trim().toLowerCase())) return false;
          if (prAuthorFilter.trim() && !pr.user.toLowerCase().includes(prAuthorFilter.trim().toLowerCase())) return false;
          if (prBranchFilter.trim() && !pr.head.toLowerCase().includes(prBranchFilter.trim().toLowerCase())) return false;
          return true;
        });

        for (const pr of filtered) {
          collected.push({ repo, pr, include: true });
        }
      }

      setPrMatches([...collected]);
    }

    setPrPreviewing(false);
  };

  const handleCancelPreview = () => {
    prCancelRef.current = true;
  };

  const includedCount = prMatches.filter((m) => m.include).length;

  const handleMergePrs = async () => {
    if (!mergeConfirm) {
      setMergeConfirm(true);
      return;
    }

    const toMerge = prMatches.filter((m) => m.include);
    if (toMerge.length === 0) return;

    setPrMerging(true);
    prCancelRef.current = false;
    setMergeSummary(null);

    let mergedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < toMerge.length; i++) {
      if (prCancelRef.current) break;

      const match = toMerge[i];

      // If the PR is a draft, mark it as ready for review first
      if (match.pr.draft) {
        const readyResult = await markPullRequestReadyAction(match.repo, match.pr.number);
        if (prCancelRef.current) break;

        if ("error" in readyResult) {
          failedCount += 1;
          setPrMatches((prev) =>
            prev.map((m) =>
              m.repo === match.repo && m.pr.number === match.pr.number
                ? { ...m, pr: { ...m.pr, state: "closed" } }
                : m
            )
          );
          continue;
        }
      }

      const result = await mergePullRequestAction(match.repo, match.pr.number, mergeMethod);

      if (prCancelRef.current) break;

      if ("error" in result) {
        failedCount += 1;
        setPrMatches((prev) =>
          prev.map((m) =>
            m.repo === match.repo && m.pr.number === match.pr.number
              ? { ...m, pr: { ...m.pr, state: "closed" } }
              : m
          )
        );
      } else {
        mergedCount += 1;
        setPrMatches((prev) =>
          prev.map((m) =>
            m.repo === match.repo && m.pr.number === match.pr.number
              ? { ...m, pr: { ...m.pr, state: "merged" } }
              : m
          )
        );
      }
    }

    setMergeSummary(`Merged ${mergedCount} of ${toMerge.length}.${failedCount > 0 ? ` Failed: ${failedCount}.` : ""}`);
    setPrMerging(false);
    setMergeConfirm(false);
  };

  const handleCancelMerge = () => {
    prCancelRef.current = true;
  };

  return (
    <div className={styles.form} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Section 1: Repo Selection */}
      <div>
        <h3 style={{ margin: "0 0 12px" }}>Select repositories</h3>
        <TextField
          size="small"
          fullWidth
          label="Filter repositories"
          placeholder="Type to filter..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          sx={{ mb: 1.5 }}
        />

        <div style={{ display: "flex", gap: 12, marginBottom: 8, alignItems: "center" }}>
          <Button size="small" variant="text" onClick={handleSelectAll} disabled={shown.length === 0}>
            {allShownSelected ? "Clear all shown" : "Select all shown"}
          </Button>
          {selectedRepos.size > 0 && (
            <Button size="small" variant="text" onClick={handleClear}>
              Clear
            </Button>
          )}
        </div>

        <div
          style={{
            maxHeight: 240,
            overflowY: "auto",
            border: "1px solid var(--field-border)",
            borderRadius: 4,
            padding: 8,
          }}
        >
          {shown.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", margin: 0 }}>No repositories match.</p>
          ) : (
            shown.map((repo) => (
              <FormControlLabel
                key={repo}
                sx={{ display: "flex", marginBottom: 0.5 }}
                control={
                  <Checkbox
                    size="small"
                    checked={selectedRepos.has(repo)}
                    onChange={(e) =>
                      setSelectedRepos((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(repo);
                        else next.delete(repo);
                        return next;
                      })
                    }
                  />
                }
                label={<span style={{ fontSize: "0.85rem", fontFamily: "monospace" }}>{repo}</span>}
              />
            ))
          )}
        </div>

        {selectedRepos.size > 0 && (
          <div style={{ marginTop: 12 }}>
            <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, marginBottom: 6, color: "var(--text-primary)" }}>
              Selected repositories ({selectedRepos.size})
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {[...selectedRepos].sort().map((repo) => {
                const displayName = repo.includes("/") ? repo.split("/")[1] : repo;
                return (
                  <span
                    key={repo}
                    className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, paddingRight: 4 }}
                    title={repo}
                  >
                    {displayName}
                    <button
                      type="button"
                      aria-label={`Remove ${repo}`}
                      onClick={() => setSelectedRepos((prev) => {
                        const next = new Set(prev);
                        next.delete(repo);
                        return next;
                      })}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 16,
                        height: 16,
                        padding: 0,
                        border: "none",
                        background: "none",
                        color: "inherit",
                        cursor: "pointer",
                        fontSize: "1rem",
                        lineHeight: 1,
                      }}
                    >
                      x
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {selectedRepos.size === 0 && (
          <p className={styles.fieldHint} style={{ marginTop: 8 }}>
            No repositories selected.
          </p>
        )}
      </div>

      {/* Section 2: Start Copilot Agents */}
      <div>
        <h3 style={{ margin: "0 0 12px" }}>Start Copilot agents</h3>

        <TextField
          size="small"
          fullWidth
          label="Task title"
          value={copilotTitle}
          onChange={(e) => setCopilotTitle(e.target.value)}
          disabled={copilotRunning}
          sx={{ mb: 1.5 }}
        />

        <TextField
          size="small"
          fullWidth
          multiline
          minRows={4}
          label="Instructions"
          placeholder="Enter the instructions for Copilot..."
          value={copilotBody}
          onChange={(e) => setCopilotBody(e.target.value)}
          disabled={copilotRunning}
          sx={{ mb: 1.5 }}
        />

        <div style={{ display: "flex", gap: 8 }}>
          <Button
            type="button"
            variant="contained"
            size="small"
            disabled={copilotRunning || selectedRepos.size === 0 || !copilotTitle.trim()}
            onClick={handleStartCopilot}
          >
            Start in {selectedRepos.size} repo{selectedRepos.size !== 1 ? "s" : ""}
          </Button>
          {copilotRunning && (
            <Button type="button" variant="outlined" size="small" color="error" onClick={handleCancelCopilot}>
              Cancel
            </Button>
          )}
        </div>

        {copilotRows.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {copilotRunning && (
              <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: 8 }}>
                Starting {copilotRows.filter((r) => r.status !== "pending").length} of {copilotRows.length}...
              </p>
            )}
            <div
              style={{
                maxHeight: 240,
                overflowY: "auto",
                border: "1px solid var(--field-border)",
                borderRadius: 4,
                padding: 8,
              }}
            >
              {copilotRows.map((row) => (
                <div
                  key={row.repo}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: "0.85rem",
                    marginBottom: 6,
                    paddingBottom: 6,
                    borderBottom: "1px solid var(--field-border)",
                  }}
                >
                  <span style={{ flex: 1, fontFamily: "monospace" }}>{row.repo}</span>
                  <span
                    className={`${styles.ghBadge} ${
                      row.status === "done"
                        ? styles.ghBadgeSuccess
                        : row.status === "failed"
                          ? styles.ghBadgeDanger
                          : row.status === "skipped"
                            ? styles.ghBadgeNeutral
                            : styles.ghBadgeWarning
                    }`}
                  >
                    {row.status}
                  </span>
                  {row.detail && row.status === "done" && (
                    <a href={row.detail} target="_blank" rel="noreferrer" style={{ color: "var(--accent-ink)", fontSize: "0.75rem" }}>
                      view
                    </a>
                  )}
                  {row.detail && row.status === "failed" && (
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }} title={row.detail}>
                      {row.detail.split("\n")[0].slice(0, 40)}...
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <p className={styles.fieldHint} style={{ marginTop: 8 }}>
          Each repo gets a Copilot coding-agent task with these instructions.
        </p>

        {/* Running agents subsection */}
        <div style={{ marginTop: 20, paddingTop: 12, borderTop: "1px solid var(--field-border)" }}>
          <h4 style={{ margin: "0 0 12px" }}>Running agents</h4>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <Button
              type="button"
              variant="outlined"
              size="small"
              disabled={
                agentChecking ||
                (selectedRepos.size === 0 && copilotRows.length === 0)
              }
              onClick={handleCheckAgentStatus}
            >
              Check agent status
            </Button>
            {agentChecking && (
              <Button type="button" variant="outlined" size="small" color="error" onClick={handleCancelAgentCheck}>
                Cancel
              </Button>
            )}
          </div>

          {checkedAt !== null && (
            <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 8 }}>
              Checked at {new Date(checkedAt).toLocaleString()}
            </p>
          )}

          {Object.entries(agentStatus).length > 0 ? (
            <div
              style={{
                maxHeight: 400,
                overflowY: "auto",
                border: "1px solid var(--field-border)",
                borderRadius: 4,
                padding: 8,
              }}
            >
              {Object.entries(agentStatus).map(([repo, tasks]) => (
                <div key={repo}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 500, marginBottom: 8, color: "var(--text-primary)" }}>
                    <span style={{ fontFamily: "monospace" }}>{repo}</span>
                  </div>

                  {tasks.length === 0 ? (
                    <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 12 }}>
                      No agent tasks found.
                    </p>
                  ) : (
                    <div style={{ marginBottom: 12, marginLeft: 12 }}>
                      {tasks.map((task) => {
                        const taskState = task.state === "OPEN" && (!task.pr || task.pr.isDraft) ? "Working" :
                          task.state === "OPEN" && task.pr && !task.pr.isDraft && task.pr.state === "OPEN" ? "Ready for review" :
                          task.pr?.state === "MERGED" ? "Merged" :
                          task.state === "CLOSED" ? "Closed" :
                          "Unknown";

                        const stateBadgeClass =
                          task.pr?.state === "MERGED"
                            ? styles.ghBadgeMerged
                            : taskState === "Working" || taskState === "Ready for review"
                              ? styles.ghBadgeNeutral
                              : taskState === "Closed"
                                ? styles.ghBadgeNeutral
                                : styles.ghBadgeNeutral;

                        return (
                          <div
                            key={task.number}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 4,
                              fontSize: "0.8rem",
                              marginBottom: 10,
                              paddingBottom: 10,
                              borderBottom: "1px solid var(--field-border)",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <a
                                href={task.htmlUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  color: "var(--accent-ink)",
                                  textDecoration: "none",
                                  fontWeight: 600,
                                }}
                              >
                                #{task.number} {task.title}
                              </a>
                              <span className={`${styles.ghBadge} ${stateBadgeClass}`}>
                                {taskState}
                              </span>
                            </div>

                            {task.pr && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginLeft: 8 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <a
                                    href={task.pr.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      color: "var(--accent-ink)",
                                      textDecoration: "none",
                                      fontWeight: 600,
                                    }}
                                  >
                                    PR #{task.pr.number}
                                  </a>

                                  {task.pr.checks && (
                                    <span
                                      className={`${styles.ghBadge} ${
                                        task.pr.checks === "SUCCESS"
                                          ? styles.ghBadgeSuccess
                                          : task.pr.checks === "FAILURE" || task.pr.checks === "ERROR"
                                            ? styles.ghBadgeDanger
                                            : styles.ghBadgeNeutral
                                      }`}
                                    >
                                      {task.pr.checks === "SUCCESS"
                                        ? "CI passing"
                                        : task.pr.checks === "FAILURE" || task.pr.checks === "ERROR"
                                          ? "CI failing"
                                          : task.pr.checks === "PENDING" || task.pr.checks === "EXPECTED"
                                            ? "CI running"
                                            : "CI unknown"}
                                    </span>
                                  )}

                                  {task.pr.reviewDecision && (
                                    <span
                                      className={`${styles.ghBadge} ${
                                        task.pr.reviewDecision === "APPROVED"
                                          ? styles.ghBadgeSuccess
                                          : styles.ghBadgeNeutral
                                      }`}
                                    >
                                      {task.pr.reviewDecision === "APPROVED"
                                        ? "Approved"
                                        : task.pr.reviewDecision === "CHANGES_REQUESTED"
                                          ? "Changes requested"
                                          : "Review required"}
                                    </span>
                                  )}
                                </div>

                                <div
                                  className={styles.ghMetaMono}
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "var(--text-secondary)",
                                  }}
                                >
                                  +{task.pr.additions} -{task.pr.deletions} ({task.pr.changedFiles} files)
                                  {" updated "}
                                  {new Date(task.pr.updatedAt).toLocaleString()}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : checkedAt !== null ? (
            <p className={styles.fieldHint}>No agent tasks found.</p>
          ) : null}
        </div>
      </div>

      {/* Section 3: Merge Pull Requests */}
      <div>
        <h3 style={{ margin: "0 0 12px" }}>Merge pull requests</h3>

        <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <TextField
            size="small"
            label="Title contains"
            placeholder="e.g. fix"
            value={prTitleFilter}
            onChange={(e) => setPrTitleFilter(e.target.value)}
            disabled={prPreviewing || prMerging}
            sx={{ flex: 1, minWidth: 150 }}
          />
          <TextField
            size="small"
            label="Author contains"
            placeholder="e.g. copilot"
            value={prAuthorFilter}
            onChange={(e) => setPrAuthorFilter(e.target.value)}
            disabled={prPreviewing || prMerging}
            sx={{ flex: 1, minWidth: 150 }}
          />
          <TextField
            size="small"
            label="Branch contains"
            placeholder="e.g. main"
            value={prBranchFilter}
            onChange={(e) => setPrBranchFilter(e.target.value)}
            disabled={prPreviewing || prMerging}
            sx={{ flex: 1, minWidth: 150 }}
          />
          <TextField
            select
            size="small"
            label="Merge method"
            value={mergeMethod}
            onChange={(e) => setMergeMethod(e.target.value as "merge" | "squash" | "rebase")}
            disabled={prPreviewing || prMerging}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="merge">Merge</MenuItem>
            <MenuItem value="squash">Squash</MenuItem>
            <MenuItem value="rebase">Rebase</MenuItem>
          </TextField>
        </div>

        <p className={styles.fieldHint} style={{ marginBottom: 12 }}>
          Draft pull requests (for example from Copilot agents) are listed too - merging marks them ready for review first.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <Button
            type="button"
            variant="outlined"
            size="small"
            disabled={prPreviewing || prMerging || selectedRepos.size === 0}
            onClick={handlePreviewPrs}
          >
            Preview open PRs
          </Button>
          {prPreviewing && (
            <Button type="button" variant="outlined" size="small" color="error" onClick={handleCancelPreview}>
              Cancel
            </Button>
          )}
        </div>

        {prMatches.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                maxHeight: 300,
                overflowY: "auto",
                border: "1px solid var(--field-border)",
                borderRadius: 4,
                padding: 8,
              }}
            >
              {prMatches.map((match) => (
                <div
                  key={`${match.repo}-${match.pr.number}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: "0.85rem",
                    marginBottom: 8,
                    paddingBottom: 8,
                    borderBottom: "1px solid var(--field-border)",
                  }}
                >
                  <Checkbox
                    size="small"
                    checked={match.include}
                    onChange={(e) =>
                      setPrMatches((prev) =>
                        prev.map((m) =>
                          m.repo === match.repo && m.pr.number === match.pr.number
                            ? { ...m, include: e.target.checked }
                            : m
                        )
                      )
                    }
                    disabled={prMerging}
                  />
                  <span style={{ flex: 1, fontFamily: "monospace", color: "var(--text-secondary)" }}>
                    {match.repo}
                  </span>
                  <a
                    href={match.pr.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      color: "var(--accent-ink)",
                      textDecoration: "none",
                      fontWeight: 600,
                      flex: 2,
                    }}
                  >
                    #{match.pr.number} {match.pr.title}
                  </a>
                  {match.pr.draft && (
                    <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`} style={{ whiteSpace: "nowrap" }}>
                      Draft
                    </span>
                  )}
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                    {match.pr.user} ({match.pr.head} → {match.pr.base})
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {prMatches.length === 0 && (
          <p className={styles.fieldHint}>
            {prPreviewing ? "Loading pull requests..." : "No matching open pull requests."}
          </p>
        )}

        {prMatches.length > 0 && (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                type="button"
                variant="contained"
                size="small"
                color={mergeConfirm ? "error" : "primary"}
                disabled={prMerging || includedCount === 0}
                onClick={handleMergePrs}
              >
                {mergeConfirm ? `Confirm merge ${includedCount} PR${includedCount !== 1 ? "s" : ""}` : `Merge ${includedCount} selected PR${includedCount !== 1 ? "s" : ""}`}
              </Button>
              {prMerging && (
                <Button type="button" variant="outlined" size="small" color="error" onClick={handleCancelMerge}>
                  Cancel
                </Button>
              )}
              {mergeConfirm && (
                <Button
                  type="button"
                  variant="outlined"
                  size="small"
                  onClick={() => setMergeConfirm(false)}
                  disabled={prMerging}
                >
                  Cancel confirm
                </Button>
              )}
            </div>
            {mergeSummary && (
              <p className={styles.fieldHint} style={{ marginTop: 8 }}>
                {mergeSummary}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
