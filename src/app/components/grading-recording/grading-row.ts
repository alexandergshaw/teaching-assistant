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
 * docs/course-student-intelligence-acceptance-criteria.md D23c: how much is
 * actually known about WHEN THE STUDENT SUBMITTED - never when the
 * instructor happened to grade the row. Three states, not two, the same
 * "no-roster is not unmatched" discipline `GradingRowNameMatch` above
 * already runs (a genuine "we do not know" must never collapse into a
 * definite-looking answer):
 *
 *   - "known"       : a real timestamp exists in `GradingRow.submittedAt` -
 *                      read off the screen at extraction time, or typed in
 *                      by the instructor. D23c's source (1).
 *   - "marked-late"  : the instructor asserted while grading that this
 *                      submission was late, without giving an exact time -
 *                      D23c's cheap fallback source (2). `submittedAt` stays
 *                      unset for this state; there is no timestamp to carry,
 *                      only a verdict, and nothing that needs an actual
 *                      instant (ordering resubmissions, an exact "how late")
 *                      may treat this as though it had one.
 *   - "unknown"      : neither is available - the default for every row this
 *                      wave's extraction path produces (the extraction
 *                      prompt is NOT changed by this work) and for every
 *                      pre-existing row. NEVER counted as on time by
 *                      anything that reads this field.
 *
 * D23c's rejected third source, spelled out because it is the mistake this
 * type exists to make impossible: the CAPTURE time (when the instructor's
 * screen recording happened to read the row) is never used as a stand-in
 * for this. That is a fact about the instructor's own grading cadence, not
 * the student's submission - grading a week after a deadline would then mark
 * an entire class late. Nothing in this file ever reads a clock to populate
 * this field; it is set only from a value a caller supplies from outside
 * (an extracted timestamp, or one typed by a person), or left "unknown".
 */
export type GradingRowSubmissionTimeStatus = "known" | "marked-late" | "unknown";

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
  /** docs/course-student-intelligence-acceptance-criteria.md D21d: the
   *  course_hub row id (a uuid) this row was captured under. Absent for a
   *  row that predates course-scoping (a pre-existing global table's row) or
   *  was captured with no course selected - both read as UNATTRIBUTED, never
   *  adopted into whichever course happens to be open later. This is the
   *  app's own internal course identifier, an entirely different thing from
   *  the student identity this file's header forbids - see that header: a
   *  course id does not weaken the no-userId rule, and does not touch the
   *  machinery (grading-row-serialization.ts's explicit, no-spread field
   *  enumeration) that enforces it. Set once, at mint time
   *  (grading-capture-sync.ts's blankGradingRow never sets it;
   *  useGradingRows.ts's setAllRows stamps it onto every row it does not
   *  already recognize by id) and otherwise carried forward untouched. */
  course?: string;
  /** docs/course-student-intelligence-acceptance-criteria.md D22b/D23e: the
   *  assessment this submission belongs to - an instructor-facing
   *  identifier, not a foreign key into anything else in this app (nothing
   *  else in this app has an assessment id to borrow - see below). Same
   *  treatment `course` immediately above already got: set once at mint
   *  time, absent means UNATTRIBUTED, and a row already carrying one is
   *  never silently re-adopted into whichever assessment a caller later
   *  happens to be working with - `stampGradingRowsWithAssessment` below is
   *  the one place that discipline lives, mirroring
   *  `stampGradingRowsWithCourse`'s own.
   *
   *  HONEST FINDING, verified directly against GradingRecordingPanel.tsx
   *  before this field was added: the panel has no assessment selector of
   *  any kind today - only a course picker and a free-text rubric box with
   *  no name or id attached to it. So nothing currently calls
   *  `stampGradingRowsWithAssessment` with a real value, and every row -
   *  old and new alike - reads UNATTRIBUTED on this axis until a future
   *  wave adds a real capture-time source (an assessment picker, or a name
   *  typed alongside the rubric) and wires it through useGradingRows.ts the
   *  same way `courseId` is wired today. This field and its helpers exist
   *  now so that future wiring is a small, additive change rather than a
   *  second course-scoping effort from scratch - not because a value is
   *  available yet. Never populate this with a guess (the rubric text, the
   *  course name, a hash of anything) to make it look wired; an honest
   *  UNATTRIBUTED default is the correct value until a real source exists.
   *
   *  Optional (unlike `nameMatch`/`state`, which are required) for the same
   *  reason `course` above is optional and not the reason `nameMatch` isn't:
   *  this field was added to an ALREADY-SHIPPED type, and every existing
   *  constructor of a `GradingRow` literal (blankGradingRow in
   *  grading-capture-sync.ts, and this directory's own test fixtures) must
   *  keep compiling unchanged. Not a student identity - see this file's own
   *  header (R0-2) before assuming any new field on this row weakens it. */
  assessment?: string;
  /** docs/course-student-intelligence-acceptance-criteria.md D23c: how much
   *  is actually known about when the STUDENT submitted - see
   *  `GradingRowSubmissionTimeStatus`'s own doc comment for the three
   *  states and why capture time is never used as a proxy.
   *
   *  Optional for the identical reason `assessment` above is optional
   *  (an already-shipped type; existing constructors must keep compiling),
   *  NOT because "unknown" is any less of a real fact about a row. Absent
   *  reads IDENTICALLY to the explicit "unknown" member, never as "known" -
   *  `gradingRowSubmissionTimeStatus` below is the one place that
   *  normalization happens, so no caller has to re-derive it inline. */
  submissionTimeStatus?: GradingRowSubmissionTimeStatus;
  /** An ISO-ish timestamp string, meaningful ONLY when
   *  `gradingRowSubmissionTimeStatus(row)` is "known" - ignore this value
   *  otherwise, even if some caller left something in it (the same
   *  discipline `error` already runs relative to `state === "failed"`,
   *  enforced on write in grading-row-serialization.ts's buildWireRow).
   *  NEVER the time the instructor captured/graded the row - see
   *  `GradingRowSubmissionTimeStatus`'s own doc comment and D23c: that is
   *  when the INSTRUCTOR worked, not when the STUDENT submitted. Nothing in
   *  this file ever reads a clock to populate this field. */
  submittedAt?: string;
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

