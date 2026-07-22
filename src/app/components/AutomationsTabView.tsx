"use client";

import { useSupabase } from "@/context/SupabaseProvider";
import { useAutomationInventory } from "./workflows/useAutomationInventory";
import { AutomationsPanel } from "./workflows/AutomationsPanel";
import { useCallback, useState } from "react";
import { updateWorkflowSchedule } from "@/lib/workflow-schedules";
import { updateWorkflowTrigger } from "@/lib/workflow-triggers";
import type { WorkflowSchedule } from "@/lib/workflow-schedules";
import type { WorkflowTrigger } from "@/lib/workflow-triggers";
import styles from "../page.module.css";

interface AutomationsTabViewProps {
  onOpenWorkflow: (id: string, panel: "automate") => void;
}

export default function AutomationsTabView({ onOpenWorkflow }: AutomationsTabViewProps) {
  const { user, supabase } = useSupabase();
  const { workflows, schedules, triggers, loading, error, setSchedules, setTriggers } = useAutomationInventory(user, supabase, true);
  const [toggleError, setToggleError] = useState<string | null>(null);

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

  if (loading) {
    return <div style={{ padding: 20 }}>Loading automations...</div>;
  }

  if (error) {
    return <div style={{ padding: 20, color: "var(--danger)" }}>Error: {error}</div>;
  }

  return (
    <div style={{ padding: 20 }}>
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
      />
    </div>
  );
}
