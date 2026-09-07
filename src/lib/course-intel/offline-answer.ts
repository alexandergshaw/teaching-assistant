// course-intel: the whole single-course answer built from recorded work,
// lifted out of the route handler unchanged.
//
// WHY IT MOVED. D24 added a second answer shape (across courses) and a course
// resolver ahead of both, and the route handler that held all of it went past
// this repo's 1000-line ceiling. The rule is that the wave is not verified
// until the file is split, so this is the split - and it is the right seam:
// everything here is decision-making over already-parsed values, while what
// stays in the route is authentication, the model client, the database client
// and the HTTP envelope.
//
// NOTHING ABOUT THE BEHAVIOUR CHANGED IN THE MOVE. Same order, same refusals,
// same receipt, same persistence, same response fields. The two edits are that
// the I/O it used to reach for directly (`callLlm`, `appendCourseIntelAnswer`)
// now arrives as a function, and that it returns a status plus a plain body
// instead of a `NextResponse` - which is also what makes it testable at all,
// since a Next response object cannot be inspected without a running handler.
//
// THE THREE THINGS THAT DO NOT CHANGE OFFLINE, and the reasons get stronger:
//   - the model still sees INDICES, never names. Offline the identity is a
//     name matched against the roster, so a name in the prompt would be both a
//     disclosure and a false precision.
//   - the course still reaches the prompt as a MARKER (`promptLabel`), never
//     as its name - see ./course-scope.
//   - the concern set is still computed in TYPESCRIPT. Thinner data gives a
//     model MORE room to invent, not less.

import { describeLmsConnection } from "./connection";
import { courseReadMode, describeCourseCoverage } from "./cross-course";
import { offlineAskUserIdForIndex, prepareOfflineAsk } from "./offline-ask";
import { parseCitedStudentMarkers } from "./prompt";
import type { OfflineStudentRepoRef } from "./offline-identity";
import type { ParsedOfflinePayload } from "./offline-payload";
import type { EngagementThresholds } from "./engagement";
import type { MarkedStudent } from "./context-block";
import type { LlmContent } from "@/lib/llm";
import type { ConcernThresholds, LmsConnection } from "./types";

/** A status code and the JSON body for it. The route wraps this; nothing here
 *  knows what a `NextResponse` is. */
export interface AskHttpResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/** What the caller must store, and the entry id it got back - or null when
 *  persistence failed, which is non-fatal and stated rather than swallowed. */
export interface OfflinePersistInput {
  readonly scopeStudent: string;
  readonly answerMarkdown: string;
  readonly citedStudents: readonly MarkedStudent[];
}

export interface OfflineAskArgs {
  readonly courseId: string;
  /**
   * The instructor's own course name. Bound for their browser and for the
   * coverage statement, NEVER for a prompt.
   *
   * Deliberately NOT called `courseName`: that spelling belongs to the two
   * fields in this feature that DO reach a model (the assembly's own, and
   * ./offline-prompt's), and a canary asserting "no `courseName:` is ever a
   * real name" has to mean one thing everywhere to be worth anything.
   */
  readonly courseDisplayName: string;
  /** What the model is told this course is called: a marker such as C1. */
  readonly promptLabel: string;
  /** From the COURSE ROW, never from the request - a client-supplied roster
   *  would let a caller invent students to attribute recorded work to. */
  readonly rosterNames: readonly string[];
  readonly studentRepos: readonly OfflineStudentRepoRef[];
  readonly payload: ParsedOfflinePayload;
  /** The instructor's own words. Persisted to history, never composed into a
   *  prompt. */
  readonly question: string;
  /** The same question with every course name already rewritten to a marker.
   *  This is the one that becomes a prompt. */
  readonly questionForModel: string;
  readonly concernThresholds: ConcernThresholds;
  readonly engagementThresholds: EngagementThresholds;
  readonly connection: LmsConnection;
  /** ISO. A parameter, never a clock read here. */
  readonly assembledAt: string;
  readonly nonce: string;
  /** Coverage sentences the caller already composed - the in-session tiebreak
   *  note, for instance - merged ahead of this path's own. */
  readonly extraNotes: readonly string[];
  /**
   * Returns the model's text, or throws.
   *
   * `wholeClass` picks the generation budget: a concern answer explains one
   * paragraph per row and a course can have many rows, while a single-student
   * answer is one or two paragraphs. The route owns both numbers.
   */
  readonly askModel: (turns: readonly LlmContent[], wholeClass: boolean) => Promise<string>;
  /** Appends the history row and returns its id. Throws on failure. */
  readonly persist: (input: OfflinePersistInput) => Promise<string>;
  readonly stripSentinel: (text: string) => string;
  readonly describeError: (err: unknown) => string;
}

/** D17: worded so the next step is obvious, and carrying NO upstream detail -
 *  a provider's error body can echo the request it rejected, and this app
 *  sends its API key as a URL query parameter. */
const MODEL_PHASE_ERROR = "The AI did not return an answer. Try again - your question is still here.";

/**
 * The whole offline answer, from recorded work.
 *
 * Reached from three places - a course with no Canvas link, a credential that
 * does not resolve, and a live read that failed - and it behaves identically
 * for all three. Only `connection` differs, which is exactly D20e's shape: one
 * code path, and the state travels as data.
 */
