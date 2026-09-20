// Grading from a screen recording - the table-view leaf: sort, filter, and
// the userEdited overwrite guard for a GradingRow[] array.
//
// docs/grading-via-recording-acceptance-criteria.md R4/R4a (reuse the
// generic table machinery - it was written for this) and item 5 of this
// group's own brief (a row the instructor has edited must never be
// silently overwritten by a re-grade).
//
// Pure, React-free, DOM-free - the same discipline as discussion-table-
// view.ts's own header: vitest in this repo is node-env and renders
// nothing, so every decision that needs a unit test has to live in a leaf
// like this one rather than in useGradingRows.ts or a component.
//
// R4b: this file does NOT reimplement discussion-table-view.ts's
// filterRowsByQuery/compareNameKey - it imports and calls them. That file's
// own header says both were made generic specifically because this table
// (grading-by-recording) was already known to need them; writing a second
// filter or comparator here would recreate the "tested copy is not the one
// production calls" defect (docs/REGRESSION.md, "four instances in two
// features").

import { compareNameKey, filterRowsByQuery } from "../recording/discussion-table-view";
import { GRADING_ROW_HAYSTACK, type GradingRow } from "./grading-row";
import {
  editAssessmentField,
  applyAssessmentResult,
  removeAssessmentRow,
  clearTableSignature,
  type AssessmentFeedbackField,
  type AssessmentResultInput,
} from "../assessment-shared/assessment-row";
import type { RubricAreaResult } from "@/lib/grade/types";

// ---------------------------------------------------------------------------
// Sorting - "sortable by name" is the only sort this table needs (the AC's
// own words: "the table produced by the recording grader should also be
// filterable on the column that holds the name of the original poster").
// GradingRow (grading-row.ts, not owned by this file) carries no
// capture-order timestamp the way ReplyRow's firstSeenAt does, so there is
// no "captured" sort mode to offer here the way discussion-table-view.ts's
// sortReplyRowsForTable has - only name-asc/name-desc.
// ---------------------------------------------------------------------------

export type GradingSort = "name-asc" | "name-desc";

export const DEFAULT_GRADING_SORT: GradingSort = "name-asc";

const VALID_GRADING_SORTS: ReadonlyArray<GradingSort> = ["name-asc", "name-desc"];

/** Coercion for a persisted sort value - mirrors useReplyRows.ts's
 *  isReplySort discipline (coercion-changes-set-membership: a shrunk valid
 *  set silently reverts a returning user's saved sort to the default with
 *  no error, so this checks against the full VALID_GRADING_SORTS list
 *  rather than any narrower inline condition). */
export function isGradingSort(value: unknown): value is GradingSort {
  return typeof value === "string" && (VALID_GRADING_SORTS as readonly string[]).includes(value);
}

/**
 * Delegates to discussion-table-view.ts's own generic compareNameKey for
 * the actual comparison (blank-sorts-last in both directions, case-
 * insensitive) - see that function's own doc comment.
 *
 * Relies on Array.prototype.sort's ES2019 stability guarantee for ties:
 * unlike sortReplyRowsForTable (which tie-breaks on firstSeenAt because
 * ReplyRow has one), GradingRow has no capture-order field to tie-break on,
 * so two rows with equal name keys simply keep their existing relative
 * order - which a stable sort already gives for free, and which stays
 * stable across re-renders as long as the caller does not otherwise reorder
 * `rawRows` between them.
 */
export function sortGradingRowsForTable(rows: ReadonlyArray<GradingRow>, sort: GradingSort): GradingRow[] {
  const direction: "asc" | "desc" = sort === "name-asc" ? "asc" : "desc";
  return rows.slice().sort((a, b) => compareNameKey(a.studentName, b.studentName, direction));
}

// ---------------------------------------------------------------------------
// Filtering - R4a: the ONE call site for filtering a GradingRow[]. The
// haystack itself (student name + submission text, NOT feedback) is pinned
// in grading-row.ts as GRADING_ROW_HAYSTACK and is NOT redefined here - see
// that constant's own doc comment for the full R4a reasoning, and
// grading-rows.test.ts for the exact-tuple pin test.
// ---------------------------------------------------------------------------

export function filterGradingRowsForTable(rows: ReadonlyArray<GradingRow>, query: string): GradingRow[] {
  return filterRowsByQuery(rows, query, GRADING_ROW_HAYSTACK);
}

