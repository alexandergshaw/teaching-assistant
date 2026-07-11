"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  listMyOrgsAction,
  getRepoTreeAction,
  copyRepoAction,
} from "../actions";
import type { RepoTreeEntry, CopyRepoOptions, CopyRepoResult } from "@/lib/github";
import Typeahead from "./ui/Typeahead";
import { submitOnEnter } from "./ui/submitOnEnter";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import CircularProgress from "@mui/material/CircularProgress";
import styles from "../page.module.css";

interface CopyRepoPanelProps {
  repoRef: string;
  branches: string[];
  defaultBranch: string;
}

interface TreeNode {
  path: string;
  name: string;
  type: "blob" | "tree";
  size?: number;
  mode?: string;
  children?: TreeNode[];
}

const COPY_OWNER_KEY = "ta-vc-copy-owner";
const COPY_VISIBILITY_KEY = "ta-vc-copy-visibility";
const COPY_WORKFLOWS_KEY = "ta-vc-copy-workflows";
const COPY_TOPICS_KEY = "ta-vc-copy-topics";
const COPY_LABELS_KEY = "ta-vc-copy-labels";
const COPY_TEMPLATE_KEY = "ta-vc-copy-template";

function makeCopyNameKey(repoRef: string) {
  return `ta-vc-copy-name:${repoRef}`;
}

function makeCopyMsgKey(repoRef: string) {
  return `ta-vc-copy-msg:${repoRef}`;
}

