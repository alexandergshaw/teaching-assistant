"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { getStoredProvider } from "@/lib/llm-provider";
import { registerOrgPushWebhookAction } from "@/app/actions";
import {
  listWorkflowSchedules,
  createWorkflowSchedule,
  updateWorkflowSchedule,
  deleteWorkflowSchedule,
  reenableSchedule,
  type WorkflowSchedule,
} from "@/lib/workflow-schedules";
import {
  listWorkflowTriggers,
  createWorkflowTrigger,
  updateWorkflowTrigger,
  deleteWorkflowTrigger,
  generateWebhookToken,
  getEventSource,
  type WorkflowTrigger,
} from "@/lib/workflow-triggers";
import {
  validateScheduleForm,
  validateTriggerForm,
  resolveScheduleDays,
  parseScheduleDraft,
  parseTriggerDraft,
  type ScheduleFormData,
  type TriggerFormData,
} from "@/lib/workflow-form-helpers";
import type { WorkflowDef } from "@/lib/workflows/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

export interface UseAutomationReturn {
  schedules: WorkflowSchedule[] | null;
  setSchedules: Dispatch<SetStateAction<WorkflowSchedule[] | null>>;
  scheduleError: string | null;
  setScheduleError: (error: string | null) => void;
  scheduleForm: ScheduleFormData | null;
  setScheduleForm: Dispatch<SetStateAction<ScheduleFormData | null>>;
  scheduleBusy: boolean;
  scheduleRemoveConfirm: string | null;
  setScheduleRemoveConfirm: (id: string | null) => void;
  editingScheduleId: string | null;
  setEditingScheduleId: (id: string | null) => void;
  triggers: WorkflowTrigger[] | null;
  setTriggers: Dispatch<SetStateAction<WorkflowTrigger[] | null>>;
  triggerError: string | null;
  setTriggerError: (error: string | null) => void;
  triggerForm: TriggerFormData | null;
  setTriggerForm: Dispatch<SetStateAction<TriggerFormData | null>>;
  triggerBusy: boolean;
  triggerRemoveConfirm: string | null;
  setTriggerRemoveConfirm: (id: string | null) => void;
  editingTriggerId: string | null;
  setEditingTriggerId: (id: string | null) => void;
  webhookSetup: null | { ok: true; org: string; url: string; alreadyExisted: boolean } | { ok: false; org: string; url: string; error: string };
  setWebhookSetup: (setup: null | { ok: true; org: string; url: string; alreadyExisted: boolean } | { ok: false; org: string; url: string; error: string }) => void;
  automationByWorkflow: Map<string, { scheduled: boolean; triggered: boolean; scheduleCount: number; triggerCount: number }>;
  validateScheduleForm: (form: ScheduleFormData | null) => { ok: true; intervalMinutes: number | null } | { ok: false; error: string };
  handleCreateSchedule: () => Promise<void>;
  handleSaveEditSchedule: (scheduleId: string) => Promise<void>;
  handleToggleSchedule: (s: WorkflowSchedule) => Promise<void>;
  handleDeleteSchedule: (id: string) => Promise<void>;
  validateTriggerForm: (form: TriggerFormData | null, workflowDef: WorkflowDef | undefined) => { ok: true; eventConfig: Record<string, string> } | { ok: false; error: string };
  maybeRegisterRepoPushWebhook: (form: TriggerFormData | null) => void;
  handleCreateTrigger: () => Promise<void>;
  handleSaveEditTrigger: (triggerId: string) => Promise<void>;
  handleToggleTrigger: (t: WorkflowTrigger) => Promise<void>;
  handleDeleteTrigger: (id: string) => Promise<void>;
  webhookBaseUrl: string;
}

