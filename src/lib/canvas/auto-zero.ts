/**
 * Canvas auto-zeroing: identifying non-submitters and filtering zeroed assignments.
 */

import { canvasError, parseNextLink, type CanvasInstitution } from "../canvas-core";
import { isZeroableAssignment } from "../grade-zeros";

/** A non-submitter for an assignment (missing submission past due date). */
export interface CanvasNonSubmitter {
  userId: number;
  name: string;
}

/** Result of listing non-submitters for an assignment. */
export interface CanvasMissingResult {
  assignmentId: string;
  assignmentName: string;
  pointsPossible: number | null;
  dueAt: string | null;
  nonSubmitters: CanvasNonSubmitter[];
  eligible: boolean;
  ineligibleReason?: string;
}

/** Assignment with due date, for filtering past-due assignments. */
export interface CanvasAssignmentWithDue {
  assignmentId: string;
  name: string;
  dueAt: string | null;
  pointsPossible: number | null;
  submissionTypes: string[] | null;
  gradingType: string | null;
  published: boolean | null;
  omitFromFinalGrade: boolean | null;
}

interface CanvasSubmission {
  user_id?: number;
  workflow_state?: string;
  submitted_at?: string | null;
  score?: number | null;
  cached_due_date?: string | null;
  excused?: boolean;
  user?: { name?: string; sortable_name?: string };
}

/**
 * List students who have not submitted an assignment by its deadline.
 * Filters based on workflow_state, submission timestamp, score, and due date.
 */
export async function listAssignmentNonSubmitters(
  baseUrl: string,
  token: string,
  institution: CanvasInstitution,
  courseId: string,
  assignmentId: string,
  nowIso: string
): Promise<CanvasMissingResult> {
  // Get assignment metadata
  const assignmentResponse = await fetch(
    `${baseUrl}/api/v1/courses/${courseId}/assignments/${assignmentId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!assignmentResponse.ok) {
    throw canvasError(assignmentResponse.status, institution);
  }
  const assignment = (await assignmentResponse.json()) as {
    id?: string;
    name?: string;
    due_at?: string | null;
    points_possible?: number | null;
    submission_types?: string[];
    grading_type?: string;
    published?: boolean;
    omit_from_final_grade?: boolean;
  };

  // Check if this assignment is eligible for auto-zeroing
  const eligible = isZeroableAssignment({
    submissionTypes: assignment.submission_types,
    gradingType: assignment.grading_type,
    published: assignment.published,
    omitFromFinalGrade: assignment.omit_from_final_grade,
  });

  if (!eligible) {
    let ineligibleReason = "cannot be auto-zeroed";
    if (assignment.published === false) {
      ineligibleReason = "is not published";
    } else if (assignment.grading_type === "not_graded") {
      ineligibleReason = "is not graded";
    } else if (assignment.omit_from_final_grade === true) {
      ineligibleReason = "is omitted from the final grade";
    } else {
      ineligibleReason = "does not take online submissions";
    }

    return {
      assignmentId: String(assignment.id ?? assignmentId),
      assignmentName: assignment.name ?? "Assignment",
      pointsPossible: assignment.points_possible ?? null,
      dueAt: assignment.due_at ?? null,
      nonSubmitters: [],
      eligible: false,
      ineligibleReason,
    };
  }

  // Page the submissions
  let next: string | null = `${baseUrl}/api/v1/courses/${courseId}/assignments/${assignmentId}/submissions?per_page=100&include[]=user`;
  const submissions: CanvasSubmission[] = [];

  while (next) {
    const response = await fetch(next, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw canvasError(response.status, institution);
    }
    const page = (await response.json()) as CanvasSubmission[];
    submissions.push(...page);
    next = parseNextLink(response.headers.get("link"));
  }

  const nonSubmitters: CanvasNonSubmitter[] = [];
  const now = new Date(nowIso).getTime();

  for (const row of submissions) {
    if (!row) continue;

    // Never zero excused students
    if (row.excused === true) continue;

    // Correctness-critical filtering
    if (row.workflow_state !== "unsubmitted") continue;
    if (row.submitted_at) continue;
    if (row.score !== null && row.score !== undefined) continue;
    if (typeof row.user_id !== "number") continue;

    // cached_due_date is the student's effective due date (overrides applied):
    // a string = their deadline, null = no deadline for them (do NOT zero),
    // absent = fall back to the assignment's base due date.
    const due = Object.prototype.hasOwnProperty.call(row, "cached_due_date")
      ? row.cached_due_date
      : assignment.due_at ?? null;
    if (!due) continue;
    if (new Date(due).getTime() >= now) continue;

    // Keep this non-submitter
    nonSubmitters.push({
      userId: row.user_id,
      name: row.user?.sortable_name?.trim() || row.user?.name?.trim() || `User ${row.user_id}`,
    });
  }

  nonSubmitters.sort((a, b) => a.name.localeCompare(b.name));

  return {
    assignmentId: String(assignment.id ?? assignmentId),
    assignmentName: assignment.name ?? "Assignment",
    pointsPossible: assignment.points_possible ?? null,
    dueAt: assignment.due_at ?? null,
    nonSubmitters,
    eligible: true,
  };
}

/**
 * List all assignments in a course with their basic metadata.
 * Used to identify which assignments are past their due date.
 */
export async function listAssignmentBriefsWithDue(
  baseUrl: string,
  token: string,
  institution: CanvasInstitution,
  courseId: string
): Promise<CanvasAssignmentWithDue[]> {
  let next: string | null = `${baseUrl}/api/v1/courses/${courseId}/assignments?per_page=100`;
  const assignments: CanvasAssignmentWithDue[] = [];

  while (next) {
    const response = await fetch(next, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw canvasError(response.status, institution);
    }
    const page = (await response.json()) as Array<{
      id?: string;
      name?: string;
      due_at?: string | null;
      points_possible?: number | null;
      submission_types?: string[];
      grading_type?: string;
      published?: boolean;
      omit_from_final_grade?: boolean;
    }>;

    for (const item of page) {
      if (item.id) {
        assignments.push({
          assignmentId: String(item.id),
          name: item.name ?? "Assignment",
          dueAt: item.due_at ?? null,
          pointsPossible: item.points_possible ?? null,
          submissionTypes: item.submission_types ?? null,
          gradingType: item.grading_type ?? null,
          published: item.published ?? null,
          omitFromFinalGrade: item.omit_from_final_grade ?? null,
        });
      }
    }

    next = parseNextLink(response.headers.get("link"));
  }

  return assignments;
}
