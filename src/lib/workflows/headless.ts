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
 * registry when adding or changing a step type. headless.test.ts's registry
 * step-type coverage test enforces that sync: it fails, naming the type,
 * whenever a STEP_REGISTRY type is missing from every classification below
 * or stale in more than one.
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
  "castletop-workbook",
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
  // Generates the handout/rubric/Canvas draft from a saved template and never
  // pauses for a human; the Canvas item it creates is always unpublished.
  // Designs the course project and saves it to the tile; never pauses for a
  // human and touches no external system.
  "define-course-project",
  "generate-assignment-from-template",
  // Generates the test document/answer key/study guide/Canvas quiz draft from
  // a saved test template and never pauses for a human; the Canvas quiz it
  // creates is always unpublished.
  "generate-test-from-template",
  // Builds a whole week's package and never pauses for a human; every
  // Canvas item it creates is unpublished.
  "generate-class-session-from-template",
  // Same package, repeated per week; still never pauses for a human and
  // still creates only unpublished Canvas items.
  "populate-lms-from-class-template",
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
  "generate-syllabus",
  "ensure-visualizer-pages",
  "ensure-visualizer-pages-for-deck",
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
  // Reads a course tile, resolves the target calendar, and writes/updates/
  // deletes only its own tagged events - never pauses for a human.
  "sync-course-calendar",
  // Generates the four course guide documents (Resources and Tutorials,
  // Course Schedule, FAQ, Instructor Contact) and, when postToLms is on,
  // posts/updates their LMS pages - never pauses for a human, and any LMS
  // failure is caught and noted rather than thrown (steps.course-guides.ts).
  "generate-course-guides",
  // Composes every week's announcement from already-generated module
  // materials and, when postToLms is on, schedules them via a future
  // release date - never pauses for a human, and every failure (per week,
  // and for the LMS post itself) is caught and noted rather than thrown
  // (steps.weekly-announcements.ts).
  "generate-weekly-announcements",
  // Composes every week's knowledge check from already-generated module
  // materials and, when postToLms is on, creates/publishes a Canvas quiz -
  // never pauses for a human, and every failure (per week, and for the LMS
  // post itself) is caught and noted rather than thrown
  // (steps.knowledge-checks.ts).
  "generate-knowledge-checks",
  // Composes every week's "Significance of the Material" document from that
  // week's already-assigned case study and, when postToLms is on, posts an
  // LMS page - never pauses for a human, and every failure (per week, and
  // for the LMS post itself) is caught and noted rather than thrown
  // (steps.weekly-significance.ts).
  "generate-weekly-significance",
  // Composes every module's instructor notes (free software alternatives,
  // common debugging problems/solutions) from that module's own verified
  // tools and, when postToLms is on, posts an ALWAYS-unpublished LMS page -
  // never pauses for a human, and every failure (per week, and for the LMS
  // post itself) is caught and noted rather than thrown
  // (steps.instructor-notes.ts).
  "generate-instructor-notes",
  // Composes every week's anticipated Q&A document from that week's already-
  // generated lecture materials and never pauses for a human; every failure
  // (per week) is caught and noted rather than thrown
  // (steps.course-build-qa.ts).
  "generate-weekly-qa",
  // Composes every week's current-events report from live web research and
  // never pauses for a human; every failure (per week) is caught and noted
  // rather than thrown (steps.course-build-current-events.ts).
  "generate-weekly-current-events",
  // Fetches an Unsplash photo for every generated deliverable file (up to a
  // defensive per-run cap) and never pauses for a human; a missing API key,
  // a rate limit, a network error, or a malformed response all degrade to
  // "no image for this deliverable" rather than a thrown error or a pause
  // (steps.deliverable-images.ts).
  "fetch-deliverable-images",
  // Builds a schedule from whichever source input was filled in and never
  // pauses for a human - an unfilled required-for-this-source field (e.g. no
  // cartridge uploaded) is a thrown validation error, not a requireInput
  // pause (see steps.course-schedule-from-source.ts).
  "course-schedule-from-source",
  // Pure parsers over already-available inputs (the schedule, the outputs
  // multi-select) - never pause for a human, never touch the network or the
  // DOM; an invalid selection is a thrown validation error, not a
  // requireInput pause (see steps.course-build-scope.ts).
  "select-course-modules",
  "select-course-outputs",
  // Resolves the "Codebase and associated assignments" family's repository
  // (or does nothing when deselected) and never pauses for a human; an
  // instructor selecting this family without a codebase-anchored source is a
  // thrown validation error, not a requireInput pause (see
  // steps.course-build-codebase.ts).
  "resolve-codebase-repo",
]);

