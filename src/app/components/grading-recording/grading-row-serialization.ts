// Grading from a screen recording - the persisted row shape's serialization
// leaf: a version constant, serializeGradingRows /
// serializeGradingRowsWithoutSubmissionText (write), and
// deserializeGradingRows (read).
//
// THE GAP this closes: useGradingRows.ts persisted only `filterText` and
// `sort` - the rows themselves (an instructor's captured submissions, roster
// verdicts, and any feedback they had already edited by hand) did not
// survive a reload. discussion-serialization.ts is the shipped precedent for
// this exact problem on the reply table (`ta-rec-disc-table`) and this file
// follows its discipline deliberately: a version constant from the start,
// `deserializeGradingRows` NEVER throws (mirrors `deserializeReplyTable`'s
// try/catch-everything shape), an absent optional-in-spirit value stays
// whatever its safe default is rather than resurrecting a guess, and
// anything read off storage that falls outside a known set of literal values
// is coerced to a safe member of that set rather than trusted as-is.
//
// Split out as its OWN leaf (not folded into grading-rows.ts, which owns
// sort/filter/mutator logic, not wire format) for the same reason
// discussion-serialization.ts named for its own move: these functions touch
// every field of GradingRow, so they belong beside the type that defines
// those fields' invariants, not duplicated as a structural copy elsewhere.
// grading-row.ts itself is NOT edited by this file or its test - the type
// already carries everything needed.
//
// R0-2 (grading-row.ts's own header): GradingRow carries no student id and
// never will - "posting one is a COMPILE ERROR, not a discipline." This file
// honours that the same way: every function below builds its output by
// EXPLICITLY enumerating GradingRow's twelve known fields, never by
// spreading `...row` into the write path. A runtime value typed as
// `GradingRow` that somehow carried an extra property (TypeScript's
// structural typing does not forbid this at the object-literal call sites
// that build one) still could not leak that property into localStorage
// through this file - the boundary is structural here too, not just typed.
// These rows are never written to `grading_drafts` either; this file only
// ever touches `window.localStorage` (from the hook that calls it, not from
// here - this leaf itself has no DOM/React import at all).
//
// Pure and DOM-free - no React, no hooks, no `window`, no `document`. The
// hook (useGradingRows.ts) is the only caller and is the only place that
// touches `window.localStorage`, exactly like discussion-serialization.ts /
// useReplyRows.ts's own division of labour.

import type { GradingRow, GradingRowNameMatch, GradingRowState } from "./grading-row";

export const GRADING_TABLE_VERSION = 1;

const VALID_STATES = new Set<string>(["pending", "grading", "ready", "failed"]);
const VALID_NAME_MATCHES = new Set<string>(["matched", "ambiguous", "unmatched", "no-roster"]);

// ---------------------------------------------------------------------------
// Write side.
// ---------------------------------------------------------------------------

/**
 * Builds the exact plain object that gets JSON.stringify'd for one row -
 * used by both serializeGradingRows and serializeGradingRowsWithoutSubmission
 * Text so the two can never drift into two different field lists. See this
 * file's header for why this enumerates fields explicitly rather than
 * spreading `...row`.
 *
 * `state`: nothing is ever "in flight" immediately after a reload, so a
 * "grading" row is written as "pending" - mirrors deserializeReplyTable's
 * identical treatment of a "drafting" row.
 *
 * `error`: GradingRow's `error` is a non-nullable `string` (unlike ReplyRow's
 * `string | null`), so the equivalent of discussion-serialization.ts's BL4
 * rule ("error is set only when state === 'failed'") clears a stale error to
 * "" rather than to null - enforced on WRITE so a row that was later
 * re-graded successfully never resurrects a stale failure message after a
 * reload, the same invariant BL4 names for the reply table.
 *
 * `dropSubmissionText`: the quota-fallback lever (see useGradingRows.ts's
 * own persistTableNow). GradingRow's `submissionText` is by far the largest
 * field a real class's worth of rows carries - the AC's own point that this
 * WILL hit quota on a real class - and it is also the one field an
 * instructor can recover simply by re-running the capture, whereas
 * `totalScore`/`strengths`/`improvements`/`overallComment` and `userEdited`
 * are the instructor's own graded judgment and, once edited by hand, cannot
 * be regenerated at all. So when storage is full, submissionText is what
 * gets dropped FIRST, and every feedback field (plus userEdited) is always
 * kept - never the other way around.
 */
function buildWireRow(row: GradingRow, dropSubmissionText: boolean) {
  const state: GradingRowState = row.state === "grading" ? "pending" : row.state;
  return {
    id: row.id,
    studentName: row.studentName,
    nameMatch: row.nameMatch,
    rosterCandidates: row.rosterCandidates,
    submissionText: dropSubmissionText ? "" : row.submissionText,
    state,
    totalScore: row.totalScore,
    strengths: row.strengths,
    improvements: row.improvements,
    overallComment: row.overallComment,
    error: state === "failed" ? row.error : "",
    userEdited: row.userEdited,
  };
}

