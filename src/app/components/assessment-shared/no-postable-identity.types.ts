// Type-only fixture for assessment-row.ts's NoPostableIdentity guard.
//
// This file's consumer is tsc, not a runtime caller - it is the one legal
// caller-free module in this wave, because it emits no runtime code (every
// declaration below is `type`/`declare`, erased entirely at compile time).
// Its whole purpose is to be a canary: if a future edit to
// NoPostableIdentity ever weakens the guard, `npx tsc --noEmit` goes red
// here first, before any real row type is affected.
//
// MEASURED FACTS (this repo's docs/loop/this-repo.md and this wave's own
// brief) - not re-derived here, and the corrected claim is stated once:
// tsc in this repo DOES read a .types.ts file under src/, and the guard
// fires at a generic call site with
// `TS2345: Argument of type 'Dirty' is not assignable to parameter of type 'never'`.
// The tuple-wrapped spelling assessment-row.ts uses and the naive
// `Extract<...> extends never ? T : never` spelling were measured to behave
// IDENTICALLY at every call-site shape this file exercises; the tuple form
// is kept in assessment-row.ts as a defensive choice (it does not
// distribute over a union `T` in generic positions), not because the naive
// form was found to fail here.

import type { AssessmentRowCore, NoPostableIdentity } from "./assessment-row";

// --- The control: a clean row type. Must compile with no error. ----------

interface CleanAssessmentRow extends AssessmentRowCore {
  submissionText: string;
}

// Direct annotation: assigning a clean row to a NoPostableIdentity<...>-typed
// binding must succeed.
declare const cleanAnnotated: NoPostableIdentity<CleanAssessmentRow>;
void cleanAnnotated;

// Generic call-site shape: a function whose parameter is
// NoPostableIdentity<R> must accept a clean row with no error.
declare function acceptsNoPostableIdentity<R extends AssessmentRowCore>(row: NoPostableIdentity<R>): void;

declare const cleanForCall: CleanAssessmentRow;
acceptsNoPostableIdentity(cleanForCall);

// --- The dirty case: a row carrying a forbidden identity key. -------------

interface DirtyAssessmentRow extends AssessmentRowCore {
  submissionText: string;
  userId: number;
}

declare const dirtyRow: DirtyAssessmentRow;

// Direct annotation: assigning a dirty row to a NoPostableIdentity<...>-typed
// binding must fail - NoPostableIdentity<DirtyAssessmentRow> resolves to
// `never`, so no value is assignable to it.
// @ts-expect-error - DirtyAssessmentRow carries userId, a forbidden identity key
const dirtyAnnotated: NoPostableIdentity<DirtyAssessmentRow> = dirtyRow;
void dirtyAnnotated;

// Generic call-site: the same guard must fire when the dirty row is passed
// to a generic function whose parameter type is NoPostableIdentity<R> - this
// is the shape assessment-row.ts's real mutators (editAssessmentField,
// applyAssessmentResult) use, and the shape this wave's sabotage check
// exercises against GradingRow directly.
// @ts-expect-error - DirtyAssessmentRow carries userId, a forbidden identity key
acceptsNoPostableIdentity(dirtyRow);
