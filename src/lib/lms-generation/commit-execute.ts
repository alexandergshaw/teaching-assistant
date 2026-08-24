// The EXECUTOR that walks a PostPlanStep[] (commit-plan.ts's pure planner)
// and actually performs each Canvas write (chunk 3b of "generate content
// from the instructor's LMS selection" - docs/lms-module-content-generation-
// acceptance-criteria.md, P1-P5). commit-plan.ts decides WHAT to do; this
// file is the THIN half that does it, kept separate so the decision stays
// pure and unit-testable without a network call (that split is commit-
// plan.ts's own header comment's point, and this is the sibling it names).
//
// CANVAS WRITES ARE INJECTED via CanvasWriters, mirroring materials.ts's
// MaterialsFetchers / lms-generation.ts's LIVE_FETCHERS pattern exactly (see
// materials.ts's own header comment for the "structural subset" convention
// this reuses): each method's signature is the minimal shape this executor
// actually reads off a real action's response, so the real "use server"
// actions (createPageAction, createCourseAssignmentAction, ...) satisfy this
// interface directly with no adapter, except where a real action's shape
// does not carry a plain {ok:true} success marker (bulkUpdateAction's
// {updated, failures} for publishing a quiz) - that one small translation
// lives in lms-generation.ts's LIVE_CANVAS_WRITERS, not here, so this module
// stays free of any "@/app/actions" import and is directly testable with
// fake writers - no vi.mock needed (X1).
//
// PER-STEP CONTINUATION MODEL copies postGuidesToLms/steps.knowledge-
// checks.ts (see commit-plan.ts's own header comment for the exact citation):
// a failed step never throws - it becomes a "failed" PostStepOutcome - and
// the loop keeps going UNLESS the step that failed was the plan's own
// content-defining step (create-page/update-page/create-assignment/create-
// quiz/create-announcement/create-discussion - commit-plan.ts's
// isContentStep), because
// nothing downstream (a link, a question, a publish) can succeed against
// content that was never created; execution stops there and returns
// whatever outcomes were already recorded. A create-quiz-question failure is
// NOT content-defining, so the loop keeps adding every remaining question
// (counting failures, never aborting - steps.knowledge-checks.ts's own
// loop), and publish-quiz/link-quiz still run afterward regardless of how
// many questions failed - summarizePostOutcome (commit-plan.ts) is what
// turns that into an honest "N of M questions landed" partial result.
//
// A link/question/publish step reached with no anchoring id yet (moduleId
// null for a link step, or quizId null for a question/publish step) is
// reported failed rather than attempted - defensively, since planPostSteps
// never actually emits a step whose prerequisite id cannot exist (a link
// step always follows a create/update-page or create-quiz step in the same
// plan, and moduleId is the caller's job to resolve before calling this
// function at all for a module-item placement).
import type { NewAssignment, NewModuleItem, QuizQuestionInput } from "@/lib/canvas-modules/types";
import type { NewGradedDiscussion } from "@/lib/canvas-modules/graded-discussion";
import type { PostPlanStep, PostStepOutcome } from "./commit-plan";

export interface CanvasWriteError {
  error: string;
}

/** The Canvas writes a post plan needs, one method per PostPlanStep kind
 * (createModuleItem is shared by both link-page and link-quiz, same as
 * createModuleItemAction already is for every other module-linking caller in
 * this codebase). See this file's header comment for the injection/
 * structural-subset rationale. */
