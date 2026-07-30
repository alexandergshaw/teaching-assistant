"use client";

// The merged Workflows page for a selected workflow: configure it (scope,
// step toggles, edit/duplicate/delete), run it (inputs, run button,
// progress), and schedule/trigger it - one scroll, no inner tab strip. This
// replaces the old three-way Build/Run/Automate tab strip (see
// workflow-panel-migration.ts for how a returning user's persisted tab
// choice maps onto this page's two disclosures).
//
// Layout (AC1/AC2): the run form is the page's primary, always-visible
// content - it's what most visits are for. "Steps" (workflow configuration)
// and "Schedule & trigger" are the least frequently touched, so both are
// disclosures collapsed by default, each labelled with a live summary (step
// counts; schedule/trigger counts) so the closed state alone answers "is
// anything set up here" without opening it. This reclaims real estate that
// the old Build tab always spent on the full scope control + step list, and
// the old Automate tab always spent on the schedule/trigger forms and their
// lists, even on a visit that only wanted to hit Run.
//
// A third disclosure, "Run history", sits right after the run form/Run
// Progress block and before "Schedule & trigger": placing it before the run
// form (alongside "Steps") would push that primary content further down the
// page on every visit; placing it here costs nothing when collapsed (the
// default) and reads in a coherent order - configure (Steps), do (run form +
// progress), review what already happened (Run history), automate what
// happens next (Schedule & trigger). It reuses AutomationRunsSection exactly
// as the Automations hub does, filtered by workflowId instead of triggerRef so
// a manually-run workflow's log - unreachable from Automations, since that
// tab only ever shows runs a schedule/trigger caused - is finally reachable
// from the workflow that produced it. Lazy like the other two: it only
// fetches once opened (see WorkflowsTab's runHistoryOpen).
//
// AC3: editing steps (or scheduling/triggering) mid-run is incoherent, the
// same reason the old Build/Automate tabs were disabled outright during a
// run. On one page that content can no longer simply be hidden - the run's
// own progress lives right below it - so LockableSection below renders a
// visible reason and wraps the affordances in a <fieldset disabled>, which
// natively disables every nested input/button/select without threading a
// `disabled` prop through WorkflowScopeControl, StepOverviewRow,
// ScheduleEditForm and TriggerEditForm individually.

import { Fragment, useState, type ReactNode } from "react";
import { Button } from "@mui/material";
import WorkflowBuilder from "../WorkflowBuilder";
import WorkflowScopeControl from "../WorkflowScopeControl";
import { StepOverviewRow } from "./StepOverviewRow";
import { RuntimeFieldInput } from "./RuntimeFieldInput";
import { RunStepCard } from "./RunStepCard";
import { RunInputPrompt } from "./RunInputPrompt";
import { ScheduleSection } from "./ScheduleSection";
import { TriggerSection } from "./TriggerSection";
import { AutomationRunsSection } from "./AutomationRunsSection";
import { SummaryView, compareTableValues, csvCell, tableGradeIssue, GradeBadge, DetailSectionsView, type GradeBand } from "./run-results";
import { buildCourseFanoutSummary, countOkCourses, type RunStateGroup } from "./attended-fanout";
import { composedGroupLabel } from "@/lib/workflows/fanout";
import { upsertWorkflowDef, deleteWorkflowDef } from "@/lib/workflow-defs";
import { describeWorkflowScope, upsertWorkflowDefById } from "@/lib/workflows/types";
import { describeAutomationSummary } from "./workflow-panel-migration";
import { getStepDefinition as getStepDefinitionImpl } from "@/lib/workflows/registry";
import { getPresetDef } from "@/lib/workflows/presets";
import { toStoredDef } from "@/lib/workflows/preset-overrides";
import type { WorkflowDef, RuntimeField, WorkflowStepConfig, WorkflowScope } from "@/lib/workflows/types";
import type { UseWorkflowRunReturn } from "./useWorkflowRun";
import type { UseAutomationReturn } from "./useAutomation";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../../page.module.css";

