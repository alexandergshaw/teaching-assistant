"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Tabs, Tab } from "@mui/material";
import TabHeader from "./TabHeader";
import { ScheduleSection } from "./workflows/ScheduleSection";
import { TriggerSection } from "./workflows/TriggerSection";
import { tableGradeBand } from "./workflows/run-results";
import { useAutomation } from "./workflows/useAutomation";
import { useWorkflowOptions } from "./workflows/useWorkflowOptions";
import { useWorkflowRun } from "./workflows/useWorkflowRun";
import { BuildPanel } from "./workflows/BuildPanel";
import { WorkflowListSidebar } from "./workflows/WorkflowListSidebar";
import { RunPanel } from "./workflows/RunPanel";
import { useSupabase } from "@/context/SupabaseProvider";
import { useInstitutionSelection } from "@/lib/institutions";
import { downloadCourseZipBlob } from "@/lib/course-files";
import { parseCartridgeBlob, type CartridgeCourseData } from "@/lib/cartridge-import";
import { listCourseHubAction } from "@/app/actions";
import { peekScheduledRun, takeScheduledRun, SCHEDULED_RUN_EVENT } from "@/lib/workflow-schedule-handoff";
import { updateWorkflowSchedule } from "@/lib/workflow-schedules";
import { updateWorkflowTrigger } from "@/lib/workflow-triggers";
import {
  loadCustomWorkflows,
  collectRuntimeFields,
  saveCustomWorkflows,
  expandWorkflowDef,
  loadDisabledSteps,
  saveDisabledSteps,
  type WorkflowScope,
} from "@/lib/workflows/types";
import {
  listWorkflowDefs,
  upsertWorkflowDef,
} from "@/lib/workflow-defs";
import {
  allWorkflows,
  COURSE_KICKOFF,
} from "@/lib/workflows/presets";
import { isHeadlessSafeWorkflow } from "@/lib/workflows/headless";
import {
  getStepDefinition,
} from "@/lib/workflows/registry";
import type { WorkflowDef, RuntimeField, WorkflowStepConfig } from "@/lib/workflows/types";
import styles from "../page.module.css";

