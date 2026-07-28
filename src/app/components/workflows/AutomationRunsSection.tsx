"use client";

// "Recent runs" table for one schedule/trigger, rendered inside
// AutomationRow's Details disclosure (ScheduleRow/TriggerRow). Mounted only
// while that disclosure is open, so opening a row is what triggers the
// fetch - the hub never queries a run per row on page load. Each run's
// artifacts (recording_files rows) come pre-attached from
// listAutomationRunsAction, and its log is fetched on demand only when the
// "Log" action for that specific run is clicked.

import { useEffect, useState } from "react";
import {
  listAutomationRunsAction,
  getAutomationRunLogAction,
  getAutomationArtifactUrlAction,
  type AutomationRunSummary,
} from "@/app/actions";
import DocumentPreviewModal from "../DocumentPreviewModal";
import {
  formatRunWhen,
  formatRunDuration,
  formatRunSteps,
  runStatusBadge,
  buildRunLogDownloadName,
} from "./automation-runs-logic";
import styles from "../../page.module.css";

const RUNS_LIMIT_KEY = "ta-automation-runs-limit";
const RUNS_LIMIT_OPTIONS = [5, 10, 20] as const;
const DEFAULT_RUNS_LIMIT = 5;

function readStoredLimit(): number {
  if (typeof window === "undefined") return DEFAULT_RUNS_LIMIT;
  const saved = Number(localStorage.getItem(RUNS_LIMIT_KEY));
  return (RUNS_LIMIT_OPTIONS as readonly number[]).includes(saved) ? saved : DEFAULT_RUNS_LIMIT;
}

export interface AutomationRunsSectionProps {
  /** The schedule/trigger id that caused the listed runs (WorkflowRunRecord.triggerRef). */
  triggerRef: string;
  /** The owning workflow's display name, used to label and name the downloaded log. */
  workflowName: string;
}

export function AutomationRunsSection({ triggerRef, workflowName }: AutomationRunsSectionProps) {
  const [limit, setLimit] = useState<number>(readStoredLimit);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [runs, setRuns] = useState<AutomationRunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [artifactBusyId, setArtifactBusyId] = useState<string | null>(null);
  const [artifactError, setArtifactError] = useState<string | null>(null);

  const [logRunId, setLogRunId] = useState<string | null>(null);
  const [logBusy, setLogBusy] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [logText, setLogText] = useState<string | null>(null);

  // Await-first so no synchronous setState in the effect body itself (see
  // CoursePicker's fetch effect for the same idiom) - the "loading" state
  // for a limit change is set by handleLimitChange below, in the click
  // handler that causes it, not here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await listAutomationRunsAction(triggerRef, limit);
      if (cancelled) return;
      if ("error" in result) {
        setError(result.error);
        setStatus("error");
        return;
      }
      setRuns(result.runs);
      setError(null);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [triggerRef, limit]);

  const handleLimitChange = (value: number) => {
    setStatus("loading");
    setLimit(value);
    try {
      localStorage.setItem(RUNS_LIMIT_KEY, String(value));
    } catch {
      // ignore storage write failures
    }
  };

  const handleDownloadArtifact = async (fileId: string) => {
    setArtifactBusyId(fileId);
    setArtifactError(null);
    const result = await getAutomationArtifactUrlAction(fileId);
    setArtifactBusyId(null);
    if ("error" in result) {
      setArtifactError(result.error);
      return;
    }
    window.open(result.url, "_blank", "noopener,noreferrer");
  };

  const handleOpenLog = async (runId: string) => {
    setLogRunId(runId);
    setLogBusy(true);
    setLogError(null);
    setLogText(null);
    const result = await getAutomationRunLogAction(runId);
    setLogBusy(false);
    if ("error" in result) {
      setLogError(result.error);
      return;
    }
    setLogText(result.text);
  };

  const closeLog = () => {
    setLogRunId(null);
    setLogBusy(false);
    setLogError(null);
    setLogText(null);
  };

  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      <div className={styles.automationRunsHeader}>
        <span style={{ fontWeight: 600, fontSize: "0.78rem", color: "var(--text-secondary)" }}>Recent runs</span>
        <label
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.75rem", color: "var(--text-secondary)" }}
        >
          Show
          <select
            className={styles.automationRunsLimitSelect}
            value={limit}
            onChange={(e) => handleLimitChange(Number(e.target.value))}
          >
            {RUNS_LIMIT_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {status === "loading" && (
        <p className={styles.fieldHint} style={{ margin: 0 }}>
          Loading recent runs...
        </p>
      )}

      {status === "error" && (
        <p className={styles.fieldHint} style={{ margin: 0, color: "var(--danger)" }}>
          Could not load recent runs: {error}
        </p>
      )}

      {status === "ready" && runs.length === 0 && (
        <p className={styles.fieldHint} style={{ margin: 0 }}>
          No runs recorded yet.
        </p>
      )}

      {status === "ready" && runs.length > 0 && (
        <div className={styles.automationRunsTable}>
          <div className={styles.automationRunsHead}>
            <span>When</span>
            <span>Status</span>
            <span>Duration</span>
            <span>Steps</span>
            <span>Artifacts</span>
            <span>Log</span>
          </div>
          {runs.map((run) => {
            const badge = runStatusBadge(run.status);
            return (
              <div className={styles.automationRunsRow} key={run.id}>
                <span>{formatRunWhen(run.startedAt, run.finishedAt)}</span>
                <span>
                  <span className={`${styles.ghBadge} ${badge.class}`}>{badge.text}</span>
                </span>
                <span>{formatRunDuration(run.durationMs)}</span>
                <span>{formatRunSteps(run.stepCount, run.errorCount)}</span>
                <span className={styles.automationRunsArtifactList}>
                  {run.artifacts.length === 0 ? (
                    <span style={{ color: "var(--text-secondary)" }}>No artifacts</span>
                  ) : (
                    run.artifacts.map((artifact) => (
                      <button
                        key={artifact.id}
                        type="button"
                        className={styles.linkButton}
                        disabled={artifactBusyId === artifact.id}
                        onClick={() => void handleDownloadArtifact(artifact.id)}
                        style={{ textAlign: "left" }}
                      >
                        {artifactBusyId === artifact.id ? "Preparing..." : artifact.name}
                      </button>
                    ))
                  )}
                </span>
                <span>
                  <button type="button" className={styles.linkButton} onClick={() => void handleOpenLog(run.id)}>
                    Log
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {artifactError && (
        <p className={styles.fieldHint} style={{ margin: 0, color: "var(--danger)" }}>
          {artifactError}
        </p>
      )}

      {logRunId && logBusy && (
        <p className={styles.fieldHint} style={{ margin: 0 }}>
          Loading log...
        </p>
      )}

      {logRunId && !logBusy && logError && (
        <p className={styles.fieldHint} style={{ margin: 0, color: "var(--danger)" }}>
          Could not load the log: {logError}{" "}
          <button type="button" className={styles.linkButton} onClick={closeLog}>
            Dismiss
          </button>
        </p>
      )}

      {logRunId && !logBusy && !logError && logText !== null && (
        <DocumentPreviewModal
          name={`Run log - ${workflowName}`}
          meta="Workflow run log"
          text={logText}
          downloadFileName={buildRunLogDownloadName(workflowName, logRunId)}
          onClose={closeLog}
        />
      )}
    </div>
  );
}
