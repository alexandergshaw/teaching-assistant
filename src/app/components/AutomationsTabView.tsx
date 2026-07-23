"use client";

import { useSupabase } from "@/context/SupabaseProvider";
import { useAutomationInventory } from "./workflows/useAutomationInventory";
import { AutomationsPanel } from "./workflows/AutomationsPanel";
import { useCallback, useState } from "react";
import { updateWorkflowSchedule } from "@/lib/workflow-schedules";
import { updateWorkflowTrigger, getEventSource } from "@/lib/workflow-triggers";
import {
  scheduleToForm,
  triggerToForm,
  validateScheduleForm,
  validateTriggerForm,
  type ScheduleFormData,
  type TriggerFormData,
} from "@/lib/workflow-form-helpers";
import { isHeadlessSafeWorkflow } from "@/lib/workflows/headless";
import { useInstitutionSelection } from "@/lib/institutions";
import { scheduleRowKey, triggerRowKey } from "./workflows/automation-inventory-logic";
import type { WorkflowSchedule } from "@/lib/workflow-schedules";
import type { WorkflowTrigger } from "@/lib/workflow-triggers";
import TabShell from "./TabShell";
import styles from "../page.module.css";

interface AutomationsTabViewProps {
  onOpenWorkflow: (id: string, panel: "automate") => void;
}

