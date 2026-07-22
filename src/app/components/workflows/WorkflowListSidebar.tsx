"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, TextField } from "@mui/material";
import type { WorkflowDef } from "@/lib/workflows/types";
import { groupWorkflows } from "./workflow-grouping";
import styles from "../../page.module.css";

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

  const groups = useMemo(
    () => groupWorkflows(workflows, recentWorkflowIds, workflowSearch),
    [workflows, recentWorkflowIds, workflowSearch]
  );

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

      {groups.map((group) => (
        <div key={group.title}>
          {group.title && (
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
                  disabled={runningWorkflow}
                  onClick={() => onSelectWorkflow(w.id)}
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
                    onClick={() => onRunClick(w.id)}
                    className={styles.ghBadge}
                    disabled={runningWorkflow}
                    style={{
                      padding: "4px 8px",
                      fontSize: "0.75em",
                      whiteSpace: "nowrap",
                      flex: "none",
                    }}
                    title={`Run ${w.name}`}
                    aria-label={`Run ${w.name}`}
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
        disabled={runningWorkflow}
        onClick={onNewWorkflow}
        style={{ marginTop: 8 }}
      >
        New workflow
      </Button>
    </div>
  );
}
