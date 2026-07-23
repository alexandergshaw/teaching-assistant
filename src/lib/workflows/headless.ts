// Predicate for whether a workflow can run fully unattended (Vercel Cron -
// app closed, nobody watching). A workflow is headless-safe only when every
// EXPANDED step (include-workflow steps flattened via expandWorkflowDef) is
// one whose run() never pauses for a human and needs nothing that only
// exists in a browser tab.
//
// This module is plain (no "use client", no DOM/window access, no server-only
// imports) so it can run in the browser (the schedule form's opt-in checkbox)
// and on the server (the cron route, re-validating before every unattended
// run) from the same source of truth.

import { expandWorkflowDef, type WorkflowDef, type WorkflowStepConfig } from "./types";

/**
 * Step types whose run() closure (see registry.ts STEP_REGISTRY) never sets
 * requireInput/requireConfirmation and has no irreducible browser dependency
 * (any document.createElement download in these steps is guarded and skipped
 * server-side; the step's real output/save-to-library work is unaffected).
 *
 * Verified by grepping each step's run() in registry.ts for
 * requireInput/requireConfirmation - keep this list in sync with the
 * registry when adding or changing a step type.
 */
export const HEADLESS_SAFE_STEP_TYPES: ReadonlySet<string> = new Set([
  "generate-schedule",
  "generate-schedule-offline",
  "generate-dated-schedule",
  "repo-from-template",
  "fill-readmes",
  "lecture-zip",
  "lecture-materials-from-schedule",
  "generate-class-openers",
  "lms-modules",
  "lms-populate",
  "agent-edit-repo",
  "schedule-from-repo",
  "save-csv-to-course",
  "save-zip-to-course",
  "lms-wipe",
  "list-announcements",
  "draft-announcement",
  "compose-weekly-announcement",
  "draft-assignment-description",
  "assign-student-repos",
  "generate-rubric-offline",
  "lms-rubric",
  "lms-assignments",
  "blackboard-export",
  "starter-materials",
  "create-course-cards",
  "course-modality",
  "set-course-start-dates",
  "assign-week-deadlines",
  "schedule-lecture-announcement",
  "lecture-qa",
  "post-grades",
  "generate-assignment-brief",
  // The unattended AI-scoring half of grading: it grades and saves a durable
  // draft (saveGradingDraftAction) but never sets requireInput/
  // requireConfirmation and never calls postCanvasGradesAction. Posting only
  // happens through the app-open review-grading-draft -> post-grades pair,
  // which is why "review-grading-draft" is deliberately NOT in this set.
  "grade-to-draft",
  "grade-cartridge-submissions",
  "draft-missing-zeros",
  "grade-one-submission",
  "read-inbox",
  "draft-message-reply",
  "save-message-draft",
  "triage-inbox",
  "detect-meeting-request",
  "find-open-slots",
  "draft-meeting-reply",
  "parse-academic-calendar",
  "check-needs-grading",
  "get-unread-and-notifications",
  "check-student-activity",
  "import-lms-syllabus",
  "detect-syllabus-fields",
  "regenerate-syllabus-field",
  "list-syllabus-templates",
  "ensure-visualizer-pages",
  "extract-topics-from-repo",
  "generate-module-intro",
  "generate-lesson-plan",
  "generate-worked-examples",
  "generate-full-credit-checklist",
  "generate-model-answer",
  "grade-repo",
  "batch-grade-repos-to-draft",
  "generate-document",
  "generate-rubric-from-repo",
  "revise-generated-document",
  "outline-course-from-repo",
  "extract-glossary-terms",
  "find-case-study-slide",
  "find-practice-problems",
  "research-topic",
  "generate-slides-standalone",
  "generate-lecture-script",
  "generate-quiz-from-material",
  "revise-generated-slides",
  "revise-page-with-ai",
  "synthesize-narration",
  "generate-avatar-video",
  "poll-avatar-video",
  "get-assignment-sync-state",
  "remember-rubric",
  "find-banked-rubric",
  "resolve-rubric",
  "pull-fallback-sources",
  "pull-current-materials",
  "run-submission-code",
  "list-ci-artifacts",
  "check-broken-links",
  "measure-knowledge-gap",
  "run-research-loop",
  "list-unverified-knowledge",
  "generate-copilot-prompt",
  "poll-copilot-tasks",
  "read-pr-diff",
  "dispatch-tests",
  "poll-test-run",
  "list-github-repos",
  "ingest-repo-digest",
  "detect-repo-frontend",
  "fetch-assignment-brief",
  "fetch-course-roster",
  "link-github-usernames",
  "copy-course-content",
  "poll-migration-state",
  "export-course-cartridge",
  "course-progress",
  "resolve-week-topic",
  "generate-presentation-from-template",
  "generate-concept-animations",
  // Run without pausing; creating quiz questions unattended matches the
  // lms-assignments precedent and completes the scheduled quiz pipeline.
  "import-quiz-questions",
  "list-upcoming-deadlines",
  "list-deadlines-from-feed",
  "list-missing-submissions",
  // Draft-only; never sends until a human reviews in the Drafts UI.
  "draft-student-nudges",
  "compose-briefing",
  // Creates the quiz unpublished; publish from Canvas when ready.
  "create-canvas-quiz",
  "gradebook-health-report",
  "draft-upcoming-lectures",
  "draft-weekly-announcements",
  "draft-weekly-study-guides",
  "sync-course-tiles-from-lms",
  "import-gradebook-csv",
  "import-roster-from-csv",
  "export-grades-for-lms",
  "create-course-tile",
  "configure-institution-feeds",
  "check-mailbox-connection",
  "read-email-inboxes",
  "list-open-problems",
  "propose-problem-solutions",
  "generate-module-answers",
  "current-events-report",
  "integrate-source-into-lms",
]);

