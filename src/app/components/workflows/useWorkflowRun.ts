"use client";

import { useState, useRef } from "react";
import { resolveDocumentAuthor } from "@/lib/author";
import { saveRecordingFile, listRecordingFiles, downloadRecordingFile, extForFile } from "@/lib/recording-files";
import { uploadCourseZip, uploadCourseZipChunked, uploadCourseFile, removeCourseZip, removeCourseZipObjects } from "@/lib/course-files";
import { isScopeableListType, expandScopedValue, resolveClassRepoRef, resolveClassTileRef } from "@/lib/workflows/scope";
import { isInstitutionFanout, isCourseFanout, isComposedFanout, resolveFanoutInstitutions, resolveFanoutCourses, scopeForInstitution, scopeForCourse } from "@/lib/workflows/fanout";
import {
  applyStopAfterCourse,
  buildCourseFanoutDetail,
  buildComposedFanoutEntities,
  pinComposedGroupScope,
  planCourseDownload,
  type RunStateGroup,
  type CourseOutcome,
} from "./attended-fanout";
import { validateRunForm } from "./validate-run-form";
import { useRunInputPrompt, type RunInputValue, type RunInputDetailsMap } from "./useRunInputPrompt";
import { loadInstitutionFields } from "@/lib/institution-fields";
import { appendCourseMaterialFileAction, appendCourseCastletopFileAction, appendCourseExportFileAction, completeCourseZipRunLogsAction } from "@/app/actions";
import { loadCourseMaterialsAttended } from "./load-course-materials-attended";
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
  type DownloadableFile,
} from "@/lib/workflows/run-logging";
import { updateScheduleRunOutcome, updateTriggerRunOutcome } from "@/lib/workflow-run-status";
import { joinStepErrorDetail, type StepErrorDetailInput } from "@/lib/workflows/run-detail";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import { getStoredProvider } from "@/lib/llm-provider";
import { loadCommonResources } from "@/lib/common-resources";
import { applyWorkflowScope, scopeCoversType } from "@/lib/workflows/types";
import { isFieldVisible } from "@/lib/workflow-field-visibility";
import {
  getStepDefinition,
  type StepRunHelpers,
  type StepRunSummary,
} from "@/lib/workflows/registry";
import type { WorkflowDef, RuntimeField } from "@/lib/workflows/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import type { CartridgeCourseData } from "@/lib/cartridge-import";

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
  setRunInputText: (value: string) => void;
  setRunInputChoice: (value: string) => void;
  setRunInputFiles: (files: File[]) => void;
  setRunInputRows: (rows: Array<Record<string, string>>) => void;
  setRunInputChecked: (checked: boolean[]) => void;
  setRunInputBusy: (busy: boolean) => void;
  setRunInputError: (error: string | null) => void;
  setRunInputDetails: (details: RunInputDetailsMap) => void;
  runInputSearch: string;
  setRunInputSearch: (search: string) => void;
  runInputSort: { key: string; dir: "asc" | "desc" } | null;
  setRunInputSort: (sort: { key: string; dir: "asc" | "desc" } | null) => void;
  runInputInitialRows: Array<Record<string, string>>;
  tableFrozenOrder: number[] | null;
  setTableFrozenOrder: (order: number[] | null) => void;
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
    setRunInputText,
    setRunInputChoice,
    setRunInputFiles,
    setRunInputRows,
    setRunInputChecked,
    setRunInputBusy,
    setRunInputError,
    setRunInputDetails,
    runInputSearch,
    setRunInputSearch,
    runInputSort,
    setRunInputSort,
    runInputInitialRows,
    setRunInputInitialRows,
    tableFrozenOrder,
    setTableFrozenOrder,
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
    setRunInputBusy(false);
    setRunInputError(null);
    inputResolverRef.current = null;
    stopAfterCourseRef.current = false;
    setStopRequested(false);

    // A composed fan-out (institution "*" AND multiple course tiles) is NOT a
    // nested (institution x course) product - a course tile belongs to exactly
    // one institution, so this collapses to a single course-dimension fan-out
    // with each entity's institution derived from the tile itself (see
    // fanout.ts's design note and the composed branch below). isCourseRun is
    // true for a composed run too, so the existing course-fanout UI machinery
    // (course progress numerator, "Stop after this course", course outcomes
    // write-back) applies unchanged.
    const isComposedRun = isComposedFanout(selectedDef.scope);
    const isCourseRun = isCourseFanout(selectedDef.scope) || isComposedRun;

    let fanoutEntities: Array<{ institution: string | null; courseId?: string; courseName?: string }>;
    if (isComposedRun) {
      const resolved = await resolveFanoutCourses(selectedDef.scope, null);
      if ("error" in resolved) {
        setValidationError(`Could not list course tiles: ${resolved.error}`);
        setRunning(false);
        return;
      }
      if (resolved.list.length === 0) {
        setValidationError("The scope matched no course tiles.");
        setRunning(false);
        return;
      }
      fanoutEntities = buildComposedFanoutEntities(resolved.list);
    } else if (isInstitutionFanout(selectedDef.scope)) {
      const resolved = await resolveFanoutInstitutions();
      if ("error" in resolved) {
        setValidationError(`Could not list institutions: ${resolved.error}`);
        setRunning(false);
        return;
      }
      if (resolved.list.length === 0) {
        setValidationError("No institutions are configured on the server.");
        setRunning(false);
        return;
      }
      fanoutEntities = resolved.list.map((acronym) => ({ institution: acronym }));
    } else if (isCourseFanout(selectedDef.scope)) {
      const resolved = await resolveFanoutCourses(selectedDef.scope, activeInstitution);
      if ("error" in resolved) {
        setValidationError(`Could not list course tiles: ${resolved.error}`);
        setRunning(false);
        return;
      }
      if (resolved.list.length === 0) {
        setValidationError("The scope matched no course tiles.");
        setRunning(false);
        return;
      }
      fanoutEntities = resolved.list.map((course) => ({ institution: null, courseId: course.id, courseName: course.name }));
    } else {
      fanoutEntities = [{ institution: null }];
    }
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
    const helpers: StepRunHelpers = {
      activeInstitution: activeInstitution || null,
      provider: getStoredProvider(),
      author: resolveDocumentAuthor(user),
      saveBundle:
        user && supabase
          ? async (blob: Blob, name: string) => {
              await saveRecordingFile(supabase, user.id, blob, {
                name,
                kind: "bundle",
                mimeType: "application/zip",
                durationSec: null,
                source: "workflow",
                origin: "manual",
                workflowName: selectedDef.name,
                workflowId: selectedDef.id,
                workflowRunId,
              });
            }
          : null,
      saveCourseMaterialFile:
        user && supabase
          ? async (courseId: string, blob: Blob, fileName: string) => {
              const { path } = await uploadCourseZip(
                supabase,
                user.id,
                courseId,
                blob,
                null
              );
              const r = await appendCourseMaterialFileAction(courseId, {
                name: fileName,
                path,
                size: blob.size,
              });
              if ("error" in r) throw new Error(r.error);
              if (r.replacedPath) {
                await removeCourseZip(supabase, r.replacedPath);
              }
            }
          : null,
      saveCourseCastletopFile:
        user && supabase
          ? async (courseId: string, blob: Blob, fileName: string) => {
              const { path } = await uploadCourseFile(
                supabase,
                user.id,
                courseId,
                blob,
                "xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              );
              const r = await appendCourseCastletopFileAction(courseId, {
                name: fileName,
                path,
                size: blob.size,
              });
              if ("error" in r) throw new Error(r.error);
              if (r.replacedPath) {
                await removeCourseZip(supabase, r.replacedPath);
              }
            }
          : null,
      saveCourseExportFile:
        user && supabase
          ? async (courseId: string, blob: Blob, fileName: string) => {
              const { path, parts } = await uploadCourseZipChunked(
                supabase,
                user.id,
                courseId,
                blob
              );
              const r = await appendCourseExportFileAction(courseId, {
                name: fileName,
                path,
                size: blob.size,
                ...(parts ? { parts } : {}),
              });
              if ("error" in r) {
                await removeCourseZipObjects(supabase, parts ?? [path]);
                throw new Error(r.error);
              }
              await removeCourseZipObjects(supabase, r.replacedPaths);
            }
          : null,
      loadCommonResources:
        user && supabase
          ? async () => loadCommonResources(supabase, user.id)
          : null,
      getLibraryFile:
        user && supabase
          ? async (fileId: string) => {
              const files = await listRecordingFiles(supabase, user.id);
              const f = files.find((x) => x.id === fileId);
              if (!f) return null;
              const blob = await downloadRecordingFile(supabase, f);
              return {
                blob,
                name: `${f.name}.${extForFile(f)}`,
                mimeType: f.mimeType,
              };
            }
          : null,
      getInstitutionFields:
        user && supabase
          ? async (acronym: string) =>
              loadInstitutionFields(supabase, user.id, acronym)
          : null,
      loadCourseExport: user && supabase ? loadCourseExportData : null,
      // Extracted to load-course-materials-attended.ts (kept under the
      // 1000-line cap here); wraps a genuine downloadCourseZipBlob failure
      // with the tile and file name the same way loadCourseExportData above
      // already wraps loadCourseExport's - see that module's header comment.
      loadCourseMaterials:
        user && supabase
          ? (courseId: string) => loadCourseMaterialsAttended(supabase, courseId)
          : null,
      workflowId: selectedDef.id,
      workflowName: selectedDef.name,
      workflowRunId,
    };

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
    let currentGroupIndex = 0;
    // Tallied alongside every logStep call below, for the once-per-run
    // finishWorkflowRun write-back's stepCount/errorCount.
    let stepCount = 0;
    let errorCount = 0;
    // U9: zips saved by "save-zip-to-course" this run (see near finishWorkflowRun below).
    const savedZipRefs: SavedCourseZipRef[] = [];

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
      // Per-step logger for this group (same logStepOutcome the unattended
      // server runner uses, so logs are comparable); tallies stepCount/
      // errorCount for the once-per-run finishWorkflowRun call below.
      const logStep = (
        index: number, type: string, status: WorkflowRunStepStatus, error: string | null, summary: StepRunSummary | null,
        timing: { startedAt: string; finishedAt: string }, progress: string[], inputs?: Record<string, unknown> | null
      ) => {
        stepCount++;
        if (status === "error") errorCount++;
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
      // the file to THIS accumulator instead, and it is flushed exactly once,
      // right after this group's (this course's) step loop finishes below.
      // Per-GROUP, not per-run: a course fan-out's next iteration starts a
      // fresh group with a fresh (empty) accumulator, so course 2's files
      // never get bundled into course 1's download.
      const pendingDownloads: DownloadableFile[] = [];
      const failedSteps = new Set<number>();
      const disabledRunIndices = new Set<number>();
      const skippedRunIndices = new Set<number>();

      for (let i = 0; i < expanded.steps.length; i++) {
      const step = expanded.steps[i];
      const def = getStepDefinition(step.type);
      // One consistent clock for this step's timing, captured before the
      // disabled/runIf/cascade checks so even a step that never actually
      // runs gets a (near-zero) duration rather than none at all.
      const startedAt = new Date().toISOString();

      if (disabledSteps.has(expanded.topIndices[i])) {
        setRunState((prev) => {
          const next = [...prev];
          const steps = [...next[g].steps];
          steps[i] = {
            status: "disabled",
            progress: null,
            summary: null,
            error: null,
          };
          next[g] = { ...next[g], steps };
          return next;
        });
        failedSteps.add(i);
        disabledRunIndices.add(i);
        await logStep(i, step.type, "disabled", null, null, { startedAt, finishedAt: new Date().toISOString() }, []);
        continue;
      }

      if (step.runIf) {
        const cond = step.runIf;
        let condVal: unknown = "";
        let gateUnavailable = false;
        if (cond.binding.source === "step") {
          if (failedSteps.has(cond.binding.stepIndex)) gateUnavailable = true;
          else condVal = stepOutputs[cond.binding.stepIndex]?.[cond.binding.outputKey];
        } else if (cond.binding.source === "literal") {
          condVal = cond.binding.value;
        } else if (cond.binding.source === "runtime") {
          condVal = values[cond.binding.fieldKey] ?? "";
        }
        const v = String(condVal).trim().toLowerCase();
        const truthy = v !== "" && v !== "0" && v !== "false";
        if (gateUnavailable || truthy !== cond.expected) {
          setRunState((prev) => {
            const next = [...prev];
            const steps = [...next[g].steps];
            steps[i] = {
              status: "skipped",
              progress: null,
              summary: null,
              error: null,
            };
            next[g] = { ...next[g], steps };
            return next;
          });
          failedSteps.add(i);
          skippedRunIndices.add(i);
          await logStep(i, step.type, "skipped", null, null, { startedAt, finishedAt: new Date().toISOString() }, []);
          continue;
        }
      }

      if (
        Object.values(step.bindings).some(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (b: any) => b.source === "step" && skippedRunIndices.has(b.stepIndex)
        )
      ) {
        setRunState((prev) => {
          const next = [...prev];
          const steps = [...next[g].steps];
          steps[i] = {
            status: "skipped",
            progress: null,
            summary: null,
            error: null,
          };
          next[g] = { ...next[g], steps };
          return next;
        });
        failedSteps.add(i);
        skippedRunIndices.add(i);
        await logStep(i, step.type, "skipped", null, null, { startedAt, finishedAt: new Date().toISOString() }, []);
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
      // exists to surface (AC1).
      let resolvedInputs: Record<string, unknown> = {};
      try {
        if (!def) {
          throw new Error(`Unknown step type "${step.type}".`);
        }

        resolvedInputs = {};
        for (const spec of def.inputs) {
          const binding = step.bindings[spec.key];
          if (!binding) {
            if (scopeCoversType(groupScope, spec.type)) {
              resolvedInputs[spec.key] = applyWorkflowScope(spec.type, "", groupScope);
            }
            continue;
          }

          if (binding.source === "runtime") {
            const field = runtimeFields.find((f) => f.fieldKey === binding.fieldKey);
            // A field the run form is CURRENTLY hiding (StepInputSpec.
            // visibleWhen, types.ts - e.g. course-schedule-from-source's
            // per-source repo/cartridge/syllabus/lmsCourse inputs) must never
            // reach its step just because an earlier choice left a value
            // sitting in `values`/`uploadFiles` - only the field matching the
            // instructor's CURRENT selection is live. The stored value itself
            // is left untouched (so switching back restores it); only what
            // is submitted here is suppressed.
            const hiddenByVisibility = !!field && !isFieldVisible(field, values);
            if (field?.type === "uploads") {
              resolvedInputs[spec.key] = hiddenByVisibility ? [] : uploadFiles[binding.fieldKey] ?? [];
            } else {
              const runVal =
                hiddenByVisibility || scopeCoversType(groupScope, spec.type)
                  ? ""
                  : values[binding.fieldKey] ?? "";
              resolvedInputs[spec.key] = applyWorkflowScope(spec.type, runVal, groupScope);
            }
          } else if (binding.source === "step") {
            if (failedSteps.has(binding.stepIndex)) {
              const failedDef = getStepDefinition(expanded.steps[binding.stepIndex]?.type ?? "");
              const dependsOnDisabled = disabledSteps.has(expanded.topIndices[binding.stepIndex]);
              throw new Error(
                dependsOnDisabled
                  ? `Skipped - depends on step ${binding.stepIndex + 1} ("${failedDef?.name ?? "unknown step"}"), which is disabled.`
                  : `Skipped - depends on step ${binding.stepIndex + 1} ("${failedDef?.name ?? "unknown step"}"), which failed.`
              );
            }
            const output = stepOutputs[binding.stepIndex]?.[binding.outputKey];
            if (output === undefined) {
              throw new Error(`Missing output from step ${binding.stepIndex + 1}.`);
            }
            resolvedInputs[spec.key] = output;
          } else if (binding.source === "literal") {
            resolvedInputs[spec.key] = binding.value;
          }

          if (isScopeableListType(spec.type) && typeof resolvedInputs[spec.key] === "string") {
            const scopeInst = applyWorkflowScope("institution", "", groupScope).trim();
            resolvedInputs[spec.key] = await expandScopedValue(
              spec.type,
              resolvedInputs[spec.key] as string,
              { activeInstitution: (scopeInst || groupHelpers.activeInstitution) || null }
            );
          }

          if (spec.type === "repo" && typeof resolvedInputs[spec.key] === "string") {
            resolvedInputs[spec.key] = await resolveClassRepoRef(resolvedInputs[spec.key] as string, groupScope);
          }

          if (
            (spec.type === "lmsCourse" || spec.type === "date" || spec.type === "institution") &&
            typeof resolvedInputs[spec.key] === "string"
          ) {
            resolvedInputs[spec.key] = await resolveClassTileRef(resolvedInputs[spec.key] as string, groupScope, spec.type);
          }
        }

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

        const result = await def.run(resolvedInputs, groupHelpers, onProgress);
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
        // bundled into one flush at the end of this group's step loop.
        const downloadable = readDownloadableFile(result.outputs);
        if (downloadable) pendingDownloads.push(downloadable);

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

          setRunInputText(result.requireInput!.initialValue ?? "");
          setRunInputChoice("");
          setRunInputFiles([]);
          setRunInputRows(result.requireInput!.rows ?? []);
          const rows = result.requireInput!.rows ?? [];
          setRunInputChecked(rows.map(() => true));
          setRunInputError(null);
          setRunInputDetails({});
          setRunInputSearch("");
          setRunInputSort(null);
          setTableFrozenOrder(null);
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
        failedSteps.add(i);
        // Captured with the step's REAL index (i) and type here, at the
        // source - not derived later from this array's position, which used
        // to number errors by their position among filtered errors rather
        // than their true step index (see this feature's R7). joinStepErrorDetail
        // (run-detail.ts) does its own "+1" for display.
        allErrors.push({ index: i, type: step.type, status: "error", error: errorMsg });
        await logStep(i, step.type, "error", errorMsg, null, { startedAt, finishedAt: new Date().toISOString() }, collector.messages, resolvedInputs);
      }
    }

      // AC4 flush: this group's (this course's) step loop is done - deliver
      // whatever it produced as exactly ONE browser download, right here,
      // instead of the scatter each step used to trigger on its own.
      // planCourseDownload (attended-fanout.ts) makes the WHAT-to-download
      // decision (a no-op, the one pending file unchanged, or a zip plan);
      // only the actual zip build (JSZip) and DOM mechanics happen here.
      // `typeof document !== "undefined"` is the SAME guard every
      // contributing step already checked before setting
      // DOWNLOADABLE_OUTPUT_KEY in the first place - redundant in practice,
      // kept anyway so this block is a no-op by construction wherever
      // `document` cannot exist, matching every other DOM access in this
      // file.
      if (typeof document !== "undefined") {
        const plan = planCourseDownload(
          pendingDownloads,
          buildWorkflowFileName({
            course: entity.courseName ? { courseCode: null, name: entity.courseName } : null,
            artifact: selectedDef.name,
            ext: "zip",
          })
        );
        if (plan.kind !== "none") {
          let finalBlob: Blob;
          let finalName: string;
          if (plan.kind === "single") {
            // The common case, and the ONLY case for a standalone run of one
            // such step (its own one-step group) - exactly what that step
            // would have downloaded on its own before this feature: same
            // blob, same file name, byte for byte (AC4's "do not regress
            // single-step use").
            finalBlob = plan.blob;
            finalName = plan.fileName;
          } else {
            // More than one distinct artifact this course produced (e.g. a
            // Blackboard export AND a course materials zip - two genuinely
            // different deliverables, neither losslessly foldable into the
            // other) - bundle them into one outer zip so the course still
            // finishes with exactly one download.
            const { default: JSZip } = await import("jszip");
            const zip = new JSZip();
            for (const entry of plan.entries) {
              zip.file(entry.name, entry.blob);
            }
            finalBlob = await zip.generateAsync({ type: "blob" });
            finalName = plan.fileName;
          }
          const url = URL.createObjectURL(finalBlob);
          const a = document.createElement("a");
          a.href = url;
          a.download = finalName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      }

      const groupGenuineFailure = failedSteps.size > disabledRunIndices.size + skippedRunIndices.size;
      anyGenuineFailure = anyGenuineFailure || groupGenuineFailure;
      if (isCourseRun) {
        courseOutcomes.push({
          courseId: entity.courseId!,
          courseName: entity.courseName!,
          status: groupGenuineFailure ? "failed" : "ok",
        });
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
      if (savedZipRefs.length > 0) {
        void completeCourseZipRunLogsAction(savedZipRefs, workflowRunId, !genuineFailure).catch(() => {});
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
    setRunInputText,
    setRunInputChoice,
    setRunInputFiles,
    setRunInputRows,
    setRunInputChecked,
    setRunInputBusy,
    setRunInputError,
    setRunInputDetails,
    runInputSearch,
    setRunInputSearch,
    runInputSort,
    setRunInputSort,
    runInputInitialRows,
    tableFrozenOrder,
    setTableFrozenOrder,
    tableHasGrade,
    handleRun,
  };
}
