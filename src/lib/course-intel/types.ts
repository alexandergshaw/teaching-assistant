// The contract for the course-student-intelligence feature. Zero imports, on
// purpose: four groups build against this simultaneously, and a type that
// lived inside any one of their modules would either block the others or get
// copied and silently diverge.
//
// Read docs/course-student-intelligence-acceptance-criteria.md before changing
// anything here. Several shapes below look over-engineered until you read the
// decision that forced them, so each carries its reason inline.

/**
 * THE join key. Canvas's own numeric user id, the one field present in the
 * roster, enrollments, submissions and discussion entries alike.
 *
 * Never a display name, never a similarity score. This project already has a
 * shipped feature that matches message senders to students by Levenshtein
 * distance, because the list endpoint it uses hands it names only - and that is
 * exactly the failure this type exists to prevent. Two students share a name
 * more often than anyone expects, and a silent merge reports a quiet student as
 * struggling on somebody else's grades.
 *
 * NORMALISED AT ONE BOUNDARY. The four sources disagree on the TypeScript type:
 * listStudentGradeSummaries returns `userId: string`, while the discussion,
 * auto-zero and submission-detail modules all use `number`. join.ts converts at
 * the single point where sources meet; nowhere else in this feature may a user
 * id be a string.
 */
export type CanvasUserId = number;

/**
 * A student's position in THIS assembly, 1-based. `S1`, `S2`, and so on.
 *
 * This is what the model sees instead of a name. Not decoration and not
 * anonymisation theatre - it is the mechanism that lets the concern question
 * run with no personally identifying label in the prompt at all, and it is why
 * the instructor's own question ("how is Alex doing") is rewritten to its index
 * BEFORE the prompt is composed. The name never leaves the machine on that
 * path.
 *
 * It also removes an ambiguity a prompt rule could not: a model told to
 * disambiguate two same-named students can forget; a model given only `S7`
 * cannot produce an ambiguous reference in the first place. The UI resolves the
 * index back to a name locally, appending a disambiguator only for names that
 * actually collide in that course.
 */
export type StudentIndex = number;

/**
 * Three states that are routinely collapsed into one, and must not be.
 *
 * A student with no submission rows is NOT a student with zero scores, and
 * neither is a student whose submissions this tier never fetched. Collapsing
 * them produces the single most damaging output this feature can generate: a
 * student reported as "missing 7 of 7" when the truth is "we did not look".
 *
 * `not-fetched` is a first-class state because the design deliberately answers
 * some questions without touching the expensive sources. That is a feature, and
 * it has to be visible rather than indistinguishable from an empty result.
 */
export type Presence<T> =
  | { readonly state: "loaded"; readonly value: T }
  /** The source was read and this student genuinely has nothing in it. */
  | { readonly state: "none" }
  /** This tier did not fetch this source at all. Never rendered as zero. */
  | { readonly state: "not-fetched"; readonly reason: string }
  /** The fetch was attempted and failed. Carries a scrubbed reason. */
  | { readonly state: "failed"; readonly reason: string };

/** One student's state on one assignment, as Canvas reports it. */
export interface StudentSubmissionFact {
  readonly assignmentId: string;
  /** `null` means UNGRADED. Never conflate with a score of zero - the whole
   * point of the concern signals is that those two mean opposite things. */
  readonly score: number | null;
  readonly pointsPossible: number | null;
  /** Canvas's `workflow_state`, carried verbatim and never re-spelled. */
  readonly workflowState: string;
  readonly submittedAt: string | null;
  /**
   * Canvas's OWN booleans, which no code in src/lib/canvas has ever read.
   *
   * Deliberately NOT re-derived from `submittedAt` versus a due date. Canvas's
   * `missing` accounts for a teacher's manual "mark missing" override and for
   * submission types that cannot be submitted online at all, so a local
   * re-derivation would disagree with the gradebook the instructor is looking
   * at while claiming to describe it.
   */
  readonly late: boolean;
  readonly missing: boolean;
  readonly excused: boolean;
  /**
   * The student's EFFECTIVE due date, with overrides applied.
   *
   * Two fields for three states, copied from the existing auto-zero reader's
   * hard-won handling: a string is this student's own deadline, `null` means
   * they have no deadline, and ABSENT (`dueAtPresent === false`) means Canvas
   * said nothing and the assignment's base due date applies. A single nullable
   * field cannot express the difference between "no deadline for them" and "ask
   * the assignment", and getting it wrong moves students in and out of the
   * missing-work denominator.
   */
  readonly dueAt: string | null;
  readonly dueAtPresent: boolean;
}

