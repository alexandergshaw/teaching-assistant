"use client";

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
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
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormData | null>(null);
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleRemoveConfirm, setScheduleRemoveConfirm] = useState<string | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);

  const [triggers, setTriggers] = useState<WorkflowTrigger[] | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [triggerForm, setTriggerForm] = useState<TriggerFormData | null>(null);
  const [triggerBusy, setTriggerBusy] = useState(false);
  const [triggerRemoveConfirm, setTriggerRemoveConfirm] = useState<string | null>(null);
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null);
  const [webhookSetup, setWebhookSetup] = useState<
    | null
    | { ok: true; org: string; url: string; alreadyExisted: boolean }
    | { ok: false; org: string; url: string; error: string }
  >(null);

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
