"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getRepoTreeAction,
  getFileTextAction,
  commitFileAction,
  bulkDeletePathsAction,
  bulkMovePathsAction,
} from "../../actions";
import type { RepoTreeEntry } from "@/lib/github";
import { buildBulkFolderNames } from "@/lib/bulk-folders";

const VC_TREE_WIDTH_KEY = "ta-vc-tree-width";

// Owns the Files tab: the tree, the open file's editor state, new file/folder
// creation, and bulk select/delete/move.
export function useFilesTab(repoRef: string, branch: string, tab: string) {
  const [tree, setTree] = useState<RepoTreeEntry[]>([]);
  const [treeState, setTreeState] = useState<"loading" | "ready" | "error">("ready");
  const [filter, setFilter] = useState("");
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  // Width of the file-tree column; user-resizable via the split divider.
  const [treeWidth, setTreeWidth] = useState<number>(() => {
    if (typeof window === "undefined") return 320;
    const saved = Number(localStorage.getItem(VC_TREE_WIDTH_KEY));
    return Number.isFinite(saved) && saved >= 220 && saved <= 600 ? saved : 320;
  });
  const treeWidthRef = useRef(treeWidth);

  // Drag the divider to resize the tree column (pointer capture on window so
  // the drag survives leaving the divider); persists the width on release.
  const startTreeResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = treeWidthRef.current;
    const move = (ev: PointerEvent) => {
      const w = Math.min(600, Math.max(220, startW + (ev.clientX - startX)));
      treeWidthRef.current = w;
      setTreeWidth(w);
    };
    const up = () => {
      localStorage.setItem(VC_TREE_WIDTH_KEY, String(treeWidthRef.current));
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
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
  const [newFileDest, setNewFileDest] = useState(""); // Destinations are repo-specific and stale values would misdirect actions into the wrong folders; do not persist.
  const [newFileContent, setNewFileContent] = useState("");
  const [newFileMsg, setNewFileMsg] = useState("");
  const [creatingFile, setCreatingFile] = useState(false);
  const [newFileError, setNewFileError] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderPath, setNewFolderPath] = useState("");
  const [newFolderDest, setNewFolderDest] = useState(""); // Destinations are repo-specific and stale values would misdirect actions into the wrong folders; do not persist.
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

  // Reset this tab's state when the selected repo changes (called from
  // useRepoBranchSync's branch-load effect, which owns the repoRef watch).
  const resetForRepoChange = useCallback(() => {
    setTree([]);
    setSelectedPath("");
    setFileContent("");
    setEditContent("");
    setCommitMessage("");
    setCommitMsg("");
    setCollapsedDirs(new Set());
  }, []);

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
    const dest = normalizePath(newFileDest);
    let fileName = normalizePath(newFilePath);
    if (!fileName) {
      setNewFileError("Enter a file path.");
      return;
    }
    if (dest) {
      fileName = `${dest}/${fileName}`;
    }
    if (!repoRef || !branch) {
      setNewFileError("Pick a repository and branch first.");
      return;
    }
    const message = newFileMsg.trim() || `Add ${fileName}`;
    setCreatingFile(true);
    setNewFileError(null);
    const r = await commitFileAction(repoRef, fileName, newFileContent, message, branch);
    setCreatingFile(false);
    if ("error" in r) {
      setNewFileError(r.error);
      return;
    }
    setShowNewFile(false);
    setNewFilePath("");
    setNewFileDest("");
    setNewFileContent("");
    setNewFileMsg("");
    setTreeNonce((n) => n + 1);
    setSelectedPath(fileName);
  };

  const handleCreateFolder = async () => {
    if (!repoRef || !branch) {
      setNewFolderError("Pick a repository and branch first.");
      return;
    }
    const dest = normalizePath(newFolderDest);
    let names = bulkFolders
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
    if (dest) {
      names = names.map((name) => `${dest}/${name}`);
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
    setNewFolderDest("");
    setNewFolderMsg("");
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

  const toggleCollapsedDir = (dirPath: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  };

  const collapseAllDirs = () => {
    const allTreePaths = tree.filter((e) => e.type === "tree").map((e) => e.path);
    setCollapsedDirs(new Set(allTreePaths));
  };

  const expandAllDirs = () => {
    setCollapsedDirs(new Set());
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

  const folderOptions = tree.filter((e) => e.type === "tree").map((e) => e.path).sort();

  const collapseActive = !filter.trim();
  const entryList = tree
    .filter((e) => e.type === "blob" || e.type === "tree")
    .filter((e) => {
      if (!filter) return true;
      return e.path.toLowerCase().includes(filter.toLowerCase());
    })
    .filter((e) => {
      if (!collapseActive) return true;
      return ![...collapsedDirs].some((d) => e.path.startsWith(d + "/"));
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  // Select-all over the currently listed (filtered) files and folders.
  const allEntriesSelected = entryList.length > 0 && entryList.every((e) => selectedPaths.has(e.path));
  const someEntriesSelected = entryList.some((e) => selectedPaths.has(e.path));
  const toggleSelectAll = () => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (allEntriesSelected) for (const e of entryList) next.delete(e.path);
      else for (const e of entryList) next.add(e.path);
      return next;
    });
  };

  return {
    tree,
    treeState,
    filter,
    setFilter,
    collapsedDirs,
    treeWidth,
    startTreeResize,
    selectedPath,
    setSelectedPath,
    fileContent,
    editContent,
    setEditContent,
    fileState,
    commitMessage,
    setCommitMessage,
    committing,
    commitMsg,
    showNewFile,
    setShowNewFile,
    newFilePath,
    setNewFilePath,
    newFileDest,
    setNewFileDest,
    newFileContent,
    setNewFileContent,
    newFileMsg,
    setNewFileMsg,
    creatingFile,
    newFileError,
    setNewFileError,
    showNewFolder,
    setShowNewFolder,
    newFolderPath,
    setNewFolderPath,
    newFolderDest,
    setNewFolderDest,
    newFolderMsg,
    setNewFolderMsg,
    creatingFolder,
    newFolderError,
    setNewFolderError,
    bulkFolders,
    setBulkFolders,
    folderStart,
    setFolderStart,
    folderCount,
    setFolderCount,
    newFolderResult,
    setNewFolderResult,
    selectedPaths,
    bulkBusy,
    bulkMsg,
    showMove,
    setShowMove,
    moveDest,
    setMoveDest,
    resetForRepoChange,
    handleCommit,
    handleCreateFile,
    handleCreateFolder,
    toggleSelected,
    clearSelection,
    toggleCollapsedDir,
    collapseAllDirs,
    expandAllDirs,
    handleBulkDelete,
    handleBulkMove,
    folderOptions,
    collapseActive,
    entryList,
    allEntriesSelected,
    someEntriesSelected,
    toggleSelectAll,
  };
}
