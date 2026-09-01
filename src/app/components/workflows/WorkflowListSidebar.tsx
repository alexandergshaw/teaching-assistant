"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, TextField } from "@mui/material";
import type { WorkflowDef } from "@/lib/workflows/types";
import {
  groupWorkflowsWithFolders,
  parseFolderState,
  serializeFolderState,
  assignFolder,
  moveFolder,
  renameFolder,
  removeFolder,
  folderNames,
  type FolderState,
} from "./workflow-grouping";
import FolderPicker from "./FolderPicker";
import FolderActionsMenu from "./FolderActionsMenu";
import styles from "../../page.module.css";

const FOLDERS_KEY = "ta-workflow-folders";

interface AutomationInfo {
  scheduled: boolean;
  triggered: boolean;
}

interface WorkflowListSidebarProps {
  workflows: WorkflowDef[];
  selectedWorkflowId: string;
  onSelectWorkflow: (id: string) => void;
  onRunClick: (id: string) => void;
  workflowSearch: string;
  onSearchChange: (query: string) => void;
  recentWorkflowIds: string[];
  automationByWorkflow: Map<string, AutomationInfo>;
  runningWorkflow: boolean;
  onNewWorkflow: () => void;
}

export function WorkflowListSidebar({
  workflows,
  selectedWorkflowId,
  onSelectWorkflow,
  onRunClick,
  workflowSearch,
  onSearchChange,
  recentWorkflowIds,
  automationByWorkflow,
  runningWorkflow,
  onNewWorkflow,
}: WorkflowListSidebarProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    const saved = localStorage.getItem("ta-workflows-groups-collapsed");
    if (saved) {
      try {
        return new Set(JSON.parse(saved));
      } catch {
        return new Set();
      }
    }
    return new Set();
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        "ta-workflows-groups-collapsed",
        JSON.stringify(Array.from(collapsedGroups))
      );
    } catch {
      // ignore storage write failures
    }
  }, [collapsedGroups]);

  const [hoveredWorkflowId, setHoveredWorkflowId] = useState<string | null>(null);

  const toggleGroup = (title: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  };

  const [folders, setFolders] = useState<FolderState>(() =>
    typeof window === "undefined"
      ? { assignments: {}, order: [] }
      : parseFolderState(localStorage.getItem(FOLDERS_KEY))
  );

  const persistFolders = (next: FolderState) => {
    setFolders(next);
    try {
      localStorage.setItem(FOLDERS_KEY, serializeFolderState(next));
    } catch {
      // Ignore storage failures (private mode, quota).
    }
  };

  const groups = useMemo(
    () => groupWorkflowsWithFolders(workflows, recentWorkflowIds, workflowSearch, folders),
    [workflows, recentWorkflowIds, workflowSearch, folders]
  );

  const existingFolders = folderNames(folders);

  // The workflow whose folder picker is open, and the button it hangs off.
  const [folderPicker, setFolderPicker] = useState<{ id: string; anchor: HTMLElement } | null>(null);

  return (
    <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: 4 }}>Workflows</div>
      <TextField
        size="small"
        value={workflowSearch}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search workflows..."
        aria-label="Search workflows"
        sx={{ marginBottom: 1 }}
        data-testid="workflow-search"
      />

      {/* A8: the workflow list, folder tools, and "New workflow" all used to
          go `disabled` (dropping out of tab order with no stated reason)
          while a run was in progress. A single visible reason here - the
          same discipline LockableSection (WorkflowPanel.tsx) already
          applies to the editing affordances it locks - covers every control
          below, which instead go `aria-disabled` + a no-op click handler so
          they stay reachable by keyboard and screen reader. */}
      {runningWorkflow && (
        <p className={styles.fieldHint} role="status" style={{ margin: "0 0 4px", fontStyle: "italic" }}>
          Switching workflows is locked while one is running.
        </p>
      )}

      {groups.length === 0 && !workflowSearch && (
        <div style={{ fontSize: "0.85em", color: "var(--text-secondary)", padding: "4px 8px" }}>
          No workflows available.
        </div>
      )}

      {groups.length === 0 && workflowSearch && (
        <div style={{ fontSize: "0.85em", color: "var(--text-secondary)", padding: "4px 8px" }}>
          No workflows match your search.
        </div>
      )}

      <FolderPicker
        open={folderPicker !== null}
        anchorEl={folderPicker?.anchor ?? null}
        folders={existingFolders}
        current={folderPicker ? folders.assignments[folderPicker.id] ?? "" : ""}
        onPick={(folder) => {
          if (folderPicker) persistFolders(assignFolder(folders, folderPicker.id, folder));
          setFolderPicker(null);
        }}
        onClose={() => setFolderPicker(null)}
      />

      {groups.map((group) => (
        <div key={group.title}>
          {group.title && (
            <div style={{ display: "flex", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => toggleGroup(group.title)}
              style={{
                textAlign: "left",
                padding: "6px 8px",
                borderRadius: 0,
                border: "none",
                cursor: "pointer",
                background: "transparent",
                color: "var(--text-secondary)",
                fontWeight: 600,
                fontSize: "0.75rem",
                display: "flex",
                alignItems: "center",
                gap: 6,
                width: "100%",
                marginBottom: 2,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "6px",
                  height: "6px",
                  transform: collapsedGroups.has(group.title) ? "rotate(-90deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                }}
              >
                <svg
                  width="6"
                  height="6"
                  viewBox="0 0 6 6"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M1 2L3 4L5 2" stroke="currentColor" strokeWidth="0.75" />
                </svg>
              </span>
              {group.title}
            </button>
            {existingFolders.includes(group.title) && (
              <FolderActionsMenu
                folder={group.title}
                canMoveUp={existingFolders.indexOf(group.title) > 0}
                canMoveDown={existingFolders.indexOf(group.title) < existingFolders.length - 1}
                onRename={(next) => persistFolders(renameFolder(folders, group.title, next))}
                onMove={(direction) => persistFolders(moveFolder(folders, group.title, direction))}
                onRemove={() => persistFolders(removeFolder(folders, group.title))}
              />
            )}
            </div>
          )}


          {!collapsedGroups.has(group.title) &&
            group.workflows.map((w) => (
              <div
                key={w.id}
                onMouseEnter={() => setHoveredWorkflowId(w.id)}
                onMouseLeave={() =>
                  setHoveredWorkflowId((prev) => (prev === w.id ? null : prev))
                }
                style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}
              >
                <button
                  type="button"
                  aria-disabled={runningWorkflow}
                  title={runningWorkflow ? "Switching workflows is locked while one is running" : undefined}
                  onClick={() => {
                    if (runningWorkflow) return;
                    onSelectWorkflow(w.id);
                  }}
                  style={{
                    flex: 1,
                    textAlign: "left",
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: "none",
                    cursor: runningWorkflow ? "default" : "pointer",
                    background:
                      w.id === selectedWorkflowId ? "var(--field-background)" : "transparent",
                    color: "var(--text-primary)",
                    fontWeight: w.id === selectedWorkflowId ? 600 : 400,
                    fontSize: "0.9em",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {w.name}{w.preset ? " (preset)" : ""}
                  </span>
                  {(() => {
                    const a = automationByWorkflow.get(w.id);
                    if (!a || (!a.scheduled && !a.triggered)) return null;
                    return (
                      <span className={styles.ghBadges} style={{ flex: "none" }}>
                        {a.scheduled && (
                          <span
                            className={styles.ghDot}
                            style={{ color: "var(--accent)" }}
                            title="Scheduled"
                            aria-label="Scheduled"
                          />
                        )}
                        {a.triggered && (
                          <span
                            className={styles.ghDot}
                            style={{ color: "var(--success)" }}
                            title="Has triggers"
                            aria-label="Has triggers"
                          />
                        )}
                      </span>
                    );
                  })()}
                </button>

                {(w.id === selectedWorkflowId || w.id === hoveredWorkflowId) && (
                  <button
                    type="button"
                    onClick={(e) => setFolderPicker({ id: w.id, anchor: e.currentTarget })}
                    className={styles.ghBadge}
                    style={{ padding: "4px 8px", fontSize: "0.75em", whiteSpace: "nowrap", flex: "none" }}
                    title={`Put ${w.name} in a folder`}
                    aria-label={`Put ${w.name} in a folder`}
                  >
                    Folder
                  </button>
                )}

                {(w.id === selectedWorkflowId || w.id === hoveredWorkflowId) && (
                  <button
                    type="button"
                    onClick={() => {
                      if (runningWorkflow) return;
                      onRunClick(w.id);
                    }}
                    className={styles.ghBadge}
                    aria-disabled={runningWorkflow}
                    style={{
                      padding: "4px 8px",
                      fontSize: "0.75em",
                      whiteSpace: "nowrap",
                      flex: "none",
                      opacity: runningWorkflow ? 0.6 : 1,
                    }}
                    title={runningWorkflow ? "Another workflow is running" : `Run ${w.name}`}
                    aria-label={runningWorkflow ? `Run ${w.name} - another workflow is running` : `Run ${w.name}`}
                  >
                    Run
                  </button>
                )}
              </div>
            ))}
        </div>
      ))}

      <Button
        size="small"
        variant="outlined"
        aria-disabled={runningWorkflow}
        title={runningWorkflow ? "Locked while a workflow is running" : undefined}
        onClick={() => {
          if (runningWorkflow) return;
          onNewWorkflow();
        }}
        style={{ marginTop: 8, opacity: runningWorkflow ? 0.6 : 1 }}
      >
        New workflow
      </Button>
    </div>
  );
}
