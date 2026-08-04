"use client";

import { useState, useRef } from "react";
import { scopeForInstitution, scopeForCourse, composedGroupLabel } from "@/lib/workflows/fanout";
import {
  applyStopAfterCourse,
  buildCourseFanoutDetail,
  pinComposedGroupScope,
  type RunStateGroup,
  type CourseOutcome,
  type RunPendingDownload,
} from "./attended-fanout";
import { resolveRunFanoutPlan } from "./resolve-run-fanout";
// Deliverable-resilience pass-through (StepDefinition.passThroughOnFailure) -
// extracted to useWorkflowRun.pass-through.ts (kept under this project's
// 1000-line cap) - a pure, mechanical relocation, no behavior change.
// Imported (not just re-exported) since handleRun below still calls both;
// re-exported under the same names below so pass-through-on-failure.test.ts's
// existing import of these two names from this module needed no change; see
// that new module's own doc comments for the full reasoning.
import { resolvePassThroughOutputs, isGroupGenuineFailure } from "./useWorkflowRun.pass-through";
import { finalizeRunDownload, type CourseFailureGroup } from "./finalize-run-download";
import { buildAttendedStepHelpers } from "./attended-step-helpers";
import { validateRunForm } from "./validate-run-form";
import { useRunInputPrompt, type RunInputValue } from "./useRunInputPrompt";
import { completeCourseZipRunLogsAction } from "@/app/actions";
import { finishWorkflowRun, type WorkflowRunStepStatus } from "@/lib/workflow-runs";
import {
  safeStartWorkflowRun,
  logStepOutcome,
  createProgressCollector,
  readPartialFailureDetail,
  readSavedZipRef,
  readDownloadableFile,
  type RunLogContext,
  type SavedCourseZipRef,
} from "@/lib/workflows/run-logging";
import { updateScheduleRunOutcome, updateTriggerRunOutcome } from "@/lib/workflow-run-status";
import { joinStepErrorDetail, type StepErrorDetailInput } from "@/lib/workflows/run-detail";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import {
  evaluateStepGate,
  resolveStepInputs,
  buildRunReportMarkdown,
  type StepRunOutcome,
} from "@/lib/workflows/run-step-core";
import {
  getStepDefinition,
  type StepRunHelpers,
  type StepRunSummary,
} from "@/lib/workflows/registry";
import type { WorkflowDef, RuntimeField } from "@/lib/workflows/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import type { CartridgeCourseData } from "@/lib/cartridge-import";

export { resolvePassThroughOutputs, isGroupGenuineFailure };

export interface UseWorkflowRunReturn {
  runState: RunStateGroup[];
  running: boolean;
  validationError: string | null;
  setValidationError: (error: string | null) => void;
  /** True once the user has clicked "Stop after this course" during an active
   * course fan-out; the current course still finishes, remaining courses are
   * then marked skipped. Reset at the start of every new run. */
  stopRequested: boolean;
  /** Requests that a course fan-out stop BETWEEN courses (never mid-course).
   * A no-op outside an active course fan-out. */
  stopAfterCurrentCourse: () => void;
  runPause: { groupIndex: number; stepIndex: number; message: string } | null;
  pauseResolverRef: React.MutableRefObject<{ resolve: (go: boolean) => void } | null>;
  runInput: RunInputValue | null;
  inputResolverRef: React.MutableRefObject<{ resolve: (value: string | File[] | Array<Record<string, string>> | null) => void } | null>;
  runInputInitialRows: Array<Record<string, string>>;
  tableHasGrade: boolean;
  handleRun: () => Promise<void>;
}

