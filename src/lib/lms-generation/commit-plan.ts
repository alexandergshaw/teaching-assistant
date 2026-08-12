// The pure planner for POSTING generated LMS content to Canvas (chunk 3b of
// "generate content from the instructor's LMS selection" - see
// docs/lms-module-content-generation-acceptance-criteria.md, acceptance
// criteria P3/P4/P5, X1). This file answers three questions with no I/O at
// all, so every answer is a plain function of plain data:
//   - P5: where does the post land - an existing module, or a new one, and
//     does "new" actually collide with a module that already exists?
//     (planModuleTarget)
//   - P3: given a Canvas object kind and the generated content, what ORDERED
//     Canvas writes does posting it require, reusing rather than duplicating
//     whatever the course already has? (planPostSteps)
//   - P4: given how those writes actually went, what happened - success,
//     total failure, or a partial result that still created something a
//     human needs to know about? (summarizePostOutcome)
//
// THE MODEL COPIED HERE IS postGuidesToLms
// (src/lib/workflows/registry/steps.course-guides.ts:198-277): reuse-or-
// create a named module, then per doc either update an existing same-title
// page or create a new one, then link into the module only when not already
// linked, with a per-doc try/catch that turns a failure into a note instead
// of aborting the whole run. steps.knowledge-checks.ts:146-204 is the quiz
// reference (create gradable, loop questions counting failures, publish,
// link). Both are IMPERATIVE code that talks to Canvas; this file lifts
// their DECISIONS into data so the decisions themselves are unit-testable
// without a network call, mirroring bulk-module-plan.ts's existing "pure
// planner + thin executor" split (that file's own header comment explains
// the same shape for bulk module creation) and moduleContentActions.ts's
// `ModuleContentResult` discriminated `{status: "success" | "failed" |
// "orphaned"}` (:48-57), whose "orphaned" case - content created in Canvas
// but the module link failed - is exactly what P4 asks for here.
//
// DELIBERATELY A LEAF: no "@/app/actions" import, no Supabase import, no
// fetch. Only TYPE-ONLY imports from src/lib/canvas-modules/types.ts (erased
// at compile time, so they add no runtime dependency) so the create-
// assignment and create-quiz-question steps carry the exact field shapes
// their eventual executor will pass straight through to
// createCourseAssignmentAction/createQuizQuestionAction, instead of a
// parallel, driftable copy of those shapes.
//
// The EXECUTOR that walks a PostPlanStep[] and actually calls Canvas is
// deliberately NOT in this file - it needs "@/app/actions", so it lives in
// src/app/actions/lms-generation.ts (or a sibling), same split as
// kinds.ts/its own header comment describes for generation.
import type { NewAssignment, QuizQuestionInput } from "@/lib/canvas-modules/types";

// ---------------------------------------------------------------------------
// P5: where does the post land.
// ---------------------------------------------------------------------------

/** The instructor's choice of where a post lands - either a module they
 * already picked from the loaded module tree, or a brand-new module they
 * named as part of posting (the "generate a new module" half of the request
 * this chunk's acceptance-criteria doc opens with). */
export type ModuleTarget = { kind: "existing"; moduleId: number } | { kind: "new"; name: string };

/** The resolved plan for `ModuleTarget`: either use an id directly (the
 * instructor picked an existing module, OR their "new" name turned out to
 * already exist), create a new module by name, or a validation error. Never
 * throws - callers render `error` inline the same way every other planner in
 * this codebase does (see planBulkModuleCreation's own `plan.error`). */
export type ModuleTargetPlan = { action: "use"; moduleId: number } | { action: "create"; name: string } | { error: string };

/**
 * Resolve a `ModuleTarget` into what actually needs to happen.
 *
 * `"existing"` always resolves to using that id - the caller sourced it from
 * the loaded module tree, so there is nothing left to decide.
 *
 * `"new"` is where the re-run-safety rule from P3/P5 lives: `createModuleAction`
 * has no Canvas-side idempotency key (bulk-module-plan.ts:127-143 documents
 * this exhaustively for the exact same API call), so the ONLY thing standing
 * between "post this twice" and a course full of duplicate modules is a
 * case-insensitive, trim-insensitive name match against the modules that
 * already exist - the identical rule planBulkModuleCreation already applies
 * for bulk module creation, applied here to a single module instead of a
 * batch. A match resolves to `"use"` the EXISTING module's id, never
 * `"create"` - creating alongside it would be the exact duplicate this check
 * exists to prevent.
 *
 * A blank/whitespace-only new-module name is a validation error, not a
 * module literally named "".
 */
