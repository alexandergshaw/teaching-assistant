"use client";

import { Button, MenuItem, TextField, Checkbox, FormControlLabel } from "@mui/material";
import { describeScheduleCadence, MIN_INTERVAL_MINUTES, type WorkflowSchedule, type ScheduleRepeat } from "@/lib/workflow-schedules";
import { scheduleToForm } from "@/lib/workflow-form-helpers";
import type { WorkflowDef, RuntimeField } from "@/lib/workflows/types";
import { lastRunChip } from "./automation-inventory-logic";
import styles from "../../page.module.css";

type ScheduleFormData = {
  runAt: string;
  repeat: ScheduleRepeat;
  intervalValue: string;
  intervalUnit: "minutes" | "hours";
  courseId: string;
  institution: string;
  unattended: boolean;
};

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
        <div style={{ marginTop: 16, border: "1px solid var(--field-border)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {editingScheduleId ? (
            <>
              <span style={{ fontWeight: 600, fontSize: "0.9em" }}>
                Editing {schedules?.find((s) => s.id === editingScheduleId)?.workflowName}&apos;s schedule
              </span>
            </>
          ) : (
            <>
              <span style={{ fontWeight: 600, fontSize: "0.9em" }}>Schedule {selectedDef?.name}</span>
              <p className={styles.fieldHint} style={{ margin: 0 }}>
                Uses the run form values as they are right now. Runs start while the app is open; an overdue schedule runs on your next visit.
              </p>
              {runtimeFields.some((f) => f.type === "uploads" && f.required) && (
                <p className={styles.fieldHint} style={{ margin: 0, color: "var(--danger)" }}>
                  This workflow requires a file upload at run time, which cannot be saved with a schedule - the scheduled run will stop at the form.
                </p>
              )}
            </>
          )}
          {scheduleForm.repeat === "interval" && (
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              Set any interval from {MIN_INTERVAL_MINUTES} minutes up. Unattended runs are checked about every {MIN_INTERVAL_MINUTES} minutes, so that is the shortest that fires reliably.
            </p>
          )}
          {editingScheduleId
            ? (() => {
                const editingSchedule = schedules?.find((s) => s.id === editingScheduleId);
                const editingIsHeadlessSafe = editingSchedule ? isWorkflowHeadlessSafeById(editingSchedule.workflowId) : false;
                return editingIsHeadlessSafe ? (
                  <div>
                    <FormControlLabel
                      control={
                        <Checkbox
                          size="small"
                          checked={scheduleForm.unattended}
                          onChange={(e) =>
                            setScheduleForm((p) => (p ? { ...p, unattended: e.target.checked } : p))
                          }
                        />
                      }
                      label="Run unattended in the cloud (even when the app is closed)"
                    />
                    <p className={styles.fieldHint} style={{ margin: 0 }}>
                      Unattended runs use the current run-form values and provider snapshot; interactive workflows are not eligible.
                    </p>
                  </div>
                ) : (
                  <p className={styles.fieldHint} style={{ margin: 0 }}>
                    This workflow pauses for input, so it can only run while the app is open.
                  </p>
                );
              })()
            : selectedHeadlessSafe ? (
            <div>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={scheduleForm.unattended}
                    onChange={(e) =>
                      setScheduleForm((p) => (p ? { ...p, unattended: e.target.checked } : p))
                    }
                  />
                }
                label="Run unattended in the cloud (even when the app is closed)"
              />
              <p className={styles.fieldHint} style={{ margin: 0 }}>
                Unattended runs use the current run-form values and provider snapshot; interactive workflows are not eligible.
              </p>
            </div>
          ) : (
            <p className={styles.fieldHint} style={{ margin: 0 }}>
              This workflow pauses for input, so it can only run while the app is open.
            </p>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <TextField
              size="small"
              label="First run"
              type="datetime-local"
              value={scheduleForm.runAt}
              onChange={(e) => setScheduleForm((p) => (p ? { ...p, runAt: e.target.value } : p))}
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <TextField
              select
              size="small"
              label="Repeat"
              value={scheduleForm.repeat}
              onChange={(e) => setScheduleForm((p) => (p ? { ...p, repeat: e.target.value as ScheduleRepeat } : p))}
              sx={{ minWidth: 150 }}
            >
              <MenuItem value="none">Does not repeat</MenuItem>
              <MenuItem value="interval">Every...</MenuItem>
              <MenuItem value="daily">Daily</MenuItem>
              <MenuItem value="weekly">Weekly</MenuItem>
            </TextField>
            {scheduleForm.repeat === "interval" && (
              <>
                <TextField
                  size="small"
                  label="Every"
                  type="number"
                  value={scheduleForm.intervalValue}
                  onChange={(e) => setScheduleForm((p) => (p ? { ...p, intervalValue: e.target.value } : p))}
                  slotProps={{ htmlInput: { min: 1, step: 1 } }}
                  sx={{ width: 90 }}
                />
                <TextField
                  select
                  size="small"
                  label="Unit"
                  value={scheduleForm.intervalUnit}
                  onChange={(e) => setScheduleForm((p) => (p ? { ...p, intervalUnit: e.target.value as "minutes" | "hours" } : p))}
                  sx={{ minWidth: 110 }}
                >
                  <MenuItem value="minutes">minutes</MenuItem>
                  <MenuItem value="hours">hours</MenuItem>
                </TextField>
              </>
            )}
            <TextField
              select
              size="small"
              label="Course (optional)"
              value={scheduleForm.courseId}
              onChange={(e) => setScheduleForm((p) => (p ? { ...p, courseId: e.target.value } : p))}
              sx={{ minWidth: 180 }}
            >
              <MenuItem value="">None</MenuItem>
              {(hubCourses ?? []).map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Institution (optional)"
              value={scheduleForm.institution}
              onChange={(e) => setScheduleForm((p) => (p ? { ...p, institution: e.target.value } : p))}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">None</MenuItem>
              {institutions.map((i) => (
                <MenuItem key={i} value={i}>{i}</MenuItem>
              ))}
            </TextField>
            <Button
              variant="contained"
              size="small"
              disabled={scheduleBusy || !scheduleForm.runAt}
              onClick={() =>
                editingScheduleId
                  ? void onSaveEdit(editingScheduleId)
                  : void onCreate()
              }
            >
              {scheduleBusy ? "Saving..." : editingScheduleId ? "Save changes" : "Save schedule"}
            </Button>
            {editingScheduleId && (
              <Button
                variant="outlined"
                size="small"
                disabled={scheduleBusy}
                onClick={() => {
                  setScheduleForm(null);
                  setEditingScheduleId(null);
                  setScheduleError(null);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
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
