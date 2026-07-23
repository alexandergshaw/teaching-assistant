"use client";

import { useEffect, useRef } from "react";
import { useSupabase } from "@/context/SupabaseProvider";
import {
  listDueWorkflowSchedules,
  claimWorkflowSchedule,
  shouldWatcherClaim,
} from "@/lib/workflow-schedules";
import { enqueueScheduledRun } from "@/lib/workflow-schedule-handoff";

// How often to look for due schedules while the app is open.
const CHECK_INTERVAL_MS = 60 * 1000;

/**
 * Headless page-level watcher for scheduled workflow runs. Roughly once a
 * minute it claims the earliest due schedule (an atomic conditional update, so
 * concurrent tabs cannot double-fire) and hands it to the Workflows tab via
 * the scheduled-run queue; `onRunScheduled` lets the page switch tabs so the
 * run (and any mid-run pauses) is visible.
 */
export default function WorkflowScheduleWatcher({
  onRunScheduled,
}: {
  onRunScheduled: () => void;
}) {
  const { supabase, user } = useSupabase();
  // Serialize checks: a slow network response must not overlap the next tick.
  const checkingRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const check = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const now = new Date();
        const due = await listDueWorkflowSchedules(supabase, user.id, now);
        if (cancelled || due.length === 0) return;
        // Unattended schedules belong to the server cron; the watcher only
        // steps in once one is overdue past the grace backstop (see
        // shouldWatcherClaim). Attended schedules are always claimable.
        const claimable = due.filter((s) => shouldWatcherClaim(s, now));
        if (claimable.length === 0) return;
        // One run per tick keeps runs from piling onto the tab at once; the
        // next tick picks up the next due schedule.
        const schedule = claimable[0];
        const claimed = await claimWorkflowSchedule(supabase, user.id, schedule, now);
        if (!claimed || cancelled) return;
        enqueueScheduledRun({
          scheduleId: schedule.id,
          workflowId: schedule.workflowId,
          workflowName: schedule.workflowName,
          fieldValues: schedule.fieldValues,
        });
        onRunScheduled();
      } catch (err) {
        console.error("[workflow-schedules] check failed:", err);
      } finally {
        checkingRef.current = false;
      }
    };

    void check();
    const id = window.setInterval(() => void check(), CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // onRunScheduled is a stable page-level callback; re-subscribing on its
    // identity would tear down the interval every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, supabase]);

  return null;
}
