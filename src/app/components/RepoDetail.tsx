"use client";

import { useEffect, useState } from "react";
import {
  listGithubReposAction,
  listGithubBranchesAction,
  getRepoTreeAction,
  getFileTextAction,
  commitFileAction,
} from "../actions";
import type { GithubRepo, RepoTreeEntry } from "@/lib/github";
import Typeahead from "./ui/Typeahead";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import styles from "../page.module.css";

export default function RepoDetail() {
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [reposState, setReposState] = useState<"loading" | "ready" | "error">("loading");
  const [repoRef, setRepoRef] = useState("");
  const [branch, setBranch] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
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
        setBranch("");
        return;
      }
      setBranches(r.branches);
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

          {tab === "branches" && <p className={styles.fieldHint}>Branch management is coming next.</p>}
          {tab === "pulls" && <p className={styles.fieldHint}>Pull requests are coming next.</p>}
          {tab === "actions" && <p className={styles.fieldHint}>Actions are coming next.</p>}
        </>
      )}
    </div>
  );
}