export async function answerOfflineAsk(args: OfflineAskArgs): Promise<AskHttpResult> {
  const connection = args.connection;
  const connectionNote = describeLmsConnection(connection);
  const coverage = {
    courses: [
      {
        index: 1,
        courseId: args.courseId,
        name: args.courseDisplayName,
        mode: courseReadMode(connection),
        connection,
      },
    ],
    coverageLines: describeCourseCoverage([{ name: args.courseDisplayName, connection }]),
    coverageComplete: true,
  };

  const prepared = prepareOfflineAsk({
    courseHubId: args.courseId,
    // A MARKER, NEVER THE NAME. `courseName` reaches ./offline-prompt's own
    // "Course:" line and its concern-turn lead sentence, both of which a
    // third-party model reads.
    courseName: args.promptLabel,
    rosterNames: args.rosterNames,
    studentRepos: args.studentRepos,
    payload: args.payload,
    question: args.questionForModel,
    concernThresholds: args.concernThresholds,
    engagementThresholds: args.engagementThresholds,
    connection,
    now: args.assembledAt,
    nonce: args.nonce,
  });

  if (prepared.status === "ambiguous") {
    // REFUSED, not guessed - the same rule as live, and the reason is stronger
    // offline: the identity IS a name match, so picking one would attribute
    // one student's recorded work to another with nothing on screen to show it
    // happened.
    return {
      status: 200,
      body: {
        status: "needs-disambiguation",
        connection,
        connectionNote,
        matchedText: prepared.matchedText,
        candidates: prepared.candidates.map((index) => ({ index, userId: null })),
        offlineStudents: prepared.students,
        students: prepared.students,
        ...coverage,
        message: `More than one student in "${args.courseDisplayName}" matches "${prepared.matchedText}". Ask again using that student's full name.`,
      },
    };
  }
  if (prepared.status === "multiple-students") {
    return {
      status: 200,
      body: {
        status: "too-many-students",
        connection,
        connectionNote,
        subjects: prepared.subjects.map((index) => ({ index, userId: null })),
        offlineStudents: prepared.students,
        students: prepared.students,
        ...coverage,
        message: "That question names more than one student. Ask about one student at a time.",
      },
    };
  }

  let answerText: string;
  try {
    answerText = await args.askModel(prepared.turns, prepared.subjectIndex === null);
  } catch (err) {
    console.error("[course-intel] offline model call did not complete:", args.describeError(err));
    return {
      status: 502,
      body: { status: "error", phase: "model", connection, connectionNote, error: MODEL_PHASE_ERROR },
    };
  }

  const citedStudents = parseCitedStudentMarkers(answerText, prepared.markedStudents);
  const answerMarkdown = args.stripSentinel(answerText);

  // THE RECEIPT (D1), unchanged offline: every row the model was handed must
  // appear in the answer, and a row it dropped is still rendered beside the
  // prose by the view.
  const rowsForReceipt =
    prepared.subjectIndex === null
      ? prepared.intel.concerns.rows.map((row) => row.studentIndex)
      : [prepared.subjectIndex];
  const unexplainedStudentIndices = rowsForReceipt.filter(
    (index) => !new RegExp(`\\bS${index}\\b`).test(answerMarkdown)
  );

  const subjectUserId =
    prepared.subjectIndex === null ? null : offlineAskUserIdForIndex(prepared.intel, prepared.subjectIndex);

  let entryId: string | null = null;
  let persistError: string | null = null;
  try {
    entryId = await args.persist({
      // "" WHENEVER THERE IS NO CACHED CANVAS ID, which offline is most of the
      // time. The column holds a Canvas user id as text and there is none to
      // hold - storing a borrowed or synthesised one would launder a
      // screen-read name into an id field (D22e). The cost is that such an
      // entry reads as whole-course in history; that is a known gap, and it is
      // the honest one.
      scopeStudent: subjectUserId === null ? "" : String(subjectUserId),
      answerMarkdown,
      citedStudents,
    });
  } catch (err) {
    persistError = args.describeError(err);
    console.error("[course-intel] could not persist the offline answer:", persistError);
  }

  return {
    status: 200,
    body: {
      status: "ok",
      connection,
      connectionNote,
      answerMarkdown,
      citedStudents,
      markedStudents: prepared.markedStudents,
      markedTexts: [],
      /** Index-to-name for this course's students, resolved from the roster on
       *  the course row. The MODEL never saw a name; the browser needs one to
       *  render the answer, and it has no Canvas roster to look one up in. */
      offlineStudents: prepared.students,
      /** The SAME field on every path, so the browser has one place to resolve
       *  an S marker from and no branch that could read the wrong one. */
      students: prepared.students,
      ...coverage,
      tier: "signals",
      assembledAt: args.assembledAt,
      omissions: [],
      coverageNotes: [...args.extraNotes, ...prepared.coverageNotes],
      /** D7/D15: the code-authored strip applies to every question shape that
       *  has a per-student signal check behind it - which is every shape except
       *  "what areas has X asked about", whose whole payload is that student's
       *  own writing. Decided HERE, where the shape is known, so the view never
       *  re-reads the question to guess. */
      showConcernStrip: !prepared.asksAboutWriting,
      concern: {
        rows:
          prepared.subjectIndex === null
            ? prepared.intel.concerns.rows
            : prepared.intel.concerns.rows.filter((row) => row.studentIndex === prepared.subjectIndex),
        clearCount: prepared.intel.concerns.clearCount,
        thresholds: prepared.intel.concerns.thresholds,
        unexplainedStudentIndices,
      },
      engagement: {
        needsOutreach: prepared.intel.engagement.needsOutreach,
        recovering: prepared.intel.engagement.recovering,
        insufficientData: prepared.intel.engagement.insufficientData,
        thresholds: prepared.intel.engagement.thresholds,
      },
      entryId,
      persistError,
    },
  };
}
