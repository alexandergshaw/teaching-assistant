"use client";

import { useMemo, useState, useRef } from "react";
import { resolveDocumentAuthor } from "@/lib/author";
import { saveRecordingFile, listRecordingFiles, downloadRecordingFile, extForFile } from "@/lib/recording-files";
import { uploadCourseZip, uploadCourseZipChunked, removeCourseZip, removeCourseZipObjects } from "@/lib/course-files";
import { isScopeableListType, expandScopedValue, resolveClassRepoRef, resolveClassTileRef } from "@/lib/workflows/scope";
import { isInstitutionFanout, isCourseFanout, resolveFanoutInstitutions, resolveFanoutCourses, scopeForInstitution, scopeForCourse } from "@/lib/workflows/fanout";
import { applyStopAfterCourse, buildCourseFanoutDetail, type RunStateGroup, type CourseOutcome } from "./attended-fanout";
import { loadInstitutionFields } from "@/lib/institution-fields";
import { appendCourseMaterialFileAction, appendCourseExportFileAction } from "@/app/actions";
import { recordWorkflowRun } from "@/lib/workflow-runs";
import { updateScheduleRunOutcome, updateTriggerRunOutcome } from "@/lib/workflow-run-status";
import { getStoredProvider } from "@/lib/llm-provider";
import { loadCommonResources } from "@/lib/common-resources";
import { applyWorkflowScope, scopeCoversType } from "@/lib/workflows/types";
import {
  getStepDefinition,
  type StepRunHelpers,
  type TableRowDetail,
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
  runInput: { groupIndex: number; stepIndex: number; message: string; kind: "text" | "choice" | "upload" | "workflow" | "table"; options: Array<{ value: string; label: string }>; optional: boolean; initialValue?: string; submitLabel?: string; regenerate?: () => Promise<string>; columns?: Array<{ key: string; label: string; editable?: boolean; multiline?: boolean; link?: boolean; width?: number }>; selectable?: boolean; rowDetail?: (row: Record<string, string>) => Promise<TableRowDetail>; transform?: (value: string | File[] | Array<Record<string, string>>) => unknown } | null;
  inputResolverRef: React.MutableRefObject<{ resolve: (value: string | File[] | Array<Record<string, string>> | null) => void } | null>;
  setRunInputText: (value: string) => void;
  setRunInputChoice: (value: string) => void;
  setRunInputFiles: (files: File[]) => void;
  setRunInputRows: (rows: Array<Record<string, string>>) => void;
  setRunInputChecked: (checked: boolean[]) => void;
  setRunInputBusy: (busy: boolean) => void;
  setRunInputError: (error: string | null) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setRunInputDetails: (details: Record<number, { open: boolean; status: "loading" | "done" | "error"; detail: TableRowDetail | null; error: string; run?: { status: "running" | "done"; result: any; error?: string } }>) => void;
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
  onSetPanel: (panel: "build" | "run" | "automate") => void,
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

  const [runInput, setRunInput] = useState<{
    groupIndex: number;
    stepIndex: number;
    message: string;
    kind: "text" | "choice" | "upload" | "workflow" | "table";
    options: Array<{ value: string; label: string }>;
    optional: boolean;
    initialValue?: string;
    submitLabel?: string;
    regenerate?: () => Promise<string>;
    columns?: Array<{ key: string; label: string; editable?: boolean; multiline?: boolean; link?: boolean; width?: number }>;
    selectable?: boolean;
    rowDetail?: (row: Record<string, string>) => Promise<TableRowDetail>;
    transform?: (value: string | File[] | Array<Record<string, string>>) => unknown;
  } | null>(null);
  const inputResolverRef = useRef<{ resolve: (value: string | File[] | Array<Record<string, string>> | null) => void } | null>(null);
  const [, setRunInputText] = useState("");
  const [, setRunInputChoice] = useState("");
  const [, setRunInputFiles] = useState<File[]>([]);
  const [runInputRows, setRunInputRows] = useState<Array<Record<string, string>>>([]);
  const [, setRunInputChecked] = useState<boolean[]>([]);
  const [, setRunInputBusy] = useState(false);
  const [, setRunInputError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [, setRunInputDetails] = useState<Record<number, { open: boolean; status: "loading" | "done" | "error"; detail: TableRowDetail | null; error: string; run?: { status: "running" | "done"; result: any; error?: string } }>>({});
  const [runInputSearch, setRunInputSearch] = useState("");
  const [runInputSort, setRunInputSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [runInputInitialRows, setRunInputInitialRows] = useState<Array<Record<string, string>>>([]);
  const [tableFrozenOrder, setTableFrozenOrder] = useState<number[] | null>(null);

  const tableHasGrade =
    runInput?.kind === "table" && (runInput.columns ?? []).some((c) => c.key === "grade");

  useMemo(() => {
    if (!runInput || runInput.kind !== "table") return [];
    if (tableFrozenOrder) {
      return tableFrozenOrder
        .map((index) => ({ row: runInputRows[index], index }))
        .filter((entry) => entry.row !== undefined);
    }
    const query = runInputSearch.trim().toLowerCase();
    let list = runInputRows.map((row, index) => ({ row, index }));
    if (query) {
      const keys = (runInput.columns ?? []).filter((c) => !c.link).map((c) => c.key);
      list = list.filter(({ row }) => keys.some((k) => (row[k] ?? "").toLowerCase().includes(query)));
    }
    if (runInputSort) {
      const { key, dir } = runInputSort;
      list = [...list].sort((a, b) => {
        const na = parseFloat(a.row[key] ?? "");
        const nb = parseFloat(b.row[key] ?? "");
        const aNum = (a.row[key] ?? "").trim() !== "" && Number.isFinite(na);
        const bNum = (b.row[key] ?? "").trim() !== "" && Number.isFinite(nb);
        let cmp: number;
        if (aNum && bNum) cmp = na - nb;
        else if (aNum) cmp = -1;
        else if (bNum) cmp = 1;
        else cmp = (a.row[key] ?? "").localeCompare(b.row[key] ?? "");
        return (dir === "asc" ? 1 : -1) * cmp;
      });
    }
    return list;
  }, [runInput, runInputRows, runInputSearch, runInputSort, tableFrozenOrder]);

  useMemo(() => {
    if (!tableHasGrade) return null;
    const values: number[] = [];
    let invalid = 0;
    let missing = 0;
    for (const row of runInputRows) {
      if ((row.grade ?? "").trim() === "") missing += 1;
      else {
        const raw = (row.grade ?? "").trim();
        if (!/^-?\d+(\.\d+)?$/.test(raw)) invalid += 1;
        else {
          const grade = parseFloat(raw);
          const outOf = parseFloat((row.outOf ?? "").trim());
          if (grade < 0 || (Number.isFinite(outOf) && grade > outOf)) invalid += 1;
          else values.push(grade);
        }
      }
    }
    if (values.length === 0) return { invalid, missing, avg: null as number | null, median: null as number | null, min: null as number | null, max: null as number | null };
    const sorted = [...values].sort((x, y) => x - y);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const median =
      sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]
        : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
    return { invalid, missing, avg, median, min: sorted[0], max: sorted[sorted.length - 1] };
  }, [tableHasGrade, runInputRows]);

  useMemo(() => {
    if (!tableHasGrade) return null;
    type GradeBand = "success" | "accent" | "warning" | "danger";
    const counts: Record<GradeBand, number> = {
      success: 0,
      accent: 0,
      warning: 0,
      danger: 0,
    };
    for (const row of runInputRows) {
      const raw = (row.grade ?? "").trim();
      if (raw === "") continue;
      const outOf = parseFloat((row.outOf ?? "").trim());
      if (!Number.isFinite(outOf) || outOf <= 0) continue;
      const pct = (parseFloat(raw) / outOf) * 100;
      const band: GradeBand =
        pct >= 90 ? "success" : pct >= 80 ? "accent" : pct >= 70 ? "warning" : "danger";
      counts[band] += 1;
    }
    const total = counts.success + counts.accent + counts.warning + counts.danger;
    if (total === 0) return null;
    const segments: Array<{ band: Exclude<GradeBand, "neutral">; label: string; count: number }> = [
      { band: "success", label: "90%+", count: counts.success },
      { band: "accent", label: "80-89%", count: counts.accent },
      { band: "warning", label: "70-79%", count: counts.warning },
      { band: "danger", label: "below 70%", count: counts.danger },
    ];
    return {
      total,
      segments,
      ariaLabel: segments.map((s) => `${s.count} at ${s.label}`).join(", "),
    };
  }, [tableHasGrade, runInputRows]);

  const validateForm = (): boolean => {
    setValidationError(null);
    for (const field of runtimeFields) {
      if (!field.required) continue;

      const fieldTypes = ["text", "longtext", "number", "date", "repo", "lmsCourse", "lmsCourseList", "hubCourse", "org", "orgList", "institution", "hubCourseList", "uploads", "deckTemplate", "concepts"];
      if (!fieldTypes.includes(field.type)) continue;

      if (field.type === "uploads") {
        const files = uploadFiles[field.fieldKey] ?? [];
        if (files.length === 0) {
          setValidationError(`${field.label} requires at least one file.`);
          return false;
        }
      } else if (field.type === "hubCourseList") {
        const ids = values[field.fieldKey]
          ?.split("\n")
          .map((s: string) => s.trim())
          .filter(Boolean) ?? [];
        if (ids.length === 0) {
          setValidationError(`${field.label} requires at least one course.`);
          return false;
        }
      } else {
        const value = values[field.fieldKey] ?? "";
        if (!value.trim()) {
          setValidationError(`${field.label} is required.`);
          return false;
        }

        if (field.type === "number") {
          const num = Number(value);
          if (!Number.isFinite(num)) {
            setValidationError(`${field.label} must be a valid number.`);
            return false;
          }
        }
      }
    }
    return true;
  };

  const allStepsDisabled = expanded.steps.length > 0 && enabledExpandedSteps.length === 0;

  const handleRun = async () => {
    if (!selectedDef) return;
    if (expanded.error) return;
    onSetPanel("run");
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

    const instFanout = isInstitutionFanout(selectedDef.scope);
    const hubCourse = (selectedDef.scope?.hubCourse ?? "").trim();
    const courseFanout = hubCourse === "*" || (hubCourse.split("\n").map((s) => s.trim()).filter(Boolean).length >= 2);
    if (instFanout && courseFanout) {
      setValidationError("Scope cannot target all institutions and multiple course tiles at once - pick one fan-out dimension.");
      setRunning(false);
      return;
    }

    const isCourseRun = isCourseFanout(selectedDef.scope);

    let fanoutEntities: Array<{ institution: string | null; courseId?: string; courseName?: string }>;
    if (isInstitutionFanout(selectedDef.scope)) {
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
    } else if (isCourseRun) {
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
    const allErrors: string[] = [];
    const courseOutcomes: CourseOutcome[] = [];
    let currentGroupIndex = 0;

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
      let groupScope = selectedDef.scope;
      if (entity.institution) {
        groupScope = scopeForInstitution(groupScope!, entity.institution);
      }
      if (entity.courseId) {
        groupScope = scopeForCourse(groupScope!, entity.courseId);
      }
      const groupHelpers: StepRunHelpers = entity.institution
        ? { ...helpers, activeInstitution: entity.institution }
        : helpers;

      const stepOutputs: Array<Record<string, unknown>> = [];
      const failedSteps = new Set<number>();
      const disabledRunIndices = new Set<number>();
      const skippedRunIndices = new Set<number>();

      for (let i = 0; i < expanded.steps.length; i++) {
      const step = expanded.steps[i];
      const def = getStepDefinition(step.type);

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
        continue;
      }

      setRunState((prev) => {
        const next = [...prev];
        const steps = [...next[g].steps];
        steps[i] = { ...steps[i], status: "running" };
        next[g] = { ...next[g], steps };
        return next;
      });

      try {
        if (!def) {
          throw new Error(`Unknown step type "${step.type}".`);
        }

        const resolvedInputs: Record<string, unknown> = {};
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
            if (field?.type === "uploads") {
              resolvedInputs[spec.key] = uploadFiles[binding.fieldKey] ?? [];
            } else {
              const runVal = scopeCoversType(groupScope, spec.type)
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

        const onProgress = (text: string) => {
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

        setRunState((prev) => {
          const next = [...prev];
          const steps = [...next[g].steps];
          steps[i] = {
            status: "done",
            progress: null,
            summary: result.summary,
            error: null,
          };
          next[g] = { ...next[g], steps };
          return next;
        });

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
        allErrors.push(errorMsg);
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
      let detail = genuineFailure
        ? allErrors.map((msg, i) => `step ${i + 1}: ${msg}`).join("; ")
        : "";
      if (isCourseRun && courseOutcomes.length > 0) {
        const courseSummary = buildCourseFanoutDetail(courseOutcomes);
        detail = detail ? `${courseSummary} - ${detail}` : courseSummary;
      }
      void recordWorkflowRun(supabase, user.id, {
        workflowId: selectedDef.id,
        workflowName: selectedDef.name,
        status: genuineFailure ? "error" : "ok",
        triggerSource: "manual",
        id: workflowRunId,
      }).catch((err) => console.error("Failed to record workflow run:", err));
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