export function planModuleTarget(
  target: ModuleTarget,
  existingModules: Array<{ id: number; name: string }>
): ModuleTargetPlan {
  if (target.kind === "existing") {
    return { action: "use", moduleId: target.moduleId };
  }

  const name = target.name.trim();
  if (!name) {
    return { error: "Enter a name for the new module." };
  }

  const collision = existingModules.find((m) => m.name.trim().toLowerCase() === name.toLowerCase());
  if (collision) {
    return { action: "use", moduleId: collision.id };
  }

  return { action: "create", name };
}

// ---------------------------------------------------------------------------
// P3: what posting a kind's content requires, as ordered steps.
// ---------------------------------------------------------------------------

/** The Canvas object type a posting kind produces - R2's four new kinds map
 * one each: objectives -> "page", assignments -> "assignment",
 * knowledgeChecks -> "quiz", announcements -> "announcement". */
export type CanvasPostKind = "page" | "assignment" | "quiz" | "announcement";

/** The generated content for one post, discriminated by the Canvas object it
 * becomes. `assignment.fields` and `quiz.questions[*]` reuse this codebase's
 * own Canvas-write field shapes (NewAssignment / QuizQuestionInput) so a
 * step built from them is exactly what createCourseAssignmentAction /
 * createQuizQuestionAction already accept - no separate, driftable copy. */
export type PostContent =
  | { kind: "page"; title: string; body: string }
  | { kind: "assignment"; fields: NewAssignment }
  | { kind: "quiz"; title: string; description: string; questions: QuizQuestionInput[] }
  | { kind: "announcement"; title: string; message: string };

/** A page's identity as read off the course (title + stable slug) - the
 * shape postGuidesToLms reads out of listCourseContentAction's
 * `content.pages` (CanvasPageSummary), trimmed to what the reuse check
 * needs. */
export interface ExistingPage {
  title: string;
  url: string;
}

/** What already exists, gathered by the caller from listCourseContentAction
 * BEFORE planning - mirrors postGuidesToLms's own `existingPages` /
 * `alreadyLinkedPageUrls` locals (steps.course-guides.ts:227-232), pulled out
 * so the reuse-or-create decision is a pure function instead of inline
 * imperative code.
 *
 * Only pages are checked for reuse here - that is postGuidesToLms's own
 * rule. Quizzes are never reused across runs (steps.knowledge-checks.ts
 * always creates a fresh quiz on every run - there is no by-title dedupe in
 * that reference implementation), so there is deliberately no quiz-title
 * check in this file either; adding one would invent a rule the model this
 * chunk copies does not have. */
export interface ExistingModuleContent {
  /** Every page in the course, not just the target module - a page can be
   * reused for a title match wherever it lives; postGuidesToLms checks the
   * course-wide page list the same way. */
  pages: ExistingPage[];
  /** Page slugs already linked as a module item INSIDE THE TARGET MODULE
   * specifically. A page can exist in the course without being linked into
   * THIS module yet - that is exactly the case that still needs a link
   * step, so this is deliberately scoped to the target module, not "linked
   * anywhere". */
  linkedPageUrls: ReadonlySet<string>;
}

/**
 * One ordered Canvas write a post plan calls for. A discriminated union
 * rather than free-form strings (per this chunk's own X1) so a step's shape
 * can never drift from what its eventual executor actually needs to call.
 *
 * Link steps deliberately do NOT carry the id/slug being linked - for a
 * freshly created page/quiz that id does not exist yet at plan time, so the
 * executor is expected to walk these steps in order, remember what the
 * immediately-preceding create/update step produced, and use that when it
 * reaches the link step. This mirrors postGuidesToLms's own imperative
 * sequence (create/update, THEN link, using the just-created pageUrl) - the
 * only change here is that the sequence is data instead of control flow.
 */
