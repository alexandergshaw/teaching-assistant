// Grouping of workflow step types ("actions") into user-facing categories for
// the workflow builder's searchable action palette.
//
// Kept as a standalone mapping rather than a field on each of the ~125
// STEP_REGISTRY entries so the (very large) registry stays untouched. A step
// that is not listed here falls into the "Other" group in the palette, so a
// newly added action never disappears from the builder - it just shows under
// "Other" until it is categorized here. This module is plain data (no imports),
// so it is safe to use from both the client builder and unit tests.

export interface StepCategory {
  id: string;
  label: string;
}

// Display order of the groups in the palette. "other" is last: it catches any
// step type not assigned below.
export const STEP_CATEGORY_ORDER: StepCategory[] = [
  { id: "planning", label: "Planning & schedules" },
  { id: "course-setup", label: "Course setup" },
  { id: "content", label: "Content & lessons" },
  { id: "media", label: "Slides, narration & video" },
  { id: "assignments", label: "Assignments & quizzes" },
  { id: "rubrics", label: "Rubrics" },
  { id: "grading", label: "Grading" },
  { id: "lms", label: "LMS / Canvas" },
  { id: "announcements", label: "Announcements" },
  { id: "messaging", label: "Messaging & meetings" },
  { id: "github", label: "GitHub & repos" },
  { id: "testing", label: "Autograding & CI" },
  { id: "syllabus", label: "Syllabus" },
  { id: "knowledge", label: "Knowledge & research" },
  { id: "other", label: "Other" },
];

