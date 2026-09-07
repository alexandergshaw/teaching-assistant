// course-intel: THE UNTRUSTED WIRE BOUNDARY for the offline path.
//
// WHY THIS EXISTS AT ALL, stated plainly. Everything the offline answer is
// built from lives in the INSTRUCTOR'S BROWSER: the grading table
// (`ta-rec-grade-table`), the reply table (`ta-rec-disc-table`) and the
// declaration store (`ta-rec-grade-declarations`) are localStorage, one table
// per browser. A Route Handler cannot read them. So the browser posts them,
// and this module is the one place that arriving JSON becomes the typed shapes
// ./offline-assembly consumes.
//
// DATA MINIMISATION IS STRUCTURAL HERE, NOT A CONVENTION (D7).
// `mapOfflineAssemblyInputs` reads exactly six fields off a `GradingRow`
// (course, studentName, assessment, totalScore, submissionTimeStatus,
// submittedAt) and exactly four off a `ReplyRow` (course, author,
// threadPosition, postedAt). Nothing else is accepted here - not
// `submissionText`, not `post`, not `reply`, not `strengths`,
// `improvements` or `overallComment`. The rows this module BUILDS carry ""
// in every one of those fields, explicitly enumerated with no spread, so a
// student's written submission cannot reach the server even if a future
// caller posts it: there is no field for it to land in. That is the same
// no-spread discipline grading-row-serialization.ts already applies at the
// localStorage boundary, applied here at the network one.
//
// AND IT IS WHY THE OFFLINE PROMPT CARRIES NO THIRD-PARTY TEXT AT ALL. The
// live path has to frame student writing as hostile data because it sends it.
// The offline path sends none: what crosses this boundary is names (consumed
// by ./offline-identity and discarded), instructor-typed assessment labels,
// instructor-typed tool names, free-text scores, and timestamps. See
// ./offline-prompt for what that buys.
//
// NEVER THROWS. Mirrors deserializeGradingRows and
// deserializeGradingDeclarations, this repo's own discipline for reading a
// store it does not control: defensive guards, an unrecoverable record dropped
// on its own rather than failing the whole read, and a COUNT of what was
// dropped so the answer can state it instead of quietly shrinking.
//
// PURE LEAF: no clock, no randomness, no I/O. The two imports that reach into
// src/app/components are TYPE-ONLY and erased at compile time, exactly as
// ./offline-assembly's own header explains for the same two modules.

import type { GradingRow, GradingRowSubmissionTimeStatus } from "@/app/components/grading-recording/grading-row";
import type {
  GradingAssessmentDeclaration,
  GradingToolDeclaration,
  GradingWorkKind,
} from "@/app/components/grading-recording/useGradingAssessmentDeclarations";
import type { ReplyRow } from "@/app/components/recording/discussion-serialization";

/**
 * How many rows of each table one request may carry.
 *
 * A term of grading for one course is hundreds of rows, not tens of thousands,
 * and every row above the cap is COUNTED AND STATED rather than silently
 * ignored - AC6's rule, applied to a request body. A cap that dropped rows
 * without saying so would shrink a missing count and read as "no missing
 * work", which is the one output shape this whole feature exists to avoid.
 */
export const MAX_OFFLINE_ROWS_PER_TABLE = 4000;

/** Per-field character cap. These are short identifiers and timestamps, never
 *  prose - the prose fields are not accepted at all (see the header). A longer
 *  value is truncated rather than dropped, so a row with one overlong field
 *  still attributes. */
const MAX_FIELD_CHARS = 400;

const VALID_SUBMISSION_TIME_STATUSES: ReadonlySet<string> = new Set<GradingRowSubmissionTimeStatus>([
  "known",
  "marked-late",
  "unknown",
]);

const VALID_WORK_KINDS: ReadonlySet<string> = new Set<GradingWorkKind>(["discussion", "assignment"]);

const VALID_THREAD_POSITIONS: ReadonlySet<string> = new Set(["root", "reply", "unknown"]);