/** Name / Name match / State / Score / Actions - the header bar's cell
 *  count. The continuation row (submission text plus the editable feedback
 *  fields) spans this many columns. Kept as a constant, same discipline as
 *  DISCUSSION_TABLE_COLUMN_COUNT (recording/DiscussionReplyRow.tsx), so the
 *  header cell count and the continuation row's colSpan can never drift
 *  apart. Bumped from 4 to 5 for the per-row Remove control ("no row can be
 *  removed" fix) - mirrors DISCUSSION_TABLE_COLUMN_COUNT's own Actions
 *  column exactly. */
export const GRADING_TABLE_COLUMN_COUNT = 5;

// ---------------------------------------------------------------------------
// Item 5 / R0-2: a row the instructor has edited must never be silently
// overwritten by a re-grade. grading-row.ts's `userEdited` exists for
// exactly this and "mirrors the reply table's own AC18/AC44 rule" (that
// file's own doc comment) - useReplyRows.ts's editReply/applyReply is the
// precedent these two functions mirror.
// ---------------------------------------------------------------------------

/** A type alias of the shared core's AssessmentFeedbackField - kept as its
 *  own named export so every existing import of `GradingFeedbackField`
 *  keeps compiling unchanged (WAVE 1's "no consumer churn" rule). */
export type GradingFeedbackField = AssessmentFeedbackField;

/**
 * AC18-equivalent: an instructor typing into any feedback field marks the
 * row userEdited and, exactly like editReply, promotes a pending/failed row
 * to ready and clears any stale error - typing a score or comment by hand
 * is itself a way of "having" feedback, even before any grading pass has
 * run for this row.
 *
 * WAVE 1 of the snapshot-grading extraction: a thin wrapper over the shared
 * core's editAssessmentField (assessment-shared/assessment-row.ts) - the
 * behaviour lives there now, verbatim, so both this table and a future
 * snapshot-grading table share exactly one implementation rather than two
 * that can drift apart.
 */
export function editGradingRowField(row: GradingRow, field: GradingFeedbackField, value: string): GradingRow {
  return editAssessmentField(row, field, value);
}

/**
 * docs/a16-scope.md A16-2, hop H7: a LOCAL EXTENSION of the shared core's
 * AssessmentResultInput, not a bare alias any more. The shared core's own
 * applyAssessmentResult (assessment-shared/assessment-row.ts) enumerates its
 * six fields by hand rather than spreading, so a widened result type is
 * silently DROPPED there - `rubricAreas` cannot round-trip through that
 * function. This surface's own applyGradingResultToRow below routes around
 * that by delegating to applyAssessmentResult for the six shared fields and
 * then setting `rubricAreas` itself, so the widening lives here, once,
 * rather than editing the shared core (out of scope - see docs/a16-scope.md
 * section 4.5's own "what A16-2 deliberately does NOT do").
 */
export interface GradingResultInput extends AssessmentResultInput {
  rubricAreas: RubricAreaResult[];
}

/**
 * AC44-equivalent, in its simplest form. This wave builds no grading
 * dispatch pipeline (R0/R5 of the AC - that is a sibling EXTRACTION wave's
 * job), so there is no in-flight-request race to guard with an editSeq
 * generation counter the way useReplyRows.ts's applyReply/isUnchangedSince
 * do for the reply table. What this function builds instead is the
 * correctness RULE itself: a row the instructor has edited refuses to have
 * its four scored fields overwritten by a machine result, full stop. The
 * future grading action is expected to call this (or reimplement its exact
 * refusal) rather than writing scored fields onto `rows` directly - see
 * this module's own header for why that caller does not exist in this
 * wave.
 *
 * `state`/`error` are NOT gated by `userEdited`: even an edited row should
 * still show a fresh "failed"/"ready" transition and a fresh error message
 * from a grading attempt, since those describe the ATTEMPT, not the
 * instructor's own words. Only the four scored fields
 * (totalScore/strengths/improvements/overallComment) are held back.
 *
 * WAVE 1 of the snapshot-grading extraction: delegates to the shared core's
 * applyAssessmentResult (assessment-shared/assessment-row.ts) for the six
 * fields that function knows about, then sets `rubricAreas` itself (A16-2,
 * hop H7 - this is the drop hop the repo has now paid for twice: the shared
 * core enumerates its own return by hand and would otherwise silently drop
 * any field it does not name). `rubricAreas` is written UNCONDITIONALLY,
 * never gated by `userEdited` (hop H8) - it is a machine verdict about the
 * submission, not instructor-authored text, the same reasoning
 * applyAssessmentResult's own doc comment already gives for why `state`/
 * `error` are not gated either.
 */
