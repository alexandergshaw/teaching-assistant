// Pure required-field validation for useWorkflowRun.ts's handleRun. Extracted
// into its own plain module (no React) so it is directly unit-testable:
// vitest.config.ts runs tests under a plain "node" environment (no DOM), so
// anything living inside the "use client" hook itself (React state) cannot be
// exercised directly - this function takes/returns plain data instead.
import type { RuntimeField } from "@/lib/workflows/types";
import { isFieldVisible } from "@/lib/workflow-field-visibility";

// Field types the run form actually validates. Any runtime field whose type
// is not in this list is skipped (never blocks Run), matching the original
// inline validateForm's field-type allowlist.
const VALIDATED_FIELD_TYPES = [
  "text",
  "longtext",
  "number",
  "date",
  "repo",
  "lmsCourse",
  "lmsCourseList",
  "hubCourse",
  "org",
  "orgList",
  "institution",
  "hubCourseList",
  "uploads",
  "deckTemplate",
  "assignmentTemplate",
  "testTemplate",
  "classSessionTemplate",
  "concepts",
];

/**
 * Validates the run form's required fields against the current values/upload
 * state. Fields are checked in the order given (the order runtimeFields is
 * provided in, which mirrors workflow step order) and the FIRST validation
 * failure wins - matching the original inline validateForm, which returned
 * false as soon as one required field failed.
 *
 * Returns the error message for the first failing field, or null when every
 * required field passes.
 */
export function validateRunForm(
  runtimeFields: RuntimeField[],
  values: Record<string, string>,
  uploadFiles: Record<string, File[]>
): string | null {
  for (const field of runtimeFields) {
    if (!field.required) continue;
    if (!VALIDATED_FIELD_TYPES.includes(field.type)) continue;
    // A required field the run form is currently hiding (StepInputSpec.
    // visibleWhen, types.ts) must never deadlock submission - the instructor
    // cannot fill in a field they cannot see. See workflow-field-visibility.ts.
    if (!isFieldVisible(field, values)) continue;

    if (field.type === "uploads") {
      const files = uploadFiles[field.fieldKey] ?? [];
      if (files.length === 0) {
        return `${field.label} requires at least one file.`;
      }
    } else if (field.type === "hubCourseList") {
      const ids =
        values[field.fieldKey]
          ?.split("\n")
          .map((s: string) => s.trim())
          .filter(Boolean) ?? [];
      if (ids.length === 0) {
        return `${field.label} requires at least one course.`;
      }
    } else {
      const value = values[field.fieldKey] ?? "";
      if (!value.trim()) {
        return `${field.label} is required.`;
      }

      if (field.type === "number") {
        const num = Number(value);
        if (!Number.isFinite(num)) {
          return `${field.label} must be a valid number.`;
        }
      }
    }
  }
  return null;
}
