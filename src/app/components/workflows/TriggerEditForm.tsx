"use client";

// The trigger create/edit form body, shared by the per-workflow Automate
// panel (TriggerSection) and the Automations hub's inline row editor. Byte-
// identical to what used to live inline in TriggerSection - only the
// enclosing `{triggerForm && (() => {...})()}` guard stayed behind, so
// callers decide when to mount this. The `error` prop is intentionally
// separate from the panel's own error paragraph: TriggerSection passes null
// (keeping its existing external error placement unchanged); the hub's
// inline editor passes its live error so it renders inside the row's editor
// box.

import { Button, MenuItem, TextField, Checkbox, FormControlLabel, Autocomplete } from "@mui/material";
import { MIN_INTERVAL_MINUTES } from "@/lib/workflow-schedules";
import { EVENT_SOURCES, getEventSource, type WorkflowTrigger, type TriggerEventType } from "@/lib/workflow-triggers";
import type { TriggerFormData } from "@/lib/workflow-form-helpers";
import CoursePicker from "../CoursePicker";
import Typeahead from "../ui/Typeahead";
import type { WorkflowDef } from "@/lib/workflows/types";
import styles from "../../page.module.css";

export interface TriggerEditFormProps {
  triggerForm: TriggerFormData;
  setTriggerForm: (form: TriggerFormData | null | ((prev: TriggerFormData | null) => TriggerFormData | null)) => void;
  editingTriggerId: string | null;
  setEditingTriggerId: (id: string | null) => void;
  setTriggerError: (error: string | null) => void;
  triggers: WorkflowTrigger[] | null;
  triggerBusy: boolean;
  error: string | null;
  selectedDef: WorkflowDef | null;
  selectedWorkflowId: string;
  hubCourses: Array<{ id: string; name: string; canvasUrl: string | null; repos: string[] }> | null;
  institutions: string[];
  activeInstitution: string | null;
  isWorkflowHeadlessSafeById: (workflowId: string) => boolean;
  selectedHeadlessSafe: boolean;
  orgs: string[] | null;
  orgsError: string | null;
  workflows: WorkflowDef[];
  onSaveEdit: (triggerId: string) => void;
  onCreate: () => void;
}