export interface CanvasWriters {
  createPage: (
    courseUrl: string,
    fields: { title: string; body: string },
    acronym?: string
  ) => Promise<{ page: { url: string } } | CanvasWriteError>;
  updatePage: (
    courseUrl: string,
    pageUrl: string,
    fields: { title: string; body: string },
    acronym?: string
  ) => Promise<{ page: { url: string } } | CanvasWriteError>;
  createModuleItem: (
    courseUrl: string,
    moduleId: number,
    item: NewModuleItem,
    acronym?: string
  ) => Promise<{ ok: true } | CanvasWriteError>;
  createAssignment: (
    courseUrl: string,
    fields: NewAssignment,
    moduleId: number | null,
    acronym?: string
  ) => Promise<
    | { id: number; addedToModule?: boolean; linkError?: string }
    | CanvasWriteError
  >;
  createQuiz: (
    courseUrl: string,
    fields: { title: string; description: string },
    acronym?: string
  ) => Promise<{ id: number } | CanvasWriteError>;
  createQuizQuestion: (
    courseUrl: string,
    quizId: number,
    question: QuizQuestionInput,
    acronym?: string
  ) => Promise<{ question: unknown } | CanvasWriteError>;
  publishQuiz: (courseUrl: string, quizId: number, acronym?: string) => Promise<{ ok: true } | CanvasWriteError>;
  createAnnouncement: (
    courseUrl: string,
    title: string,
    message: string,
    acronym?: string
  ) => Promise<{ announcement: unknown } | CanvasWriteError>;
  createDiscussion: (
    courseUrl: string,
    fields: NewGradedDiscussion,
    acronym?: string
  ) => Promise<{ id: number; path: "checkpoints" | "classic"; fallbackReason?: string } | CanvasWriteError>;
}

/**
 * Execute an ordered PostPlanStep[] against `writers`, returning one
 * PostStepOutcome per ATTEMPTED step - see this file's header comment for
 * when a step is skipped rather than attempted. `moduleId` is `null` for a
 * course-level post (announcements - GenerationCommitMeta's `placement`);
 * the caller resolves it (planModuleTarget, then create-or-reuse the module)
 * BEFORE calling this function for any "module-item" placement kind - this
 * function performs no module resolution of its own.
 *
 * Never throws: every writer call is awaited directly (no try/catch needed)
 * because every writer in this codebase already converts a thrown error into
 * a returned `{error}` - see createPageAction/createCourseAssignmentAction/
 * etc.'s own try/catch. A fake writer used in a test must uphold the same
 * contract (return, never throw).
 */
