"use client";

import { Button, TextField } from "@mui/material";
import styles from "../../../page.module.css";
import type { CopilotRow } from "../hooks/useCopilotAgents";
import type { CopilotTask } from "@/lib/github";

interface CopilotAgentsSectionProps {
  selectedReposSize: number;
  copilotTitle: string;
  onCopilotTitleChange: (title: string) => void;
  copilotBody: string;
  onCopilotBodyChange: (body: string) => void;
  copilotRunning: boolean;
  onStartCopilot: () => void;
  onCancelCopilot: () => void;
  copilotRows: CopilotRow[];
  agentStatus: Record<string, CopilotTask[]>;
  checkedAt: number | null;
  agentChecking: boolean;
  lastRunManual: boolean;
  onCheckAgentStatus: () => void;
  onCancelAgentCheck: () => void;
}

export function CopilotAgentsSection({
  selectedReposSize,
  copilotTitle,
  onCopilotTitleChange,
  copilotBody,
  onCopilotBodyChange,
  copilotRunning,
  onStartCopilot,
  onCancelCopilot,
  copilotRows,
  agentStatus,
  checkedAt,
  agentChecking,
  lastRunManual,
  onCheckAgentStatus,
  onCancelAgentCheck,
}: CopilotAgentsSectionProps) {
  return (
    <div>
      <h3 style={{ margin: "0 0 12px" }}>Start Copilot agents</h3>

      <TextField
        size="small"
        fullWidth
        label="Task title"
        value={copilotTitle}
        onChange={(e) => onCopilotTitleChange(e.target.value)}
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
        onChange={(e) => onCopilotBodyChange(e.target.value)}
        disabled={copilotRunning}
        sx={{ mb: 1.5 }}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <Button
          type="button"
          variant="contained"
          size="small"
          disabled={copilotRunning || selectedReposSize === 0 || !copilotTitle.trim()}
          onClick={onStartCopilot}
        >
          Start in {selectedReposSize} repo{selectedReposSize !== 1 ? "s" : ""}
        </Button>
        {copilotRunning && (
          <Button type="button" variant="outlined" size="small" color="error" onClick={onCancelCopilot}>
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

      <div style={{ marginTop: 20, paddingTop: 12, borderTop: "1px solid var(--field-border)" }}>
        <h4 style={{ margin: "0 0 12px" }}>Running agents</h4>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <Button
            type="button"
            variant="outlined"
            size="small"
            disabled={agentChecking || (selectedReposSize === 0 && copilotRows.length === 0)}
            onClick={onCheckAgentStatus}
          >
            {Object.keys(agentStatus).length > 0 ? "Refresh now" : "Check agent status"}
          </Button>
          {agentChecking && (
            <Button type="button" variant="outlined" size="small" color="error" onClick={onCancelAgentCheck}>
              Cancel
            </Button>
          )}
        </div>

        {checkedAt !== null && (
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 8 }}>
            Checked at {new Date(checkedAt).toLocaleString()}{!lastRunManual && " (auto)"}
          </p>
        )}

        {Object.entries(agentStatus).length > 0 ? (
          <AgentStatusList agentStatus={agentStatus} />
        ) : checkedAt !== null ? (
          <p className={styles.fieldHint}>No agent tasks found.</p>
        ) : null}
      </div>
    </div>
  );
}

interface AgentStatusListProps {
  agentStatus: Record<string, CopilotTask[]>;
}

function AgentStatusList({ agentStatus }: AgentStatusListProps) {
  return (
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
                const taskState =
                  task.state === "OPEN" && (!task.pr || task.pr.isDraft)
                    ? "Working"
                    : task.state === "OPEN" && task.pr && !task.pr.isDraft && task.pr.state === "OPEN"
                      ? "Ready for review"
                      : task.pr?.state === "MERGED"
                        ? "Merged"
                        : task.state === "CLOSED"
                          ? "Closed"
                          : "Unknown";

                const stateBadgeClass =
                  task.pr?.state === "MERGED" ? styles.ghBadgeMerged : styles.ghBadgeNeutral;

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
                      <span className={`${styles.ghBadge} ${stateBadgeClass}`}>{taskState}</span>
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
  );
}
