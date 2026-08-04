// Pure conditional-visibility predicate for the workflow run form
// (RuntimeFieldInput.tsx via WorkflowPanel.tsx) and its submission path
// (useWorkflowRun.ts's binding resolution, validate-run-form.ts's required-
// field check). A field carrying StepInputSpec.visibleWhen (types.ts) is
// shown - and can be submitted/required - only while another field of the
// SAME step (visibleWhen.fieldKey) currently satisfies the gate - either an
// EXACT match (visibleWhen.equals - e.g. course-schedule-from-source's
// per-source inputs, each visible only for its own "source" choice) or a
// CONTAINS match against a multi-select controlling field (visibleWhen.
// contains - e.g. a toggle that only makes sense for one selected output
// family among several).
//
// Kept out of workflows/types.ts (already close to this repo's 1000-line cap)
// and deliberately pure - no React - so the render layer and the run-time
// guards share ONE definition of "visible," and so it is directly unit-
// testable without a DOM (multi-select-value.ts is the precedent for this
// module's shape).
import type { RuntimeField, StepInputSpec } from "@/lib/workflows/types";
import { parseMultiSelectValue } from "@/lib/multi-select-value";

/**
 * Whether a field should be shown/submitted/required given the form's
 * current values. A field with no `visibleWhen` is always visible.
 *
 * An `equals` gate is visible only when the controlling field's CURRENT
 * value exactly matches - so before any controlling value is chosen (its
 * value is "" or absent from `values`), every field gated on it stays
 * hidden, since "" never equals a real option value.
 *
 * A `contains` gate is for a MULTI-select controlling field (StepInputSpec.
 * options + multi, e.g. course-build's "outputs"): visible when the
 * controlling value's newline-separated entries (parseMultiSelectValue,
 * multi-select-value.ts - never a hand-rolled split, so both sides of this
 * comparison always normalize the same way) include `contains` as a WHOLE
 * entry - never a substring match, so a gate for "qa" is never satisfied by
 * an entry like "instructorNotes" or "qaSomething". A BLANK controlling
 * value (absent, or every entry trimmed away) means "every entry" for a
 * multi-select - the same "blank means all" convention output-selection.ts's
 * parseOutputSelection already uses - so a `contains`-gated field stays
 * visible exactly as it does today, before the controlling multi-select has
 * been touched.
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
  const controllingValue = values[gate.fieldKey] ?? "";
  if ("contains" in gate) {
    const entries = parseMultiSelectValue(controllingValue);
    if (entries.length === 0) return true;
    return entries.includes(gate.contains);
  }
  return controllingValue === gate.equals;
}
