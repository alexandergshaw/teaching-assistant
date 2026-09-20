// Shared row core for the assessment-grading surfaces (grading-recording
// today; a second capture-based grading surface is a later wave). This is
// WAVE 1 of the assessment-grading extraction - the shared row core and the
// identity guard.
//
// Pure, DOM-free, React-free - the same discipline grading-rows.ts and
// grading-row.ts already run: this repo's vitest is node-env and renders no
// component, so every decision that needs a unit test has to live in a leaf
// like this one.
//
// THIS FILE MUST NEVER CARRY A POSTABLE STUDENT IDENTITY. grading-row.ts's
// own header (R0-2) explains why a name read off a captured image of a
// screen is not a student identity, and why `postCanvasGrades` requiring a
// non-optional `userId: number` makes any row shape that COULD carry one an
// eventual grade-write hazard, whether or not any caller happens to
// populate it today. `NoPostableIdentity` below turns that boundary into a
// compile error at every mutator's call site, rather than a convention a
// future caller has to remember - this repo has watched exactly that kind
// of convention fail six times this session.
//
// This is a MOVE of grading-rows.ts's editGradingRowField /
// applyGradingResultToRow / removeGradingRow / gradingClearTableSignature and
// grading-row.ts's joinFeedback, generalised over the row type. The
// BEHAVIOUR is lifted verbatim - a behaviour change here is a silent
// regression across a shipped feature that no component-rendering test
// could ever catch.

/**
 * A row shape that has been checked to carry none of the identity-shaped
 * keys below. Resolves to `T` when clean, `never` when `T` carries any of
 * them - so a caller passing a dirty row gets a type error at the call
 * site, not a runtime surprise.
 *
 * Kept as the tuple-wrapped spelling (`[Extract<...>] extends [never] ? ...`)
 * rather than the naive `Extract<keyof T, ForbiddenIdentityKeys> extends
 * never ? T : never` spelling. Both are MEASURED to behave identically at
 * the call-site position this file's own sabotage check exercises (adding
 * `userId: number` to `GradingRow` and calling a generic mutator with it).
 * The tuple form is kept anyway as a defensive choice, not because the
 * naive form fails here: wrapping in a one-element tuple prevents the
 * conditional from distributing over a union `T`, which matters in generic
 * positions this wave's own call sites do not happen to exercise but a
 * future caller's might.
 */
declare const NOT_POSTABLE: unique symbol;

type ForbiddenIdentityKeys =
  | "userId"
  | "user_id"
  | "canvasUserId"
  | "sisUserId"
  | "loginId"
  | "canvasSubmissionId"
  | "submissionId"
  | "enrollmentId"
  | "studentId";

export type NoPostableIdentity<T> = [Extract<keyof T, ForbiddenIdentityKeys>] extends [never] ? T : never;

/**
 * The four scored fields every assessment row carries, lifted verbatim from
 * grading-row.ts's own totalScore/strengths/improvements/overallComment.
 */
export interface AssessmentFeedback {
  totalScore: string;
  strengths: string;
  improvements: string;
  overallComment: string;
}

export type AssessmentFeedbackField = keyof AssessmentFeedback;

export type AssessmentRowState = "pending" | "grading" | "ready" | "failed";

/**
 * The row core shared by every assessment-grading surface. A per-surface
 * row (GradingRow today) EXTENDS this and adds its own fields (its own
 * match-confidence verdict, candidate list, submission text, course,
 * assessment, and submission-timing fields, etc.) - those fields carry
 * per-surface semantics (matching a read name against a class list,
 * submission provenance) that assessment-shared.structure.test.ts exists to
 * keep out of this file.
 */
export interface AssessmentRowCore extends AssessmentFeedback {
  id: string;
  /** A DISPLAY LABEL ONLY. Provenance (where the name was read from, and
   *  how confident the match is) is a per-surface concern - grading-row.ts's
   *  own per-surface fields are that concern for the grading-recording
   *  surface, and this field does not attempt to replace or generalise
   *  them. */
  studentName: string;
  state: AssessmentRowState;
  error: string;
  userEdited: boolean;
  readonly [NOT_POSTABLE]?: never;
}