export function TriggerEditForm({
  triggerForm,
  setTriggerForm,
  editingTriggerId,
  setEditingTriggerId,
  setTriggerError,
  triggers,
  triggerBusy,
  error,
  selectedDef,
  selectedWorkflowId,
  hubCourses,
  institutions,
  activeInstitution,
  isWorkflowHeadlessSafeById,
  selectedHeadlessSafe,
  orgs,
  orgsError,
  workflows,
  onSaveEdit,
  onCreate,
}: TriggerEditFormProps) {
  const source = getEventSource(triggerForm.eventType);
  const editingTrigger = editingTriggerId ? triggers?.find((t) => t.id === editingTriggerId) : null;
  const editingIsHeadlessSafe = editingTrigger ? isWorkflowHeadlessSafeById(editingTrigger.workflowId) : false;
  const canUnattended = editingTriggerId
    ? editingIsHeadlessSafe && !!source?.serverEvaluable
    : selectedHeadlessSafe && !!source?.serverEvaluable;
  return (
    <div style={{ marginTop: 16, border: "1px solid var(--field-border)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      {editingTriggerId ? (
        <span style={{ fontWeight: 600, fontSize: "0.9em" }}>
          Editing {editingTrigger?.workflowName}&apos;s trigger
        </span>
      ) : (
        <>
          <span style={{ fontWeight: 600, fontSize: "0.9em" }}>Trigger {selectedDef?.name} on an event</span>
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            Uses the run form values as they are right now. Events are checked about every {MIN_INTERVAL_MINUTES} minutes while the app is open; unattended triggers are also checked in the cloud.
          </p>
        </>
      )}
      <TextField
        select
        size="small"
        label="Event"
        value={triggerForm.eventType}
        disabled={editingTrigger?.eventType === "webhook"}
        title={
          editingTrigger?.eventType === "webhook"
            ? "Delete and recreate to change an inbound webhook trigger."
            : undefined
        }
        onChange={(e) =>
          setTriggerForm((p) =>
            p ? { ...p, eventType: e.target.value as TriggerEventType, config: {} } : p
          )
        }
        sx={{ maxWidth: 380 }}
      >
        {editingTrigger?.eventType === "webhook"
          ? EVENT_SOURCES.filter((s) => s.type === "webhook").map((s) => (
              <MenuItem key={s.type} value={s.type}>{s.label}</MenuItem>
            ))
          : editingTrigger !== null
          ? EVENT_SOURCES.filter((s) => s.type !== "webhook").map((s) => (
              <MenuItem key={s.type} value={s.type}>{s.label}</MenuItem>
            ))
          : EVENT_SOURCES.map((s) => (
              <MenuItem key={s.type} value={s.type}>{s.label}</MenuItem>
            ))}
      </TextField>
      {source && (
        <p className={styles.fieldHint} style={{ margin: 0 }}>{source.description}</p>
      )}

      {(source?.configFields ?? []).map((field) => {
        const val = triggerForm.config[field.key] ?? "";
        const setVal = (v: string) =>
          setTriggerForm((p) => (p ? { ...p, config: { ...p.config, [field.key]: v } } : p));
        if (field.type === "boolean") {
          return (
            <FormControlLabel
              key={field.key}
              control={
                <Checkbox size="small" checked={val === "1"} onChange={(e) => setVal(e.target.checked ? "1" : "")} />
              }
              label={field.label}
            />
          );
        }
        if (field.type === "institution") {
          return (
            <TextField key={field.key} select size="small" label={field.label} value={val} onChange={(e) => setVal(e.target.value)} helperText={field.help} sx={{ minWidth: 200 }}>
              <MenuItem value="">{`(active: ${activeInstitution || "none"})`}</MenuItem>
              {institutions.map((i) => (
                <MenuItem key={i} value={i}>{i}</MenuItem>
              ))}
            </TextField>
          );
        }
        if (field.type === "institutions") {
          const all = val.trim() === "*";
          const selected = all
            ? []
            : val.split(",").map((s) => s.trim()).filter(Boolean);
          return (
            <div key={field.key} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 300 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={all}
                    onChange={(e) => setVal(e.target.checked ? "*" : "")}
                  />
                }
                label="All institutions"
              />
              {!all && (
                <Autocomplete
                  multiple
                  size="small"
                  options={institutions}
                  getOptionLabel={(o) => o}
                  value={selected}
                  onChange={(_, v) => setVal(v.join(","))}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={field.label}
                      placeholder={
                        selected.length ? "" : `active: ${activeInstitution || "none"}`
                      }
                    />
                  )}
                />
              )}
              {field.help && (
                <p className={styles.fieldHint} style={{ margin: 0 }}>{field.help}</p>
              )}
            </div>
          );
        }
        if (field.type === "course") {
          return (
            <TextField key={field.key} select size="small" label={field.label} value={val} onChange={(e) => setVal(e.target.value)} helperText={field.help} sx={{ minWidth: 220 }}>
              <MenuItem value="">Select a course</MenuItem>
              {(hubCourses ?? []).map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </TextField>
          );
        }
        if (field.type === "workflow") {
          return (
            <TextField key={field.key} select size="small" label={field.label} value={val} onChange={(e) => setVal(e.target.value)} helperText={field.help} sx={{ minWidth: 240 }}>
              <MenuItem value="">Select a workflow</MenuItem>
              <MenuItem value="*">Any workflow</MenuItem>
              {workflows.filter((w) => w.id !== selectedWorkflowId).map((w) => (
                <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>
              ))}
            </TextField>
          );
        }
        if (field.type === "lmsCourse") {
          if (!activeInstitution) {
            return (
              <TextField
                key={field.key}
                size="small"
                label={field.label}
                value={val}
                onChange={(e) => setVal(e.target.value)}
                helperText={field.help || "Paste the Canvas course URL, e.g. https://<canvas>/courses/12345"}
                sx={{ minWidth: 260 }}
              />
            );
          }
          return (
            <div key={field.key} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 260 }}>
              <span className={styles.fieldHint}>{field.label}</span>
              <CoursePicker
                activeInstitution={activeInstitution}
                courseUrl={val}
                onSelect={(url) => setVal(url)}
              />
              <p className={styles.fieldHint} style={{ margin: 0 }}>
                {field.help || "Paste the Canvas course URL, e.g. https://<canvas>/courses/12345"}
              </p>
            </div>
          );
        }
        if (field.type === "org") {
          return (
            <div key={field.key} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 220 }}>
              <span className={styles.fieldHint}>{field.label}</span>
              <Typeahead
                options={(orgs ?? []).map((o) => ({ value: o, label: o }))}
                value={val}
                onChange={(v) => setVal(v)}
                placeholder={orgs === null ? "Loading organizations..." : "Choose an organization..."}
                loading={orgs === null}
                noOptionsText="No organizations"
              />
              {field.help && (
                <p className={styles.fieldHint} style={{ margin: 0 }}>
                  {field.help}
                </p>
              )}
              {orgsError && <p className={styles.error}>{orgsError}</p>}
            </div>
          );
        }
        return (
          <TextField
            key={field.key}
            size="small"
            type={field.type === "number" ? "number" : "text"}
            label={field.label}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            helperText={field.help}
            sx={{ minWidth: field.type === "number" ? 140 : 260 }}
            {...(field.type === "number" ? { slotProps: { htmlInput: { min: 1, step: 1 } } } : {})}
          />
        );
      })}

      {triggerForm.eventType === "webhook" && (
        <p className={styles.fieldHint} style={{ margin: 0 }}>
          A secret URL is generated on save. POST to it from any external system to run this workflow.
        </p>
      )}

      {canUnattended ? (
        <div>
          <FormControlLabel
            control={
              <Checkbox size="small" checked={triggerForm.unattended} onChange={(e) => setTriggerForm((p) => (p ? { ...p, unattended: e.target.checked } : p))} />
            }
            label="Watch in the cloud (even when the app is closed)"
          />
          <p className={styles.fieldHint} style={{ margin: 0 }}>
            Unattended triggers use the current run-form values and provider snapshot; interactive workflows are not eligible.
          </p>
        </div>
      ) : source && !source.serverEvaluable && triggerForm.eventType !== "webhook" ? (
        <p className={styles.fieldHint} style={{ margin: 0 }}>
          This event only happens in your browser, so its trigger runs while the app is open.
        </p>
      ) : triggerForm.eventType !== "webhook" ? (
        <p className={styles.fieldHint} style={{ margin: 0 }}>
          This workflow pauses for input, so its trigger only runs while the app is open.
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <TextField select size="small" label="Course (optional)" value={triggerForm.courseId} onChange={(e) => setTriggerForm((p) => (p ? { ...p, courseId: e.target.value } : p))} sx={{ minWidth: 180 }}>
          <MenuItem value="">None</MenuItem>
          {(hubCourses ?? []).map((c) => (
            <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Institution (optional)" value={triggerForm.institution} onChange={(e) => setTriggerForm((p) => (p ? { ...p, institution: e.target.value } : p))} sx={{ minWidth: 160 }}>
          <MenuItem value="">None</MenuItem>
          {institutions.map((i) => (
            <MenuItem key={i} value={i}>{i}</MenuItem>
          ))}
        </TextField>
        <Button
          variant="contained"
          size="small"
          disabled={triggerBusy}
          onClick={() =>
            editingTriggerId
              ? void onSaveEdit(editingTriggerId)
              : void onCreate()
          }
        >
          {triggerBusy ? "Saving..." : editingTriggerId ? "Save changes" : "Save trigger"}
        </Button>
        {editingTriggerId && (
          <Button
            variant="outlined"
            size="small"
            disabled={triggerBusy}
            onClick={() => {
              setTriggerForm(null);
              setEditingTriggerId(null);
              setTriggerError(null);
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
