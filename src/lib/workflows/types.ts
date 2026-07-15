// Workflow engine types and storage helpers.
//
// Workflows are ordered sequences of steps; each step declares inputs and outputs.
// Input values come from three sources: runtime form fields, earlier step outputs,
// or fixed values. Steps execute in order; outputs feed forward to later steps.

import type { ScheduleWeekPlan } from "@/app/actions";
import { parseCsvRows } from "@/lib/csv";

/**
 * Value types supported in workflows:
 * - institution: an institution acronym (e.g., "UT", "OSU")
 * - hubCourseList: newline-joined course-tile ids
 * - uploads: runtime-only file uploads; never persisted to storage
 * - lmsModule: a module id within the course chosen by the form's hubCourse field
 * - courseList: an opaque JSON payload passed between workflow steps
 */
export type WorkflowValueType =
  | "text"
  | "longtext"
  | "number"
  | "date"
  | "repo"
  | "lmsCourse"
  | "lmsCourseList"
  | "schedule"
  | "files"
  | "modules"
  | "hubCourse"
  | "org"
  | "boolean"
  | "institution"
  | "hubCourseList"
  | "uploads"
  | "lmsModule"
  | "courseList"
  | "orgList";

// Value types that can carry a fixed ("preset") value in the builder, so a
// workflow can hard-set the input and run unmonitored without prompting. Beyond
// the plain scalar types, this includes the course-tile / Canvas-course / org /
// institution entity types, which the builder renders with a proper picker
// (one / several / all for the scopeable list types).
export const LITERAL_CAPABLE_TYPES: ReadonlySet<string> = new Set([
  "text",
  "longtext",
  "number",
  "boolean",
  "hubCourse",
  "hubCourseList",
  "lmsCourse",
  "lmsCourseList",
  "org",
  "orgList",
  "institution",
]);

// A single-item value type -> its scopeable list type. Lets a single-item
// output from an earlier step bind a scopeable ("one / several / all") list
// input: the single id/url is simply a one-element list to the consuming step.
export const SINGLE_TO_LIST_TYPE: Record<string, string> = {
  hubCourse: "hubCourseList",
  lmsCourse: "lmsCourseList",
  org: "orgList",
};

/**
 * Whether an output of `outputType` may bind an input of `inputType`: an exact
 * type match, or a single-item output feeding its scopeable list input (e.g. a
 * `hubCourse` output into a `hubCourseList` "all/several" input). The reverse
 * (a list output into a single input) is NOT allowed - a single input cannot
 * hold many values.
 */
export function outputFeedsInput(outputType: string, inputType: string): boolean {
  if (outputType === inputType) return true;
  return SINGLE_TO_LIST_TYPE[outputType] === inputType;
}

export interface GeneratedCourseFile {
  name: string;
  blob: Blob;
  mimeType: string;
  weekNumber: number;
  // Position of the file within its week's LMS module (0 Introduction,
  // 1 Slides, 2 Instructions); lms-populate uploads in (weekNumber, sortOrder)
  // order and Canvas appends module items in upload sequence.
  sortOrder: number;
  // What the file is within its week; introductions carry their source text
  // so LMS steps can create pages instead of uploading the docx.
  role: "introduction" | "slides" | "instructions";
  pageText?: string;
}

export interface EnsuredModule {
  week: number;
  id: number;
  name: string;
}

export interface StepInputSpec {
  key: string;
  label: string;
  type: WorkflowValueType;
  required: boolean;
  help?: string;
  /** type "uploads" only: the file picker's accept filter (defaults to LMS
   * export archives when absent). */
  accept?: string;
}

export interface StepOutputSpec {
  key: string;
  label: string;
  type: WorkflowValueType;
}

export type InputBinding =
  | { source: "runtime"; fieldKey: string }
  | { source: "step"; stepIndex: number; outputKey: string }
  | { source: "literal"; value: string };

