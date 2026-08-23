import { resolveCourse } from "../canvas-core";
import { fetchAll, writeJson } from "./fetch-helpers";
import { createThrottleBudget } from "../canvas-throttle";
import type { BulkItem, BulkKind } from "./types";
import type { RawPage, RawBulkAssignment, RawBulkQuiz, RawBulkDiscussion } from "./raw-types";
import { isNewQuizAssignment } from "./new-quiz";

/** List items of one kind with the fields the bulk editor shows and edits. */
export async function listBulkItems(
  courseUrl: string,
  kind: BulkKind,
  code?: string
): Promise<BulkItem[]> {
  const ctx = resolveCourse(courseUrl, code);
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;

  if (kind === "Page") {
    const raw = await fetchAll<RawPage>(`${base}/pages?per_page=100&sort=title`, ctx);
    return raw
      .filter((p) => typeof p.url === "string" && p.url.length > 0)
      .map((p) => ({
        id: p.url!,
        title: (p.title ?? "").trim() || "(untitled)",
        published: p.published ?? false,
        dueAt: null,
        pointsPossible: null,
      }));
  }
  if (kind === "Assignment" || kind === "Quiz") {
    // Both branches read the SAME assignments page: a New Quiz has no Quiz
    // object at all (D1), so the only way to find one is the assignments
    // endpoint - the Quiz branch below needs this fetch just as much as the
    // Assignment branch does. Classifying once here and branching on the
    // result is what lets BOTH tabs show a New Quiz (Assignment's own branch
    // below no longer excludes it, per the bug fix documented there) while
    // still labelling it consistently in each: this is one Canvas object
    // that genuinely belongs on both Canvas's own Assignments and Quizzes
    // pages, not two independently-derived guesses that could disagree.
    const rawAssignments = await fetchAll<RawBulkAssignment>(`${base}/assignments?per_page=100`, ctx);
    const assignmentRows = rawAssignments
      .filter((a) => typeof a.id === "number")
      .map((a) => ({
        raw: a,
        isNewQuiz: isNewQuizAssignment({
          submissionTypes: a.submission_types,
          isQuizAssignment: a.is_quiz_assignment,
          quizId: a.quiz_id,
        }),
        // A CLASSIC quiz's shadow assignment: `quiz_id` populated means this
        // assignment row IS the same Canvas quiz object already listed by
        // the Quiz branch's own /quizzes fetch below (per the docs quoted in
        // new-quiz.ts, quiz_id is populated only on a classic quiz's shadow
        // assignment). This is the same disqualifying signal new-quiz.ts
        // already uses to keep a classic quiz's shadow OUT of the New Quiz
        // set; here it is carried through as a LABEL (see the Assignment
        // branch below), not an exclusion.
        isClassicQuizShadow: a.quiz_id !== undefined && a.quiz_id !== null,
        // A graded DISCUSSION's shadow assignment: Canvas creates one of
        // these for every graded discussion topic, the same way it does for
        // classic quizzes, identified by submission_types including
        // "discussion_topic".
        isDiscussionShadow:
          Array.isArray(a.submission_types) && a.submission_types.includes("discussion_topic"),
      }));

    if (kind === "Assignment") {
      // BUG FIX (live report 2026-08-22): this branch used to EXCLUDE New
      // Quizzes, classic-quiz shadow rows and graded-discussion shadow rows,
      // reasoning that none of them was "an assignment" the way this tab
      // means it. That reasoning was wrong, and it is what the reported bug
      // actually was: a course with one real "Syllabus Acknowledgement"
      // assignment plus three classic "Syllabus Acknowledgement" quizzes
      // shows all FOUR objects on Canvas's own Assignments page (a Canvas
      // quiz or graded discussion IS backed by an assignment record), but
      // this tab silently dropped the three quiz rows - Canvas's own
      // "double-listing" of a quiz/discussion (once under Assignments, once
      // under Quizzes/Discussions) is the platform's data model, not a
      // mistake to hide. Making rows vanish is a worse failure than showing
      // a title twice with an explanation, so every assignment-shaped row is
      // returned here now, each flagged for what it really is so
      // CourseItemsView.tsx can label it (A2) - never silently
      // indistinguishable from an ordinary assignment. Deleting any of these
      // rows still deletes the underlying Canvas object it really is
      // (DELETE /assignments/{id} cascades for a quiz/discussion shadow, and
      // a New Quiz IS an assignment) - see courseItems-routing.ts and
      // course-copy-purge.ts for how writes and purges still route by the
      // row's real kind, never by this tab alone.
      return assignmentRows.map(({ raw: a, isNewQuiz, isClassicQuizShadow, isDiscussionShadow }) => ({
        id: String(a.id),
        title: (a.name ?? "").trim() || `Assignment ${a.id}`,
        published: a.published ?? false,
        dueAt: a.due_at ?? null,
        pointsPossible: typeof a.points_possible === "number" ? a.points_possible : null,
        isNewQuiz: isNewQuiz || undefined,
        isClassicQuizShadow: isClassicQuizShadow || undefined,
        // The underlying quiz's own id, straight off the same `quiz_id` field
        // that set `isClassicQuizShadow` - see that flag's own doc comment in
        // types.ts for why courseItems-modules.ts needs it.
        shadowQuizId: isClassicQuizShadow && typeof a.quiz_id === "number" ? a.quiz_id : undefined,
        isGradedDiscussionShadow: isDiscussionShadow || undefined,
        // The underlying discussion topic's own id, straight off Canvas's
        // `discussion_topic.id` field - present on the assignment payload as
        // a base field, not gated behind the assignments-index endpoint's
        // include[] allowlist (see raw-types.ts's own citation). Absent when
        // Canvas's response genuinely does not carry it for this row -
        // courseItems-modules.ts treats that as UNKNOWN, never "no module".
        shadowDiscussionTopicId:
          isDiscussionShadow && typeof a.discussion_topic?.id === "number" ? a.discussion_topic.id : undefined,
      }));
    }

    // kind === "Quiz": unchanged by the Assignment-branch bug fix above (A6).
    // Classic quizzes come from their own endpoint (a separate page from the
    // assignments fetch above, so this is genuinely two independent lists,
    // not a re-slice of one). New Quizzes are taken from the SAME
    // assignmentRows the Assignment branch now also returns them from - one
    // Canvas object correctly appearing in both listings, each flagged
    // isNewQuiz: true so the view can label them and withhold operations
    // that do not apply (C2, C4). The row's id is the underlying ASSIGNMENT
    // id (New Quizzes have no quiz id to use instead), which matters for
    // every write path: a New Quiz must be addressed as an assignment, never
    // as a quiz (courseItems-routing.ts).
    const rawQuizzes = await fetchAll<RawBulkQuiz>(`${base}/quizzes?per_page=100`, ctx);
    const classicQuizzes: BulkItem[] = rawQuizzes
      .filter((q) => typeof q.id === "number")
      .map((q) => ({
        id: String(q.id),
        title: (q.title ?? "").trim() || `Quiz ${q.id}`,
        published: q.published ?? false,
        dueAt: q.due_at ?? null,
        pointsPossible: typeof q.points_possible === "number" ? q.points_possible : null,
      }));
    const newQuizzes: BulkItem[] = assignmentRows
      .filter((row) => row.isNewQuiz)
      .map(({ raw: a }) => ({
        id: String(a.id),
        title: (a.name ?? "").trim() || `Assignment ${a.id}`,
        published: a.published ?? false,
        dueAt: a.due_at ?? null,
        pointsPossible: typeof a.points_possible === "number" ? a.points_possible : null,
        isNewQuiz: true,
      }));
    return [...classicQuizzes, ...newQuizzes];
  }
  const raw = await fetchAll<RawBulkDiscussion>(`${base}/discussion_topics?per_page=100`, ctx);
  return raw
    .filter((d) => typeof d.id === "number" && !d.is_announcement)
    .map((d) => ({
      id: String(d.id),
      title: (d.title ?? "").trim() || `Discussion ${d.id}`,
      published: d.published ?? false,
      dueAt: d.assignment?.due_at ?? null,
      pointsPossible:
        typeof d.assignment?.points_possible === "number" ? d.assignment.points_possible : null,
    }));
}

