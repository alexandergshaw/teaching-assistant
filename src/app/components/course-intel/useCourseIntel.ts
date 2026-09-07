"use client";

// Course Intel - state and data flow for a view that is ONE TEXTBOX (D24 of
// docs/course-student-intelligence-acceptance-criteria.md).
//
// WHAT LEFT THIS FILE, and why it is a deletion rather than a move. There is
// no course picker any more, so there is no selected course, so:
//   - the course list loader is gone. Nothing here picks a course; the server
//     resolves it from the question against the instructor's own list, which
//     is the only place that can also refuse a collision and say which terms
//     collided.
//   - THE CANVAS ROSTER FETCH IS GONE. It existed to turn a cited index back
//     into a name, and it could only be issued because a course was selected.
//     The server now returns `students` (index to name) on EVERY path, the way
//     the offline path already did - so the resolution is one implementation
//     instead of two, and an answer spanning five courses resolves the same
//     way a single-course one does. Sending the instructor their own roster
//     back to their own browser is not a disclosure: the boundary this feature
//     protects is the MODEL, which is shown indices and nothing else.
//   - the per-course draft question is gone with the per-course state it hung
//     off. One box, one draft.
//
// TWO MARKER VOCABULARIES NOW, NOT ONE. The model writes `S3` for a student
// and `C2` for a course, and this hook resolves both locally. A course name in
// a prompt is a disclosure and a false precision at once (see
// src/lib/course-intel/course-scope.ts), so the server rewrites course names
// out of the question before it is sent and passes markers where a name would
// have gone - which means the prose can come back carrying markers this file
// has to put names back into.
//
// AN ANSWER MAY SPAN COURSES, so a student index is unique within the ANSWER
// and not within one course, and a display name may collide ACROSS courses as
// easily as within one. `buildNameByIndex` disambiguates by the student's own
// course first, because that is what actually distinguishes them, and falls
// back to the Canvas id or the roster position only when it does not.
//
// ONE PATH THAT DEGRADES (D20e). This hook does not ask whether Canvas is
// reachable and offers no mode switch. It sends the question and the
// instructor's own recorded work on every request; the route answers live
// where it can and from the recorded work where it cannot, and says which per
// COURSE (D24f) in `courses`, rendered as the coverage block the view always
// shows.

import { useEffect, useState } from "react";
import { deserializeGradingRows } from "@/app/components/grading-recording/grading-row-serialization";
import { deserializeGradingDeclarations } from "@/app/components/grading-recording/useGradingAssessmentDeclarations";
import { deserializeReplyTable } from "@/app/components/recording/discussion-serialization";
import type {
  AssemblyOmission,
  AssemblyTier,
  CanvasUserId,
  ConcernSignal,
  LmsConnection,
  StudentIndex,
} from "@/lib/course-intel/types";
import { loadCourseIntelQuestion, persistCourseIntelQuestion } from "./courseIntelUiState";

/**
 * The scope key the single draft question is stored under.
 *
 * `courseIntelUiState`'s question helpers are keyed by a string because they
 * were written for a per-course draft, and a blank key is a deliberate no-op
 * there. With one box there is one draft, so it gets one constant key rather
 * than a new pair of functions in a module this change does not own.
 */
const QUESTION_SCOPE = "all-courses";

// ---------------------------------------------------------------------------
// The recorded tables this browser holds (D21d).
//
// THESE THREE KEYS ARE OWNED ELSEWHERE and are read here rather than
// re-declared: useGradingRows.ts, useReplyRows.ts and
// useGradingAssessmentDeclarations.ts each own one, each already has its own
// directory canary asserting the literal is wired to a read AND a write, and
// none of them exports it. A rename over there would silently make every
// offline answer here read as "you have recorded nothing", which is the
// confidently-wrong output shape this whole feature exists to avoid - so
// courseIntelOfflineTables.test.ts reads all three source files and fails if
// any of these three literals stops appearing in the module that owns it.
// ---------------------------------------------------------------------------

const OFFLINE_GRADING_TABLE_KEY = "ta-rec-grade-table";
const OFFLINE_REPLY_TABLE_KEY = "ta-rec-disc-table";
const OFFLINE_DECLARATIONS_KEY = "ta-rec-grade-declarations";

function readLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // A browser with site data blocked, or a private window. An offline answer
    // built from nothing still says so - the route's coverage notes report an
    // empty payload as "this browser sent no recorded work at all", which is
    // deliberately a different sentence from "this course has nothing
    // recorded in it".
    return null;
  }
}