export interface WorkflowStepConfig {
  // A registry step type, or the special value "include-workflow": the step
  // is replaced at run time by another workflow's CURRENT steps (dynamic -
  // later edits to the source workflow apply wherever it is included). See
  // expandWorkflowDef.
  type: string;
  bindings: Record<string, InputBinding>;
  // Present only when type === "include-workflow". skipSteps lists the
  // SOURCE workflow's own top-level step indices to drop. remap keys are
  // "<skippedStepIndex>.<outputKey>" in the SOURCE workflow's coordinates;
  // values are bindings in the INCLUDING workflow's coordinates ("step"
  // stepIndex values refer to the including workflow's own earlier steps).
  // bindOverrides keys are "<sourceTopIndex>.<inputKey>" - unlike remap,
  // whose keys name OUTPUT keys of DROPPED steps, bindOverrides targets the
  // INPUT keys of KEPT steps; values are bindings in the INCLUDING
  // workflow's coordinates, translated the same way remap values are.
  include?: {
    workflowId: string;
    skipSteps: number[];
    remap: Record<string, InputBinding>;
    bindOverrides?: Record<string, InputBinding>;
  };
}

export interface WorkflowDef {
  id: string;
  name: string;
  description: string;
  preset?: boolean;
  steps: WorkflowStepConfig[];
}

export interface RuntimeField {
  fieldKey: string;
  label: string;
  type: WorkflowValueType;
  required: boolean;
  help?: string;
  /** type "uploads" only: the file picker's accept filter. */
  accept?: string;
}

/**
 * Walk workflow steps in order; for each input whose binding is runtime,
 * collect a RuntimeField. First occurrence of a fieldKey wins; skip duplicates.
 */
export function collectRuntimeFields(
  def: WorkflowDef,
  stepInputs: (type: string) => StepInputSpec[] | undefined
): RuntimeField[] {
  const seen = new Set<string>();
  const fields: RuntimeField[] = [];

  for (const step of def.steps) {
    const specs = stepInputs(step.type);
    if (!specs) continue;

    for (const spec of specs) {
      const binding = step.bindings[spec.key];
      if (binding && binding.source === "runtime") {
        const fieldKey = binding.fieldKey;
        if (!seen.has(fieldKey)) {
          seen.add(fieldKey);
          fields.push({
            fieldKey,
            label: spec.label,
            type: spec.type,
            required: spec.required,
            help: spec.help,
            accept: spec.accept,
          });
        }
      }
    }
  }

  return fields;
}

/**
 * Flatten a workflow, replacing every "include-workflow" step with the
 * CURRENT steps of the workflow it references - dynamic composition: edits
 * to the source workflow apply wherever it is included.
 *
 * The returned steps' "step" bindings are in EXPANDED coordinates and can be
 * fed straight to the runner and to collectRuntimeFields. origins[i] is null
 * for the workflow's own steps and the source workflow's name for absorbed
 * steps. topIndices[i] is the index of def's own TOP-LEVEL step that expanded
 * step i came from (an include-workflow step's absorbed steps all report the
 * include step's own index in def) - used to map per-top-level-step UI state
 * (e.g. per-user enable/disable toggles) onto the expanded step list.
 */
export function expandWorkflowDef(
  def: WorkflowDef,
  lookup: (id: string) => WorkflowDef | undefined,
  visited: string[] = []
): {
  steps: WorkflowStepConfig[];
  origins: Array<string | null>;
  topIndices: number[];
} {
  const r = expandWithTopIndices(def, lookup, visited);
  return { steps: r.steps, origins: r.origins, topIndices: r.topIndices };
}