export function applyGradingResultToRow(row: GradingRow, result: GradingResultInput): GradingRow {
  const applied = applyAssessmentResult(row, result);
  return { ...applied, rubricAreas: result.rubricAreas };
}

/** Merges a roster-match verdict (grading-roster-match.ts's
 *  matchNameAgainstRoster) onto a row. Not gated by userEdited: nameMatch/
 *  rosterCandidates are never instructor-editable fields on this table (the
 *  instructor edits feedback text, not the roster verdict), so there is
 *  nothing here for an edit to protect. */
export function applyRosterMatchToRow(
  row: GradingRow,
  match: { nameMatch: GradingRow["nameMatch"]; rosterCandidates: readonly string[] }
): GradingRow {
  return { ...row, nameMatch: match.nameMatch, rosterCandidates: match.rosterCandidates };
}

// ---------------------------------------------------------------------------
// BLOCKER 3 - a grading failure must never render as a green "Ready" row
// whose student-facing comment IS the error text. grading-row.ts already
// defines a "failed" state and an `error` field for exactly this - both were
// dead code because GradingRecordingPanel.tsx applied every result as
// "ready" unconditionally.
//
// FIX 2 (this pass) - BLOCKER 3's original fix classified a failure by
// testing whether `strengths` STARTS WITH GRADING_FAILURE_PREFIX's literal
// sentence, because at the time gradeCapturedSubmissionsAction
// (src/app/actions/grading-submission-grade.ts) carried no separate
// discriminator field and grading-submission-grade.test.ts's own exact-
// key-set assertion pinned the result row to exactly five fields with none
// of them a state/flag. The agent that wrote it flagged this honestly as
// prefix-matching on prose, not a real signal - fragile in the direction
// that matters: real, authored feedback that happens to OPEN with that exact
// sentence would misclassify as a failure, and a real failure whose message
// is later reworded (so it no longer starts with the pinned prefix) would
// misclassify as a success and render its error text as the student-facing
// comment.
//
// That key-set pin has now been deliberately widened (with the test's own
// comment explaining why) to include `failed: boolean` - GradingRecordingFeedback
// (grading-feedback-prompt.ts) sets it at the ONE place that already knows
// for certain which composer ran (composeGradingRowResult: false;
// composeFailedGradingRow: true), so classifyGradingResult below now
// branches on that real boolean instead of guessing from prose. The prefix
// string itself (GRADING_FAILURE_PREFIX) is kept, but demoted to a pure
// message-formatting convenience - stripped off `strengths` to produce a
// clean `error` message ONLY once `failed` has already confirmed this really
// is a failure - so a rewording of the prefix in the future can, at worst,
// leave the prefix un-stripped from a cosmetic error string; it can no
// longer misclassify a row's state either way. See grading-submission-
// grade.test.ts's own key-set assertion for the production shape this
// mirrors.
// ---------------------------------------------------------------------------

/** The exact prefix composeFailedGradingRow (grading-feedback-prompt.ts) and
 *  the ungraded factory in src/lib/grade/engine.ts both use to open a
 *  per-item grading failure's `strengths` field. No longer the
 *  CLASSIFICATION signal (see this section's own header above for FIX 2) -
 *  kept only so classifyGradingResult can strip it off a known-failed row's
 *  `strengths` to produce a clean `error` message.
 *
 * N13a: the literal now lives in src/lib/grade/types.ts (a leaf
 * src/lib/grade/engine.ts can import without reaching into a component
 * directory). Imported and re-exported here - rather than declared locally -
 * so there is exactly one copy of the literal, and existing importers of
 * THIS module (grading-rows.test.ts) are unaffected. */
import { GRADING_FAILURE_PREFIX } from "@/lib/grade/types";
export { GRADING_FAILURE_PREFIX };

/** gradeCapturedSubmissionsAction's own per-result shape (minus `id`) -
 *  declared locally rather than imported, since that action's own types live
 *  in a file outside this task's ownership and this is the only shape this
 *  function needs from it. `failed` (FIX 2) is the real discriminator - see
 *  this section's own header. */
