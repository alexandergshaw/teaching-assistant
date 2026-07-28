// Pure formatting helpers for AutomationRunsSection's "Recent runs" table.
// Extracted out of the JSX (rather than formatted inline) so the display
// rules - what a missing timestamp looks like, when duration reads in ms vs
// seconds, how a run's status maps to the hub's existing badge classes - are
// unit-testable without rendering React. Mirrors the extraction already done
// for lastRunChip in automation-inventory-logic.ts.

import type { WorkflowRunStatus } from "@/lib/workflow-runs";
import styles from "../../page.module.css";

/** When a run happened, for the table's "When" column: prefers startedAt
 * (when the run began) and falls back to finishedAt for a row that somehow
 * has one but not the other; "(not recorded)" when neither is set. */
export function formatRunWhen(startedAt: string | null, finishedAt: string | null): string {
  const iso = startedAt ?? finishedAt;
  if (!iso) return "(not recorded)";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "(not recorded)";
  return date.toLocaleString();
}

/** Human-scale duration for a table cell: milliseconds under one second,
 * otherwise seconds to one decimal place. Distinct from
 * workflow-run-log-text.ts's formatDuration, which renders the full log's
 * plain "Nms" for precision rather than a compact table cell. */
export function formatRunDuration(ms: number | null): string {
  if (ms === null) return "(unknown)";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** "N steps" for the table's "Steps" column, with the error count appended
 * only when it is nonzero - a clean run should not read "0 errors". */
export function formatRunSteps(stepCount: number | null, errorCount: number | null): string {
  if (stepCount === null) return "(unknown)";
  const base = `${stepCount} step${stepCount === 1 ? "" : "s"}`;
  if (errorCount !== null && errorCount > 0) {
    return `${base} (${errorCount} error${errorCount === 1 ? "" : "s"})`;
  }
  return base;
}

export interface RunStatusBadge {
  class: string;
  text: string;
}

/** Map a run's status to the hub's existing ghBadge classes (same palette as
 * lastRunChip in automation-inventory-logic.ts, applied here to an
 * individual run row rather than a schedule/trigger's last-run summary). */
export function runStatusBadge(status: WorkflowRunStatus): RunStatusBadge {
  if (status === "ok") return { class: styles.ghBadgeSuccess, text: "OK" };
  if (status === "error") return { class: styles.ghBadgeDanger, text: "Error" };
  if (status === "skipped") return { class: styles.ghBadgeNeutral, text: "Skipped" };
  return { class: styles.ghBadgeAccent, text: "Running" };
}

/** The .txt file name for a run's downloaded log: the workflow name (with
 * filesystem-unfriendly characters collapsed) plus a short, still-unique
 * prefix of the run id, so two runs of the same workflow never collide. */
export function buildRunLogDownloadName(workflowName: string, runId: string): string {
  const safeName = workflowName.trim().replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "workflow";
  const shortId = runId.replace(/-/g, "").slice(0, 8) || "run";
  return `${safeName} - run ${shortId}.txt`;
}