export type PostPlanStep =
  | { step: "create-page"; title: string; body: string }
  | { step: "update-page"; pageUrl: string; title: string; body: string }
  | { step: "link-page"; title: string }
  // Assignment: createCourseAssignmentAction (canvas-modules.ts:121-136)
  // creates AND links in a single Canvas call when given a moduleId - a
  // separate link step here would describe a SECOND, redundant module-item
  // POST for content that is already linked, so this plan has exactly one
  // step for an assignment.
  | { step: "create-assignment"; fields: NewAssignment }
  | { step: "create-quiz"; title: string; description: string }
  | { step: "create-quiz-question"; index: number; total: number; question: QuizQuestionInput }
  | { step: "publish-quiz" }
  | { step: "link-quiz"; title: string }
  // Announcement: a Canvas announcement is a course-level discussion topic,
  // NOT a module item - Canvas has no "add announcement to module" call. A
  // link step here would describe an impossible Canvas write, so this plan
  // never emits one for an announcement; this is the ONLY kind whose plan is
  // always exactly one step with no possible follow-up.
  | { step: "create-announcement"; title: string; message: string };

/**
 * Build the ordered list of Canvas writes required to post `content`,
 * reusing whatever `existing` already has (P3's re-run-safety rule).
 *
 * - page: reuse an existing same-title page (case/trim-insensitive, the same
 *   match postGuidesToLms performs) via `update-page`, or `create-page` when
 *   no match exists; then `link-page` ONLY when that page's url is not
 *   already in `existing.linkedPageUrls` for the target module.
 * - assignment: `create-assignment` only - see the PostPlanStep doc comment
 *   above for why no separate link step is ever emitted.
 * - quiz: `create-quiz`, then one `create-quiz-question` per question IN
 *   ORDER, then `publish-quiz`, then `link-quiz` - quizzes are never reused
 *   (see ExistingModuleContent's own doc comment), so these five step kinds
 *   always appear for a quiz post, unconditionally.
 * - announcement: `create-announcement` only - never a link step.
 */
export function planPostSteps(content: PostContent, existing: ExistingModuleContent): PostPlanStep[] {
  switch (content.kind) {
    case "page": {
      const title = content.title.trim();
      const match = existing.pages.find((p) => p.title.trim().toLowerCase() === title.toLowerCase());

      const steps: PostPlanStep[] = [];
      if (match) {
        steps.push({ step: "update-page", pageUrl: match.url, title, body: content.body });
        if (!existing.linkedPageUrls.has(match.url)) {
          steps.push({ step: "link-page", title });
        }
      } else {
        steps.push({ step: "create-page", title, body: content.body });
        steps.push({ step: "link-page", title });
      }
      return steps;
    }

    case "assignment":
      return [{ step: "create-assignment", fields: content.fields }];

    case "quiz": {
      const steps: PostPlanStep[] = [{ step: "create-quiz", title: content.title, description: content.description }];
      content.questions.forEach((question, index) => {
        steps.push({ step: "create-quiz-question", index, total: content.questions.length, question });
      });
      steps.push({ step: "publish-quiz" });
      steps.push({ step: "link-quiz", title: content.title });
      return steps;
    }

    case "announcement":
      return [{ step: "create-announcement", title: content.title, message: content.message }];
  }
}

// ---------------------------------------------------------------------------
// P4: what actually happened, summarized honestly.
// ---------------------------------------------------------------------------

/** The observed outcome of executing one planned step. Whether a step
 * "counts" as content-defining, a link, or a question is derived from
 * `step.step` itself inside summarizePostOutcome - this type stays a plain
 * pairing of the step with what happened, no separate classification field
 * to keep in sync. */
export interface PostStepOutcome {
  step: PostPlanStep;
  status: "done" | "failed";
  /** Present on "failed" - typically the Canvas error message. */
  detail?: string;
}

export interface PostSummary {
  status: "success" | "partial" | "failed";
  text: string;
}

/** Which step kinds actually create/update the underlying Canvas content
 * (as opposed to linking it into a module, adding a question, or
 * publishing). Every valid plan from planPostSteps has EXACTLY one of these,
 * always first - it is what summarizePostOutcome anchors the whole summary
 * to: nothing here means nothing was created, full stop. */
