// Workflow engine types and storage helpers.
//
// Workflows are ordered sequences of steps; each step declares inputs and outputs.
// Input values come from three sources: runtime form fields, earlier step outputs,
// or fixed values. Steps execute in order; outputs feed forward to later steps.

import type { ScheduleWeekPlan } from "@/app/actions";

export type WorkflowValueType =
  | "text"
  | "longtext"
  | "number"
  | "repo"
  | "lmsCourse"
  | "schedule"
  | "files"
  | "modules"
  | "hubCourse"
  | "org";

export interface GeneratedCourseFile {
  name: string;
  blob: Blob;
  mimeType: string;
  weekNumber: number;
  // Position of the file within its week's LMS module (0 Introduction,
  // 1 Slides, 2 Instructions); lms-populate uploads in (weekNumber, sortOrder)
  // order and Canvas appends module items in upload sequence.
  sortOrder: number;
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
  type: string;
  bindings: Record<string, InputBinding>;
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
