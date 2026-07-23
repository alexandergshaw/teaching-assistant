"use client";

import { Button } from "@mui/material";
import { describeScheduleCadence, type WorkflowSchedule } from "@/lib/workflow-schedules";
import { scheduleToForm, type ScheduleFormData } from "@/lib/workflow-form-helpers";
import type { WorkflowDef, RuntimeField } from "@/lib/workflows/types";
import { lastRunChip } from "./automation-inventory-logic";
import { ScheduleEditForm } from "./ScheduleEditForm";
import styles from "../../page.module.css";

interface ScheduleSectionProps {
  scheduleForm: ScheduleFormData | null;
  setScheduleForm: (form: ScheduleFormData | null | ((prev: ScheduleFormData | null) => ScheduleFormData | null)) => void;
  editingScheduleId: string | null;
  setEditingScheduleId: (id: string | null) => void;
  schedules: WorkflowSchedule[] | null;
  scheduleBusy: boolean;
  scheduleError: string | null;
  setScheduleError: (error: string | null) => void;
  scheduleRemoveConfirm: string | null;
  setScheduleRemoveConfirm: (id: string | null) => void;
  selectedDef: WorkflowDef | null;
  runtimeFields: RuntimeField[];
  hubCourses: Array<{ id: string; name: string; canvasUrl: string | null; repos: string[] }> | null;
  institutions: string[];
  activeInstitution: string | null;
  user: unknown;
  expandedError: string | null;
  isWorkflowHeadlessSafeById: (workflowId: string) => boolean;
  selectedHeadlessSafe: boolean;
  workflows: WorkflowDef[];
  onCreate: () => void;
  onSaveEdit: (scheduleId: string) => void;
  onToggle: (schedule: WorkflowSchedule) => void;
  onDelete: (scheduleId: string) => void;
}

export function ScheduleSection({
  scheduleForm,
  setScheduleForm,
  editingScheduleId,
  setEditingScheduleId,
  schedules,
  scheduleBusy,
  scheduleError,
  setScheduleError,
  scheduleRemoveConfirm,
  setScheduleRemoveConfirm,
  selectedDef,
  runtimeFields,
  hubCourses,
  institutions,
  activeInstitution,
  user,
  expandedError,
  isWorkflowHeadlessSafeById,
  selectedHeadlessSafe,
  workflows,
  onCreate,
  onSaveEdit,
  onToggle,
  onDelete,
}: ScheduleSectionProps) {
  return (
    <>
      <h3 style={{ fontSize: "0.95rem", margin: "0 0 4px 0" }}>Schedule</h3>
      <p className={styles.fieldHint} style={{ margin: "0 0 8px 0" }}>
        Run this workflow at a set time, optionally repeating.
      </p>
      <Button
        variant="outlined"
        size="small"
        disabled={!user || !!expandedError}
        onClick={() =>
          setScheduleForm((prev) =>
            prev
              ? null
              : { runAt: "", repeat: "none", intervalValue: "30", intervalUnit: "minutes", courseId: "", institution: activeInstitution || "", unattended: false }
          )
        }
      >
        {scheduleForm ? "Cancel schedule" : "Schedule..."}
      </Button>

      {scheduleForm && (
        <ScheduleEditForm
          scheduleForm={scheduleForm}
          setScheduleForm={setScheduleForm}
          editingScheduleId={editingScheduleId}
          setEditingScheduleId={setEditingScheduleId}
          setScheduleError={setScheduleError}
          schedules={schedules}
          scheduleBusy={scheduleBusy}
          error={null}
          selectedDef={selectedDef}
          runtimeFields={runtimeFields}
          hubCourses={hubCourses}
          institutions={institutions}
          isWorkflowHeadlessSafeById={isWorkflowHeadlessSafeById}
          selectedHeadlessSafe={selectedHeadlessSafe}
          onSaveEdit={onSaveEdit}
          onCreate={onCreate}
        />
      )}

      {scheduleError && <p className={styles.error}>{scheduleError}</p>}

      {schedules && schedules.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3 style={{ fontSize: "0.9rem", margin: "0 0 8px 0" }}>Scheduled runs</h3>
          {schedules.map((s) => {
            const courseName = s.courseId
              ? hubCourses?.find((c) => c.id === s.courseId)?.name ?? "course"
              : null;
            const attachment = [courseName, s.institution].filter(Boolean).join(", ");
            const chip = lastRunChip(s.lastRunStatus, s.lastRunAt);
            return (
              <div key={s.id} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "6px 0", borderTop: "1px solid var(--field-border)", fontSize: "0.85em" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600 }}>{s.workflowName}</span>
                  {s.unattended && (
                    <span className={`${styles.ghBadge} ${styles.ghBadgeAccent}`}>Unattended</span>
                  )}
                  {chip.text && (
                    <span className={`${styles.ghBadge} ${chip.class}`}>{chip.text}</span>
                  )}
                  <span style={{ color: "var(--text-secondary)" }}>
                    {s.enabled
                      ? `next run ${new Date(s.nextRunAt).toLocaleString()} (${describeScheduleCadence(s)})`
                      : "disabled"}
                    {attachment ? ` - ${attachment}` : ""}
                  </span>
                  <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                    {workflows.find((w) => w.id === s.workflowId) ? (
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => {
                          setScheduleForm(scheduleToForm(s));
                          setEditingScheduleId(s.id);
                        }}
                      >
                        Edit
                      </button>
                    ) : null}
                    <button type="button" className={styles.linkButton} onClick={() => void onToggle(s)}>
                      {s.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      className={styles.linkButton}
                      style={{ color: "var(--danger)" }}
                      onClick={() =>
                        scheduleRemoveConfirm === s.id
                          ? void onDelete(s.id)
                          : setScheduleRemoveConfirm(s.id)
                      }
                    >
                      {scheduleRemoveConfirm === s.id ? "Confirm" : "Remove"}
                    </button>
                  </span>
                </div>
                {s.lastRunDetail && (
                  <span className={styles.fieldHint} style={{ margin: 0, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.lastRunDetail}>
                    {s.lastRunDetail}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
