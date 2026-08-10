"use server";

// Server actions for the two one-click LMS-tab buttons
// (docs/lms-tab-syllabus-buttons-acceptance-criteria.md): a Syllabus
// Acknowledgement quiz, and generating + inserting the course syllabus. Both
// resolve their course row from the tab's Canvas URL the same way (AC S1/S2)
// via the shared resolveLmsCourseRowAction below, so that lookup and its "not
// linked" message live once instead of being copy-pasted into each action.
//
// Every Canvas/library write below reuses an already-existing, already-proven
// action (see the reuse survey in the AC doc) - this file only sequences
// them; no new Canvas client code is added anywhere in this feature.
import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { loadInstitutionFields } from "@/lib/institution-fields";
import { courseToInputPayload } from "@/lib/workflows/registry-helpers";
import { buildSyllabusFactsFromCourse, resolveSyllabusTemplateId } from "@/lib/syllabus-facts";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import { findCourseForCanvasUrl } from "@/lib/course-canvas-url-match";
import { computeSyllabusAckDueAt, findExistingAckQuiz, SYLLABUS_ACK_QUIZ_TITLE } from "@/lib/syllabus-ack-quiz";
import { findStartHereModule, resolveModuleForSyllabusPlacement } from "@/lib/lms-start-here-module";
import type { LlmProvider } from "@/lib/llm";
import type { Course } from "@/lib/supabase/courses";
import { listCourseHubAction, updateCourseHubAction } from "./course-hub-core";
import { createGradableAction, createQuizQuestionAction, bulkUpdateAction, listBulkItemsAction } from "./canvas-files-bulk";
import { listCourseContentAction, createModuleItemAction, placeSyllabusInModuleAction } from "./canvas-modules";
import { generateCourseSyllabusAction, createFinalizedSyllabusAction, createSyllabusTemplateAction } from "./syllabus-templates";

/** AC S2: both buttons report a specific, actionable message naming the URL
 * when no course row is linked to it - never a generic failure. Shared so
 * the wording can never drift between the two buttons. Not exported (a "use
 * server" module may export only async functions - src/lib/use-server-exports.test.ts). */
function courseNotLinkedError(canvasUrl: string): { error: string } {
  return {
    error: `No saved course is linked to ${canvasUrl}. Set this course's Canvas URL on its course row, then try again.`,
  };
}

/** The course's base "…/courses/<id>" URL, for building direct Canvas links -
 * same regex ModulesView.tsx already uses for its own "Open on Canvas"
 * links. Not exported. */
function courseBaseUrl(canvasUrl: string): string {
  return canvasUrl.replace(/(\/courses\/\d+).*$/, "$1");
}

/**
 * AC S1: resolve the LMS tab's currently loaded Canvas course to a saved
 * course row, matching on parseCanvasCourseId(url) AND host (never raw
 * string equality - see course-canvas-url-match.ts) so a trailing slash or a
 * query string does not defeat it. Returns the row or an explicit,
 * URL-naming not-found (AC S2) - never throws. Exported as its own action per
 * AC S1, and also called directly (as a plain function - both live in this
 * same "use server" module, so this is an ordinary in-process call, not a
 * second network round trip) by both button actions below, so the lookup and
 * its "not linked" wording exist in exactly one place.
 */
export async function resolveLmsCourseRowAction(canvasUrl: string): Promise<{ course: Course } | { error: string }> {
  try {
    await requireOwner();
    const hub = await listCourseHubAction();
    if ("error" in hub) return { error: hub.error };
    const course = findCourseForCanvasUrl(hub.courses, canvasUrl);
    if (!course) return courseNotLinkedError(canvasUrl);
    return { course };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not resolve the course." };
  }
}

/**
 * Button 1 - Syllabus Acknowledgement quiz (AC B1-1..B1-8). One click on the
 * happy path: resolve the course row, skip if the quiz already exists
 * (idempotent by title, AC B1-5 - unlike the starter-materials workflow step
 * this sequence is copied from, docs/REGRESSION.md #248 check 3), otherwise
 * create a 1-point true/false quiz due 3 days after the course's start date,
 * publish it, and link it into "Start Here" when that module exists.
 */