// Category id -> the step types in it. Every registry step type should appear
// in exactly one list (verified by the internal-consistency test and by a
// one-time coverage check against STEP_REGISTRY during development).
const CATEGORY_MEMBERS: Record<string, string[]> = {
  planning: [
    "generate-schedule",
    "generate-dated-schedule",
    "generate-schedule-offline",
    "schedule-from-repo",
    "outline-course-from-repo",
    "parse-academic-calendar",
    "course-progress",
    "resolve-week-topic",
    "list-upcoming-deadlines",
    "list-deadlines-from-feed",
    "compose-briefing",
  ],
  "course-setup": [
    "load-course-tile",
    "fetch-term-courses",
    "create-course-cards",
    "set-course-start-dates",
    "assign-week-deadlines",
    "save-csv-to-course",
    "save-zip-to-course",
    "starter-materials",
    "fetch-course-roster",
    "link-github-usernames",
    "scan-term-courses",
    "sync-course-tiles-from-lms",
    "import-roster-from-csv",
    "create-course-tile",
    "configure-institution-feeds",
  ],
  content: [
    "lecture-zip",
    "prepare-lecture",
    "lecture-qa",
    "tech-report",
    "extract-topics-from-repo",
    "generate-module-intro",
    "generate-lesson-plan",
    "generate-worked-examples",
    "generate-document",
    "revise-generated-document",
    "find-practice-problems",
    "draft-upcoming-lectures",
  ],
  media: [
    "generate-slides-standalone",
    "revise-generated-slides",
    "generate-lecture-script",
    "extract-pptx-slides",
    "find-case-study-slide",
    "synthesize-narration",
    "generate-avatar-video",
    "poll-avatar-video",
    "generate-presentation-from-template",
    "generate-concept-animations",
  ],
  assignments: [
    "generate-assignment-brief",
    "draft-assignment-description",
    "fetch-assignment-brief",
    "get-assignment-sync-state",
    "sync-assignment-to-repo",
    "sync-assignment-from-repo",
    "lms-assignments",
    "generate-quiz-from-material",
    "import-quiz-questions",
    "create-canvas-quiz",
  ],
  rubrics: [
    "generate-rubric-offline",
    "generate-rubric-from-repo",
    "remember-rubric",
    "find-banked-rubric",
    "resolve-rubric",
    "pull-fallback-sources",
    "pull-current-materials",
    "bulk-associate-rubric",
    "lms-rubric",
  ],
  grading: [
    "grading-preflight",
    "collect-offline-submissions",
    "grade-submissions",
    "grade-to-draft",
    "draft-missing-zeros",
    "review-grading-draft",
    "discard-grading-draft",
    "post-grades",
    "check-needs-grading",
    "generate-full-credit-checklist",
    "generate-model-answer",
    "grade-repo",
    "batch-grade-repos-to-draft",
    "grade-one-submission",
    "list-missing-submissions",
    "import-gradebook-csv",
    "export-grades-for-lms",
    "gradebook-health-report",
  ],
  lms: [
    "lms-modules",
    "lms-populate",
    "lms-wipe",
    "blackboard-export",
    "publish-file-as-page",
    "revise-page-with-ai",
    "bulk-publish-modules",
    "bulk-delete-lms-items",
    "manage-course-files",
    "remediate-office-file",
    "check-broken-links",
    "copy-course-content",
    "poll-migration-state",
    "submit-selective-import",
    "export-course-cartridge",
  ],
  announcements: [
    "list-announcements",
    "draft-announcement",
    "compose-weekly-announcement",
    "draft-weekly-announcements",
    "post-announcement",
    "schedule-lecture-announcement",
  ],
  messaging: [
    "read-inbox",
    "read-email-inboxes",
    "draft-message-reply",
    "save-message-draft",
    "reply-to-conversation",
    "triage-inbox",
    "detect-meeting-request",
    "find-open-slots",
    "draft-meeting-reply",
    "book-meeting",
    "get-unread-and-notifications",
    "draft-student-nudges",
    "check-mailbox-connection",
  ],
  github: [
    "repo-from-template",
    "fill-readmes",
    "agent-edit-repo",
    "assign-student-repos",
    "agent-improve-repos",
    "check-student-activity",
    "generate-copilot-prompt",
    "poll-copilot-tasks",
    "read-pr-diff",
    "review-pull-request",
    "merge-pull-request",
    "set-branch-protection",
    "tag-repos",
    "list-github-repos",
    "ingest-repo-digest",
    "commit-file-to-repo",
    "detect-repo-frontend",
    "invite-org-members",
    "set-repo-collaborator-access",
    "archive-repo",
    "delete-org-repos",
  ],
  testing: [
    "setup-tests-workflow",
    "dispatch-tests",
    "poll-test-run",
    "run-submission-code",
    "list-ci-artifacts",
  ],
  syllabus: [
    "import-lms-syllabus",
    "detect-syllabus-fields",
    "regenerate-syllabus-field",
    "list-syllabus-templates",
    "manage-syllabus-template",
  ],
  knowledge: [
    "research-topic",
    "run-research-loop",
    "measure-knowledge-gap",
    "list-unverified-knowledge",
    "extract-glossary-terms",
  ],
};

// Step type -> category id, flattened from CATEGORY_MEMBERS.
export const STEP_CATEGORIES: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [categoryId, types] of Object.entries(CATEGORY_MEMBERS)) {
    for (const t of types) map[t] = categoryId;
  }
  return map;
})();

const LABELS: Record<string, string> = Object.fromEntries(
  STEP_CATEGORY_ORDER.map((c) => [c.id, c.label])
);

/** The category id for a step type; "other" when it is not assigned above. */
export function stepCategory(type: string): string {
  return STEP_CATEGORIES[type] ?? "other";
}

/** The display label for a category id (falls back to "Other"). */
export function stepCategoryLabel(categoryId: string): string {
  return LABELS[categoryId] ?? "Other";
}

/** The position of a category in STEP_CATEGORY_ORDER (unknown ids sort last). */
export function stepCategoryOrderIndex(categoryId: string): number {
  const i = STEP_CATEGORY_ORDER.findIndex((c) => c.id === categoryId);
  return i === -1 ? STEP_CATEGORY_ORDER.length : i;
}
