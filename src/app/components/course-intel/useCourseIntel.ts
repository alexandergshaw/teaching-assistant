"use client";

// Course Intel - state and data flow for the Manual > Course Intel subtab
// (D13-D17 of docs/course-student-intelligence-acceptance-criteria.md). A
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
// THE ROUTE THIS HOOK CALLS DOES NOT EXIST YET. POST /api/course-intel/ask is
// a wave 2 deliverable (D3: a Route Handler with maxDuration = 60, not a
// Server Action - a Server Action reachable from this "use client" page.tsx
// gets Next's unconfigurable default, never the platform's full 60s ceiling).
// This hook therefore calls it as a URL string via `fetch`, never an import,
// and the request/response shapes below (CourseIntelAskRequestBody,
// CourseIntelAskResponseBody, CourseIntelAskErrorBody) are THIS FILE'S OWN
// DOCUMENTED WIRE CONTRACT for wave 2 to build against - built directly on
// src/lib/course-intel/types.ts (read-only for this wave, zero imports by
// its own design) so the two waves cannot silently disagree about shape. A
// non-OK response is handled as an ordinary error, per this wave's brief.
//
// STUDENT IDENTITY (D13): the model is never shown a name or a login id - it
// sees indices only, and its prose refers to a student by writing the bare
// marker text "S<index>" (mirroring the existing page-citation convention in
// src/lib/knowledge-overview-prompt.ts, which asks the model to write "P1"
// without brackets). This hook is what turns that back into a real,
// disambiguated name, ENTIRELY LOCALLY: `citedStudents` on the returned
// answer maps each index to a Canvas user id, and this hook resolves that id
// against the course roster it already loaded for the picker - the same
// listCourseRosterAction repo-grades' own useRepoGradesData.ts calls,
// inherited here for free. `loginId` comes along on that same roster row and
// is used ONLY as a local disambiguator string for two students who
// genuinely share a display name in this course - it is never read into the
// request body, never stored, and never part of anything sent anywhere.
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
import type {
  AssemblyOmission,
  AssemblyTier,
  CanvasUserId,
  ConcernRow,
  ConcernSignal,
  CourseIntelAnswerRecord,
  StudentIndex,
} from "@/lib/course-intel/types";
import { loadCourseIntelCourseId, loadCourseIntelQuestion, persistCourseIntelCourseId, persistCourseIntelQuestion } from "./courseIntelUiState";

// ---------------------------------------------------------------------------
// This hook's own wire contract for POST /api/course-intel/ask - see the
// file header above.
// ---------------------------------------------------------------------------

interface CourseIntelAskRequestBody {
  /** The course_hub row id - never the Canvas numeric id (D13/S18). */
  courseHubId: string;
  institution: string;
  canvasCourseId: string;
  question: string;
}

interface CourseIntelAskResponseBody {
  answer: CourseIntelAnswerRecord;
  /**
   * Whether the code-authored signal strip (D15) applies to this answer at
   * all. True for every question shape that carries a per-student signal
   * check - which per D7's table is every shape except "what areas has X
   * asked about" (that one's whole payload is X's own text, with no signal
   * check behind it). `concernRows.length === 0` with this true means
   * "checked, found nothing" (D15's empty-case prose belongs here);
   * `showConcernStrip` false means "not applicable to this question" (no
   * strip, no empty-case sentence either) - collapsing those two into a bare
   * empty array would render the wrong one.
   */
  showConcernStrip: boolean;
  /** Rows to render as the strip beneath the model's prose - see D15's own
   * header comment on ConcernRow in types.ts for why membership is decided
   * in code and never by the model. May be empty; see showConcernStrip. */
  concernRows: readonly ConcernRow[];
}

interface CourseIntelAskErrorBody {
  error?: unknown;
  /**
   * Set only when the failure happened AFTER the Canvas assembly succeeded
   * and the request actually reached the model - the one case where "nothing
   * was sent to the AI" would be false (D17). Absent, or any other value, is
   * treated as a pre-model failure: both the more common cause and the safer
   * default to claim when the server gives no signal either way.
   */
  phase?: unknown;
}

async function readJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** D17's two per-phase error sentences - see CourseIntelAskErrorBody above
 * for the phase contract this reads. */