type BulkResult = { updated: number; failures: Array<{ id: string; error: string }> };

function bulkUpdateRequest(
  base: string,
  kind: BulkKind,
  id: string,
  fields: { published?: boolean; pointsPossible?: number; submissionType?: string }
): { url: string; params: URLSearchParams } {
  const params = new URLSearchParams();
  if (kind === "Assignment") {
    if (fields.published !== undefined) params.append("assignment[published]", String(fields.published));
    if (fields.pointsPossible !== undefined) {
      params.append("assignment[points_possible]", String(fields.pointsPossible));
    }
    if (fields.submissionType !== undefined) params.append("assignment[submission_types][]", fields.submissionType);
    return { url: `${base}/assignments/${id}`, params };
  }
  if (kind === "Quiz") {
    if (fields.published !== undefined) params.append("quiz[published]", String(fields.published));
    if (fields.pointsPossible !== undefined) {
      params.append("quiz[points_possible]", String(fields.pointsPossible));
    }
    return { url: `${base}/quizzes/${id}`, params };
  }
  if (kind === "Discussion") {
    if (fields.published !== undefined) params.append("published", String(fields.published));
    return { url: `${base}/discussion_topics/${id}`, params };
  }
  if (fields.published !== undefined) params.append("wiki_page[published]", String(fields.published));
  return { url: `${base}/pages/${encodeURIComponent(id)}`, params };
}

