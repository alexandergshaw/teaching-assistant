"use client";

// Course Intel - state and data flow for the Course Intel view (D13-D17 and
// D20-D23 of docs/course-student-intelligence-acceptance-criteria.md). A
// per-course tool with its own internal course picker, modeled on
// src/app/components/repo-grades/useRepoGradesData.ts - see that file's own
// header for the effect idiom this hook follows throughout: a useEffect with
// a `let cancelled = false`, an async IIFE that AWAITS FIRST, an `if
// (cancelled) return` guard, and cleanup setting `cancelled = true`, with
// loading state DERIVED by comparing "the key of the request in flight"
// against "the key the last completed result belongs to" - never a
// synchronous setLoading(true), which react-hooks/set-state-in-effect
// forbids.
//
// THE WIRE CONTRACT BELOW IS NOW THE ROUTE'S OWN, not this file's guess at
// it. An earlier wave wrote these shapes ahead of POST
// /api/course-intel/ask existing, and the two ended up disagreeing about
// every field name: this hook posted `courseHubId` and the route reads
// `courseId`, so every ask answered "Pick a course first", and the response
// shapes never overlapped at all. They are aligned here against the shipped
// handler, which is the half with the implementation.
//
// ONE PATH THAT DEGRADES (D20e). This hook does not ask whether Canvas is
// reachable and does not offer a mode switch. It sends the question AND the
// instructor's own recorded work on every request; the route answers live
// when it can and from the recorded work when it cannot, and says which of
// the four states applies in `connectionNote`. A course with no Canvas link
// at all is a NORMAL course here (D20a) and is no longer blocked from
// asking - `courseNotConfiguredReason` below is now informational, never a
// gate.
//
// STUDENT IDENTITY (D13): the model is never shown a name or a login id - it
// sees indices only, and its prose refers to a student by writing the bare
// marker text "S<index>" (mirroring the existing page-citation convention in
// src/lib/knowledge-overview-prompt.ts, which asks the model to write "P1"
// without brackets). This hook is what turns that back into a real,
// disambiguated name, ENTIRELY LOCALLY. There are two sources for it and
// they are not interchangeable:
//   - LIVE: `citedStudents[].userId` is a real Canvas id, resolved against
//     the Canvas roster this hook already loaded for the picker. `loginId`
//     comes along on that same roster row and is used ONLY as a local
//     disambiguator for two students who genuinely share a display name - it
//     is never read into the request body, never stored, and never sent.
//   - OFFLINE: there is no Canvas roster and most students have no Canvas id
//     at all, so the route returns `offlineStudents`: index-to-name resolved
//     from the free-text roster on the course row. Sending that back to the
//     browser that typed it is not a disclosure - the boundary this feature
//     protects is the MODEL - and it is safer than re-deriving the mapping
//     here, which would be a second implementation that could drift by one
//     and put an answer about S4 beside S5's name.
//
// The resolved, human-readable markdown is what this hook hands back
// (`ResolvedCourseIntelAnswer.answerMarkdown`) - CourseIntelAnswer.tsx renders
// it through markdownToHtml AT RENDER TIME, exactly like
// useKnowledgeOverview.ts keeps raw markdown and KnowledgeOverviewPanel.tsx
// calls renderOverviewMarkdown itself, rather than this hook storing
// pre-rendered HTML.

import { useEffect, useRef, useState } from "react";
import { listCourseHubAction, listCourseRosterAction } from "@/app/actions";
import type { Course } from "@/lib/supabase/courses";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import type { CanvasRosterEntry } from "@/lib/canvas";
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
  StudentIdentitySource,
} from "@/lib/course-intel/types";
import { loadCourseIntelCourseId, loadCourseIntelQuestion, persistCourseIntelCourseId, persistCourseIntelQuestion } from "./courseIntelUiState";

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
 * Which rows travel: this course's own, PLUS the ones tagged with no course
 * at all.
 *
 * Rows belonging to a DIFFERENT course are withheld - they can never join
 * here and sending them would be disclosure for no purpose. Untagged rows
 * ARE sent even though they cannot join either, and that is the point: the
 * route counts them and the answer says "N grading rows in this browser are
 * not tagged with this course and were not used", which is the sentence that
 * tells an instructor there is work to go and attribute. Filtering them out
 * here would make that notice permanently silent.
 */
