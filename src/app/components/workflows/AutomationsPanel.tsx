"use client";

import { describeScheduleCadence, type WorkflowSchedule } from "@/lib/workflow-schedules";
import { describeTrigger, type WorkflowTrigger } from "@/lib/workflow-triggers";
import type { WorkflowDef } from "@/lib/workflows/types";
import { orderWorkflowsAttentionFirst, needsAttention, lastRunChip } from "./automation-inventory-logic";
import styles from "../../page.module.css";

interface AutomationsPanelProps {
  workflows: WorkflowDef[];
  schedules: WorkflowSchedule[] | null;
  triggers: WorkflowTrigger[] | null;
  onSelectWorkflow: (workflowId: string, panel: "automate") => void;
  onToggleSchedule: (schedule: WorkflowSchedule) => Promise<void>;
  onToggleTrigger: (trigger: WorkflowTrigger) => Promise<void>;
}

export function AutomationsPanel({
  workflows,
  schedules,
  triggers,
  onSelectWorkflow,
  onToggleSchedule,
  onToggleTrigger,
}: AutomationsPanelProps) {
  const automated = orderWorkflowsAttentionFirst(workflows, schedules, triggers);

  if (automated.length === 0) {
    return (
      <div>
        <p className={styles.fieldHint}>No workflows are scheduled or have triggers yet.</p>
        <p className={styles.fieldHint} style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          Open a workflow in the Workflows tab and use the Automate panel to add schedules or triggers.
        </p>
      </div>
    );
  }

  // Check if any workflow needs attention
  const workflowsNeedingAttention = automated.filter((w) => {
    const wfSchedules = (schedules ?? []).filter((s) => s.workflowId === w.id);
    const wfTriggers = (triggers ?? []).filter((t) => t.workflowId === w.id);
    return (
      wfSchedules.some((s) => needsAttention(s, null)) ||
      wfTriggers.some((t) => needsAttention(null, t))
    );
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {workflowsNeedingAttention.length > 0 && (
        <div>
          <span className={`${styles.ghBadge} ${styles.ghBadgeDanger}`} style={{ display: "inline-block", marginBottom: 12 }}>
            Needs attention
          </span>
        </div>
      )}

      {automated.map((w) => {
        const wfSchedules = (schedules ?? []).filter((s) => s.workflowId === w.id);
        const wfTriggers = (triggers ?? []).filter((t) => t.workflowId === w.id);
        const auto = [...wfSchedules, ...wfTriggers];
        const allDisabled = auto.length > 0 && auto.every((a) => !a.enabled);

        return (
          <div
            key={w.id}
            style={{
              borderLeft: "2px solid var(--field-border)",
              paddingLeft: 10,
              opacity: allDisabled ? 0.6 : 1,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => onSelectWorkflow(w.id, "automate")}
                style={{ fontWeight: 600, fontSize: "0.9rem", cursor: "pointer" }}
              >
                {w.name}
              </button>
              {w.category && (
                <span
                  className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}
                  style={{ fontSize: "0.75rem", padding: "2px 6px" }}
                >
                  {w.category}
                </span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {wfSchedules.map((s) => {
                const chip = lastRunChip(s.lastRunStatus, s.lastRunAt);

                return (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                      fontSize: "0.85rem",
                      padding: "4px 0",
                    }}
                  >
                    <span style={{ color: "var(--text-secondary)" }}>
                      Scheduled {describeScheduleCadence(s)}
                      {s.unattended ? " (unattended)" : ""}
                    </span>
                    {chip.text && (
                      <span className={`${styles.ghBadge} ${chip.class}`}>
                        {chip.text}
                      </span>
                    )}
                    <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => void onToggleSchedule(s)}
                      >
                        {s.enabled ? "Disable" : "Enable"}
                      </button>
                    </span>
                    {s.lastRunDetail && (
                      <span
                        className={styles.fieldHint}
                        style={{ margin: 0, width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.8rem" }}
                        title={s.lastRunDetail}
                      >
                        {s.lastRunDetail}
                      </span>
                    )}
                  </div>
                );
              })}

              {wfTriggers.map((t) => {
                const chip = lastRunChip(t.lastRunStatus, t.lastFiredAt);

                return (
                  <div
                    key={t.id}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      flexWrap: "wrap",
                      fontSize: "0.85rem",
                      padding: "4px 0",
                    }}
                  >
                    <span style={{ color: "var(--text-secondary)" }}>
                      Trigger: {describeTrigger(t)}
                      {t.unattended ? " (unattended)" : ""}
                    </span>
                    {chip.text && (
                      <span className={`${styles.ghBadge} ${chip.class}`}>
                        {chip.text}
                      </span>
                    )}
                    <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => void onToggleTrigger(t)}
                      >
                        {t.enabled ? "Disable" : "Enable"}
                      </button>
                    </span>
                    {t.lastRunDetail && (
                      <span
                        className={styles.fieldHint}
                        style={{ margin: 0, width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.8rem" }}
                        title={t.lastRunDetail}
                      >
                        {t.lastRunDetail}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