export function useWorkflowRun(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expanded: { steps: any[]; origins: Array<string | null>; topIndices: number[]; error: string | null },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enabledExpandedSteps: any[],
  disabledSteps: Set<number>,
  selectedDef: WorkflowDef | undefined,
  selectedWorkflowId: string,
  workflows: WorkflowDef[],
  values: Record<string, string>,
  uploadFiles: Record<string, File[]>,
  runtimeFields: RuntimeField[],
  activeInstitution: string | null,
  user: User | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, "public", any> | null,
  loadCourseExportData: (courseId: string) => Promise<CartridgeCourseData | null>,
  onSetPendingHandoff: (handoff: { workflowId: string; prefill: Record<string, string> } | null) => void,
  onSetHubCourses: (courses: Array<{ id: string; name: string; canvasUrl: string | null; repos: string[] }> | null) => void,
  onRunStart: (workflowId: string) => void,
  pendingHandoff: { workflowId: string; prefill: Record<string, string>; scheduleId?: string | null; triggerId?: string | null } | null = null
): UseWorkflowRunReturn {
  const [runState, setRunState] = useState<RunStateGroup[]>([]);

  const [running, setRunning] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [stopRequested, setStopRequested] = useState(false);
  const stopAfterCourseRef = useRef(false);
  const stopAfterCurrentCourse = () => {
    stopAfterCourseRef.current = true;
    setStopRequested(true);
  };
  const [runPause, setRunPause] = useState<{ groupIndex: number; stepIndex: number; message: string } | null>(null);
  const pauseResolverRef = useRef<{ resolve: (go: boolean) => void } | null>(null);

  const {
    runInput,
    setRunInput,
    inputResolverRef,
    runInputInitialRows,
    setRunInputInitialRows,
    tableHasGrade,
  } = useRunInputPrompt();

  const validateForm = (): boolean => {
    const error = validateRunForm(runtimeFields, values, uploadFiles);
    setValidationError(error);
    return error === null;
  };

  const allStepsDisabled = expanded.steps.length > 0 && enabledExpandedSteps.length === 0;

  const handleRun = async () => {
    if (!selectedDef) return;
    if (expanded.error) return;
    if (allStepsDisabled) return;
    if (!validateForm()) return;

    onRunStart(selectedWorkflowId);
    setRunning(true);
    setValidationError(null);
    setRunInput(null);
    inputResolverRef.current = null;
    stopAfterCourseRef.current = false;
    setStopRequested(false);

    // Fan-out entity resolution (composed institution x course, institution-
    // only, course-only, or the single implicit entity) - extracted to
    // resolve-run-fanout.ts (kept under this project's 1000-line cap); see
    // that module's own doc comments for the composed-fan-out reasoning.
    // isCourseRun is true for a composed run too, so the existing
    // course-fanout UI machinery (course progress numerator, "Stop after
    // this course", course outcomes write-back) applies unchanged.
    const plan = await resolveRunFanoutPlan(selectedDef.scope, activeInstitution);
    if ("error" in plan) {
      setValidationError(plan.error);
      setRunning(false);
      return;
    }
    const { isComposedRun, isCourseRun, entities: fanoutEntities } = plan;
    const makePendingSteps = () =>
      expanded.steps.map(() => ({
        status: "pending" as const,
        progress: null,
        summary: null,
        error: null,
      }));
    setRunState(fanoutEntities.map((entity) => ({ institution: entity.institution, courseId: entity.courseId, courseName: entity.courseName, steps: makePendingSteps() })));

    const workflowRunId = crypto.randomUUID();
    // Best-effort "running" row BEFORE any step of any group executes (even
    // step 0 of group 0), so a closed tab or crash still leaves a row behind.
    // Undefined when no signed-in user - every logStepOutcome call below
    // treats that as "logging is off", never an error.
    const runLog: RunLogContext | undefined = user && supabase ? { supabase, userId: user.id, runId: workflowRunId } : undefined;
    if (runLog) {
      // AC3: the run-level diagnostic is the form's own values PLUS any
      // file uploads (reduced to name/type/size by redactRunInputs, never
      // their content) - this is what "the schedule was configured with
      // Institution: None" needs to be visible from the log alone.
      await safeStartWorkflowRun(runLog.supabase, runLog.userId, {
        id: workflowRunId, workflowId: selectedDef.id, workflowName: selectedDef.name, triggerSource: "manual",
        fieldValues: { ...values, ...uploadFiles },
      });
    }
    // Extracted to attended-step-helpers.ts (kept under the 1000-line cap
    // here) - a pure, mechanical relocation of the object literal that used
    // to live inline; see that module's header comment.
    const helpers: StepRunHelpers = buildAttendedStepHelpers({
      user,
      supabase,
      activeInstitution,
      workflowId: selectedDef.id,
      workflowName: selectedDef.name,
      workflowRunId,
      loadCourseExportData,
    });

    let anyGenuineFailure = false;
    let aborted = false;
    // Loop-local accumulators for the once-per-run write-back below: reading
    // `runState` there would read a STALE closure (this async function's
    // `runState` binding never updates across the re-renders that setRunState
    // triggers mid-run), so the detail text is built from these instead.
    // Shaped as StepErrorDetailInput (run-detail.ts) - the SAME shape the
    // unattended runners (cron schedule route, trigger routes) already feed
    // to joinStepErrorDetail for their own run/schedule/trigger detail text -
    // so the attended path's Detail line gets the identical dedup + "lead
    // with the root failure(s)" treatment (AC3) instead of its own bespoke
    // undifferentiated join.
    const allErrors: StepErrorDetailInput[] = [];
    const courseOutcomes: CourseOutcome[] = [];
    // AC5 residual (docs/REGRESSION.md entry 203, closed in entry 211): the
    // SAME failures as `allErrors`, but sliced per course instead of
    // flattened run-wide. finalizeRunDownload needs the per-course split to
    // attribute each line in the downloaded Run Log to the course it came
    // from - without it, a three-course run's log is a flat list of problems
    // with no way to tell which course produced any of them. Built here, from
    // this loop's own accumulators, because this is the only place that still
    // knows the boundary between one course's errors and the next's.
    const failureGroups: CourseFailureGroup[] = [];
    let currentGroupIndex = 0;
    // Tallied alongside every logStep call below, for the once-per-run
    // finishWorkflowRun write-back's stepCount/errorCount.
    let stepCount = 0;
    let errorCount = 0;
    // U9: zips saved by "save-zip-to-course" this run (see near finishWorkflowRun below).
    const savedZipRefs: SavedCourseZipRef[] = [];
    // AC1/AC2 (defect run 556b49f0's zip-log follow-up): every file ANY
    // course's step group handed the runner via DOWNLOADABLE_OUTPUT_KEY,
    // across the WHOLE run - accumulated here (not reset per course, unlike
    // before this fix) so the end-of-run flush below can decide ONE
    // cumulative download for the entire run, single-course or multi. See
    // attended-fanout.ts's planCourseDownload doc comment for why moving
    // this accumulator from per-course to per-run needed no change to that
    // function's own decision logic.
    const pendingRunDownloads: RunPendingDownload[] = [];
    // D6: every step's terminal outcome across the WHOLE run (every fan-out
    // group), in the SAME shape server-runner.ts's runExpandedBodyOnce
    // accumulates - built here (by the logStep closure below, defined per
    // group) so the once-per-run report save after the fan-out loop can call
    // buildRunReportMarkdown (run-step-core.ts) exactly like an unattended
    // run's post-run stage does, instead of that function staying dead code
    // on this path.
    const allStepOutcomes: StepRunOutcome[] = [];

    for (let g = 0; g < fanoutEntities.length && !aborted; g++) {
      currentGroupIndex = g;
      if (isCourseRun && stopAfterCourseRef.current) {
        // "Stop after this course": the current course already finished (this
        // check runs BETWEEN courses, never mid-course). Mark every remaining
        // course skipped in runState (via the functional updater, which reads
        // the fresh `prev` - never the stale `runState` closure) and in the
        // loop's own courseOutcomes accumulator (built from `fanoutEntities`,
        // a plain local array, for the same reason), then stop entirely.
        setRunState((prev) => applyStopAfterCourse(prev, g).groups);
        for (let r = g; r < fanoutEntities.length; r++) {
          const rest = fanoutEntities[r];
          courseOutcomes.push({ courseId: rest.courseId ?? "", courseName: rest.courseName ?? "", status: "skipped" });
        }
        break;
      }

      const entity = fanoutEntities[g];
      // Where this course's own errors start inside the run-wide `allErrors`.
      // Sliced from that same array rather than accumulated separately, so
      // the attributed per-course view and the flat run-wide Detail line can
      // never disagree about what failed.
      const errorsBeforeGroup = allErrors.length;
      // Per-step logger for this group (same logStepOutcome the unattended
      // server runner uses, so logs are comparable); tallies stepCount/
      // errorCount for the once-per-run finishWorkflowRun call below.
      const logStep = (
        index: number, type: string, status: WorkflowRunStepStatus, error: string | null, summary: StepRunSummary | null,
        timing: { startedAt: string; finishedAt: string }, progress: string[], inputs?: Record<string, unknown> | null
      ) => {
        stepCount++;
        // D6: unify error counting with all four unattended entry points,
        // which have always counted status === "error" || "needs-interaction"
        // (see e.g. src/app/api/cron/run-schedules/route.ts) - this loop
        // never actually produces "needs-interaction" itself today (an
        // attended pause is handled separately, via runPause/runInput, not
        // this status), so this is a forward-compatible unification rather
        // than an observable behavior change.
        if (status === "error" || status === "needs-interaction") errorCount++;
        // D6: every logged outcome also feeds the run-report accumulator
        // (allStepOutcomes, declared above this group loop) - only the
        // statuses StepRunOutcome actually models are pushed; "running" is a
        // transient UI-only status this loop never logs.
        if (status !== "running") {
          // StepRunOutcome (run-step-core.ts) carries institution/courseId,
          // not courseName - buildRunReportMarkdown resolves a course's
          // display name from the courseNames Map (keyed by courseId) it is
          // handed separately, matching server-runner.ts's own outcomes,
          // which never carried courseName either.
          allStepOutcomes.push({
            index, type, status, error, summary,
            institution: entity.institution ?? undefined,
            courseId: entity.courseId,
          });
        }
        return logStepOutcome(
          runLog,
          {
            index, type, status, error, summary,
            institution: entity.institution ?? undefined,
            courseId: entity.courseId,
            courseName: entity.courseName,
          },
          timing, progress, inputs
        );
      };
      let groupScope = selectedDef.scope;
      let groupHelpers: StepRunHelpers = helpers;
      if (isComposedRun) {
        // Pin BOTH dimensions from the course tile itself (see fanout.ts's
        // design note) - unlike the single-dimension branch below, this MUST
        // run even when entity.institution is "" (falsy), so an
        // institution-less tile still overwrites the original "*" instead of
        // leaving it in place.
        groupScope = pinComposedGroupScope(groupScope!, entity.courseId!, entity.institution);
        groupHelpers = { ...helpers, activeInstitution: entity.institution };
      } else {
        if (entity.institution) {
          groupScope = scopeForInstitution(groupScope!, entity.institution);
        }
        if (entity.courseId) {
          groupScope = scopeForCourse(groupScope!, entity.courseId);
        }
        groupHelpers = entity.institution
          ? { ...helpers, activeInstitution: entity.institution }
          : helpers;
      }

      const stepOutputs: Array<Record<string, unknown>> = [];
      // AC4 (defect-2 write-up): every step in the files-accumulator chain
      // used to trigger its OWN browser download - up to six per course in a
      // Course Build run, scattered across the ~5 minutes it takes one
      // course's steps to run. Steps no longer download themselves (see
      // DOWNLOADABLE_OUTPUT_KEY's doc comment, run-logging.ts) - they hand
      // the file to `pendingRunDownloads` instead (declared once, above this
      // group loop - AC1/AC2 folded what used to be a fresh per-course
      // accumulator into one that spans the whole run).
      const failedSteps = new Set<number>();
      const disabledRunIndices = new Set<number>();
      const skippedRunIndices = new Set<number>();
      // Deliverable-resilience pass-through (StepDefinition.
      // passThroughOnFailure, registry-helpers.ts) - mirrors server-runner.
      // ts's runExpandedBodyOnce exactly (see that function's own comments
      // for the full reasoning) so an attended run never diverges from an
      // unattended one here. Indices whose thrown failure was absorbed via
      // that field rather than cascaded - deliberately kept OUT of
      // failedSteps (that is what stops the cascade to dependents bound to
      // the pass-through output), but tracked here so groupGenuineFailure
      // below still reflects the real failure.
      const passThroughFailures = new Set<number>();

      for (let i = 0; i < expanded.steps.length; i++) {
      const step = expanded.steps[i];
      const def = getStepDefinition(step.type);
      // One consistent clock for this step's timing, captured before the
      // disabled/runIf/cascade checks so even a step that never actually
      // runs gets a (near-zero) duration rather than none at all.
      const startedAt = new Date().toISOString();

      // D1: the disabled-step branch, the runIf gate (including D4's
      // visibility suppression for a runtime-sourced condition), and the
      // transitive skip cascade now live in run-step-core.ts, shared with
      // server-runner.ts's own per-step loop - see evaluateStepGate's own
      // doc comment. Only the UI/logging side effects stay here.
      const gate = evaluateStepGate({
        step,
        topIndex: expanded.topIndices[i],
        disabledTopIndices: disabledSteps,
        failedSteps,
        skippedRunIndices,
        stepOutputs,
        fieldValues: values,
        runtimeFields,
      });

      if (gate === "disabled" || gate === "skipped") {
        setRunState((prev) => {
          const next = [...prev];
          const steps = [...next[g].steps];
          steps[i] = {
            status: gate,
            progress: null,
            summary: null,
            error: null,
          };
          next[g] = { ...next[g], steps };
          return next;
        });
        failedSteps.add(i);
        (gate === "disabled" ? disabledRunIndices : skippedRunIndices).add(i);
        await logStep(i, step.type, gate, null, null, { startedAt, finishedAt: new Date().toISOString() }, []);
        continue;
      }

      setRunState((prev) => {
        const next = [...prev];
        const steps = [...next[g].steps];
        steps[i] = { ...steps[i], status: "running" };
        next[g] = { ...next[g], steps };
        return next;
      });

      const collector = createProgressCollector();
      // Declared OUTSIDE the try block (mirrors server-runner.ts's
      // runExpandedBodyOnce) so the catch branch below can also log
      // whatever partial resolution happened before a throw - a
      // binding-resolution failure IS itself the diagnostic this feature
      // exists to surface (AC1). resolveStepInputs (run-step-core.ts)
      // mutates this object in place for exactly that reason - see its own
      // doc comment.
      const resolvedInputs: Record<string, unknown> = {};
      try {
        // D1/D4/D5: binding resolution (runtime/step/literal, scope
        // application, "*" expansion, @class-repo/@class-tile refs) now
        // lives in run-step-core.ts, shared with server-runner.ts's own
        // per-step loop. D5: it keys the uploads predicate off spec.type
        // (always present) rather than a separately-looked-up RuntimeField
        // (which could be undefined for a stale binding, handing the step a
        // string where every other path hands it []). D4: a hidden
        // (StepInputSpec.visibleWhen-gated) field resolves as empty here on
        // BOTH engines now, not just this one.
        await resolveStepInputs(
          {
            step,
            stepDef: def,
            scope: groupScope,
            fieldValues: values,
            uploadFiles,
            failedSteps,
            stepOutputs,
            expandedSteps: expanded.steps,
            expandedTopIndices: expanded.topIndices,
            disabledTopIndices: disabledSteps,
            stepLookup: getStepDefinition,
            activeInstitution: groupHelpers.activeInstitution,
          },
          resolvedInputs
        );

        // Unchanged single-string UI display, PLUS the full ordered list
        // collected into `collector` for logging (createProgressCollector).
        const onProgress = (text: string) => {
          collector.onProgress(text);
          setRunState((prev) => {
            const next = [...prev];
            const steps = [...next[g].steps];
            steps[i] = { ...steps[i], progress: text };
            next[g] = { ...next[g], steps };
            return next;
          });
        };

        // resolveStepInputs already threw "Unknown step type" above when
        // `def` was undefined, so it is guaranteed defined past this point.
        const result = await def!.run(resolvedInputs, groupHelpers, onProgress);
        stepOutputs[i] = result.outputs;

        // Attended parity (entry 159 AC6): mirrors server-runner.ts's read of
        // PARTIAL_FAILURE_OUTPUT_KEY (see run-logging.ts) - status stays
        // "done" (RCA19), but the log no longer shows a bare DONE when the
        // step itself reports some of its own work failed.
        const partialFailureDetail = readPartialFailureDetail(result.outputs);

        setRunState((prev) => {
          const next = [...prev];
          const steps = [...next[g].steps];
          steps[i] = {
            status: "done",
            progress: null,
            summary: result.summary,
            error: partialFailureDetail,
          };
          next[g] = { ...next[g], steps };
          return next;
        });
        // Logged here (step's own work is done), BEFORE any requireConfirm/
        // requireInput pause below - duration should exclude human wait time.
        await logStep(i, step.type, "done", partialFailureDetail, result.summary, { startedAt, finishedAt: new Date().toISOString() }, collector.messages, resolvedInputs);

        // U9: a saved zip publishes what it saved (SAVED_ZIP_OUTPUT_KEY) -
        // collected for the once-per-run completion call below.
        const savedZipRef = readSavedZipRef(result.outputs);
        if (savedZipRef) savedZipRefs.push(savedZipRef);

        // AC4: a step that used to download its own file now hands it here
        // instead (DOWNLOADABLE_OUTPUT_KEY) - collected (not overwritten) so
        // distinct artifacts a single course produces (e.g. a Blackboard
        // export AND a course materials zip) are BOTH still delivered, just
        // bundled into the run's ONE cumulative flush (AC1/AC2) once every
        // course has finished. Tagged with this SAME step's own savedZipRef
        // (read just above) when it published one - that is what lets the
        // end-of-run flush know which entries are safe to reopen and patch
        // with the complete run log (see RunPendingDownload's own doc
        // comment, attended-fanout.ts).
        const downloadable = readDownloadableFile(result.outputs);
        if (downloadable) pendingRunDownloads.push({ ...downloadable, savedZipRef: savedZipRef ?? undefined });

        if (result.requireConfirmation) {
          await new Promise<void>((resolve) => {
            setRunPause({ groupIndex: g, stepIndex: i, message: result.requireConfirmation! });
            pauseResolverRef.current = {
              resolve: (go: boolean) => {
                setRunPause(null);
                pauseResolverRef.current = null;
                if (!go) {
                  failedSteps.add(i);
                  aborted = true;
                }
                resolve();
              },
            };
          });
          if (failedSteps.has(i)) {
            break;
          }
        }

        if (result.requireInput) {
          const inputOptions =
            result.requireInput.kind === "workflow"
              ? workflows
                  .filter((w) => w.id !== selectedWorkflowId)
                  .map((w) => ({ value: w.id, label: w.name }))
              : result.requireInput.options ?? [];

          const rows = result.requireInput!.rows ?? [];
          setRunInputInitialRows(rows.map((r) => ({ ...r })));

          await new Promise<void>((resolve) => {
            setRunInput({
              groupIndex: g,
              stepIndex: i,
              message: result.requireInput!.message,
              kind: result.requireInput!.kind,
              options: inputOptions,
              optional: !!result.requireInput!.optional,
              initialValue: result.requireInput!.initialValue,
              submitLabel: result.requireInput!.submitLabel,
              regenerate: result.requireInput!.regenerate,
              columns: result.requireInput!.columns,
              selectable: result.requireInput!.selectable,
              rowDetail: result.requireInput!.rowDetail,
              transform: result.requireInput!.transform,
            });
            inputResolverRef.current = {
              resolve: (value) => {
                setRunInput(null);
                inputResolverRef.current = null;
                if (value === null) {
                  if (!result.requireInput!.optional) {
                    failedSteps.add(i);
                    aborted = true;
                  }
                } else {
                  const merged =
                    result.requireInput!.kind !== "workflow" &&
                    result.requireInput!.transform
                      ? result.requireInput!.transform(
                          value as string | File[] | Array<Record<string, string>>
                        )
                      : value;
                  stepOutputs[i] = {
                    ...stepOutputs[i],
                    [result.requireInput!.key]: merged,
                  };
                  if (
                    result.requireInput!.kind === "workflow" &&
                    typeof value === "string" &&
                    value
                  ) {
                    onSetPendingHandoff({
                      workflowId: value,
                      prefill: result.requireInput!.handoffPrefill ?? {},
                    });
                  }
                }
                resolve();
              },
            };
          });
          if (failedSteps.has(i)) {
            break;
          }
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : String(err);
        setRunState((prev) => {
          const next = [...prev];
          const steps = [...next[g].steps];
          steps[i] = {
            status: "error",
            progress: null,
            summary: null,
            error: errorMsg,
          };
          next[g] = { ...next[g], steps };
          return next;
        });
        // Deliverable-resilience pass-through - see resolvePassThroughOutputs'
        // own doc comment (run-step-core.ts) for the full reasoning.
        const { passedThrough, outputs: passThroughOutputs } = resolvePassThroughOutputs(
          def?.passThroughOnFailure,
          step.bindings,
          failedSteps,
          stepOutputs
        );
        if (passedThrough) {
          stepOutputs[i] = passThroughOutputs;
          passThroughFailures.add(i);
        } else {
          // A step that passed through is deliberately NOT added to
          // failedSteps: that is what lets a dependent bound to its
          // pass-through output resolve normally instead of cascading "which
          // failed" through every later step in the chain.
          // passThroughFailures (above) is what keeps groupGenuineFailure
          // below honest about this still being a real failure.
          failedSteps.add(i);
        }
        // Captured with the step's REAL index (i) and type here, at the
        // source - not derived later from this array's position, which used
        // to number errors by their position among filtered errors rather
        // than their true step index (see this feature's R7). joinStepErrorDetail
        // (run-detail.ts) does its own "+1" for display.
        allErrors.push({ index: i, type: step.type, status: "error", error: errorMsg });
        await logStep(i, step.type, "error", errorMsg, null, { startedAt, finishedAt: new Date().toISOString() }, collector.messages, resolvedInputs);
      }
    }

      const groupGenuineFailure = isGroupGenuineFailure(failedSteps, disabledRunIndices, skippedRunIndices, passThroughFailures);
      anyGenuineFailure = anyGenuineFailure || groupGenuineFailure;
      if (isCourseRun) {
        courseOutcomes.push({
          courseId: entity.courseId!,
          courseName: entity.courseName!,
          status: groupGenuineFailure ? "failed" : "ok",
        });
        // Only when this course actually produced errors - an empty group
        // would otherwise render a course heading with nothing under it.
        const groupErrors = allErrors.slice(errorsBeforeGroup);
        if (groupErrors.length > 0) {
          failureGroups.push({
            courseId: entity.courseId!,
            courseName: entity.courseName!,
            institution: entity.institution ?? null,
            errors: groupErrors,
          });
        }
        setRunState((prev) => {
          const next = [...prev];
          next[g] = { ...next[g], courseStatus: groupGenuineFailure ? "failed" : "ok" };
          return next;
        });
      }
    }

    // Hard-cancel mid-course (e.g. cancelled pause or failed required input): mark
    // remaining courses skipped in both the UI state and the outcome accumulator.
    if (aborted && isCourseRun) {
      for (let r = currentGroupIndex + 1; r < fanoutEntities.length; r++) {
        const rest = fanoutEntities[r];
        courseOutcomes.push({ courseId: rest.courseId ?? "", courseName: rest.courseName ?? "", status: "skipped" });
      }
      setRunState((prev) => applyStopAfterCourse(prev, currentGroupIndex + 1).groups);
    }

    // D6: persist this run's text deliverables to the Files tab, exactly
    // like an unattended run's post-run stage does (runWorkflowUnattended,
    // server-runner.ts) - buildRunReportMarkdown is the SAME shared function
    // that stage calls; this was previously dead code on this path because
    // buildAttendedStepHelpers never set helpers.saveRunReport at all (see
    // that file's own D6 comment).
    if (helpers.saveRunReport) {
      const courseNames = isCourseRun && fanoutEntities.some((e) => e.courseId)
        ? new Map(fanoutEntities.filter((e) => e.courseId).map((e) => [e.courseId!, composedGroupLabel(e.courseName ?? "", e.institution)]))
        : undefined;
      const markdown = buildRunReportMarkdown(
        selectedDef.name,
        new Date().toISOString(),
        allStepOutcomes,
        (t) => getStepDefinition(t)?.name ?? t,
        courseNames
      );
      if (markdown) {
        try {
          await helpers.saveRunReport(`${selectedDef.name} report`, markdown);
        } catch {
          // ignore - the deliverable report is a convenience, not part of the run
        }
      }
    }

    // AC1/AC2 (defect run 556b49f0's zip-log follow-up): exactly ONE browser
    // download for the WHOLE run, fired here now that every course's step
    // loop has finished - this REPLACES the per-course flush AC4 (defect-2)
    // used to run inline inside the group loop above. For a single-course
    // run this produces the exact same download the old per-course flush
    // already did (the accumulator holds only that one course's files) -
    // never a second, redundant download; for a multi-course run it is the
    // ONE cumulative zip AC2 asks for, covering every course's deliverables
    // plus the run's complete log. See finalize-run-download.ts's own header
    // comment for the full reasoning (extracted out of this file to stay
    // under this project's 1000-line cap) - `combinedFileName` here names a
    // single course when this run covered exactly one (preserving the SAME
    // naming the old per-course flush used for that common case), or the
    // workflow's own name for a multi-course run, which has no single course
    // to name.
    const singleEntity = fanoutEntities.length === 1 ? fanoutEntities[0] : null;
    await finalizeRunDownload({
      pendingRunDownloads,
      workflowRunId,
      ok: !anyGenuineFailure,
      user,
      supabase,
      combinedFileName: buildWorkflowFileName({
        course: singleEntity?.courseName ? { courseCode: null, name: singleEntity.courseName } : null,
        artifact: selectedDef.name,
        ext: "zip",
      }),
      // AC5 residual (entry 211): hand the per-course split over so the
      // downloaded Run Log's Detail section attributes each failure to its
      // course. finalizeRunDownload treats both as optional and falls back to
      // the old unattributed text when they are absent, so this call site is
      // what actually activates the attribution rather than merely enabling it.
      courseOutcomes,
      failureGroups,
    });

    if (anyGenuineFailure) {
      onSetPendingHandoff(null);
    }

    if (user && supabase && selectedDef) {
      const genuineFailure = anyGenuineFailure;
      // Built from the loop's own accumulators, NOT the `runState` variable -
      // this closure's `runState` binding is frozen at the render that started
      // the run and never updates across the many setRunState calls above.
      // joinStepErrorDetail (AC3) dedupes identical entries (the SAME step
      // failing the SAME way in more than one course of a fan-out) and
      // collapses every "Skipped - depends on step..." cascade entry into a
      // single trailing count, so the root failure(s) lead the line instead
      // of being buried under a repeat-per-course wall of cascades.
      let detail = genuineFailure ? joinStepErrorDetail(allErrors) : "";
      if (isCourseRun && courseOutcomes.length > 0) {
        const courseSummary = buildCourseFanoutDetail(courseOutcomes);
        detail = detail ? `${courseSummary} - ${detail}` : courseSummary;
      }
      // finishWorkflowRun never throws (see workflow-runs.ts) - no .catch
      // needed, but not awaited either: this write-back must never delay
      // handleRun's own completion (setRunning(false) below).
      void finishWorkflowRun(supabase, user.id, workflowRunId, {
        status: genuineFailure ? "error" : "ok",
        detail,
        stepCount,
        errorCount,
      });
      // U9: complete the embedded run log of every zip this run saved
      // (attended counterpart of server-runner.ts's post-run stage) - runs
      // for a FAILED run too (AC3), and is fire-and-forget like
      // finishWorkflowRun above, since it is a best-effort addition to an
      // already-saved zip, never something that should delay handleRun.
      //
      // C3: `detail` (just above) is passed straight through as the SAME
      // text finishWorkflowRun was just handed, so the saved zip's embedded
      // Detail: section matches the DB row exactly - buildCompleteRunLogText
      // used to always read `run.detail` back as null here (finishWorkflowRun
      // had not written it yet), so this section came out empty on every
      // download; see zip-run-log-completion.ts's doc comment.
      if (savedZipRefs.length > 0) {
        void completeCourseZipRunLogsAction(savedZipRefs, workflowRunId, !genuineFailure, detail).catch(() => {});
      }
      if (pendingHandoff?.scheduleId) {
        void updateScheduleRunOutcome(supabase, user.id, pendingHandoff.scheduleId, genuineFailure ? "error" : "ok", detail)
          .catch(() => {});
      }
      if (pendingHandoff?.triggerId) {
        void updateTriggerRunOutcome(supabase, user.id, pendingHandoff.triggerId, genuineFailure ? "error" : "ok", detail)
          .catch(() => {});
      }
    }

    onSetHubCourses(null);
    setRunning(false);
  };

  return {
    runState,
    running,
    stopRequested,
    stopAfterCurrentCourse,
    validationError,
    setValidationError,
    runPause,
    pauseResolverRef,
    runInput,
    inputResolverRef,
    runInputInitialRows,
    tableHasGrade,
    handleRun,
  };
}
