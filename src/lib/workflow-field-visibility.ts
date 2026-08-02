// Pure conditional-visibility predicate for the workflow run form
// (RuntimeFieldInput.tsx via WorkflowPanel.tsx) and its submission path
// (useWorkflowRun.ts's binding resolution, validate-run-form.ts's required-
// field check). A field carrying StepInputSpec.visibleWhen (types.ts) is
// shown - and can be submitted/required - only while another field of the
// SAME step (visibleWhen.fieldKey) currently holds visibleWhen.equals - e.g.
// course-schedule-from-source's per-source inputs (repo/cartridge/syllabus/
// lmsCourse), each visible only for its own "source" choice.
//
// Kept out of workflows/types.ts (already close to this repo's 1000-line cap)
// and deliberately pure - no React - so the render layer and the run-time
// guards share ONE definition of "visible," and so it is directly unit-
// testable without a DOM (multi-select-value.ts is the precedent for this
// module's shape).
import type { RuntimeField, StepInputSpec } from "@/lib/workflows/types";

/**
 * Whether a field should be shown/submitted/required given the form's
 * current values. A field with no `visibleWhen` is always visible. A gated
 * field is visible only when the controlling field's CURRENT value exactly
 * equals the required one - so before any controlling value is chosen (its
 * value is "" or absent from `values`), every field gated on it stays
 * hidden, since "" never equals a real option value.
 *
 * Accepts either a run-form RuntimeField or a step's own StepInputSpec (both
 * carry `visibleWhen` with the same shape) so callers on either side of
 * collectRuntimeFields can share this one function.
 */
export function isFieldVisible(
  field: Pick<RuntimeField, "visibleWhen"> | Pick<StepInputSpec, "visibleWhen">,
  values: Record<string, string>
): boolean {
  const gate = field.visibleWhen;
  if (!gate) return true;
  return (values[gate.fieldKey] ?? "") === gate.equals;
}