function belongsToOfflineScope(rowCourse: string | undefined, courseHubId: string): boolean {
  return !rowCourse || rowCourse === courseHubId;
}

export function readOfflineRecordedTables(courseHubId: string): OfflineRecordedWire {
  const empty: OfflineRecordedWire = { gradingRows: [], replyRows: [], assessmentDeclarations: [], toolDeclarations: [] };
  if (typeof window === "undefined" || !courseHubId) return empty;

  const declarations = deserializeGradingDeclarations(readLocalStorage(OFFLINE_DECLARATIONS_KEY));

  return {
    gradingRows: deserializeGradingRows(readLocalStorage(OFFLINE_GRADING_TABLE_KEY))
      .filter((row) => belongsToOfflineScope(row.course, courseHubId))
      .map((row) => ({
        course: row.course,
        studentName: row.studentName,
        assessment: row.assessment,
        totalScore: row.totalScore,
        submissionTimeStatus: row.submissionTimeStatus,
        submittedAt: row.submittedAt,
      })),
    replyRows: deserializeReplyTable(readLocalStorage(OFFLINE_REPLY_TABLE_KEY))
      .filter((row) => belongsToOfflineScope(row.course, courseHubId))
      .map((row) => ({
        course: row.course,
        author: row.author,
        threadPosition: row.threadPosition,
        postedAt: row.postedAt,
      })),
    assessmentDeclarations: declarations.assessments.filter((a) => a.courseId === courseHubId),
    toolDeclarations: declarations.tools.filter((t) => t.courseId === courseHubId),
  };
}

// ---------------------------------------------------------------------------
// POST /api/course-intel/ask - the SHIPPED handler's own shapes.
// ---------------------------------------------------------------------------

interface CourseIntelAskRequestBody {
  /** The course_hub row id - never the Canvas numeric id (D13/S18). Spelled
   *  `courseId` because that is what the route reads. */
  courseId: string;
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
  identitySource: StudentIdentitySource;
  signals: readonly ConcernSignal[];
}

interface AskOfflineStudent {
  index: StudentIndex;
  name: string;
  userId: CanvasUserId | null;
}

interface CourseIntelAskResponseBody {
  status?: unknown;
  answerMarkdown?: unknown;
  citedStudents?: { index: StudentIndex; userId: CanvasUserId | null }[];
  offlineStudents?: AskOfflineStudent[];
  tier?: unknown;
  assembledAt?: unknown;
  /** Which of the four states this answer was built in. `describeLmsConnection`
   *  already rendered the sentence into `connectionNote`; the structured value
   *  travels beside it so the view never re-derives the copy. */
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
  /** The persisted history row's id, or null when persistence failed. */
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
 * request actually reached the model - the one case where "nothing was sent
 * to the AI" would be false. Absent, or any other value, is treated as a
 * pre-model failure: both the more common cause and the safer default to
 * claim when the server gives no signal either way. */
function describeAskFailure(body: unknown, fallbackMessage: string): string {
  const record = body && typeof body === "object" ? (body as CourseIntelAskResponseBody) : null;
  if (record?.phase === "model") {
    return "The AI did not return an answer. Try again - your question is still here.";
  }
  const message = record && typeof record.error === "string" && record.error.trim() ? record.error : fallbackMessage || "Something went wrong.";
  return message;
}

// ---------------------------------------------------------------------------
// Student identity resolution (D13) - entirely local, never sent anywhere.
// ---------------------------------------------------------------------------

/** Computed once per roster (D13: "computed once from the roster"). Reads
 * `.name` (Canvas's own `user.name`, "First Last") - CourseStudentRecord's
 * own doc comment in types.ts marks that field "Display only", sourced from
 * the same roster/enrollments call as `.sortableName`; both are safe, unlike
 * a discussion participant record's self-supplied display_name, which this
 * roster never touches at all (listCourseRosterAction hits the course's
 * `/users` roster endpoint, not a discussion thread). */
function computeCollidingNames(names: readonly string[]): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const colliding = new Set<string>();
  for (const [name, count] of counts) {
    if (count > 1) colliding.add(name);
  }
  return colliding;
}

