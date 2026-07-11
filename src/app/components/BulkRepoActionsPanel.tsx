"use client";

import { useEffect, useRef, useState } from "react";
import { createCopilotTaskAction, listPullRequestsAction, mergePullRequestAction } from "../actions";
import type { PullRequestInfo } from "@/lib/github";
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
  const [copilotRows, setCopilotRows] = useState<CopilotRow[]>([]);
  const [copilotRunning, setCopilotRunning] = useState(false);
  const copilotCancelRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-vc-bulk-copilot-title", copilotTitle);
  }, [copilotTitle]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-vc-bulk-copilot-body", copilotBody);
  }, [copilotBody]);

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
  const [prMatches, setPrMatches] = useState<PrMatch[]>([]);
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
          if (pr.draft) return false;
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

        <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
          <Button size="small" variant="text" onClick={handleSelectAll} disabled={shown.length === 0}>
            {allShownSelected ? "Clear all shown" : "Select all shown"}
          </Button>
          <Button size="small" variant="text" onClick={handleClear}>
            Clear
          </Button>
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

        <p className={styles.fieldHint} style={{ marginTop: 8 }}>
          {selectedRepos.size} selected
        </p>
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
