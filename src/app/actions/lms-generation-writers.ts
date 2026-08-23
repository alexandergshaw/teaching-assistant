// The two real (non-"use server") wiring objects generateFromSelectionAction/
// postGeneratedArtifactAction inject into materials.ts/commit-execute.ts -
// moved out of src/app/actions/lms-generation.ts (step-10 fixer round) purely
// to keep that file under this project's 1000-line ceiling. This file is
// deliberately NOT a "use server" module itself (it exports plain, non-async
// object constants) - it may freely import "use server" action functions and
// re-wrap them, since the "export only async functions" rule applies to a
// "use server" file's OWN exports, not to a plain module that merely calls
// into one.
import {
  getPageAction,
  previewFileAction,
  createPageAction,
  updatePageAction,
  createGradableAction,
  createQuizQuestionAction,
  bulkUpdateAction,
} from "./canvas-files-bulk";
import { fetchCanvasMetaAction } from "./grading";
import { createModuleItemAction, createCourseAssignmentAction } from "./canvas-modules";
import { createAnnouncementAction } from "./canvas-inbox";
import { createGradedDiscussionAction } from "./canvas-discussions";
import type { MaterialsFetchers } from "@/lib/lms-generation/materials";
import type { CanvasWriters } from "@/lib/lms-generation/commit-execute";

/** The real Canvas reads gatherSelectionMaterials needs for live-sourced
 * items, wired to the app's own existing actions - see materials.ts's own
 * header comment for why those reads are injected there rather than imported
 * directly. */
export const LIVE_FETCHERS: MaterialsFetchers = {
  getPage: (courseUrl, pageUrl, institution) => getPageAction(courseUrl, pageUrl, institution),
  previewFile: (courseUrl, contentId, institution) => previewFileAction(courseUrl, contentId, institution),
  fetchMeta: (contentUrl) => fetchCanvasMetaAction(contentUrl),
};

/**
 * The real Canvas writes postGeneratedArtifactAction's executePostPlanSteps
 * needs, wired to this app's own existing actions - same injection pattern as
 * LIVE_FETCHERS above. Every method here is a direct pass-through except
 * `publishQuiz`: bulkUpdateAction returns `{updated, failures}` rather than a
 * plain `{ok:true}` success marker (it is a BATCH endpoint that can partially
 * fail even for a single id), so this is the one place that result gets
 * translated into CanvasWriters' plain ok/error contract - a per-id failure
 * is surfaced as this writer's own `{error}` rather than silently reported as
 * `{ok:true}`.
 */
export const LIVE_CANVAS_WRITERS: CanvasWriters = {
  createPage: (courseUrl, fields, acronym) => createPageAction(courseUrl, fields, acronym),
  updatePage: (courseUrl, pageUrl, fields, acronym) => updatePageAction(courseUrl, pageUrl, fields, acronym),
  createModuleItem: (courseUrl, moduleId, item, acronym) => createModuleItemAction(courseUrl, moduleId, item, acronym),
  createAssignment: (courseUrl, fields, moduleId, acronym) =>
    createCourseAssignmentAction(courseUrl, fields, moduleId, acronym),
  createQuiz: (courseUrl, fields, acronym) => createGradableAction(courseUrl, "Quiz", fields, acronym),
  createQuizQuestion: (courseUrl, quizId, question, acronym) =>
    createQuizQuestionAction(courseUrl, quizId, question, acronym),
  publishQuiz: async (courseUrl, quizId, acronym) => {
    const result = await bulkUpdateAction(courseUrl, "Quiz", [String(quizId)], { published: true }, acronym);
    if ("error" in result) return { error: result.error };
    if (result.failures.length > 0) {
      return { error: result.failures[0]?.error ?? "Could not publish the quiz." };
    }
    return { ok: true };
  },
  createAnnouncement: (courseUrl, title, message, acronym) => createAnnouncementAction(courseUrl, title, message, acronym),
  // AC15/D2: the dedicated graded-discussion write layer (A4) - NOT
  // createGradableAction, which D2 explicitly withdrew widening.
  createDiscussion: (courseUrl, fields, acronym) => createGradedDiscussionAction(courseUrl, fields, acronym),
};
