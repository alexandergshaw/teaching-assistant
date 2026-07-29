"use client";

// One schedule/trigger row in the Automations hub table (AutomationsPanel):
// a summary <tr> (name, fires, last run, next run, enabled, unattended,
// actions) plus - when expanded - a full-width detail <tr> beneath it (a
// "Details" disclosure showing every field on the row, or the SAME
// ScheduleEditForm/TriggerEditForm the per-workflow Automate panel uses when
// editing). Delete is intentionally not offered here - the per-workflow
// Automate panel remains the place for that.
//
// The detail <tr> spans every column (colSpan={AUTOMATION_TABLE_COLUMN_COUNT})
// rather than being squeezed into one - AutomationRunsSection (the lazily-
// loaded recent-runs table) and the edit forms both need real width.

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
import { AutomationRunsSection } from "./AutomationRunsSection";
import { ScheduleEditForm } from "./ScheduleEditForm";
import { TriggerEditForm } from "./TriggerEditForm";
import styles from "../../page.module.css";
import tableStyles from "./AutomationsTable.module.css";

type HubCourse = { id: string; name: string; canvasUrl: string | null; repos: string[] };

/** Name, Fires, Last run, Next run, Enabled, Unattended, Actions - kept as a
 * constant so the summary row's cell count and the detail row's colSpan can
 * never drift apart. */
export const AUTOMATION_TABLE_COLUMN_COUNT = 7;

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
  border: "1px solid var(--field-border)",
  borderRadius: 10,
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

/** Name cell: the workflow link plus its category badge, if any. Repeats per
 * row (one row per schedule/trigger, not per workflow) now that grouping is
 * Scheduled/Triggered rather than by workflow. */
