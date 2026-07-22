"use server";

import type { GradeActionState, MissingAssignmentReport } from "../actions-types";
import { gradeSubmissions, gradeCanvasUrl, synthesizeFullCreditChecklist, generateSampleAnswer, extractStudentEntries, extractCanvasEntries, generateRubric, gradeEntries, scaleResultToPoints, canvasWorkToEntry, type GradingRun, type GradingRunEntry, type StudentSubmissionEntry } from "@/lib/grade";
import { runSubmittedCode, type CodeRunResult } from "@/lib/code-runner";
import { buildEmbeddedRubric, gradeEntriesEmbedded, renderRubricText, buildDiscussionRubric, gradeDiscussion, renderDiscussionRubric } from "@/lib/embedded-grader";
import { rememberRubric } from "@/lib/research/rubric-bank";
import { detectCanvasUrlKind } from "@/lib/canvas-url";
import { fetchCanvasWork, canvasWorkToZipBase64, fetchCanvasMeta, fetchAssignmentPointsPossible, getSpeedGraderUrl, postCanvasGrades, listGradingQueue, getNeedsGradingCount, getUnreadCount, fetchSubmissionDetail, listAssignmentNonSubmitters, listAssignmentBriefsWithDue, type CanvasQueueItem, type CanvasSubmissionDetail, type CanvasStudentWork } from "@/lib/canvas";
import { resolveInstitution } from "@/lib/canvas-core";
import { normalizeProvider, type LlmProvider } from "@/lib/llm";
import { gradeViaGradingEngine, detectRubricSource, type GradingApiResponse } from "@/lib/grading-engine";
import { createServiceClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/supabase/auth";
import { listPendingGradingDrafts, getGradingDraft, createGradingDraft, markGradingDraftReviewed, updateGradingDraft, deleteGradingDraft, type GradingDraftPayload } from "@/lib/grading-drafts";
import { buildZeroGradingEntry, isZeroableAssignment } from "@/lib/grade-zeros";
import { listDismissals, addDismissal, removeDismissal } from "@/lib/grading-dismissals";



// Map the deterministic Grading API response onto the app's GradingRun so the
// existing results matrix in GradingTab renders it unchanged. The grader returns
// no per-student files and no full-credit checklist, so those degrade to "-" /
// hidden in the UI.
//
// When grading from a Canvas URL, pointsPossible re-bases the engine's rubric
// total onto the assignment's real scale (same anchoring as the AI path), so the
// tool never grades out of a different total than Canvas.
function gradingApiToRun(
  resp: GradingApiResponse,
  pointsPossible: number | null = null
): GradingRun {
  return {
    rubricAreaNames: resp.criteria,
    fullCreditChecklist: [],
    results: resp.students.map((s) => {
      const passedCount = s.criteria.filter((c) => c.passed).length;
      const rawAreas = s.criteria.map((c) => ({
        area: c.criterion,
        score: `${c.points_earned}/${c.points_possible}`,
        comment: c.detail,
      }));
      const scaled = scaleResultToPoints(rawAreas, `${s.total}/${s.possible}`, pointsPossible);
      return {
        student: s.student,
        totalScore: scaled.totalScore,
        overallComment: `${passedCount}/${s.criteria.length} checks passed`,
        feedback: "",
        mergedFileCount: 0,
        submittedFiles: [],
        rubricAreas: scaled.rubricAreas,
      };
    }),
  };
}

/**
 * Fetch a Canvas assignment/discussion's description + rubric so the grading
 * form can prefill the instructions and rubric boxes from a pasted URL.
 */
export async function fetchCanvasMetaAction(
  url: string
): Promise<{ description: string; rubricText: string; linkedFileIds: number[] } | { error: string }> {
  try {
    await requireOwner();
    // Return Canvas's own rubric only; never synthesize one when Canvas has none.
    return await fetchCanvasMeta(url);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load Canvas details." };
  }
}

/** Post reviewed grades + comments back to Canvas (one PUT per student). */
export async function postCanvasGradesAction(
  url: string,
  grades: Array<{
    userId: number;
    grade?: string;
    comment?: string;
    rubricAreas?: Array<{ area: string; score: string; comment: string }>;
  }>
): Promise<
  { posted: number; failures: Array<{ userId: number; error: string }> } | { error: string }
> {
  try {
    await requireOwner();
    return await postCanvasGrades(url, grades);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not post grades to Canvas." };
  }
}

// ── Grading drafts ───────────────────────────────────────────────────────
//
// Persistence for the unattended grade-to-draft step's output and the
// app-open review-grading-draft step's read/mark-reviewed calls. Every
// action below is owner-gated and uses the service-role client + the
// owner's own id (from requireOwner()) - the same pattern as the rest of
// this file's Supabase-backed actions - so it works identically whether
// called from a signed-in browser session or, via requireOwner()'s
// runAsOwner impersonation, from inside a headless cron run
// (src/app/api/cron/run-schedules/route.ts). NONE of these actions post
// anything to Canvas; posting only ever happens through
// postCanvasGradesAction above, called from the post-grades step after the
// user approves rows in the review table.

/** Save a new pending grading draft (the grade-to-draft step's output). */
export async function saveGradingDraftAction(
  summary: string,
  payload: GradingDraftPayload,
  workflowId?: string,
  workflowName?: string
): Promise<{ id: string } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const draft = await createGradingDraft(supabase, user.id, { summary, payload, workflowId, workflowName });
    return { id: draft.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the grading draft." };
  }
}


