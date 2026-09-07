/**
 * Course-wide submission grid: every submission in a course, in ONE
 * paginated read, independent of assignment count.
 *
 * docs/course-student-intelligence-acceptance-criteria.md D4: this is a NEW
 * reader, kept separate from listAssignmentNonSubmitters (auto-zero.ts).
 * That function is deliberately filtered for auto-zeroing - it returns an
 * empty list with an ineligibleReason for unpublished, not_graded,
 * omit_from_final_grade, and non-online-submission assignments, and its own
 * interface declares neither `late` nor `missing`. Reusing it for a concern
 * signal would report zero missing work on exactly the paper and in-class
 * assignments an instructor most wants flagged - so this file reads the raw
 * submission facts instead, unfiltered, and lets the caller decide what to
 * do with them.
 *
 * THE FALLBACK IS A DELIVERABLE, NOT A FOLLOW-UP. The bulk
 * `students/submissions` endpoint has zero occurrences anywhere else in this
 * repo and has never been exercised against these Canvas instances. If it
 * 403s, 404s, or is otherwise disabled on an instance, the whole point of
 * this function - one call's worth of pagination instead of one call per
 * assignment - collapses. So a non-OK FIRST response is read as "this
 * endpoint is unavailable here" and this function falls back to fanning out
 * per assignment against the same per-assignment submissions endpoint
 * auto-zero.ts already uses, at concurrency 4. A non-OK response on any page
 * AFTER the first is a genuine mid-read error, not a fallback trigger - the
 * endpoint already proved itself available by answering page one.
 *
 * Never fetches or returns `login_id` or any email - this reader returns
 * ids, a workflow state, and grading facts, nothing that identifies a
 * student beyond the numeric Canvas user id the whole feature already keys
 * on.
 */

import { canvasError, parseNextLink, type CanvasInstitution } from "../canvas-core";
import { assertCanvasSuppliedUrlIsSameOrigin, CANVAS_PAGINATION_PAGE_CAP } from "../canvas-remote-url";
import { canvasGet } from "../canvas-fetch-response";
import { mapWithConcurrency } from "../canvas-modules/fetch-helpers";

/** How many per-assignment fallback fetches run at once. Fixed, not
 * configurable - this path exists to survive an unavailable bulk endpoint,
 * not to be tuned per caller. */
const FALLBACK_CONCURRENCY = 4;

/** One submission, in this reader's own raw shape - not
 * src/lib/course-intel/types.ts's StudentSubmissionFact. That type belongs to
 * the join step (a sibling module maps into it); this file only reads Canvas
 * and reports what Canvas said. */
export interface CanvasSubmissionGridRow {
  readonly userId: number;
  readonly assignmentId: string;
  /** `null` means ungraded. Never conflated with a score of zero. */
  readonly score: number | null;
  readonly workflowState: string;
  readonly submittedAt: string | null;
  readonly excused: boolean;
  /** Canvas's own boolean, read verbatim - never re-derived from
   * `submittedAt` versus a due date. Canvas's `late` accounts for grace
   * periods and manual overrides a local comparison cannot see. */
  readonly late: boolean;
  /** Canvas's own boolean, read verbatim - never re-derived. Canvas's
   * `missing` accounts for a teacher's manual "mark missing" override and for
   * submission types that cannot be submitted online at all, so a local
   * re-derivation would disagree with the gradebook the instructor is
   * looking at while claiming to describe it. */
  readonly missing: boolean;
  /**
   * The student's EFFECTIVE due date, with overrides applied. Two fields for
   * three states, copied from auto-zero.ts's own hard-won handling: a string
   * is this student's own deadline, `null` means they have no deadline, and
   * ABSENT (`dueAtPresent === false`) means Canvas said nothing about this
   * student's override at all. A single nullable field cannot express the
   * difference between "no deadline for them" and "unknown - ask the
   * assignment", and getting it wrong moves students in and out of a missing-
   * work count.
   */
  readonly dueAt: string | null;
  readonly dueAtPresent: boolean;
}

/** Which path produced the grid, so the caller can report it - the fallback
 * trigger condition (D4) is exactly the kind of thing that must never be
 * silently absorbed. */
export type CanvasSubmissionGridSource = "bulk" | "per-assignment-fallback";

export interface CanvasSubmissionGridResult {
  readonly rows: readonly CanvasSubmissionGridRow[];
  readonly source: CanvasSubmissionGridSource;
}

/** The subset of a Canvas submission object both the bulk endpoint and the
 * per-assignment endpoint return in common. */
interface CanvasRawSubmission {
  user_id?: number;
  assignment_id?: number;
  score?: number | null;
  workflow_state?: string;
  submitted_at?: string | null;
  excused?: boolean;
  late?: boolean;
  missing?: boolean;
  cached_due_date?: string | null;
}

/**
 * Maps one raw submission row. `assignmentIdOverride` is supplied by the
 * per-assignment fallback path, which already knows the assignment id from
 * the URL it fetched and does not need to trust the row to carry its own
 * `assignment_id` field. The bulk path omits it and reads `assignment_id`
 * off the row instead, since one bulk page mixes many assignments.
 */
function mapSubmissionRow(
  row: CanvasRawSubmission,
  assignmentIdOverride?: string
): CanvasSubmissionGridRow | null {
  if (typeof row.user_id !== "number") return null;

  const assignmentId =
    assignmentIdOverride ?? (typeof row.assignment_id === "number" ? String(row.assignment_id) : null);
  if (!assignmentId) return null;

  const dueAtPresent = Object.prototype.hasOwnProperty.call(row, "cached_due_date");

  return {
    userId: row.user_id,
    assignmentId,
    score: typeof row.score === "number" ? row.score : null,
    workflowState: row.workflow_state ?? "",
    submittedAt: row.submitted_at ?? null,
    excused: row.excused === true,
    late: row.late === true,
    missing: row.missing === true,
    dueAt: dueAtPresent ? row.cached_due_date ?? null : null,
    dueAtPresent,
  };
}