/** The projection this hook sends. Six fields off a grading row and four off
 *  a reply row - the only ones the offline mapping reads. THE PROSE IS NEVER
 *  SENT: `submissionText`, `post`, `reply`, `strengths`, `improvements` and
 *  `overallComment` are not in these shapes, so a student's written work
 *  never leaves the browser for a question about their grades. The route
 *  refuses them at its own boundary too (offline-payload.ts); this is the
 *  same rule applied at the earlier of the two. */
interface OfflineGradingRowWire {
  course?: string;
  studentName: string;
  assessment?: string;
  totalScore: string;
  submissionTimeStatus?: string;
  submittedAt?: string;
}

interface OfflineReplyRowWire {
  course?: string;
  author: string;
  threadPosition?: string;
  postedAt?: string;
}

interface OfflineRecordedWire {
  gradingRows: OfflineGradingRowWire[];
  replyRows: OfflineReplyRowWire[];
  assessmentDeclarations: { courseId: string; assessmentId: string; assessmentLabel: string; workKind: string; deadline: string }[];
  toolDeclarations: { courseId: string; workKind: string; tool: string }[];
}

/**
 * EVERY ROW TRAVELS NOW, tagged with the course it was recorded against.
 *
 * The old filter kept rows belonging to a DIFFERENT course at home, which was
 * right when a picker had already chosen one course: a row that could never
 * join was disclosure for no purpose. With the picker gone this browser does
 * not know which course the question is about - that is the server's decision,
 * made from the question - and a question about all of them needs all of them.
 *
 * The rows are still only ever adopted by EXACT course id, by
 * `assembleOfflineCourseIntel`, with no fallback: a row tagged with another
 * course, or with none, attaches to nothing. So an untagged row still travels
 * and is still counted as work that has not been attributed yet, which is the
 * sentence that tells an instructor there is something to go and tag.
 */
export function readOfflineRecordedTables(): OfflineRecordedWire {
  const empty: OfflineRecordedWire = { gradingRows: [], replyRows: [], assessmentDeclarations: [], toolDeclarations: [] };
  if (typeof window === "undefined") return empty;

  const declarations = deserializeGradingDeclarations(readLocalStorage(OFFLINE_DECLARATIONS_KEY));

  return {
    gradingRows: deserializeGradingRows(readLocalStorage(OFFLINE_GRADING_TABLE_KEY)).map((row) => ({
      course: row.course,
      studentName: row.studentName,
      assessment: row.assessment,
      totalScore: row.totalScore,
      submissionTimeStatus: row.submissionTimeStatus,
      submittedAt: row.submittedAt,
    })),
    replyRows: deserializeReplyTable(readLocalStorage(OFFLINE_REPLY_TABLE_KEY)).map((row) => ({
      course: row.course,
      author: row.author,
      threadPosition: row.threadPosition,
      postedAt: row.postedAt,
    })),
    assessmentDeclarations: declarations.assessments,
    toolDeclarations: declarations.tools,
  };
}

// ---------------------------------------------------------------------------
// POST /api/course-intel/ask - the SHIPPED handler's own shapes.
// ---------------------------------------------------------------------------

interface CourseIntelAskRequestBody {
  /** THE ONLY THING THIS BROWSER CHOOSES. No course id: the question carries
   *  its own scope and the server resolves it (D24b). */
  question: string;
  offline: OfflineRecordedWire;
}

/** One row of the code-authored signal strip (D15). `userId` is NULLABLE
 *  because an offline row's student is matched by name against the course
 *  roster and usually has no Canvas id - never synthesised (D19f), and
 *  `identitySource` travels with it so a reader can tell a verified identity
 *  from a matched one. */
interface AskConcernRow {
  studentIndex: StudentIndex;
  userId: CanvasUserId | null;
  signals: readonly ConcernSignal[];
}

/** Index-to-name for one student, at the ANSWER's own index. `courseIndex` is
 *  present when the answer spans courses, and is what tells two same-named
 *  students in different courses apart. */
interface AskStudent {
  index: StudentIndex;
  name: string;
  userId: CanvasUserId | null;
  courseIndex?: number;
}

/** One course in the answer, and how it was read (D24f). */
export interface AskCourse {
  index: number;
  courseId: string;
  name: string;
  mode: "live" | "recorded" | "lms-unavailable";
  connection: LmsConnection;
}