/** Resolves one Canvas user id to a display name, appending a disambiguator
 * ONLY when that name collides with another student in this course (D13).
 * `loginId` is used here PURELY as a local string - it is read from the
 * roster row this hook already loaded for the picker and never leaves this
 * function's return value, never enters a request body, and is never
 * stored. A user id not found on the roster is a real, nameable case
 * (types.ts's `onRoster` doc comment: a dropped student, a TA, an observer -
 * never silently merged into somebody else and never silently discarded). */
function resolveLiveStudentName(
  userId: CanvasUserId | null,
  roster: readonly CanvasRosterEntry[],
  collidingNames: ReadonlySet<string>
): string {
  if (userId === null) return "";
  const entry = roster.find((r) => Number(r.id) === userId);
  if (!entry) return `Student ${userId} (not on the current roster)`;
  const name = entry.name.trim() || `Student ${userId}`;
  if (!collidingNames.has(name)) return name;
  return entry.loginId.trim() ? `${name} (${entry.loginId.trim()})` : `${name} (Canvas user ${userId})`;
}

/**
 * Index-to-name for an OFFLINE answer, from the roster the route resolved.
 *
 * Two students who share a name are a real and uncommon case that the offline
 * identity index already reports rather than merges (D21c) - they carry no
 * join key and attribute nothing - so a bare shared name on screen would
 * suggest the tool had picked one of them. The roster position is appended
 * instead: it is the only thing that actually distinguishes the two entries,
 * and it is the instructor's own list.
 */
function buildOfflineNameByIndex(students: readonly AskOfflineStudent[]): Map<StudentIndex, string> {
  const colliding = computeCollidingNames(students.map((s) => s.name));
  const byIndex = new Map<StudentIndex, string>();
  for (const student of students) {
    const name = student.name.trim();
    if (!name) continue;
    byIndex.set(student.index, colliding.has(name) ? `${name} (roster entry ${student.index})` : name);
  }
  return byIndex;
}

/**
 * Replaces every bare "S<digits>" marker the model was instructed to write
 * (mirroring the page-citation convention's bracket-free "P1" - see this
 * file's header) with the locally-resolved display name for that index.
 * `\b` word boundaries mean a token like "CS3110" is never touched (the
 * character before "S" there is a word character, so `\bS` cannot match
 * there) - but this is a plain text substitution, not a parser, so a
 * genuinely ambiguous adjacent token is a known limitation (see this
 * feature's wave report). A marker whose index resolved to nothing is left
 * as literal text rather than replaced with an empty string, which would
 * delete the reference the sentence is built around.
 */
function substituteStudentMarkers(markdown: string, nameByIndex: ReadonlyMap<StudentIndex, string>): string {
  if (nameByIndex.size === 0) return markdown;
  return markdown.replace(/\bS(\d+)\b/g, (whole: string, digits: string) => {
    const name = nameByIndex.get(Number(digits));
    return name && name.trim() ? name : whole;
  });
}

export interface ResolvedConcernRow {
  studentIndex: StudentIndex;
  displayName: string;
  /** Code-authored, typed data straight from the server (D15) - rendered as
   * the badge row, never parsed out of the model's prose. */
  signals: readonly ConcernSignal[];
}

