// Grading from a screen recording - reconciles this session's accumulator of
// TrackedSubmission entries (grading-submission-merge.ts's
// mergeExtractedSubmissions, parameterised here via TrackedSubmission's own
// factory) with the live GradingRow[] table (docs/grading-via-recording-
// acceptance-criteria.md item 4: "capture -> extraction action ->
// mergeExtractedSubmissions -> rows via useGradingRows's setAllRows -> roster
// match via applyRosterMatch").
//
// ID CORRELATION, NOT POSITIONAL. This file used to correlate the accumulator
// and the row table BY INDEX, on the stated (and, once an instructor could
// remove a row, FALSE) invariant that the two arrays always advance in
// lockstep. Deleting a row broke that invariant silently: the next extraction
// batch re-minted the deleted student's row at the newly shifted index, and
// every row after the deletion point paired with the WRONG tracked entry,
// silently inheriting that entry's score, feedback and userEdited flag. See
// docs/REGRESSION.md entry 428 (defects 1, 2 and 3) for the baseline this
// replaces, and docs/BACKLOG.md's A9 entry for the bug report.
//
// Every TrackedSubmission (below) now carries the id of the GradingRow it
// owns, so a row's scored and edited fields can only ever move with that
// row's own id - misattribution is unrepresentable. advanceGradingCapture is
// the one function that reconciles the two arrays; it is pure and carries no
// persistence or dismissal concern of its own (a later wave's job - see
// docs/BACKLOG.md's A9 entry). Nothing here infers instructor intent from a
// row being absent: a tracked entry whose row cannot be found is a
// DIVERGENCE (a stale caller, a reload with no seed yet, a course switch),
// never evidence of a deletion, so it is reported via `divergentRowIds` and
// given a fresh, visible, correctable row instead of being silently
// suppressed. The only way an entry is ever excluded from the output is
// `dismissed`, and nothing in this file ever sets it - that is a later
// wave's job too, driven by an explicit instructor action, never inferred
// here.
//
// This file mints a GradingRow's id (grading-row.ts's own header: "the
// table/row layer owns turning a merged submission into a GradingRow" - this
// is that layer, kept out of grading-row.ts/grading-rows.ts/useGradingRows.ts
// themselves per this task's file-lane split). An EXISTING row's id, state,
// score, feedback and userEdited flag are always carried forward untouched -
// a later frame reading more of the same submission must never reset
// grading progress or discard an instructor's hand-typed feedback. Only the
// read fields (studentName/submissionText) are refreshed here.
//
// ROSTER MATCHING IS DELIBERATELY NOT DONE HERE: item 4's own seam order
// puts it AFTER setAllRows, through useGradingRows's `applyRosterMatch` -
// GradingRecordingPanel.tsx calls matchNameAgainstRoster and applyRosterMatch
// itself, once for every row this function returns, right after setAllRows.
// A new row below is minted with the neutral "no-roster"/[] default (never a
// guess) so it renders correctly for the one tick before that follow-up
// pass runs.

import type { GradingRow } from "./grading-row";
import { mergeExtractedSubmissions, type ExtractedSubmission } from "./grading-submission-merge";

/**
 * An ExtractedSubmission plus the GradingRow it owns and whether the
 * instructor dismissed it. `rowId` and `dismissed` are SEPARATE fields, not
 * a nullable id: a dismissed entry must keep its row's id so
 * advanceGradingCapture's preservation step can refuse to re-append that
 * row from a stale `rows` array - a nullable rowId cannot express "this
 * entry owns a row AND is dismissed" at the same time, which a later wave's
 * dismissal path needs.
 */
export interface TrackedSubmission extends ExtractedSubmission {
  rowId: string;
  dismissed: boolean;
}

function blankGradingRow(id: string, sub: ExtractedSubmission): GradingRow {
  return {
    id,
    studentName: sub.name,
    nameMatch: "no-roster",
    rosterCandidates: [],
    submissionText: sub.text,
    state: "pending",
    totalScore: "",
    strengths: "",
    improvements: "",
    overallComment: "",
    error: "",
    userEdited: false,
    // A16-2 hop H9: rubricAreas is required on GradingRow - a brand-new row
    // has never been graded yet, so it starts with none.
    rubricAreas: [],
    // docs/a8r-scope.md (A8-R) TR-1: a brand-new row's suggestion comes
    // straight off the entry that minted it (whatever the extraction model
    // said); `submissionKind` (the CONFIRMED value) always starts at
    // "unknown" - no machine path ever writes anything else to it.
    suggestedSubmissionKind: sub.suggestedSubmissionKind,
    submissionKindCue: sub.submissionKindCue,
    submissionKind: "unknown",
  };
}

