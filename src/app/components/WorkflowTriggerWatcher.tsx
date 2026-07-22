"use client";

import { useEffect, useRef } from "react";
import { useSupabase } from "@/context/SupabaseProvider";
import {
  listWorkflowTriggers,
  isTriggerDueForCheck,
  evaluateTrigger,
  claimAndAdvanceTrigger,
  lifecycleCooldownElapsed,
  type TriggerEvalResult,
} from "@/lib/workflow-triggers";
import { latestWorkflowRun, runsSinceForWorkflow, latestRunAnyWorkflow, runsSinceAnyWorkflow } from "@/lib/workflow-runs";
import { enqueueScheduledRun } from "@/lib/workflow-schedule-handoff";
import { readActiveInstitution } from "@/lib/institutions";
import { CARTRIDGE_DROP_UPLOADED_EVENT } from "@/lib/cartridge-drops";

// How often to look for due triggers while the app is open.
const CHECK_INTERVAL_MS = 60 * 1000;
// A burst of window "focus" events (e.g. alt-tabbing quickly) should not fan out
// a DB query each time; only re-check app-focused triggers this often at most.
const FOCUS_THROTTLE_MS = 10 * 1000;

/**
 * Headless page-level watcher for event-triggered workflow runs. Roughly once
 * a minute it evaluates the earliest due trigger's event source and, on an
 * optimistic-lock claim (an atomic conditional update, so concurrent tabs
 * cannot double-fire), hands a fired trigger to the Workflows tab via the
 * scheduled-run queue; `onRunScheduled` lets the page switch tabs so the run
 * (and any mid-run pauses) is visible.
 */
export default function WorkflowTriggerWatcher({
  onRunScheduled,
}: {
  onRunScheduled: () => void;
}) {
  const { supabase, user } = useSupabase();
  // Serialize checks: a slow network response must not overlap the next tick.
  const checkingRef = useRef(false);
  // Wall-clock of the last app-focused sweep, to throttle rapid focus bursts.
  const lastFocusFireRef = useRef(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    // Fire browser-lifecycle triggers (app-open, app-focused): they have no
    // polled condition, so the event itself is the trigger. The cooldown skips
    // a reload / extra tab / rapid tab-switch, and the check_version claim keeps
    // two tabs from double-firing the same occurrence.
    const fireLifecycle = async (kind: "app-open" | "app-focused") => {
      try {
        const triggers = await listWorkflowTriggers(supabase, user.id);
        const now = new Date();
        const matches = triggers.filter(
          (t) => t.enabled && t.eventType === kind && lifecycleCooldownElapsed(t, now.getTime())
        );
        for (const trigger of matches) {
          if (cancelled) return;
          const result: TriggerEvalResult = {
            fired: true,
            cursor: { firedAt: now.toISOString() },
            detail: `Fired on ${kind}.`,
          };
          const claimed = await claimAndAdvanceTrigger(supabase, trigger, result, now);
          if (!claimed || cancelled) continue;
          enqueueScheduledRun({
            scheduleId: null,
            triggerId: trigger.id,
            workflowId: trigger.workflowId,
            workflowName: trigger.workflowName,
            fieldValues: { ...trigger.fieldValues },
          });
          onRunScheduled();
        }
      } catch (err) {
        console.error("[workflow-triggers] lifecycle fire failed:", err);
      }
    };

    const onFocus = () => {
      const nowMs = Date.now();
      if (nowMs - lastFocusFireRef.current < FOCUS_THROTTLE_MS) return;
      lastFocusFireRef.current = nowMs;
      void fireLifecycle("app-focused");
    };

    const onCartridgeDropped = async () => {
      try {
        const triggers = await listWorkflowTriggers(supabase, user.id);
        const now = new Date();
        const matches = triggers.filter((t) => t.enabled && t.eventType === "cartridge-uploaded");
        for (const trigger of matches) {
          if (cancelled) return;
          const activeInstitution = readActiveInstitution() || null;
          const result = await evaluateTrigger(trigger, {
            activeInstitution,
            latestRun: (workflowId) => latestWorkflowRun(supabase, user.id, workflowId),
            runsSince: (workflowId, sinceIso) => runsSinceForWorkflow(supabase, user.id, workflowId, sinceIso),
            excludeWorkflowId: trigger.workflowId,
            latestRunAny: (excludeId) => latestRunAnyWorkflow(supabase, user.id, excludeId),
            runsSinceAny: (sinceIso, excludeId) => runsSinceAnyWorkflow(supabase, user.id, sinceIso, excludeId),
          });
          const claimed = await claimAndAdvanceTrigger(supabase, trigger, result, now);
          if (!claimed || cancelled) continue;
          if (!result.fired) continue;
          enqueueScheduledRun({
            scheduleId: null,
            triggerId: trigger.id,
            workflowId: trigger.workflowId,
            workflowName: trigger.workflowName,
            fieldValues: { ...trigger.fieldValues, ...(result.fireValues ?? {}) },
          });
          onRunScheduled();
        }
      } catch (err) {
        console.error("[workflow-triggers] cartridge-drop fire failed:", err);
      }
    };

    const check = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const triggers = await listWorkflowTriggers(supabase, user.id);
        const now = new Date();
        const due = triggers.filter((t) => t.enabled && isTriggerDueForCheck(t, now));
        if (cancelled || due.length === 0) return;
        // One trigger per tick keeps runs from piling onto the tab at once;
        // the next tick picks up the next due trigger.
        const trigger = due[0];
        const activeInstitution = readActiveInstitution() || null;
        const result = await evaluateTrigger(trigger, {
          activeInstitution,
          latestRun: (workflowId) => latestWorkflowRun(supabase, user.id, workflowId),
          runsSince: (workflowId, sinceIso) => runsSinceForWorkflow(supabase, user.id, workflowId, sinceIso),
          excludeWorkflowId: trigger.workflowId,
          latestRunAny: (excludeId) => latestRunAnyWorkflow(supabase, user.id, excludeId),
          runsSinceAny: (sinceIso, excludeId) => runsSinceAnyWorkflow(supabase, user.id, sinceIso, excludeId),
        });
        const claimed = await claimAndAdvanceTrigger(supabase, trigger, result, now);
        if (!claimed || cancelled) return;
        if (!result.fired) return;
        enqueueScheduledRun({
          scheduleId: null,
          triggerId: trigger.id,
          workflowId: trigger.workflowId,
          workflowName: trigger.workflowName,
          fieldValues: { ...trigger.fieldValues, ...(result.fireValues ?? {}) },
        });
        onRunScheduled();
      } catch (err) {
        console.error("[workflow-triggers] check failed:", err);
      } finally {
        checkingRef.current = false;
      }
    };

    void check();
    // The watcher mounts when the app loads for a signed-in user, so mount is
    // "the app was opened".
    void fireLifecycle("app-open");
    const id = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    window.addEventListener("focus", onFocus);
    window.addEventListener(CARTRIDGE_DROP_UPLOADED_EVENT, onCartridgeDropped);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(CARTRIDGE_DROP_UPLOADED_EVENT, onCartridgeDropped);
    };
    // onRunScheduled is a stable page-level callback; re-subscribing on its
    // identity would tear down the interval every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, supabase]);

  return null;
}
