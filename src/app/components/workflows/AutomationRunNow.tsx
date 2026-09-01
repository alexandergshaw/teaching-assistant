"use client";

// The Automations hub's manual "Run now" control (AutomationRow's Actions
// column, both ScheduleRow and TriggerRow): kicks off ONE schedule/trigger's
// own stored configuration through src/app/api/automations/run-now/route.ts
// and shows the outcome inline on the row - see that route for the run-time
// decisions (AC2-AC4) this component only needs to render.

import { useRef, useState } from "react";
import type { WorkflowDef } from "@/lib/workflows/types";
import { manualRunEligibility, type ManualRunKind } from "@/lib/automation-manual-run";
import styles from "../../page.module.css";

export interface AutomationRunNowProps {
  kind: ManualRunKind;
  id: string;
  workflowId: string;
  workflows: WorkflowDef[];
  isWorkflowHeadlessSafeById: (workflowId: string) => boolean;
  /** Called once the run reaches a terminal state (ok, error, skipped, or a
   * request-level failure) so the caller can refresh the row's Recent runs
   * table when it is open (AC5). Not called on a blocked double-click. */
  onRunFinished?: () => void;
}

type RunNowState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "result"; status: "ok" | "error" | "skipped"; message: string }
  | { kind: "failed"; message: string };

/** Same badge vocabulary as lastRunChip (automation-inventory-logic.ts) -
 * text-first, never colour-only, so a manual run's own outcome reads the
 * same way the row's stored Status column does. */
function resultBadge(status: "ok" | "error" | "skipped"): { class: string; text: string } {
  if (status === "ok") return { class: styles.ghBadgeSuccess, text: "Ran OK" };
  if (status === "skipped") return { class: styles.ghBadgeNeutral, text: "Run skipped" };
  return { class: styles.ghBadgeDanger, text: "Run failed" };
}

export function AutomationRunNow({ kind, id, workflowId, workflows, isWorkflowHeadlessSafeById, onRunFinished }: AutomationRunNowProps) {
  const [state, setState] = useState<RunNowState>({ kind: "idle" });
  // A ref guard closes the double-click race React state alone cannot: two
  // rapid clicks can both read the pre-update "idle" state before the first
  // click's setState has re-rendered the button as disabled (AC6).
  const runningRef = useRef(false);

  const eligibility = manualRunEligibility({
    workflowExists: workflows.some((w) => w.id === workflowId),
    isHeadlessSafe: isWorkflowHeadlessSafeById(workflowId),
  });

  const handleClick = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/automations/run-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      const data: unknown = await res.json().catch(() => null);
      const record = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
      if (!res.ok || !record || typeof record.error === "string") {
        setState({
          kind: "failed",
          message: record && typeof record.error === "string" ? record.error : "Could not run the automation.",
        });
      } else {
        const status = record.status === "ok" || record.status === "error" || record.status === "skipped" ? record.status : "error";
        setState({ kind: "result", status, message: typeof record.message === "string" ? record.message : "" });
      }
    } catch (err) {
      setState({ kind: "failed", message: err instanceof Error ? err.message : "Could not run the automation." });
    } finally {
      runningRef.current = false;
      onRunFinished?.();
    }
  };

  const busy = state.kind === "busy";
  const disabled = !eligibility.eligible || busy;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", alignItems: "flex-start" }}>
      <button
        type="button"
        className={styles.linkButton}
        disabled={disabled}
        title={eligibility.eligible ? undefined : (eligibility.reason ?? undefined)}
        style={disabled && !busy ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
        onClick={() => void handleClick()}
      >
        {busy ? "Running…" : "Run now"}
      </button>

      {state.kind === "result" && (
        <>
          <span className={`${styles.ghBadge} ${resultBadge(state.status).class}`}>{resultBadge(state.status).text}</span>
          {state.status !== "ok" && state.message && (
            <span className={styles.fieldHint} style={{ margin: 0, maxWidth: 240, whiteSpace: "normal" }}>
              {state.message}
            </span>
          )}
        </>
      )}

      {state.kind === "failed" && (
        <>
          <span className={`${styles.ghBadge} ${styles.ghBadgeDanger}`}>Could not run</span>
          <span className={styles.fieldHint} style={{ margin: 0, maxWidth: 240, whiteSpace: "normal" }}>
            {state.message}
          </span>
        </>
      )}
    </div>
  );
}