// Internal expansion that also reports, per flat step, the index of the
// def's TOP-LEVEL step it came from. skipSteps and remap keys are written
// in the source workflow's own top-level coordinates, so resolving them
// against an already-flattened source (nested includes expand first) needs
// this flat-index -> top-level-index mapping.
function expandWithTopIndices(
  def: WorkflowDef,
  lookup: (id: string) => WorkflowDef | undefined,
  visited: string[]
): {
  steps: WorkflowStepConfig[];
  origins: Array<string | null>;
  topIndices: number[];
} {
  if (visited.includes(def.id)) {
    throw new Error(
      `Workflow include cycle: ${[...visited, def.id].join(" -> ")}`
    );
  }

  const steps: WorkflowStepConfig[] = [];
  const origins: Array<string | null> = [];
  const topIndices: number[] = [];
  // def-local step index -> expanded index. Include steps never enter the
  // map: they expand to many steps and expose no outputs, so no def-local
  // binding can validly target one.
  const defToExpanded = new Map<number, number>();

  def.steps.forEach((step, defIndex) => {
    if (step.type !== "include-workflow") {
      // Own step: translate def-local "step" bindings to their expanded
      // positions (earlier def steps are already mapped by the walk).
      const bindings: Record<string, InputBinding> = {};
      for (const [key, b] of Object.entries(step.bindings)) {
        if (b.source === "step") {
          const mapped = defToExpanded.get(b.stepIndex);
          bindings[key] =
            mapped !== undefined ? { ...b, stepIndex: mapped } : b;
        } else {
          bindings[key] = b;
        }
      }
      defToExpanded.set(defIndex, steps.length);
      steps.push({ ...step, bindings });
      origins.push(null);
      topIndices.push(defIndex);
      return;
    }

    const include = step.include;
    if (!include) {
      // Malformed include with no target recorded: nothing to expand.
      return;
    }

    const source = lookup(include.workflowId);
    if (!source) {
      throw new Error(`Included workflow not found: ${include.workflowId}`);
    }

    // Expand the FULL source first so nested includes are already flat by
    // the time steps are dropped and rewired; expanded.topIndices maps each
    // flat step back to the source's own top-level index.
    const expanded = expandWithTopIndices(source, lookup, [
      ...visited,
      def.id,
    ]);

    const skip = new Set(include.skipSteps);

    // Flat source index -> final expanded index for the kept steps.
    const keptMap = new Map<number, number>();
    let nextIndex = steps.length;
    expanded.steps.forEach((_, flatIndex) => {
      if (!skip.has(expanded.topIndices[flatIndex])) {
        keptMap.set(flatIndex, nextIndex++);
      }
    });

    expanded.steps.forEach((s, flatIndex) => {
      if (skip.has(expanded.topIndices[flatIndex])) return;

      const bindings: Record<string, InputBinding> = {};
      for (const [key, b] of Object.entries(s.bindings)) {
        if (b.source !== "step") {
          bindings[key] = b;
          continue;
        }

        const kept = keptMap.get(b.stepIndex);
        if (kept !== undefined) {
          // Points at another kept source step: follow it to its new home.
          bindings[key] = { ...b, stepIndex: kept };
          continue;
        }

        // Points at a dropped step: the include's remap supplies the
        // replacement, written in the INCLUDING workflow's coordinates
        // (runtime/literal used as-is; "step" indices translated through
        // this walk's map). No remap entry falls back to a runtime field
        // named after the missing output.
        const droppedDefIndex = expanded.topIndices[b.stepIndex];
        const replacement = include.remap[`${droppedDefIndex}.${b.outputKey}`];
        if (!replacement) {
          bindings[key] = { source: "runtime", fieldKey: b.outputKey };
        } else if (replacement.source === "step") {
          const mapped = defToExpanded.get(replacement.stepIndex);
          bindings[key] =
            mapped !== undefined
              ? { ...replacement, stepIndex: mapped }
              : replacement;
        } else {
          bindings[key] = replacement;
        }
      }

      // bindOverrides apply AFTER the translation above: entries keyed
      // "<sourceTopIndex>.<inputKey>" replace this kept step's input
      // bindings. Values are written in the INCLUDING workflow's
      // coordinates - runtime/literal used as-is, "step" indices
      // translated through this walk's map exactly like remap values.
      const overrides = include.bindOverrides;
      if (overrides) {
        const sourceTopIndex = expanded.topIndices[flatIndex];
        for (const [oKey, oBinding] of Object.entries(overrides)) {
          const dot = oKey.indexOf(".");
          if (dot === -1) continue;
          if (Number(oKey.slice(0, dot)) !== sourceTopIndex) continue;
          const inputKey = oKey.slice(dot + 1);
          if (oBinding.source === "step") {
            const mapped = defToExpanded.get(oBinding.stepIndex);
            bindings[inputKey] =
              mapped !== undefined
                ? { ...oBinding, stepIndex: mapped }
                : oBinding;
          } else {
            bindings[inputKey] = oBinding;
          }
        }
      }

      steps.push({ ...s, bindings });
      origins.push(source.name);
      topIndices.push(defIndex);
    });
  });

  return { steps, origins, topIndices };
}

/**
 * Convert a schedule array to CSV format.
 * Header: Week,Topic,Summary,Assignment,Test
 * One row per week with CSV-escaped values.
 */