export default function WorkflowsTab() {
  const { supabase, user } = useSupabase();
  const { institutions, active: activeInstitution } = useInstitutionSelection();

  const pendingDefRef = useRef<WorkflowDef | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [custom, setCustom] = useState<WorkflowDef[]>(() =>
    typeof window === "undefined" ? [] : loadCustomWorkflows()
  );
  // Signed in, custom defs live in Supabase and arrive async; scheduled runs
  // of custom workflows must not be judged "missing" before they land. A
  // failed load is tracked separately so those runs are skipped with an error
  // instead of stalling the queue or wrongly disabling their schedules.
  const [customLoaded, setCustomLoaded] = useState(false);
  const [customLoadFailed, setCustomLoadFailed] = useState(false);
  const workflows = allWorkflows(custom);
  const [workflowSearch, setWorkflowSearch] = useState<string>(() =>
    typeof window === "undefined" ? "" : localStorage.getItem("ta-workflows-search") ?? ""
  );
  useEffect(() => {
    try {
      localStorage.setItem("ta-workflows-search", workflowSearch);
    } catch {
      // ignore storage write failures
    }
  }, [workflowSearch]);

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(() => {
    if (typeof window === "undefined") return COURSE_KICKOFF.id;
    const saved = localStorage.getItem("ta-workflows-selected");
    if (saved && workflows.some((w) => w.id === saved)) return saved;
    return workflows[0]?.id ?? COURSE_KICKOFF.id;
  });

  const selectedDef = workflows.find((w) => w.id === selectedWorkflowId) || workflows[0];

  const [values, setValues] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined" || !selectedDef) return {};
    const saved = localStorage.getItem(`ta-workflow-values-${selectedDef.id}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return {};
      }
    }
    return {};
  });

  // Per-user overlay of disabled TOP-LEVEL step indices for the selected
  // workflow (see expandWorkflowDef's topIndices). Persisted per workflow id;
  // never mutates the workflow def itself. Loaded/saved the same way as
  // `values` above.
  const [disabledSteps, setDisabledSteps] = useState<Set<number>>(() =>
    selectedDef ? new Set(loadDisabledSteps(selectedDef.id)) : new Set()
  );


  const [pendingHandoff, setPendingHandoff] = useState<{ workflowId: string; prefill: Record<string, string>; scheduleId?: string | null; triggerId?: string | null } | null>(null);

  const [uploadFiles, setUploadFiles] = useState<Record<string, File[]>>({});

  const [editing, setEditing] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  // Master-detail layout: which sub-tab of the right panel is showing.
  const [panel, setPanel] = useState<"build" | "run" | "automate">(() => {
    if (typeof window === "undefined") return "run";
    return (localStorage.getItem("ta-workflows-panel") as "build" | "run" | "automate") || "run";
  });
  const [recentWorkflowIds, setRecentWorkflowIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("ta-workflows-recent");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  });

  // Mirror `editing` into a ref so the focus refetch handler can skip
  // reloading while the builder is open without re-registering listeners.
  const editingRef = useRef(editing);
  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  // Include steps expand before anything reads the step list: the run form,
  // step overview, and runner all operate on expanded coordinates.
  const expanded = useMemo<{
    steps: WorkflowStepConfig[];
    origins: Array<string | null>;
    topIndices: number[];
    error: string | null;
  }>(() => {
    if (!selectedDef) return { steps: [], origins: [], topIndices: [], error: null };
    try {
      return {
        ...expandWorkflowDef(selectedDef, (id) =>
          workflows.find((w) => w.id === id)
        ),
        error: null,
      };
    } catch (err) {
      return {
        steps: [],
        origins: [],
        topIndices: [],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [selectedDef, workflows]);

  // Whether the selected workflow is eligible for the "run unattended" opt-in
  // on the schedule form - every expanded step must be headless-safe (see
  // workflows/headless.ts). Interactive workflows never show the checkbox.
  const selectedHeadlessSafe = useMemo(
    () =>
      selectedDef
        ? isHeadlessSafeWorkflow(selectedDef, (id) => workflows.find((w) => w.id === id))
        : false,
    [selectedDef, workflows]
  );

  // Check if a workflow (by id) is headless-safe, for use in conditionally
  // showing unattended execution checkboxes across multiple render sites.
  const isWorkflowHeadlessSafeById = useCallback(
    (id: string) => {
      const w = workflows.find((wf) => wf.id === id);
      return w ? isHeadlessSafeWorkflow(w, (depId) => workflows.find((wf) => wf.id === depId)) : false;
    },
    [workflows]
  );

  // Steps whose top-level index the user has disabled are excluded here so
  // the run form never asks for inputs needed only by a disabled step (a
  // field shared with an enabled step still appears - first-occurrence-wins
  // in collectRuntimeFields naturally handles that once disabled steps are
  // simply absent from the list it walks).
  const enabledExpandedSteps = useMemo(
    () => expanded.steps.filter((_, i) => !disabledSteps.has(expanded.topIndices[i])),
    [expanded, disabledSteps]
  );

  // Parsed course exports keyed by course id; promises so concurrent readers
  // (module picker + running steps) share one download.
  const courseExportCacheRef = useRef<Map<string, Promise<CartridgeCourseData | null>>>(new Map());

  // Download and parse the newest LMS export saved on a course tile; shared by
  // the module picker fallback and running steps (helpers.loadCourseExport).
  // The course row is re-read every call so a freshly saved export is picked
  // up; only the expensive download+parse is cached, keyed by storage path.
  const loadCourseExportData = useCallback(
    async (courseId: string): Promise<CartridgeCourseData | null> => {
      if (!user) return null;
      const list = await listCourseHubAction();
      if ("error" in list) throw new Error(list.error);
      const course = list.courses.find((c) => c.id === courseId);
      if (!course || course.exportFiles.length === 0) return null;
      const latest = course.exportFiles.reduce((a, b) => (b.addedAt > a.addedAt ? b : a));
      const cached = courseExportCacheRef.current.get(latest.path);
      if (cached) return cached;
      const promise = (async () => {
        const blob = await downloadCourseZipBlob(supabase, latest);
        return await parseCartridgeBlob(blob);
      })();
      courseExportCacheRef.current.set(latest.path, promise);
      // Evict failures so a retry can succeed.
      promise.catch(() => courseExportCacheRef.current.delete(latest.path));
      return promise;
    },
    [user, supabase]
  );

  const automation = useAutomation(user, supabase, selectedDef, values, disabledSteps, selectedHeadlessSafe, isWorkflowHeadlessSafeById);

  const runtimeFields: RuntimeField[] = useMemo(
    () =>
      selectedDef
        ? collectRuntimeFields(
            { ...selectedDef, steps: enabledExpandedSteps },
            (type) => {
              const def = getStepDefinition(type);
              return def?.inputs;
            }
          )
        : [],
    [selectedDef, enabledExpandedSteps]
  );

  const workflowOptions = useWorkflowOptions(panel, runtimeFields, values, activeInstitution, loadCourseExportData, automation.schedules, automation.scheduleForm, automation.triggerForm);

  const onSetPanel = useCallback((p: "build" | "run" | "automate") => {
    setPanel(p);
  }, []);
  const onSetPendingHandoff = setPendingHandoff;
  const onSetHubCourses = workflowOptions.setHubCourses;

  // Recent group (AC2): records only workflows whose run actually started
  // (validation passed) - called from useWorkflowRun's handleRun once
  // validateForm succeeds, so a failed/blocked Run click never pollutes it.
  const onRunStart = useCallback((workflowId: string) => {
    setRecentWorkflowIds((prev) => [workflowId, ...prev.filter((id) => id !== workflowId)].slice(0, 5));
  }, []);

  const workflowRun = useWorkflowRun(expanded, enabledExpandedSteps, disabledSteps, selectedDef, selectedWorkflowId, workflows, values, uploadFiles, runtimeFields, activeInstitution, user, supabase, loadCourseExportData, onSetPanel, onSetPendingHandoff, onSetHubCourses, onRunStart, pendingHandoff);

  // Run requires at least one enabled step - a workflow with every step
  // toggled off would run the loop and finish having done nothing.
  const allStepsDisabled = expanded.steps.length > 0 && enabledExpandedSteps.length === 0;

  // Top-level indices of disabled steps that an ENABLED step still binds to
  // by "step" output - surfaced in the overview as a subtle heads-up (not a
  // block: disabling stays allowed, dependents just cascade-skip at run
  // time with their own clear message).
  const disabledStepsWithEnabledDependents = useMemo(() => {
    const result = new Set<number>();
    expanded.steps.forEach((step, i) => {
      if (disabledSteps.has(expanded.topIndices[i])) return;
      for (const binding of Object.values(step.bindings)) {
        if (binding.source === "step") {
          const producerTop = expanded.topIndices[binding.stepIndex];
          if (producerTop !== undefined && disabledSteps.has(producerTop)) {
            result.add(producerTop);
          }
        }
      }
    });
    return result;
  }, [expanded, disabledSteps]);

  // Seed empty institution fields from the active institution during render
  // (guarded by a marker so each field set seeds once), so no effect calls
  // setState synchronously.
  const [seededInstMarker, setSeededInstMarker] = useState("");
  const unseededInstitutionKeys = runtimeFields
    .filter(
      (f) => f.type === "institution" && !(values[f.fieldKey] ?? "").trim()
    )
    .map((f) => f.fieldKey);
  const seedKey =
    activeInstitution && unseededInstitutionKeys.length > 0
      ? `${selectedWorkflowId}:${activeInstitution}:${unseededInstitutionKeys.join(",")}`
      : "";
  if (seedKey && seedKey !== seededInstMarker) {
    setSeededInstMarker(seedKey);
    setValues((prev) => ({
      ...prev,
      ...Object.fromEntries(
        unseededInstitutionKeys.map((k) => [k, activeInstitution])
      ),
    }));
  }

  const updateCustom = (next: WorkflowDef[]) => {
    setCustom(next);
    if (!user) {
      saveCustomWorkflows(next);
    }
  };

  useEffect(() => {
    if (!user || !supabase) return;

    let cancelled = false;

    (async () => {
      try {
        const dbRows = await listWorkflowDefs(supabase, user.id);

        if (!cancelled) {
          if (dbRows.length === 0) {
            const localRows = loadCustomWorkflows();
            if (localRows.length > 0) {
              let allUpserted = true;
              for (const def of localRows) {
                try {
                  await upsertWorkflowDef(supabase, user.id, def);
                } catch (err) {
                  console.error("Failed to migrate workflow:", def.id, err);
                  allUpserted = false;
                }
              }

              if (allUpserted) {
                try {
                  localStorage.removeItem("ta-workflows");
                } catch {
                  // Ignore storage failures.
                }
                const migratedRows = await listWorkflowDefs(supabase, user.id);
                setCustom(migratedRows);
              }
            }
          } else {
            setCustom(dbRows);
          }
          // Custom defs are now authoritative; scheduled runs of custom
          // workflows may consume (they wait for this flag).
          setCustomLoaded(true);
        }
      } catch (err) {
        console.error("Failed to load workflows from database:", err);
        if (!cancelled) setCustomLoadFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, supabase]);

  useEffect(() => {
    localStorage.setItem("ta-workflows-selected", selectedWorkflowId);
  }, [selectedWorkflowId]);

  useEffect(() => {
    localStorage.setItem("ta-workflows-panel", panel);
  }, [panel]);

  useEffect(() => {
    try {
      localStorage.setItem("ta-workflows-recent", JSON.stringify(recentWorkflowIds));
    } catch {
      // ignore storage write failures
    }
  }, [recentWorkflowIds]);

  useEffect(() => {
    if (selectedDef) {
      localStorage.setItem(
        `ta-workflow-values-${selectedDef.id}`,
        JSON.stringify(values)
      );
    }
  }, [values, selectedDef]);

  useEffect(() => {
    if (selectedDef) {
      saveDisabledSteps(selectedDef.id, Array.from(disabledSteps));
    }
  }, [disabledSteps, selectedDef]);

  useEffect(() => {
    if (user && supabase) {
      const handleFocus = () => {
        // Skip while the builder is open: a refetch could overwrite edits
        // still waiting inside the debounced save window.
        if (editingRef.current) return;

        (async () => {
          try {
            const dbRows = await listWorkflowDefs(supabase, user.id);
            setCustom(dbRows);
          } catch (err) {
            console.error("Failed to reload workflows from database:", err);
          }
        })();
      };

      window.addEventListener("focus", handleFocus);
      return () => {
        window.removeEventListener("focus", handleFocus);
      };
    } else {
      const handleStorageChange = () => {
        setCustom(loadCustomWorkflows());
      };

      window.addEventListener("storage", handleStorageChange);
      window.addEventListener("focus", handleStorageChange);

      return () => {
        window.removeEventListener("storage", handleStorageChange);
        window.removeEventListener("focus", handleStorageChange);
      };
    }
  }, [user, supabase]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      if (user && supabase && pendingDefRef.current) {
        void upsertWorkflowDef(supabase, user.id, pendingDefRef.current).catch(
          console.error
        );
      }
    };
  }, [user, supabase]);


  // Consume queued scheduled runs (claimed by the page-level watcher) once the
  // tab is idle: each becomes a normal auto-run handoff. Runs whose workflow
  // id is not found stay queued until the async custom-def load settles
  // (customLoaded); only then are they treated as deleted, and their schedule
  // is disabled so a repeating schedule cannot grab the tab forever.
  useEffect(() => {
    const consume = () => {
      if (workflowRun.running || pendingHandoff) return;
      const next = peekScheduledRun();
      if (!next) return;
      if (!workflows.some((w) => w.id === next.workflowId)) {
        if (user && !customLoaded && !customLoadFailed) return;
        takeScheduledRun();
        if (customLoadFailed) {
          // The defs may exist but could not be loaded: skip without
          // disabling the schedule.
          workflowRun.setValidationError(
            `Could not load your custom workflows, so the scheduled run of "${next.workflowName}" was skipped.`
          );
          return;
        }
        workflowRun.setValidationError(
          `Workflow "${next.workflowName}" no longer exists; its schedule or trigger has been disabled.`
        );
        // A queued run carries EITHER a scheduleId (time schedule) or a
        // triggerId (event trigger); disable whichever produced this orphan so
        // a repeating source cannot grab the tab forever.
        if (user && next.scheduleId) {
          const scheduleId = next.scheduleId;
          void updateWorkflowSchedule(supabase, user.id, scheduleId, { enabled: false })
            .then(() => {
              automation.setSchedules((prev) =>
                (prev ?? []).map((x) => (x.id === scheduleId ? { ...x, enabled: false } : x))
              );
            })
            .catch((err) => console.error("Failed to disable orphaned schedule:", err));
        }
        if (user && next.triggerId) {
          const triggerId = next.triggerId;
          void updateWorkflowTrigger(supabase, user.id, triggerId, { enabled: false })
            .then(() => {
              automation.setTriggers((prev) =>
                (prev ?? []).map((x) => (x.id === triggerId ? { ...x, enabled: false } : x))
              );
            })
            .catch((err) => console.error("Failed to disable orphaned trigger:", err));
        }
        return;
      }
      takeScheduledRun();
      setPendingHandoff({ workflowId: next.workflowId, prefill: next.fieldValues, scheduleId: next.scheduleId, triggerId: next.triggerId });
    };
    consume();
    window.addEventListener(SCHEDULED_RUN_EVENT, consume);
    return () => window.removeEventListener(SCHEDULED_RUN_EVENT, consume);
  });


  const handleWorkflowChange = (newId: string) => {
    setSelectedWorkflowId(newId);
    setEditing(false);
    setDeleteArmed(false);
    // Load saved values by id (not via the workflows closure, which is stale
    // right after creating/duplicating) so the previous workflow's form values
    // never leak into the newly selected one.
    const saved = localStorage.getItem(`ta-workflow-values-${newId}`);
    if (saved) {
      try {
        setValues(JSON.parse(saved));
      } catch {
        setValues({});
      }
    } else {
      setValues({});
    }
    // Same lifecycle as values: the disabled-step overlay is per workflow id,
    // so it is rehydrated (not carried over) whenever the selection changes.
    setDisabledSteps(new Set(loadDisabledSteps(newId)));
  };

  // Set the selected (custom) workflow's workflow-level targets and persist.
  const handleScopeChange = (scope: WorkflowScope) => {
    if (!selectedDef || selectedDef.preset) return;
    // selectedDef already reflects any in-flight builder step edit, so `next`
    // carries both. Cancel the builder's pending debounced save (whose queued
    // def has no scope) so it cannot clobber this write.
    const next: WorkflowDef = { ...selectedDef, scope };
    updateCustom(custom.map((w) => (w.id === next.id ? next : w)));
    if (user && supabase) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      pendingDefRef.current = null;
      void upsertWorkflowDef(supabase, user.id, next).catch(console.error);
    }
  };

  // A preset is read-only, so its "This workflow is for" targets cannot be
  // edited in place. Setting them creates the user's own editable copy carrying
  // that scope and selects it - the same customize-by-duplicate model as the
  // Duplicate button (and the only shape whose scope persists server-side so
  // scheduled/triggered runs honor it), just reachable straight from the panel.
  const handlePresetScope = (scope: WorkflowScope) => {
    if (!selectedDef) return;
    const copied: WorkflowDef = {
      id: crypto.randomUUID(),
      name: `${selectedDef.name} (copy)`,
      description: selectedDef.description,
      steps: JSON.parse(JSON.stringify(selectedDef.steps)),
      scope,
    };
    updateCustom([...custom, copied]);
    if (user && supabase) {
      void upsertWorkflowDef(supabase, user.id, copied).catch(console.error);
    }
    handleWorkflowChange(copied.id);
  };

  const handleValueChange = (fieldKey: string, value: string) => {
    const field = runtimeFields.find((f) => f.fieldKey === fieldKey);

    // Picking a repo that is attached to a course tile pre-selects that tile
    // (and its LMS course when empty); later manual changes are respected
    // because this only runs when the repo field itself changes.
    if (field?.type === "repo" && workflowOptions.hubCourses && value.trim()) {
      const m = value.match(/github\.com\/([^/\s]+\/[^/\s#?]+)/);
      const ref = (m ? m[1] : value).trim().replace(/\.git$/, "").toLowerCase();

      const match = workflowOptions.hubCourses.find((c) => c.repos.some((r) => r.toLowerCase() === ref));

      if (match) {
        setValues((prev) => {
          const next = { ...prev, [fieldKey]: value };

          // Find first hubCourse field and set it
          const hubCourseField = runtimeFields.find((f) => f.type === "hubCourse");
          if (hubCourseField) {
            next[hubCourseField.fieldKey] = match.id;
          }

          // Find first lmsCourse field, set it if empty and canvasUrl exists
          const lmsCourseField = runtimeFields.find((f) => f.type === "lmsCourse");
          if (lmsCourseField && !prev[lmsCourseField.fieldKey] && match.canvasUrl) {
            next[lmsCourseField.fieldKey] = match.canvasUrl;
          }

          return next;
        });
      } else {
        setValues((prev) => ({ ...prev, [fieldKey]: value }));
      }
    } else if (field?.type === "hubCourse") {
      // When switching hubCourse, clear all lmsModule-typed fields in the same update.
      // Module selections belong to the previously selected course.
      setValues((prev) => {
        const next = { ...prev, [fieldKey]: value };
        for (const moduleField of runtimeFields) {
          if (moduleField.type === "lmsModule") {
            next[moduleField.fieldKey] = "";
          }
        }
        return next;
      });
    } else {
      setValues((prev) => ({ ...prev, [fieldKey]: value }));
    }
  };


  // Fire a workflow handoff chosen mid-run: select the target workflow, set its
  // values to ONLY the handoff prefill, and auto-run on the settled render.
  // handleWorkflowChange rehydrates the target's saved values from localStorage;
  // we then overwrite that map entirely with the prefill so stale saved values
  // (e.g. an lmsModule id from a different course) never ride along. Any missing
  // required field then fails validation, stopping the auto-run at the form.
  // Two-phase ref dance runs handleRun only once selection/values have settled.
  const handoffArmedRef = useRef(false);
  useEffect(() => {
    if (!pendingHandoff || workflowRun.running) return;
    if (!handoffArmedRef.current) {
      handoffArmedRef.current = true;
      handleWorkflowChange(pendingHandoff.workflowId);
      setValues(pendingHandoff.prefill);
      setPanel("run");
      return;
    }
    handoffArmedRef.current = false;
    setPendingHandoff(null);
    void workflowRun.handleRun();
  }, [pendingHandoff, workflowRun, selectedWorkflowId, values]);

  return (
    <div className={styles.card}>
      <TabHeader
        eyebrow="Workflows"
        title="Composite actions"
        subtitle="Kick off multi-step jobs that chain the app's tools together: schedules, repos, lecture materials, and LMS population in one run."
      />

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
        <WorkflowListSidebar
          workflows={workflows}
          selectedWorkflowId={selectedWorkflowId}
          onSelectWorkflow={handleWorkflowChange}
          onRunClick={(id) => {
            handleWorkflowChange(id);
            setPanel("run");
          }}
          workflowSearch={workflowSearch}
          onSearchChange={setWorkflowSearch}
          recentWorkflowIds={recentWorkflowIds}
          automationByWorkflow={automation.automationByWorkflow}
          runningWorkflow={workflowRun.running}
          onNewWorkflow={() => {
            const newDef: WorkflowDef = {
              id: crypto.randomUUID(),
              name: "New workflow",
              description: "",
              steps: [],
            };
            updateCustom([...custom, newDef]);
            if (user && supabase) {
              void upsertWorkflowDef(supabase, user.id, newDef).catch(console.error);
            }
            handleWorkflowChange(newDef.id);
            setEditing(true);
            setPanel("build");
          }}
        />

        <div className={styles.form} style={{ flex: 1, minWidth: 320 }}>
          {!selectedDef ? (
            <p className={styles.fieldHint}>Select a workflow from the list, or create a new one.</p>
          ) : (
            <>
              <Tabs
                value={panel}
                onChange={(_, v) => setPanel(v as "build" | "run" | "automate")}
                sx={{ minHeight: 36, mb: 1 }}
              >
                {/* Lock navigation away from an active run so its progress and
                    any mid-run pause / input prompt (which live in the Run
                    panel) can never be hidden behind another tab. */}
                <Tab value="build" label="Build" sx={{ minHeight: 36 }} disabled={workflowRun.running || !!workflowRun.runPause || !!workflowRun.runInput} />
                <Tab value="run" label="Run" sx={{ minHeight: 36 }} />
                <Tab value="automate" label="Automate" sx={{ minHeight: 36 }} disabled={workflowRun.running || !!workflowRun.runPause || !!workflowRun.runInput} />
              </Tabs>

              {panel === "build" && (
                <BuildPanel
                  selectedDef={selectedDef}
                  editing={editing}
                  setEditing={setEditing}
                  deleteArmed={deleteArmed}
                  setDeleteArmed={setDeleteArmed}
                  running={workflowRun.running}
                  expanded={expanded}
                  disabledSteps={disabledSteps}
                  setDisabledSteps={setDisabledSteps}
                  disabledStepsWithEnabledDependents={disabledStepsWithEnabledDependents}
                  hubCourses={workflowOptions.hubCourses}
                  orgs={workflowOptions.orgs}
                  lmsCourseOptions={workflowOptions.lmsCourseOptions}
                  institutions={institutions}
                  activeInstitution={activeInstitution}
                  user={user}
                  supabase={supabase}
                  custom={custom}
                  workflows={workflows}
                  updateCustom={updateCustom}
                  handleWorkflowChange={handleWorkflowChange}
                  handlePresetScope={handlePresetScope}
                  handleScopeChange={handleScopeChange}
                  pendingDefRef={pendingDefRef}
                  saveTimerRef={saveTimerRef}
                />
              )}

              {panel === "run" && (
                <RunPanel
                  selectedDef={selectedDef}
                  runtimeFields={runtimeFields}
                  values={values}
                  onValueChange={handleValueChange}
                  workflowRunning={workflowRun.running}
                  validationError={workflowRun.validationError}
                  runState={workflowRun.runState}
                  stopRequested={workflowRun.stopRequested}
                  onStopAfterCourse={workflowRun.stopAfterCurrentCourse}
                  runPause={workflowRun.runPause}
                  runInput={workflowRun.runInput}
                  pauseResolverRef={workflowRun.pauseResolverRef}
                  inputResolverRef={workflowRun.inputResolverRef}
                  onRunClick={workflowRun.handleRun}
                  expandedError={expanded.error}
                  allStepsDisabled={allStepsDisabled}
                  uploadFiles={uploadFiles}
                  onUploadFilesChange={setUploadFiles}
                  optionsForFields={{
                    orgs: workflowOptions.orgs,
                    orgsError: workflowOptions.orgsError,
                    hubCourses: workflowOptions.hubCourses,
                    hubCoursesError: workflowOptions.hubCoursesError,
                    lmsCourseOptions: workflowOptions.lmsCourseOptions,
                    lmsCourseOptionsError: workflowOptions.lmsCourseOptionsError,
                    lmsModuleOptions: workflowOptions.lmsModuleOptions,
                    lmsModuleError: workflowOptions.lmsModuleError,
                    lmsModuleFromExport: workflowOptions.lmsModuleFromExport,
                    deckTemplates: workflowOptions.deckTemplates,
                    deckTemplatesError: workflowOptions.deckTemplatesError,
                    institutions,
                    activeInstitution,
                  }}
                  tableHasGrade={workflowRun.tableHasGrade}
                  tableGradeBand={tableGradeBand}
                  initialRunInputRows={workflowRun.runInputInitialRows}
                  expandedSteps={expanded.steps}
                  expandedOrigins={expanded.origins}
                  getStepDefinition={getStepDefinition}
                />
              )}

              {panel === "automate" && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--field-border)" }}>
            <ScheduleSection
              scheduleForm={automation.scheduleForm}
              setScheduleForm={automation.setScheduleForm}
              editingScheduleId={automation.editingScheduleId}
              setEditingScheduleId={automation.setEditingScheduleId}
              schedules={automation.schedules}
              scheduleBusy={automation.scheduleBusy}
              scheduleError={automation.scheduleError}
              setScheduleError={automation.setScheduleError}
              scheduleRemoveConfirm={automation.scheduleRemoveConfirm}
              setScheduleRemoveConfirm={automation.setScheduleRemoveConfirm}
              selectedDef={selectedDef}
              runtimeFields={runtimeFields}
              hubCourses={workflowOptions.hubCourses}
              institutions={institutions}
              activeInstitution={activeInstitution}
              user={user}
              expandedError={expanded.error}
              isWorkflowHeadlessSafeById={isWorkflowHeadlessSafeById}
              selectedHeadlessSafe={selectedHeadlessSafe}
              workflows={workflows}
              onCreate={automation.handleCreateSchedule}
              onSaveEdit={automation.handleSaveEditSchedule}
              onToggle={automation.handleToggleSchedule}
              onDelete={automation.handleDeleteSchedule}
            />

            <TriggerSection
              triggerForm={automation.triggerForm}
              setTriggerForm={automation.setTriggerForm}
              editingTriggerId={automation.editingTriggerId}
              setEditingTriggerId={automation.setEditingTriggerId}
              triggers={automation.triggers}
              triggerBusy={automation.triggerBusy}
              triggerError={automation.triggerError}
              setTriggerError={automation.setTriggerError}
              triggerRemoveConfirm={automation.triggerRemoveConfirm}
              setTriggerRemoveConfirm={automation.setTriggerRemoveConfirm}
              selectedDef={selectedDef}
              selectedWorkflowId={selectedWorkflowId}
              hubCourses={workflowOptions.hubCourses}
              institutions={institutions}
              activeInstitution={activeInstitution}
              user={user}
              expandedError={expanded.error}
              isWorkflowHeadlessSafeById={isWorkflowHeadlessSafeById}
              selectedHeadlessSafe={selectedHeadlessSafe}
              webhookSetup={automation.webhookSetup}
              setWebhookSetup={automation.setWebhookSetup}
              webhookBaseUrl={automation.webhookBaseUrl}
              orgs={workflowOptions.orgs}
              orgsError={workflowOptions.orgsError}
              workflows={workflows}
              onCreate={automation.handleCreateTrigger}
              onSaveEdit={automation.handleSaveEditTrigger}
              onToggle={automation.handleToggleTrigger}
              onDelete={automation.handleDeleteTrigger}
            />
          </div>
        )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