/**
 * "Student X is missing 4 of 7."
 *
 * BOTH NUMBERS COME FROM THE SAME DENOMINATOR SET or the sentence is false.
 * The considered set is: published, not omitted from the final grade, and with
 * an effective due date already in the past. An assignment nobody could have
 * submitted yet is not missing work, and counting it makes every student in the
 * course look worse in the first week of term.
 */
export interface MissingRollup {
  /** The "of 7". */
  readonly consideredCount: number;
  /** The "4". */
  readonly missingCount: number;
  readonly lateCount: number;
  readonly gradedCount: number;
  /** Submitted, but not yet graded - the instructor's own backlog, not the
   * student's. Kept separate for exactly that reason. */
  readonly ungradedSubmittedCount: number;
  readonly excusedCount: number;
}

/** Where a piece of student writing came from. */
export type StudentTextKind = "discussion-post" | "discussion-reply" | "announcement-reply" | "message";

/**
 * One citable unit of student-authored text.
 *
 * `id` is opaque and source-qualified. The MODEL never sees it - it sees a
 * marker like `[T3]`, resolved by index the way page citations already are,
 * because titles are not unique and neither are names.
 */
export interface StudentTextRef {
  readonly id: string;
  readonly kind: StudentTextKind;
  /** Thread title or conversation subject. Student-influenced text: it is
   * framed as data alongside the body, never trusted as a label. */
  readonly container: string;
  readonly createdAt: string | null;
  /**
   * Who was being replied to.
   *
   * This is the request's "along with the students they are replying to", and
   * it is the one part of the whole join that needs no new plumbing: the
   * existing discussion reader already threads the parent's user id down
   * through its recursive walk and types it.
   */
  readonly parentUserId: CanvasUserId | null;
  readonly text: string;
}

/** One student's discussion activity, both directions. */
export interface StudentDiscussionActivity {
  readonly posts: readonly StudentTextRef[];
  readonly replies: readonly StudentTextRef[];
  /** Who this student replied to, and how often. */
  readonly repliedTo: readonly { readonly userId: CanvasUserId; readonly count: number }[];
  /** Who replied to this student. A student nobody answers is a real signal an
   * instructor cares about, and it is only visible from this direction. */
  readonly repliedToBy: readonly { readonly userId: CanvasUserId; readonly count: number }[];
}

/** One conversation this student is part of, from the cheap index. */
export interface StudentThreadRef {
  readonly conversationId: number;
  readonly subject: string;
  readonly lastMessageAt: string | null;
  readonly messageCount: number;
}

export interface StudentMessageActivity {
  /** Identity and counts, available on the cheap tier at no extra call. */
  readonly threads: readonly StudentThreadRef[];
  /** Bodies cost one call per conversation, so they are their own Presence and
   * are `not-fetched` whenever the question did not need them. */
  readonly bodies: Presence<readonly StudentTextRef[]>;
}

export interface StudentGradeSummary {
  readonly currentScore: number | null;
  readonly finalScore: number | null;
}

export interface StudentSubmissionSummary {
  readonly byAssignmentId: Readonly<Record<string, StudentSubmissionFact>>;
  readonly rollup: MissingRollup;
}

/** Everything the assembly holds about one person. */
export interface CourseStudentRecord {
  readonly userId: CanvasUserId;
  readonly index: StudentIndex;
  /**
   * Display only, and never a key.
   *
   * Taken from the ENROLLMENTS/roster call, never from a display name carried
   * on a discussion participant record: a Canvas user sets their own display
   * name, so a student can set theirs to a classmate's name, or to something
   * like "Jordan Blake (at risk)". Not an injection risk - answers render
   * through the hardened markdown renderer - a confusion risk, and one that
   * gets worse the more identifying detail is shown beside it.
   */
  readonly name: string;
  readonly sortableName: string;
  /**
   * A user id seen in a thread or a conversation but absent from the roster is
   * real: a dropped student, a TA, an observer. Never silently merged into
   * somebody else and never silently discarded - reported as off-roster, and
   * counted as an omission.
   */
  readonly onRoster: boolean;

  /** How this student was identified - see StudentIdentitySource. Carried per
   * student rather than per assembly because one assembly can mix them: a
   * course can have cached ids for some students and only roster names for
   * the rest. */
  readonly identitySource: StudentIdentitySource;