/**
 * docs/recording-controls-ux-acceptance-criteria.md CC14: "Copy feedback"
 * (GradingTableRow.tsx) copies exactly the three FEEDBACK fields - strengths,
 * improvements, overallComment - joined by a blank line, in that order.
 * `totalScore` is deliberately excluded: it is a grade, not feedback, and
 * pasting it into a Canvas comment box alongside prose would read as this
 * app asserting a score it never posts anywhere (see this file's own header
 * on why a GradingRow can never carry a postable identity). A field left
 * blank is omitted entirely rather than leaving a bare blank line in its
 * place - a row with only an overall comment copies as one paragraph, not
 * two blank lines followed by one.
 */
export function joinFeedback(row: GradingRow): string {
  return [row.strengths, row.improvements, row.overallComment].filter((field) => field.trim() !== "").join("\n\n");
}

// ---------------------------------------------------------------------------
// docs/course-student-intelligence-acceptance-criteria.md D21d: course
// scoping. Mirrors discussion-serialization.ts's own D21d section - the
// table stays ONE localStorage value under ONE literal storage key
// (useGradingRows.ts's own table-key constant) rather than gaining a second
// key per course, because this directory's own key-inventory canary
// (grading-rows.test.ts) can only ever see a FIXED set of literal keys
// spelled out in source, never one computed from a runtime course id. So
// scoping is a property of each ROW (the `course` field above), not of the
// storage location, and useGradingRows.ts filters the one shared table down
// to a single course's own rows at read time.
// ---------------------------------------------------------------------------

/**
 * D21d: does `row` belong to the given course scope? `undefined` means the
 * UNATTRIBUTED scope - a row with no course tag matches only that scope,
 * never a real course id, and a row carrying a real course id matches only
 * that exact id. Exact equality only, deliberately never `??`/a fallback:
 * coalescing an unattributed row into "whichever course happens to be open"
 * is exactly the misattribution D21d exists to prevent.
 */
export function gradingRowMatchesCourse(row: GradingRow, courseScope: string | undefined): boolean {
  return row.course === courseScope;
}

/**
 * D21d: stamps `courseScope` onto every row in `next` whose id was NOT
 * present in `previous` (a brand-new row this call is introducing). A row
 * whose id WAS already present in `previous` keeps `previous`'s own course
 * value exactly, regardless of what `next` happens to carry for it - useful
 * because `setAllRows` (useGradingRows.ts) receives a WHOLE replacement
 * array from an external merge (grading-capture-sync.ts's
 * syncGradingRowsFromExtracted) that this file never inspects, so an
 * already-attributed row's course can never be silently rewritten by
 * whatever that caller happened to build. Pure, so useGradingRows.ts's
 * setAllRows has a test surface this repo's node-env vitest can actually
 * reach for the stamping itself.
 */
export function stampGradingRowsWithCourse(
  next: ReadonlyArray<GradingRow>,
  previous: ReadonlyArray<GradingRow>,
  courseScope: string | undefined
): GradingRow[] {
  const previousById = new Map(previous.map((r) => [r.id, r] as const));
  return next.map((r) => {
    const prior = previousById.get(r.id);
    return { ...r, course: prior ? prior.course : courseScope };
  });
}