export default function AutomationsTabView({ onOpenWorkflow }: AutomationsTabViewProps) {
  const { user, supabase } = useSupabase();
  const { workflows, schedules, triggers, loading, error, setSchedules, setTriggers, hubCourses, orgs, orgsError } = useAutomationInventory(user, supabase, true);
  const { institutions, active: activeInstitution } = useInstitutionSelection();
  const [toggleError, setToggleError] = useState<string | null>(null);

  // Whether a workflow (by id) is eligible for the "run unattended" opt-in -
  // every expanded step must be headless-safe (workflows/headless.ts). Mirrors
  // WorkflowsTab's isWorkflowHeadlessSafeById so the hub's inline editors gate
  // unattended the same way the per-workflow Automate panel does.
  const isWorkflowHeadlessSafeById = useCallback(
    (id: string) => {
      const w = workflows.find((wf) => wf.id === id);
      return w ? isHeadlessSafeWorkflow(w, (depId) => workflows.find((wf) => wf.id === depId)) : false;
    },
    [workflows]
  );

  const handleToggleSchedule = useCallback(
    async (schedule: WorkflowSchedule) => {
      if (!user || !supabase || !schedules) return;
      const original = schedules;
      setToggleError(null);
      try {
        const updated = schedules.map((s) => (s.id === schedule.id ? { ...s, enabled: !s.enabled } : s));
        setSchedules(updated);
        await updateWorkflowSchedule(supabase, user.id, schedule.id, {
          enabled: !schedule.enabled,
        });
      } catch (err) {
        setSchedules(original);
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        setToggleError(`Could not update ${schedule.workflowName}: ${errorMsg}`);
        console.error("Failed to toggle schedule:", err);
      }
    },
    [user, supabase, schedules, setSchedules]
  );

  const handleToggleTrigger = useCallback(
    async (trigger: WorkflowTrigger) => {
      if (!user || !supabase || !triggers) return;
      const original = triggers;
      setToggleError(null);
      try {
        const updated = triggers.map((t) => (t.id === trigger.id ? { ...t, enabled: !t.enabled } : t));
        setTriggers(updated);
        await updateWorkflowTrigger(supabase, user.id, trigger.id, {
          enabled: !trigger.enabled,
        });
      } catch (err) {
        setTriggers(original);
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        setToggleError(`Could not update ${trigger.workflowName}: ${errorMsg}`);
        console.error("Failed to toggle trigger:", err);
      }
    },
    [user, supabase, triggers, setTriggers]
  );

  // Per-row expansion (view-all-details disclosure) and the single inline
  // editor open at a time across the panel - a focused session, not persisted
  // (see AutomationRow/AutomationsPanel).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [scheduleEditForm, setScheduleEditForm] = useState<ScheduleFormData | null>(null);
  const [triggerEditForm, setTriggerEditForm] = useState<TriggerFormData | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const toggleExpanded = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingKey(null);
    setScheduleEditForm(null);
    setTriggerEditForm(null);
    setEditError(null);
  }, []);

  const startEditSchedule = useCallback((s: WorkflowSchedule) => {
    const key = scheduleRowKey(s.id);
    setEditingKey(key);
    setScheduleEditForm(scheduleToForm(s));
    setEditError(null);
    setExpanded((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);

  const startEditTrigger = useCallback((t: WorkflowTrigger) => {
    const key = triggerRowKey(t.id);
    setEditingKey(key);
    setTriggerEditForm(triggerToForm(t));
    setEditError(null);
    setExpanded((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);

  // Save an inline-edited schedule: validate via the SAME shared validator the
  // per-workflow Automate panel uses, then optimistically update the
  // inventory and persist, rolling back with an inline error on failure - the
  // hub's established toggle idiom (handleToggleSchedule above).
  const handleSaveScheduleEdit = useCallback(
    async (scheduleId: string) => {
      if (!user || !supabase || !schedules || !scheduleEditForm) return;
      const validation = validateScheduleForm(scheduleEditForm);
      if (!validation.ok) {
        setEditError(validation.error);
        return;
      }
      const editingSchedule = schedules.find((s) => s.id === scheduleId);
      if (!editingSchedule) return;
      const editingIsHeadlessSafe = isWorkflowHeadlessSafeById(editingSchedule.workflowId);
      const { intervalMinutes } = validation;
      const runAt = new Date(scheduleEditForm.runAt);
      const original = schedules;
      setEditBusy(true);
      setEditError(null);
      try {
        const patch = {
          nextRunAt: runAt.toISOString(),
          repeat: scheduleEditForm.repeat,
          intervalMinutes: scheduleEditForm.repeat === "interval" ? intervalMinutes : null,
          courseId: scheduleEditForm.courseId || null,
          institution: scheduleEditForm.institution || null,
          unattended: editingIsHeadlessSafe && scheduleEditForm.unattended,
        };
        setSchedules(original.map((s) => (s.id === scheduleId ? { ...s, ...patch } : s)));
        await updateWorkflowSchedule(supabase, user.id, scheduleId, patch);
        cancelEdit();
      } catch (err) {
        setSchedules(original);
        setEditError(err instanceof Error ? err.message : "Could not save the schedule.");
      } finally {
        setEditBusy(false);
      }
    },
    [user, supabase, schedules, scheduleEditForm, isWorkflowHeadlessSafeById, setSchedules, cancelEdit]
  );

  // Save an inline-edited trigger: same shape as handleSaveScheduleEdit,
  // sharing validateTriggerForm with the per-workflow Automate panel.
  const handleSaveTriggerEdit = useCallback(
    async (triggerId: string) => {
      if (!user || !supabase || !triggers || !triggerEditForm) return;
      const editingTrigger = triggers.find((t) => t.id === triggerId);
      if (!editingTrigger) return;
      const workflowDef = workflows.find((w) => w.id === editingTrigger.workflowId);
      const validation = validateTriggerForm(triggerEditForm, workflowDef);
      if (!validation.ok) {
        setEditError(validation.error);
        return;
      }
      const source = getEventSource(triggerEditForm.eventType);
      if (!source) {
        setEditError("Pick an event.");
        return;
      }
      const editingIsHeadlessSafe = isWorkflowHeadlessSafeById(editingTrigger.workflowId);
      const original = triggers;
      setEditBusy(true);
      setEditError(null);
      try {
        const patch = {
          eventType: triggerEditForm.eventType,
          eventConfig: validation.eventConfig,
          courseId: triggerEditForm.courseId || null,
          institution: triggerEditForm.institution || null,
          unattended: editingIsHeadlessSafe && source.serverEvaluable && triggerEditForm.unattended,
          cursor: null,
        };
        setTriggers(original.map((t) => (t.id === triggerId ? { ...t, ...patch } : t)));
        await updateWorkflowTrigger(supabase, user.id, triggerId, patch);
        cancelEdit();
      } catch (err) {
        setTriggers(original);
        setEditError(err instanceof Error ? err.message : "Could not save the trigger.");
      } finally {
        setEditBusy(false);
      }
    },
    [user, supabase, triggers, triggerEditForm, workflows, isWorkflowHeadlessSafeById, setTriggers, cancelEdit]
  );

  if (loading) {
    return <div style={{ padding: 20 }}>Loading automations...</div>;
  }

  if (error) {
    return <div style={{ padding: 20, color: "var(--danger)" }}>Error: {error}</div>;
  }

  return (
    <TabShell>
      {toggleError && (
        <p className={styles.error} style={{ marginBottom: 16 }}>
          {toggleError}
        </p>
      )}
      <AutomationsPanel
        workflows={workflows}
        schedules={schedules}
        triggers={triggers}
        onSelectWorkflow={onOpenWorkflow}
        onToggleSchedule={handleToggleSchedule}
        onToggleTrigger={handleToggleTrigger}
        hubCourses={hubCourses}
        institutions={institutions}
        activeInstitution={activeInstitution}
        orgs={orgs}
        orgsError={orgsError}
        isWorkflowHeadlessSafeById={isWorkflowHeadlessSafeById}
        expanded={expanded}
        onToggleExpanded={toggleExpanded}
        editingKey={editingKey}
        scheduleEditForm={scheduleEditForm}
        setScheduleEditForm={setScheduleEditForm}
        triggerEditForm={triggerEditForm}
        setTriggerEditForm={setTriggerEditForm}
        editBusy={editBusy}
        editError={editError}
        onStartEditSchedule={startEditSchedule}
        onStartEditTrigger={startEditTrigger}
        onSaveScheduleEdit={handleSaveScheduleEdit}
        onSaveTriggerEdit={handleSaveTriggerEdit}
        onCancelEdit={cancelEdit}
      />
    </TabShell>
  );
}