function serialize(rows: ReadonlyArray<GradingRow>, dropSubmissionText: boolean): string {
  const wireRows = rows.map((r) => buildWireRow(r, dropSubmissionText));
  return JSON.stringify({ v: GRADING_TABLE_VERSION, rows: wireRows });
}

/** The normal write path - every field, including submissionText. */
export function serializeGradingRows(rows: ReadonlyArray<GradingRow>): string {
  return serialize(rows, false);
}

/**
 * The quota-fallback write path: every field EXCEPT submissionText, which is
 * forced to "". Never drops totalScore/strengths/improvements/
 * overallComment/userEdited - see buildWireRow's own doc comment for why
 * submissionText is what gets dropped first. The caller (useGradingRows.ts)
 * is expected to try serializeGradingRows first and fall back to this only
 * when that write throws.
 */
export function serializeGradingRowsWithoutSubmissionText(rows: ReadonlyArray<GradingRow>): string {
  return serialize(rows, true);
}

// ---------------------------------------------------------------------------
// Read side. NEVER throws - mirrors deserializeReplyTable's discipline
// exactly: a top-level try/catch, defensive typeof/Array.isArray guards
// before touching anything, and a row that cannot be recovered (no usable
// id) is dropped individually rather than failing the whole load.
// ---------------------------------------------------------------------------

export function deserializeGradingRows(raw: string | null): GradingRow[] {
  try {
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const obj = parsed as Record<string, unknown>;
    // A version mismatch (including a hypothetical FUTURE or OLDER version
    // this code does not know how to read) degrades to an empty table rather
    // than guessing at a shape it was never told about - mirrors
    // deserializeReplyTable's identical `obj.v !== DISCUSSION_TABLE_VERSION`
    // check.
    if (obj.v !== GRADING_TABLE_VERSION) return [];
    if (!Array.isArray(obj.rows)) return [];

    const rows: GradingRow[] = [];
    obj.rows.forEach((rawRow: unknown) => {
      if (!rawRow || typeof rawRow !== "object") return;
      const r = rawRow as Record<string, unknown>;

      const id = typeof r.id === "string" ? r.id.trim() : "";
      if (!id) return; // no usable primary key - this row is unrecoverable

      const studentName = typeof r.studentName === "string" ? r.studentName : "";

      // nameMatch is NOT optional on GradingRow (every row must carry one of
      // the four states), so there is no "absent stays undefined" case here
      // the way ReplyRow's optional resourceState has - a value outside the
      // four-member set (missing, garbled, or from some future fifth state
      // this code does not know about) falls back to "no-roster", the
      // member that already means "we do not actually know" (grading-row.ts's
      // own doc comment: "an absent roster is our gap, not the student's") -
      // never "unmatched", which would assert a false negative the stored
      // data never actually claimed.
      const nameMatchRaw = typeof r.nameMatch === "string" ? r.nameMatch : "";
      const nameMatch: GradingRowNameMatch = VALID_NAME_MATCHES.has(nameMatchRaw)
        ? (nameMatchRaw as GradingRowNameMatch)
        : "no-roster";

      // A non-array (or entirely absent) blob yields [], and any entry that
      // is not itself a string is dropped rather than coerced - a candidate
      // name is shown verbatim to the instructor (grading-row.ts: "Shown,
      // never auto-applied"), so a non-string entry has nothing safe to be
      // coerced INTO.
      const rosterCandidates: string[] = Array.isArray(r.rosterCandidates)
        ? r.rosterCandidates.filter((c): c is string => typeof c === "string")
        : [];

      const submissionText = typeof r.submissionText === "string" ? r.submissionText : "";

      const stateRaw = typeof r.state === "string" ? r.state : "";
      let state: GradingRowState = VALID_STATES.has(stateRaw) ? (stateRaw as GradingRowState) : "pending";
      if (state === "grading") state = "pending"; // defensive: nothing is ever in flight on load

      const totalScore = typeof r.totalScore === "string" ? r.totalScore : "";
      const strengths = typeof r.strengths === "string" ? r.strengths : "";
      const improvements = typeof r.improvements === "string" ? r.improvements : "";
      const overallComment = typeof r.overallComment === "string" ? r.overallComment : "";
      // Same write-side rule, enforced again on read: a stale error string
      // on a row that is not "failed" must not resurrect itself.
      const error = state === "failed" && typeof r.error === "string" ? r.error : "";
      // R2/item 3: userEdited MUST survive - it is what stops a re-grade
      // from silently overwriting the instructor's own words (grading-row.ts:
      // "so a re-grade can refuse to overwrite their words"). A missing or
      // non-boolean value defaults to false, never true - an unreadable flag
      // must never grant a protection the stored data did not actually earn.
      const userEdited = typeof r.userEdited === "boolean" ? r.userEdited : false;

      rows.push({
        id,
        studentName,
        nameMatch,
        rosterCandidates,
        submissionText,
        state,
        totalScore,
        strengths,
        improvements,
        overallComment,
        error,
        userEdited,
      });
    });

    return rows;
  } catch {
    return [];
  }
}