/**
 * D21d: counts rows carrying no course tag at all - a pre-existing global
 * table's rows (migrated forward with nothing guessed at, per D21d) plus any
 * row captured with no course selected. Exposed so a caller can tell "this
 * browser has N submissions waiting to be assigned to a course" apart from
 * "the current course has no submissions" - the two are never the same
 * fact.
 */
export function countUnattributedGradingRows(rows: ReadonlyArray<GradingRow>): number {
  return rows.filter((r) => r.course === undefined).length;
}

// ---------------------------------------------------------------------------
// docs/course-student-intelligence-acceptance-criteria.md D22b/D23e:
// assessment scoping. Mirrors the D21d course-scoping section above in
// shape and reasoning - see `assessment`'s own doc comment on `GradingRow`
// for the honest finding on why nothing calls `stampGradingRowsWithAssessment`
// with a real value today (GradingRecordingPanel.tsx has no assessment
// selector), and why that is the correct current state rather than a gap to
// paper over with a guess.
// ---------------------------------------------------------------------------

/**
 * D22b/D23e: does `row` belong to the given assessment scope? `undefined`
 * means the UNATTRIBUTED scope - a row with no assessment tag matches only
 * that scope, never a real assessment id. Exact equality only, deliberately
 * never `??`/a fallback - identical discipline to `gradingRowMatchesCourse`
 * above, for the identical reason: coalescing an unattributed row into
 * "whichever assessment happens to be selected" is exactly the
 * misattribution this exists to prevent.
 */
export function gradingRowMatchesAssessment(row: GradingRow, assessmentScope: string | undefined): boolean {
  return row.assessment === assessmentScope;
}

/**
 * D22b/D23e: stamps `assessmentScope` onto every row in `next` whose id was
 * NOT present in `previous` (a brand-new row this call is introducing). A
 * row whose id WAS already present in `previous` keeps `previous`'s own
 * assessment value exactly, regardless of what `next` happens to carry for
 * it - identical shape and reasoning to `stampGradingRowsWithCourse` above;
 * see that function's own doc comment. SABOTAGE TARGET (see this
 * directory's test files): unconditionally stamping every row in `next`
 * with `assessmentScope`, rather than checking `previousById` first, is
 * exactly the "adopt an already-attributed row into whichever scope is
 * selected now" defect this function exists to prevent.
 */
export function stampGradingRowsWithAssessment(
  next: ReadonlyArray<GradingRow>,
  previous: ReadonlyArray<GradingRow>,
  assessmentScope: string | undefined
): GradingRow[] {
  const previousById = new Map(previous.map((r) => [r.id, r] as const));
  return next.map((r) => {
    const prior = previousById.get(r.id);
    return { ...r, assessment: prior ? prior.assessment : assessmentScope };
  });
}

// ---------------------------------------------------------------------------
// docs/course-student-intelligence-acceptance-criteria.md D23c: submission
// timing. Two small pure helpers so the "unknown never counts as known/on
// time" rule lives in exactly one place, rather than every future caller
// (a late/on-time computation, a resubmission-ordering pass) re-testing
// `submissionTimeStatus` inline and risking a slightly different, slightly
// wrong version of the same check.
// ---------------------------------------------------------------------------

/**
 * D23c: normalizes `row.submissionTimeStatus` - absent (a row from before
 * this axis existed, or built by a constructor this repo has not updated)
 * reads IDENTICALLY to the explicit "unknown" member. Every other reader in
 * this file, and every future reader elsewhere, should call this rather
 * than reading `row.submissionTimeStatus` directly, so "absent" and
 * "explicitly unknown" can never quietly drift into being treated
 * differently by two different call sites.
 */
export function gradingRowSubmissionTimeStatus(row: GradingRow): GradingRowSubmissionTimeStatus {
  return row.submissionTimeStatus ?? "unknown";
}

/**
 * D23c: does `row` actually carry a known submission instant? True only for
 * "known" WITH a non-empty `submittedAt` - "marked-late" deliberately reads
 * as NOT known here even though it lets a caller conclude lateness some
 * other way, because it carries no timestamp value, and "unknown" (whether
 * explicit or merely absent, per `gradingRowSubmissionTimeStatus` above)
 * must never be treated as though a time were available. SABOTAGE TARGET:
 * loosening this to `gradingRowSubmissionTimeStatus(row) !== "unknown"` (or
 * dropping the `submittedAt` check) would let "marked-late" or a
 * missing-but-truthy `submittedAt` masquerade as a real timestamp - exactly
 * the collapse D23c forbids.
 */
export function gradingRowHasKnownSubmissionTime(row: GradingRow): boolean {
  return gradingRowSubmissionTimeStatus(row) === "known" && !!row.submittedAt;
}