interface CourseIntelAskResponseBody {
  status?: unknown;
  scope?: unknown;
  answerMarkdown?: unknown;
  citedStudents?: { index: StudentIndex; userId: CanvasUserId | null }[];
  students?: AskStudent[];
  offlineStudents?: AskStudent[];
  courses?: AskCourse[];
  coverageLines?: string[];
  coverageComplete?: unknown;
  tier?: unknown;
  assembledAt?: unknown;
  connection?: LmsConnection;
  connectionNote?: unknown;
  omissions?: AssemblyOmission[];
  coverageNotes?: string[];
  /** Whether the code-authored signal strip applies to this question shape at
   *  all (D15). `concernRows` empty WITH this true means "checked, found
   *  nothing" and gets D15's empty-case prose; false means "not applicable",
   *  and neither the strip nor that sentence is rendered. Collapsing the two
   *  into a bare empty array would render the wrong one. */
  showConcernStrip?: unknown;
  concern?: {
    rows?: AskConcernRow[];
    clearCount?: number;
    unexplainedStudentIndices?: StudentIndex[];
  };
  entryId?: unknown;
  /** The refusal branches. */
  message?: unknown;
  persistError?: unknown;
  error?: unknown;
  phase?: unknown;
}

async function readJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** D17's two per-phase error sentences. `phase: "model"` is set only when the
 * request actually reached the model - the one case where "nothing was sent to
 * the AI" would be false. Absent, or any other value, is treated as a
 * pre-model failure: both the more common cause and the safer default to claim
 * when the server gives no signal either way. */
function describeAskFailure(body: unknown, fallbackMessage: string): string {
  const record = body && typeof body === "object" ? (body as CourseIntelAskResponseBody) : null;
  if (record?.phase === "model") {
    return "The AI did not return an answer. Try again - your question is still here.";
  }
  const message = record && typeof record.error === "string" && record.error.trim() ? record.error : fallbackMessage || "Something went wrong.";
  return message;
}

// ---------------------------------------------------------------------------
// Marker resolution (D13/D24g) - entirely local, never sent anywhere.
// ---------------------------------------------------------------------------