export interface AdvanceResult {
  rows: GradingRow[];
  tracked: TrackedSubmission[];
  addedCount: number;
  mergedCount: number;
  /** Entries whose row was missing without a dismissal - a divergence, not
   *  an intent. Each got a FRESH row. Non-empty means rows and tracked
   *  drifted; the caller logs it. Never used to suppress anything. */
  divergentRowIds: string[];
}

/**
 * Reconciles `tracked` (this accumulator's own memory of every submission
 * read so far this session, each entry id-correlated to the row it owns)
 * against `incoming` (a fresh extraction batch) and `rows` (the CURRENT row
 * table), producing the next `rows` and the next `tracked`.
 *
 * `mintId` is injected (the production caller passes `() =>
 * crypto.randomUUID()`) purely so this stays unit-testable with frozen,
 * predictable ids.
 *
 * Exactly four branches per merged entry, evaluated in this order:
 *  1. `dismissed` - emit no row; carry the entry forward unchanged. This is
 *     what keeps its text absorbing later continuations even though it no
 *     longer has a visible row. (Nothing in THIS file ever sets `dismissed`
 *     - a later wave's explicit dismissal action is the only thing that
 *     will, so this branch is unreachable from any caller in this wave, but
 *     the mechanism must already refuse to resurrect a dismissed entry's
 *     row from a stale `rows` array once that action exists.)
 *  2. its `rowId` matches a row in `rows` - refresh that row's read fields
 *     (studentName/submissionText) and carry everything else on the row
 *     (id, state, error, userEdited, the four scored fields, nameMatch,
 *     rosterCandidates, course, assessment, submissionTimeStatus,
 *     submittedAt) forward untouched.
 *  3. its `rowId` was freshly minted THIS call (a brand-new submission,
 *     never seen before) - emit a blank row for it.
 *  4. otherwise - a DIVERGENCE: the entry's row is missing and this call
 *     did not just create it. Never treated as an instructor deletion (that
 *     would need `dismissed`, which nothing here infers from a row's mere
 *     absence). Emit a fresh, visible, correctable row under a newly minted
 *     id, carry the entry forward under that new id, and report the old id
 *     in `divergentRowIds`.
 *
 * Any row in `rows` that no entry consumed above, and whose id is not the
 * `rowId` of a dismissed entry, is preserved untouched, in its original
 * relative order, appended after every row emitted above.
 */
export function advanceGradingCapture(
  tracked: ReadonlyArray<TrackedSubmission>,
  rows: ReadonlyArray<GradingRow>,
  incoming: ReadonlyArray<ExtractedSubmission>,
  mintId: () => string
): AdvanceResult {
  const minted = new Set<string>();
  const makeEntry = (sub: ExtractedSubmission): TrackedSubmission => {
    const rowId = mintId();
    minted.add(rowId);
    return {
      name: sub.name,
      text: sub.text,
      // docs/a8r-scope.md (A8-R) TR-4: the entry starts carrying the
      // suggestion/cue the extraction batch actually minted alongside this
      // reading - never re-derived here.
      suggestedSubmissionKind: sub.suggestedSubmissionKind,
      submissionKindCue: sub.submissionKindCue,
      rowId,
      dismissed: false,
    };
  };
  const merged = mergeExtractedSubmissions(tracked, incoming, makeEntry);

  const byId = new Map(rows.map((r) => [r.id, r]));
  const consumed = new Set<string>();
  const dismissedRowIds = new Set(merged.submissions.filter((e) => e.dismissed).map((e) => e.rowId));
  const divergentRowIds: string[] = [];
  const nextTracked: TrackedSubmission[] = [];
  const emitted: GradingRow[] = [];

  for (const entry of merged.submissions) {
    if (entry.dismissed) {
      nextTracked.push(entry);
      continue;
    }

    const existingRow = byId.get(entry.rowId);
    if (existingRow) {
      consumed.add(entry.rowId);
      emitted.push({ ...existingRow, studentName: entry.name, submissionText: entry.text });
      nextTracked.push(entry);
      continue;
    }

    if (minted.has(entry.rowId)) {
      emitted.push(blankGradingRow(entry.rowId, entry));
      nextTracked.push(entry);
      continue;
    }

    const freshId = mintId();
    divergentRowIds.push(entry.rowId);
    emitted.push(blankGradingRow(freshId, entry));
    nextTracked.push({ ...entry, rowId: freshId });
  }

  const preserved = rows.filter((r) => !consumed.has(r.id) && !dismissedRowIds.has(r.id));

  return {
    rows: [...emitted, ...preserved],
    tracked: nextTracked,
    addedCount: merged.addedCount,
    mergedCount: merged.mergedCount,
    divergentRowIds,
  };
}
