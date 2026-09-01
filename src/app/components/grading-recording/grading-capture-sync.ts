// Grading from a screen recording - reconciles a freshly-merged
// ExtractedSubmission[] (grading-submission-merge.ts's mergeExtractedSubmissions)
// with the live GradingRow[] table (docs/grading-via-recording-acceptance-
// criteria.md item 4: "capture -> extraction action -> mergeExtractedSubmissions
// -> rows via useGradingRows's setAllRows -> roster match via
// applyRosterMatch").
//
// POSITIONAL ALIGNMENT INVARIANT: mergeExtractedSubmissions's own header
// states it "never reorders" `existing` - it either updates an entry in
// place at its current index (a fuller reading of the same submission) or
// appends a new one at the end. So as long as this file's caller always
// feeds the FULL, previously-merged ExtractedSubmission[] back in as
// `existing` on the next merge, index i of the merged array is ALWAYS either
// the same submission as index i of the previous merge (an update) or brand
// new (an append past the previous length). That is the only correlation
// this file needs: it never has to invent or track its own row/submission
// identity - `rows[i]` IS the row for `extracted[i]` whenever `i <
// rows.length`, and anything past that is a submission this table has never
// seen.
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
import type { ExtractedSubmission } from "./grading-submission-merge";

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
  };
}

/**
 * Builds the next GradingRow[] from a freshly-merged ExtractedSubmission[]
 * and the CURRENT rows (see this file's header for the positional-alignment
 * invariant this relies on).
 *
 * `mintId` is injected (defaults to crypto.randomUUID) purely so this stays
 * unit-testable with frozen, predictable ids - the production caller never
 * needs to pass it.
 */
export function syncGradingRowsFromExtracted(
  extracted: ReadonlyArray<ExtractedSubmission>,
  rows: ReadonlyArray<GradingRow>,
  mintId: () => string = () => crypto.randomUUID()
): GradingRow[] {
  return extracted.map((sub, i) => {
    const existing = rows[i];
    if (existing) {
      return {
        ...existing,
        studentName: sub.name,
        submissionText: sub.text,
      };
    }
    return blankGradingRow(mintId(), sub);
  });
}
