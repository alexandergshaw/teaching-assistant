"use client";

// A single schedule/trigger row in the Automations hub (AutomationsPanel):
// the always-visible summary line (unchanged from before), a "Details"
// disclosure showing every field on the row, and an "Edit" affordance that
// swaps the detail view for the SAME ScheduleEditForm/TriggerEditForm the
// per-workflow Automate panel uses. Delete is intentionally not offered here
// - the per-workflow Automate panel remains the place for that.

import { describeScheduleCadence, type WorkflowSchedule } from "@/lib/workflow-schedules";
import {
  describeTrigger,
  getEventSource,
  parseInstitutionsConfig,
  type WorkflowTrigger,
} from "@/lib/workflow-triggers";
import type { ScheduleFormData, TriggerFormData } from "@/lib/workflow-form-helpers";
import type { WorkflowDef } from "@/lib/workflows/types";
import { lastRunChip, resolveCourseName, formatFieldValues } from "./automation-inventory-logic";
import { ScheduleEditForm } from "./ScheduleEditForm";
import { TriggerEditForm } from "./TriggerEditForm";
import styles from "../../page.module.css";

type HubCourse = { id: string; name: string; canvasUrl: string | null; repos: string[] };

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.fieldHint} style={{ margin: 0 }}>
      <span style={{ fontWeight: 600 }}>{label}:</span> {value}
    </div>
  );
}

function FieldValuesSnapshot({ fieldValues }: { fieldValues: Record<string, string> }) {
  const entries = formatFieldValues(fieldValues);
  if (entries.length === 0) return null;
  return (
    <DetailLine
      label="Field values"
      value={entries.map(({ key, value }) => `${key}: ${value}`).join(", ")}
    />
  );
}

const detailBoxStyle: React.CSSProperties = {
  marginTop: 8,
  border: "1px solid var(--field-border)",
  borderRadius: 10,
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

export interface ScheduleRowProps {
  schedule: WorkflowSchedule;
  schedules: WorkflowSchedule[] | null;
  hubCourses: HubCourse[] | null;
  institutions: string[];
  isWorkflowHeadlessSafeById: (workflowId: string) => boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  isEditing: boolean;
  editForm: ScheduleFormData | null;
  setEditForm: (form: ScheduleFormData | null | ((prev: ScheduleFormData | null) => ScheduleFormData | null)) => void;
  editBusy: boolean;
  editError: string | null;
  onStartEdit: () => void;
  onSaveEdit: (scheduleId: string) => void;
  onCancelEdit: () => void;
  onToggle: (schedule: WorkflowSchedule) => void;
}

export function ScheduleRow({
  schedule,
  schedules,
  hubCourses,
  institutions,
  isWorkflowHeadlessSafeById,
  expanded,
  onToggleExpanded,
  isEditing,
  editForm,
  setEditForm,
  editBusy,
  editError,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggle,
}: ScheduleRowProps) {
  const chip = lastRunChip(schedule.lastRunStatus, schedule.lastRunAt);
  const courseName = resolveCourseName(schedule.courseId, hubCourses);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "stretch",
        fontSize: "0.85rem",
        padding: "4px 0",
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: "var(--text-secondary)" }}>
          Scheduled {describeScheduleCadence(schedule)}
          {schedule.unattended ? " (unattended)" : ""}
        </span>
        {chip.text && <span className={`${styles.ghBadge} ${chip.class}`}>{chip.text}</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button type="button" className={styles.linkButton} onClick={onToggleExpanded}>
            {expanded ? "Hide" : "Details"}
          </button>
          <button type="button" className={styles.linkButton} onClick={() => void onToggle(schedule)}>
            {schedule.enabled ? "Disable" : "Enable"}
          </button>
        </span>
      </div>
      {schedule.lastRunDetail && !expanded && (
        <span
          className={styles.fieldHint}
          style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.8rem" }}
          title={schedule.lastRunDetail}
        >
          {schedule.lastRunDetail}
        </span>
      )}

      {expanded && !isEditing && (
        <div style={detailBoxStyle}>
          <DetailLine label="First run" value={new Date(schedule.nextRunAt).toLocaleString()} />
          <DetailLine label="Repeat" value={describeScheduleCadence(schedule)} />
          {schedule.repeat === "interval" && schedule.intervalMinutes !== null && (
            <DetailLine label="Interval" value={`${schedule.intervalMinutes} minutes`} />
          )}
          <DetailLine label="Course" value={courseName ?? "None"} />
          <DetailLine label="Institution" value={schedule.institution ?? "None"} />
          <DetailLine label="Unattended" value={schedule.unattended ? "Yes" : "No"} />
          <DetailLine
            label="Last run"
            value={
              schedule.lastRunStatus
                ? `${schedule.lastRunStatus}${schedule.lastRunAt ? ` at ${new Date(schedule.lastRunAt).toLocaleString()}` : ""}${schedule.lastRunDetail ? ` - ${schedule.lastRunDetail}` : ""}`
                : "Never"
            }
          />
          <FieldValuesSnapshot fieldValues={schedule.fieldValues} />
          <div>
            <button type="button" className={styles.linkButton} onClick={onStartEdit}>
              Edit
            </button>
          </div>
        </div>
      )}

      {isEditing && editForm && (
        <ScheduleEditForm
          scheduleForm={editForm}
          setScheduleForm={setEditForm}
          editingScheduleId={schedule.id}
          setEditingScheduleId={onCancelEdit}
          setScheduleError={() => {}}
          schedules={schedules}
          scheduleBusy={editBusy}
          error={editError}
          selectedDef={null}
          runtimeFields={[]}
          hubCourses={hubCourses}
          institutions={institutions}
          isWorkflowHeadlessSafeById={isWorkflowHeadlessSafeById}
          selectedHeadlessSafe={false}
          onSaveEdit={onSaveEdit}
          onCreate={() => {}}
        />
      )}
    </div>
  );
}