/**
 * List every student who has not submitted a past-due assignment in a Canvas
 * course (already-graded students and unexpired extensions are skipped).
 * Report only - creates no draft, writes nothing.
 */
export async function listMissingSubmissionsAction(input: {
  courseUrl: string;
  assignmentId?: string;
}): Promise<{ missing: MissingAssignmentReport[]; summary: string } | { error: string }> {
  try {
    await requireOwner();

    // Resolve institution/token from course URL
    const { baseUrl, token, institution } = resolveInstitution(input.courseUrl);

    // Parse course ID from URL
    const courseMatch = input.courseUrl.match(/courses\/(\d+)/);
    if (!courseMatch || !courseMatch[1]) {
      return { error: "Could not parse the Canvas course ID from the URL." };
    }
    const courseId = courseMatch[1];

    // Get current time for due date comparison
    const nowIso = new Date().toISOString();

    // Determine target assignment IDs
    let targetIds: string[] = [];
    if (input.assignmentId && input.assignmentId.trim()) {
      // Single assignment: extract numeric ID from URL or bare id
      const assignId = input.assignmentId.trim();
      const match = assignId.match(/assignments\/(\d+)/);
      const bareId = match ? match[1] : /^\d+$/.test(assignId) ? assignId : null;
      if (bareId) {
        targetIds = [bareId];
      } else {
        return { error: "Could not parse the assignment ID. Provide a URL or numeric ID." };
      }
    } else {
      // Sweep all past-due zeroable assignments
      const briefs = await listAssignmentBriefsWithDue(baseUrl, token, institution, courseId);
      const now = new Date(nowIso).getTime();
      targetIds = briefs
        .filter(
          (b) =>
            b.dueAt &&
            new Date(b.dueAt).getTime() < now &&
            isZeroableAssignment({
              submissionTypes: b.submissionTypes,
              gradingType: b.gradingType,
              published: b.published,
              omitFromFinalGrade: b.omitFromFinalGrade,
            })
        )
        .map((b) => b.assignmentId);
    }

    if (targetIds.length === 0) {
      return {
        missing: [],
        summary: "No missing submissions found.",
      };
    }

    // Collect missing submissions per assignment
    const missing: MissingAssignmentReport[] = [];

    for (const assignmentId of targetIds) {
      const result = await listAssignmentNonSubmitters(
        baseUrl,
        token,
        institution,
        courseId,
        assignmentId,
        nowIso
      );

      if (!result.eligible) {
        if (input.assignmentId) {
          return {
            missing: [],
            summary: `That assignment ${result.ineligibleReason ?? "cannot be processed"}.`,
          };
        }
        continue;
      }

      if (result.nonSubmitters.length === 0) {
        continue;
      }

      missing.push({
        assignmentId,
        assignmentName: result.assignmentName,
        dueAt: result.dueAt ?? null,
        pointsPossible: result.pointsPossible ?? null,
        students: result.nonSubmitters.map((s) => ({
          userId: s.userId,
          name: s.name,
        })),
      });
    }

    if (missing.length === 0) {
      return {
        missing: [],
        summary: "No missing submissions found.",
      };
    }

    const totalStudents = missing.reduce((sum, a) => sum + a.students.length, 0);
    const summary = `${totalStudents} student(s) missing work across ${missing.length} assignment(s).`;

    return { missing, summary };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not list missing submissions.",
    };
  }
}

