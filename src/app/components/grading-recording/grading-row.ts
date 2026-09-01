// Grading from a screen recording - the row contract.
//
// docs/grading-via-recording-acceptance-criteria.md. The owner's R1 legibility
// measurement PASSED (they ran the probe against a real submission and reported
// it legible), which is what unblocks this surface being built at all - R1b made
// that measurement the gate, not a formality.
//
// THIS FILE EXISTS TO MAKE ONE BOUNDARY STRUCTURAL (R0-2).
//
// The owner ruled out binding a recording-derived score to a student record or
// posting it to an LMS: "if i'm using the recording to grade students, it's not
// possible to bind the score to a student or upload to an lms". They are right -
// a name read off a screen is not a student identity.
//
// `postCanvasGrades` (src/lib/canvas/grades.ts) is this repo's ONLY grade-write
// path and it requires a non-optional `userId: number`. But `GradeResult.userId`
// exists and is commented "enables write-back", and the Canvas graders copy it
// through on both the success and failure branches - so a recording-derived
// GradeResult would differ from a postable one only by a field happening to be
// undefined. That is a convention, and conventions are what this repo has
// watched fail six times this session.
//
// So this row type has NO `userId` field and never will. Posting one is a
// COMPILE ERROR, not a discipline. For the same reason these rows must never be
// persisted into `grading_drafts` / `GradingRunEntry`: that store is one
// approved click from `post-grades`.
//
// Pure and dependency-free so both the client surface and a "use server" action
// can import it.

/**
 * How confident we are that the name read off the screen belongs to a real
 * person on the roster (R3a). Three states, not two - `repo-student-bindings.ts`
 * is the precedent, and its explicit `ambiguous` outcome is the part worth
 * copying: "we found several" is not "we found none", and collapsing them
 * hides the case where an instructor most needs to look.
 *
 *   - "matched"    : exactly one roster entry matched the read name.
 *   - "ambiguous"  : more than one matched (two students sharing a surname).
 *   - "unmatched"  : none matched.
 *   - "no-roster"  : no roster was available to check against - NOT the same as
 *                    "unmatched", and must never be reported as if it were. An
 *                    absent roster is our gap, not the student's.
 */
export type GradingRowNameMatch = "matched" | "ambiguous" | "unmatched" | "no-roster";

export type GradingRowState = "pending" | "grading" | "ready" | "failed";

/**
 * One submission read off the recording.
 *
 * `studentName` is what was READ, verbatim - never corrected against the roster,
 * because silently replacing a read name with a roster name would hide exactly
 * the misattribution R3 exists to prevent. The roster comparison's verdict lives
 * separately in `nameMatch`, and `rosterCandidates` carries who it matched so an
 * ambiguous row can show the instructor the choice rather than making it.
 *
 * There is deliberately no `userId`, no `canvasSubmissionId`, and no field that
 * could carry one. See this file's header.
 */
export interface GradingRow {
  /** Opaque, minted once on capture. Never derived from the student name - a
   *  name can be re-read differently between frames, and an id that changed
   *  would orphan the instructor's edits. */
  id: string;
  /** The display name exactly as read off the screen. R3: a submission whose
   *  name could not be read is SKIPPED at extraction rather than attributed to
   *  the nearest visible name, so this is never a guess. */
  studentName: string;
  nameMatch: GradingRowNameMatch;
  /** Who the roster matched, when `nameMatch` is "matched" or "ambiguous".
   *  Empty otherwise. Shown, never auto-applied. */
  rosterCandidates: readonly string[];
  /** The submission text read off the screen. */
  submissionText: string;
  state: GradingRowState;
  /** The scored result, once graded. Composed through the shared grading
   *  helpers (composeOverallComment / formatFeedback), never authored
   *  field-by-field, so a reader sees the same composition every other grader
   *  produces. */
  totalScore: string;
  strengths: string;
  improvements: string;
  overallComment: string;
  /** Verbatim failure text for this row - never "an error occurred". */
  error: string;
  /** True once the instructor has typed into any feedback field, so a re-grade
   *  can refuse to overwrite their words (the reply table's own AC18/AC44 rule,
   *  which this surface inherits rather than reinvents). */
  userEdited: boolean;
}

/**
 * R4a: what a name/keyword filter searches.
 *
 * Deliberately the student name and the SUBMISSION text - never the generated
 * feedback. Entry 372's T5b kept `replyingToAuthor` out of the reply haystack so
 * a name search would not interleave posts BY and AT a person; the same
 * reasoning cuts harder here, because feedback routinely contains the student's
 * own name ("Maria, your argument..."). Searching a name would then return every
 * row whose FEEDBACK mentions them, which is close to every row.
 *
 * Pinned by an exact-tuple test the way REPLY_ROW_HAYSTACK is, so adding a
 * fourth field turns that test red rather than quietly widening the search.
 */
export const GRADING_ROW_HAYSTACK = (row: GradingRow): readonly string[] => [
  row.studentName,
  row.submissionText,
];