export async function createSyllabusAckQuizAction(
  canvasUrl: string,
  acronym?: string
): Promise<{ message: string } | { error: string }> {
  try {
    await requireOwner();

    const resolved = await resolveLmsCourseRowAction(canvasUrl);
    if ("error" in resolved) return resolved;
    const { course } = resolved;

    // Idempotency check FIRST (AC B1-5): if the quiz already exists, nothing
    // is created and the due-date-derivation error path below never applies,
    // even if the course's start date has since been cleared - there is
    // nothing left to create, so a missing start date is irrelevant here.
    const existing = await listBulkItemsAction(canvasUrl, "Quiz", acronym);
    if ("error" in existing) return { error: existing.error };

    const base = courseBaseUrl(canvasUrl);
    const already = findExistingAckQuiz(existing.items);
    if (already) {
      return {
        message: `"${SYLLABUS_ACK_QUIZ_TITLE}" is already present - nothing created: ${base}/quizzes/${already.id}`,
      };
    }

    // AC B1-2/B1-3: due date derivation; refuses to create a due-date-less
    // quiz when the course row has no start date.
    const due = computeSyllabusAckDueAt(course.startDate);
    if ("error" in due) return { error: due.error };

    const quiz = await createGradableAction(
      canvasUrl,
      "Quiz",
      {
        title: SYLLABUS_ACK_QUIZ_TITLE,
        description: "Confirm you have read and understood the course syllabus.",
        // AC B1-4: createGradable's Quiz branch DISCARDS pointsPossible
        // entirely (gradables.ts:79-83) - the 1 point comes ONLY from the
        // true_false_question created below, never from a field here.
        dueAt: due.dueAt,
      },
      acronym
    );
    if ("error" in quiz) return { error: quiz.error };

    const question = await createQuizQuestionAction(
      canvasUrl,
      quiz.id,
      {
        name: "Syllabus acknowledgement",
        text: "I read and understand the syllabus.",
        type: "true_false_question",
        points: 1,
        answers: [
          { text: "True", correct: true },
          { text: "False", correct: false },
        ],
      },
      acronym
    );
    if ("error" in question) return { error: question.error };

    // AC B1-6: publish, since an unpublished acknowledgement quiz is
    // invisible to students and would make the one-click promise false.
    const publish = await bulkUpdateAction(canvasUrl, "Quiz", [String(quiz.id)], { published: true }, acronym);
    if ("error" in publish) return { error: publish.error };

    // AC B1-7: link into "Start Here" when it exists; never create a module
    // as a side effect - a bigger action than the instructor asked for.
    let linkNote = `not linked into any module - no "Start Here" module exists`;
    const content = await listCourseContentAction(canvasUrl, acronym);
    if (!("error" in content)) {
      const startHere = findStartHereModule(content.modules);
      if (startHere) {
        const item = await createModuleItemAction(
          canvasUrl,
          startHere.id,
          { type: "Quiz", contentId: quiz.id, title: SYLLABUS_ACK_QUIZ_TITLE },
          acronym
        );
        linkNote = "error" in item ? `not linked into "Start Here" (${item.error})` : `linked into "Start Here"`;
      }
    }

    // AC B1-8: report the title and a link to it in Canvas.
    const dueLabel = new Date(due.dueAt).toLocaleDateString();
    return {
      message: `Created and published "${SYLLABUS_ACK_QUIZ_TITLE}" (due ${dueLabel}), ${linkNote}: ${base}/quizzes/${quiz.id}`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create the Syllabus Acknowledgement quiz." };
  }
}

/**
 * Button 2 - generate the syllabus and insert it into Canvas (AC B2-1..B2-8).
 * Attaches the generated .docx as a module-item FILE, never the Canvas
 * Syllabus page (AC decision 1 - no docx-to-HTML converter exists in this
 * repo and building one would be lossy for a template's tables/styling).
 *
 * Two-call shape because AC B2-3 requires collecting a brand-new template
 * from the user exactly when none is resolvable: called with `newTemplate`
 * omitted, this returns `{needsTemplate: true}` (not an error) when neither
 * the course nor its institution has a template, so the caller can prompt
 * for a .docx and re-call this SAME action with `newTemplate` set - which
 * uploads it, assigns it to the course row, and completes the rest of the
 * flow (generate, save, persist, attach) in that one follow-up call. That is
 * the one extra interaction AC B2-1 allows, and no more.
 */
export async function generateAndInsertSyllabusAction(
  canvasUrl: string,
  acronym?: string,
  newTemplate?: { name: string; fileName: string; base64: string },
  provider: LlmProvider = "gemini"
): Promise<{ needsTemplate: true } | { message: string } | { error: string }> {
  try {
    const user = await requireOwner();

    const resolved = await resolveLmsCourseRowAction(canvasUrl);
    if ("error" in resolved) return resolved;
    const { course } = resolved;

    const instFields = course.institution
      ? await loadInstitutionFields(createServiceClient(), user.id, course.institution).catch(() => [])
      : [];

    // AC B2-2: per-course column first, institution default as fallback.
    let templateId = resolveSyllabusTemplateId(course.syllabusTemplateId, instFields).templateId;
    // Set only when THIS run just assigned a brand-new template, so the
    // persist calls below override syllabusTemplateId; an already-resolved
    // template (course or institution) is left completely untouched.
    let newTemplateId: string | undefined;

    if (!templateId) {
      // AC B2-2: only source === "none" triggers the upload prompt.
      if (!newTemplate) {
        return { needsTemplate: true };
      }

      const created = await createSyllabusTemplateAction(newTemplate.name, newTemplate.fileName, newTemplate.base64);
      if ("error" in created) return { error: created.error };
      templateId = created.template.id;
      newTemplateId = created.template.id;

      // AC B2-3: assign it to the course row now, independent of whether
      // generation below succeeds, so an unrelated generation failure later
      // in this same call never costs a future press this same upload step
      // again - the next press is still one click.
      const assigned = await updateCourseHubAction(course.id, {
        ...courseToInputPayload(course),
        syllabusTemplateId: newTemplateId,
      });
      if ("error" in assigned) return { error: assigned.error };
    }

    // AC B2-4: the single 12-key mapping - no second fact mapping is written.
    const instEmail = instFields.find((f) => f.id === "email")?.value ?? "";
    const instLmsUrl = instFields.find((f) => f.id === "lmsUrl")?.value ?? "";
    const facts = buildSyllabusFactsFromCourse(course, { email: instEmail, lmsUrl: instLmsUrl });

    const generated = await generateCourseSyllabusAction(templateId, facts, provider);
    if ("error" in generated) return { error: generated.error };

    const fileName = buildWorkflowFileName({ course, artifact: "Syllabus", ext: "docx" });
    const saved = await createFinalizedSyllabusAction(
      generated.name,
      fileName,
      generated.base64,
      course.courseCode ?? undefined
    );
    if ("error" in saved) return { error: saved.error };

    // AC B2-5/B2-6: createFinalizedSyllabusAction does NOT write
    // course_hub.syllabus_id itself (docs/REGRESSION.md #60 check 5) - the
    // caller must, through courseToInputPayload (never a hand-written field
    // list - toRow's clean(undefined) === null would wipe every omitted
    // column, the live bug at syllabus-upload.ts:118-145 this must not
    // repeat). Persisted before the Canvas-attach step below so the saved
    // syllabus is linked to the course row even if attaching fails.
    const persisted = await updateCourseHubAction(course.id, {
      ...courseToInputPayload(course),
      ...(newTemplateId ? { syllabusTemplateId: newTemplateId } : {}),
      syllabusId: saved.syllabus.id,
    });
    if ("error" in persisted) return { error: persisted.error };

    const content = await listCourseContentAction(canvasUrl, acronym);
    if ("error" in content) {
      return {
        message: `Generated and saved "${saved.syllabus.name}", but could not load the course's modules to attach it: ${content.error}`,
      };
    }

    // AC B2-7: "Start Here" when it exists, else the first module, else not
    // attached at all (the syllabus is still generated and saved either way).
    const target = resolveModuleForSyllabusPlacement(content.modules);
    if (!target) {
      return {
        message: `Generated and saved "${saved.syllabus.name}" - the course has no modules, so it could not be attached to Canvas.`,
      };
    }

    const placed = await placeSyllabusInModuleAction(generated.base64, canvasUrl, target.id, fileName, undefined, acronym);
    if ("error" in placed) {
      return {
        message: `Generated and saved "${saved.syllabus.name}", but could not attach it to Canvas: ${placed.error}`,
      };
    }

    // AC B2-8: name the file and link to the Canvas module item.
    const itemUrl = placed.item?.htmlUrl ?? courseBaseUrl(canvasUrl);
    return { message: `Generated "${fileName}" and added it to "${target.name}": ${itemUrl}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not generate the syllabus." };
  }
}