/**
 * Draft zeros for students who did not submit an assignment by its deadline.
 * Resolves the Canvas course URL, fetches non-submitters, builds grading entries,
 * and saves a draft ready for review.
 */
export async function draftZerosForMissingAction(input: {
  courseUrl: string;
  assignmentId?: string;
}): Promise<
  { draftId: string | null; assignmentsAffected: number; zeroed: number; summary: string } | { error: string }
> {
  try {
    await requireOwner();
    const supabase = createServiceClient();

    // Resolve institution/token from course URL
    const { baseUrl, token, institution } = resolveInstitution(input.courseUrl);

    // Parse course ID from URL
    const courseMatch = input.courseUrl.match(/courses\/(\d+)/);
    if (!courseMatch || !courseMatch[1]) {
      return { error: "Could not parse the Canvas course ID from the URL." };
    }
    const courseId = courseMatch[1];

    // Get current time for due date comparison
    const nowIso = new Date().toISOString();

    // Determine target assignment IDs
    let targetIds: string[] = [];
    if (input.assignmentId && input.assignmentId.trim()) {
      // Single assignment: extract numeric ID from URL or bare id
      const assignId = input.assignmentId.trim();
      const match = assignId.match(/assignments\/(\d+)/);
      const bareId = match ? match[1] : /^\d+$/.test(assignId) ? assignId : null;
      if (bareId) {
        targetIds = [bareId];
      } else {
        return { error: "Could not parse the assignment ID. Provide a URL or numeric ID." };
      }
    } else {
      // Sweep all past-due zeroable assignments
      const briefs = await listAssignmentBriefsWithDue(baseUrl, token, institution, courseId);
      const now = new Date(nowIso).getTime();
      targetIds = briefs
        .filter(
          (b) =>
            b.dueAt &&
            new Date(b.dueAt).getTime() < now &&
            isZeroableAssignment({
              submissionTypes: b.submissionTypes,
              gradingType: b.gradingType,
              published: b.published,
              omitFromFinalGrade: b.omitFromFinalGrade,
            })
        )
        .map((b) => b.assignmentId);
    }

    if (targetIds.length === 0) {
      return {
        draftId: null,
        assignmentsAffected: 0,
        zeroed: 0,
        summary: "No missing submissions past the deadline were found.",
      };
    }

    // Build grading entries for each target assignment
    const entries: GradingRunEntry[] = [];
    let totalZeroed = 0;

    for (const assignmentId of targetIds) {
      const result = await listAssignmentNonSubmitters(
        baseUrl,
        token,
        institution,
        courseId,
        assignmentId,
        nowIso
      );

      if (!result.eligible) {
        if (input.assignmentId) {
          return {
            draftId: null,
            assignmentsAffected: 0,
            zeroed: 0,
            summary: `That assignment ${result.ineligibleReason ?? "cannot be auto-zeroed"}, so no zeros were drafted.`,
          };
        }
        continue;
      }

      if (result.nonSubmitters.length === 0) {
        continue;
      }

      totalZeroed += result.nonSubmitters.length;
      const entry = buildZeroGradingEntry({
        courseName: "Course",
        assignmentName: result.assignmentName,
        canvasUrl: `${baseUrl}/courses/${courseId}/assignments/${assignmentId}`,
        institution: institution.code,
        assignmentId,
        pointsPossible: result.pointsPossible,
        nonSubmitters: result.nonSubmitters,
      });

      entries.push(entry);
    }

    if (entries.length === 0) {
      return {
        draftId: null,
        assignmentsAffected: 0,
        zeroed: 0,
        summary: "No missing submissions past the deadline were found.",
      };
    }

    // Save the draft
    const user = await requireOwner();
    const summary = `Drafted 0 for ${totalZeroed} missing submission(s) across ${entries.length} assignment(s).`;
    const draft = await createGradingDraft(supabase, user.id, {
      summary,
      payload: { runs: entries },
    });

    return {
      draftId: draft.id,
      assignmentsAffected: entries.length,
      zeroed: totalZeroed,
      summary,
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Could not draft zeros for missing submissions.",
    };
  }
}

