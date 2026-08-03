"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import TabHeader from "./TabHeader";
import { tableGradeBand } from "./workflows/run-results";
import { useAutomation } from "./workflows/useAutomation";
import { useWorkflowOptions } from "./workflows/useWorkflowOptions";
import { useWorkflowRun } from "./workflows/useWorkflowRun";
import { WorkflowPanel } from "./workflows/WorkflowPanel";
import { resolveWorkflowPanelDisclosures } from "./workflows/workflow-panel-migration";
import { WorkflowListSidebar } from "./workflows/WorkflowListSidebar";
import { useSupabase } from "@/context/SupabaseProvider";
import { useInstitutionSelection } from "@/lib/institutions";
import { downloadCourseZipBlob } from "@/lib/course-files";
import { parseCartridgeBlob, type CartridgeCourseData } from "@/lib/cartridge-import";
import { listCourseHubAction } from "@/app/actions";
import { latestSourceExportFile } from "@/lib/courses-table-helpers";
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
  upsertWorkflowDefById,
  type WorkflowScope,
} from "@/lib/workflows/types";
import {
  listWorkflowDefs,
  upsertWorkflowDef,
} from "@/lib/workflow-defs";
import {
  allWorkflows,
  getPresetDef,
  COURSE_KICKOFF,
} from "@/lib/workflows/presets";
import { toStoredDef } from "@/lib/workflows/preset-overrides";
import { isHeadlessSafeWorkflow } from "@/lib/workflows/headless";
import { resolveSelectionReconciliation } from "@/lib/workflows/selection-reconciliation";
import {
  getStepDefinition,
} from "@/lib/workflows/registry";
import type { WorkflowDef, RuntimeField, WorkflowStepConfig } from "@/lib/workflows/types";
import TabShell from "./TabShell";
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

  // Honor a saved (or deep-linked) id UNVALIDATED against `workflows`: custom
  // defs live in Supabase and arrive async (customLoaded below), so at mount
  // `workflows` may only hold presets. Rejecting an id that simply hasn't
  // loaded yet would silently swap a deep link for workflows[0] and then
  // persist that fallback, destroying the original target. selectedDef's
  // `find(...) || workflows[0]` fallback covers rendering until the id
  // resolves; the reconciliation effect below (loadedForIdRef) reloads
  // values/disabledSteps once it does, and falls back explicitly only if the
  // id is still unresolved after the custom load has settled.
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(() => {
    if (typeof window === "undefined") return COURSE_KICKOFF.id;
    const saved = localStorage.getItem("ta-workflows-selected");
    if (saved) return saved;
    return workflows[0]?.id ?? COURSE_KICKOFF.id;
  });

  const selectedDef = workflows.find((w) => w.id === selectedWorkflowId) || workflows[0];

  // The workflow id that `values`/`disabledSteps` below currently reflect.
  // Kept in sync synchronously by handleWorkflowChange (ordinary selection)
  // and asynchronously by the reconciliation effect further down (a
  // deep-linked id resolving, or a stale id falling back, once the custom
  // workflow load settles) - see resolveSelectionReconciliation.
  const loadedForIdRef = useRef<string | null>(selectedDef?.id ?? null);

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

  // Load a workflow's persisted values + disabled-steps overlay by id (not via
  // the `workflows` closure, which is stale right after creating/duplicating).
  // Shared by handleWorkflowChange (ordinary selection) and the reconciliation
  // effect below (deep-link resolution / stale-id fallback) so both apply the
  // exact same reload semantics.
  const loadWorkflowFormState = useCallback((id: string) => {
    const saved = localStorage.getItem(`ta-workflow-values-${id}`);
    let nextValues: Record<string, string> = {};
    if (saved) {
      try {
        nextValues = JSON.parse(saved);
      } catch {
        nextValues = {};
      }
    }
    return { values: nextValues, disabledSteps: new Set(loadDisabledSteps(id)) };
  }, []);


  const [pendingHandoff, setPendingHandoff] = useState<{ workflowId: string; prefill: Record<string, string>; scheduleId?: string | null; triggerId?: string | null } | null>(null);

  const [uploadFiles, setUploadFiles] = useState<Record<string, File[]>>({});

  const [editing, setEditing] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  // The merged Workflows page (WorkflowPanel) has two disclosures - Steps and
  // Schedule & trigger - replacing the old Build/Run/Automate tab strip. Their
  // open state is owned here (not inside WorkflowPanel) for two reasons: (1)
  // useWorkflowOptions needs to know whether Steps is open to eager-load the
  // same option lists the old `panel === "build"` check preloaded, and (2)
  // the Automations tab's "jump to this workflow's automation section" link
  // (AutomationRow -> AutomationsTabView -> page.tsx's openWorkflow) still
  // writes the legacy tri-state `ta-workflows-panel` key before switching
  // tabs; that write must force the Schedule & trigger disclosure open on
  // EVERY click, not just once, so it is read (and then cleared, so it can't
  // linger and override the user's own later toggles) on every mount instead
  // of being folded permanently into the new per-disclosure keys - see
  // resolveWorkflowPanelDisclosures.
  const [stepsOpen, setStepsOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const legacy = localStorage.getItem("ta-workflows-panel");
    if (legacy !== null) return resolveWorkflowPanelDisclosures(legacy).stepsOpen;
    return localStorage.getItem("ta-workflows-steps-open") === "true";
  });
  // "Run history" is new (no legacy ta-workflows-panel tri-state to migrate
  // from - that value only ever distinguished build/run/automate) and
  // persisted the same way as the other two disclosures.
  const [runHistoryOpen, setRunHistoryOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ta-workflows-run-history-open") === "true";
  });
  const [automationOpen, setAutomationOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const legacy = localStorage.getItem("ta-workflows-panel");
    if (legacy !== null) return resolveWorkflowPanelDisclosures(legacy).automationOpen;
    return localStorage.getItem("ta-workflows-automation-open") === "true";
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
      // AC3 (real runs 556b49f0, 6729e3f5, 90415cd8): this call itself can
      // fail at the network level (listCourseHubAction wraps a Supabase
      // Postgrest query, which - like Storage's createSignedUrl,
      // course-files.ts's getCourseZipUrl - can surface a DNS/CORS/
      // connection failure as a bare browser "Failed to fetch"). Every OTHER
      // rethrow in this function is already wrapped with the tile/file it
      // was reading (the catch block below), but THIS one used to be a bare
      // `throw new Error(list.error)` - the one gap in this chain that
      // named nothing, because at this point the tile has not even been
      // looked up yet. Naming that this is the course-listing step (not
      // which course, since none is known yet) is what closes it.
      if ("error" in list) {
        throw new Error(`Could not list your course tiles: ${list.error}`);
      }
      const course = list.courses.find((c) => c.id === courseId);
      if (!course) return null;
      // Skips app-generated cartridges - see latestSourceExportFile's own
      // doc comment and docs/REGRESSION.md entry 196. A course whose export
      // files are ALL generated has no source export, which is an expected
      // absence (null), not a genuine I/O failure (throw). Kept in sync with
      // the unattended counterpart (step-helpers-server.ts's loadCourseExport)
      // per this function's own header comment.
      const latest = latestSourceExportFile(course);
      if (!latest) return null;
      const cached = courseExportCacheRef.current.get(latest.path);
      if (cached) return cached;
      const promise = (async () => {
        try {
          const blob = await downloadCourseZipBlob(supabase, latest);
          return await parseCartridgeBlob(blob);
        } catch (err) {
          // AC2 (defect run 556b49f0): downloadCourseZipBlob/parseCartridgeBlob
          // only ever see a storage object path, never the tile or export
          // file a human recognizes - naming both HERE, the one place both
          // are in scope, is what turns a bare "Failed to fetch" into
          // something diagnosable: which tile, which export file, and the
          // underlying error, all in one message.
          const underlying = err instanceof Error ? err.message : String(err);
          throw new Error(
            `Could not read "${course.name}"'s LMS export "${latest.name}": ${underlying}`
          );
        }
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

  // `stepsOpen || editing` mirrors the old `panel === "build"` signal: the
  // Steps disclosure's contents (scope control, WorkflowBuilder) are what
  // need these option lists eager-loaded, and they render exactly when this
  // is true (see WorkflowPanel's stepsUiOpen).
  const workflowOptions = useWorkflowOptions(stepsOpen || editing, runtimeFields, values, activeInstitution, loadCourseExportData, automation.schedules, automation.scheduleForm, automation.triggerForm);

  const onSetPendingHandoff = setPendingHandoff;
  const onSetHubCourses = workflowOptions.setHubCourses;

  // Recent group (AC2): records only workflows whose run actually started
  // (validation passed) - called from useWorkflowRun's handleRun once
  // validateForm succeeds, so a failed/blocked Run click never pollutes it.
  const onRunStart = useCallback((workflowId: string) => {
    setRecentWorkflowIds((prev) => [workflowId, ...prev.filter((id) => id !== workflowId)].slice(0, 5));
  }, []);

  const workflowRun = useWorkflowRun(expanded, enabledExpandedSteps, disabledSteps, selectedDef, selectedWorkflowId, workflows, values, uploadFiles, runtimeFields, activeInstitution, user, supabase, loadCourseExportData, onSetPendingHandoff, onSetHubCourses, onRunStart, pendingHandoff);

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

  // Consume the legacy `ta-workflows-panel` key once per mount (it may have
  // just been written by the Automations tab's "jump to this workflow's
  // automation section" link, or be left over from before this feature
  // shipped) so it can't linger and keep overriding the per-disclosure keys
  // below on a later, unrelated mount.
  useEffect(() => {
    try {
      if (localStorage.getItem("ta-workflows-panel") !== null) {
        localStorage.removeItem("ta-workflows-panel");
      }
    } catch {
      // ignore storage failures
    }
    // Intentionally runs once on mount only - see comment above.
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("ta-workflows-steps-open", stepsOpen ? "true" : "false");
    } catch {
      // ignore storage write failures
    }
  }, [stepsOpen]);

  useEffect(() => {
    try {
      localStorage.setItem("ta-workflows-run-history-open", runHistoryOpen ? "true" : "false");
    } catch {
      // ignore storage write failures
    }
  }, [runHistoryOpen]);

  useEffect(() => {
    try {
      localStorage.setItem("ta-workflows-automation-open", automationOpen ? "true" : "false");
    } catch {
      // ignore storage write failures
    }
  }, [automationOpen]);

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

  // Reconciles selectedWorkflowId against `workflows` whenever it drifts
  // WITHOUT a click - i.e. handleWorkflowChange did not just update
  // loadedForIdRef itself. Two cases (see resolveSelectionReconciliation):
  // a deep-linked id resolving once the async custom-def load lands it (id
  // unchanged, but `values`/`disabledSteps` were loaded against the mount-time
  // fallback and need reloading for the real id), and a stale id that never
  // resolves, which falls back to workflows[0] only once the load has
  // definitively settled (customLoaded && !customLoadFailed) - matching
  // today's ultimate fallback, but now deferred until it is safe to judge the
  // id gone.
  useEffect(() => {
    const action = resolveSelectionReconciliation(
      selectedWorkflowId,
      loadedForIdRef.current,
      workflows,
      customLoaded,
      customLoadFailed
    );
    if (action.type === "none") return;

    let cancelled = false;

    (async () => {
      // No real async work is required; the await defers the state updates
      // past this render pass so they are not "setState synchronously from
      // an effect" (the lint rule this repo enforces - see the cancelled-flag
      // idiom used throughout this file and useWorkflowOptions).
      await Promise.resolve();
      if (cancelled) return;

      loadedForIdRef.current = action.id;
      if (action.type === "fallback") {
        setSelectedWorkflowId(action.id);
      }
      const state = loadWorkflowFormState(action.id);
      setValues(state.values);
      setDisabledSteps(state.disabledSteps);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedWorkflowId, workflows, customLoaded, customLoadFailed, loadWorkflowFormState]);

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


  const handleWorkflowChange = useCallback(
    (newId: string) => {
      setSelectedWorkflowId(newId);
      setEditing(false);
      setDeleteArmed(false);
      // Keep the reconciliation effect's "loaded for" tracker in sync so it
      // treats this click as already reconciled and stays a no-op.
      loadedForIdRef.current = newId;
      const state = loadWorkflowFormState(newId);
      setValues(state.values);
      setDisabledSteps(state.disabledSteps);
    },
    [loadWorkflowFormState]
  );

  // Set the selected workflow's workflow-level targets and persist - for a
  // preset (selectedDef.preset) this saves against the PRESET'S OWN id via
  // toStoredDef (a scope-only delta, resolved back onto the current preset
  // every time the list is built - see preset-overrides.ts), not a
  // duplicate; for a plain custom workflow it is a normal field update.
  // Either way this is the ONLY place a scope edit is persisted, so there is
  // no more preset/custom branch to keep in sync (see docs/REGRESSION.md #153).
  const handleScopeChange = (scope: WorkflowScope) => {
    if (!selectedDef) return;
    // selectedDef already reflects any in-flight builder step edit, so `next`
    // carries both. Cancel the builder's pending debounced save (whose queued
    // def has no scope) so it cannot clobber this write.
    const next: WorkflowDef = { ...selectedDef, scope };
    const stored = toStoredDef(next, getPresetDef);
    updateCustom(upsertWorkflowDefById(custom, stored));
    if (user && supabase) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      pendingDefRef.current = null;
      void upsertWorkflowDef(supabase, user.id, stored).catch(console.error);
    }
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
      return;
    }
    handoffArmedRef.current = false;
    setPendingHandoff(null);
    void workflowRun.handleRun();
  }, [pendingHandoff, workflowRun, selectedWorkflowId, values, handleWorkflowChange]);

  return (
    <TabShell>
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
          onRunClick={(id) => handleWorkflowChange(id)}
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
          }}
        />

        <div className={styles.form} style={{ flex: 1, minWidth: 320 }}>
          {!selectedDef ? (
            <p className={styles.fieldHint}>Select a workflow from the list, or create a new one.</p>
          ) : (
            <WorkflowPanel
              selectedDef={selectedDef}
              expandedError={expanded.error}
              editing={editing}
              setEditing={setEditing}
              deleteArmed={deleteArmed}
              setDeleteArmed={setDeleteArmed}
              expanded={expanded}
              disabledSteps={disabledSteps}
              setDisabledSteps={setDisabledSteps}
              disabledStepsWithEnabledDependents={disabledStepsWithEnabledDependents}
              user={user}
              supabase={supabase}
              custom={custom}
              workflows={workflows}
              updateCustom={updateCustom}
              handleWorkflowChange={handleWorkflowChange}
              handleScopeChange={handleScopeChange}
              pendingDefRef={pendingDefRef}
              saveTimerRef={saveTimerRef}
              running={workflowRun.running}
              runPause={workflowRun.runPause}
              runInput={workflowRun.runInput}
              selectedWorkflowId={selectedWorkflowId}
              runtimeFields={runtimeFields}
              values={values}
              onValueChange={handleValueChange}
              validationError={workflowRun.validationError}
              runState={workflowRun.runState}
              stopRequested={workflowRun.stopRequested}
              onStopAfterCourse={workflowRun.stopAfterCurrentCourse}
              pauseResolverRef={workflowRun.pauseResolverRef}
              inputResolverRef={workflowRun.inputResolverRef}
              onRunClick={workflowRun.handleRun}
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
                assignmentTemplates: workflowOptions.assignmentTemplates,
                assignmentTemplatesError: workflowOptions.assignmentTemplatesError,
                testTemplates: workflowOptions.testTemplates,
                testTemplatesError: workflowOptions.testTemplatesError,
                classSessionTemplates: workflowOptions.classSessionTemplates,
                classSessionTemplatesError: workflowOptions.classSessionTemplatesError,
                institutions,
                activeInstitution,
              }}
              tableHasGrade={workflowRun.tableHasGrade}
              tableGradeBand={tableGradeBand}
              initialRunInputRows={workflowRun.runInputInitialRows}
              isWorkflowHeadlessSafeById={isWorkflowHeadlessSafeById}
              selectedHeadlessSafe={selectedHeadlessSafe}
              automation={automation}
              stepsOpen={stepsOpen}
              onToggleSteps={() => setStepsOpen((prev) => !prev)}
              runHistoryOpen={runHistoryOpen}
              onToggleRunHistory={() => setRunHistoryOpen((prev) => !prev)}
              automationOpen={automationOpen}
              onToggleAutomation={() => setAutomationOpen((prev) => !prev)}
            />
          )}
        </div>
      </div>
    </TabShell>
  );
}