function describeAskFailure(body: unknown, fallbackMessage: string): string {
  const record = body && typeof body === "object" ? (body as CourseIntelAskErrorBody) : null;
  const isModelPhase = record?.phase === "model";
  if (isModelPhase) {
    return "The AI did not return an answer. Try again - your question is still here.";
  }
  const message = record && typeof record.error === "string" && record.error.trim() ? record.error : fallbackMessage || "Something went wrong.";
  return `Could not gather this course's data from Canvas: ${message}. Nothing was sent to the AI.`;
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
function computeCollidingNames(roster: readonly CanvasRosterEntry[]): ReadonlySet<string> {
  const counts = new Map<string, number>();
  for (const entry of roster) {
    const name = entry.name.trim();
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
function resolveStudentDisplayName(
  userId: CanvasUserId | null,
  roster: readonly CanvasRosterEntry[],
  collidingNames: ReadonlySet<string>
): string {
  // A null id means the answer came from an OFFLINE assembly, where a
  // student is matched by name against the course roster and has no Canvas
  // id at all. There is nothing to look up, and inventing a lookup key
  // would be the fabrication the nullable type exists to prevent. The
  // server already resolved a display name for these; the marker stays as
  // written rather than being replaced with a wrong name.
  if (userId === null) return "";
  const entry = roster.find((r) => Number(r.id) === userId);
  if (!entry) return `Student ${userId} (not on the current roster)`;
  const name = entry.name.trim() || `Student ${userId}`;
  if (!collidingNames.has(name)) return name;
  return entry.loginId.trim() ? `${name} (${entry.loginId.trim()})` : `${name} (Canvas user ${userId})`;
}

/**
 * Replaces every bare "S<digits>" marker the model was instructed to write
 * (mirroring the page-citation convention's bracket-free "P1" - see this
 * file's header) with the locally-resolved display name for that index.
 * `\b` word boundaries mean a token like "CS3110" is never touched (the
 * character before "S" there is a word character, so `\bS` cannot match
 * there) - but this is a plain text substitution, not a parser, so a
 * genuinely ambiguous adjacent token is a known limitation (see this
 * feature's wave report). A marker whose index was not in `citedStudents` is
 * left as literal text rather than guessed at.
 */
function substituteStudentMarkers(markdown: string, nameByIndex: ReadonlyMap<StudentIndex, string>): string {
  if (nameByIndex.size === 0) return markdown;
  return markdown.replace(/\bS(\d+)\b/g, (whole: string, digits: string) => nameByIndex.get(Number(digits)) ?? whole);
}

export interface ResolvedConcernRow {
  studentIndex: StudentIndex;
  displayName: string;
  /** Code-authored, typed data straight from the server (D15) - rendered as
   * the badge row, never parsed out of the model's prose. */
  signals: readonly ConcernSignal[];
}

export interface ResolvedCourseIntelAnswer {
  id: string;
  /** Raw markdown, student markers already resolved to display names - render
   * through markdownToHtml at the call site (see file header). */
  answerMarkdown: string;
  tier: AssemblyTier;
  assembledAt: string;
  omissions: readonly AssemblyOmission[];
  showConcernStrip: boolean;
  concernRows: readonly ResolvedConcernRow[];
}

function resolveCourseIntelAnswer(body: CourseIntelAskResponseBody, roster: readonly CanvasRosterEntry[]): ResolvedCourseIntelAnswer {
  const collidingNames = computeCollidingNames(roster);
  const nameByIndex = new Map<StudentIndex, string>();
  for (const cited of body.answer.citedStudents) {
    nameByIndex.set(cited.index, resolveStudentDisplayName(cited.userId, roster, collidingNames));
  }
  return {
    id: body.answer.id,
    answerMarkdown: substituteStudentMarkers(body.answer.answerMarkdown, nameByIndex),
    tier: body.answer.tier,
    assembledAt: body.answer.assembledAt,
    omissions: body.answer.omissions,
    showConcernStrip: body.showConcernStrip,
    concernRows: body.concernRows.map((row) => ({
      studentIndex: row.studentIndex,
      displayName: resolveStudentDisplayName(row.userId, roster, collidingNames),
      signals: row.signals,
    })),
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

  /** Non-null exactly when the roster load below cannot run - no
   * institution, no Canvas URL, or a Canvas URL with no course id in it - the
   * same three-cause gate useRepoGradesData.ts's own canvasGateBlockedReason
   * already establishes for this codebase, restated for this view's own
   * copy. */
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
  lastAnswer: ResolvedCourseIntelAnswer | null;
  ask: () => void;
}

/** How long the "Gathering Canvas data..." phase text shows before this hook
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
      ? `"${course.name}" has no institution set, so its Canvas data cannot be gathered - set one on the course tile first.`
      : !canvasUrl
        ? `"${course.name}" has no Canvas course URL set, so its Canvas data cannot be gathered - set one on the course tile first.`
        : !canvasCourseId
          ? `"${course.name}"'s Canvas course URL does not contain a Canvas course id ("/courses/<number>"), so its Canvas data cannot be gathered - paste the course's own URL, not the institution's general Canvas address, on the course tile.`
          : null;

  // ---- roster (D13's local identity resolution needs this; composite key
  // copied verbatim from useRepoGradesData.ts's own rosterKey - see that
  // file's comment for why re-reading institution/canvasCourseId inside the
  // effect, rather than parsing the key back apart, is safe). -------------
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
  const [lastAnswer, setLastAnswer] = useState<ResolvedCourseIntelAnswer | null>(null);
  const [resetForCourseId, setResetForCourseId] = useState<string | null>(null);
  if (courseId !== resetForCourseId) {
    setResetForCourseId(courseId);
    setQuestionState(loadCourseIntelQuestion(courseId));
    setAsking(false);
    setAskError(null);
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
    if (!trimmed || asking || rosterLoading) return;
    if (!course || !institution || !canvasCourseId) return;

    const courseHubId = course.id;
    const institutionAtCall = institution;
    const canvasCourseIdAtCall = canvasCourseId;
    const rosterAtCall = roster;

    setAskError(null);
    setAsking(true);
    setPhase("gathering");
    let settled = false;
    const phaseTimer = setTimeout(() => {
      if (!settled) setPhase("asking");
    }, GATHER_PHASE_HEURISTIC_MS);

    const requestBody: CourseIntelAskRequestBody = {
      courseHubId,
      institution: institutionAtCall,
      canvasCourseId: canvasCourseIdAtCall,
      question: trimmed,
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

        if (!response.ok) {
          const errorBody = await readJsonSafely(response);
          setAskError(describeAskFailure(errorBody, response.statusText));
          return;
        }

        const body = (await response.json()) as CourseIntelAskResponseBody;
        setLastAnswer(resolveCourseIntelAnswer(body, rosterAtCall));
        // Never clear the question on error - only here, in the success
        // branch, after every error branch above has already returned
        // (D17), copying useKnowledgeOverview.ts's ask() placement exactly:
        // a retry costs one click, not retyping.
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

  const statusText = asking ? (phase === "gathering" ? "Gathering Canvas data..." : "Asking the AI...") : "";

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
    lastAnswer,
    ask,
  };
}
