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
      } else if (binding.source === "step") {
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
        gap: 2,
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
        style={{ padding: 2, marginTop: -3 }}
      />
      <div>
        <span style={{ textDecoration: disabled ? "line-through" : undefined }}>
          {index + 1}. {stepDef?.name ?? step.type}
        </span>
        {origin && (
          <span style={{ marginLeft: 6, opacity: 0.75 }}>
            (from {origin})
          </span>
        )}
        {bindings && (
          <span style={{ marginLeft: 8 }}>({bindings})</span>
        )}
        {disabled && (
          <span
            className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}
            style={{ marginLeft: 8 }}
          >
            Disabled
          </span>
        )}
        {disabled && dependencyWarning && (
          <div style={{ fontSize: "0.9em", opacity: 0.85 }}>
            A later enabled step depends on this step&apos;s output and will
            be skipped when you run.
          </div>
        )}
      </div>
    </div>
  );
}
