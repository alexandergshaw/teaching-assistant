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

import { expandWorkflowDef, type WorkflowDef } from "./types";

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
  "lms-modules",
  "lms-populate",
  "agent-edit-repo",
  "schedule-from-repo",
  "save-csv-to-course",
  "save-zip-to-course",
  "lms-wipe",
  "list-announcements",
  "draft-announcement",
  "assign-student-repos",
  "lms-rubric",
  "lms-assignments",
  "blackboard-export",
  "starter-materials",
  "create-course-cards",
  "set-course-start-dates",
  "assign-week-deadlines",
  "schedule-lecture-announcement",
  "lecture-qa",
  "post-grades",
  // The unattended AI-scoring half of grading: it grades and saves a durable
  // draft (saveGradingDraftAction) but never sets requireInput/
  // requireConfirmation and never calls postCanvasGradesAction. Posting only
  // happens through the app-open review-grading-draft -> post-grades pair,
  // which is why "review-grading-draft" is deliberately NOT in this set.
  "grade-to-draft",
  "read-inbox",
  "draft-message-reply",
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
  "extract-topics-from-repo",
  "generate-module-intro",
  "generate-lesson-plan",
  "generate-worked-examples",
  "generate-document",
  "revise-generated-document",
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
    return steps.every((step) => HEADLESS_SAFE_STEP_TYPES.has(step.type));
  } catch {
    return false;
  }
}
