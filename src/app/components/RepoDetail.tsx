"use client";

import { useEffect, useState } from "react";
import {
  listGithubReposAction,
  listGithubBranchesAction,
  getRepoTreeAction,
  getFileTextAction,
  commitFileAction,
  createBranchAction,
  deleteBranchAction,
  forkRepoAction,
  listPullRequestsAction,
  createPullRequestAction,
  mergePullRequestAction,
} from "../actions";
import type { GithubRepo, RepoTreeEntry, PullRequestInfo } from "@/lib/github";
import Typeahead from "./ui/Typeahead";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import CircularProgress from "@mui/material/CircularProgress";
import styles from "../page.module.css";

export default function RepoDetail() {
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [reposState, setReposState] = useState<"loading" | "ready" | "error">("loading");
  const [repoRef, setRepoRef] = useState("");
  const [branch, setBranch] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [defaultBranch, setDefaultBranch] = useState("");
  const [tab, setTab] = useState<"files" | "branches" | "pulls" | "actions">("files");

  // Files tab state
  const [tree, setTree] = useState<RepoTreeEntry[]>([]);
  const [treeState, setTreeState] = useState<"loading" | "ready" | "error">("ready");
  const [filter, setFilter] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [editContent, setEditContent] = useState("");
  const [fileState, setFileState] = useState<"loading" | "ready" | "error">("ready");
  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");

  // Branches tab state
  const [newBranch, setNewBranch] = useState("");
  const [fromBranch, setFromBranch] = useState("");
  const [branchBusy, setBranchBusy] = useState(false);
  const [branchMsg, setBranchMsg] = useState<string | null>(null);
  const [forkOrg, setForkOrg] = useState("");
  const [forkBusy, setForkBusy] = useState(false);
  const [forkResult, setForkResult] = useState<{ fullName: string; htmlUrl: string } | null>(null);
  const [forkMsg, setForkMsg] = useState<string | null>(null);

  // Pull requests tab state
  const [prState, setPrState] = useState<"open" | "closed" | "all">("open");
  const [pulls, setPulls] = useState<PullRequestInfo[]>([]);
  const [pullsState, setPullsState] = useState<"idle" | "loading" | "error">("idle");
  const [pullsError, setPullsError] = useState<string | null>(null);
  const [prTitle, setPrTitle] = useState("");
  const [prHead, setPrHead] = useState("");
  const [prBase, setPrBase] = useState("");
  const [prBody, setPrBody] = useState("");
  const [prBusy, setPrBusy] = useState(false);
  const [prMsg, setPrMsg] = useState<string | null>(null);
  const [mergeMethod, setMergeMethod] = useState<Record<number, "merge" | "squash" | "rebase">>({});
  const [mergingPr, setMergingPr] = useState<number | null>(null);

  // Load repos on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setReposState("loading");
      const r = await listGithubReposAction();
      if (cancelled) return;
      if ("error" in r) {
        setReposState("error");
        return;
      }
      setRepos(r.repos);
      setReposState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load branches when repo changes
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!repoRef) {
      setBranches([]);
      setDefaultBranch("");
      setBranch("");
      setTree([]);
      setSelectedPath("");
      setFileContent("");
      setEditContent("");
      setCommitMessage("");
      setCommitMsg("");
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await listGithubBranchesAction(repoRef);
      if (cancelled) return;
      if ("error" in r) {
        setBranches([]);
        setDefaultBranch("");
        setBranch("");
        return;
      }
      setBranches(r.branches);
      setDefaultBranch(r.defaultBranch);
      setBranch(r.defaultBranch);
      setTree([]);
      setSelectedPath("");
      setFileContent("");
      setEditContent("");
      setCommitMessage("");
      setCommitMsg("");
    })();
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [repoRef]);

  // Load tree when repo, branch, and files tab are active
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!repoRef || !branch || tab !== "files") {
      return;
    }
    let cancelled = false;
    setTreeState("loading");
    (async () => {
      const r = await getRepoTreeAction(repoRef, branch);
      if (cancelled) return;
      if ("error" in r) {
        setTreeState("error");
        return;
      }
      setTree(r.tree);
      setTreeState("ready");
    })();
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [repoRef, branch, tab]);

  // Load file content when selectedPath changes
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!selectedPath || !repoRef) {
      setFileContent("");
      setEditContent("");
      return;
    }
    let cancelled = false;
    setFileState("loading");
    (async () => {
      const r = await getFileTextAction(repoRef, selectedPath, branch);
      if (cancelled) return;
      if ("error" in r) {
        setFileState("error");
        setFileContent("");
        setEditContent("");
        return;
      }
      setFileContent(r.content);
      setEditContent(r.content);
      setFileState("ready");
      setCommitMsg("");
    })();
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selectedPath, repoRef, branch]);

  // Load PRs when the pulls tab is active
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!repoRef || tab !== "pulls") {
      if (!repoRef) {
        setPulls([]);
      }
      return;
    }
    let cancelled = false;
    setPullsState("loading");
    (async () => {
      const r = await listPullRequestsAction(repoRef, prState);
      if (cancelled) return;
      if ("error" in r) {
        setPullsState("error");
        setPullsError(r.error);
        return;
      }
      setPulls(r.pulls);
      setPullsState("idle");
    })();
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [repoRef, tab, prState]);

  const handleCommit = async () => {
    if (!repoRef || !branch || !selectedPath || !commitMessage.trim()) {
      return;
    }
    setCommitting(true);
    const r = await commitFileAction(repoRef, selectedPath, editContent, commitMessage, branch);
    setCommitting(false);
    if ("error" in r) {
      setCommitMsg(r.error);
      return;
    }
    setCommitMsg("Committed.");
    setFileContent(editContent);
    setCommitMessage("");
  };

  const reloadBranches = async () => {
    if (!repoRef) return;
    const r = await listGithubBranchesAction(repoRef);
    if ("error" in r) return;
    setBranches(r.branches);
    setDefaultBranch(r.defaultBranch);
    if (!r.branches.includes(branch)) {
      setBranch(r.defaultBranch);
    }
  };

  const handleCreateBranch = async () => {
    const name = newBranch.trim();
    const from = (fromBranch || branch || defaultBranch).trim();
    if (!name || !from) return;
    setBranchBusy(true);
    setBranchMsg(null);
    const r = await createBranchAction(repoRef, name, from);
    setBranchBusy(false);
    if ("error" in r) {
      setBranchMsg(`Error: ${r.error}`);
      return;
    }
    setBranchMsg(`Created ${name} from ${from}.`);
    setNewBranch("");
    await reloadBranches();
  };

  const handleDeleteBranch = async (b: string) => {
    if (b === defaultBranch) return;
    if (typeof window !== "undefined" && !window.confirm(`Delete branch "${b}"? This cannot be undone.`)) return;
    setBranchBusy(true);
    setBranchMsg(null);
    const r = await deleteBranchAction(repoRef, b);
    setBranchBusy(false);
    if ("error" in r) {
      setBranchMsg(`Error: ${r.error}`);
      return;
    }
    setBranchMsg(`Deleted ${b}.`);
    await reloadBranches();
  };

  const handleFork = async () => {
    setForkBusy(true);
    setForkMsg(null);
    setForkResult(null);
    const r = await forkRepoAction(repoRef, forkOrg.trim() || undefined);
    setForkBusy(false);
    if ("error" in r) {
      setForkMsg(`Error: ${r.error}`);
      return;
    }
    setForkResult({ fullName: r.repo.fullName, htmlUrl: r.repo.htmlUrl });
  };

  const reloadPulls = async () => {
    setPullsState("loading");
    const r = await listPullRequestsAction(repoRef, prState);
    if ("error" in r) {
      setPullsState("error");
      setPullsError(r.error);
      return;
    }
    setPulls(r.pulls);
    setPullsState("idle");
  };

  const handleCreatePr = async () => {
    const title = prTitle.trim();
    const head = prHead || branch;
    const base = prBase || defaultBranch;
    if (!title || !head || !base) return;
    setPrBusy(true);
    setPrMsg(null);
    const r = await createPullRequestAction(repoRef, title, head, base, prBody);
    setPrBusy(false);
    if ("error" in r) {
      setPrMsg(`Error: ${r.error}`);
      return;
    }
    setPrMsg(`Opened PR #${r.number}.`);
    setPrTitle("");
    setPrBody("");
    await reloadPulls();
  };

  const handleMerge = async (n: number) => {
    setMergingPr(n);
    setPrMsg(null);
    const r = await mergePullRequestAction(repoRef, n, mergeMethod[n] ?? "merge");
    setMergingPr(null);
    if ("error" in r) {
      setPrMsg(`Error merging #${n}: ${r.error}`);
      return;
    }
    setPrMsg(`Merged #${n}.`);
    await reloadPulls();
  };

  const repoOptions = repos.map((r) => ({
    value: r.fullName,
    label: r.fullName,
    hint: r.private ? "private" : "public",
  }));

  const branchOptions = branches.map((b) => ({
    value: b,
    label: b,
  }));

  const fileList = tree
    .filter((e) => e.type === "blob")
    .filter((e) => {
      if (!filter) return true;
      return e.path.toLowerCase().includes(filter.toLowerCase());
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  return (
    <div className={styles.field}>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px" }}>
          <Typeahead
            options={repoOptions}
            value={repoRef}
            onChange={(v) => setRepoRef(v)}
            placeholder={
              reposState === "loading"
                ? "Loading repositories..."
                : reposState === "error"
                  ? "Error loading repositories"
                  : "Choose a repository..."
            }
            disabled={reposState === "loading"}
            loading={reposState === "loading"}
            noOptionsText="No repositories"
          />
          {reposState === "error" && <p className={styles.error}>Failed to load repositories</p>}
        </div>
        {repoRef && (
          <div style={{ flex: "1 1 220px" }}>
            <Typeahead
              options={branchOptions}
              value={branch}
              onChange={(v) => setBranch(v)}
              placeholder="Branch"
              noOptionsText="No branches"
            />
          </div>
        )}
      </div>

      {!repoRef && <p className={styles.fieldHint}>Pick a repository to browse its files, branches, pull requests, and actions.</p>}

      {repoRef && (
        <>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v as "files" | "branches" | "pulls" | "actions")}
            sx={{
              marginTop: 2,
              "& .MuiTab-root": {
                textTransform: "none",
              },
            }}
          >
            <Tab label="Files" value="files" disableRipple />
            <Tab label="Branches" value="branches" disableRipple />
            <Tab label="Pull requests" value="pulls" disableRipple />
            <Tab label="Actions" value="actions" disableRipple />
          </Tabs>

          {tab === "files" && (
            <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
              <div style={{ width: 320, borderRight: "1px solid var(--field-border)" }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Filter files"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  disabled={treeState === "loading"}
                />
                <div
                  style={{
                    maxHeight: "50vh",
                    overflowY: "auto",
                    marginTop: 8,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {treeState === "loading" && (
                    <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
                      <CircularProgress size={24} />
                    </div>
                  )}
                  {treeState === "error" && <p className={styles.error}>Failed to load files</p>}
                  {treeState === "ready" &&
                    fileList.map((file) => (
                      <Button
                        key={file.path}
                        variant="text"
                        onClick={() => setSelectedPath(file.path)}
                        sx={{
                          justifyContent: "flex-start",
                          textTransform: "none",
                          width: "100%",
                          fontFamily: "monospace",
                          fontSize: "0.8rem",
                          backgroundColor: selectedPath === file.path ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "transparent",
                        }}
                      >
                        {file.path}
                      </Button>
                    ))}
                </div>
              </div>

              <div style={{ flex: 1 }}>
                {!selectedPath ? (
                  <p className={styles.fieldHint}>Select a file to view and edit it.</p>
                ) : (
                  <>
                    <p style={{ fontSize: "0.85rem", fontFamily: "monospace", marginBottom: 8, color: "var(--text-secondary)" }}>
                      {selectedPath}
                    </p>
                    {fileState === "loading" ? (
                      <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
                        <CircularProgress size={24} />
                      </div>
                    ) : (
                      <>
                        <TextField
                          multiline
                          fullWidth
                          minRows={16}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          sx={{
                            "& textarea": {
                              fontFamily: "monospace",
                              fontSize: "0.8rem",
                            },
                          }}
                        />
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
                          <TextField
                            size="small"
                            fullWidth
                            placeholder="Commit message"
                            value={commitMessage}
                            onChange={(e) => setCommitMessage(e.target.value)}
                            disabled={committing}
                            sx={{ flex: "1 1 200px" }}
                          />
                          <Button
                            variant="contained"
                            size="small"
                            disabled={committing || !commitMessage.trim() || editContent === fileContent}
                            onClick={handleCommit}
                          >
                            {committing ? "Committing..." : `Commit to ${branch}`}
                          </Button>
                        </div>
                        {commitMsg && (
                          <p style={{ marginTop: 8, fontSize: "0.85rem", color: commitMsg.startsWith("Committed") ? "#16a34a" : "#dc2626" }}>
                            {commitMsg}
                          </p>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {tab === "branches" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
              <div style={{ border: "1px solid var(--field-border)", borderRadius: 10, padding: 12 }}>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 500, marginBottom: 12 }}>
                  Fork this repository
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <TextField
                    size="small"
                    placeholder="Target org (optional, blank = your account)"
                    value={forkOrg}
                    onChange={(e) => setForkOrg(e.target.value)}
                    sx={{ maxWidth: 320 }}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    disabled={forkBusy}
                    onClick={handleFork}
                  >
                    {forkBusy ? "Forking..." : "Fork"}
                  </Button>
                </div>
                {forkMsg && (
                  <p style={{ marginTop: 8, fontSize: "0.85rem", color: forkMsg.startsWith("Error:") ? "#dc2626" : "#16a34a" }}>
                    {forkMsg}
                  </p>
                )}
                {forkResult && (
                  <p style={{ marginTop: 8, fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                    Forked to{" "}
                    <a href={forkResult.htmlUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                      {forkResult.fullName}
                    </a>
                  </p>
                )}
              </div>

              <div style={{ border: "1px solid var(--field-border)", borderRadius: 10, padding: 12 }}>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 500, marginBottom: 12 }}>
                  Create a branch
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <TextField
                    size="small"
                    placeholder="new-branch-name"
                    value={newBranch}
                    onChange={(e) => setNewBranch(e.target.value)}
                  />
                  <span style={{ paddingTop: 8 }}>from</span>
                  <div style={{ minWidth: 200 }}>
                    <Typeahead
                      options={branches.map((b) => ({ value: b, label: b }))}
                      value={fromBranch || branch || defaultBranch}
                      onChange={(v) => setFromBranch(v)}
                      placeholder="from branch"
                    />
                  </div>
                  <Button
                    variant="contained"
                    size="small"
                    disabled={branchBusy || !newBranch.trim()}
                    onClick={handleCreateBranch}
                  >
                    Create
                  </Button>
                </div>
              </div>

              <div style={{ border: "1px solid var(--field-border)", borderRadius: 10, padding: 12 }}>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 500, marginBottom: 12 }}>
                  Branches
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {branches.length === 0 ? (
                    <p className={styles.fieldHint}>No branches found.</p>
                  ) : (
                    branches.map((b) => (
                      <div key={b} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                        <span style={{ fontFamily: "monospace", fontSize: "0.85rem", flex: 1 }}>
                          {b}
                        </span>
                        {b === defaultBranch && (
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 500,
                              backgroundColor: "var(--accent)",
                              color: "white",
                              padding: "2px 8px",
                              borderRadius: 4,
                            }}
                          >
                            default
                          </span>
                        )}
                        <Button
                          variant="outlined"
                          size="small"
                          color="error"
                          disabled={branchBusy || b === defaultBranch}
                          onClick={() => handleDeleteBranch(b)}
                        >
                          Delete
                        </Button>
                      </div>
                    ))
                  )}
                </div>
                {branchMsg && (
                  <p style={{ marginTop: 12, fontSize: "0.85rem", color: branchMsg.startsWith("Error:") ? "#dc2626" : "#16a34a" }}>
                    {branchMsg}
                  </p>
                )}
              </div>
            </div>
          )}
          {tab === "pulls" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
              <div style={{ border: "1px solid var(--field-border)", borderRadius: 10, padding: 12 }}>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 500, marginBottom: 12 }}>
                  Open a pull request
                </label>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Title"
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                  disabled={prBusy}
                  sx={{ marginBottom: 1 }}
                />
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 1, flexWrap: "wrap" }}>
                  <div style={{ minWidth: 180 }}>
                    <Typeahead
                      options={branches.map((b) => ({ value: b, label: b }))}
                      value={prHead || branch}
                      onChange={(v) => setPrHead(v)}
                      placeholder="head (compare)"
                    />
                  </div>
                  <span style={{ fontSize: "0.9rem" }}>into</span>
                  <div style={{ minWidth: 180 }}>
                    <Typeahead
                      options={branches.map((b) => ({ value: b, label: b }))}
                      value={prBase || defaultBranch}
                      onChange={(v) => setPrBase(v)}
                      placeholder="base"
                    />
                  </div>
                </div>
                <TextField
                  size="small"
                  fullWidth
                  multiline
                  minRows={3}
                  placeholder="Description (optional)"
                  value={prBody}
                  onChange={(e) => setPrBody(e.target.value)}
                  disabled={prBusy}
                  sx={{ marginBottom: 1 }}
                />
                <Button
                  variant="contained"
                  size="small"
                  disabled={prBusy || !prTitle.trim()}
                  onClick={handleCreatePr}
                >
                  {prBusy ? "Opening..." : "Create pull request"}
                </Button>
                {prMsg && (
                  <p
                    style={{
                      marginTop: 8,
                      fontSize: "0.85rem",
                      color: prMsg.startsWith("Error") ? "#dc2626" : "#16a34a",
                    }}
                  >
                    {prMsg}
                  </p>
                )}
              </div>

              <div style={{ border: "1px solid var(--field-border)", borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <label style={{ fontSize: "0.9rem", fontWeight: 500 }}>
                    Pull requests
                  </label>
                  <TextField
                    select
                    size="small"
                    value={prState}
                    onChange={(e) => setPrState(e.target.value as "open" | "closed" | "all")}
                    sx={{ minWidth: 120 }}
                  >
                    <MenuItem value="open">Open</MenuItem>
                    <MenuItem value="closed">Closed</MenuItem>
                    <MenuItem value="all">All</MenuItem>
                  </TextField>
                </div>

                {pullsState === "loading" && (
                  <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
                    <CircularProgress size={24} />
                  </div>
                )}
                {pullsState === "error" && <p className={styles.error}>{pullsError}</p>}
                {pullsState === "idle" && pulls.length === 0 && (
                  <p className={styles.fieldHint}>No pull requests.</p>
                )}
                {pullsState === "idle" &&
                  pulls.map((p) => (
                    <div
                      key={p.number}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 0",
                        borderTop: "1px solid var(--field-border)",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <a href={p.htmlUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                          #{p.number}
                        </a>
                        <span style={{ marginLeft: 8 }}>{p.title}</span>
                        <div style={{ fontSize: "0.8rem", fontFamily: "monospace", marginTop: 4, color: "var(--text-secondary)" }}>
                          {p.head} into {p.base}
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                          {p.state}
                          {p.draft ? " draft" : ""}
                        </div>
                      </div>
                      {p.state.toLowerCase() === "open" && !p.draft && (
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <TextField
                            select
                            size="small"
                            value={mergeMethod[p.number] ?? "merge"}
                            onChange={(e) =>
                              setMergeMethod((m) => ({ ...m, [p.number]: e.target.value as "merge" | "squash" | "rebase" }))
                            }
                            sx={{ minWidth: 110 }}
                          >
                            <MenuItem value="merge">Merge</MenuItem>
                            <MenuItem value="squash">Squash</MenuItem>
                            <MenuItem value="rebase">Rebase</MenuItem>
                          </TextField>
                          <Button
                            variant="outlined"
                            size="small"
                            disabled={mergingPr === p.number}
                            onClick={() => handleMerge(p.number)}
                          >
                            {mergingPr === p.number ? "Merging..." : "Merge"}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
          {tab === "actions" && <p className={styles.fieldHint}>Actions are coming next.</p>}
        </>
      )}
    </div>
  );
}
