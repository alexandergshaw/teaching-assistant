"use client";

// The schedule create/edit form body, shared by the per-workflow Automate
// panel (ScheduleSection) and the Automations hub's inline row editor. Byte-
// identical to what used to live inline in ScheduleSection - only the
// enclosing `{scheduleForm && (...)}` guard stayed behind, so callers decide
// when to mount this. The `error` prop is intentionally separate from the
// panel's own error paragraph: ScheduleSection passes null (keeping its
// existing external error placement unchanged); the hub's inline editor
// passes its live error so it renders inside the row's editor box.

import { Button, MenuItem, TextField, Checkbox, FormControlLabel } from "@mui/material";
import { MIN_INTERVAL_MINUTES, type WorkflowSchedule, type ScheduleRepeat } from "@/lib/workflow-schedules";
import type { ScheduleFormData } from "@/lib/workflow-form-helpers";
import type { WorkflowDef, RuntimeField } from "@/lib/workflows/types";
import styles from "../../page.module.css";

export interface ScheduleEditFormProps {
  scheduleForm: ScheduleFormData;
  setScheduleForm: (form: ScheduleFormData | null | ((prev: ScheduleFormData | null) => ScheduleFormData | null)) => void;
  editingScheduleId: string | null;
  setEditingScheduleId: (id: string | null) => void;
  setScheduleError: (error: string | null) => void;
  schedules: WorkflowSchedule[] | null;
  scheduleBusy: boolean;
  error: string | null;
  selectedDef: WorkflowDef | null;
  runtimeFields: RuntimeField[];
  hubCourses: Array<{ id: string; name: string; canvasUrl: string | null; repos: string[] }> | null;
  institutions: string[];
  isWorkflowHeadlessSafeById: (workflowId: string) => boolean;
  selectedHeadlessSafe: boolean;
  onSaveEdit: (scheduleId: string) => void;
  onCreate: () => void;
}

export function ScheduleEditForm({
  scheduleForm,
  setScheduleForm,
  editingScheduleId,
  setEditingScheduleId,
  setScheduleError,
  schedules,
  scheduleBusy,
  error,
  selectedDef,
  runtimeFields,
  hubCourses,
  institutions,
  isWorkflowHeadlessSafeById,
  selectedHeadlessSafe,
  onSaveEdit,
  onCreate,
}: ScheduleEditFormProps) {
  return (
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
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}
