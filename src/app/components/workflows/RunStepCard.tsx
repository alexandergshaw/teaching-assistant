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
  if (status === "disabled") return styles.ghBadgeNeutral;
  if (status === "skipped") return styles.ghBadgeNeutral;
  return "";
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
        borderRadius: 12,
        padding: 12,
        marginTop: 8,
        background: "var(--field-background)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span>
          {index + 1}. {stepDef?.name ?? ""}
          {origin && (
            <span style={{ marginLeft: 6, opacity: 0.75 }}>
              (from {origin})
            </span>
          )}
        </span>
        <span
          className={`${styles.ghBadge} ${badgeClass}`}
          style={
            state.status === "error"
              ? {
                  color: "var(--danger)",
                  background: "color-mix(in srgb, var(--danger) 15%, transparent)",
                }
              : {}
          }
        >
          {state.status === "error"
            ? "Failed"
            : state.status === "disabled"
            ? "Disabled"
            : state.status === "skipped"
            ? "Skipped"
            : state.status}
        </span>
      </div>

      {state.progress && (
        <p className={styles.fieldHint}>{state.progress}</p>
      )}

      {state.error && (
        <p className={styles.error}>{state.error}</p>
      )}

      {summary && (
        <div style={{ marginTop: 12 }}>
          {summary}
        </div>
      )}

      {children}
    </div>
  );
}