/** Lightweight listing (id/summary/createdAt only) of the owner's pending
 * drafts, oldest first. */
export async function listPendingGradingDraftsAction(): Promise<
  { drafts: Array<{ id: string; summary: string; createdAt: string }> } | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const drafts = await listPendingGradingDrafts(supabase, user.id);
    return {
      drafts: drafts.map((d) => ({ id: d.id, summary: d.summary, createdAt: d.createdAt })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load grading drafts." };
  }
}

/** One draft's full payload (the runs the review-grading-draft step
 * reconstructs into review rows). */
export async function getGradingDraftAction(
  id: string
): Promise<
  | {
      draft: {
        id: string;
        status: "pending" | "reviewed";
        summary: string;
        payload: GradingDraftPayload;
      };
    }
  | { error: string }
> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const draft = await getGradingDraft(supabase, user.id, id);
    if (!draft) {
      return { error: "That grading draft was not found." };
    }
    return {
      draft: {
        id: draft.id,
        status: draft.status,
        summary: draft.summary,
        payload: draft.payload,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the grading draft." };
  }
}

/** Mark a draft reviewed (called from the review table's transform closure
 * on submit only - never on skip). Idempotent, so a best-effort caller never
 * needs to check the draft's current status first. */
export async function markGradingDraftReviewedAction(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    await markGradingDraftReviewed(supabase, user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the grading draft." };
  }
}

/** Delete a draft outright (e.g. an optional "discard" action). */
export async function deleteGradingDraftAction(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    await deleteGradingDraft(supabase, user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the grading draft." };
  }
}

/** Persist edited scores/comments back to a pending draft. */
export async function updateGradingDraftPayloadAction(
  id: string,
  payload: GradingDraftPayload
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    await updateGradingDraft(supabase, user.id, id, { payload });
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save the grading draft." };
  }
}

/** Post EVERY gradable result in a draft to Canvas, then mark it reviewed.
 * Mirrors the post-grades step's payload construction. */
export async function postGradingDraftAction(
  id: string
): Promise<{ posted: number; failed: number } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const draft = await getGradingDraft(supabase, user.id, id);
    if (!draft) return { error: "That grading draft was not found." };

    let posted = 0;
    let failed = 0;
    const fractionRegex = /(-?\d+(?:\.\d+)?)\s*\/\s*-?\d+/;

    for (const entry of draft.payload.runs) {
      if (entry.offline || !entry.canvasUrl) continue;
      const grades = entry.run.results
        .filter((r) => typeof r.userId === "number")
        .map((r) => {
          const m = r.totalScore.match(fractionRegex);
          const grade = m ? m[1] : (r.totalScore.match(/-?\d+(?:\.\d+)?/) ?? [])[0] ?? "";
          return {
            userId: r.userId as number,
            grade,
            comment: r.overallComment,
            rubricAreas: r.rubricAreas,
          };
        });
      if (grades.length === 0) continue;
      const res = await postCanvasGradesAction(entry.canvasUrl, grades);
      if ("error" in res) {
        failed += grades.length;
      } else {
        posted += res.posted;
        failed += res.failures.length;
      }
    }

    if (failed === 0) {
      await markGradingDraftReviewed(supabase, user.id, id);
    }
    return { posted, failed };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not post the grades." };
  }
}

/** Run one submission's code on demand (the results page Run button). */
export async function runSubmissionCodeAction(
  files: Array<{ name: string; extension: string; rawBase64?: string; previewContent?: string }>
): Promise<CodeRunResult | null> {
  // Owner-gated like the rest of the file: this relays code execution through
  // the server's sandbox credentials.
  await requireOwner();
  return runSubmittedCode(files);
}