/**
 * Originally lifted from grading-row.ts's joinFeedback (grading-row.ts:228),
 * joining strengths, improvements, overallComment by a blank line in that
 * order. Backlog A11 reordered it to strengths, overallComment, improvements:
 * strengths states what went well, overallComment names what was deducted and
 * why, and improvements is the coaching derived FROM those deductions - advice
 * that precedes its own justification reads backwards, and ending on
 * forward-looking advice reads better than ending on the list of deductions.
 * `totalScore` is deliberately excluded (it is a grade, not feedback - see
 * this file's own header on why a row here can never carry a postable
 * identity, the same reasoning that keeps a score out of a copied comment). A
 * field left blank is omitted entirely rather than leaving a bare blank line
 * in its place.
 */
export function joinAssessmentFeedback(row: AssessmentFeedback): string {
  return [row.strengths, row.overallComment, row.improvements].filter((field) => field.trim() !== "").join("\n\n");
}

/**
 * Lifted verbatim from grading-rows.ts's editGradingRowField
 * (grading-rows.ts:107). AC18-equivalent: an instructor typing into any
 * feedback field marks the row userEdited and promotes a pending/failed row
 * to ready, clearing any stale error - typing a score or comment by hand is
 * itself a way of "having" feedback, even before any grading pass has run
 * for this row.
 *
 * Backlog A11 Ruling Q: some row shapes carry a companion field named
 * `${field}Notice` (a per-field durable notice explaining why that field
 * came back empty from a machine result). A notice that survives the edit
 * it asked for is worse than no notice, so once the paired field is filled
 * in with a non-blank value, its companion notice - if the row shape
 * carries one at all - is cleared to "" in the same write. This is a
 * runtime, convention-based check (`${field}Notice" in source`) rather than
 * a typed field on `AssessmentRowCore`, so it is a no-op on any row shape
 * that never declares such a companion field, and this function stays
 * generic over every row shape that extends the core.
 */
export function editAssessmentField<R extends AssessmentRowCore>(
  row: NoPostableIdentity<R>,
  field: AssessmentFeedbackField,
  value: string
): NoPostableIdentity<R> {
  const source = row as R;
  const nextState: AssessmentRowState =
    source.state === "pending" || source.state === "failed" ? "ready" : source.state;
  const next: Record<string, unknown> = {
    ...source,
    [field]: value,
    userEdited: true,
    state: nextState,
    error: "",
  };
  const noticeKey = `${field}Notice`;
  if (value.trim() !== "" && noticeKey in source) {
    next[noticeKey] = "";
  }
  return next as unknown as NoPostableIdentity<R>;
}

export interface AssessmentResultInput extends AssessmentFeedback {
  state: AssessmentRowState;
  error?: string;
}

/**
 * Lifted verbatim from grading-rows.ts's applyGradingResultToRow
 * (grading-rows.ts:140). AC44-equivalent: a row the instructor has edited
 * refuses to have its four scored fields overwritten by a machine result,
 * full stop. `state`/`error` are NOT gated by `userEdited`: even an edited
 * row should still show a fresh "failed"/"ready" transition and a fresh
 * error message from a grading attempt, since those describe the ATTEMPT,
 * not the instructor's own words. Only the four scored fields
 * (totalScore/strengths/improvements/overallComment) are held back.
 */
export function applyAssessmentResult<R extends AssessmentRowCore>(
  row: NoPostableIdentity<R>,
  result: AssessmentResultInput
): NoPostableIdentity<R> {
  const source = row as R;
  if (source.userEdited) {
    return { ...source, state: result.state, error: result.error ?? "" } as unknown as NoPostableIdentity<R>;
  }
  return {
    ...source,
    totalScore: result.totalScore,
    strengths: result.strengths,
    improvements: result.improvements,
    overallComment: result.overallComment,
    state: result.state,
    error: result.error ?? "",
  } as unknown as NoPostableIdentity<R>;
}

/**
 * Lifted verbatim from grading-rows.ts's removeGradingRow
 * (grading-rows.ts:271). A no-op (returns the same array reference) when
 * the id is not present.
 */
export function removeAssessmentRow<R extends AssessmentRowCore>(rows: ReadonlyArray<R>, id: string): R[] {
  if (!rows.some((r) => r.id === id)) return rows as R[];
  return rows.filter((r) => r.id !== id);
}

/**
 * Lifted verbatim from grading-rows.ts's gradingClearTableSignature
 * (grading-rows.ts:288). The "Clear table" confirm-arm signature, built
 * from the total row count alone.
 */
export function clearTableSignature(totalCount: number): string {
  return String(totalCount);
}