function NameCell({
  workflowId,
  workflowName,
  workflows,
  onSelectWorkflow,
}: {
  workflowId: string;
  workflowName: string;
  workflows: WorkflowDef[];
  onSelectWorkflow: (workflowId: string, panel: "automate") => void;
}) {
  const category = workflows.find((w) => w.id === workflowId)?.category;
  return (
    <td>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
        <button
          type="button"
          className={styles.linkButton}
          onClick={() => onSelectWorkflow(workflowId, "automate")}
          style={{ fontWeight: 600 }}
        >
          {workflowName}
        </button>
        {category && (
          <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`} style={{ fontSize: "0.7rem" }}>
            {category}
          </span>
        )}
      </div>
    </td>
  );
}

function LastRunCell({
  status,
  runAt,
  detail,
}: {
  status: string | null;
  runAt: string | null;
  detail: string | null;
}) {
  const chip = lastRunChip(status, runAt);
  return (
    <td title={detail ?? undefined}>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
        {chip.text ? (
          <span className={`${styles.ghBadge} ${chip.class}`}>{chip.text}</span>
        ) : (
          <span className={styles.fieldHint} style={{ margin: 0 }}>
            Never run
          </span>
        )}
        {runAt && (
          <span className={styles.fieldHint} style={{ margin: 0, fontSize: "0.72rem" }}>
            {new Date(runAt).toLocaleString()}
          </span>
        )}
      </div>
    </td>
  );
}

function EnabledCell({ enabled }: { enabled: boolean }) {
  return (
    <td>
      <span className={`${styles.ghBadge} ${enabled ? styles.ghBadgeSuccess : styles.ghBadgeNeutral}`}>
        {enabled ? "Enabled" : "Disabled"}
      </span>
    </td>
  );
}

function UnattendedCell({ unattended }: { unattended: boolean }) {
  return <td style={{ color: "var(--text-secondary)" }}>{unattended ? "Yes" : "No"}</td>;
}

function ActionsCell({
  expanded,
  onToggleExpanded,
  enabled,
  onToggle,
}: {
  expanded: boolean;
  onToggleExpanded: () => void;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <td>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className={styles.linkButton} onClick={onToggleExpanded}>
          {expanded ? "Hide" : "Details"}
        </button>
        <button type="button" className={styles.linkButton} onClick={onToggle}>
          {enabled ? "Disable" : "Enable"}
        </button>
      </div>
    </td>
  );
}

export interface ScheduleRowProps {
  schedule: WorkflowSchedule;
  schedules: WorkflowSchedule[] | null;
  workflows: WorkflowDef[];
  onSelectWorkflow: (workflowId: string, panel: "automate") => void;
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
  workflows,
  onSelectWorkflow,
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
  const courseName = resolveCourseName(schedule.courseId, hubCourses);

  return (
    <>
      <tr>
        <NameCell workflowId={schedule.workflowId} workflowName={schedule.workflowName} workflows={workflows} onSelectWorkflow={onSelectWorkflow} />
        <td>{describeScheduleCadence(schedule)}</td>
        <LastRunCell status={schedule.lastRunStatus} runAt={schedule.lastRunAt} detail={schedule.lastRunDetail} />
        <td>{schedule.enabled ? new Date(schedule.nextRunAt).toLocaleString() : "—"}</td>
        <EnabledCell enabled={schedule.enabled} />
        <UnattendedCell unattended={schedule.unattended} />
        <ActionsCell expanded={expanded} onToggleExpanded={onToggleExpanded} enabled={schedule.enabled} onToggle={() => void onToggle(schedule)} />
      </tr>

      {expanded && !isEditing && (
        <tr className={tableStyles.detailRow}>
          <td colSpan={AUTOMATION_TABLE_COLUMN_COUNT}>
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
              <AutomationRunsSection triggerRef={schedule.id} workflowName={schedule.workflowName} />
            </div>
          </td>
        </tr>
      )}

      {isEditing && editForm && (
        <tr className={tableStyles.detailRow}>
          <td colSpan={AUTOMATION_TABLE_COLUMN_COUNT}>
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
          </td>
        </tr>
      )}
    </>
  );
}

export interface TriggerRowProps {
  trigger: WorkflowTrigger;
  triggers: WorkflowTrigger[] | null;
  workflows: WorkflowDef[];
  onSelectWorkflow: (workflowId: string, panel: "automate") => void;
  hubCourses: HubCourse[] | null;
  institutions: string[];
  activeInstitution: string | null;
  isWorkflowHeadlessSafeById: (workflowId: string) => boolean;
  orgs: string[] | null;
  orgsError: string | null;
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
  workflows,
  onSelectWorkflow,
  hubCourses,
  institutions,
  activeInstitution,
  isWorkflowHeadlessSafeById,
  orgs,
  orgsError,
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
  const courseName = resolveCourseName(trigger.courseId, hubCourses);
  const source = getEventSource(trigger.eventType);

  return (
    <>
      <tr>
        <NameCell workflowId={trigger.workflowId} workflowName={trigger.workflowName} workflows={workflows} onSelectWorkflow={onSelectWorkflow} />
        <td>{describeTrigger(trigger)}</td>
        <LastRunCell status={trigger.lastRunStatus} runAt={trigger.lastFiredAt} detail={trigger.lastRunDetail} />
        <td title="Event-driven - no fixed next run">{"—"}</td>
        <EnabledCell enabled={trigger.enabled} />
        <UnattendedCell unattended={trigger.unattended} />
        <ActionsCell expanded={expanded} onToggleExpanded={onToggleExpanded} enabled={trigger.enabled} onToggle={() => void onToggle(trigger)} />
      </tr>

      {expanded && !isEditing && (
        <tr className={tableStyles.detailRow}>
          <td colSpan={AUTOMATION_TABLE_COLUMN_COUNT}>
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
              <AutomationRunsSection triggerRef={trigger.id} workflowName={trigger.workflowName} />
            </div>
          </td>
        </tr>
      )}

      {isEditing && editForm && (
        <tr className={tableStyles.detailRow}>
          <td colSpan={AUTOMATION_TABLE_COLUMN_COUNT}>
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
          </td>
        </tr>
      )}
    </>
  );
}