function countNames(names: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/**
 * Index-to-display-name for every student the answer could refer to.
 *
 * THE DISAMBIGUATOR IS CHOSEN BY WHAT ACTUALLY DISTINGUISHES THEM, in this
 * order:
 *   1. the COURSE, when the answer spans more than one and the two students
 *      are in different ones. Two Alex Chens in two courses are two ordinary
 *      students, not a collision to apologise for, and the course is the thing
 *      the instructor is already thinking in.
 *   2. the Canvas user id, when there is one - a real, verified id.
 *   3. the roster position, which offline is the only thing left and is the
 *      instructor's own list.
 * A bare shared name is never rendered: it would suggest the tool had picked
 * one of them.
 */
export function buildNameByIndex(
  students: readonly AskStudent[],
  courses: readonly AskCourse[]
): Map<StudentIndex, string> {
  const courseNameByIndex = new Map(courses.map((course) => [course.index, course.name.trim()]));
  const multiCourse = courses.length > 1;
  const nameCounts = countNames(students.map((student) => student.name));
  const nameAndCourseCounts = countNames(
    students.map((student) => `${student.name.trim()} ${student.courseIndex ?? 0}`)
  );

  const byIndex = new Map<StudentIndex, string>();
  for (const student of students) {
    const name = student.name.trim();
    if (!name) continue;
    if ((nameCounts.get(name) ?? 0) <= 1) {
      byIndex.set(student.index, multiCourse && courseNameByIndex.get(student.courseIndex ?? 0) ? `${name} (${courseNameByIndex.get(student.courseIndex ?? 0)})` : name);
      continue;
    }
    const course = courseNameByIndex.get(student.courseIndex ?? 0) ?? "";
    const uniqueInCourse = (nameAndCourseCounts.get(`${name} ${student.courseIndex ?? 0}`) ?? 0) <= 1;
    if (multiCourse && course && uniqueInCourse) {
      byIndex.set(student.index, `${name} (${course})`);
      continue;
    }
    const tail = student.userId !== null ? `Canvas user ${student.userId}` : `roster entry ${student.index}`;
    byIndex.set(student.index, course ? `${name} (${course}, ${tail})` : `${name} (${tail})`);
  }
  return byIndex;
}

/**
 * Replace every bare marker the model was instructed to write with the
 * locally-resolved label for it.
 *
 * `\b` word boundaries mean a token like "CS3110" is never touched (the
 * character before "S" there is a word character, so `\bS` cannot match) - but
 * this is a plain text substitution, not a parser, so a genuinely ambiguous
 * adjacent token is a known limitation. A marker whose index resolved to
 * nothing is left as literal text rather than replaced with an empty string,
 * which would delete the reference the sentence is built around.
 */
function substituteMarkers(
  markdown: string,
  letter: "S" | "C",
  labelByIndex: ReadonlyMap<number, string>
): string {
  if (labelByIndex.size === 0) return markdown;
  return markdown.replace(new RegExp(`\\b${letter}(\\d+)\\b`, "g"), (whole: string, digits: string) => {
    const label = labelByIndex.get(Number(digits));
    return label && label.trim() ? label : whole;
  });
}

export interface ResolvedConcernRow {
  studentIndex: StudentIndex;
  /** Already carries the course when the answer spans more than one - see
   *  buildNameByIndex. The signal strip renders this and nothing else, so the
   *  course cannot be printed twice on one row. */
  displayName: string;
  /** Code-authored, typed data straight from the server (D15) - rendered as
   * the badge row, never parsed out of the model's prose. */
  signals: readonly ConcernSignal[];
}

export interface ResolvedCourseIntelAnswer {
  /** The persisted history row's id, or "" when persistence failed OR when the
   *  answer spans courses and was deliberately not stored. */
  id: string;
  /** Raw markdown, every student and course marker already resolved to a real
   *  label - render through markdownToHtml at the call site. */
  answerMarkdown: string;
  tier: AssemblyTier;
  assembledAt: string;
  /** D20e's permanent line, for a single-course answer that was not live. ""
   *  otherwise - across courses the per-course coverage block below is the
   *  honest form of it, and one summary line would be wrong for a mixture. */
  connectionNote: string;
  connection: LmsConnection;
  /** D24e: WHICH courses this answer covered and how each was read. Rendered
   *  ALWAYS, not only when something failed - with no picker on screen it is
   *  also the only thing telling the instructor which course a question
   *  resolved to. */
  courses: readonly AskCourse[];
  coverageLines: readonly string[];
  /** False when the courses were not all read the same way, or one produced no
   *  numbers. The view says so rather than letting a ranking read as complete. */
  coverageComplete: boolean;
  /** Every "what this answer could not see" sentence, from both paths, as one
   *  list. AC6: what was left out is stated, never silently dropped. */
  notes: readonly string[];
  showConcernStrip: boolean;
  concernRows: readonly ResolvedConcernRow[];
  /** Rows the model was handed and did not explain (D1's receipt). Rendered
   *  beside the prose so a dropped row is still on screen. */
  unexplainedStudentIndices: readonly StudentIndex[];
  persistError: string | null;
}

const LIVE_CONNECTION: LmsConnection = { state: "live" };

function resolveCourseIntelAnswer(body: CourseIntelAskResponseBody): ResolvedCourseIntelAnswer {
  const students = body.students ?? body.offlineStudents ?? [];
  const courses = body.courses ?? [];
  const nameByIndex = buildNameByIndex(students, courses);
  const courseLabelByIndex = new Map(courses.map((course) => [course.index, course.name.trim()]));

  const concernRows = body.concern?.rows ?? [];
  const notes = [
    ...(body.omissions ?? []).map((omission) => omission.detail),
    ...(body.coverageNotes ?? []),
  ].filter((note) => typeof note === "string" && note.trim());

  const withNames = substituteMarkers(
    typeof body.answerMarkdown === "string" ? body.answerMarkdown : "",
    "S",
    nameByIndex
  );

  return {
    id: typeof body.entryId === "string" ? body.entryId : "",
    answerMarkdown: substituteMarkers(withNames, "C", courseLabelByIndex),
    tier: body.tier === "signals+text" ? "signals+text" : "signals",
    assembledAt: typeof body.assembledAt === "string" ? body.assembledAt : "",
    connection: body.connection ?? LIVE_CONNECTION,
    connectionNote: courses.length > 1 ? "" : typeof body.connectionNote === "string" ? body.connectionNote : "",
    courses,
    coverageLines: body.coverageLines ?? [],
    coverageComplete: body.coverageComplete !== false,
    notes,
    // The SERVER decides this, because the server knows the question's shape.
    // Defaulting to false when the field is absent is the safer half: a
    // missing strip is a smaller error than an empty-case sentence claiming
    // a check that was never run.
    showConcernStrip: body.showConcernStrip === true,
    concernRows: concernRows.map((row) => ({
      studentIndex: row.studentIndex,
      displayName: nameByIndex.get(row.studentIndex) ?? "",
      signals: row.signals,
    })),
    unexplainedStudentIndices: body.concern?.unexplainedStudentIndices ?? [],
    persistError: typeof body.persistError === "string" && body.persistError.trim() ? body.persistError : null,
  };
}

export interface UseCourseIntelReturn {
  question: string;
  setQuestion: (value: string) => void;
  asking: boolean;
  /** "" when not asking; one of D17's two phase strings otherwise. Rendered
   * inside the single role="status" region - see CourseIntelAnswer.tsx. */
  statusText: string;
  askError: string | null;
  /** A refusal rather than a failure: the question named a student who matches
   *  two roster entries, named more than one student, or named a course that
   *  runs in more than one term with none of them currently in session.
   *  Nothing was sent to the model. */
  askRefusal: string | null;
  lastAnswer: ResolvedCourseIntelAnswer | null;
  ask: () => void;
}

/** How long the "Gathering course data..." phase text shows before this hook
 * switches it to "Asking the AI..." (D17). This is a WALL-CLOCK HEURISTIC,
 * not a real signal: POST /api/course-intel/ask is one request/response (D3),
 * so nothing tells this hook when the server's own assembly phase actually
 * finished and the model call actually started. */
const GATHER_PHASE_HEURISTIC_MS = 1200;

export function useCourseIntel(): UseCourseIntelReturn {
  const [question, setQuestionState] = useState("");
  const [asking, setAsking] = useState(false);
  const [phase, setPhase] = useState<"gathering" | "asking">("gathering");
  const [askError, setAskError] = useState<string | null>(null);
  const [askRefusal, setAskRefusal] = useState<string | null>(null);
  const [lastAnswer, setLastAnswer] = useState<ResolvedCourseIntelAnswer | null>(null);

  // The persisted draft is read AFTER mount, never in a useState initializer:
  // this subtree is server-rendered, the initializer would return "" there,
  // and React would then keep the server's empty value through hydration with
  // only a warning - so the box would silently come back blank on reload. The
  // await is what keeps the setState out of the effect's synchronous body,
  // which react-hooks/set-state-in-effect forbids.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await Promise.resolve(loadCourseIntelQuestion(QUESTION_SCOPE));
      if (cancelled || !stored) return;
      setQuestionState((current) => (current ? current : stored));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setQuestion = (value: string) => {
    setQuestionState(value);
    persistCourseIntelQuestion(QUESTION_SCOPE, value);
  };

  const ask = () => {
    const trimmed = question.trim();
    if (!trimmed || asking) return;

    setAskError(null);
    setAskRefusal(null);
    setAsking(true);
    setPhase("gathering");
    let settled = false;
    const phaseTimer = setTimeout(() => {
      if (!settled) setPhase("asking");
    }, GATHER_PHASE_HEURISTIC_MS);

    const requestBody: CourseIntelAskRequestBody = {
      question: trimmed,
      // Sent on EVERY request, live or not. This hook cannot know whether
      // Canvas is reachable for any course, and asking it to find out first
      // would be a second round trip for the exact question the route answers
      // anyway.
      offline: readOfflineRecordedTables(),
    };

    void (async () => {
      try {
        const response = await fetch("/api/course-intel/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });
        settled = true;
        clearTimeout(phaseTimer);
        setAsking(false);

        const body = (await readJsonSafely(response)) as CourseIntelAskResponseBody | null;

        if (!response.ok) {
          setAskError(describeAskFailure(body, response.statusText));
          return;
        }
        // The refusals are 200s, not errors: nothing failed, the question was
        // not answerable as asked. The question STAYS in the box so rewording
        // it costs one edit rather than retyping.
        if (
          body?.status === "needs-disambiguation" ||
          body?.status === "too-many-students" ||
          body?.status === "needs-course-disambiguation"
        ) {
          setAskRefusal(
            typeof body.message === "string" && body.message.trim()
              ? body.message
              : "That question could not be narrowed down as asked."
          );
          return;
        }
        if (!body || body.status !== "ok") {
          setAskError(describeAskFailure(body, "The answer could not be read."));
          return;
        }

        setLastAnswer(resolveCourseIntelAnswer(body));
        // Never clear the question on error or on a refusal - only here, in
        // the success branch, after every other branch above has already
        // returned (D17): a retry costs one click, not retyping.
        setQuestionState("");
        persistCourseIntelQuestion(QUESTION_SCOPE, "");
      } catch (err) {
        settled = true;
        clearTimeout(phaseTimer);
        setAsking(false);
        setAskError(describeAskFailure(null, err instanceof Error ? err.message : "network error"));
      }
    })();
  };

  const statusText = asking ? (phase === "gathering" ? "Gathering course data..." : "Asking the AI...") : "";

  return { question, setQuestion, asking, statusText, askError, askRefusal, lastAnswer, ask };
}