/** Apply published and/or points-possible changes to many items of one kind. */
export async function bulkUpdate(
  courseUrl: string,
  kind: BulkKind,
  ids: string[],
  fields: { published?: boolean; pointsPossible?: number; submissionType?: string },
  code?: string
): Promise<BulkResult> {
  // ONE budget for the whole loop, not one per write: N ids are written inside
  // a single server invocation, so under a sustained throttle an unbounded
  // per-write retry would burn the full backoff on every id and blow the 60s
  // function cap - reporting nothing instead of per-item failures. See
  // src/lib/canvas-throttle.ts.
  const ctx = { ...resolveCourse(courseUrl, code), throttleBudget: createThrottleBudget() };
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;
  let updated = 0;
  const failures: Array<{ id: string; error: string }> = [];
  for (const id of ids) {
    try {
      const { url, params } = bulkUpdateRequest(base, kind, id, fields);
      if ([...params.keys()].length === 0) continue;
      await writeJson(url, "PUT", ctx, params);
      updated += 1;
    } catch (err) {
      failures.push({ id, error: err instanceof Error ? err.message : "Update failed." });
    }
  }
  return { updated, failures };
}

/** Delete many items of one kind. */
export async function bulkDelete(
  courseUrl: string,
  kind: BulkKind,
  ids: string[],
  code?: string
): Promise<BulkResult> {
  // One shared budget for the whole delete loop - same reasoning as bulkUpdate.
  const ctx = { ...resolveCourse(courseUrl, code), throttleBudget: createThrottleBudget() };
  const base = `${ctx.baseUrl}/api/v1/courses/${ctx.courseId}`;
  const path =
    kind === "Assignment"
      ? "assignments"
      : kind === "Quiz"
        ? "quizzes"
        : kind === "Discussion"
          ? "discussion_topics"
          : "pages";
  let updated = 0;
  const failures: Array<{ id: string; error: string }> = [];
  for (const id of ids) {
    try {
      const ref = kind === "Page" ? encodeURIComponent(id) : id;
      await writeJson(`${base}/${path}/${ref}`, "DELETE", ctx);
      updated += 1;
    } catch (err) {
      failures.push({ id, error: err instanceof Error ? err.message : "Delete failed." });
    }
  }
  return { updated, failures };
}
