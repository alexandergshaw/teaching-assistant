// Pure conditional-visibility AND conditional-requiredness predicates for the
// workflow run form (RuntimeFieldInput.tsx via WorkflowPanel.tsx) and its
// submission path (useWorkflowRun.ts's binding resolution, validate-run-
// form.ts's required-field check). A field carrying StepInputSpec.visibleWhen
// (types.ts) is shown - and can be submitted/required - only while another
// field of the SAME step (visibleWhen.fieldKey) currently satisfies the gate
// - either an EXACT match (visibleWhen.equals - e.g. course-schedule-from-
// source's per-source inputs, each visible only for its own "source" choice)
// or a CONTAINS match against a multi-select controlling field (visibleWhen.
// contains - e.g. a toggle that only makes sense for one selected output
// family among several). A field carrying StepInputSpec.requiredWhen becomes
// required, on top of any static `required`, under an EXACT match
// (requiredWhen.equals - the same rule visibleWhen.equals uses) OR an EXACT
// MISMATCH (requiredWhen.notEquals - e.g. weekly-announcement-schedule's
// hubCourse, required unless "Draft from" is the uploaded-package option) -
// see isFieldRequired below. There are exactly three blank-controlling-value
// rules across this module, one per gate KIND, and they deliberately do not
// agree: `equals` (shared by both visibleWhen and requiredWhen) says blank
// never satisfies; visibleWhen's `contains` says blank means "every entry"
// (satisfies); requiredWhen's `notEquals` says blank always satisfies too,
// but for the opposite reason - blank simply never equals the excluded
// value. Do not assume any two of the three behave the same; each function
// below documents its own.
//
// Kept out of workflows/types.ts (already close to this repo's 1000-line cap)
// and deliberately pure - no React - so the render layer and the run-time
// guards share ONE definition of "visible" and ONE of "required," and so both
// are directly unit-testable without a DOM (multi-select-value.ts is the
// precedent for this module's shape).
import type { RuntimeField, StepInputSpec } from "@/lib/workflows/types";
import { parseMultiSelectValue } from "@/lib/multi-select-value";

/**
 * The exact-match rule an `equals` gate resolves by, shared by
 * isFieldVisible's `equals` arm and isFieldRequired's `equals` arm so all
 * three can never disagree about what one means: case-sensitive, no trim,
 * and a blank or absent controlling value never satisfies it (an untouched
 * field is "").
 */
function equalsGateSatisfied(gate: { fieldKey: string; equals: string }, values: Record<string, string>): boolean {
  const controllingValue = values[gate.fieldKey] ?? "";
  return controllingValue === gate.equals;
}

/**
 * The exact-MISMATCH rule a `notEquals` gate resolves by - isFieldRequired's
 * `notEquals` arm, its only caller (requiredWhen is the only gate with this
 * arm; visibleWhen has no `notEquals` of its own - see StepInputSpec.
 * requiredWhen's comment, types.ts, for why). Same case-sensitive, no-trim
 * comparison as equalsGateSatisfied above - the two helpers can never drift
 * apart on HOW a value is compared, only on which side of the comparison
 * counts as "satisfied." The blank-value rule is the deliberate OPPOSITE of
 * equalsGateSatisfied's: a blank/absent controlling value (an untouched
 * field is "") DOES satisfy `notEquals`, because "" is never equal to a real
 * option value including `gate.notEquals` itself. That is the entire point
 * of this arm - it lets a field be required BY DEFAULT, on an untouched
 * form, and become optional only once the instructor makes one specific
 * opt-in choice (e.g. hubCourse, steps.weekly-announcement-schedule.ts,
 * required unless "Draft from" is set to the uploaded-package option) -
 * which the `equals` arm cannot express (it can only say "required exactly
 * when," never "required unless").
 */
function notEqualsGateSatisfied(
  gate: { fieldKey: string; notEquals: string },
  values: Record<string, string>
): boolean {
  const controllingValue = values[gate.fieldKey] ?? "";
  return controllingValue !== gate.notEquals;
}

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
  if ("contains" in gate) {
    const controllingValue = values[gate.fieldKey] ?? "";
    const entries = parseMultiSelectValue(controllingValue);
    if (entries.length === 0) return true;
    return entries.includes(gate.contains);
  }
  return equalsGateSatisfied(gate, values);
}

/**
 * Whether a field is required given the form's current values. A static
 * `required: true` always wins, gate or no gate - a `requiredWhen` can only
 * ADD an obligation, never remove one. Otherwise the field is required
 * exactly when `requiredWhen` is present and its gate is satisfied - either
 * arm:
 *   - `equals` (equalsGateSatisfied above): required exactly when the
 *     controlling field's CURRENT value exactly matches - the same rule
 *     isFieldVisible's `equals` arm uses, so the two can never disagree
 *     about what THAT arm means. A blank/absent controller never satisfies
 *     it.
 *   - `notEquals` (notEqualsGateSatisfied above): required whenever the
 *     controlling field's CURRENT value is anything OTHER than
 *     `notEquals` - and a blank/absent controller DOES satisfy it, the
 *     opposite of the `equals` arm's rule (see notEqualsGateSatisfied's own
 *     comment for why that is correct, not an inconsistency).
 *
 * Deliberately does NOT consider visibility: entry 176 AC2 keeps "a hidden
 * required field must never deadlock Run" in validateRunForm, evaluated
 * BEFORE this predicate is asked about requiredness at all. Folding
 * visibility in here too would silently un-require every hidden gated field
 * and split that one rule across two places.
 *
 * The parameter type makes `required` OPTIONAL (unlike isFieldVisible's
 * Pick<RuntimeField | StepInputSpec, ...>, where `required` is non-optional
 * on both interfaces and a Pick of it would reject a bare `{}` fixture) so a
 * structural RuntimeField, StepInputSpec, or plain test object all work.
 */
export function isFieldRequired(
  field: {
    required?: boolean;
    requiredWhen?: { fieldKey: string; equals: string } | { fieldKey: string; notEquals: string };
  },
  values: Record<string, string>
): boolean {
  if (field.required) return true;
  const gate = field.requiredWhen;
  if (!gate) return false;
  if ("notEquals" in gate) return notEqualsGateSatisfied(gate, values);
  return equalsGateSatisfied(gate, values);
}

/**
 * The display-side application of isFieldRequired: returns NEW field objects
 * with `required` set to the effective value (gate resolved against `values`)
 * and every other property left intact. Never mutates `fields` - callers
 * (RunFormFields.tsx) hold the original array elsewhere (e.g. validateRunForm
 * resolves independently from the unfiltered list) and must not see it change
 * out from under them.
 */
export function resolveFieldRequirements<
  T extends {
    required: boolean;
    requiredWhen?: { fieldKey: string; equals: string } | { fieldKey: string; notEquals: string };
  },
>(fields: T[], values: Record<string, string>): T[] {
  return fields.map((field) => ({ ...field, required: isFieldRequired(field, values) }));
}