export function useAutomation(
  user: User | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any> | null,
  selectedDef: WorkflowDef | undefined,
  values: Record<string, string>,
  disabledSteps: Set<number>,
  selectedHeadlessSafe: boolean,
  isWorkflowHeadlessSafeById: (id: string) => boolean
): UseAutomationReturn {
  const [schedules, setSchedules] = useState<WorkflowSchedule[] | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  // Seeded once from any persisted draft (ta-workflow-schedule-draft-<id>) so
  // an in-progress "Schedule..." form survives a reload, matching the
  // ta-workflow-values-<id> pattern the run form already uses. See the
  // draft-persistence effects below for how this is written back out.
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormData | null>(() => {
    if (typeof window === "undefined" || !selectedDef) return null;
    return parseScheduleDraft(localStorage.getItem(`ta-workflow-schedule-draft-${selectedDef.id}`));
  });
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleRemoveConfirm, setScheduleRemoveConfirm] = useState<string | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);

  const [triggers, setTriggers] = useState<WorkflowTrigger[] | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  // Same draft-persistence seeding as scheduleForm above, keyed under
  // ta-workflow-trigger-draft-<id>.
  const [triggerForm, setTriggerForm] = useState<TriggerFormData | null>(() => {
    if (typeof window === "undefined" || !selectedDef) return null;
    return parseTriggerDraft(localStorage.getItem(`ta-workflow-trigger-draft-${selectedDef.id}`));
  });
  const [triggerBusy, setTriggerBusy] = useState(false);
  const [triggerRemoveConfirm, setTriggerRemoveConfirm] = useState<string | null>(null);
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null);
  const [webhookSetup, setWebhookSetup] = useState<
    | null
    | { ok: true; org: string; url: string; alreadyExisted: boolean }
    | { ok: false; org: string; url: string; error: string }
  >(null);

  // The workflow id the draft-persistence write effects below persist
  // scheduleForm/triggerForm under. Also the trigger, via this same effect,
  // for reseeding those two forms (and clearing any open "Edit" state)
  // whenever the SELECTED WORKFLOW ITSELF changes - not on every render
  // where `selectedDef` merely gets a new object identity (the dependency
  // below is the id string, not the object).
  //
  // Retargeting the ref and reseeding the forms happen in this ONE effect,
  // atomically, rather than in two separate effects. That is what prevents a
  // workflow switch from ever writing one workflow's draft under another's
  // key: the write effects further below fire only when scheduleForm/
  // triggerForm actually change, and by the time they run, selectedDefIdRef.
  // current has already been retargeted to the NEW workflow inside this same
  // effect body - so a write effect can never fire with the ref still
  // pointing at the OLD workflow while the form holds the NEW one's draft
  // (or vice versa). Before this effect existed, scheduleForm/triggerForm
  // were never reset on a workflow switch at all: switching workflows left
  // the previous workflow's half-filled form on screen, and the next
  // keystroke then wrote it under the newly-selected workflow's storage key,
  // corrupting it.
  //
  // This intentionally discards ANY in-progress form on a switch, including
  // one loaded via a real "Edit" click (setScheduleForm(scheduleToForm(s))):
  // an in-progress form for a DIFFERENT workflow than the one now selected
  // has nowhere correct to go. AC3 is unaffected by that: this effect's
  // dependency is selectedDef?.id alone, never scheduleForm/triggerForm, so
  // loading a real schedule/trigger for editing WITHOUT switching workflows
  // never re-enters here and can never be clobbered by a re-parsed draft -
  // see the structural guard in automation-draft-persistence.test.ts, which
  // now also asserts this effect's dependency excludes scheduleForm/
  // triggerForm.
  //
  // setState is only reached after the awaited microtask below, never
  // synchronously from the effect body itself (react-hooks/set-state-in-effect;
  // same cancelled-flag + await Promise.resolve() idiom as WorkflowsTab.tsx's
  // selection-reconciliation effect).
  const selectedDefIdRef = useRef<string | undefined>(selectedDef?.id);
  useEffect(() => {
    const id = selectedDef?.id;
    // Initial mount: scheduleForm/triggerForm were already seeded for this
    // exact id by the useState initializers above - nothing to reseed.
    if (selectedDefIdRef.current === id) return;
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      selectedDefIdRef.current = id;
      setScheduleForm(
        typeof window === "undefined" || !id
          ? null
          : parseScheduleDraft(localStorage.getItem(`ta-workflow-schedule-draft-${id}`))
      );
      setTriggerForm(
        typeof window === "undefined" || !id
          ? null
          : parseTriggerDraft(localStorage.getItem(`ta-workflow-trigger-draft-${id}`))
      );
      setEditingScheduleId(null);
      setEditingTriggerId(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDef?.id]);

  // Persist the Schedule form draft per workflow id (ta-workflow-schedule-
  // draft-<id>), mirroring ta-workflow-values-<id>. The stored draft is read
  // in two places only: scheduleForm's useState initializer above (mount),
  // and the reseed effect immediately above (an actual workflow switch) -
  // never by an effect keyed on scheduleForm itself. That is what guarantees
  // a real saved schedule's values can never be clobbered by a stale draft
  // (AC3): ScheduleSection's "Edit" button loads a real schedule via a plain
  // setScheduleForm(scheduleToForm(s)) call while staying on the SAME
  // workflow, which does not touch selectedDefIdRef and so cannot retrigger
  // the reseed effect - nothing here ever competes with it. This effect only
  // ever writes whatever scheduleForm currently holds (including those real
  // edited values) back out, under whichever workflow selectedDefIdRef.
  // current currently names (kept correct by the reseed effect above).
  // Clearing the form - after a successful create/save
  // (handleCreateSchedule/handleSaveEditSchedule already call
  // setScheduleForm(null)) or an explicit Cancel - removes the stored draft
  // in this same effect, so a stale draft cannot resurrect after the thing it
  // drafted was created (AC4).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = selectedDefIdRef.current;
    if (!id) return;
    const key = `ta-workflow-schedule-draft-${id}`;
    try {
      if (scheduleForm) {
        localStorage.setItem(key, JSON.stringify(scheduleForm));
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // ignore storage write/removal failures
    }
  }, [scheduleForm]);

  // Persist the Trigger form draft per workflow id (ta-workflow-trigger-
  // draft-<id>). Mirrors the schedule draft effect immediately above exactly
  // - see its comment for the AC3/AC4 reasoning.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = selectedDefIdRef.current;
    if (!id) return;
    const key = `ta-workflow-trigger-draft-${id}`;
    try {
      if (triggerForm) {
        localStorage.setItem(key, JSON.stringify(triggerForm));
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // ignore storage write/removal failures
    }
  }, [triggerForm]);

  // Load the user's scheduled runs once per mount. The signed-out reset also
  // happens after an await so no setState is reached synchronously from the
  // effect (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        await Promise.resolve();
        if (!cancelled) setSchedules([]);
        return;
      }
      try {
        const rows = await listWorkflowSchedules(supabase!, user.id);
        if (!cancelled) {
          setSchedules(rows);
          setScheduleError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setScheduleError(err instanceof Error ? err.message : "Could not load schedules.");
          setSchedules([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  // Load the user's event triggers once per mount (mirrors the schedule load).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        await Promise.resolve();
        if (!cancelled) setTriggers([]);
        return;
      }
      try {
        const rows = await listWorkflowTriggers(supabase!, user.id);
        if (!cancelled) {
          setTriggers(rows);
          setTriggerError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setTriggerError(err instanceof Error ? err.message : "Could not load triggers.");
          setTriggers([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  // Per-workflow map of enabled automation (schedules and triggers) for use in
  // the sidebar dots and the Automate panel overview.
  const automationByWorkflow = useMemo(() => {
    const map = new Map<string, { scheduled: boolean; triggered: boolean; scheduleCount: number; triggerCount: number }>();
    const ensure = (id: string) => {
      let e = map.get(id);
      if (!e) { e = { scheduled: false, triggered: false, scheduleCount: 0, triggerCount: 0 }; map.set(id, e); }
      return e;
    };
    for (const s of schedules ?? []) { if (s.enabled) { const e = ensure(s.workflowId); e.scheduled = true; e.scheduleCount++; } }
    for (const t of triggers ?? []) { if (t.enabled) { const e = ensure(t.workflowId); e.triggered = true; e.triggerCount++; } }
    return map;
  }, [schedules, triggers]);

  // Create a schedule for the selected workflow from the current form values.
  const handleCreateSchedule = async () => {
    if (!user || !selectedDef || !scheduleForm) return;
    const validation = validateScheduleForm(scheduleForm);
    if (!validation.ok) {
      setScheduleError(validation.error);
      return;
    }
    const { intervalMinutes } = validation;
    const runAt = new Date(scheduleForm.runAt);
    // Only weekly schedules use a day-of-week selection; other repeats
    // persist [] (WorkflowSchedule.daysOfWeek's "unchanged behaviour"
    // sentinel). resolveScheduleDays falls back to the day implied by the
    // chosen first-run date if the picker was somehow left empty.
    const daysOfWeek = scheduleForm.repeat === "weekly" ? resolveScheduleDays(scheduleForm) : [];
    setScheduleBusy(true);
    setScheduleError(null);
    try {
      const created = await createWorkflowSchedule(supabase!, user.id, {
        workflowId: selectedDef.id,
        workflowName: selectedDef.name,
        fieldValues: values,
        nextRunAt: runAt.toISOString(),
        repeat: scheduleForm.repeat,
        intervalMinutes,
        courseId: scheduleForm.courseId || null,
        institution: scheduleForm.institution || null,
        unattended: selectedHeadlessSafe && scheduleForm.unattended,
        provider: getStoredProvider(),
        disabledSteps: Array.from(disabledSteps),
        daysOfWeek,
      });
      setSchedules((prev) =>
        [...(prev ?? []), created].sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt))
      );
      setScheduleForm(null);
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Could not save the schedule.");
    } finally {
      setScheduleBusy(false);
    }
  };

  // Save changes to an existing schedule.
  const handleSaveEditSchedule = async (scheduleId: string) => {
    if (!user || !scheduleForm) return;
    const editingSchedule = schedules?.find((s) => s.id === scheduleId);
    if (!editingSchedule) return;
    const editingIsHeadlessSafe = isWorkflowHeadlessSafeById(editingSchedule.workflowId);
    const validation = validateScheduleForm(scheduleForm);
    if (!validation.ok) {
      setScheduleError(validation.error);
      return;
    }
    const { intervalMinutes } = validation;
    const runAt = new Date(scheduleForm.runAt);
    const daysOfWeek = scheduleForm.repeat === "weekly" ? resolveScheduleDays(scheduleForm) : [];
    setScheduleBusy(true);
    setScheduleError(null);
    try {
      await updateWorkflowSchedule(supabase!, user.id, scheduleId, {
        nextRunAt: runAt.toISOString(),
        repeat: scheduleForm.repeat,
        intervalMinutes: scheduleForm.repeat === "interval" ? intervalMinutes : null,
        courseId: scheduleForm.courseId || null,
        institution: scheduleForm.institution || null,
        unattended: editingIsHeadlessSafe && scheduleForm.unattended,
        daysOfWeek,
      });
      setSchedules((prev) =>
        (prev ?? [])
          .map((s) =>
            s.id === scheduleId
              ? {
                  ...s,
                  nextRunAt: runAt.toISOString(),
                  repeat: scheduleForm.repeat,
                  intervalMinutes: scheduleForm.repeat === "interval" ? intervalMinutes : null,
                  courseId: scheduleForm.courseId || null,
                  institution: scheduleForm.institution || null,
                  unattended: editingIsHeadlessSafe && scheduleForm.unattended,
                  daysOfWeek,
                }
              : s
          )
          .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt))
      );
      setScheduleForm(null);
      setEditingScheduleId(null);
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Could not save the schedule.");
    } finally {
      setScheduleBusy(false);
    }
  };

  const handleToggleSchedule = async (s: WorkflowSchedule) => {
    if (!user) return;
    let nextRunAt: string | undefined;
    if (!s.enabled) {
      const rearm = reenableSchedule(s);
      if (!rearm.ok) {
        setScheduleError("That one-time schedule is in the past - create a new one instead.");
        return;
      }
      nextRunAt = rearm.nextRunAt;
    }
    try {
      await updateWorkflowSchedule(supabase!, user.id, s.id, {
        enabled: !s.enabled,
        ...(nextRunAt ? { nextRunAt } : {}),
      });
      setSchedules((prev) =>
        (prev ?? []).map((x) =>
          x.id === s.id ? { ...x, enabled: !s.enabled, nextRunAt: nextRunAt ?? x.nextRunAt } : x
        )
      );
      setScheduleError(null);
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Could not update the schedule.");
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!user) return;
    try {
      await deleteWorkflowSchedule(supabase!, user.id, id);
      setSchedules((prev) => (prev ?? []).filter((x) => x.id !== id));
      setScheduleRemoveConfirm(null);
      setScheduleError(null);
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : "Could not delete the schedule.");
    }
  };

  // Create an event trigger for the selected workflow from the current form
  // values. Mirrors handleCreateSchedule's snapshot of values/provider/
  // disabledSteps; the event source and its config decide when it fires.
  // Attempt to register a webhook for repo-push triggers if org is configured.
  const maybeRegisterRepoPushWebhook = (form: typeof triggerForm) => {
    if (!form || form.eventType !== "repo-push") return;
    const hookOrg = (form.config.org ?? "").trim();
    if (!hookOrg) return;
    void registerOrgPushWebhookAction(hookOrg)
      .then((res) => {
        setWebhookSetup(
          res.ok
            ? { ok: true, org: hookOrg, url: res.url, alreadyExisted: res.alreadyExisted }
            : { ok: false, org: hookOrg, url: res.url, error: res.error }
        );
      })
      .catch(() => {
        /* best-effort: the ~15-min poller still fires the trigger */
      });
  };

  const handleCreateTrigger = async () => {
    if (!user || !selectedDef || !triggerForm) return;
    const validation = validateTriggerForm(triggerForm, selectedDef);
    if (!validation.ok) {
      setTriggerError(validation.error);
      return;
    }
    const { eventConfig } = validation;
    const source = getEventSource(triggerForm.eventType);
    if (!source) {
      setTriggerError("Pick an event.");
      return;
    }
    setTriggerBusy(true);
    setTriggerError(null);
    try {
      const created = await createWorkflowTrigger(supabase!, user.id, {
        workflowId: selectedDef.id,
        workflowName: selectedDef.name,
        fieldValues: values,
        eventType: triggerForm.eventType,
        eventConfig,
        unattended: selectedHeadlessSafe && source.serverEvaluable && triggerForm.unattended,
        provider: getStoredProvider(),
        disabledSteps: Array.from(disabledSteps),
        courseId: triggerForm.courseId || null,
        institution: triggerForm.institution || null,
        webhookToken: triggerForm.eventType === "webhook" ? generateWebhookToken() : null,
      });
      setTriggers((prev) => [created, ...(prev ?? [])]);
      maybeRegisterRepoPushWebhook(triggerForm);
      setTriggerForm(null);
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : "Could not save the trigger.");
    } finally {
      setTriggerBusy(false);
    }
  };

  // Save changes to an existing trigger.
  const handleSaveEditTrigger = async (triggerId: string) => {
    if (!user || !triggerForm) return;
    const editingTrigger = triggers?.find((t) => t.id === triggerId);
    if (!editingTrigger) return;
    const validation = validateTriggerForm(triggerForm, selectedDef);
    if (!validation.ok) {
      setTriggerError(validation.error);
      return;
    }
    const { eventConfig } = validation;
    const source = getEventSource(triggerForm.eventType);
    if (!source) {
      setTriggerError("Pick an event.");
      return;
    }
    setTriggerBusy(true);
    setTriggerError(null);
    try {
      await updateWorkflowTrigger(supabase!, user.id, triggerId, {
        eventType: triggerForm.eventType,
        eventConfig,
        courseId: triggerForm.courseId || null,
        institution: triggerForm.institution || null,
        unattended: selectedHeadlessSafe && source.serverEvaluable && triggerForm.unattended,
        cursor: null,
      });
      setTriggers((prev) =>
        (prev ?? []).map((t) =>
          t.id === triggerId
            ? {
                ...t,
                eventType: triggerForm.eventType,
                eventConfig,
                courseId: triggerForm.courseId || null,
                institution: triggerForm.institution || null,
                unattended: selectedHeadlessSafe && source.serverEvaluable && triggerForm.unattended,
                cursor: null,
              }
            : t
        )
      );
      maybeRegisterRepoPushWebhook(triggerForm);
      setTriggerForm(null);
      setEditingTriggerId(null);
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : "Could not save the trigger.");
    } finally {
      setTriggerBusy(false);
    }
  };

  const handleToggleTrigger = async (t: WorkflowTrigger) => {
    if (!user) return;
    try {
      await updateWorkflowTrigger(supabase!, user.id, t.id, { enabled: !t.enabled });
      setTriggers((prev) =>
        (prev ?? []).map((x) => (x.id === t.id ? { ...x, enabled: !t.enabled } : x))
      );
      setTriggerError(null);
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : "Could not update the trigger.");
    }
  };

  const handleDeleteTrigger = async (id: string) => {
    if (!user) return;
    try {
      await deleteWorkflowTrigger(supabase!, user.id, id);
      setTriggers((prev) => (prev ?? []).filter((x) => x.id !== id));
      setTriggerRemoveConfirm(null);
      setTriggerError(null);
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : "Could not delete the trigger.");
    }
  };

  // The webhook base URL shown next to a webhook trigger. Read at render on the
  // client so it reflects wherever the app is actually served from.
  const webhookBaseUrl =
    typeof window !== "undefined" ? window.location.origin : "";

  return {
    schedules,
    setSchedules,
    scheduleError,
    setScheduleError,
    scheduleForm,
    setScheduleForm,
    scheduleBusy,
    scheduleRemoveConfirm,
    setScheduleRemoveConfirm,
    editingScheduleId,
    setEditingScheduleId,
    triggers,
    setTriggers,
    triggerError,
    setTriggerError,
    triggerForm,
    setTriggerForm,
    triggerBusy,
    triggerRemoveConfirm,
    setTriggerRemoveConfirm,
    editingTriggerId,
    setEditingTriggerId,
    webhookSetup,
    setWebhookSetup,
    automationByWorkflow,
    validateScheduleForm,
    handleCreateSchedule,
    handleSaveEditSchedule,
    handleToggleSchedule,
    handleDeleteSchedule,
    validateTriggerForm,
    maybeRegisterRepoPushWebhook,
    handleCreateTrigger,
    handleSaveEditTrigger,
    handleToggleTrigger,
    handleDeleteTrigger,
    webhookBaseUrl,
  };
}
