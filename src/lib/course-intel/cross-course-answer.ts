// course-intel: the whole cross-course answer, end to end, so the route
// handler above it stays a thin wrapper.
//
// The single-course path already lives in the route because it grew there.
// This one does not, for two reasons that are not stylistic: the route file is
// close to this repo's 1000-line ceiling, and - the reason that matters - the
// ordering rule D24d turns on (recorded courses first, live courses second,
// none started past the deadline) is behaviour, not plumbing. Behaviour that
// only exists inside a Next route handler cannot be tested for the promise it
// makes.
//
// WHAT STAYS IN THE ROUTE: credential resolution, the model client, and the
// response envelope. All three are injected here as functions, so this module
// reads no environment, opens no connection and knows no secret.
//
// WHAT THIS DELIBERATELY DOES NOT DO: persist to history. `course_intel`
// history rows are keyed to ONE course, and an answer spanning five courses
// has no honest value for that column - storing the first course's id would
// file a five-course answer under one course and make it reappear as that
// course's history later. So a cross-course answer is not stored, and
// `notes` says so rather than leaving the instructor to notice it is missing.
//
// EVERY ROW OF THE INSTRUCTOR'S RECORDED WORK IS OFFERED TO EVERY COURSE, and
// that is safe because `assembleOfflineCourseIntel` filters by EXACT course id
// with no fallback: a row tagged with another course, or with none, attaches to
// nothing. Filtering again here would be a second implementation of that rule
// that could disagree with the first about the same row.

import {
  assembleCrossCourseSlices,
  readLiveCourseSlice,
  readRecordedCourseSlice,
  type CrossCourseSlice,
  type CrossCourseTask,
} from "./cross-course";
import { buildCrossCourseContext, buildCrossCourseTurns, type CrossCourseContext } from "./cross-course-prompt";
import { renderCourseMarker } from "./course-scope";
import { parseCitedStudentMarkers } from "./prompt";
import { lmsCourseNotLinked, LIVE_LMS_CONNECTION } from "./connection";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import { parseRosterNames } from "@/app/components/grading-recording/grading-course-roster";
import type { AskHttpResult } from "./offline-answer";
import type { Course } from "@/lib/supabase/courses.types";
import type { CourseIntelSignalReaders } from "./fetch";
import type { OfflineStudentRepoRef } from "./offline-identity";
import type { ParsedOfflinePayload } from "./offline-payload";
import type { EngagementThresholds } from "./engagement";
import type { MarkedStudent } from "./context-block";
import type { LlmContent } from "@/lib/llm";
import type { ConcernThresholds, LmsConnection, StudentIndex } from "./types";

/** One of the instructor's courses, as this module needs to see it. */
export interface CrossCourseCourseInput {
  /** The course_hub row id. */
  readonly courseId: string;
  /** For the instructor's own browser and the coverage statement. Never a
   *  prompt - see ./course-scope's header. */
  readonly name: string;
  /** From `parseRosterNames(course.roster)`, read from the COURSE ROW rather
   *  than trusted from the request: a client-supplied roster would let a
   *  caller invent students to attribute recorded work to. */
  readonly rosterNames: readonly string[];
  readonly studentRepos: readonly OfflineStudentRepoRef[];
  /** Null when this course has no usable Canvas link, in which case its
   *  recorded slice is the complete answer for it and nothing was missed. */
  readonly live: {
    readonly institution: string;
    readonly canvasCourseId: string;
    /** Resolves credentials and builds the readers. May throw; the throw is
     *  classified per course rather than failing the whole answer. */
    readonly makeReaders: () => Promise<CourseIntelSignalReaders>;
  } | null;
  /** Why there is no live read, when there is none. Rendered to the
   *  instructor, so it names which half of the link is absent. */
  readonly notLinkedDetail: string;
}

export interface CrossCourseAnswerArgs {
  /** In the instructor's own list order - that order IS the C-marker order. */
  readonly courses: readonly CrossCourseCourseInput[];
  readonly payload: ParsedOfflinePayload;
  /** Course names and student names already rewritten to markers, and already
   *  asserted free of both by the caller. */
  readonly questionForModel: string;
  readonly concernThresholds: ConcernThresholds;
  readonly engagementThresholds: EngagementThresholds;
  /** ISO. A parameter, never a clock read here. */
  readonly assembledAt: string;
  readonly nonce: string;
  readonly deadlineAtMs: number;
  readonly perCourseWaitMs: number;
  readonly now: () => number;
  readonly withDeadline: <T>(work: Promise<T>, ms: number, label: string) => Promise<T>;
  readonly classifyLiveFailure: (error: unknown) => LmsConnection;
  /** Returns the model's text, or throws. The route owns the client, the
   *  provider choice and the generation budget. */
  readonly askModel: (turns: readonly LlmContent[]) => Promise<string>;
  /** Strips the machine citation sentinel off the prose. Injected rather than
   *  re-implemented so the two paths cannot disagree about what a sentinel is. */
  readonly stripSentinel: (text: string) => string;
}

