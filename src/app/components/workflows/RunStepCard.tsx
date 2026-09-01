"use client";

import { ReactNode } from "react";
import { getStepDefinition } from "@/lib/workflows/registry";
import styles from "../../page.module.css";

type StepState = {
  status: "pending" | "running" | "done" | "error" | "disabled" | "skipped";
  progress: string | null;
  summary: Record<string, unknown> | null;
  error: string | null;
};

export function stepStatusBadgeClass(status: StepState["status"]): string {
  if (status === "pending") return styles.ghBadgeNeutral;
  if (status === "running") return styles.ghBadgeAccent;
  if (status === "done") return styles.ghBadgeSuccess;
  if (status === "error") return styles.ghBadgeDanger;
  if (status === "disabled") return styles.ghBadgeNeutral;
  return styles.ghBadgeNeutral; // "skipped"
}

/** The badge's own text for each status - "Failed"/"Disabled"/"Skipped" read
 * better than the raw status string, the other three (pending/running/done)
 * already do. Exported so RunProgressSidebar.tsx's compact step rows show
 * IDENTICAL wording to this card's own badge, rather than a second,
 * separately-maintained copy of the same three renames drifting out of
 * sync. */
export function stepStatusLabel(status: StepState["status"]): string {
  if (status === "error") return "Failed";
  if (status === "disabled") return "Disabled";
  if (status === "skipped") return "Skipped";
  return status;
}

interface RunStepCardProps {
  index: number;
  stepDef: ReturnType<typeof getStepDefinition> | null;
  origin: string | undefined;
  state: StepState;
  summary?: ReactNode;
  children?: ReactNode;
}

export function RunStepCard({
  index,
  stepDef,
  origin,
  state,
  summary,
  children,
}: RunStepCardProps) {
  const badgeClass = stepStatusBadgeClass(state.status);

  return (
    <div
      style={{
        border: "1px solid var(--field-border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-3)",
        marginTop: "var(--space-2)",
        background: "var(--field-background)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          marginBottom: "var(--space-2)",
        }}
      >
        <span>
          {index + 1}. {stepDef?.name ?? ""}
          {origin && (
            <span style={{ marginLeft: "var(--space-1)", opacity: 0.75 }}>
              (from {origin})
            </span>
          )}
        </span>
        <span className={`${styles.ghBadge} ${badgeClass}`}>
          {stepStatusLabel(state.status)}
        </span>
      </div>

      {state.progress && (
        <p className={styles.fieldHint}>{state.progress}</p>
      )}

      {state.error && (
        <p className={styles.error}>{state.error}</p>
      )}

      {summary && (
        <div style={{ marginTop: "var(--space-3)" }}>
          {summary}
        </div>
      )}

      {children}
    </div>
  );
}
