"use client";

import { describeScheduleCadence, type WorkflowSchedule } from "@/lib/workflow-schedules";
import { describeTrigger, type WorkflowTrigger } from "@/lib/workflow-triggers";
import type { WorkflowDef } from "@/lib/workflows/types";
import styles from "../../page.module.css";

interface AutomateOverviewProps {
  workflows: WorkflowDef[];
  automationByWorkflow: Map<string, { scheduled: boolean; triggered: boolean }>;
  schedules: WorkflowSchedule[] | null;
  triggers: WorkflowTrigger[] | null;
  onSelectWorkflow: (workflowId: string) => void;
}

export function AutomateOverview({
  workflows,
  automationByWorkflow,
  schedules,
  triggers,
  onSelectWorkflow,
}: AutomateOverviewProps) {
  const automated = workflows.filter((w) => {
    const a = automationByWorkflow.get(w.id);
    return a && (a.scheduled || a.triggered);
  });

  if (automated.length === 0) {
    return <div className={styles.fieldHint}>No workflows are scheduled or have triggers yet.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {automated.map((w) => {
        const wfSchedules = (schedules ?? []).filter((s) => s.workflowId === w.id && s.enabled);
        const wfTriggers = (triggers ?? []).filter((t) => t.workflowId === w.id && t.enabled);
        return (
          <div key={w.id} style={{ borderLeft: "2px solid var(--field-border)", paddingLeft: 10 }}>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => onSelectWorkflow(w.id)}
              style={{ fontWeight: 600, fontSize: "0.9rem", textAlign: "left", cursor: "pointer" }}
            >
              {w.name}
            </button>
            {wfSchedules.map((s) => (
              <div key={s.id} className={styles.fieldHint} style={{ margin: 0 }}>
                Scheduled {describeScheduleCadence(s)}{s.unattended ? " (unattended)" : ""}
              </div>
            ))}
            {wfTriggers.map((t) => (
              <div key={t.id} className={styles.fieldHint} style={{ margin: 0 }}>
                Trigger: {describeTrigger(t)}{t.unattended ? " (unattended)" : ""}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