export interface CrossCourseAnswerBody {
  readonly answerMarkdown: string;
  readonly citedStudents: readonly MarkedStudent[];
  readonly context: CrossCourseContext;
  /** D1's receipt, at answer-wide indices: rows the model was handed and did
   *  not write about. Rendered beside the prose, so a dropped row is still on
   *  screen. */
  readonly unexplainedStudentIndices: readonly StudentIndex[];
  /** Code-authored sentences about what this answer could not see or could not
   *  do. Never a sentence a model produced. */
  readonly notes: readonly string[];
}

const HISTORY_NOTE =
  "This answer covers more than one course, so it was not saved to any single course's history.";

function buildTask(
  args: CrossCourseAnswerArgs,
  course: CrossCourseCourseInput,
  position: number
): CrossCourseTask {
  const notLinked: LmsConnection = lmsCourseNotLinked(course.notLinkedDetail);

  const readRecorded = (): CrossCourseSlice =>
    readRecordedCourseSlice({
      name: course.name,
      connection: notLinked,
      sources: {
        courseHubId: course.courseId,
        rosterNames: course.rosterNames,
        studentRepos: course.studentRepos,
        gradingRows: args.payload.gradingRows,
        replyRows: args.payload.replyRows,
        assessmentDeclarations: args.payload.assessmentDeclarations,
        toolDeclarations: args.payload.toolDeclarations,
        recordingTool: args.payload.recordingTool,
        concernThresholds: args.concernThresholds,
        engagementThresholds: args.engagementThresholds,
        now: args.assembledAt,
      },
    });

  const live = course.live;
  return {
    courseId: course.courseId,
    readRecorded,
    readLive: live
      ? async () =>
          readLiveCourseSlice({
            courseId: course.courseId,
            name: course.name,
            institution: live.institution,
            canvasCourseId: live.canvasCourseId,
            // A MARKER, never the course's real name. The assembly's own
            // `courseName` is rendered straight into the signals block by
            // ./context-block, and this path builds its own block anyway - so
            // there is no call site in this feature where the real name would
            // be anything but a leak.
            promptLabel: renderCourseMarker(position + 1),
            assembledAt: args.assembledAt,
            readers: await live.makeReaders(),
            thresholds: args.concernThresholds,
          })
      : null,
  };
}

/** Sentences about what the intake dropped on the way in. Counts only, never
 *  values and never a name - the same discipline the single-course path's own
 *  coverage notes follow. */
function intakeNotes(payload: ParsedOfflinePayload): string[] {
  const notes: string[] = [];
  const intake = payload.intake;
  if (!intake.payloadPresent) {
    notes.push(
      "This browser sent no recorded work at all, so any course without a live LMS read contributed only its roster."
    );
    return notes;
  }
  if (intake.gradingRowsOverCap > 0) {
    notes.push(
      `${intake.gradingRowsOverCap} recorded grading rows were over this request's row limit and were not used.`
    );
  }
  if (intake.replyRowsOverCap > 0) {
    notes.push(
      `${intake.replyRowsOverCap} recorded discussion rows were over this request's row limit and were not used.`
    );
  }
  if (intake.gradingRowsUnreadable > 0 || intake.replyRowsUnreadable > 0) {
    notes.push(
      `${intake.gradingRowsUnreadable + intake.replyRowsUnreadable} recorded rows could not be read and were not used.`
    );
  }
  return notes;
}

/**
 * Build one answer over many courses.
 *
 * The order of the steps is D24d's, and it is the whole point: the recorded
 * slices for EVERY course are built before any live read starts, so the
 * cheapest half of the answer is always complete and only live work is ever
 * what a deadline cuts.
 */
export async function buildCrossCourseAnswer(args: CrossCourseAnswerArgs): Promise<CrossCourseAnswerBody> {
  const slices = await assembleCrossCourseSlices({
    tasks: args.courses.map((course, position) => buildTask(args, course, position)),
    deadlineAtMs: args.deadlineAtMs,
    perCourseWaitMs: args.perCourseWaitMs,
    now: args.now,
    withDeadline: args.withDeadline,
    classifyLiveFailure: args.classifyLiveFailure,
  });

  const context = buildCrossCourseContext({ slices, nonce: args.nonce });
  const turns = buildCrossCourseTurns({
    contextBlock: context.text,
    nonce: args.nonce,
    questionForModel: args.questionForModel,
    courseCount: context.courses.length,
    superlative: context.superlative,
  });

  const answerText = await args.askModel(turns);
  const citedStudents = parseCitedStudentMarkers(answerText, context.markedStudents);
  const answerMarkdown = args.stripSentinel(answerText);

  // THE RECEIPT (D1), unchanged across courses: the model was told to explain
  // every row it was handed, and a row it dropped is still rendered beside the
  // prose by the view.
  const unexplainedStudentIndices = context.concernRows
    .filter((row) => !new RegExp(`\\bS${row.studentIndex}\\b`).test(answerMarkdown))
    .map((row) => row.studentIndex);

  const notes = [...intakeNotes(args.payload)];
  if (context.omittedConcernRows > 0) {
    notes.push(
      `${context.omittedConcernRows} further students with a concern signal were left out of this answer because the list would have been too long, so the list above is not complete.`
    );
  }
  notes.push(HISTORY_NOTE);

  return { answerMarkdown, citedStudents, context, unexplainedStudentIndices, notes };
}