export interface GradingRecordingResult {
  totalScore: string;
  strengths: string;
  improvements: string;
  overallComment: string;
  failed: boolean;
  /** docs/a16-scope.md A16-2, hop H5: this is a HAND-COPIED duplicate of
   *  gradeCapturedSubmissionsAction's own result shape (this file's own
   *  header, above), so this field has to be added here too, or `tsc`
   *  accepts the extra property arriving on the argument structurally and
   *  silently drops it - the most likely hop in the whole chain to be
   *  missed for exactly that reason. */
  rubricAreas: RubricAreaResult[];
}

/**
 * Turns one gradeCapturedSubmissionsAction result into applyGradingResultToRow's
 * own GradingResultInput. Classification (FIX 2) is now the real `failed`
 * boolean, never prose-sniffing: `failed: true` maps to state "failed" with
 * every feedback field blanked - the raw failure text must never land in a
 * feedback field, which is Blocker 3's whole point - and the verbatim
 * message (GRADING_FAILURE_PREFIX stripped, when present) in `error`.
 * `failed: false` maps to state "ready" with the four fields passed through
 * unchanged, regardless of what `strengths` happens to start with.
 */
export function classifyGradingResult(result: GradingRecordingResult): GradingResultInput {
  if (result.failed) {
    const error = result.strengths.startsWith(GRADING_FAILURE_PREFIX)
      ? result.strengths.slice(GRADING_FAILURE_PREFIX.length)
      : result.strengths;
    return {
      totalScore: "",
      strengths: "",
      improvements: "",
      overallComment: "",
      state: "failed",
      error,
      // A16-2 hop H6: a failure never carries any rubric area, whatever the
      // action happened to send through - the raw failure text is not a
      // score.
      rubricAreas: [],
    };
  }
  return {
    totalScore: result.totalScore,
    strengths: result.strengths,
    improvements: result.improvements,
    overallComment: result.overallComment,
    state: "ready",
    // A16-2 hop H6: an ordinary success passes its areas straight through.
    rubricAreas: result.rubricAreas,
  };
}

// ---------------------------------------------------------------------------
// "no row can be removed" - per-row remove and whole-table clear. Pure
// leaves, mirroring editGradingRowField/applyGradingResultToRow/
// applyRosterMatchToRow above: useGradingRows.ts wraps these rather than
// inlining the filter/reset, matching this file's own established "every row
// mutator is a pure, separately-testable function" discipline (this repo's
// vitest is node-env and renders no component, so a decision inlined into
// the hook has no test surface at all).
// ---------------------------------------------------------------------------

/** Removes one row by id. A no-op (returns the same array reference) when
 *  the id is not present, mirroring editGradingRowField/applyGradingResultToRow's
 *  own "row is gone" no-op discipline at their call sites in useGradingRows.ts.
 *
 *  WAVE 1 of the snapshot-grading extraction: a thin wrapper over the shared
 *  core's removeAssessmentRow (assessment-shared/assessment-row.ts) - see
 *  editGradingRowField's own identical note above. */
export function removeGradingRow(rows: ReadonlyArray<GradingRow>, id: string): GradingRow[] {
  return removeAssessmentRow(rows, id);
}

/**
 * The "Clear table" confirm-arm signature, mirroring DiscussionRepliesPanel.tsx's
 * own deleteSignature (AC19/AC19a - signature-based arming, no timer:
 * isConfirmArmed, content-tab/modules/confirmArming.ts, compares the
 * armed-for signature against the CURRENT one, so a row landing or leaving
 * mid-session automatically disarms a stale confirmation rather than needing
 * a useEffect to remember to reset it - see confirmArming.ts's own header for
 * the exact defect, REGRESSION entry 258, a timer would reproduce). Built
 * from totalCount alone - unlike the reply table's own deleteSignature, this
 * table carries no separate "with a saved recording" wrinkle to fold in
 * (GradingRow has no equivalent of a saved capture video).
 *
 * WAVE 1 of the snapshot-grading extraction: a thin wrapper over the shared
 * core's clearTableSignature (assessment-shared/assessment-row.ts) - see
 * editGradingRowField's own identical note above.
 */
export function gradingClearTableSignature(totalCount: number): string {
  return clearTableSignature(totalCount);
}