export function scheduleToCsv(schedule: ScheduleWeekPlan[]): string {
  const csvEscape = (value: string | null): string => {
    if (!value) return "";
    const v = String(value);
    // A bare \r is a row break to parseCsvRows, so it must be quoted too.
    if (
      v.includes(",") ||
      v.includes('"') ||
      v.includes("\n") ||
      v.includes("\r")
    ) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  };

  const rows: string[] = ["Week,Topic,Summary,Assignment,Test"];
  for (const week of schedule) {
    const row = [
      String(week.week),
      csvEscape(week.topic),
      csvEscape(week.summary),
      csvEscape(week.assignmentTitle),
      csvEscape(week.testName),
    ].join(",");
    rows.push(row);
  }

  return rows.join("\n");
}

// Inverse of scheduleToCsv minus assignmentSlug. Used by the Schedule of Topics
// fallback and safe on arbitrary user-uploaded CSVs.
export function csvToSchedule(csv: string): ScheduleWeekPlan[] {
  const rows = parseCsvRows(csv);

  // Drop rows whose cells are all empty strings.
  const nonEmpty = rows.filter((row: string[]) =>
    row.some((cell: string) => cell.trim().length > 0)
  );

  if (nonEmpty.length === 0) {
    return [];
  }

  // The first remaining row is the header. Build a column index.
  const headerRow = nonEmpty[0];
  const columnIndex: Record<string, number> = {};

  for (let i = 0; i < headerRow.length; i++) {
    const normalized = headerRow[i].trim().toLowerCase();
    if (
      normalized === "week" ||
      normalized === "topic" ||
      normalized === "summary" ||
      normalized === "assignment" ||
      normalized === "test"
    ) {
      columnIndex[normalized] = i;
    }
  }

  // If there is no header row or it lacks BOTH "week" and "topic" columns, return [].
  if (!("week" in columnIndex) || !("topic" in columnIndex)) {
    return [];
  }

  const result: ScheduleWeekPlan[] = [];

  for (let i = 1; i < nonEmpty.length; i++) {
    const row = nonEmpty[i];

    // Parse week; skip rows where week is not an integer >= 1. Number (not
    // parseInt) so fractional weeks like "1.5" are skipped, not truncated.
    const weekCell = (row[columnIndex["week"]] ?? "").trim();
    const week = Number(weekCell);
    if (!Number.isInteger(week) || week < 1) {
      continue;
    }

    const topic = (row[columnIndex["topic"]] ?? "").trim();
    const summary = (row[columnIndex["summary"] ?? -1] ?? "").trim();
    const assignmentCell = (row[columnIndex["assignment"] ?? -1] ?? "").trim();
    const testCell = (row[columnIndex["test"] ?? -1] ?? "").trim();

    result.push({
      week,
      topic,
      summary,
      assignmentTitle: assignmentCell || null,
      assignmentSlug: null,
      testName: testCell || null,
    });
  }

  return result;
}

// Storage helpers (guard typeof window === "undefined" for SSR safety)

const WORKFLOWS_KEY = "ta-workflows";

export function loadCustomWorkflows(): WorkflowDef[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(WORKFLOWS_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as WorkflowDef[];
  } catch {
    return [];
  }
}

export function saveCustomWorkflows(defs: WorkflowDef[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(defs));
  } catch {
    // Silently fail if localStorage is unavailable.
  }
}

// Per-user, per-workflow overlay of disabled TOP-LEVEL step indices (see
// expandWorkflowDef's topIndices). Never edits the workflow def itself -
// presets and custom workflows both stay read-only; this is purely a local
// "skip this step for my runs" preference, mirroring ta-workflow-values-<id>.
const DISABLED_STEPS_PREFIX = "ta-workflow-disabled-";

// Pure parse step, split out from loadDisabledSteps so the JSON-shape
// handling (malformed JSON, non-array payloads, non-number entries) is
// testable without a DOM/localStorage-backed environment.
export function parseDisabledSteps(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n): n is number => typeof n === "number");
  } catch {
    return [];
  }
}

export function loadDisabledSteps(workflowId: string): number[] {
  if (typeof window === "undefined") return [];
  return parseDisabledSteps(
    localStorage.getItem(`${DISABLED_STEPS_PREFIX}${workflowId}`)
  );
}

export function saveDisabledSteps(workflowId: string, indices: number[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${DISABLED_STEPS_PREFIX}${workflowId}`,
      JSON.stringify(indices)
    );
  } catch {
    // Silently fail if localStorage is unavailable.
  }
}
