"use client";

import { Checkbox } from "@mui/material";
import { getStepDefinition } from "@/lib/workflows/registry";
import type { WorkflowStepConfig } from "@/lib/workflows/types";
import styles from "../../page.module.css";

interface StepOverviewRowProps {
  step: WorkflowStepConfig;
  index: number;
  disabled: boolean;
  origin: string | undefined;
  dependencyWarning: boolean;
  onToggle: () => void;
  stepDef: ReturnType<typeof getStepDefinition> | null;
}

export function StepOverviewRow({
  step,
  index,
  disabled,
  origin,
  dependencyWarning,
  onToggle,
  stepDef,
}: StepOverviewRowProps) {
  const bindings = Object.entries(step.bindings)
    .map(([key, binding]) => {
      if (binding.source === "runtime") {
        return `${key}: from run form`;
      } else if (binding.source === "step" && "stepIndex" in binding) {
        // The step list here is always already-EXPANDED (see
        // expandWorkflowDef in types.expand.ts), so a "step" binding always
        // carries stepIndex, never a residual stepId, by the time it
        // reaches this display-only row.
        return `${key}: from step ${binding.stepIndex + 1} output`;
      } else if (binding.source === "literal") {
        return `${key}: = ${binding.value}`;
      }
      return "";
    })
    .filter(Boolean)
    .join(" | ");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "var(--space-1)",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Checkbox
        size="small"
        checked={!disabled}
        onChange={onToggle}
        title={
          disabled
            ? "Enable this step for your runs"
            : "Disable this step for your runs"
        }
        style={{ padding: "var(--space-1)", marginTop: "calc(var(--space-1) * -1)" }}
      />
      <div>
        <span style={{ textDecoration: disabled ? "line-through" : undefined }}>
          {index + 1}. {stepDef?.name ?? step.type}
        </span>
        {origin && (
          <span style={{ marginLeft: "var(--space-1)", opacity: 0.75 }}>
            (from {origin})
          </span>
        )}
        {bindings && (
          <span style={{ marginLeft: "var(--space-2)" }}>({bindings})</span>
        )}
        {/* B3: every StepDefinition already carries a description - this used
            to render only the step's bare name and its raw bindings, leaving
            "what will this step actually DO" (e.g. "posts an announcement to
            Canvas" vs. "drafts a file") unstated before Run is clicked. */}
        {stepDef?.description && (
          <div className={styles.fieldHint} style={{ marginTop: "var(--space-1)" }}>
            {stepDef.description}
          </div>
        )}
        {disabled && (
          <span
            className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}
            style={{ marginLeft: "var(--space-2)" }}
          >
            Disabled
          </span>
        )}
        {disabled && dependencyWarning && (
          <div style={{ fontSize: "var(--font-size-sm)", opacity: 0.85 }}>
            A later enabled step depends on this step&apos;s output and will
            be skipped when you run.
          </div>
        )}
      </div>
    </div>
  );
}