export async function executePostPlanSteps(
  courseUrl: string,
  moduleId: number | null,
  steps: PostPlanStep[],
  writers: CanvasWriters,
  acronym?: string
): Promise<PostStepOutcome[]> {
  const outcomes: PostStepOutcome[] = [];
  let pageUrl: string | null = null;
  let quizId: number | null = null;
  let discussionId: number | null = null;

  for (const step of steps) {
    switch (step.step) {
      case "create-page": {
        const res = await writers.createPage(courseUrl, { title: step.title, body: step.body }, acronym);
        if ("error" in res) {
          outcomes.push({ step, status: "failed", detail: res.error });
          return outcomes;
        }
        pageUrl = res.page.url;
        outcomes.push({ step, status: "done" });
        break;
      }

      case "update-page": {
        const res = await writers.updatePage(courseUrl, step.pageUrl, { title: step.title, body: step.body }, acronym);
        if ("error" in res) {
          outcomes.push({ step, status: "failed", detail: res.error });
          return outcomes;
        }
        pageUrl = res.page.url;
        outcomes.push({ step, status: "done" });
        break;
      }

      case "link-page": {
        if (moduleId === null || !pageUrl) {
          outcomes.push({ step, status: "failed", detail: "No page/module to link." });
          break;
        }
        const res = await writers.createModuleItem(courseUrl, moduleId, { type: "Page", pageUrl }, acronym);
        outcomes.push("error" in res ? { step, status: "failed", detail: res.error } : { step, status: "done" });
        break;
      }

      case "create-assignment": {
        const res = await writers.createAssignment(courseUrl, step.fields, moduleId, acronym);
        if ("error" in res) {
          outcomes.push({ step, status: "failed", detail: res.error });
          return outcomes;
        }
        // Assignment linking is embedded in ONE Canvas write here (unlike
        // page/quiz/discussion, which get a separate link-* PostPlanStep) -
        // createCourseAssignmentAction's own `moduleId` parameter does both.
        // Chunk D step-11 regression: that write can succeed at creating the
        // assignment but fail to link it (`addedToModule: false` +
        // `linkError`, still no `error` key), and this case used to report a
        // bare "done" for that - the overall post then read as a full
        // success even though the assignment never landed in the module.
        // `linkFailed` carries the same "created but not linked" signal
        // isLinkStep's separate failed step carries for the other kinds, so
        // summarizePostOutcome (commit-plan.ts) renders it as the same
        // honest "partial - find it in Canvas" orphan case, by id, never a
        // silent success.
        if (moduleId !== null && res.addedToModule === false) {
          outcomes.push({
            step,
            status: "done",
            linkFailed: true,
            detail: res.linkError ? `assignment id ${res.id}: ${res.linkError}` : `assignment id ${res.id}`,
          });
          break;
        }
        outcomes.push({ step, status: "done" });
        break;
      }

      case "create-quiz": {
        const res = await writers.createQuiz(courseUrl, { title: step.title, description: step.description }, acronym);
        if ("error" in res) {
          outcomes.push({ step, status: "failed", detail: res.error });
          return outcomes;
        }
        quizId = res.id;
        outcomes.push({ step, status: "done" });
        break;
      }

      case "create-quiz-question": {
        if (quizId === null) {
          outcomes.push({ step, status: "failed", detail: "No quiz to add the question to." });
          break;
        }
        const res = await writers.createQuizQuestion(courseUrl, quizId, step.question, acronym);
        outcomes.push("error" in res ? { step, status: "failed", detail: res.error } : { step, status: "done" });
        break;
      }

      case "publish-quiz": {
        if (quizId === null) {
          outcomes.push({ step, status: "failed", detail: "No quiz to publish." });
          break;
        }
        const res = await writers.publishQuiz(courseUrl, quizId, acronym);
        outcomes.push("error" in res ? { step, status: "failed", detail: res.error } : { step, status: "done" });
        break;
      }

      case "link-quiz": {
        if (moduleId === null || quizId === null) {
          outcomes.push({ step, status: "failed", detail: "No quiz/module to link." });
          break;
        }
        const res = await writers.createModuleItem(
          courseUrl,
          moduleId,
          { type: "Quiz", contentId: quizId, title: step.title },
          acronym
        );
        outcomes.push("error" in res ? { step, status: "failed", detail: res.error } : { step, status: "done" });
        break;
      }

      case "create-announcement": {
        const res = await writers.createAnnouncement(courseUrl, step.title, step.message, acronym);
        if ("error" in res) {
          outcomes.push({ step, status: "failed", detail: res.error });
          return outcomes;
        }
        outcomes.push({ step, status: "done" });
        break;
      }

      case "create-discussion": {
        const res = await writers.createDiscussion(courseUrl, step.fields, acronym);
        if ("error" in res) {
          outcomes.push({ step, status: "failed", detail: res.error });
          return outcomes;
        }
        discussionId = res.id;
        // The fallback is never silent (AC14g): when the classic path ran
        // instead of checkpoints, say so - and why - right on the outcome, so
        // the caller (the post summary/notes surfaced to the instructor) can
        // tell the two paths apart instead of a bare "posted successfully"
        // implying both deadlines are enforced when only one is.
        //
        // M1 (fix): `res.fallbackReason` (the write layer's own
        // describeFallback()) is passed through VERBATIM - it already ends
        // with "only the initial-post deadline is graded by Canvas; the
        // replies deadline is enforced by the thread closing, not by a
        // separate grade." Wrapping it in "Classic fallback used (...)" and
        // appending "- only the initial-post deadline is enforced by
        // Canvas." (as this used to do) doubled that exact warning in the
        // instructor-facing note. No re-wording, no re-wrapping.
        outcomes.push({ step, status: "done", detail: res.path === "classic" ? res.fallbackReason : undefined });
        break;
      }

      case "link-discussion": {
        if (moduleId === null || discussionId === null) {
          outcomes.push({ step, status: "failed", detail: "No discussion/module to link." });
          break;
        }
        const res = await writers.createModuleItem(
          courseUrl,
          moduleId,
          { type: "Discussion", contentId: discussionId, title: step.title },
          acronym
        );
        outcomes.push("error" in res ? { step, status: "failed", detail: res.error } : { step, status: "done" });
        break;
      }
    }
  }

  return outcomes;
}
