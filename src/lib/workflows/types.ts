// Workflow engine types and storage helpers.
//
// Workflows are ordered sequences of steps; each step declares inputs and outputs.
// Input values come from three sources: runtime form fields, earlier step outputs,
// or fixed values. Steps execute in order; outputs feed forward to later steps.

import type { ScheduleWeekPlan } from "@/app/actions";

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
  | "courseList";

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
  include?: {
    workflowId: string;
    skipSteps: number[];
    remap: Record<string, InputBinding>;
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
 * steps.
 */
export function expandWorkflowDef(
  def: WorkflowDef,
  lookup: (id: string) => WorkflowDef | undefined,
  visited: string[] = []
): { steps: WorkflowStepConfig[]; origins: Array<string | null> } {
  const r = expandWithTopIndices(def, lookup, visited);
  return { steps: r.steps, origins: r.origins };
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
    if (v.includes(",") || v.includes('"') || v.includes("\n")) {
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