export interface ResolvedCourseIntelAnswer {
  /** The persisted history row's id, or "" when persistence failed. */
  id: string;
  /** Raw markdown, student markers already resolved to display names - render
   * through markdownToHtml at the call site (see file header). */
  answerMarkdown: string;
  tier: AssemblyTier;
  assembledAt: string;
  /**
   * D20e's permanent line. "" for a live answer, and the view renders
   * nothing then; otherwise the one sentence naming WHICH of the three
   * unavailable states applies and what it means for this answer. Never
   * dismissible, and re-derived on every answer rather than remembered.
   */
  connectionNote: string;
  connection: LmsConnection;
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

function resolveCourseIntelAnswer(
  body: CourseIntelAskResponseBody,
  roster: readonly CanvasRosterEntry[]
): ResolvedCourseIntelAnswer {
  const offlineStudents = body.offlineStudents ?? [];
  const offlineNames = buildOfflineNameByIndex(offlineStudents);
  const liveColliding = computeCollidingNames(roster.map((entry) => entry.name));

  // Offline first, and never both: an offline answer's `userId` is null for
  // most students, so a live lookup would resolve nothing and blank the
  // marker. The two sources are alternatives, not a fallback chain.
  const nameFor = (index: StudentIndex, userId: CanvasUserId | null): string =>
    offlineNames.size > 0 ? (offlineNames.get(index) ?? "") : resolveLiveStudentName(userId, roster, liveColliding);

  const nameByIndex = new Map<StudentIndex, string>();
  // OFFLINE, SEED EVERY STUDENT, not only the cited ones. The sentinel line
  // the citation contract asks for is the model's to write and it sometimes
  // is not there (truncated, or simply skipped) - live that costs a citation
  // chip, but offline it would leave bare "S3" markers in the prose, because
  // the prose is the only place an offline student is ever named. The browser
  // already holds this whole mapping, so resolving all of it costs nothing.
  for (const student of offlineStudents) nameByIndex.set(student.index, offlineNames.get(student.index) ?? "");
  for (const cited of body.citedStudents ?? []) nameByIndex.set(cited.index, nameFor(cited.index, cited.userId));

  const concernRows = body.concern?.rows ?? [];
  const notes = [
    ...(body.omissions ?? []).map((omission) => omission.detail),
    ...(body.coverageNotes ?? []),
  ].filter((note) => typeof note === "string" && note.trim());

  return {
    id: typeof body.entryId === "string" ? body.entryId : "",
    answerMarkdown: substituteStudentMarkers(typeof body.answerMarkdown === "string" ? body.answerMarkdown : "", nameByIndex),
    tier: body.tier === "signals+text" ? "signals+text" : "signals",
    assembledAt: typeof body.assembledAt === "string" ? body.assembledAt : "",
    connection: body.connection ?? LIVE_CONNECTION,
    connectionNote: typeof body.connectionNote === "string" ? body.connectionNote : "",
    notes,
    // The SERVER decides this, because the server knows the question's shape.
    // Defaulting to false when the field is absent is the safer half: a
    // missing strip is a smaller error than an empty-case sentence claiming
    // a check that was never run.
    showConcernStrip: body.showConcernStrip === true,
    concernRows: concernRows.map((row) => ({
      studentIndex: row.studentIndex,
      displayName: nameFor(row.studentIndex, row.userId),
      signals: row.signals,
    })),
    unexplainedStudentIndices: body.concern?.unexplainedStudentIndices ?? [],
    persistError: typeof body.persistError === "string" && body.persistError.trim() ? body.persistError : null,
  };
}

// ---------------------------------------------------------------------------
// Course list - a private, minimal copy of the same
// listCourseHubAction-backed loader useRepoGradesData.ts's own useCourses()
// uses. Each per-course feature in this codebase keeps its own copy of this
// small loader rather than sharing one (see e.g. useCoursesData.ts's own,
// much heavier, Courses-tab-specific version) - duplicated here rather than
// imported from repo-grades, which is a private, unexported local hook.
// ---------------------------------------------------------------------------

function useCourses(): { courses: Course[]; loading: boolean; error: string | null } {
  const [result, setResult] = useState<{ data: Course[]; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listCourseHubAction();
      if (cancelled) return;
      if ("error" in res) {
        setResult({ data: [], error: res.error });
      } else {
        setResult({ data: res.courses, error: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { courses: result?.data ?? [], loading: result === null, error: result?.error ?? null };
}

interface KeyedResult<T> {
  key: string;
  data: T;
  error: string | null;
}

export interface UseCourseIntelReturn {
  courses: Course[];
  coursesLoading: boolean;
  coursesError: string | null;
  courseId: string;
  setCourseId: (id: string) => void;
  course: Course | null;

  /**
   * Why this course cannot be read from Canvas, or null.
   *
   * INFORMATIONAL, NEVER A GATE (D20a/D20e). An export-only course is a
   * normal kind of course in this app - it still carries a roster, cached
   * repo bindings and everything the instructor recorded against it - so it
   * asks and answers like any other. This string tells the instructor what
   * a Canvas link would ADD; it never withholds the answer they can have.
   */
  courseNotConfiguredReason: string | null;
  roster: CanvasRosterEntry[];
  rosterLoading: boolean;
  rosterError: string | null;

  question: string;
  setQuestion: (value: string) => void;
  asking: boolean;
  /** "" when not asking; one of D17's two phase strings otherwise. Rendered
   * inside the single role="status" region - see CourseIntelAnswer.tsx. */
  statusText: string;
  askError: string | null;
  /** A refusal rather than a failure: the question named a student who
   *  matches two roster entries, or named more than one student. Nothing was
   *  sent to the model. */
  askRefusal: string | null;
  lastAnswer: ResolvedCourseIntelAnswer | null;
  ask: () => void;
}

/** How long the "Gathering course data..." phase text shows before this hook
 * switches it to "Asking the AI..." (D17). This is a WALL-CLOCK HEURISTIC,
 * not a real signal: POST /api/course-intel/ask is one request/response
 * (D3), so nothing tells this hook when the server's own assembly phase
 * actually finished and the model call actually started. Documented as a
 * known limitation in this feature's wave report - a true two-phase signal
 * would need the route to stream, which is outside this wave's scope. */
const GATHER_PHASE_HEURISTIC_MS = 1200;

export function useCourseIntel(): UseCourseIntelReturn {
  const { courses, loading: coursesLoading, error: coursesError } = useCourses();

  const [courseId, setCourseIdState] = useState<string>(() => loadCourseIntelCourseId());
  const setCourseId = (id: string) => {
    setCourseIdState(id);
    persistCourseIntelCourseId(id);
  };
  const course = courses.find((c) => c.id === courseId) ?? null;

  const institution = (course?.institution ?? "").trim();
  const canvasUrl = (course?.canvasUrl ?? "").trim();
  const canvasCourseId = course?.canvasUrl ? parseCanvasCourseId(course.canvasUrl) : null;

  const courseNotConfiguredReason: string | null = !course
    ? null
    : !institution
      ? `"${course.name}" has no institution set, so it cannot be read from Canvas. Answers will use only the work you recorded in this browser.`
      : !canvasUrl
        ? `"${course.name}" has no Canvas course URL set, so it cannot be read from Canvas. Answers will use only the work you recorded in this browser.`
        : !canvasCourseId
          ? `"${course.name}"'s Canvas course URL does not contain a Canvas course id ("/courses/<number>"), so it cannot be read from Canvas. Answers will use only the work you recorded in this browser.`
          : null;

  // ---- roster (D13's live identity resolution needs this; composite key
  // copied verbatim from useRepoGradesData.ts's own rosterKey - see that
  // file's comment for why re-reading institution/canvasCourseId inside the
  // effect, rather than parsing the key back apart, is safe). It is loaded
  // only when there IS a Canvas course to load it from, and its failure
  // never blocks asking: an offline answer resolves its own names from
  // `offlineStudents`. --------------------------------------------------
  const rosterKey = course && institution && canvasCourseId ? `${course.id}:${institution}:${canvasCourseId}` : null;
  const [rosterResult, setRosterResult] = useState<KeyedResult<CanvasRosterEntry[]> | null>(null);

  useEffect(() => {
    if (rosterKey === null) return;
    let cancelled = false;
    (async () => {
      const result = await listCourseRosterAction(institution, canvasCourseId!);
      if (cancelled) return;
      if ("error" in result) {
        setRosterResult({ key: rosterKey, data: [], error: result.error });
      } else {
        setRosterResult({ key: rosterKey, data: result.students, error: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rosterKey, institution, canvasCourseId]);

  const rosterMatches = rosterKey !== null && rosterResult?.key === rosterKey;
  const roster = rosterMatches ? rosterResult!.data : [];
  const rosterError = rosterMatches ? rosterResult!.error : null;
  const rosterLoading = rosterKey !== null && !rosterMatches;

  // ---- per-course draft question + ask state, reset together whenever the
  // selected course changes - the same render-phase compare-and-adjust
  // idiom repo-grades' index.tsx uses for its own per-course reset block
  // (cellStateResetForCourse), rather than an effect: setting state
  // synchronously inside an effect is what react-hooks/set-state-in-effect
  // forbids, and this runs during render instead. ------------------------
  const [question, setQuestionState] = useState("");
  const [asking, setAsking] = useState(false);
  const [phase, setPhase] = useState<"gathering" | "asking">("gathering");
  const [askError, setAskError] = useState<string | null>(null);
  const [askRefusal, setAskRefusal] = useState<string | null>(null);
  const [lastAnswer, setLastAnswer] = useState<ResolvedCourseIntelAnswer | null>(null);
  const [resetForCourseId, setResetForCourseId] = useState<string | null>(null);
  if (courseId !== resetForCourseId) {
    setResetForCourseId(courseId);
    setQuestionState(loadCourseIntelQuestion(courseId));
    setAsking(false);
    setAskError(null);
    setAskRefusal(null);
    setLastAnswer(null);
  }

  const setQuestion = (value: string) => {
    setQuestionState(value);
    persistCourseIntelQuestion(courseId, value);
  };

  // Guards a stale in-flight request's callback from clobbering a DIFFERENT
  // course's display after the instructor has already switched courses -
  // the fetch itself is not cancelled (no AbortController plumbing exists
  // yet for this brand-new route), so this ref is what keeps a late answer
  // for course A from ever painting over course B.
  const courseIdRef = useRef(courseId);
  useEffect(() => {
    courseIdRef.current = courseId;
  }, [courseId]);

  const ask = () => {
    const trimmed = question.trim();
    // NO CANVAS PRECONDITION. A course with no institution and no Canvas URL
    // asks and answers - see courseNotConfiguredReason above.
    if (!trimmed || asking || rosterLoading || !course) return;

    const courseHubId = course.id;
    const rosterAtCall = roster;

    setAskError(null);
    setAskRefusal(null);
    setAsking(true);
    setPhase("gathering");
    let settled = false;
    const phaseTimer = setTimeout(() => {
      if (!settled) setPhase("asking");
    }, GATHER_PHASE_HEURISTIC_MS);

    const requestBody: CourseIntelAskRequestBody = {
      courseId: courseHubId,
      question: trimmed,
      // Sent on EVERY request, live or not. This hook cannot know whether
      // Canvas is reachable, and asking it to find out first would be a
      // second round trip for the exact question the route answers anyway.
      offline: readOfflineRecordedTables(courseHubId),
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
        if (courseIdRef.current !== courseHubId) return;
        setAsking(false);

        const body = (await readJsonSafely(response)) as CourseIntelAskResponseBody | null;

        if (!response.ok) {
          setAskError(describeAskFailure(body, response.statusText));
          return;
        }
        // The two refusals are 200s, not errors: nothing failed, the question
        // was not answerable as asked. The question STAYS in the box so
        // rewording it costs one edit rather than retyping.
        if (body?.status === "needs-disambiguation" || body?.status === "too-many-students") {
          setAskRefusal(
            typeof body.message === "string" && body.message.trim()
              ? body.message
              : "That question could not be narrowed to one student."
          );
          return;
        }
        if (!body || body.status !== "ok") {
          setAskError(describeAskFailure(body, "The answer could not be read."));
          return;
        }

        setLastAnswer(resolveCourseIntelAnswer(body, rosterAtCall));
        // Never clear the question on error or on a refusal - only here, in
        // the success branch, after every other branch above has already
        // returned (D17), copying useKnowledgeOverview.ts's ask() placement
        // exactly: a retry costs one click, not retyping.
        setQuestionState("");
        persistCourseIntelQuestion(courseHubId, "");
      } catch (err) {
        settled = true;
        clearTimeout(phaseTimer);
        if (courseIdRef.current !== courseHubId) return;
        setAsking(false);
        setAskError(describeAskFailure(null, err instanceof Error ? err.message : "network error"));
      }
    })();
  };

  const statusText = asking ? (phase === "gathering" ? "Gathering course data..." : "Asking the AI...") : "";

  return {
    courses,
    coursesLoading,
    coursesError,
    courseId,
    setCourseId,
    course,
    courseNotConfiguredReason,
    roster,
    rosterLoading,
    rosterError,
    question,
    setQuestion,
    asking,
    statusText,
    askError,
    askRefusal,
    lastAnswer,
    ask,
  };
}