/**
 * Every OTHER step type in STEP_REGISTRY is interactive and therefore NOT in
 * HEADLESS_SAFE_STEP_TYPES above or a key of CONDITIONALLY_HEADLESS_SAFE
 * below. This set exists so headless.test.ts's registry step-type coverage
 * test can assert that classification is EXHAUSTIVE: every STEP_REGISTRY
 * type must land in exactly one of the three buckets. Before this set
 * existed, a type that fell through all the above was silently (and
 * correctly, by default) treated as not-headless-safe by isHeadlessSafeStep
 * below - but nothing verified that omission was deliberate, so a newly
 * registered step could sit unclassified indefinitely with no test
 * reflecting it either way. Adding a type here changes nothing at runtime
 * (isHeadlessSafeStep already returns false for anything absent from the
 * two sets above); it only makes an already-real exclusion auditable.
 *
 * NOTE on "include-workflow": that string is a pseudo step type at the
 * WorkflowStepConfig level (types.ts), not a STEP_REGISTRY entry - an
 * include-workflow step is replaced by its target workflow's own steps
 * inside expandWorkflowDef before isHeadlessSafeStep ever runs (see the
 * module doc comment at the top of this file). It never appears in
 * STEP_REGISTRY.map(s => s.type), so headless.test.ts's coverage test never
 * needs it classified here, and it must not be added to any of the three
 * sets in this file.
 *
 * Two kinds of entry below, each verified against the step's own run() in
 * registry/*.ts (not just its description):
 *
 * 1) A handful of types already documented above the old prose version of
 *    this list, each with a genuine requireInput/requireConfirmation call in
 *    its run() (confirmed by reading the step, not just trusting the prior
 *    comment - see each entry).
 *
 * 2) The remaining types have no requireInput/requireConfirmation in their
 *    run() at all - only thrown validation errors for bad input, the same
 *    pattern several HEADLESS_SAFE_STEP_TYPES entries use (e.g.
 *    select-course-modules) without disqualifying them. What DOES
 *    disqualify every one of these is that each step's own description in
 *    registry/*.ts ends "Attended-only": a deliberate authorial marker for
 *    an action with a real, often-irreversible external effect (sends a
 *    real invitation or reply, deletes or merges something, changes access
 *    or security settings, posts or publishes content) that this codebase's
 *    authors chose to keep off the unattended path, even without a
 *    mechanical pause enforcing it. That label is a hint, not automatically
 *    binding - "import-quiz-questions" above is ALSO described
 *    "Attended-only" but was deliberately reclassified headless-safe with
 *    its own comment explaining why (matches the lms-assignments
 *    precedent). None of the entries below have been given that same
 *    override, so each keeps today's real, already-deployed behavior
 *    (excluded, by the predicate's existing default) - this only makes that
 *    exclusion explicit and tested instead of silent. Steps with a genuine
 *    browser-only dependency (needing a live uploaded File) are noted
 *    individually.
 */