// Every OTHER step type in STEP_REGISTRY is interactive and therefore NOT in
// HEADLESS_SAFE_STEP_TYPES above; each pause is a real requireInput/
// requireConfirmation in that step's run() (registry.ts):
//   - load-course-tile: sets requireConfirmation when the tile has no linked
//     repository (conditional - some runs of it never pause, but the
//     predicate below cannot know that ahead of time, so it excludes the
//     step type unconditionally).
//   - fetch-term-courses: sets requireConfirmation to review the fetched
//     course list before creating cards.
//   - prepare-lecture: sets requireInput to review/edit/regenerate the
//     generated announcement draft.
//   - tech-report: sets requireInput to collect the user's chosen
//     improvements before firing agent tasks.
//   - agent-improve-repos: sets requireInput per course to route the agent
//     task (or hand off to another workflow when there is no repo).
//   - grading-preflight: sets requireInput to choose the grading plan and/or
//     requireConfirmation to proceed with offline grading that has no saved
//     rubric.
//   - collect-offline-submissions: sets requireInput to collect the
//     submissions zip upload for courses with no LMS connection.
//   - grade-submissions: sets requireInput to review and approve grades
//     before they post to the LMS.
//   - review-grading-draft: sets requireInput to review and approve a saved
//     grading draft's grades before they post to the LMS (app-open only -
//     see grade-to-draft above for the unattended scoring half).

/**
 * Step types that are headless-safe ONLY for certain configurations, keyed by a
 * predicate over the step's bindings. Kept separate from the flat
 * HEADLESS_SAFE_STEP_TYPES set (and out of the headless-count canary) because
 * their safety depends on how the step is wired, not just its type.
 */
export const CONDITIONALLY_HEADLESS_SAFE: Record<
  string,
  (step: WorkflowStepConfig) => boolean
> = {
  // prepare-lecture pauses to review the recap announcement UNLESS its
  // `autonomous` input is fixed on. It is headless-safe only when the workflow
  // PINS autonomous to a literal "1", so a schedule/trigger cannot smuggle in an
  // interactive run that would then abort unattended. A runtime-bound autonomous
  // field is not enough - the predicate cannot see a value that only exists at
  // run time.
  "prepare-lecture": (step) => {
    const b = step.bindings.autonomous;
    return b?.source === "literal" && b.value === "1";
  },
  // scan-term-courses pauses to review the course diff UNLESS its `confirm`
  // input is fixed off. It is headless-safe only when the workflow PINS
  // confirm to a literal "" or does not set it, so a schedule/trigger cannot
  // smuggle in an interactive run that would then abort unattended. Inversely,
  // when confirm is pinned to literal "1", the step is interactive by design.
  "scan-term-courses": (step) => {
    const b = step.bindings.confirm;
    return !b || (b.source === "literal" && b.value !== "1");
  },
};

/** Whether a single expanded step is headless-safe, by type or by a
 * configuration-dependent predicate. */
export function isHeadlessSafeStep(step: WorkflowStepConfig): boolean {
  if (HEADLESS_SAFE_STEP_TYPES.has(step.type)) return true;
  return CONDITIONALLY_HEADLESS_SAFE[step.type]?.(step) ?? false;
}

/**
 * True iff every step in `def`'s expansion (include-workflow steps
 * flattened) is headless-safe. A workflow with zero steps, an include cycle,
 * or a reference to an unresolvable included workflow (expandWorkflowDef
 * throws in both cases) is treated as NOT headless-safe - scheduling an
 * unattended run requires a workflow that both resolves cleanly and actually
 * does something.
 */
export function isHeadlessSafeWorkflow(
  def: WorkflowDef,
  lookup: (id: string) => WorkflowDef | undefined
): boolean {
  try {
    const { steps } = expandWorkflowDef(def, lookup);
    if (steps.length === 0) return false;
    return steps.every(isHeadlessSafeStep);
  } catch {
    return false;
  }
}