interface WorkflowOptions {
  orgs: string[] | null;
  orgsError: string | null;
  hubCourses: Array<{ id: string; name: string; canvasUrl: string | null; repos: string[] }> | null;
  hubCoursesError: string | null;
  lmsCourseOptions: Array<{ url: string; name: string }> | null;
  lmsCourseOptionsError: string | null;
  lmsModuleOptions: Array<{ value: string; label: string }>;
  lmsModuleError: string | null;
  lmsModuleFromExport: boolean;
  deckTemplates: Array<{ id: string; name: string }> | null;
  deckTemplatesError: string | null;
  assignmentTemplates: Array<{ id: string; name: string }> | null;
  assignmentTemplatesError: string | null;
  testTemplates: Array<{ id: string; name: string }> | null;
  testTemplatesError: string | null;
  classSessionTemplates: Array<{ id: string; name: string }> | null;
  classSessionTemplatesError: string | null;
  institutions: string[];
  activeInstitution: string | null;
}

interface WorkflowPanelProps {
  selectedDef: WorkflowDef;
  expandedError: string | null;

  // Steps / configure
  editing: boolean;
  setEditing: (editing: boolean) => void;
  deleteArmed: boolean;
  setDeleteArmed: (armed: boolean) => void;
  expanded: { steps: WorkflowStepConfig[]; origins: Array<string | null>; topIndices: number[]; error: string | null };
  disabledSteps: Set<number>;
  setDisabledSteps: (steps: Set<number> | ((prev: Set<number>) => Set<number>)) => void;
  disabledStepsWithEnabledDependents: Set<number>;
  user: User | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any> | null;
  custom: WorkflowDef[];
  workflows: WorkflowDef[];
  updateCustom: (defs: WorkflowDef[]) => void;
  handleWorkflowChange: (id: string) => void;
  handleScopeChange: (scope: WorkflowScope) => void;
  pendingDefRef: React.MutableRefObject<WorkflowDef | null>;
  saveTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;

  // Run lifecycle - running/runPause/runInput together drive the AC3 lock
  // for Steps and Schedule & trigger (runPause/runInput also render their
  // own prompts within Run Progress below).
  running: boolean;
  runPause: UseWorkflowRunReturn["runPause"];
  runInput: UseWorkflowRunReturn["runInput"];

  // Run form
  selectedWorkflowId: string;
  runtimeFields: RuntimeField[];
  values: Record<string, string>;
  onValueChange: (fieldKey: string, value: string) => void;
  validationError: string | null;
  runState: RunStateGroup[];
  stopRequested: boolean;
  onStopAfterCourse: () => void;
  pauseResolverRef: React.MutableRefObject<{ resolve: (go: boolean) => void } | null>;
  inputResolverRef: React.MutableRefObject<{ resolve: (value: string | Record<string, string>[] | File[] | null) => void } | null>;
  onRunClick: () => void;
  allStepsDisabled: boolean;
  uploadFiles: Record<string, File[]>;
  onUploadFilesChange: (files: Record<string, File[]> | ((prev: Record<string, File[]>) => Record<string, File[]>)) => void;
  optionsForFields: WorkflowOptions;
  tableHasGrade: boolean;
  tableGradeBand: (row: Record<string, string>) => { band: GradeBand; pct: number | null };
  initialRunInputRows: Array<Record<string, string>>;

  // Schedule & trigger
  isWorkflowHeadlessSafeById: (workflowId: string) => boolean;
  selectedHeadlessSafe: boolean;
  automation: UseAutomationReturn;

  // Disclosure open state is owned by WorkflowsTab (not this component) so
  // useWorkflowOptions can gate its eager-loading on "is Steps open" the same
  // way it used to gate on `panel === "build"`, and so the Automations tab's
  // "jump to this workflow's automation section" navigation (which writes
  // the legacy `ta-workflows-panel` key) can force it open on every click,
  // not just once - see WorkflowsTab and workflow-panel-migration.ts.
  stepsOpen: boolean;
  onToggleSteps: () => void;
  runHistoryOpen: boolean;
  onToggleRunHistory: () => void;
  automationOpen: boolean;
  onToggleAutomation: () => void;
}

/** A collapsible section header - shared by "Steps", "Schedule & trigger",
 * and the run form's "Optional inputs" so all three disclosures in this page
 * look and behave the same way. */
function DisclosureToggle({ open, onClick, children }: { open: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      style={{
        textAlign: "left",
        padding: "8px 0",
        borderRadius: 0,
        border: "none",
        borderTop: "1px solid var(--field-border)",
        cursor: "pointer",
        background: "transparent",
        color: "var(--text-primary)",
        fontWeight: 600,
        fontSize: "0.9em",
        display: "flex",
        alignItems: "center",
        gap: 6,
        width: "100%",
        marginTop: 12,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: "6px",
          height: "6px",
          transform: open ? "rotate(0deg)" : "rotate(-90deg)",
          transition: "transform 0.2s",
          flex: "none",
        }}
      >
        <svg width="6" height="6" viewBox="0 0 6 6" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 2L3 4L5 2" stroke="currentColor" strokeWidth="0.75" />
        </svg>
      </span>
      {children}
    </button>
  );
}