  readonly grades: Presence<StudentGradeSummary>;
  readonly submissions: Presence<StudentSubmissionSummary>;
  readonly discussion: Presence<StudentDiscussionActivity>;
  readonly messages: Presence<StudentMessageActivity>;

  /** The most recent timestamp across everything actually loaded for this
   * student. `null` when nothing was - which is NOT the same as "inactive",
   * and the concern rules must not treat it as such. */
  readonly lastActivityAt: string | null;
}

/**
 * Why something is not in the assembly.
 *
 * Every kind here is stated to the instructor. An answer built from seven of
 * nine discussion topics, presented as though it saw all nine, is worse than a
 * refusal, because the instructor cannot tell the difference and will trust it.
 */
export type AssemblyOmissionKind =
  | "topic-skipped-no-replies"
  | "topic-over-cap"
  | "topic-failed"
  | "conversation-not-fetched"
  | "conversation-failed"
  | "student-text-budget"
  | "source-failed"
  /** Present on EVERY assembly. The course filter on conversations trusts
   * Canvas's own context tagging, so a conversation about the course that was
   * started from the general inbox is absent and cannot be counted. An
   * omission we cannot measure is still an omission we must state - which is
   * why the copy says "messages Canvas associated with this course", never
   * "all messages". */
  | "course-filter-best-effort"
  | "off-roster-participant";

export interface AssemblyOmission {
  readonly kind: AssemblyOmissionKind;
  readonly detail: string;
  /** Absent when the omission is real but uncountable - see
   * `course-filter-best-effort`. */
  readonly count?: number;
  /** Set when the omission belongs to one student, so the notice can say whose
   * evidence is missing rather than only how much. */
  readonly studentIndex?: StudentIndex;
}

export interface CourseAssignmentBrief {
  readonly assignmentId: string;
  readonly name: string;
  readonly dueAt: string | null;
  readonly pointsPossible: number | null;
  readonly published: boolean | null;
  readonly omitFromFinalGrade: boolean | null;
}

/** Class context, attributable to nobody. Announcements are broadcast and have
 * no student attached; they are here so the model can say "this was already
 * announced twice", never as evidence about a person. */
export interface CourseAnnouncementBrief {
  readonly id: number;
  readonly title: string;
  readonly postedAt: string | null;
  readonly text: string;
}

/** Which tier of data an assembly holds. The cheap tier answers the concern
 * question completely and touches no student writing at all. */
/**
 * WHY THE APP COULD NOT REACH AN LMS, when it could not.
 *
 * There is no single "offline" state in this app - there are four, and they
 * already fail differently, so collapsing them would mean telling an
 * instructor to connect Canvas when they already have and it is merely down.
 *
 * `no-credential` deliberately does NOT distinguish "no such institution",
 * "half-configured" and "you never connected" - that indistinguishability is a
 * security property of the credential resolver and must not be unpicked here
 * to produce a friendlier message.
 */
export type LmsUnavailableReason =
  /** No stored credential for this user and institution. */
  | "no-credential"
  /** The course has no Canvas URL at all - an export-only course, which is a
   * normal kind of course here rather than a broken one. */
  | "no-lms-course"
  /** Configured and reachable in principle, but this attempt failed. */
  | "unreachable";

/**
 * Whether this assembly was built against a live LMS, and if not, why.
 *
 * SEPARATE FROM `AssemblyTier` ON PURPOSE. Tier says how MUCH was fetched;
 * this says whether fetching was possible at all. Without it an offline
 * assembly is indistinguishable from a deliberately cheap one unless you
 * inspect every source's `Presence` reason one by one - so the instructor
 * would see a screen of identical "not enough information" rows with nothing
 * saying why.
 *
 * Detected, never chosen. Asking the instructor to select "offline" would be
 * asking them to already know the thing they are asking this tool to tell
 * them, and it would duplicate state the credential resolver already knows.
 */
export type LmsConnection =
  | { readonly state: "live" }
  | { readonly state: "unavailable"; readonly reason: LmsUnavailableReason; readonly detail: string };