export const ALWAYS_INTERACTIVE_STEP_TYPES: ReadonlySet<string> = new Set([
  // sets requireConfirmation when the tile has no linked repository
  // (conditional - some runs of it never pause, but the predicate below
  // cannot know that ahead of time, so it excludes the step type
  // unconditionally). (registry/steps.course-setup.tiles.ts)
  "load-course-tile",
  // sets requireConfirmation to review the fetched course list before
  // creating cards. (registry/steps.course-setup.term-courses.ts)
  "fetch-term-courses",
  // sets requireInput to collect the user's chosen improvements before
  // firing agent tasks. (registry/steps.content-insights.ts)
  "tech-report",
  // sets requireInput per course to route the agent task (or hand off to
  // another workflow when there is no repo). (registry/steps.github.ts)
  "agent-improve-repos",
  // sets requireInput to choose the grading plan and/or requireConfirmation
  // to proceed with offline grading that has no saved rubric.
  // (registry/steps.grading-run.ts)
  "grading-preflight",
  // sets requireInput to collect the submissions zip upload for courses
  // with no LMS connection. (registry/steps.grading-run.ts)
  "collect-offline-submissions",
  // sets requireInput to review and approve grades before they post to the
  // LMS. (registry/steps.grading-run.ts)
  "grade-submissions",
  // sets requireInput to review and approve a saved grading draft's grades
  // before they post to the LMS (app-open only - see grade-to-draft in
  // HEADLESS_SAFE_STEP_TYPES above for the unattended scoring half).
  // (registry/steps.grading-draft-flow.ts)
  "review-grading-draft",

  // needs a live uploaded File (input type "uploads": PowerPoint file); a
  // File object only exists inside a browser upload widget and cannot be
  // supplied by a schedule/trigger binding. (registry/steps.media.ts)
  "extract-pptx-slides",

  // Below: "Attended-only" in the step's own description, no
  // requireInput/requireConfirmation anywhere in its run() - see the class
  // comment above for why the label is honored here.
  //
  // sets the topics on a repository. (registry/steps.github.ts)
  "tag-repos",
  // commits arbitrary file content to a repo branch. (registry/steps.github.ts)
  "commit-file-to-repo",
  // sends real GitHub org invitations by username or email.
  // (registry/steps.github.ts)
  "invite-org-members",
  // grants or changes a collaborator's permission on a repository.
  // (registry/steps.github.ts)
  "set-repo-collaborator-access",
  // archives or unarchives a repository. (registry/steps.github.ts)
  "archive-repo",
  // permanently deletes repositories; the "type DELETE to confirm" input is
  // a thrown validation error on mismatch, not a requireConfirmation pause.
  // (registry/steps.github.ts)
  "delete-org-repos",
  // submits an approve/request-changes/comment review on a pull request.
  // (registry/steps.github.pull-requests.ts)
  "review-pull-request",
  // merges a pull request (merge, squash, or rebase).
  // (registry/steps.github.pull-requests.ts)
  "merge-pull-request",
  // locks a repository branch's protection rules.
  // (registry/steps.github.pull-requests.ts)
  "set-branch-protection",
  // publishes file content into Canvas as a wiki page.
  // (registry/steps.lms-items.ts)
  "publish-file-as-page",
  // publishes or unpublishes many Canvas modules at once.
  // (registry/steps.lms-items.ts)
  "bulk-publish-modules",
  // bulk-deletes Canvas assignments, quizzes, discussions, or pages.
  // (registry/steps.lms-items.ts)
  "bulk-delete-lms-items",
  // renames or deletes a file in a course's Canvas Files area.
  // (registry/steps.lms-items.ts)
  "manage-course-files",
  // publishes an announcement to the LMS course, immediately or scheduled;
  // description says to wire the title/body from Draft an announcement.
  // (registry/steps.announcements.ts)
  "post-announcement",
  // sends a real reply on an LMS inbox conversation; description says to
  // wire the reply text from Draft a reply to a student message.
  // (registry/steps.messaging.ts)
  "reply-to-conversation",
  // creates a real calendar event with a Google Meet link and invites the
  // student; description says to wire the start time from an approved open
  // slot. (registry/steps.messaging.ts)
  "book-meeting",
  // deletes a pending grading draft during review triage.
  // (registry/steps.grading-repos.ts)
  "discard-grading-draft",
  // commits a selective course-copy import for a migration.
  // (registry/steps.lms-migration.ts)
  "submit-selective-import",
  // auto-fixes and overwrites a course Office (docx/pptx) file.
  // (registry/steps.lms-export.ts)
  "remediate-office-file",
  // associates one rubric with many assignments across a course at once.
  // (registry/steps.rubrics.ts)
  "bulk-associate-rubric",
  // commits a GitHub Actions autograder tests workflow into a repository.
  // (registry/steps.testing.ts)
  "setup-tests-workflow",
  // renames or deletes a saved syllabus template.
  // (registry/steps.syllabus.ts)
  "manage-syllabus-template",
  // writes an LMS assignment's content into the repo file (README).
  // (registry/steps.assignments-sync.ts)
  "sync-assignment-to-repo",
  // updates an LMS assignment's description from the repo file (README).
  // (registry/steps.assignments-sync.ts)
  "sync-assignment-from-repo",
]);

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
  // audit-visualizer-coverage's own concept sweep never pauses for a human,
  // but dispatching its batched Copilot task is an outward-facing side
  // effect (opens a GitHub issue on the visualizer repo, assigned to the
  // Copilot coding agent) - so, unlike the sweep itself, it must never fire
  // silently on an unattended run. Mirrors scan-term-courses's own predicate
  // exactly: headless-safe only when the workflow does NOT pin "dispatch" to
  // literal "1". A runtime-bound dispatch field (an attended run form's own
  // checkbox, e.g. presets/course-build.ts's binding for this step) is not
  // enough either - the predicate cannot see a value that only exists at run
  // time, same as prepare-lecture's own runtime-bound autonomous case below -
  // so a workflow wiring dispatch to a runtime field can only ever run
  // attended, never scheduled unattended.
  "audit-visualizer-coverage": (step) => {
    const b = step.bindings.dispatch;
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
