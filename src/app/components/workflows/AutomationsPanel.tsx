"use client";

import type { WorkflowSchedule } from "@/lib/workflow-schedules";
import type { WorkflowTrigger } from "@/lib/workflow-triggers";
import type { WorkflowDef } from "@/lib/workflows/types";
import type { ScheduleFormData, TriggerFormData } from "@/lib/workflow-form-helpers";
import { orderWorkflowsAttentionFirst, needsAttention, scheduleRowKey, triggerRowKey } from "./automation-inventory-logic";
import { ScheduleRow, TriggerRow } from "./AutomationRow";
import styles from "../../page.module.css";

type HubCourse = { id: string; name: string; canvasUrl: string | null; repos: string[] };

interface AutomationsPanelProps {
  workflows: WorkflowDef[];
  schedules: WorkflowSchedule[] | null;
  triggers: WorkflowTrigger[] | null;
  onSelectWorkflow: (workflowId: string, panel: "automate") => void;
  onToggleSchedule: (schedule: WorkflowSchedule) => Promise<void>;
  onToggleTrigger: (trigger: WorkflowTrigger) => Promise<void>;
  hubCourses: HubCourse[] | null;
  institutions: string[];
  activeInstitution: string | null;
  orgs: string[] | null;
  orgsError: string | null;
  isWorkflowHeadlessSafeById: (workflowId: string) => boolean;
  expanded: Set<string>;
  onToggleExpanded: (key: string) => void;
  editingKey: string | null;
  scheduleEditForm: ScheduleFormData | null;
  setScheduleEditForm: (form: ScheduleFormData | null | ((prev: ScheduleFormData | null) => ScheduleFormData | null)) => void;
  triggerEditForm: TriggerFormData | null;
  setTriggerEditForm: (form: TriggerFormData | null | ((prev: TriggerFormData | null) => TriggerFormData | null)) => void;
  editBusy: boolean;
  editError: string | null;
  onStartEditSchedule: (schedule: WorkflowSchedule) => void;
  onStartEditTrigger: (trigger: WorkflowTrigger) => void;
  onSaveScheduleEdit: (scheduleId: string) => void;
  onSaveTriggerEdit: (triggerId: string) => void;
  onCancelEdit: () => void;
}

export function AutomationsPanel({
  workflows,
  schedules,
  triggers,
  onSelectWorkflow,
  onToggleSchedule,
  onToggleTrigger,
  hubCourses,
  institutions,
  activeInstitution,
  orgs,
  orgsError,
  isWorkflowHeadlessSafeById,
  expanded,
  onToggleExpanded,
  editingKey,
  scheduleEditForm,
  setScheduleEditForm,
  triggerEditForm,
  setTriggerEditForm,
  editBusy,
  editError,
  onStartEditSchedule,
  onStartEditTrigger,
  onSaveScheduleEdit,
  onSaveTriggerEdit,
  onCancelEdit,
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
                const key = scheduleRowKey(s.id);
                return (
                  <ScheduleRow
                    key={s.id}
                    schedule={s}
                    schedules={schedules}
                    hubCourses={hubCourses}
                    institutions={institutions}
                    isWorkflowHeadlessSafeById={isWorkflowHeadlessSafeById}
                    expanded={expanded.has(key)}
                    onToggleExpanded={() => onToggleExpanded(key)}
                    isEditing={editingKey === key}
                    editForm={scheduleEditForm}
                    setEditForm={setScheduleEditForm}
                    editBusy={editBusy}
                    editError={editError}
                    onStartEdit={() => onStartEditSchedule(s)}
                    onSaveEdit={onSaveScheduleEdit}
                    onCancelEdit={onCancelEdit}
                    onToggle={onToggleSchedule}
                  />
                );
              })}

              {wfTriggers.map((t) => {
                const key = triggerRowKey(t.id);
                return (
                  <TriggerRow
                    key={t.id}
                    trigger={t}
                    triggers={triggers}
                    hubCourses={hubCourses}
                    institutions={institutions}
                    activeInstitution={activeInstitution}
                    isWorkflowHeadlessSafeById={isWorkflowHeadlessSafeById}
                    orgs={orgs}
                    orgsError={orgsError}
                    workflows={workflows}
                    expanded={expanded.has(key)}
                    onToggleExpanded={() => onToggleExpanded(key)}
                    isEditing={editingKey === key}
                    editForm={triggerEditForm}
                    setEditForm={setTriggerEditForm}
                    editBusy={editBusy}
                    editError={editError}
                    onStartEdit={() => onStartEditTrigger(t)}
                    onSaveEdit={onSaveTriggerEdit}
                    onCancelEdit={onCancelEdit}
                    onToggle={onToggleTrigger}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