/**
 * How we know who a student is.
 *
 * OFFLINE, `(name, course)` IS THE KEY, and that is not a compromise of AC1.
 * AC1 forbids joining on a display name in the LIVE case, where a sound
 * numeric id exists and a name would be strictly worse for no gain. Offline
 * there is no id to prefer: the choice is a name or no feature, and AC1 was
 * never an argument for the second. Within one course, against the
 * instructor's own roster, a name is a workable key - and the instructor
 * knows their own students, which is what makes it workable rather than
 * merely necessary.
 *
 * What does NOT relax is collision handling. Two students called Alex Chen in
 * one section is uncommon and entirely real, and a silent merge would report
 * one of them on the other's work. `ambiguous-name` exists so that case stops
 * and asks instead of guessing - the same four-outcome discipline the grading
 * tool already applies to this exact problem.
 */
export type StudentIdentitySource =
  /** Resolved live, from the LMS. The strongest form. */
  | "lms-roster"
  /** A numeric Canvas id cached on the course row by the repo-binding
   * workflow. A FACT from a real prior call, not a match - categorically
   * different from a name - but its age is unknowable offline and its
   * coverage is partial by construction. */
  | "cached-canvas-id"
  /** Matched by name against this course's own roster, exactly, after
   * canonicalising case, whitespace and "Last, First" order. */
  | "course-roster-name"
  /** The name matched more than one roster entry. Nothing is attributed until
   * the instructor says which student is meant. NEVER resolved by picking. */
  | "ambiguous-name"
  /** The instructor attached this material to this student themselves. */
  | "instructor-attached";

export type AssemblyTier = "signals" | "signals+text";

export interface CourseIntelAssembly {
  /** The course_hub row id - the uuid the UI selector holds. */
  readonly courseHubId: string;
  readonly institution: string;
  /** Derived from the course's Canvas URL, never stored as its own column.
   * Crossing this with courseHubId is an easy, silent mistake precisely
   * because the derivation is copy-pasted per feature rather than centralised. */
  readonly canvasCourseId: string;
  readonly courseName: string;
  /** When this was built. Every answer carries it, which is what makes a cached
   * summary unnecessary and staleness a non-problem rather than a managed one. */
  readonly assembledAt: string;
  readonly tier: AssemblyTier;
  readonly students: readonly CourseStudentRecord[];
  readonly announcements: readonly CourseAnnouncementBrief[];
  readonly assignments: readonly CourseAssignmentBrief[];
  readonly omissions: readonly AssemblyOmission[];
}

/**
 * A named, deterministic reason a student is on the concern list.
 *
 * D23 CHANGED WHAT TWO OF THESE MEAN, and widened the union rather than
 * bending more words. D22d recorded four bends forced by a closed union with
 * no offline members. Two of them are gone:
 *
 * - `missing-work` can now mean what it says. Given a DECLARED authoritative
 *   grading tool for a kind of work (D23a) and an instructor-entered deadline
 *   (D23b), absence of a row is not "we did not see it" - it is "it is not
 *   there", measured against the roster, which is the same basis Canvas's own
 *   `missing` flag uses. The relative, weaker offline reading ("no recorded
 *   work on an assessment others were graded on") is still what
 *   offline-signals.ts emits, and its label still says so.
 * - `late-work` becomes emittable. D22d said lateness had no offline analogue
 *   because no recorded row carries a due date; that treated a missing field
 *   as a permanent property rather than a gap the instructor can fill.
 *
 * The members below `insufficient-data` are the D23 additions. They are
 * ADDITIVE: nothing above them was removed or renamed.
 */
export type ConcernSignalKind =
  | "missing-work"
  | "late-work"
  | "low-score"
  | "ungraded-backlog"
  | "no-recent-activity"
  /** Not a concern - the honest answer when there is too little to judge. It is
   * a first-class row so such a student is REPORTED rather than omitted, which
   * is the difference between "nothing to worry about" and "we do not know". */
  | "insufficient-data"
  /**
   * More than one row for the same student and assessment (D23b).
   *
   * Detectable with NO timestamp at all - it is a multiplicity fact. Ordering
   * is not: with unknown submission times we can say a resubmission happened
   * and cannot say which came first, and the label says exactly that rather
   * than picking one.
   */
  | "resubmission"
  /**
   * A submission whose time is unknown (D23c).
   *
   * The third value of a three-valued lateness, and a first-class signal so it
   * is REPORTED rather than rounded. An unknown-time submission is NOT on time
   * and NOT late. It is never filled in from a capture time - that is when the
   * INSTRUCTOR graded, and using it would mark a whole class late.
   */
  | "unknown-submission-time"
  /**
   * D23f, and the one place this design can call an honest student missing.
   *
   * The tool sees only what was GRADED, so a student who submitted and is
   * waiting on the instructor is indistinguishable from one who did not
   * submit. The deadline makes absence meaningful; it does not make ungraded
   * work visible. Carried as DATA on every row that reports missing work, so
   * the answer states it rather than leaving the instructor to remember it.
   */
  | "ungraded-gap"
  /**
   * Dated activity after a measured gap of silence (D23d).
   *
   * Behavioural evidence of recovery, not of concern. It exists because
   * "actively working to remedy their grade" is a genuinely different state
   * from "doing poorly", and needs its own evidence rather than a softer
   * reading of the same numbers.
   */
  | "recent-activity-after-gap";

