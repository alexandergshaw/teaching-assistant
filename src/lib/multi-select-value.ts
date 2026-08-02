// Pure parse/serialize for a runtime field that has BOTH `options` and
// `multi` (StepInputSpec.options/multi, src/lib/workflows/types.ts, carried
// through into RuntimeField.options/multi) - e.g. course-build's "outputs"
// field (steps.course-build-scope.ts) and messaging's "instructions" field
// (steps.messaging.ts). The stored value is newline-joined, the SAME format
// every other list-type runtime value in this app already uses (the
// hubCourse/lmsCourse/org list families - see WorkflowScope in types.ts) -
// so nothing downstream of the run form (a step's `run` function, a
// preset's bindOverride, a saved workflow def) needs to change when the
// render layer (RuntimeFieldInput.tsx) swaps a plain textarea for a real
// multi-select control.
//
// Deliberately pure - no MUI, no React - so it is testable without
// rendering, and so RuntimeFieldInput.tsx's control just calls these two
// functions rather than re-implementing the newline split/join/trim logic
// inline.
//
// This module is option-list-agnostic on purpose: it does not accept (or
// validate against) a field's `options` array. A value that no longer
// matches any current option (the field definition dropped it, or an
// instructor free-typed something outside the list) parses and serializes
// exactly like any other entry - whether to still display it is a caller
// concern (RuntimeFieldInput.tsx), not this module's. Per-family validation
// that a value must be a known option (e.g. output-selection.ts's
// parseOutputSelection, which throws on an unrecognized family) is separate,
// step-specific business logic layered on top of this generic value shape.

/**
 * Parse the newline-joined stored value into an ordered list of selected
 * entries: trimmed, blank lines dropped, and a repeated entry kept only at
 * its first occurrence (a checkbox/multi-select selection has no way to
 * represent choosing the same value twice, so the parsed list mirrors what
 * the control can actually show).
 */
export function parseMultiSelectValue(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/**
 * Serialize a list of selected entries back into the newline-joined stored
 * form, applying the same normalization parseMultiSelectValue does (trim,
 * drop blanks, drop repeats) so parse(serialize(x)) reproduces the same
 * selection as parse(x) for any x - the round-trip contract every consumer
 * of this value (parseOutputSelection, draftMessageReplyAction, etc.)
 * already relies on. An empty selection serializes to "" (blank).
 */
export function serializeMultiSelectValue(values: string[]): string {
  return parseMultiSelectValue(values.join("\n")).join("\n");
}

/**
 * Whether a runtime field's value should be handled as a multi-select
 * (RuntimeFieldInput.tsx renders it via the Autocomplete "multiple" control
 * and this module's parse/serialize) rather than whatever its `field.type`
 * would otherwise dispatch to. True only when BOTH `options` and `multi`
 * are set:
 * - `options` alone (no `multi`) is the pre-existing, UNCHANGED single-
 *   select case (the "text" type's MenuItem dropdown in
 *   RuntimeFieldInput.tsx) - this function must return false for it so that
 *   path is never touched.
 * - `multi` alone (no `options`, or an empty `options` array) has nothing
 *   to pick from, so it also falls through unchanged (a plain text/longtext
 *   field) rather than rendering an empty multi-select.
 */
export function usesMultiSelect(field: { options?: string[]; multi?: boolean }): boolean {
  return Boolean(field.options && field.options.length > 0 && field.multi);
}