export interface TriggerRowProps {
  trigger: WorkflowTrigger;
  triggers: WorkflowTrigger[] | null;
  hubCourses: HubCourse[] | null;
  institutions: string[];
  activeInstitution: string | null;
  isWorkflowHeadlessSafeById: (workflowId: string) => boolean;
  orgs: string[] | null;
  orgsError: string | null;
  workflows: WorkflowDef[];
  expanded: boolean;
  onToggleExpanded: () => void;
  isEditing: boolean;
  editForm: TriggerFormData | null;
  setEditForm: (form: TriggerFormData | null | ((prev: TriggerFormData | null) => TriggerFormData | null)) => void;
  editBusy: boolean;
  editError: string | null;
  onStartEdit: () => void;
  onSaveEdit: (triggerId: string) => void;
  onCancelEdit: () => void;
  onToggle: (trigger: WorkflowTrigger) => void;
}

export function TriggerRow({
  trigger,
  triggers,
  hubCourses,
  institutions,
  activeInstitution,
  isWorkflowHeadlessSafeById,
  orgs,
  orgsError,
  workflows,
  expanded,
  onToggleExpanded,
  isEditing,
  editForm,
  setEditForm,
  editBusy,
  editError,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggle,
}: TriggerRowProps) {
  const chip = lastRunChip(trigger.lastRunStatus, trigger.lastFiredAt);
  const courseName = resolveCourseName(trigger.courseId, hubCourses);
  const source = getEventSource(trigger.eventType);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "stretch",
        fontSize: "0.85rem",
        padding: "4px 0",
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: "var(--text-secondary)" }}>
          Trigger: {describeTrigger(trigger)}
          {trigger.unattended ? " (unattended)" : ""}
        </span>
        {chip.text && <span className={`${styles.ghBadge} ${chip.class}`}>{chip.text}</span>}
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button type="button" className={styles.linkButton} onClick={onToggleExpanded}>
            {expanded ? "Hide" : "Details"}
          </button>
          <button type="button" className={styles.linkButton} onClick={() => void onToggle(trigger)}>
            {trigger.enabled ? "Disable" : "Enable"}
          </button>
        </span>
      </div>
      {trigger.lastRunDetail && !expanded && (
        <span
          className={styles.fieldHint}
          style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.8rem" }}
          title={trigger.lastRunDetail}
        >
          {trigger.lastRunDetail}
        </span>
      )}

      {expanded && !isEditing && (
        <div style={detailBoxStyle}>
          <DetailLine label="Event" value={source?.label ?? trigger.eventType} />
          {(source?.configFields ?? []).map((field) => {
            const raw = trigger.eventConfig[field.key] ?? "";
            if (!raw) return null;
            let display = raw;
            if (field.type === "boolean") {
              display = raw === "1" ? "Yes" : "No";
            } else if (field.type === "institutions") {
              const parsed = parseInstitutionsConfig({ institutions: raw });
              display = parsed.all ? "All institutions" : parsed.list.join(", ") || "(none)";
            } else if (field.type === "course") {
              display = resolveCourseName(raw, hubCourses) ?? raw;
            } else if (field.type === "workflow") {
              display = raw === "*" ? "Any workflow" : workflows.find((w) => w.id === raw)?.name ?? raw;
            }
            return <DetailLine key={field.key} label={field.label} value={display} />;
          })}
          <DetailLine label="Course" value={courseName ?? "None"} />
          <DetailLine label="Institution" value={trigger.institution ?? "None"} />
          <DetailLine label="Unattended" value={trigger.unattended ? "Yes" : "No"} />
          <DetailLine
            label="Last run"
            value={
              trigger.lastRunStatus
                ? `${trigger.lastRunStatus}${trigger.lastFiredAt ? ` at ${new Date(trigger.lastFiredAt).toLocaleString()}` : ""}${trigger.lastRunDetail ? ` - ${trigger.lastRunDetail}` : ""}`
                : "Never"
            }
          />
          <FieldValuesSnapshot fieldValues={trigger.fieldValues} />
          <div>
            <button type="button" className={styles.linkButton} onClick={onStartEdit}>
              Edit
            </button>
          </div>
        </div>
      )}

      {isEditing && editForm && (
        <TriggerEditForm
          triggerForm={editForm}
          setTriggerForm={setEditForm}
          editingTriggerId={trigger.id}
          setEditingTriggerId={onCancelEdit}
          setTriggerError={() => {}}
          triggers={triggers}
          triggerBusy={editBusy}
          error={editError}
          selectedDef={null}
          selectedWorkflowId={trigger.workflowId}
          hubCourses={hubCourses}
          institutions={institutions}
          activeInstitution={activeInstitution}
          isWorkflowHeadlessSafeById={isWorkflowHeadlessSafeById}
          selectedHeadlessSafe={false}
          orgs={orgs}
          orgsError={orgsError}
          workflows={workflows}
          onSaveEdit={onSaveEdit}
          onCreate={() => {}}
        />
      )}
    </div>
  );
}