export async function pullSubmissionAction(
  code: string,
  courseId: string,
  assignmentId: string,
  userId: number
): Promise<{ submission: CanvasSubmissionDetail } | { error: string }> {
  try {
    await requireOwner();
    return { submission: await fetchSubmissionDetail(code.trim().toUpperCase(), courseId, assignmentId, userId) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not pull the submission." };
  }
}

/** Grade a single pulled-back submission, reusing the main grader. Returns a
 *  one-row run plus the assignment URL so the results table can post back. */
export async function gradeOneSubmissionAction(
  code: string,
  courseId: string,
  assignmentId: string,
  userId: number,
  provider: LlmProvider = "gemini"
): Promise<{ run: GradingRun; canvasUrl: string } | { error: string }> {
  try {
    await requireOwner();
    const c = code.trim().toUpperCase();
    const submission = await fetchSubmissionDetail(c, courseId, assignmentId, userId);
    const meta = await fetchCanvasMeta(submission.canvasUrl);
    const instructions = meta.description || submission.assignmentName;

    const work: CanvasStudentWork = {
      student: submission.student,
      userId: submission.userId,
      text: submission.text,
      files: submission.files,
      contributionCount: Math.max(1, submission.files.length + (submission.text ? 1 : 0)),
    };
    const entry = await canvasWorkToEntry(work);
    const speedGraderUrl = await getSpeedGraderUrl(submission.canvasUrl);
    // The external "other" engine needs a zip; fall back to gemini for a single submission.
    const gradeProvider: LlmProvider = provider === "other" ? "gemini" : provider;

    let run: GradingRun;
    if (gradeProvider === "embedded") {
      const builtRubric = buildEmbeddedRubric({ rubricText: meta.rubricText, instructions });
      if (builtRubric.checks.length === 0) {
        return { error: "No rubric or instructions were available to grade this with the deterministic engine." };
      }
      await attachCodeRuns([entry]);
      run = gradeEntriesEmbedded([entry], builtRubric, submission.pointsPossible);
    } else {
      const effectiveRubric = meta.rubricText.trim()
        ? meta.rubricText
        : await generateRubric(instructions, gradeProvider);
      run = await gradeEntries([entry], instructions, effectiveRubric, gradeProvider, submission.pointsPossible);
    }

    return { run: { ...run, speedGraderUrl }, canvasUrl: submission.canvasUrl };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not grade the submission." };
  }
}

export async function generateModelAnswerAction(
  instructions: string,
  rubric: string,
  provider: LlmProvider = "gemini",
  moduleContext: string = ""
): Promise<{ modelAnswer: string } | { error: string }> {
  try {
    await requireOwner();
    if (!instructions.trim()) return { error: "Provide the assignment instructions." };
    const answer = await generateSampleAnswer(instructions, rubric, provider, moduleContext);
    return { modelAnswer: typeof answer === "string" ? answer : String(answer) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate a model answer." };
  }
}

/**
 * Build the grading queue across the given institution acronyms: assignments and
 * graded discussions that currently have submissions needing grading, with their
 * description and rubric. Per-institution failures are reported, not fatal.
 */
export async function listGradingQueueAction(
  acronyms: string[]
): Promise<
  { rows: CanvasQueueItem[]; errors: Array<{ acronym: string; error: string }> } | { error: string }
> {
  try {
    await requireOwner();
    const rows: CanvasQueueItem[] = [];
    const errors: Array<{ acronym: string; error: string }> = [];
    await Promise.all(
      acronyms.map(async (raw) => {
        const code = raw.trim().toUpperCase();
        if (!code) return;
        try {
          rows.push(...(await listGradingQueue(code)));
        } catch (err) {
          errors.push({
            acronym: code,
            error: err instanceof Error ? err.message : "Failed to load.",
          });
        }
      })
    );
    rows.sort(
      (a, b) =>
        a.institution.localeCompare(b.institution) ||
        a.courseName.localeCompare(b.courseName) ||
        a.title.localeCompare(b.title)
    );
    return { rows, errors };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load the grading queue." };
  }
}

/**
 * Per-institution notification counts for the tab + switcher badges: submissions
 * needing grading and unread inbox messages. Per-institution failures degrade to
 * 0 so one misconfigured school doesn't blank every badge.
 */
/** The user's seen assignments and unwatched courses, for filtering the feed. */
export async function listGradingDismissalsAction(): Promise<
  | {
      assignments: Array<{ institution: string; refId: string }>;
      courses: Array<{ institution: string; refId: string }>;
    }
  | { error: string }
> {
  try {
    const user = await requireOwner();
    const all = await listDismissals(user.id);
    return {
      assignments: all
        .filter((d) => d.scope === "assignment")
        .map((d) => ({ institution: d.institution, refId: d.refId })),
      courses: all
        .filter((d) => d.scope === "course")
        .map((d) => ({ institution: d.institution, refId: d.refId })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load your grading preferences." };
  }
}

/** Mark an assignment seen (hide it from the feed/badge), or undo that. */
export async function setAssignmentSeenAction(
  institution: string,
  assignmentId: string,
  seen: boolean
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const code = institution.trim().toUpperCase();
    if (seen) await addDismissal(user.id, "assignment", code, assignmentId);
    else await removeDismissal(user.id, "assignment", code, assignmentId);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the assignment." };
  }
}

/** Stop watching a course (no more notifications for it), or resume watching. */
export async function setCourseWatchedAction(
  institution: string,
  courseId: string,
  watched: boolean
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const code = institution.trim().toUpperCase();
    // "not watched" is stored as a 'course' dismissal.
    if (!watched) await addDismissal(user.id, "course", code, courseId);
    else await removeDismissal(user.id, "course", code, courseId);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update the course." };
  }
}

export async function getInstitutionCountsAction(
  acronyms: string[]
): Promise<
  { counts: Array<{ acronym: string; needsGrading: number; unread: number }> } | { error: string }
> {
  try {
    const user = await requireOwner();
    // Exclude assignments marked "seen" and courses the user stopped watching so
    // the badge matches the filtered Live Feed.
    const dismissals = await listDismissals(user.id);
    const assignmentsByCode = new Map<string, Set<string>>();
    const coursesByCode = new Map<string, Set<string>>();
    for (const d of dismissals) {
      const map = d.scope === "assignment" ? assignmentsByCode : coursesByCode;
      const set = map.get(d.institution) ?? new Set<string>();
      set.add(d.refId);
      map.set(d.institution, set);
    }
    const counts = await Promise.all(
      acronyms.map(async (raw) => {
        const code = raw.trim().toUpperCase();
        if (!code) return { acronym: code, needsGrading: 0, unread: 0 };
        const exclude = {
          courses: coursesByCode.get(code),
          assignments: assignmentsByCode.get(code),
        };
        const [needsGrading, unread] = await Promise.all([
          getNeedsGradingCount(code, exclude).catch(() => 0),
          getUnreadCount(code).catch(() => 0),
        ]);
        return { acronym: code, needsGrading, unread };
      })
    );
    return { counts };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load notification counts." };
  }
}

/**
 * Unread inbox counts only — cheap (one call per school), for refreshing the
 * Communications badge after read/archive without re-running the needs-grading scan.
 */
export async function getUnreadCountsAction(
  acronyms: string[]
): Promise<{ counts: Array<{ acronym: string; unread: number }> } | { error: string }> {
  try {
    await requireOwner();
    const counts = await Promise.all(
      acronyms.map(async (raw) => {
        const code = raw.trim().toUpperCase();
        if (!code) return { acronym: code, unread: 0 };
        const unread = await getUnreadCount(code).catch(() => 0);
        return { acronym: code, unread };
      })
    );
    return { counts };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not load unread counts." };
  }
}

// Grade a submissions zip with the deterministic ("Other") grading service.
// Shared by the uploaded-zip path and the Canvas path (which synthesizes a zip).
async function gradeZipViaEngine(
  zipBase64: string,
  rubric: string,
  rubricFile: File | null,
  institutionCode?: string,
  // Canvas points_possible when grading from a Canvas URL; null for zip uploads.
  pointsPossible: number | null = null
): Promise<GradeActionState> {
  let rubricText = "";
  let rubricName: string | undefined;
  if (rubricFile && rubricFile.size > 0) {
    rubricText = await rubricFile.text();
    rubricName = rubricFile.name;
  } else if (rubric.trim()) {
    rubricText = rubric;
  }
  if (!rubricText.trim()) {
    return {
      run: null,
      error:
        "Provide a rubric (upload a CSV/JSON file or paste one) to grade with the deterministic grader.",
    };
  }
  const resp = await gradeViaGradingEngine(
    zipBase64,
    detectRubricSource(rubricText, rubricName),
    institutionCode
  );
  const warnings = [
    ...resp.warnings,
    ...(resp.unmapped_criteria?.length
      ? [`Excluded (unmapped): ${resp.unmapped_criteria.join(", ")}`]
      : []),
  ];
  return { run: gradingApiToRun(resp, pointsPossible), error: null, warnings };
}

/** Run every entry's code in the sandbox (sequential, to respect Piston rate
 *  limits) and stash the result on the entry so the embedded engine can score it
 *  without doing any network itself. Entries with no runnable code get null. */
async function attachCodeRuns(entries: StudentSubmissionEntry[]): Promise<void> {
  for (const entry of entries) {
    entry.codeRun = await runSubmittedCode(entry.submittedFiles);
  }
}

export async function gradeAction(
  _prev: GradeActionState,
  formData: FormData
): Promise<GradeActionState> {
  const file = formData.get("studentSubmissions") as File | null;
  const canvasUrl = ((formData.get("canvasUrl") as string | null) ?? "").trim();
  const assignmentInstructions =
    (formData.get("assignmentInstructions") as string | null) ?? "";
  const rubric = (formData.get("rubric") as string | null) ?? "";
  const provider = normalizeProvider(formData.get("provider") as string | null);
  const rubricFile = formData.get("rubricFile") as File | null;
  // Optional institution acronym (Live Feed Auto Grade) — routes the
  // deterministic grader to that school's endpoint; blank uses the global one.
  const institution = ((formData.get("institution") as string | null) ?? "").trim() || undefined;

  try {
    await requireOwner();

    // Canvas source: grade each student's discussion posts or assignment
    // submission (kind auto-detected from the URL). Routes by provider — the
    // deterministic grader gets a synthesized zip; Gemini grades the text/files.
    if (canvasUrl) {
      // SpeedGrader base URL for per-student deep links in the results table.
      // Best-effort: a failure here must not block grading.
      const speedGraderUrl = await getSpeedGraderUrl(canvasUrl).catch(() => null);

      if (provider === "other") {
        const [{ students }, pointsPossible] = await Promise.all([
          fetchCanvasWork(canvasUrl),
          fetchAssignmentPointsPossible(canvasUrl),
        ]);
        // Everything that came back is already graded (or there is nothing to
        // grade): return an empty run so the UI shows its "nothing left" state
        // instead of sending an empty archive to the engine.
        if (students.length === 0) {
          return { run: { results: [], rubricAreaNames: [], fullCreditChecklist: [], speedGraderUrl }, error: null };
        }
        const zipBase64 = await canvasWorkToZipBase64(students);
        const state = await gradeZipViaEngine(zipBase64, rubric, rubricFile, institution, pointsPossible);
        return state.run ? { ...state, run: { ...state.run, speedGraderUrl } } : state;
      }

      // Embedded Deterministic Engine: grade in-process against the Canvas rubric
      // when one is present, otherwise a rubric generated from the instructions.
      if (provider === "embedded") {
        // Discussions are graded on participation/engagement signals, not the
        // generic file/keyword checks, so route them to the discussion grader.
        if (detectCanvasUrlKind(canvasUrl) === "discussion") {
          const [{ students, dueAt }, pointsPossible] = await Promise.all([
            fetchCanvasWork(canvasUrl),
            fetchAssignmentPointsPossible(canvasUrl),
          ]);
          const discussionStudents = students
            .filter((s) => s.discussion)
            .map((s) => ({ student: s.student, userId: s.userId, activity: s.discussion! }));
          if (discussionStudents.length === 0) {
            return { run: { results: [], rubricAreaNames: [], fullCreditChecklist: [], speedGraderUrl }, error: null };
          }
          const participants = students.map((s) => ({ userId: s.userId, name: s.student }));
          const source = [assignmentInstructions, rubric].filter((t) => t.trim()).join("\n");
          const discussionRubric = buildDiscussionRubric(source);
          const run = gradeDiscussion(discussionStudents, discussionRubric, { dueAt, participants }, pointsPossible);
          return {
            run: { ...run, speedGraderUrl },
            error: null,
            warnings: discussionRubric.warnings,
            generatedRubric: renderDiscussionRubric(discussionRubric),
          };
        }

        const { entries, pointsPossible } = await extractCanvasEntries(canvasUrl);
        if (entries.length === 0) {
          return { run: { results: [], rubricAreaNames: [], fullCreditChecklist: [], speedGraderUrl }, error: null };
        }
        const builtRubric = buildEmbeddedRubric({ rubricText: rubric, instructions: assignmentInstructions });
        if (builtRubric.checks.length === 0) {
          return { run: null, error: builtRubric.warnings[0] ?? "Provide a rubric or assignment instructions." };
        }
        // Grow the rubric bank from human-authored rubrics (fire-and-forget).
        if (rubric.trim()) void rememberRubric(assignmentInstructions, rubric);
        await attachCodeRuns(entries);
        const run = gradeEntriesEmbedded(entries, builtRubric, pointsPossible);
        return {
          run: { ...run, speedGraderUrl },
          error: null,
          warnings: builtRubric.warnings.length ? builtRubric.warnings : undefined,
          generatedRubric: builtRubric.origin === "instructions" ? renderRubricText(builtRubric) : undefined,
        };
      }

      if (!assignmentInstructions.trim()) {
        return { run: null, error: "Please provide assignment instructions." };
      }
      // No rubric synthesis on the Canvas path: grade with whatever rubric was
      // retrieved from Canvas (may be empty), using the instructions otherwise.
      const [run, fullCreditChecklist, sampleAnswer] = await Promise.all([
        gradeCanvasUrl(canvasUrl, assignmentInstructions, rubric, provider),
        synthesizeFullCreditChecklist(assignmentInstructions, rubric, provider),
        generateSampleAnswer(assignmentInstructions, rubric, provider),
      ]);
      return { run: { ...run, fullCreditChecklist, sampleAnswer, speedGraderUrl }, error: null };
    }

    if (!file || file.size === 0) {
      return { run: null, error: "Please upload a student submissions zip file." };
    }

    // Deterministic Grading API path (provider toggle = "other").
    if (provider === "other") {
      const zipBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
      return gradeZipViaEngine(zipBase64, rubric, rubricFile, institution);
    }

    // Embedded Deterministic Engine path (provider toggle = "embedded"). Grades
    // in-process against a supplied rubric, or one generated from the instructions.
    if (provider === "embedded") {
      const entries = await extractStudentEntries(await file.arrayBuffer());
      if (entries.length === 0) {
        return { run: { results: [], rubricAreaNames: [], fullCreditChecklist: [] }, error: null };
      }
      const rubricText = rubricFile && rubricFile.size > 0 ? await rubricFile.text() : rubric;
      const rubricName = rubricFile && rubricFile.size > 0 ? rubricFile.name : undefined;
      const builtRubric = buildEmbeddedRubric({
        rubricText,
        rubricFileName: rubricName,
        instructions: assignmentInstructions,
      });
      if (builtRubric.checks.length === 0) {
        return { run: null, error: builtRubric.warnings[0] ?? "Provide a rubric or assignment instructions." };
      }
      // Grow the rubric bank from human-authored rubrics (fire-and-forget).
      if (rubricText.trim()) void rememberRubric(assignmentInstructions, rubricText);
      await attachCodeRuns(entries);
      const run = gradeEntriesEmbedded(entries, builtRubric);
      return {
        run,
        error: null,
        warnings: builtRubric.warnings.length ? builtRubric.warnings : undefined,
        generatedRubric: builtRubric.origin === "instructions" ? renderRubricText(builtRubric) : undefined,
      };
    }

    // Gemini path.
    if (!assignmentInstructions.trim()) {
      return { run: null, error: "Please provide assignment instructions." };
    }

    const effectiveRubric = rubric.trim()
      ? rubric
      : await generateRubric(assignmentInstructions, provider);
    const generatedRubric = rubric.trim() ? undefined : effectiveRubric;

    const zipBuffer = await file.arrayBuffer();
    const [run, fullCreditChecklist, sampleAnswer] = await Promise.all([
      gradeSubmissions(zipBuffer, assignmentInstructions, effectiveRubric, provider),
      synthesizeFullCreditChecklist(assignmentInstructions, effectiveRubric, provider),
      generateSampleAnswer(assignmentInstructions, effectiveRubric, provider),
    ]);

    return {
      run: {
        ...run,
        fullCreditChecklist,
        sampleAnswer,
      },
      error: null,
      generatedRubric,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return { run: null, error: message };
  }
}

export async function generateFullCreditChecklistAction(
  instructions: string,
  rubric: string,
  provider: LlmProvider = "gemini"
): Promise<{ checklist: string } | { error: string }> {
  try {
    await requireOwner();
    if (!instructions.trim()) return { error: "Provide the assignment instructions." };
    const items = await synthesizeFullCreditChecklist(instructions, rubric, provider);
    const checklist = items.join("\n");
    return { checklist };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the checklist." };
  }
}
