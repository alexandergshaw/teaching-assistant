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
  listWorkflowsAction,
  dispatchWorkflowAction,
  listWorkflowRunsAction,
  listRunJobsAction,
  rerunWorkflowRunAction,
  cancelWorkflowRunAction,
  rerunFailedJobsAction,
  setWorkflowEnabledAction,
  listRunArtifactsAction,
  getArtifactDownloadUrlAction,
  getRunLogsDownloadUrlAction,
  listPendingDeploymentsAction,
  reviewPendingDeploymentsAction,
  createRepoAction,
  createCopilotRepoAction,
  createCopilotTaskAction,
  listCopilotTasksAction,
  bulkDeletePathsAction,
  bulkMovePathsAction,
} from "../actions";
import type { GithubRepo, RepoTreeEntry, PullRequestInfo, WorkflowInfo, WorkflowRunInfo, WorkflowJobInfo, CopilotTask, ArtifactInfo, PendingDeployment } from "@/lib/github";
import RepoSettingsPanel from "./RepoSettingsPanel";
import PublishToCanvasPage from "./PublishToCanvasPage";
import { buildBulkFolderNames } from "@/lib/bulk-folders";
import dynamic from "next/dynamic";
import Typeahead from "./ui/Typeahead";
import { submitOnEnter } from "./ui/submitOnEnter";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import CircularProgress from "@mui/material/CircularProgress";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import styles from "../page.module.css";

const VC_REPO_KEY = "ta-vc-repo";
const VC_BRANCH_KEY = "ta-vc-branch";

// Monaco (the VS Code editor) is client-only; load it lazily with SSR disabled.
const MonacoFileEditor = dynamic(() => import("./MonacoFileEditor"), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 16, fontSize: "0.85rem", color: "var(--text-secondary)" }}>Loading editor...</div>
  ),
});

