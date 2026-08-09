// Pure predicate for ScheduleEditForm.tsx's "this workflow needs a file at run
// time" warning (docs/weekly-announcement-package-io-acceptance-criteria.md
// AC6 item 40; docs/REGRESSION.md entry 239 checks 16 and 18).
//
// THE PROBLEM THIS FIXES. A scheduled run has no run form and therefore no
// uploaded files - a schedule only ever replays the run-form VALUES that were
// on screen when it was saved (ScheduleEditForm.tsx's own hint: "Uses the run
// form values as they are right now"), and a file input's value can never be
// one of those, so an `uploads` field that is required blocks a scheduled run
// at the form every time. The warning that used to guard this tested
// `f.type === "uploads" && f.required` over the RAW RuntimeField array. That
// is exactly right for a STATIC `required: true`, but a field whose
// requiredness comes from `requiredWhen` (StepInputSpec.requiredWhen,
// src/lib/workflows/types.ts:249) always reports `required: false` on the raw
// field - `isFieldRequired` (src/lib/workflow-field-visibility.ts) only
// resolves that gate against the run form's live `values`, and
// ScheduleEditForm/ScheduleSection never receive a `values` prop at all
// (entry 239 check 16 records this as the reason the old warning could not
// see a conditional gate - verified directly against both components'
// prop lists while fixing this: neither `ScheduleEditFormProps` nor
// `ScheduleSectionProps` names `values`).
//
// WHY THIS IS NOT "PLUMB `values` THROUGH". Resolving `isFieldRequired`
// against the CURRENT form values would answer the wrong question. The
// warning is asked at SCHEDULE time, about every FUTURE unattended run the
// schedule will ever fire - and entry 239 check 18 already flags that a
// gate's controlling value is resolved by field KEY, not guaranteed to stay
// bound to the same input across a rebind. A schedule has no values at all;
// treating "not satisfied right now" as "safe to schedule" would let an
// instructor save a schedule that runs fine today and silently starts
// failing at the form the next time they (or a future preset rebind) flips
// the gate's controlling field. So for scheduling specifically, ANY field
// that carries a `requiredWhen` gate - satisfied or not, right now or ever -
// must be treated as a field that COULD become required on some future
// unattended firing, and an uploads-typed field in that position can never be
// satisfied unattended. That is a strictly different (and stricter) question
// than "is this field required right now," which is why it needs its own
// predicate rather than reuse of `isFieldRequired`/`resolveFieldRequirements`.
//
// Kept as its own module (not folded into workflow-field-visibility.ts) since
// that module's contract is exclusively "resolve a gate against known
// values" (its own header says so) and this predicate deliberately never
// looks at values - folding it in would blur that line for every other
// caller of the file.

import type { RuntimeField } from "@/lib/workflows/types";

/**
 * Every runtime field that would block a SCHEDULED (unattended, values-less)
 * run of the workflow because it is an `uploads` field that either:
 * - is unconditionally required (`required === true`), or
 * - carries a `requiredWhen` gate at all, regardless of whether that gate is
 *   satisfied by any value known today - a schedule has no values, and any
 *   future unattended firing could satisfy the gate and hit the file input.
 *
 * An `uploads` field with neither `required` nor `requiredWhen` is optional
 * on every firing and never blocks. A non-`uploads` field never blocks,
 * whatever its gates - only a file input is impossible to satisfy
 * unattended; a normal text/select field gated `requiredWhen` still has a
 * value to fall back on (its stored default, or "").
 *
 * Pure and side-effect free so ScheduleEditForm.tsx's warning condition is
 * unit-testable without a DOM (vitest is node-env and never renders a .tsx -
 * see this file's own test for the source-reading guard that keeps the
 * component actually calling this).
 */
export function scheduleBlockingUploadFields(fields: RuntimeField[]): RuntimeField[] {
  return fields.filter((f) => f.type === "uploads" && (f.required || !!f.requiredWhen));
}