/**
 * Which of D23d's three states a student is in - plus the honest fourth.
 *
 * THE THIRD IS THE VALUABLE ONE AND IS NOT A MILDER SECOND. A student with
 * three late submissions and two resubmissions this week is RECOVERING. A
 * student with three missing and silence is DISENGAGED. A concern computation
 * that flags both similarly is actively wrong about the first: it sends an
 * outreach message to someone already doing the thing the outreach would ask
 * for, which is worse than saying nothing. So `recovering` is its own outcome
 * with its own behavioural evidence and is NEVER folded into the concern list
 * as a weaker concern.
 *
 * `insufficient-data` is not a fourth judgement, it is the refusal to judge -
 * the same first-class "we do not know" row the rest of this feature already
 * treats as more important than a confident guess. A student who cannot be
 * joined is reported here, never quietly counted as doing well.
 */
export type EngagementOutcome =
  /** No qualifying concern signal. */
  | "doing-well"
  /** Qualifying concern signals and no recent, dated remediation. */
  | "needs-outreach"
  /** Qualifying concern signals AND recent, dated remediation. */
  | "recovering"
  /** Nothing about this student could be computed soundly. */
  | "insufficient-data";

/**
 * Why an engagement computation is narrower than it looks.
 *
 * Every one of these is stated to the instructor. A missing count computed
 * over five of eight assessments, presented as though it covered all eight, is
 * worse than no count at all - the same rule AssemblyOmissionKind exists for.
 */
export type EngagementCaveatKind =
  /** D23f. Present whenever ANY missing count is reported. */
  | "ungraded-gap"
  /** No authoritative grading tool was declared for that kind of work, so
   *  absence of a row means nothing and missing was NOT computed. */
  | "assumption-not-declared"
  /** Rows for that assessment came from a tool other than the declared one, so
   *  its missing count would be WRONG. Detected and stated, never averaged
   *  over: a half-migrated assessment producing a confident missing list is the
   *  worst outcome available here. */
  | "assumption-violated"
  /** No instructor-entered deadline, so neither missing nor late is computable
   *  for that assessment. */
  | "no-deadline"
  /** The deadline has not passed. An assessment nobody could have submitted
   *  yet is not missing work for anyone. */
  | "deadline-not-passed"
  /** The reference instant could not be parsed, so nothing time-dependent was
   *  computed. */
  | "no-reference-time"
  /** Rows that attributed to no single student. Real work that belongs to
   *  somebody, and one of them could belong to a student about to be called
   *  missing. */
  | "unattributed-rows"
  /** Rows naming an assessment that is not in the assessment list. Used for
   *  nothing, counted rather than silently dropped. */
  | "orphan-rows"
  /** Submissions with no known time, which are neither late nor on time. */
  | "unknown-submission-times"
  /** Students whose name matches more than one roster entry. Excluded from
   *  every missing count, because a student who cannot be joined would look
   *  absent from work they actually did. */
  | "ambiguous-name";

export interface EngagementCaveat {
  readonly kind: EngagementCaveatKind;
  /** Built in code from typed numbers - never a sentence a model produced. */
  readonly detail: string;
  readonly count?: number;
  /** Which assessments this caveat is about, when it is about some of them
   *  rather than the whole computation. */
  readonly assessmentIds?: readonly string[];
}

export interface ConcernSignal {
  readonly kind: ConcernSignalKind;
  /** The rendered fact, e.g. "3 of 7 assignments missing". Built in code from
   * typed numbers - never a sentence the model produced. */
  readonly label: string;
  /** The raw number behind the label, so the UI can style by severity without
   * re-parsing prose. */
  readonly value: number | null;
}