export default function RepoDetail() {
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [reposState, setReposState] = useState<"loading" | "ready" | "error">("loading");
  const [repoRef, setRepoRef] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(VC_REPO_KEY) ?? "" : ""
  );
  const [branch, setBranch] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [defaultBranch, setDefaultBranch] = useState("");
  const [tab, setTab] = useState<"files" | "branches" | "pulls" | "actions" | "copilot" | "settings">("files");
  const [copilotTaskTitle, setCopilotTaskTitle] = useState("");
  const [copilotTaskBody, setCopilotTaskBody] = useState("");
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [copilotTaskMsg, setCopilotTaskMsg] = useState<{ kind: "success" | "error"; text: string; url?: string } | null>(null);
  const [copilotTasks, setCopilotTasks] = useState<CopilotTask[]>([]);
  const [copilotTasksState, setCopilotTasksState] = useState<"idle" | "loading" | "error">("idle");

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

  // Add file / folder (Files tab). treeNonce bumps to force a tree reload.
  const [treeNonce, setTreeNonce] = useState(0);
  const [showNewFile, setShowNewFile] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [newFileContent, setNewFileContent] = useState("");
  const [newFileMsg, setNewFileMsg] = useState("");
  const [creatingFile, setCreatingFile] = useState(false);
  const [newFileError, setNewFileError] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderPath, setNewFolderPath] = useState("");
  const [newFolderMsg, setNewFolderMsg] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderError, setNewFolderError] = useState<string | null>(null);
  const [bulkFolders, setBulkFolders] = useState(false);
  const [folderStart, setFolderStart] = useState("1");
  const [folderCount, setFolderCount] = useState("4");
  const [newFolderResult, setNewFolderResult] = useState<string | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [showMove, setShowMove] = useState(false);
  const [moveDest, setMoveDest] = useState("");

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

  // Actions tab state
  const [workflows, setWorkflows] = useState<WorkflowInfo[]>([]);
  const [runs, setRuns] = useState<WorkflowRunInfo[]>([]);
  const [actionsState, setActionsState] = useState<"idle" | "loading" | "error">("idle");
  const [actionsError, setActionsError] = useState<string | null>(null);
  const [actionsMsg, setActionsMsg] = useState<string | null>(null);
  const [dispatchingId, setDispatchingId] = useState<number | null>(null);
  const [runBusyId, setRunBusyId] = useState<number | null>(null);
  const [expandedRun, setExpandedRun] = useState<number | null>(null);
  const [jobsByRun, setJobsByRun] = useState<Record<number, WorkflowJobInfo[]>>({});
  const [jobsLoadingRun, setJobsLoadingRun] = useState<number | null>(null);
  const [filterWorkflowId, setFilterWorkflowId] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [artifactsByRun, setArtifactsByRun] = useState<Record<number, ArtifactInfo[]>>({});
  const [artifactsLoadingRun, setArtifactsLoadingRun] = useState<number | null>(null);
  const [expandedArtifactsRun, setExpandedArtifactsRun] = useState<number | null>(null);
  const [pendingByRun, setPendingByRun] = useState<Record<number, PendingDeployment[]>>({});
  const [dispatchWorkflowId, setDispatchWorkflowId] = useState<string>("");
  const [dispatchInputs, setDispatchInputs] = useState<Array<{ key: string; value: string }>>([]);
  const [dispatchBusy, setDispatchBusy] = useState(false);
  const [showRunWithInputs, setShowRunWithInputs] = useState(false);

  // Create repo state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createPrivate, setCreatePrivate] = useState(true);
  const [createTemplate, setCreateTemplate] = useState(false);
  const [createPrompt, setCreatePrompt] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<{ fullName: string; htmlUrl: string; issueUrl?: string; copilotNote?: string } | null>(null);

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

  // Persist the selected repo + branch so the Repos subtab reopens where it was.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (repoRef) localStorage.setItem(VC_REPO_KEY, repoRef);
    else localStorage.removeItem(VC_REPO_KEY);
  }, [repoRef]);

  useEffect(() => {
    if (typeof window !== "undefined" && branch) localStorage.setItem(VC_BRANCH_KEY, branch);
  }, [branch]);

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
      const storedBranch = typeof window !== "undefined" ? localStorage.getItem(VC_BRANCH_KEY) : null;
      setBranch(storedBranch && r.branches.includes(storedBranch) ? storedBranch : r.defaultBranch);
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
  }, [repoRef, branch, tab, treeNonce]);

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

  // Load workflows and runs when the actions tab is active
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!repoRef || tab !== "actions") {
      if (!repoRef) {
        setWorkflows([]);
        setRuns([]);
      }
      return;
    }
    let cancelled = false;
    setActionsState("loading");
    setActionsError(null);
    (async () => {
      const [wf, rr] = await Promise.all([
        listWorkflowsAction(repoRef),
        listWorkflowRunsAction(repoRef, branch, {
          status: filterStatus || undefined,
          workflowId: filterWorkflowId ? Number(filterWorkflowId) : undefined,
        }),
      ]);
      if (cancelled) return;
      if ("error" in wf) {
        setActionsState("error");
        setActionsError(wf.error);
        return;
      }
      if ("error" in rr) {
        setActionsState("error");
        setActionsError(rr.error);
        return;
      }
      setWorkflows(wf.workflows);
      setRuns(rr.runs);
      setActionsState("idle");
    })();
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [repoRef, tab, branch, filterStatus, filterWorkflowId]);

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

  const normalizePath = (p: string) => p.trim().replace(/^\/+/, "").replace(/\/+$/, "");

  const handleCreateFile = async () => {
    const path = normalizePath(newFilePath);
    if (!path) {
      setNewFileError("Enter a file path.");
      return;
    }
    if (!repoRef || !branch) {
      setNewFileError("Pick a repository and branch first.");
      return;
    }
    const message = newFileMsg.trim() || `Add ${path}`;
    setCreatingFile(true);
    setNewFileError(null);
    const r = await commitFileAction(repoRef, path, newFileContent, message, branch);
    setCreatingFile(false);
    if ("error" in r) {
      setNewFileError(r.error);
      return;
    }
    setShowNewFile(false);
    setNewFilePath("");
    setNewFileContent("");
    setNewFileMsg("");
    setTreeNonce((n) => n + 1);
    setSelectedPath(path);
  };

  const handleCreateFolder = async () => {
    if (!repoRef || !branch) {
      setNewFolderError("Pick a repository and branch first.");
      return;
    }
    const names = bulkFolders
      ? buildBulkFolderNames(newFolderPath, Number.parseInt(folderStart, 10), Number.parseInt(folderCount, 10))
      : (() => {
          const f = normalizePath(newFolderPath);
          return f ? [f] : [];
        })();
    if (names.length === 0) {
      setNewFolderError(
        bulkFolders ? "Enter a name pattern and a count of 1 to 100." : "Enter a folder path."
      );
      return;
    }
    setCreatingFolder(true);
    setNewFolderError(null);
    setNewFolderResult(null);
    const failures: string[] = [];
    let created = 0;
    for (const name of names) {
      const message = newFolderMsg.trim() || `Add ${name}/`;
      const r = await commitFileAction(repoRef, `${name}/.gitkeep`, "", message, branch);
      if ("error" in r) failures.push(name);
      else created += 1;
    }
    setCreatingFolder(false);
    setTreeNonce((n) => n + 1);
    if (failures.length > 0) {
      setNewFolderError(`Created ${created}. Failed: ${failures.join(", ")}.`);
      return;
    }
    setNewFolderResult(`Created ${created} folder${created === 1 ? "" : "s"}.`);
    setNewFolderPath("");
    setNewFolderMsg("");
  };

  // Load the loaded repo's Copilot tasks when the Copilot tab is active.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!repoRef || tab !== "copilot") return;
    let cancelled = false;
    setCopilotTasksState("loading");
    (async () => {
      const r = await listCopilotTasksAction(repoRef);
      if (cancelled) return;
      if ("error" in r) {
        setCopilotTasksState("error");
        return;
      }
      setCopilotTasks(r.tasks);
      setCopilotTasksState("idle");
    })();
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [repoRef, tab]);

  const reloadCopilotTasks = async () => {
    if (!repoRef) return;
    setCopilotTasksState("loading");
    const r = await listCopilotTasksAction(repoRef);
    if ("error" in r) {
      setCopilotTasksState("error");
      return;
    }
    setCopilotTasks(r.tasks);
    setCopilotTasksState("idle");
  };

  const handleCreateCopilotTask = async () => {
    if (!repoRef || !copilotTaskTitle.trim()) return;
    setCopilotBusy(true);
    setCopilotTaskMsg(null);
    const r = await createCopilotTaskAction(repoRef, copilotTaskTitle, copilotTaskBody);
    setCopilotBusy(false);
    if ("error" in r) {
      setCopilotTaskMsg({ kind: "error", text: r.error });
      return;
    }
    setCopilotTaskMsg({ kind: "success", text: `Created task #${r.issueNumber} and assigned Copilot.`, url: r.issueUrl });
    setCopilotTaskTitle("");
    setCopilotTaskBody("");
    await reloadCopilotTasks();
  };

  const toggleSelected = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedPaths(new Set());
    setShowMove(false);
    setMoveDest("");
  };

  const affectsOpenFile = (paths: string[]) =>
    !!selectedPath && paths.some((p) => selectedPath === p || selectedPath.startsWith(`${p}/`));

  const handleBulkDelete = async () => {
    const paths = [...selectedPaths];
    if (paths.length === 0 || !repoRef || !branch) return;
    if (typeof window !== "undefined" && !window.confirm(`Delete ${paths.length} selected item(s) from ${branch}? This cannot be undone.`)) return;
    setBulkBusy(true);
    setBulkMsg(null);
    const r = await bulkDeletePathsAction(repoRef, branch, paths);
    setBulkBusy(false);
    if ("error" in r) {
      setBulkMsg({ kind: "error", text: r.error });
      return;
    }
    setBulkMsg({ kind: "success", text: `Deleted ${r.deleted} file(s).` });
    if (affectsOpenFile(paths)) setSelectedPath("");
    clearSelection();
    setTreeNonce((n) => n + 1);
  };

  const handleBulkMove = async () => {
    const paths = [...selectedPaths];
    if (paths.length === 0 || !repoRef || !branch) return;
    setBulkBusy(true);
    setBulkMsg(null);
    const r = await bulkMovePathsAction(repoRef, branch, paths, moveDest);
    setBulkBusy(false);
    if ("error" in r) {
      setBulkMsg({ kind: "error", text: r.error });
      return;
    }
    setBulkMsg({ kind: "success", text: `Moved ${r.moved} file(s).` });
    if (affectsOpenFile(paths)) setSelectedPath("");
    clearSelection();
    setTreeNonce((n) => n + 1);
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

  const reloadRuns = async () => {
    const r = await listWorkflowRunsAction(repoRef, branch, {
      status: filterStatus || undefined,
      workflowId: filterWorkflowId ? Number(filterWorkflowId) : undefined,
    });
    if (!("error" in r)) setRuns(r.runs);
  };

  const handleDispatchWithInputs = async () => {
    if (!dispatchWorkflowId) {
      setActionsMsg("Error: choose a workflow to run.");
      return;
    }
    const inputs: Record<string, string> = {};
    for (const { key, value } of dispatchInputs) {
      if (key.trim()) inputs[key.trim()] = value;
    }
    setDispatchBusy(true);
    setActionsMsg(null);
    const r = await dispatchWorkflowAction(repoRef, dispatchWorkflowId, branch, Object.keys(inputs).length ? inputs : undefined);
    setDispatchBusy(false);
    if ("error" in r) {
      setActionsMsg(`Error: ${r.error}`);
      return;
    }
    setActionsMsg(`Dispatched on ${branch}. Give it a moment, then Refresh.`);
    setDispatchInputs([]);
  };

  const handleRerunFailed = async (id: number) => {
    setRunBusyId(id);
    setActionsMsg(null);
    const r = await rerunFailedJobsAction(repoRef, id);
    setRunBusyId(null);
    if ("error" in r) {
      setActionsMsg(`Error: ${r.error}`);
      return;
    }
    await reloadRuns();
  };

  const toggleArtifacts = async (id: number) => {
    if (expandedArtifactsRun === id) {
      setExpandedArtifactsRun(null);
      return;
    }
    setExpandedArtifactsRun(id);
    if (!artifactsByRun[id]) {
      setArtifactsLoadingRun(id);
      const r = await listRunArtifactsAction(repoRef, id);
      setArtifactsLoadingRun(null);
      if (!("error" in r)) setArtifactsByRun((m) => ({ ...m, [id]: r.artifacts }));
    }
  };

  const openDownload = async (result: Promise<{ url: string } | { error: string }>) => {
    const r = await result;
    if ("error" in r) {
      setActionsMsg(`Error: ${r.error}`);
      return;
    }
    if (typeof window !== "undefined") window.open(r.url, "_blank", "noopener");
  };

  const handleToggleWorkflow = async (w: WorkflowInfo, enabled: boolean) => {
    setActionsMsg(null);
    const r = await setWorkflowEnabledAction(repoRef, w.id, enabled);
    if ("error" in r) {
      setActionsMsg(`Error: ${r.error}`);
      return;
    }
    const list = await listWorkflowsAction(repoRef);
    if (!("error" in list)) setWorkflows(list.workflows);
  };

  const loadPending = async (id: number) => {
    setActionsMsg(null);
    const r = await listPendingDeploymentsAction(repoRef, id);
    if ("error" in r) {
      setActionsMsg(`Error: ${r.error}`);
      return;
    }
    setPendingByRun((m) => ({ ...m, [id]: r.deployments }));
  };

  const handleReview = async (id: number, envIds: number[], state: "approved" | "rejected") => {
    setRunBusyId(id);
    setActionsMsg(null);
    const r = await reviewPendingDeploymentsAction(repoRef, id, envIds, state, "");
    setRunBusyId(null);
    if ("error" in r) {
      setActionsMsg(`Error: ${r.error}`);
      return;
    }
    setPendingByRun((m) => ({ ...m, [id]: [] }));
    await reloadRuns();
  };

  const handleDispatch = async (w: WorkflowInfo) => {
    setDispatchingId(w.id);
    setActionsMsg(null);
    const r = await dispatchWorkflowAction(repoRef, String(w.id), branch);
    setDispatchingId(null);
    if ("error" in r) {
      setActionsMsg(`Error: ${r.error}`);
      return;
    }
    setActionsMsg(`Dispatched ${w.name} on ${branch}. Give it a moment, then Refresh.`);
  };

  const handleRerun = async (id: number) => {
    setRunBusyId(id);
    setActionsMsg(null);
    const r = await rerunWorkflowRunAction(repoRef, id);
    setRunBusyId(null);
    if ("error" in r) {
      setActionsMsg(`Error: ${r.error}`);
      return;
    }
    await reloadRuns();
  };

  const handleCancel = async (id: number) => {
    setRunBusyId(id);
    setActionsMsg(null);
    const r = await cancelWorkflowRunAction(repoRef, id);
    setRunBusyId(null);
    if ("error" in r) {
      setActionsMsg(`Error: ${r.error}`);
      return;
    }
    await reloadRuns();
  };

  const toggleJobs = async (id: number) => {
    if (expandedRun === id) {
      setExpandedRun(null);
      return;
    }
    setExpandedRun(id);
    if (!jobsByRun[id]) {
      setJobsLoadingRun(id);
      const r = await listRunJobsAction(repoRef, id);
      setJobsLoadingRun(null);
      if (!("error" in r)) setJobsByRun((m) => ({ ...m, [id]: r.jobs }));
    }
  };

  const handleCreateRepo = async () => {
    const name = createName.trim();
    if (!name) return;
    setCreateBusy(true);
    setCreateMsg(null);
    setCreateResult(null);
    const r = createPrompt.trim()
      ? await createCopilotRepoAction(name, createPrompt, createPrivate, undefined, createTemplate, createDescription)
      : await createRepoAction(name, createDescription, createPrivate, createTemplate);
    setCreateBusy(false);
    if ("error" in r) {
      setCreateMsg(`Error: ${r.error}`);
      return;
    }
    const fullName = "repo" in r ? r.repo.fullName : r.fullName;
    const htmlUrl = "repo" in r ? r.repo.htmlUrl : r.htmlUrl;
    const issueUrl = "repo" in r ? undefined : r.issueUrl;
    const copilotNote = "repo" in r ? undefined : r.copilotNote;
    setCreateResult({ fullName, htmlUrl, issueUrl, copilotNote });
    const list = await listGithubReposAction();
    if (!("error" in list)) setRepos(list.repos);
    setRepoRef(fullName);
    setCreateName("");
    setCreateDescription("");
    setCreatePrompt("");
    setShowCreate(false);
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

  const entryList = tree
    .filter((e) => e.type === "blob" || e.type === "tree")
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
        <Button variant="outlined" size="small" onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? "Cancel" : "New repository"}
        </Button>
      </div>

      {!repoRef && <p className={styles.fieldHint}>Pick a repository to browse its files, branches, pull requests, and actions.</p>}

      {showCreate && (
        <div style={{ border: "1px solid var(--field-border)", borderRadius: 10, padding: 12, marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Repository name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            onKeyDown={submitOnEnter(handleCreateRepo)}
          />
          <TextField
            size="small"
            fullWidth
            placeholder="Description (optional)"
            value={createDescription}
            onChange={(e) => setCreateDescription(e.target.value)}
            onKeyDown={submitOnEnter(handleCreateRepo)}
          />
          <div style={{ display: "flex", gap: 16 }}>
            <FormControlLabel
              control={<Checkbox size="small" checked={createPrivate} onChange={(e) => setCreatePrivate(e.target.checked)} />}
              label="Private"
            />
            <FormControlLabel
              control={<Checkbox size="small" checked={createTemplate} onChange={(e) => setCreateTemplate(e.target.checked)} />}
              label="Template"
            />
          </div>
          <TextField
            size="small"
            fullWidth
            multiline
            minRows={4}
            placeholder="GitHub Copilot prompt (optional)"
            value={createPrompt}
            onChange={(e) => setCreatePrompt(e.target.value)}
            sx={{ "& textarea": { fontFamily: "monospace", fontSize: "0.82rem" } }}
          />
          <Button
            variant="contained"
            size="small"
            disabled={createBusy || !createName.trim()}
            onClick={handleCreateRepo}
          >
            {createBusy ? "Creating..." : (createPrompt.trim() ? "Create repo with Copilot prompt" : "Create repository")}
          </Button>
          {createMsg && (
            <p style={{ fontSize: "0.85rem", color: createMsg.startsWith("Error") ? "#dc2626" : "var(--text-secondary)", marginTop: 4 }}>
              {createMsg}
            </p>
          )}
          {createResult && (
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: 4 }}>
              <p style={{ margin: 0 }}>
                Created{" "}
                <a href={createResult.htmlUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                  {createResult.fullName}
                </a>
              </p>
              {createResult.issueUrl && (
                <p style={{ margin: "4px 0 0" }}>
                  Copilot is building it —{" "}
                  <a href={createResult.issueUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                    view the issue
                  </a>
                  .
                </p>
              )}
              {createResult.copilotNote && (
                <p style={{ margin: "4px 0 0", color: "#d97706" }}>{createResult.copilotNote}</p>
              )}
            </div>
          )}
        </div>
      )}

      {repoRef && (
        <>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v as "files" | "branches" | "pulls" | "actions" | "copilot" | "settings")}
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
            <Tab label="Copilot" value="copilot" disableRipple />
            <Tab label="Settings" value="settings" disableRipple />
          </Tabs>

          {tab === "files" && (
            <>
            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => { setShowNewFile((v) => !v); setShowNewFolder(false); setNewFileError(null); }}
              >
                {showNewFile ? "Cancel new file" : "New file"}
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => { setShowNewFolder((v) => !v); setShowNewFile(false); setNewFolderError(null); setNewFolderResult(null); }}
              >
                {showNewFolder ? "Cancel new folder" : "New folder"}
              </Button>
            </div>

            {showNewFile && (
              <div style={{ border: "1px solid var(--field-border)", borderRadius: 10, padding: 12, marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="File path, e.g. src/util/new.ts"
                  value={newFilePath}
                  onChange={(e) => setNewFilePath(e.target.value)}
                  disabled={creatingFile}
                  sx={{ "& input": { fontFamily: "monospace", fontSize: "0.82rem" } }}
                />
                <TextField
                  multiline
                  minRows={6}
                  fullWidth
                  placeholder="File contents (optional)"
                  value={newFileContent}
                  onChange={(e) => setNewFileContent(e.target.value)}
                  disabled={creatingFile}
                  sx={{ "& textarea": { fontFamily: "monospace", fontSize: "0.8rem" } }}
                />
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Commit message (optional)"
                  value={newFileMsg}
                  onChange={(e) => setNewFileMsg(e.target.value)}
                  onKeyDown={submitOnEnter(handleCreateFile)}
                  disabled={creatingFile}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <Button variant="contained" size="small" disabled={creatingFile || !newFilePath.trim()} onClick={handleCreateFile}>
                    {creatingFile ? "Creating..." : `Create file on ${branch}`}
                  </Button>
                  <Button variant="text" size="small" onClick={() => setShowNewFile(false)}>
                    Cancel
                  </Button>
                </div>
                {newFileError && <p className={styles.error}>{newFileError}</p>}
              </div>
            )}

            {showNewFolder && (
              <div style={{ border: "1px solid var(--field-border)", borderRadius: 10, padding: 12, marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
                <FormControlLabel
                  control={<Checkbox size="small" checked={bulkFolders} onChange={(e) => { setBulkFolders(e.target.checked); setNewFolderError(null); setNewFolderResult(null); }} />}
                  label="Create multiple folders"
                />
                <TextField
                  size="small"
                  fullWidth
                  placeholder={bulkFolders ? "Name pattern, e.g. Module {n}" : "Folder path, e.g. docs/guides"}
                  value={newFolderPath}
                  onChange={(e) => setNewFolderPath(e.target.value)}
                  onKeyDown={submitOnEnter(handleCreateFolder)}
                  disabled={creatingFolder}
                  sx={{ "& input": { fontFamily: "monospace", fontSize: "0.82rem" } }}
                />
                {bulkFolders && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <TextField
                      size="small"
                      type="number"
                      label="Start"
                      value={folderStart}
                      onChange={(e) => setFolderStart(e.target.value)}
                      disabled={creatingFolder}
                      sx={{ width: 120 }}
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                    <TextField
                      size="small"
                      type="number"
                      label="Count"
                      value={folderCount}
                      onChange={(e) => setFolderCount(e.target.value)}
                      disabled={creatingFolder}
                      sx={{ width: 120 }}
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  </div>
                )}
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Commit message (optional)"
                  value={newFolderMsg}
                  onChange={(e) => setNewFolderMsg(e.target.value)}
                  onKeyDown={submitOnEnter(handleCreateFolder)}
                  disabled={creatingFolder}
                />
                <p className={styles.fieldHint}>
                  {bulkFolders
                    ? "Use {n} in the pattern for the number (otherwise it is appended). Each folder gets a .gitkeep since Git does not track empty folders."
                    : "Git does not track empty folders, so a .gitkeep file is added inside the new folder."}
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button variant="contained" size="small" disabled={creatingFolder || !newFolderPath.trim()} onClick={handleCreateFolder}>
                    {creatingFolder ? "Creating..." : bulkFolders ? `Create folders on ${branch}` : `Create folder on ${branch}`}
                  </Button>
                  <Button variant="text" size="small" onClick={() => setShowNewFolder(false)}>
                    Cancel
                  </Button>
                </div>
                {newFolderError && <p className={styles.error}>{newFolderError}</p>}
                {newFolderResult && <p className={styles.fieldHint}>{newFolderResult}</p>}
              </div>
            )}

            {selectedPaths.size > 0 && (
              <div style={{ border: "1px solid var(--field-border)", borderRadius: 10, padding: 12, marginTop: 8, display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{selectedPaths.size} selected</span>
                  <Button variant="outlined" size="small" color="error" disabled={bulkBusy} onClick={handleBulkDelete}>
                    {bulkBusy ? "Working..." : "Delete"}
                  </Button>
                  <Button variant="outlined" size="small" disabled={bulkBusy} onClick={() => setShowMove((v) => !v)}>
                    {showMove ? "Cancel move" : "Move to..."}
                  </Button>
                  <Button variant="text" size="small" onClick={clearSelection}>
                    Clear
                  </Button>
                </div>
                {showMove && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <TextField
                      size="small"
                      placeholder="Destination folder (blank = repo root)"
                      value={moveDest}
                      onChange={(e) => setMoveDest(e.target.value)}
                      onKeyDown={submitOnEnter(handleBulkMove)}
                      disabled={bulkBusy}
                      sx={{ flex: "1 1 240px", "& input": { fontFamily: "monospace", fontSize: "0.82rem" } }}
                    />
                    <Button variant="contained" size="small" disabled={bulkBusy} onClick={handleBulkMove}>
                      {bulkBusy ? "Moving..." : `Move ${selectedPaths.size} to ${moveDest.trim() ? moveDest.trim() : "root"}`}
                    </Button>
                  </div>
                )}
                {bulkMsg && (
                  <p className={bulkMsg.kind === "error" ? styles.error : styles.fieldHint} style={{ margin: 0 }}>
                    {bulkMsg.text}
                  </p>
                )}
              </div>
            )}

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
                    entryList.map((entry) => {
                      const depth = entry.path.split("/").length - 1;
                      const name = entry.path.split("/").pop() || entry.path;
                      const indent = depth * 14 + 8;
                      return (
                        <div
                          key={entry.path}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            backgroundColor: selectedPath === entry.path ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "transparent",
                          }}
                        >
                          <Checkbox
                            size="small"
                            checked={selectedPaths.has(entry.path)}
                            onChange={() => toggleSelected(entry.path)}
                            sx={{ padding: "2px" }}
                          />
                          {entry.type === "blob" ? (
                            <Button
                              variant="text"
                              onClick={() => setSelectedPath(entry.path)}
                              title={entry.path}
                              sx={{
                                justifyContent: "flex-start",
                                textTransform: "none",
                                flex: 1,
                                minWidth: 0,
                                fontFamily: "monospace",
                                fontSize: "0.8rem",
                                pl: `${indent}px`,
                              }}
                            >
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%", textAlign: "left" }}>
                                {name}
                              </span>
                            </Button>
                          ) : (
                            <span
                              title={entry.path}
                              style={{
                                flex: 1,
                                minWidth: 0,
                                fontFamily: "monospace",
                                fontSize: "0.8rem",
                                fontWeight: 600,
                                color: "var(--text-secondary)",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                padding: "6px 8px",
                                paddingLeft: indent,
                              }}
                            >
                              {name}/
                            </span>
                          )}
                        </div>
                      );
                    })}
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
                        <MonacoFileEditor
                          path={selectedPath}
                          value={editContent}
                          onChange={setEditContent}
                          height="60vh"
                        />
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 12, flexWrap: "wrap" }}>
                          <TextField
                            size="small"
                            fullWidth
                            placeholder="Commit message"
                            value={commitMessage}
                            onChange={(e) => setCommitMessage(e.target.value)}
                            onKeyDown={submitOnEnter(handleCommit)}
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
                        <div style={{ marginTop: 12 }}>
                          <PublishToCanvasPage filePath={selectedPath} content={editContent} />
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
            </>
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
                    onKeyDown={submitOnEnter(handleFork)}
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
                    onKeyDown={submitOnEnter(handleCreateBranch)}
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
                  onKeyDown={submitOnEnter(handleCreatePr)}
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
          {tab === "actions" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
              <div style={{ border: "1px solid var(--field-border)", borderRadius: 10, padding: 12 }}>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 500, marginBottom: 12 }}>Workflows</label>
                {actionsState === "loading" && (
                  <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
                    <CircularProgress size={24} />
                  </div>
                )}
                {actionsState === "error" && <p className={styles.error}>{actionsError}</p>}
                {actionsState === "idle" && workflows.length === 0 && <p className={styles.fieldHint}>No workflows found.</p>}
                {actionsState === "idle" &&
                  workflows.map((w) => (
                    <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                      <div style={{ flex: 1 }}>
                        <span>{w.name}</span>
                        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: 2 }}>
                          <span style={{ marginRight: 12 }}>{w.state}</span>
                          <span style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{w.path}</span>
                        </div>
                      </div>
                      <Button variant="text" size="small" onClick={() => handleToggleWorkflow(w, w.state !== "active")}>
                        {w.state === "active" ? "Disable" : "Enable"}
                      </Button>
                      <Button variant="outlined" size="small" disabled={dispatchingId === w.id || w.state !== "active"} onClick={() => handleDispatch(w)}>
                        {dispatchingId === w.id ? "Running..." : `Run on ${branch}`}
                      </Button>
                    </div>
                  ))}

                <div style={{ marginTop: 8 }}>
                  <Button variant="text" size="small" onClick={() => setShowRunWithInputs((v) => !v)}>
                    {showRunWithInputs ? "Hide run with inputs" : "Run a workflow with inputs"}
                  </Button>
                </div>
                {showRunWithInputs && (
                  <div style={{ border: "1px solid var(--field-border)", borderRadius: 8, padding: 10, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                    <TextField select size="small" label="Workflow" value={dispatchWorkflowId} onChange={(e) => setDispatchWorkflowId(e.target.value)} sx={{ maxWidth: 320 }} slotProps={{ inputLabel: { shrink: true } }}>
                      {workflows.map((w) => (
                        <MenuItem key={w.id} value={String(w.id)}>{w.name}</MenuItem>
                      ))}
                    </TextField>
                    {dispatchInputs.map((inp, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <TextField size="small" placeholder="input name" value={inp.key} onChange={(e) => setDispatchInputs((rows) => rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))} />
                        <TextField size="small" placeholder="value" value={inp.value} onChange={(e) => setDispatchInputs((rows) => rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))} />
                        <Button variant="text" size="small" color="error" onClick={() => setDispatchInputs((rows) => rows.filter((_, j) => j !== i))}>Remove</Button>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button variant="text" size="small" onClick={() => setDispatchInputs((rows) => [...rows, { key: "", value: "" }])}>Add input</Button>
                      <Button variant="contained" size="small" disabled={dispatchBusy || !dispatchWorkflowId} onClick={handleDispatchWithInputs}>
                        {dispatchBusy ? "Running..." : `Run on ${branch}`}
                      </Button>
                    </div>
                  </div>
                )}
                {actionsMsg && (
                  <p style={{ marginTop: 12, fontSize: "0.85rem", color: actionsMsg.startsWith("Error:") ? "#dc2626" : "var(--text-secondary)" }}>{actionsMsg}</p>
                )}
              </div>

              <div style={{ border: "1px solid var(--field-border)", borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
                  <label style={{ fontSize: "0.9rem", fontWeight: 500 }}>Runs</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <TextField select size="small" label="Workflow" value={filterWorkflowId} onChange={(e) => setFilterWorkflowId(e.target.value)} sx={{ minWidth: 150 }} slotProps={{ inputLabel: { shrink: true } }}>
                      <MenuItem value="">All workflows</MenuItem>
                      {workflows.map((w) => (
                        <MenuItem key={w.id} value={String(w.id)}>{w.name}</MenuItem>
                      ))}
                    </TextField>
                    <TextField select size="small" label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} sx={{ minWidth: 130 }} slotProps={{ inputLabel: { shrink: true } }}>
                      <MenuItem value="">All</MenuItem>
                      <MenuItem value="queued">Queued</MenuItem>
                      <MenuItem value="in_progress">In progress</MenuItem>
                      <MenuItem value="completed">Completed</MenuItem>
                      <MenuItem value="success">Success</MenuItem>
                      <MenuItem value="failure">Failure</MenuItem>
                      <MenuItem value="cancelled">Cancelled</MenuItem>
                      <MenuItem value="waiting">Waiting</MenuItem>
                    </TextField>
                    <Button variant="text" size="small" onClick={reloadRuns}>Refresh</Button>
                  </div>
                </div>
                {actionsState === "loading" && (
                  <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
                    <CircularProgress size={24} />
                  </div>
                )}
                {runs.length === 0 && actionsState === "idle" && <p className={styles.fieldHint}>No runs match.</p>}
                {runs.map((run) => {
                  const dur =
                    run.runStartedAt && run.updatedAt
                      ? Math.max(0, Math.round((new Date(run.updatedAt).getTime() - new Date(run.runStartedAt).getTime()) / 1000))
                      : null;
                  const durLabel = dur == null ? "" : dur >= 60 ? `${Math.floor(dur / 60)}m ${dur % 60}s` : `${dur}s`;
                  const pending = pendingByRun[run.id];
                  return (
                    <div key={run.id} style={{ padding: "12px 0", borderTop: "1px solid var(--field-border)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: "200px" }}>
                          <span>
                            {run.displayTitle || run.name} <span style={{ color: "var(--text-secondary)" }}>#{run.runNumber}</span>
                          </span>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.85rem", marginTop: 4, flexWrap: "wrap" }}>
                            <span style={{ color: run.conclusion === "success" ? "#16a34a" : run.conclusion === "failure" || run.conclusion === "cancelled" ? "var(--error, #b91c1c)" : "var(--text-secondary)" }}>
                              {run.conclusion ?? run.status}
                            </span>
                            <span style={{ fontFamily: "monospace", fontSize: "0.75rem" }}>{run.headBranch}</span>
                            {run.event && <span style={{ color: "var(--text-secondary)" }}>{run.event}</span>}
                            {run.actor && <span style={{ color: "var(--text-secondary)" }}>{run.actor}</span>}
                            {durLabel && <span style={{ color: "var(--text-secondary)" }}>{durLabel}</span>}
                            <span style={{ color: "var(--text-secondary)" }}>{new Date(run.createdAt).toLocaleString()}</span>
                            <a href={run.htmlUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "none", fontSize: "0.8rem" }}>open</a>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <Button variant="text" size="small" onClick={() => toggleJobs(run.id)}>{expandedRun === run.id ? "Hide jobs" : "Jobs"}</Button>
                          <Button variant="text" size="small" onClick={() => toggleArtifacts(run.id)}>{expandedArtifactsRun === run.id ? "Hide artifacts" : "Artifacts"}</Button>
                          <Button variant="text" size="small" onClick={() => openDownload(getRunLogsDownloadUrlAction(repoRef, run.id))}>Logs</Button>
                          {run.status !== "completed" ? (
                            <>
                              <Button variant="text" size="small" onClick={() => loadPending(run.id)}>Approvals</Button>
                              <Button variant="outlined" size="small" color="error" disabled={runBusyId === run.id} onClick={() => handleCancel(run.id)}>Cancel</Button>
                            </>
                          ) : (
                            <>
                              <Button variant="outlined" size="small" disabled={runBusyId === run.id} onClick={() => handleRerun(run.id)}>Re-run</Button>
                              <Button variant="outlined" size="small" disabled={runBusyId === run.id} onClick={() => handleRerunFailed(run.id)}>Re-run failed</Button>
                            </>
                          )}
                        </div>
                      </div>

                      {pending && pending.length > 0 && (
                        <div style={{ marginTop: 8, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Waiting on: {pending.map((d) => d.environmentName).join(", ")}</span>
                          <div style={{ display: "flex", gap: 8 }}>
                            <Button variant="contained" size="small" disabled={runBusyId === run.id} onClick={() => handleReview(run.id, pending.map((d) => d.environmentId), "approved")}>Approve</Button>
                            <Button variant="outlined" size="small" color="error" disabled={runBusyId === run.id} onClick={() => handleReview(run.id, pending.map((d) => d.environmentId), "rejected")}>Reject</Button>
                          </div>
                        </div>
                      )}

                      {expandedRun === run.id && (
                        <div style={{ marginTop: 8, paddingLeft: 16 }}>
                          {jobsLoadingRun === run.id && (
                            <div style={{ display: "flex", justifyContent: "center", padding: 8 }}>
                              <CircularProgress size={20} />
                            </div>
                          )}
                          {jobsByRun[run.id] && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                              {jobsByRun[run.id].map((job) => (
                                <div key={job.id} style={{ fontSize: "0.85rem" }}>
                                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <span>{job.name}</span>
                                    <span style={{ color: job.conclusion === "success" ? "#16a34a" : job.conclusion === "failure" || job.conclusion === "cancelled" ? "var(--error, #b91c1c)" : "var(--text-secondary)" }}>{job.conclusion ?? job.status}</span>
                                    {job.htmlUrl && <a href={job.htmlUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontSize: "0.78rem" }}>view</a>}
                                  </div>
                                  {job.steps.length > 0 && (
                                    <div style={{ paddingLeft: 16, marginTop: 2, display: "flex", flexDirection: "column", gap: 2 }}>
                                      {job.steps.map((s) => (
                                        <div key={s.number} style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                                          <span>{s.name}</span>
                                          <span style={{ marginLeft: 8, color: s.conclusion === "success" ? "#16a34a" : s.conclusion === "failure" ? "var(--error, #b91c1c)" : "var(--text-secondary)" }}>{s.conclusion ?? s.status}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {expandedArtifactsRun === run.id && (
                        <div style={{ marginTop: 8, paddingLeft: 16 }}>
                          {artifactsLoadingRun === run.id && (
                            <div style={{ display: "flex", justifyContent: "center", padding: 8 }}>
                              <CircularProgress size={20} />
                            </div>
                          )}
                          {artifactsByRun[run.id] && artifactsByRun[run.id].length === 0 && <p className={styles.fieldHint}>No artifacts.</p>}
                          {artifactsByRun[run.id] &&
                            artifactsByRun[run.id].map((a) => (
                              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", padding: "3px 0" }}>
                                <span style={{ flex: 1 }}>{a.name}</span>
                                <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>{Math.round(a.sizeInBytes / 1024)} KB</span>
                                {a.expired ? (
                                  <span style={{ color: "var(--text-secondary)", fontSize: "0.78rem" }}>expired</span>
                                ) : (
                                  <Button variant="text" size="small" onClick={() => openDownload(getArtifactDownloadUrlAction(repoRef, a.id))}>Download</Button>
                                )}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tab === "copilot" && (
            <div style={{ display: "flex", gap: 16, marginTop: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ border: "1px solid var(--field-border)", borderRadius: 10, padding: 12, flex: "1 1 320px", minWidth: 280 }}>
                <label style={{ display: "block", fontSize: "0.9rem", fontWeight: 500, marginBottom: 8 }}>
                  Assign a Copilot coding agent
                </label>
                <p className={styles.fieldHint} style={{ marginTop: 0 }}>
                  Describe a task. It is opened as an issue on {repoRef} and assigned to GitHub&apos;s Copilot coding
                  agent, which works on it and opens a pull request.
                </p>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="Task title, e.g. Add input validation to the signup form"
                  value={copilotTaskTitle}
                  onChange={(e) => setCopilotTaskTitle(e.target.value)}
                  disabled={copilotBusy}
                  sx={{ marginBottom: 1 }}
                />
                <TextField
                  size="small"
                  fullWidth
                  multiline
                  minRows={4}
                  placeholder="Details for Copilot (optional): acceptance criteria, files to touch, constraints..."
                  value={copilotTaskBody}
                  onChange={(e) => setCopilotTaskBody(e.target.value)}
                  disabled={copilotBusy}
                  sx={{ marginBottom: 1 }}
                />
                <Button
                  variant="contained"
                  size="small"
                  disabled={copilotBusy || !copilotTaskTitle.trim()}
                  onClick={handleCreateCopilotTask}
                >
                  {copilotBusy ? "Assigning..." : "Assign to Copilot"}
                </Button>
                {copilotTaskMsg && (
                  <p
                    className={copilotTaskMsg.kind === "error" ? styles.error : styles.fieldHint}
                    style={{ marginTop: 8 }}
                  >
                    {copilotTaskMsg.text}
                    {copilotTaskMsg.url && (
                      <>
                        {" "}
                        <a href={copilotTaskMsg.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                          view the issue
                        </a>
                      </>
                    )}
                  </p>
                )}
              </div>

              <div style={{ border: "1px solid var(--field-border)", borderRadius: 10, padding: 12, flex: "1 1 320px", minWidth: 280 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <label style={{ fontSize: "0.9rem", fontWeight: 500 }}>Copilot tasks</label>
                  <Button variant="text" size="small" onClick={reloadCopilotTasks} disabled={copilotTasksState === "loading"}>
                    Refresh
                  </Button>
                </div>
                {copilotTasksState === "loading" && (
                  <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
                    <CircularProgress size={24} />
                  </div>
                )}
                {copilotTasksState === "error" && <p className={styles.error}>Could not load Copilot tasks.</p>}
                {copilotTasksState === "idle" && copilotTasks.length === 0 && (
                  <p className={styles.fieldHint}>No Copilot tasks yet.</p>
                )}
                {copilotTasksState === "idle" &&
                  copilotTasks.map((t) => (
                    <div
                      key={t.number}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid var(--field-border)" }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <a href={t.htmlUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                          #{t.number}
                        </a>
                        <span style={{ marginLeft: 8 }}>{t.title}</span>
                      </div>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", flexShrink: 0 }}>
                        {t.isPullRequest ? "PR" : "issue"} · {t.state}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {tab === "settings" && (() => {
            const selectedRepo = repos.find((r) => r.fullName === repoRef);
            return selectedRepo ? (
              <RepoSettingsPanel
                repo={selectedRepo}
                onUpdated={(u) => setRepos((prev) => prev.map((r) => (r.fullName === u.fullName ? u : r)))}
              />
            ) : (
              <p className={styles.fieldHint}>Repository details unavailable.</p>
            );
          })()}
        </>
      )}
    </div>
  );
}