// ---------------------------------------------------------------------------
// The HTTP shape. Kept beside the builder rather than in the route for the
// same reason the builder is: the route file is at this repo's size ceiling,
// and a response envelope assembled inside a Next handler cannot be inspected
// by a test.
// ---------------------------------------------------------------------------

export interface CrossCourseAskArgs
  extends Omit<CrossCourseAnswerArgs, "courses" | "questionForModel"> {
  /** The course rows in scope, already narrowed and in the instructor's own
   *  list order - that order IS the C-marker order. */
  readonly courseRows: readonly Course[];
  readonly questionForModel: string;
  /** Which of D24c's scopes produced this answer, echoed back so the view can
   *  say whether one course or all of them were asked about. */
  readonly scopeKind: string;
  /** Coverage sentences the caller already composed, such as the in-session
   *  tiebreak note. Merged ahead of this path's own. */
  readonly extraNotes: readonly string[];
  /** Resolves credentials and builds the SIGNAL readers for one course. Only
   *  the signal set exists here, which is what makes D24d's "no student text"
   *  structural rather than a rule to remember. */
  readonly makeSignalReaders: (
    course: Course,
    institution: string,
    canvasCourseId: string
  ) => Promise<CourseIntelSignalReaders>;
  readonly describeError: (error: unknown) => string;
}

const MODEL_PHASE_ERROR = "The AI did not return an answer. Try again - your question is still here.";

/** Map one course row onto this module's input, deciding whether it has a live
 *  read at all. */
function toCourseInput(row: Course, args: CrossCourseAskArgs): CrossCourseCourseInput {
  const institution = (row.institution ?? "").trim();
  const canvasCourseId = parseCanvasCourseId(row.canvasUrl ?? "");
  return {
    courseId: row.id,
    name: row.name,
    rosterNames: parseRosterNames(row.roster),
    studentRepos: row.studentRepos ?? [],
    live:
      institution && canvasCourseId
        ? {
            institution,
            canvasCourseId,
            makeReaders: () => args.makeSignalReaders(row, institution, canvasCourseId),
          }
        : null,
    notLinkedDetail: !institution
      ? "Set an institution on the course tile to read this course from Canvas."
      : 'Add a Canvas course URL containing "/courses/<number>" on the course tile to read this course from Canvas.',
  };
}

/**
 * The cross-course answer, as a status and a body.
 *
 * EVERY LMS FAILURE IS ALREADY CLASSIFIED PER COURSE and never reaches the
 * catch below, so what remains is the model call or a fault in this code. That
 * is why the failure reported is the model phase: by the time anything can
 * throw here, the course reads are done and their outcomes are already facts in
 * the coverage statement.
 */
export async function crossCourseAskResponse(args: CrossCourseAskArgs): Promise<AskHttpResult> {
  let answer: CrossCourseAnswerBody;
  try {
    answer = await buildCrossCourseAnswer({
      ...args,
      courses: args.courseRows.map((row) => toCourseInput(row, args)),
    });
  } catch (err) {
    console.error("[course-intel] cross-course answer did not complete:", args.describeError(err));
    return { status: 502, body: { status: "error", phase: "model", error: MODEL_PHASE_ERROR } };
  }

  const context = answer.context;
  const notLive = context.courses.find((entry) => entry.connection.state !== "live");
  return {
    status: 200,
    body: {
      status: "ok",
      scope: args.scopeKind,
      // No single mode line across courses - the per-course coverage block is
      // the honest form of it, and the view renders that whether or not
      // anything failed (D24e).
      connection: notLive ? notLive.connection : LIVE_LMS_CONNECTION,
      connectionNote: "",
      answerMarkdown: answer.answerMarkdown,
      citedStudents: answer.citedStudents,
      markedStudents: context.markedStudents,
      markedTexts: [],
      students: context.students,
      courses: context.courses.map((entry) => ({
        index: entry.index,
        courseId: entry.courseId,
        name: entry.name,
        mode: entry.mode,
        connection: entry.connection,
      })),
      coverageLines: context.coverageLines,
      coverageComplete: context.superlative === "complete",
      tier: "signals",
      assembledAt: args.assembledAt,
      omissions: [],
      coverageNotes: [...args.extraNotes, ...answer.notes],
      showConcernStrip: true,
      concern: {
        rows: context.concernRows,
        clearCount: context.clearCount,
        thresholds: args.concernThresholds,
        unexplainedStudentIndices: answer.unexplainedStudentIndices,
      },
      // Never persisted: a history row is keyed to ONE course and this answer
      // is not about one. `coverageNotes` says so rather than letting the
      // instructor discover the gap later.
      entryId: null,
      persistError: null,
    },
  };
}