/** The per-assignment fallback path, one assignment. Paginated the same way
 * the bulk path is - a course can have more than 100 students on a single
 * assignment. */
async function fetchAssignmentSubmissions(
  baseUrl: string,
  token: string,
  institution: CanvasInstitution,
  courseId: string,
  assignmentId: string
): Promise<CanvasSubmissionGridRow[]> {
  let next: string | null =
    `${baseUrl}/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions?per_page=100`;
  const rows: CanvasSubmissionGridRow[] = [];
  let pageCount = 0;

  while (next) {
    // E-REL2 - cap follows; see CANVAS_PAGINATION_PAGE_CAP's own doc comment
    // for why an uncapped loop here would be a silent 60s function kill.
    pageCount += 1;
    if (pageCount > CANVAS_PAGINATION_PAGE_CAP) {
      throw new Error(
        `Canvas pagination exceeded ${CANVAS_PAGINATION_PAGE_CAP} pages while reading fallback submissions for assignment ${assignmentId} in course ${courseId} - refusing to follow further "next" links.`
      );
    }
    const response = await canvasGet(next, token);
    if (!response.ok) {
      throw canvasError(response.status, institution);
    }
    const page = (await response.json()) as CanvasRawSubmission[];
    for (const raw of page) {
      const mapped = mapSubmissionRow(raw, assignmentId);
      if (mapped) rows.push(mapped);
    }
    // E-CRIT1 - verified same-origin with baseUrl before being dialed, and
    // the URL fetched next iteration is the guard's own RETURNED string, not
    // the raw Link header candidate (see src/lib/canvas-remote-url.ts).
    const rawNext = parseNextLink(response.headers.get("link"));
    next = rawNext ? assertCanvasSuppliedUrlIsSameOrigin(rawNext, baseUrl) : null;
  }

  return rows;
}

/** Fans out the fallback across every assignment id at concurrency 4. */
async function fetchSubmissionGridPerAssignment(
  baseUrl: string,
  token: string,
  institution: CanvasInstitution,
  courseId: string,
  assignmentIds: readonly string[]
): Promise<CanvasSubmissionGridRow[]> {
  const perAssignment = await mapWithConcurrency(
    [...assignmentIds],
    FALLBACK_CONCURRENCY,
    (assignmentId) => fetchAssignmentSubmissions(baseUrl, token, institution, courseId, assignmentId)
  );
  return perAssignment.flat();
}

/**
 * List every submission in a course, one paginated read against the bulk
 * `students/submissions` endpoint, falling back to a per-assignment fan-out
 * (at concurrency 4) if that endpoint's first response is non-OK. See this
 * file's own doc comment for why the fallback exists and exactly when it
 * fires.
 *
 * `assignmentIds` is only used by the fallback path - the caller (the
 * Stratum A assembler) already fetches the assignment list for its own
 * purposes (docs/course-student-intelligence-acceptance-criteria.md D2), so
 * this function does not fetch it again itself; when the bulk endpoint
 * succeeds, `assignmentIds` is never read.
 */
export async function listCourseSubmissionGrid(
  baseUrl: string,
  token: string,
  institution: CanvasInstitution,
  courseId: string,
  assignmentIds: readonly string[]
): Promise<CanvasSubmissionGridResult> {
  let next: string | null =
    `${baseUrl}/api/v1/courses/${courseId}/students/submissions?student_ids[]=all&per_page=100`;
  const rows: CanvasSubmissionGridRow[] = [];
  let pageCount = 0;

  while (next) {
    // E-REL2 - cap follows; see CANVAS_PAGINATION_PAGE_CAP's own doc comment
    // for why an uncapped loop here would be a silent 60s function kill.
    pageCount += 1;
    if (pageCount > CANVAS_PAGINATION_PAGE_CAP) {
      throw new Error(
        `Canvas pagination exceeded ${CANVAS_PAGINATION_PAGE_CAP} pages while reading the submission grid for course ${courseId} - refusing to follow further "next" links.`
      );
    }

    const response = await canvasGet(next, token);

    if (!response.ok) {
      if (pageCount === 1) {
        // THE FALLBACK TRIGGER. Only a non-OK FIRST response falls back - a
        // failure on a later page is a genuine mid-read error and throws
        // normally, since the endpoint already proved itself available.
        const fallbackRows = await fetchSubmissionGridPerAssignment(
          baseUrl,
          token,
          institution,
          courseId,
          assignmentIds
        );
        return { rows: fallbackRows, source: "per-assignment-fallback" };
      }
      throw canvasError(response.status, institution);
    }

    const page = (await response.json()) as CanvasRawSubmission[];
    for (const raw of page) {
      const mapped = mapSubmissionRow(raw);
      if (mapped) rows.push(mapped);
    }

    // E-CRIT1 - verified same-origin with baseUrl before being dialed, and
    // the URL fetched next iteration is the guard's own RETURNED string, not
    // the raw Link header candidate (see src/lib/canvas-remote-url.ts).
    const rawNext = parseNextLink(response.headers.get("link"));
    next = rawNext ? assertCanvasSuppliedUrlIsSameOrigin(rawNext, baseUrl) : null;
  }

  return { rows, source: "bulk" };
}