function readField(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  return trimmed.length > MAX_FIELD_CHARS ? trimmed.slice(0, MAX_FIELD_CHARS) : trimmed;
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

/** What was dropped on the way in. Counts only - never the values, and never a
 *  name. Stated to the instructor beside the answer. */
export interface OfflinePayloadIntake {
  readonly gradingRowsReceived: number;
  readonly gradingRowsOverCap: number;
  readonly gradingRowsUnreadable: number;
  readonly replyRowsReceived: number;
  readonly replyRowsOverCap: number;
  readonly replyRowsUnreadable: number;
  readonly assessmentDeclarationsReceived: number;
  readonly toolDeclarationsReceived: number;
  /** True when the body carried no `offline` object at all - which is a
   *  different fact from an empty one, and the difference decides whether the
   *  answer says "you have recorded nothing for this course" or "this browser
   *  sent nothing". */
  readonly payloadPresent: boolean;
}

export interface ParsedOfflinePayload {
  readonly gradingRows: readonly GradingRow[];
  readonly replyRows: readonly ReplyRow[];
  readonly assessmentDeclarations: readonly GradingAssessmentDeclaration[];
  readonly toolDeclarations: readonly GradingToolDeclaration[];
  /**
   * Which tool recorded `gradingRows`, in the instructor's own vocabulary.
   *
   * NOT DEFAULTED HERE, and ./offline-assembly's own doc says why: defaulting
   * it to the declared tool would make D23a's violation check vacuous -
   * `foreignTools` would always be empty by construction and a half-migrated
   * assessment would produce a confident missing list, which D23a names as the
   * worst outcome available. "" is passed through as "" so the mismatch is
   * LOUD. See `OFFLINE_RECORDING_TOOL` for where a real value comes from.
   */
  readonly recordingTool: string;
  readonly intake: OfflinePayloadIntake;
}

/**
 * THE ANSWER TO "WHERE DOES `recordingTool` COME FROM".
 *
 * It is not inferred, not defaulted, and not typed by the instructor a second
 * time. The grading table this app writes is produced by exactly one tool -
 * this app's own screen-recording grader - so the app can state that as a FACT
 * about its own rows rather than asking anybody. The instructor's half of the
 * bargain is the DECLARATION (D23a: which tool is the complete record for a
 * kind of work in this course), and that half stays theirs and stays free
 * text; this constant is the other half, and it is the app describing itself.
 *
 * WHY A CONSTANT IS SOUND AND AN INFERENCE WOULD NOT BE. D23a requires the
 * assumption to be checkable: "if grades for one assessment turn up in a tool
 * that is not the declared one, the assumption is violated for that assessment
 * and its missing count is WRONG." That check compares the DECLARED tool with
 * the tool that actually produced the rows. This app knows the second value
 * exactly - it wrote the rows - so stating it is the most reliable input the
 * check can have. Deriving it from the declaration instead is what would make
 * the check vacuous.
 *
 * AND THE FAILURE IT PRODUCES IS LOUD BY DESIGN. An instructor who declares
 * "Canvas SpeedGrader" as authoritative for assignments, and whose recorded
 * rows therefore arrive from a different tool, gets `violated` for those
 * assessments and NO missing count - stated in the answer, never averaged
 * over. That is the correct outcome: they told us their gradebook lives
 * somewhere we cannot see. Nothing here softens it, and nothing here
 * "helpfully" matches the strings loosely to make it agree.
 *
 * The wording is the same one useGradingAssessmentDeclarations.ts already
 * offers as its worked example of a tool name ("Screen recording (this app)"),
 * so an instructor typing the obvious thing gets an exact match rather than a
 * near miss.
 */
export const OFFLINE_RECORDING_TOOL = "Screen recording (this app)";

const EMPTY_INTAKE: OfflinePayloadIntake = Object.freeze({
  gradingRowsReceived: 0,
  gradingRowsOverCap: 0,
  gradingRowsUnreadable: 0,
  replyRowsReceived: 0,
  replyRowsOverCap: 0,
  replyRowsUnreadable: 0,
  assessmentDeclarationsReceived: 0,
  toolDeclarationsReceived: 0,
  payloadPresent: false,
});

/**
 * Build a `GradingRow` from the six fields the offline mapping actually reads.
 *
 * EVERY OTHER FIELD IS BLANK, ENUMERATED EXPLICITLY. Do not replace this with
 * a spread of the incoming object "to keep it in sync": the point is that the
 * shape cannot carry a student's submission text, and a spread would make it
 * carry whatever arrived.
 */
function buildGradingRow(raw: Record<string, unknown>, ordinal: number): GradingRow | null {
  const studentName = readField(raw.studentName);
  const course = readField(raw.course);
  // A row with neither a name nor a course can attribute to nothing and
  // measure nothing. Counted as unreadable rather than carried.
  if (!studentName && !course) return null;

  const statusRaw = readField(raw.submissionTimeStatus);
  const submissionTimeStatus = VALID_SUBMISSION_TIME_STATUSES.has(statusRaw)
    ? (statusRaw as GradingRowSubmissionTimeStatus)
    : undefined;

  return {
    id: `offline-grade-${ordinal}`,
    studentName,
    nameMatch: "unmatched",
    rosterCandidates: [],
    submissionText: "",
    state: "ready",
    totalScore: readField(raw.totalScore),
    strengths: "",
    improvements: "",
    overallComment: "",
    error: "",
    userEdited: false,
    course: course || undefined,
    assessment: readField(raw.assessment) || undefined,
    submittedAt: readField(raw.submittedAt) || undefined,
    submissionTimeStatus,
  };
}

/** Same discipline as buildGradingRow, for the four fields the reply mapping
 *  reads. `post` and `reply` are blank and there is no way to fill them. */
function buildReplyRow(raw: Record<string, unknown>, ordinal: number): ReplyRow | null {
  const author = readField(raw.author);
  const course = readField(raw.course);
  if (!author && !course) return null;

  const positionRaw = readField(raw.threadPosition);
  const threadPosition = VALID_THREAD_POSITIONS.has(positionRaw)
    ? (positionRaw as ReplyRow["threadPosition"])
    : undefined;

  return {
    id: `offline-reply-${ordinal}`,
    author,
    post: "",
    reply: "",
    userEdited: false,
    state: "ready",
    error: null,
    // Never read by the offline mapping, and deliberately NOT the request's
    // own clock: `firstSeenAt` is when WE saw a post, and ./offline-assembly's
    // own comment records that substituting it for a posted time turns every
    // recency signal into a fact about the instructor's capture cadence.
    firstSeenAt: 0,
    order: ordinal,
    course: course || undefined,
    postedAt: readField(raw.postedAt) || undefined,
    threadPosition,
  };
}

function parseAssessmentDeclarations(raw: unknown): GradingAssessmentDeclaration[] {
  if (!Array.isArray(raw)) return [];
  const out: GradingAssessmentDeclaration[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    if (!record) continue;
    const courseId = readField(record.courseId);
    const assessmentId = readField(record.assessmentId);
    const workKindRaw = readField(record.workKind);
    // D23a: never guess a work kind - drop the record instead. Same rule
    // deserializeGradingDeclarations applies to the stored copy.
    if (!courseId || !assessmentId || !VALID_WORK_KINDS.has(workKindRaw)) continue;
    out.push({
      courseId,
      assessmentId,
      assessmentLabel: readField(record.assessmentLabel),
      workKind: workKindRaw as GradingWorkKind,
      deadline: readField(record.deadline),
    });
  }
  return out;
}

function parseToolDeclarations(raw: unknown): GradingToolDeclaration[] {
  if (!Array.isArray(raw)) return [];
  const out: GradingToolDeclaration[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    if (!record) continue;
    const courseId = readField(record.courseId);
    const workKindRaw = readField(record.workKind);
    if (!courseId || !VALID_WORK_KINDS.has(workKindRaw)) continue;
    out.push({ courseId, workKind: workKindRaw as GradingWorkKind, tool: readField(record.tool) });
  }
  return out;
}

/**
 * Parse the `offline` half of an ask request.
 *
 * `recordingTool` is NOT read from the body. It is this app's own statement
 * about rows this app wrote (see OFFLINE_RECORDING_TOOL), and letting a
 * request name it would let a caller make D23a's violation check agree with
 * any declaration it liked - which is the vacuous check that decision exists
 * to prevent.
 */
export function parseOfflinePayload(raw: unknown): ParsedOfflinePayload {
  const body = asRecord(raw);
  if (!body) {
    return {
      gradingRows: [],
      replyRows: [],
      assessmentDeclarations: [],
      toolDeclarations: [],
      recordingTool: OFFLINE_RECORDING_TOOL,
      intake: EMPTY_INTAKE,
    };
  }

  const rawGrading = Array.isArray(body.gradingRows) ? body.gradingRows : [];
  const rawReplies = Array.isArray(body.replyRows) ? body.replyRows : [];

  const gradingRows: GradingRow[] = [];
  let gradingRowsUnreadable = 0;
  for (const entry of rawGrading.slice(0, MAX_OFFLINE_ROWS_PER_TABLE)) {
    const record = asRecord(entry);
    const row = record ? buildGradingRow(record, gradingRows.length) : null;
    if (row) gradingRows.push(row);
    else gradingRowsUnreadable += 1;
  }

  const replyRows: ReplyRow[] = [];
  let replyRowsUnreadable = 0;
  for (const entry of rawReplies.slice(0, MAX_OFFLINE_ROWS_PER_TABLE)) {
    const record = asRecord(entry);
    const row = record ? buildReplyRow(record, replyRows.length) : null;
    if (row) replyRows.push(row);
    else replyRowsUnreadable += 1;
  }

  const assessmentDeclarations = parseAssessmentDeclarations(body.assessmentDeclarations);
  const toolDeclarations = parseToolDeclarations(body.toolDeclarations);

  return {
    gradingRows,
    replyRows,
    assessmentDeclarations,
    toolDeclarations,
    recordingTool: OFFLINE_RECORDING_TOOL,
    intake: {
      gradingRowsReceived: rawGrading.length,
      gradingRowsOverCap: Math.max(0, rawGrading.length - MAX_OFFLINE_ROWS_PER_TABLE),
      gradingRowsUnreadable,
      replyRowsReceived: rawReplies.length,
      replyRowsOverCap: Math.max(0, rawReplies.length - MAX_OFFLINE_ROWS_PER_TABLE),
      replyRowsUnreadable,
      assessmentDeclarationsReceived: assessmentDeclarations.length,
      toolDeclarationsReceived: toolDeclarations.length,
      payloadPresent: true,
    },
  };
}