/**
 * One row of the concern set - and the reason this type exists at all.
 *
 * MEMBERSHIP IS DECIDED IN CODE, BEFORE ANY MODEL CALL. The criteria for this
 * feature originally required that every student the model NAMES as a concern
 * trace to a concrete signal. That is a soundness rule: it constrains who gets
 * IN. The attack that matters is the opposite one - a student writes something
 * into a discussion reply, phrased as an administrative record rather than as a
 * command, and a model that silently DROPS them from the list satisfies the
 * rule perfectly, because everyone it named is still traceable. The harm is
 * invisible: the instructor sees a shorter list that looks entirely normal.
 *
 * No prompt wording closes an asymmetry that structural. So the model is never
 * asked who belongs on this list. It is handed these rows and asked to EXPLAIN
 * them, and a receipt check asserts every row's index appears in the answer.
 * The attack becomes "argue, in prose, against a row that is still visibly on
 * screen", which is a fight the instructor can see.
 */
export interface ConcernRow {
  readonly studentIndex: StudentIndex;
  /** Null offline, where a student is identified by name against the course
   * roster and has no Canvas id. See CourseIntelAnswerRecord.citedStudents
   * for why fabricating one is the worst option and why identitySource
   * travels alongside. */
  readonly userId: CanvasUserId | null;
  readonly identitySource: StudentIdentitySource;
  readonly signals: readonly ConcernSignal[];
  /** Ordering only. Never shown as a score, never described to the model as a
   * ranking - a number an instructor could read as "how bad this student is"
   * is exactly the false precision this feature must not manufacture. */
  readonly sortWeight: number;
}

export interface ConcernSet {
  readonly rows: readonly ConcernRow[];
  /** Students examined and found to have no concern signal. A count rather
   * than a list, because naming them serves nobody. */
  readonly clearCount: number;
  /** The thresholds this set was computed with - the INSTRUCTOR's, persisted
   * from their own controls, so the judgement is theirs and is reproducible
   * rather than a constant buried in a prompt. */
  readonly thresholds: ConcernThresholds;
}

export interface ConcernThresholds {
  /** A course score at or below this is a concern signal. */
  readonly lowScorePercent: number;
  /** This many missing assignments, or more. */
  readonly minMissingCount: number;
  /** Days since last activity, at or above which it is a signal. */
  readonly staleActivityDays: number;
}

/** What the model is allowed to be asked. Derived from the question text before
 * anything is fetched, because the tier decision is structural - does the
 * question name a student, and does answering it need prose - rather than
 * lexical. */
export type CourseIntelQuestionShape =
  /** "Who are the students of concern." Every student, no prose. */
  | { readonly kind: "concern" }
  /** "How is Y doing." One student, signals; prose only behind an explicit
   * opt-in. */
  | { readonly kind: "student-status"; readonly studentIndex: StudentIndex; readonly includeText: boolean }
  /** "What areas has X asked about." One student, and their own writing IS the
   * payload - so no other student's text is fetched or sent. */
  | { readonly kind: "student-topics"; readonly studentIndex: StudentIndex };

/** One stored question and its answer. The corpus is never stored; this is. */
export interface CourseIntelAnswerRecord {
  readonly id: string;
  readonly question: string;
  readonly answerMarkdown: string;
  /** Resolved student markers, so a chip can be rendered without re-running
   * anything. Indices, plus the ids needed to resolve them locally. */
  /**
   * The students an answer cited, by index.
   *
   * `userId` IS NULLABLE, and that is the whole point. An offline answer is
   * built from recorded work identified by name against the course roster,
   * and most of those students have no Canvas id at all - so the shipped
   * non-nullable shape could not express an offline citation, and the
   * engagement work had to define a parallel type rather than fabricate one.
   *
   * Fabricating one would have been the worst outcome available: it would
   * launder a screen-read name into the one field this design treats as
   * ground truth, and every consumer downstream would stop distinguishing a
   * verified identity from a matched one.
   *
   * `identitySource` travels with it so a reader can tell which is which.
   * Never drop it to "simplify" the shape - the pair IS the meaning.
   */
  readonly citedStudents: readonly {
    readonly index: StudentIndex;
    readonly userId: CanvasUserId | null;
    readonly identitySource: StudentIdentitySource;
  }[];
  readonly assembledAt: string;
  readonly createdAt: string;
  readonly tier: AssemblyTier;
  readonly omissions: readonly AssemblyOmission[];
}