function buildTreeStructure(entries: RepoTreeEntry[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  entries
    .filter((e) => e.type === "blob" || e.type === "tree")
    .forEach((entry) => {
      const node: TreeNode = {
        path: entry.path,
        name: entry.path.split("/").pop() || entry.path,
        type: entry.type,
        size: entry.size,
        mode: entry.mode,
      };
      map.set(entry.path, node);
    });

  map.forEach((node) => {
    let parent: TreeNode | undefined;
    const parts = node.path.split("/");
    if (parts.length > 1) {
      const parentPath = parts.slice(0, -1).join("/");
      parent = map.get(parentPath);
    }

    if (parent) {
      if (!parent.children) parent.children = [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  roots.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === "tree" ? -1 : 1;
  });

  roots.forEach((root) => {
    if (root.children)
      root.children.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === "tree" ? -1 : 1;
      });
  });

  return roots;
}

function collectBlobPaths(node: TreeNode): string[] {
  if (node.type === "blob") return [node.path];
  if (node.children) {
    return node.children.flatMap((child) => collectBlobPaths(child));
  }
  return [];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function CopyRepoPanel({
  repoRef,
  branches,
  defaultBranch,
  description,
}: CopyRepoPanelProps & { description?: string }) {
  const [orgs, setOrgs] = useState<string[]>([]);
  const [orgsLoading, setOrgsLoading] = useState(false);

  const sourceName = repoRef.split("/")[1] ?? "";
  const defaultNameForRepo = sourceName ? `${sourceName}-copy` : "";

  const [destOwner, setDestOwner] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(COPY_OWNER_KEY) ?? "" : ""
  );
  const [destName, setDestName] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(makeCopyNameKey(repoRef)) ?? defaultNameForRepo : defaultNameForRepo
  );
  const [destDescription, setDestDescription] = useState(description ?? "");
  const [visibility, setVisibility] = useState<"private" | "public">(() => {
    if (typeof window === "undefined") return "private";
    const saved = localStorage.getItem(COPY_VISIBILITY_KEY);
    return (saved === "public" ? "public" : "private") as "private" | "public";
  });
  const [markTemplate, setMarkTemplate] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COPY_TEMPLATE_KEY) === "1";
  });
  const [sourceBranch, setSourceBranch] = useState(defaultBranch);

  const [tree, setTree] = useState<RepoTreeEntry[]>([]);
  const [treeState, setTreeState] = useState<"loading" | "ready" | "error">("ready");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [includeWorkflows, setIncludeWorkflows] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COPY_WORKFLOWS_KEY) === "1";
  });
  const [copyTopics, setCopyTopics] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COPY_TOPICS_KEY) === "1";
  });
  const [copyLabels, setCopyLabels] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(COPY_LABELS_KEY) === "1";
  });
  const [commitMessage, setCommitMessage] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(makeCopyMsgKey(repoRef)) ?? "" : ""
  );

  const [copyBusy, setCopyBusy] = useState(false);
  const [copyResult, setCopyResult] = useState<CopyRepoResult | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  // The repoRef the user last edited the description for. When it matches the
  // current repoRef, a late-arriving description prop must not clobber the
  // user's text; switching repos re-keys the flag (the stored ref no longer
  // matches), so the new repo's description prefills again.
  const descEditedForRepoRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(makeCopyNameKey(repoRef));
    const newDefault = defaultNameForRepo;
    const storedMsg = localStorage.getItem(makeCopyMsgKey(repoRef));
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setDestName(stored ?? newDefault);
    setCommitMessage(storedMsg ?? "");
    if (descEditedForRepoRef.current !== repoRef) {
      setDestDescription(description ?? "");
      // Clear the flag when the reset fires so switching back to a repo the
      // user edited earlier prefills fresh instead of showing stale text.
      descEditedForRepoRef.current = null;
    }
  }, [repoRef, description, defaultNameForRepo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(COPY_OWNER_KEY, destOwner);
    localStorage.setItem(COPY_VISIBILITY_KEY, visibility);
    localStorage.setItem(COPY_TEMPLATE_KEY, markTemplate ? "1" : "0");
    localStorage.setItem(COPY_WORKFLOWS_KEY, includeWorkflows ? "1" : "0");
    localStorage.setItem(COPY_TOPICS_KEY, copyTopics ? "1" : "0");
    localStorage.setItem(COPY_LABELS_KEY, copyLabels ? "1" : "0");
    localStorage.setItem(makeCopyNameKey(repoRef), destName);
    localStorage.setItem(makeCopyMsgKey(repoRef), commitMessage);
  }, [
    destOwner,
    visibility,
    markTemplate,
    includeWorkflows,
    copyTopics,
    copyLabels,
    destName,
    commitMessage,
    repoRef,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setOrgsLoading(true);
      const r = await listMyOrgsAction();
      if (cancelled) return;
      setOrgsLoading(false);
      if (!("error" in r)) {
        setOrgs(r.orgs);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setTreeState("loading");
      const r = await getRepoTreeAction(repoRef, sourceBranch);
      if (cancelled) return;
      if ("error" in r) {
        setTreeState("error");
        setTree([]);
        return;
      }
      setTree(r.tree);
      setTreeState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [repoRef, sourceBranch]);

  const treeNodes = useMemo(() => buildTreeStructure(tree), [tree]);

  const filteredNodes = useMemo(() => {
    if (!search.trim()) return treeNodes;
    const lowerSearch = search.toLowerCase();
    const filter = (node: TreeNode): TreeNode | null => {
      const matches = node.path.toLowerCase().includes(lowerSearch);
      const filteredChildren = node.children
        ?.map(filter)
        .filter((n): n is TreeNode => n !== null);
      if (matches || (filteredChildren && filteredChildren.length > 0)) {
        return {
          ...node,
          children: filteredChildren,
        };
      }
      return null;
    };
    return treeNodes
      .map(filter)
      .filter((n): n is TreeNode => n !== null);
  }, [treeNodes, search]);

  const allBlobs = useMemo(() => {
    const collect = (node: TreeNode): string[] => {
      if (node.type === "blob") return [node.path];
      return node.children?.flatMap(collect) ?? [];
    };
    return treeNodes.flatMap(collect);
  }, [treeNodes]);

  const getCheckboxState = (node: TreeNode): "checked" | "indeterminate" | "unchecked" => {
    if (node.type === "blob") {
      return selection.has(node.path) ? "checked" : "unchecked";
    }
    const blobs = collectBlobPaths(node);
    if (blobs.length === 0) return "unchecked";
    const selected = blobs.filter((p) => selection.has(p)).length;
    if (selected === 0) return "unchecked";
    if (selected === blobs.length) return "checked";
    return "indeterminate";
  };

  const handleCheckboxChange = (node: TreeNode, checked: boolean) => {
    setSelection((prev) => {
      const next = new Set(prev);
      const blobs = collectBlobPaths(node);
      if (checked) {
        blobs.forEach((p) => next.add(p));
      } else {
        blobs.forEach((p) => next.delete(p));
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const collect = (node: TreeNode): string[] => {
      if (node.type === "blob") return [node.path];
      return node.children?.flatMap(collect) ?? [];
    };
    const filteredBlobs = filteredNodes.flatMap(collect);
    setSelection(new Set(filteredBlobs));
  };

  const handleSelectNone = () => {
    setSelection(new Set());
  };

  const renderTreeNode = (node: TreeNode, depth: number = 0): (React.ReactElement | React.ReactNode)[] => {
    const checkState = getCheckboxState(node);
    const indent = depth * 14 + 8;
    const isExpanded = expanded.has(node.path);

    const renderRow = (
      <div key={node.path} className={styles.copyTreeRow} style={{ paddingLeft: `${indent}px` }}>
        <Checkbox
          size="small"
          checked={checkState === "checked"}
          indeterminate={checkState === "indeterminate"}
          onChange={(e) => handleCheckboxChange(node, e.target.checked)}
          slotProps={{ input: { "aria-label": node.path } }}
          sx={{ padding: "2px" }}
        />
        {node.type === "tree" && (
          <Button
            variant="text"
            size="small"
            aria-expanded={isExpanded}
            onClick={() =>
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(node.path)) next.delete(node.path);
                else next.add(node.path);
                return next;
              })
            }
            sx={{
              minWidth: "auto",
              padding: "0 4px",
              fontSize: "0.8rem",
              color: "var(--text-secondary)",
            }}
          >
            {isExpanded ? "▼" : "▶"}
          </Button>
        )}
        {node.type === "tree" ? (
          <span
            className={styles.copyTreeName}
            style={{
              fontWeight: 600,
              color: "var(--text-secondary)",
              flex: 1,
              fontSize: "0.82rem",
            }}
          >
            {node.name}/
          </span>
        ) : (
          <span
            className={styles.copyTreeName}
            style={{
              flex: 1,
              fontSize: "0.82rem",
              fontFamily: "var(--font-mono)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={node.path}
          >
            {node.name}
          </span>
        )}
        {node.type === "blob" && node.size !== undefined && (
          <span className={styles.copyTreeSize} style={{
            fontSize: "0.75rem",
            color: "var(--text-secondary)",
            flex: "none",
            marginLeft: 8,
            minWidth: 60,
            textAlign: "right",
          }}>
            {formatFileSize(node.size)}
          </span>
        )}
      </div>
    );

    const rows: (React.ReactElement | React.ReactNode)[] = [renderRow];
    if (node.type === "tree" && isExpanded && node.children) {
      for (const child of node.children) {
        rows.push(...renderTreeNode(child, depth + 1));
      }
    }
    return rows;
  };

  const handleCopy = async () => {
    if (!destName.trim()) return;
    if (selection.size === 0) return;

    const opts: CopyRepoOptions = {
      sourceBranch: sourceBranch || defaultBranch,
      destOrg: destOwner.trim() || undefined,
      destName: destName.trim(),
      description: destDescription.trim() || undefined,
      visibility,
      markTemplate,
      paths: [...selection],
      includeWorkflows,
      copyTopics,
      copyLabels,
      commitMessage:
        commitMessage.trim() || `Copy of ${repoRef}@${sourceBranch || defaultBranch}`,
    };

    setCopyBusy(true);
    setCopyResult(null);
    setCopyError(null);
    const r = await copyRepoAction(repoRef, opts);
    setCopyBusy(false);
    if ("error" in r) {
      setCopyError(r.error);
      return;
    }
    setCopyResult(r.result);
  };

  const filteredBlobCount = useMemo(() => {
    const collect = (node: TreeNode): string[] => {
      if (node.type === "blob") return [node.path];
      return node.children?.flatMap(collect) ?? [];
    };
    return filteredNodes.flatMap(collect).length;
  }, [filteredNodes]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 12 }}>
      <div className={styles.ghPanel + " " + styles.ghPanelStack}>
        <label className={styles.panelTitle} style={{ display: "block" }}>
          Destination
        </label>
        <Typeahead
          options={[
            { value: "", label: "Personal account" },
            ...orgs.map((org) => ({ value: org, label: org })),
          ]}
          value={destOwner}
          onChange={setDestOwner}
          placeholder="Choose destination owner..."
          loading={orgsLoading}
        />
        <TextField
          size="small"
          fullWidth
          label="Repository name"
          value={destName}
          onChange={(e) => setDestName(e.target.value)}
          onKeyDown={submitOnEnter(handleCopy)}
        />
        <TextField
          size="small"
          fullWidth
          label="Description"
          value={destDescription}
          onChange={(e) => {
            descEditedForRepoRef.current = repoRef;
            setDestDescription(e.target.value);
          }}
        />
        <div className={styles.scheduleModeToggle}>
          {(["private", "public"] as const).map((vis) => (
            <button
              key={vis}
              className={`${styles.scheduleModeBtn} ${
                visibility === vis ? styles.active : ""
              }`}
              onClick={() => setVisibility(vis)}
            >
              {vis === "private" ? "Private" : "Public"}
            </button>
          ))}
        </div>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={markTemplate}
              onChange={(e) => setMarkTemplate(e.target.checked)}
            />
          }
          label="Mark as template"
        />
        <Typeahead
          options={branches.map((b) => ({ value: b, label: b }))}
          value={sourceBranch}
          onChange={setSourceBranch}
          placeholder="Source branch"
        />
      </div>

      <div className={styles.ghPanel + " " + styles.ghPanelStack}>
        <label className={styles.panelTitle} style={{ display: "block" }}>
          Contents
        </label>
        <TextField
          size="small"
          fullWidth
          placeholder="Search files..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={treeState === "loading"}
        />

        {treeState === "ready" && filteredBlobCount > 0 && (
          <div className={styles.copyTreeToolbar} style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexWrap: "wrap",
            fontSize: "0.85rem",
          }}>
            <Button
              variant="outlined"
              size="small"
              onClick={handleSelectAll}
            >
              Select all
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={handleSelectNone}
            >
              Select none
            </Button>
            <span style={{ marginLeft: "auto", color: "var(--text-secondary)" }}>
              {selection.size} of {allBlobs.length} files selected
            </span>
          </div>
        )}

        <div
          className={styles.copyTreeWrap}
          style={{
            maxHeight: "46vh",
            overflowY: "auto",
            border: "1px solid var(--field-border)",
            borderRadius: 12,
            backgroundColor: "var(--field-background)",
            padding: "8px 0",
          }}
        >
          {treeState === "loading" && (
            <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
              <CircularProgress size={24} />
            </div>
          )}
          {treeState === "error" && (
            <p style={{ padding: 16, color: "var(--danger)", fontSize: "0.85rem" }}>
              Failed to load files.
              <Button
                variant="text"
                size="small"
                onClick={() => {
                  setTreeState("loading");
                  getRepoTreeAction(repoRef, sourceBranch).then((r) => {
                    if ("error" in r) {
                      setTreeState("error");
                    } else {
                      setTree(r.tree);
                      setTreeState("ready");
                    }
                  });
                }}
              >
                Retry
              </Button>
            </p>
          )}
          {treeState === "ready" && filteredBlobCount === 0 && (
            <p style={{ padding: 16, color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              {search.trim()
                ? "No matching files."
                : "This repository has no files on this branch."}
            </p>
          )}
          {treeState === "ready" &&
            filteredBlobCount > 0 &&
            filteredNodes.flatMap((node) => renderTreeNode(node))}
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={includeWorkflows}
                onChange={(e) => setIncludeWorkflows(e.target.checked)}
              />
            }
            label={
              <div>
                <div>Include GitHub Actions workflows</div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  Token needs workflow scope
                </div>
              </div>
            }
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={copyTopics}
                onChange={(e) => setCopyTopics(e.target.checked)}
              />
            }
            label="Copy topics"
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={copyLabels}
                onChange={(e) => setCopyLabels(e.target.checked)}
              />
            }
            label="Copy issue labels"
          />
        </div>

        <TextField
          size="small"
          fullWidth
          label="Commit message"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder={`Copy of ${repoRef}@${sourceBranch || defaultBranch}`}
          onKeyDown={submitOnEnter(handleCopy)}
        />
      </div>

      <div className={styles.ghPanel + " " + styles.ghPanelStack}>
        <label className={styles.panelTitle} style={{ display: "block" }}>
          Review and copy
        </label>

        <div
          className={styles.copySummary}
          style={{
            fontSize: "0.85rem",
            color: "var(--text-secondary)",
            padding: "12px 0",
          }}
        >
          <div>
            <strong style={{ color: "var(--text-primary)" }}>
              {destOwner ? `${destOwner}/` : ""}
              {destName || "(name required)"}
            </strong>{" "}
            · {visibility}
          </div>
          <div style={{ marginTop: 4 }}>
            {selection.size} file{selection.size !== 1 ? "s" : ""} · Workflows:{" "}
            {includeWorkflows ? "yes" : "no"} · Topics: {copyTopics ? "yes" : "no"} ·
            Labels: {copyLabels ? "yes" : "no"}
          </div>
        </div>

        <Button
          variant="contained"
          size="small"
          disabled={copyBusy || !destName.trim() || selection.size === 0}
          onClick={handleCopy}
        >
          {copyBusy ? "Copying..." : "Copy repository"}
        </Button>

        {copyError && (
          <p style={{ color: "var(--danger)", fontSize: "0.85rem", margin: 0 }}>
            Error: {copyError}
          </p>
        )}

        {copyResult && (
          <div style={{ fontSize: "0.85rem" }}>
            <p
              style={{
                color: "var(--success)",
                margin: "0 0 6px",
              }}
            >
              Copied{" "}
              <a
                href={copyResult.repo.htmlUrl}
                target="_blank"
                rel="noreferrer"
                style={{ color: "var(--accent-ink)" }}
              >
                {copyResult.repo.fullName}
              </a>
              · {copyResult.copiedFiles} file{copyResult.copiedFiles !== 1 ? "s" : ""}
              copied
            </p>
            {copyResult.warnings.length > 0 && (
              <ul style={{ margin: "6px 0 0", color: "var(--text-secondary)" }}>
                {copyResult.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