/** Wraps editing affordances that must go read-only during a run (AC3): a
 * visible reason plus a native <fieldset disabled>, which disables every
 * nested input/button/select without threading a `disabled` prop through
 * each of WorkflowScopeControl/StepOverviewRow/ScheduleEditForm/
 * TriggerEditForm's many internal controls. */
function LockableSection({ locked, reason, children }: { locked: boolean; reason: string; children: ReactNode }) {
  return (
    <div style={{ padding: "10px 0 4px" }}>
      {locked && (
        <p className={styles.fieldHint} style={{ margin: "0 0 10px 0", fontStyle: "italic" }}>
          {reason}
        </p>
      )}
      <fieldset
        disabled={locked}
        style={{
          border: "none",
          margin: 0,
          padding: 0,
          opacity: locked ? 0.6 : 1,
          pointerEvents: locked ? "none" : undefined,
        }}
      >
        {children}
      </fieldset>
    </div>
  );
}

export function WorkflowPanel({
  selectedDef,
  expandedError,
  editing,
  setEditing,
  deleteArmed,
  setDeleteArmed,
  expanded,
  disabledSteps,
  setDisabledSteps,
  disabledStepsWithEnabledDependents,
  user,
  supabase,
  custom,
  workflows,
  updateCustom,
  handleWorkflowChange,
  handleScopeChange,
  pendingDefRef,
  saveTimerRef,
  running,
  runPause,
  runInput,
  selectedWorkflowId,
  runtimeFields,
  values,
  onValueChange,
  validationError,
  runState,
  stopRequested,
  onStopAfterCourse,
  pauseResolverRef,
  inputResolverRef,
  onRunClick,
  allStepsDisabled,
  uploadFiles,
  onUploadFilesChange,
  optionsForFields,
  tableHasGrade,
  tableGradeBand,
  initialRunInputRows,
  isWorkflowHeadlessSafeById,
  selectedHeadlessSafe,
  automation,
  stepsOpen,
  onToggleSteps,
  runHistoryOpen,
  onToggleRunHistory,
  automationOpen,
  onToggleAutomation,
}: WorkflowPanelProps) {
  const getStepDefinition = getStepDefinitionImpl;

  const [optionalFieldsOpen, setOptionalFieldsOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ta-workflows-optional-open") === "true";
  });
  const persistOptionalFieldsOpen = (next: boolean) => {
    setOptionalFieldsOpen(next);
    try {
      localStorage.setItem("ta-workflows-optional-open", next ? "true" : "false");
    } catch {
      // ignore storage write failures
    }
  };

  // Editing a workflow's steps force-opens the Steps disclosure so
  // WorkflowBuilder is never hidden behind a collapsed toggle.
  const stepsUiOpen = stepsOpen || editing;

  // AC3: the same run-in-progress signal that used to disable the whole
  // Build/Automate tab now locks only the editing affordances within each
  // disclosure, with the reason stated inline rather than a dead control.
  const editingLocked = running || !!runPause || !!runInput;

  const enabledStepCount = expanded.steps.filter((_, i) => !disabledSteps.has(expanded.topIndices[i])).length;
  const totalStepCount = expanded.steps.length;

  const workflowSchedules = (automation.schedules ?? []).filter((s) => s.workflowId === selectedDef.id);
  const workflowTriggers = (automation.triggers ?? []).filter((t) => t.workflowId === selectedDef.id);

  const requiredFields = runtimeFields.filter((f) => f.required);
  const optionalFields = runtimeFields.filter((f) => !f.required);
  const showOptionalDisclosure = optionalFields.length >= 3;
  const isCourseFanoutRun = runState.some((grp) => !!grp.courseId);

  // Auto-expand disclosure on validation errors targeting hidden fields
  if (validationError && !optionalFieldsOpen && showOptionalDisclosure) {
    const errorText = validationError.toLowerCase();
    const optionalFieldNames = optionalFields.map((f) => f.label.toLowerCase());
    if (optionalFieldNames.some((name) => errorText.includes(name))) {
      persistOptionalFieldsOpen(true);
    }
  }

  const fieldOptions = {
    orgs: optionsForFields.orgs,
    orgsError: optionsForFields.orgsError,
    hubCourses: optionsForFields.hubCourses,
    hubCoursesError: optionsForFields.hubCoursesError,
    lmsCourseOptions: optionsForFields.lmsCourseOptions,
    lmsCourseOptionsError: optionsForFields.lmsCourseOptionsError,
    lmsModuleOptions: optionsForFields.lmsModuleOptions,
    lmsModuleError: optionsForFields.lmsModuleError,
    lmsModuleFromExport: optionsForFields.lmsModuleFromExport,
    lmsModuleCanvasUrl: "",
    deckTemplates: optionsForFields.deckTemplates,
    deckTemplatesError: optionsForFields.deckTemplatesError,
    assignmentTemplates: optionsForFields.assignmentTemplates,
    assignmentTemplatesError: optionsForFields.assignmentTemplatesError,
    testTemplates: optionsForFields.testTemplates,
    testTemplatesError: optionsForFields.testTemplatesError,
    classSessionTemplates: optionsForFields.classSessionTemplates,
    classSessionTemplatesError: optionsForFields.classSessionTemplatesError,
    institutions: optionsForFields.institutions,
    activeInstitution: optionsForFields.activeInstitution,
  };

  return (
    <>
      {/* Shared header - name/description/scope badge used to be rendered
          once by Build (description) and once by Run (name + description +
          scope badge); now rendered exactly once (AC2). */}
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 4px 0" }}>{selectedDef.name}</h2>
        {selectedDef.description && (
          <p className={styles.fieldHint} style={{ margin: "0 0 8px 0" }}>
            {selectedDef.description}
          </p>
        )}
        {describeWorkflowScope(selectedDef.scope) && (
          <div className={styles.ghBadge} style={{ display: "inline-block", fontSize: "0.85em", padding: "4px 8px" }}>
            Scoped: {describeWorkflowScope(selectedDef.scope)}
          </div>
        )}
      </div>

      {expandedError && <p className={styles.error}>{expandedError}</p>}

      {/* Steps / configure - collapsed by default (AC2); force-open while
          editing so WorkflowBuilder is never hidden. */}
      <DisclosureToggle open={stepsUiOpen} onClick={onToggleSteps}>
        Steps ({totalStepCount === 0 ? "none" : `${enabledStepCount}/${totalStepCount} enabled`})
      </DisclosureToggle>
      {stepsUiOpen && (
        <LockableSection locked={editingLocked} reason="Editing steps is locked while this workflow is running.">
          {selectedDef.preset && selectedDef.presetOverride?.diverged && (
            <p className={styles.error} style={{ marginBottom: 8 }}>
              This workflow has diverged from its preset: steps were added,
              removed, or reordered, so it now has its own step list and will
              NOT automatically pick up new preset steps. Reset to shipped to
              discard your edits and return to the current preset.
            </p>
          )}
          {selectedDef.preset && selectedDef.presetOverride && !selectedDef.presetOverride.diverged && (
            <p className={styles.fieldHint} style={{ marginBottom: 8 }}>
              This preset has been customized - your changes merge with any
              future preset updates automatically.
            </p>
          )}
          {selectedDef.preset && !selectedDef.presetOverride && (
            <p className={styles.fieldHint} style={{ marginBottom: 8 }}>
              This is a preset - editing scope or steps below saves your
              changes directly to it, for you only.
            </p>
          )}
          <WorkflowScopeControl
            scope={selectedDef.scope ?? {}}
            onChange={handleScopeChange}
            hubCourses={fieldOptions.hubCourses}
            institutions={fieldOptions.institutions}
            orgs={fieldOptions.orgs}
            lmsCourseOptions={fieldOptions.lmsCourseOptions}
            activeInstitution={fieldOptions.activeInstitution || null}
          />

          {!editing && (
            <div className={styles.fieldHint}>
              <div style={{ margin: "6px 0" }}>
                Turn a step off to skip it in your own runs - this only
                affects you; the workflow itself (and other users) is
                unchanged.
              </div>
              {expanded.steps.map((step, i) => {
                const stepDef = getStepDefinition(step.type);
                const topIndex = expanded.topIndices[i];
                const isDisabled = disabledSteps.has(topIndex);
                return (
                  <StepOverviewRow
                    key={i}
                    step={step}
                    index={i}
                    disabled={isDisabled}
                    origin={expanded.origins[i] ?? undefined}
                    dependencyWarning={disabledStepsWithEnabledDependents.has(topIndex)}
                    onToggle={() => {
                      setDisabledSteps((prev: Set<number>) => {
                        const next = new Set(prev);
                        if (next.has(topIndex)) next.delete(topIndex);
                        else next.add(topIndex);
                        return next;
                      });
                    }}
                    stepDef={stepDef}
                  />
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <Button size="small" variant="outlined" onClick={() => setEditing(true)}>
              Edit
            </Button>

            {!selectedDef.preset && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  if (!deleteArmed) {
                    setDeleteArmed(true);
                  } else {
                    if (user && supabase) {
                      void deleteWorkflowDef(supabase, selectedDef.id).catch(console.error);
                    }
                    updateCustom(custom.filter((w) => w.id !== selectedDef.id));
                    try {
                      localStorage.removeItem(`ta-workflow-values-${selectedDef.id}`);
                    } catch {
                      // Ignore storage failures; the key is best-effort cleanup.
                    }
                    const next = workflows.find((w) => w.id !== selectedDef.id);
                    const newId = next?.id ?? workflows[0]?.id;
                    if (newId) handleWorkflowChange(newId);
                  }
                }}
              >
                {deleteArmed ? "Confirm delete" : "Delete"}
              </Button>
            )}

            {/* A preset has nothing to "delete" (the preset itself is code,
                always available) - once it has a saved override, "Reset to
                shipped" is the equivalent destructive action: discard the
                override and go back to the preset exactly as shipped (AC6).
                Reuses deleteArmed/setDeleteArmed - the two buttons never
                render for the same selectedDef, so the confirm state can't
                cross-contaminate between them. */}
            {selectedDef.preset && selectedDef.presetOverride && (
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  if (!deleteArmed) {
                    setDeleteArmed(true);
                  } else {
                    if (user && supabase) {
                      void deleteWorkflowDef(supabase, selectedDef.id).catch(console.error);
                    }
                    updateCustom(custom.filter((w) => w.id !== selectedDef.id));
                    setDeleteArmed(false);
                  }
                }}
              >
                {deleteArmed ? "Confirm reset" : "Reset to shipped"}
              </Button>
            )}
          </div>

          {editing && (
            <WorkflowBuilder
              def={selectedDef}
              others={workflows.filter((w) => w.id !== selectedDef.id)}
              picker={{ hubCourses: fieldOptions.hubCourses, institutions: fieldOptions.institutions, orgs: fieldOptions.orgs }}
              onChange={(next) => {
                // Saves against `next.id`'s OWN identity: for a preset id
                // this computes the delta over the CURRENT code preset
                // (toStoredDef -> diffAgainstPreset) instead of freezing a
                // full copy; for a plain custom workflow it is unchanged
                // from before (see docs/REGRESSION.md #153). upsertWorkflowDefById
                // (not a plain .map) is required here because the FIRST edit
                // to a never-before-customized preset has no existing entry
                // in `custom` to replace.
                const stored = toStoredDef(next, getPresetDef);
                updateCustom(upsertWorkflowDefById(custom, stored));
                if (user && supabase) {
                  pendingDefRef.current = stored;
                  if (saveTimerRef.current) {
                    clearTimeout(saveTimerRef.current);
                  }
                  saveTimerRef.current = setTimeout(() => {
                    if (pendingDefRef.current) {
                      void upsertWorkflowDef(supabase, user.id, pendingDefRef.current).catch(console.error);
                    }
                    pendingDefRef.current = null;
                  }, 800);
                }
              }}
              onDone={() => {
                if (user && supabase && saveTimerRef.current) {
                  clearTimeout(saveTimerRef.current);
                  if (pendingDefRef.current) {
                    void upsertWorkflowDef(supabase, user.id, pendingDefRef.current).catch(console.error);
                  }
                  pendingDefRef.current = null;
                }
                setEditing(false);
              }}
            />
          )}
        </LockableSection>
      )}

      {/* Run form - the page's primary content, always visible. */}
      <div style={{ marginTop: 16 }}>
        {requiredFields.map((field) => (
          <RuntimeFieldInput
            key={field.fieldKey}
            field={field}
            value={values[field.fieldKey] ?? ""}
            onChange={(newValue) => onValueChange(field.fieldKey, newValue)}
            options={fieldOptions}
            uploads={{ files: uploadFiles, setFiles: onUploadFilesChange }}
          />
        ))}

        {showOptionalDisclosure && (
          <>
            <DisclosureToggle open={optionalFieldsOpen} onClick={() => persistOptionalFieldsOpen(!optionalFieldsOpen)}>
              Optional inputs ({optionalFields.length})
            </DisclosureToggle>

            {optionalFieldsOpen &&
              optionalFields.map((field) => (
                <RuntimeFieldInput
                  key={field.fieldKey}
                  field={field}
                  value={values[field.fieldKey] ?? ""}
                  onChange={(newValue) => onValueChange(field.fieldKey, newValue)}
                  options={fieldOptions}
                  uploads={{ files: uploadFiles, setFiles: onUploadFilesChange }}
                />
              ))}
          </>
        )}

        {optionalFields.length < 3 &&
          optionalFields.map((field) => (
            <RuntimeFieldInput
              key={field.fieldKey}
              field={field}
              value={values[field.fieldKey] ?? ""}
              onChange={(newValue) => onValueChange(field.fieldKey, newValue)}
              options={fieldOptions}
              uploads={{ files: uploadFiles, setFiles: onUploadFilesChange }}
            />
          ))}

        {validationError && <p className={styles.error}>{validationError}</p>}

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
          <Button
            variant="contained"
            onClick={onRunClick}
            disabled={running || !!runPause || !!runInput || !!expandedError || allStepsDisabled}
            size="small"
          >
            {running ? "Running..." : "Run"}
          </Button>
          {allStepsDisabled && (
            <span className={styles.fieldHint} style={{ color: "var(--danger)" }}>
              Enable at least one step.
            </span>
          )}
        </div>

        {runState.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <h2 style={{ fontSize: "1rem", marginBottom: 16 }}>Run Progress</h2>
            {(runState.some((grp) => grp.institution !== null) || isCourseFanoutRun) && (
              <p className={styles.fieldHint} style={{ margin: "0 0 12px 0" }}>
                {isCourseFanoutRun ? countOkCourses(runState) : runState.filter((grp) => grp.steps.every((s) => s.status !== "error")).length}/{runState.length} {isCourseFanoutRun ? "courses" : "institutions"} ok
              </p>
            )}
            {running && isCourseFanoutRun && (
              <div style={{ marginBottom: 12 }}>
                <Button size="small" variant="outlined" onClick={onStopAfterCourse} disabled={stopRequested}>
                  {stopRequested ? "Stopping after this course..." : "Stop after this course"}
                </Button>
              </div>
            )}
            {runState.map((group, g) => (
              <Fragment key={group.courseId ?? group.institution ?? g}>
                {group.institution && !group.courseId && (
                  <h3 style={{ fontSize: "0.85rem", fontWeight: 600, margin: g === 0 ? "0 0 4px 0" : "20px 0 4px 0", color: "var(--hint-text)" }}>
                    {group.institution}
                  </h3>
                )}
                {group.courseId && (
                  <h3 style={{ fontSize: "0.85rem", fontWeight: 600, margin: g === 0 ? "0 0 4px 0" : "20px 0 4px 0", color: "var(--hint-text)" }}>
                    Course {g + 1} of {runState.length}: {composedGroupLabel(group.courseName ?? "", group.institution)}
                  </h3>
                )}
                {group.steps.map((state, i) => {
                  const stepDef = getStepDefinition(expanded.steps[i]?.type ?? "");
                  return (
                    <RunStepCard
                      key={i}
                      index={i}
                      stepDef={stepDef}
                      origin={expanded.origins[i] ?? undefined}
                      state={state}
                      summary={state.summary ? <SummaryView summary={state.summary} /> : undefined}
                    >
                      {runPause && runPause.groupIndex === g && runPause.stepIndex === i && (
                        <div style={{ marginTop: 12 }}>
                          <p className={styles.fieldHint}>{runPause.message}</p>
                          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                            <Button
                              size="small"
                              variant="contained"
                              onClick={() => {
                                pauseResolverRef.current?.resolve(true);
                              }}
                            >
                              Continue
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => {
                                pauseResolverRef.current?.resolve(false);
                              }}
                            >
                              Cancel run
                            </Button>
                          </div>
                        </div>
                      )}

                      {runInput && runInput.groupIndex === g && runInput.stepIndex === i && (
                        <RunInputPrompt
                          runInput={runInput}
                          onSubmit={(value) => {
                            inputResolverRef.current?.resolve(value as string | Record<string, string>[] | File[] | null);
                          }}
                          onSkip={() => {
                            inputResolverRef.current?.resolve(null);
                          }}
                          tableHasGrade={tableHasGrade}
                          tableGradeIssue={tableGradeIssue}
                          tableGradeBand={tableGradeBand}
                          compareTableValues={compareTableValues}
                          csvCell={csvCell}
                          initialRows={initialRunInputRows}
                          GradeBadge={GradeBadge}
                          DetailSectionsView={DetailSectionsView}
                        />
                      )}
                    </RunStepCard>
                  );
                })}
              </Fragment>
            ))}

            {!running && isCourseFanoutRun && (
              <div style={{ marginTop: 20 }}>
                {runState.map((group, g) => {
                  const status = group.courseStatus ?? "skipped";
                  const badgeClass =
                    status === "ok" ? styles.ghBadgeSuccess : status === "failed" ? styles.ghBadgeDanger : styles.ghBadgeNeutral;
                  const label = status === "ok" ? "OK" : status === "failed" ? "Failed" : "Skipped";
                  return (
                    <div
                      key={group.courseId ?? g}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "6px 0",
                        borderBottom: "1px solid var(--field-border)",
                      }}
                    >
                      <span>{group.courseName}</span>
                      <span className={`${styles.ghBadge} ${badgeClass}`}>{label}</span>
                    </div>
                  );
                })}
                <p className={styles.fieldHint} style={{ marginTop: 12, fontWeight: 600 }}>
                  {buildCourseFanoutSummary(
                    runState.map((group) => ({
                      courseId: group.courseId ?? "",
                      courseName: group.courseName ?? "",
                      status: group.courseStatus ?? "skipped",
                    }))
                  )}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Run history - collapsed by default, placed after the run form
          (rather than beside Steps, before it) so it never pushes the run
          form down the page - see this file's header comment for the full
          placement rationale. No live count in the toggle label: unlike
          Steps/Schedule & trigger, whose counts come from state already
          loaded for other reasons, a run count would mean fetching runs
          just to render the closed disclosure - exactly the eager query
          AC4 rules out. */}
      <DisclosureToggle open={runHistoryOpen} onClick={onToggleRunHistory}>
        Run history
      </DisclosureToggle>
      {runHistoryOpen && (
        <div style={{ padding: "10px 0 4px" }}>
          <AutomationRunsSection
            workflowId={selectedDef.id}
            workflowName={selectedDef.name}
            emptyMessage="This workflow has not been run yet."
          />
        </div>
      )}

      {/* Schedule & trigger - collapsed by default (AC2), summarized so the
          common "nothing set up" case is visible without opening it. */}
      <DisclosureToggle open={automationOpen} onClick={onToggleAutomation}>
        Schedule &amp; trigger ({describeAutomationSummary(workflowSchedules.length, workflowTriggers.length)})
      </DisclosureToggle>
      {automationOpen && (
        <LockableSection locked={editingLocked} reason="Scheduling and triggers are locked while this workflow is running.">
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
            hubCourses={fieldOptions.hubCourses}
            institutions={fieldOptions.institutions}
            activeInstitution={fieldOptions.activeInstitution}
            user={user}
            expandedError={expandedError}
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
            hubCourses={fieldOptions.hubCourses}
            institutions={fieldOptions.institutions}
            activeInstitution={fieldOptions.activeInstitution}
            user={user}
            expandedError={expandedError}
            isWorkflowHeadlessSafeById={isWorkflowHeadlessSafeById}
            selectedHeadlessSafe={selectedHeadlessSafe}
            webhookSetup={automation.webhookSetup}
            setWebhookSetup={automation.setWebhookSetup}
            webhookBaseUrl={automation.webhookBaseUrl}
            orgs={fieldOptions.orgs}
            orgsError={fieldOptions.orgsError}
            workflows={workflows}
            onCreate={automation.handleCreateTrigger}
            onSaveEdit={automation.handleSaveEditTrigger}
            onToggle={automation.handleToggleTrigger}
            onDelete={automation.handleDeleteTrigger}
          />
        </LockableSection>
      )}
    </>
  );
}
