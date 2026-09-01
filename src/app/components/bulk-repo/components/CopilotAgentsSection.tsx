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
      <h3 style={{ margin: "0 0 var(--space-3)" }}>Start Copilot agents</h3>

      <TextField
        size="small"
        fullWidth
        label="Task title"
        value={copilotTitle}
        onChange={(e) => onCopilotTitleChange(e.target.value)}
        disabled={copilotRunning}
        sx={{ mb: "var(--space-3)" }}
      />

      <TextField
        size="small"
        fullWidth
        multiline
        minRows={4}
        label="Instructions"
        placeholder="Enter the instructions for Copilot…"
        value={copilotBody}
        onChange={(e) => onCopilotBodyChange(e.target.value)}
        disabled={copilotRunning}
        sx={{ mb: "var(--space-3)" }}
      />

      <div style={{ display: "flex", gap: "var(--space-2)" }}>
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
        <div style={{ marginTop: "var(--space-3)" }}>
          {copilotRunning && (
            <p style={{ fontSize: "var(--font-size-md)", color: "var(--text-secondary)", marginBottom: "var(--space-2)" }}>
              Starting {copilotRows.filter((r) => r.status !== "pending").length} of {copilotRows.length}…
            </p>
          )}
          <div
            style={{
              maxHeight: 240,
              overflowY: "auto",
              border: "1px solid var(--field-border)",
              borderRadius: "var(--radius-xs)",
              padding: "var(--space-2)",
            }}
          >
            {copilotRows.map((row) => (
              <div
                key={row.repo}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  fontSize: "var(--font-size-md)",
                  marginBottom: "var(--space-1)",
                  paddingBottom: "var(--space-1)",
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
                  <a href={row.detail} target="_blank" rel="noreferrer" style={{ color: "var(--accent-ink)", fontSize: "var(--font-size-xs)" }}>
                    View
                  </a>
                )}
                {row.detail && row.status === "failed" && (
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--text-secondary)" }} title={row.detail}>
                    {row.detail.split("\n")[0].slice(0, 40)}…
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className={styles.fieldHint} style={{ marginTop: "var(--space-2)" }}>
        Each repo gets a Copilot coding-agent task with these instructions.
      </p>

      <div style={{ marginTop: "var(--space-5)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--field-border)" }}>
        <h4 style={{ margin: "0 0 var(--space-3)" }}>Running agents</h4>

        <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-3)" }}>
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
          <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-2)" }}>
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
        borderRadius: "var(--radius-xs)",
        padding: "var(--space-2)",
      }}
    >
      {Object.entries(agentStatus).map(([repo, tasks]) => (
        <div key={repo}>
          <div style={{ fontSize: "var(--font-size-md)", fontWeight: 500, marginBottom: "var(--space-2)", color: "var(--text-primary)" }}>
            <span style={{ fontFamily: "monospace" }}>{repo}</span>
          </div>

          {tasks.length === 0 ? (
            <p style={{ fontSize: "var(--font-size-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-3)" }}>
              No agent tasks found.
            </p>
          ) : (
            <div style={{ marginBottom: "var(--space-3)", marginLeft: "var(--space-3)" }}>
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
                      gap: "var(--space-1)",
                      fontSize: "var(--font-size-sm)",
                      marginBottom: "var(--space-2)",
                      paddingBottom: "var(--space-2)",
                      borderBottom: "1px solid var(--field-border)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
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
                      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", marginLeft: "var(--space-2)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
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
                            fontSize: "var(--font-size-xs)",
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
