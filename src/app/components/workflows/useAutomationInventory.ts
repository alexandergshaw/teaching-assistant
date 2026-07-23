"use client";

import { useEffect, useState } from "react";
import { listCourseHubAction, listMyOrgsAction } from "@/app/actions";
import { listWorkflowSchedules, type WorkflowSchedule } from "@/lib/workflow-schedules";
import { listWorkflowTriggers, type WorkflowTrigger } from "@/lib/workflow-triggers";
import {
  loadCustomWorkflows,
} from "@/lib/workflows/types";
import {
  listWorkflowDefs,
} from "@/lib/workflow-defs";
import {
  allWorkflows,
} from "@/lib/workflows/presets";
import type { WorkflowDef } from "@/lib/workflows/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

export interface UseAutomationInventoryReturn {
  workflows: WorkflowDef[];
  schedules: WorkflowSchedule[] | null;
  triggers: WorkflowTrigger[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  setSchedules: (schedules: WorkflowSchedule[] | null) => void;
  setTriggers: (triggers: WorkflowTrigger[] | null) => void;
  /** Light option loads the hub's inline schedule/trigger editors need
   * (course names, org typeahead) - loaded once, mirroring
   * useWorkflowOptions' cancelled-IIFE idiom. Null while loading. */
  hubCourses: Array<{ id: string; name: string; canvasUrl: string | null; repos: string[] }> | null;
  hubCoursesError: string | null;
  orgs: string[] | null;
  orgsError: string | null;
}

export function useAutomationInventory(
  user: User | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any> | null,
  active: boolean
): UseAutomationInventoryReturn {
  const [custom, setCustom] = useState<WorkflowDef[]>(() =>
    typeof window === "undefined" ? [] : loadCustomWorkflows()
  );
  const [schedules, setSchedules] = useState<WorkflowSchedule[] | null>(null);
  const [triggers, setTriggers] = useState<WorkflowTrigger[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const [hubCourses, setHubCourses] = useState<Array<{ id: string; name: string; canvasUrl: string | null; repos: string[] }> | null>(null);
  const [hubCoursesError, setHubCoursesError] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<string[] | null>(null);
  const [orgsError, setOrgsError] = useState<string | null>(null);

  const workflows = allWorkflows(custom);

  // Load custom workflows from database on mount, mirroring WorkflowsTab pattern
  useEffect(() => {
    if (!user || !supabase) return;

    let cancelled = false;

    (async () => {
      await Promise.resolve();
      if (cancelled) return;

      try {
        const dbRows = await listWorkflowDefs(supabase, user.id);
        if (!cancelled) setCustom(dbRows);
      } catch (err) {
        console.error("Failed to load workflows from database:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  // Load schedules and triggers when active, and on refetch
  useEffect(() => {
    let cancelled = false;

    (async () => {
      await Promise.resolve();
      if (cancelled) return;

      if (!active || !user || !supabase) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [scheduleRows, triggerRows] = await Promise.all([
          listWorkflowSchedules(supabase, user.id),
          listWorkflowTriggers(supabase, user.id),
        ]);

        if (!cancelled) {
          setSchedules(scheduleRows);
          setTriggers(triggerRows);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load automation inventory");
          setSchedules([]);
          setTriggers([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active, user, supabase, refetchTrigger]);

  // Light option loads the hub's inline schedule/trigger editors need (course
  // names for the course picker/attachment display, org list for the
  // repo-push/repo-inactive trigger config field's Typeahead). Loaded once
  // while active, mirroring useWorkflowOptions' cancelled-IIFE idiom - the
  // hub has no runtimeFields signal to gate on, so it loads them eagerly
  // instead of only when a specific field type is present.
  useEffect(() => {
    if (!active || hubCourses !== null) return;

    let cancelled = false;

    (async () => {
      try {
        const list = await listCourseHubAction();
        if (cancelled) return;
        if ("error" in list) {
          setHubCoursesError(list.error);
        } else {
          setHubCourses(list.courses.map((c) => ({ id: c.id, name: c.name, canvasUrl: c.canvasUrl ?? null, repos: (c.repos || []).map((x) => x.repo) })));
          setHubCoursesError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setHubCoursesError(err instanceof Error ? err.message : "Could not load courses.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active, hubCourses]);

  useEffect(() => {
    if (!active || orgs !== null) return;

    let cancelled = false;

    (async () => {
      try {
        const r = await listMyOrgsAction();
        if (cancelled) return;
        if ("error" in r) {
          setOrgsError(r.error);
        } else {
          setOrgs(r.orgs);
          setOrgsError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setOrgsError(err instanceof Error ? err.message : "Could not load organizations.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active, orgs]);

  const refetch = () => {
    setRefetchTrigger((prev) => prev + 1);
  };

  return {
    workflows,
    schedules,
    triggers,
    loading,
    error,
    refetch,
    setSchedules,
    setTriggers,
    hubCourses,
    hubCoursesError,
    orgs,
    orgsError,
  };
}
