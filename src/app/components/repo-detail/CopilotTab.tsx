"use client";

import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import { formatRelative } from "../../utils/time";
import type { useCopilotTab } from "./useCopilotTab";
import styles from "../../page.module.css";

type CopilotTabState = ReturnType<typeof useCopilotTab>;

export function CopilotTab({
  repoRef,
  copilot,
  openPrInPullsTab,
}: {
  repoRef: string;
  copilot: CopilotTabState;
  openPrInPullsTab: (n: number) => void;
}) {
  const {
    copilotTaskTitle,
    setCopilotTaskTitle,
    copilotTaskBody,
    setCopilotTaskBody,
    copilotBusy,
    copilotTaskMsg,
    copilotTasks,
    copilotTasksState,
    copilotLastLoaded,
    reloadCopilotTasks,
    handleCreateCopilotTask,
  } = copilot;

  return (
    <div style={{ display: "flex", gap: 16, marginTop: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div className={styles.ghPanel} style={{ flex: "1 1 320px", minWidth: 280 }}>
        <label className={styles.panelTitle} style={{ display: "block", marginBottom: 8 }}>
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
                <a href={copilotTaskMsg.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent-ink)" }}>
                  view the issue
                </a>
              </>
            )}
          </p>
        )}
      </div>

      <div className={styles.ghPanel} style={{ flex: "1 1 320px", minWidth: 280 }}>
        <div className={styles.ghPanelHead}>
          <label className={styles.panelTitle}>Copilot tasks</label>
          <div className={styles.ghPanelHeadRight}>
            {copilotLastLoaded && (
              <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>updated {formatRelative(copilotLastLoaded)}</span>
            )}
            <Button variant="text" size="small" onClick={reloadCopilotTasks} disabled={copilotTasksState === "loading"}>
              Refresh
            </Button>
          </div>
        </div>
        {copilotTasksState === "loading" && copilotTasks.length === 0 && (
          <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
            <CircularProgress size={24} />
          </div>
        )}
        {copilotTasksState === "error" && <p className={styles.error}>Could not load Copilot tasks.</p>}
        {copilotTasksState === "idle" && copilotTasks.length === 0 && (
          <p className={styles.fieldHint}>No Copilot tasks yet.</p>
        )}
        {copilotTasks.map((t) => {
          const pr = t.pr;
          const prBadge = pr
            ? pr.state === "MERGED"
              ? { label: "Merged", cls: styles.ghBadgeMerged }
              : pr.isDraft
                ? { label: "Draft", cls: styles.ghBadgeNeutral }
                : pr.state === "OPEN"
                  ? { label: "Open", cls: styles.ghBadgeSuccess }
                  : { label: "Closed", cls: styles.ghBadgeDanger }
            : null;
          const checks = pr?.checks;
          const checkBadge = checks
            ? checks === "SUCCESS"
              ? { label: "checks passing", cls: styles.ghBadgeSuccess }
              : checks === "FAILURE" || checks === "ERROR"
                ? { label: "checks failing", cls: styles.ghBadgeDanger }
                : { label: "checks running", cls: styles.ghBadgeWarning }
            : null;
          const review = pr?.reviewDecision;
          const reviewBadge =
            review === "APPROVED"
              ? { label: "approved", cls: styles.ghBadgeSuccess }
              : review === "CHANGES_REQUESTED"
                ? { label: "changes requested", cls: styles.ghBadgeWarning }
                : review === "REVIEW_REQUIRED"
                  ? { label: "review required", cls: styles.ghBadgeNeutral }
                  : null;
          return (
            <div key={t.number} className={styles.ghRow}>
              <div className={styles.ghRowTop}>
                <div className={styles.ghRowTitle}>
                  <a href={t.htmlUrl} target="_blank" rel="noreferrer" className={styles.ghRowNum}>
                    #{t.number}
                  </a>
                  <span style={{ marginLeft: 8 }} className={styles.ghRowName}>{t.title}</span>
                </div>
                <span className={`${styles.ghBadge} ${t.state === "OPEN" ? styles.ghBadgeSuccess : styles.ghBadgeNeutral}`}>
                  {t.state.toLowerCase()}
                </span>
              </div>
              <div className={styles.ghMeta}>
                opened {formatRelative(t.createdAt)}
                {t.updatedAt ? ` · updated ${formatRelative(t.updatedAt)}` : ""}
              </div>
              {t.labels.length > 0 && (
                <div className={styles.ghBadges}>
                  {t.labels.map((l) => (
                    <span key={l} className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>{l}</span>
                  ))}
                </div>
              )}
              {pr ? (
                <div className={styles.ghBadges}>
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => openPrInPullsTab(pr.number)}
                    title="Review this pull request in the Pull requests tab"
                  >
                    PR #{pr.number}
                  </button>
                  {prBadge && <span className={`${styles.ghBadge} ${prBadge.cls}`}>{prBadge.label}</span>}
                  {checkBadge && <span className={`${styles.ghBadge} ${checkBadge.cls}`}>{checkBadge.label}</span>}
                  {reviewBadge && <span className={`${styles.ghBadge} ${reviewBadge.cls}`}>{reviewBadge.label}</span>}
                  <span className={styles.ghMeta}>
                    <span style={{ color: "var(--success)" }}>+{pr.additions}</span>{" "}
                    <span style={{ color: "var(--danger)" }}>-{pr.deletions}</span> · {pr.changedFiles} file{pr.changedFiles === 1 ? "" : "s"}
                  </span>
                  <a href={pr.url} target="_blank" rel="noreferrer" className={styles.ghMeta}>
                    GitHub
                  </a>
                </div>
              ) : (
                <div className={styles.ghMeta}>
                  {t.state === "OPEN" ? "No pull request yet — the agent may still be working." : "No pull request."}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