function isContentStep(step: PostPlanStep): boolean {
  return (
    step.step === "create-page" ||
    step.step === "update-page" ||
    step.step === "create-assignment" ||
    step.step === "create-quiz" ||
    step.step === "create-announcement"
  );
}

function isLinkStep(step: PostPlanStep): boolean {
  return step.step === "link-page" || step.step === "link-quiz";
}

/** A short human label for the object a content-defining step created or
 * updated, e.g. `Page "Week 3 Objectives"` - used to name what WAS created
 * in every partial/failed summary, per P4 ("never a bare failure when a
 * Canvas object was in fact created"). */
function describeContent(step: PostPlanStep): string {
  switch (step.step) {
    case "create-page":
    case "update-page":
      return `Page "${step.title}"`;
    case "create-assignment":
      return `Assignment "${step.fields.name}"`;
    case "create-quiz":
      return `Quiz "${step.title}"`;
    case "create-announcement":
      return `Announcement "${step.title}"`;
    default:
      // Not reachable from a content step (isContentStep only matches the
      // four cases above) - kept as a safe fallback rather than a thrown
      // error, consistent with this file never throwing.
      return "The content";
  }
}

/**
 * Summarize a completed (or partially completed) post, in the voice this
 * codebase already uses for the same "created but not fully landed" case -
 * see describeOrphans (useBulkModuleActions.ts:30-37), whose wording this
 * mirrors: name the kind and title of what was created, note what didn't
 * land, never call it a bare failure.
 *
 * Rules, in order:
 *   1. No outcomes at all, or the content-defining step is missing/failed:
 *      "failed" - nothing usable exists in Canvas.
 *   2. Content created, but a link step failed: "partial" - this is the
 *      orphan case (P4) - content created but not linked into the module.
 *      Named as such, never a bare "failed".
 *   3. Content created, linked (or nothing needed linking), but one or more
 *      quiz questions failed: "partial", naming how many of the total
 *      landed.
 *   4. Content created, linked, all questions landed, but publishing failed:
 *      "partial" - the quiz exists and is linked, but is not live yet.
 *   5. Every step done: "success".
 */
export function summarizePostOutcome(outcomes: PostStepOutcome[]): PostSummary {
  if (outcomes.length === 0) {
    return { status: "failed", text: "Nothing was posted." };
  }

  const contentOutcome = outcomes.find((o) => isContentStep(o.step));
  if (!contentOutcome || contentOutcome.status === "failed") {
    const label = contentOutcome ? describeContent(contentOutcome.step) : "The content";
    const detail = contentOutcome?.detail ? ` - ${contentOutcome.detail}` : "";
    return { status: "failed", text: `${label} could not be created${detail}.` };
  }

  const created = describeContent(contentOutcome.step);

  const linkOutcomes = outcomes.filter((o) => isLinkStep(o.step));
  const failedLink = linkOutcomes.find((o) => o.status === "failed");
  if (failedLink) {
    // The orphan case: created in Canvas, but not linked into the module -
    // it is invisible in the module tree but absolutely does exist. Naming
    // it here is what stops an instructor from creating a duplicate.
    const detail = failedLink.detail ? ` (${failedLink.detail})` : "";
    return {
      status: "partial",
      text: `${created} was created but not linked into the module${detail} - find it in Canvas.`,
    };
  }

  const questionOutcomes = outcomes.filter((o) => o.step.step === "create-quiz-question");
  const failedQuestions = questionOutcomes.filter((o) => o.status === "failed").length;
  if (failedQuestions > 0) {
    const landed = questionOutcomes.length - failedQuestions;
    return {
      status: "partial",
      text: `${created} was created, but only ${landed} of ${questionOutcomes.length} question(s) were added.`,
    };
  }

  const publishOutcome = outcomes.find((o) => o.step.step === "publish-quiz");
  if (publishOutcome && publishOutcome.status === "failed") {
    const detail = publishOutcome.detail ? ` - ${publishOutcome.detail}` : "";
    return { status: "partial", text: `${created} was created but could not be published${detail}.` };
  }

  return { status: "success", text: `${created} posted successfully.` };
}
