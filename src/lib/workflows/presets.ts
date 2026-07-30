// Built-in workflow presets.
//
// Presets are composite workflows that orchestrate multiple steps to complete
// common teaching tasks. Custom workflows are merged with presets when displayed.

import type { WorkflowDef } from "@/lib/workflows/types";
import { resolvePresetOverride } from "@/lib/workflows/preset-overrides";

export * from "./presets/grading";
export * from "./presets/course-setup";
export * from "./presets/content";
export * from "./presets/communication";

import {
  GRADE_SUBMISSIONS,
  GRADE_TO_DRAFT,
  REVIEW_GRADING_DRAFTS,
  CARTRIDGE_GRADING,
  BATCH_GRADE_REPOS,
  ZERO_MISSING_SUBMISSIONS,
  GRADE_WHEN_NEEDED,
  REVIEW_AND_EXPORT_GRADES_CSV,
  NUDGE_MISSING_FROM_GRADEBOOK,
  NUDGE_MISSING_SUBMISSIONS,
  DEADLINE_REMINDER_DRAFTS,
  ZERO_MISSING_SUBMISSIONS_ALL_COURSES,
  BATCH_GRADE_REPOS_ALL_COURSES,
} from "./presets/grading";
import {
  COURSE_KICKOFF,
  NO_CODE_KICKOFF,
  COURSE_REFRESH,
  REPO_AGENT_UPDATE,
  STARTER_MATERIALS,
  IMPORT_COURSES,
  ASSIGN_DUE_DATES,
  UPDATE_COURSE_TECH,
  STUDENT_REPOS,
  CLASS_ROSTER_AND_REPOS,
  TERM_KICKOFF_IMPORT,
  CLOSED_INSTITUTION_ONBOARDING,
  COURSE_HEALTH_CHECK,
} from "./presets/course-setup";
import {
  PREPARE_LECTURE,
  LECTURE_QA,
  WEEKLY_STUDY_GUIDE_PAGE,
  WEEKLY_LECTURE_NARRATION,
  WEEKLY_LECTURE_VIDEO,
  QUIZ_FROM_REPO,
  ASSIGNMENT_KIT,
  GROW_KNOWLEDGE_BASE,
  MODULE_SLIDES_FROM_TEMPLATE,
  WEEKLY_LECTURE_DECK,
  QUIZ_PIPELINE,
  NEXT_WEEK_LECTURES,
  WEEKLY_CONCEPT_ANIMATIONS,
  WEEKLY_EVERYTHING_PREP,
  PROBLEM_SOLVING_COMPANION,
  MODULE_HOMEWORK_ANSWERS,
} from "./presets/content";
import {
  DRAFT_AND_POST_ANNOUNCEMENT,
  WEEKLY_KICKOFF_ANNOUNCEMENT,
  MORNING_BRIEFING,
  INBOX_REPLY_DRAFTS,
  MEETING_REQUEST_AUTOPILOT,
  COPILOT_PR_SHEPHERD,
} from "./presets/communication";

/**
 * Every code-defined preset, in the exact display order allWorkflows has
 * always used. Exported (not just used internally) so the builder/panel
 * layer can look up the RAW, unmodified preset a saved override targets -
 * see preset-overrides.ts's toStoredDef/diffAgainstPreset, which must diff
 * against this, never against an already-resolved (possibly
 * already-overridden) def.
 */
export const PRESET_WORKFLOWS: WorkflowDef[] = [
  DRAFT_AND_POST_ANNOUNCEMENT,
  WEEKLY_STUDY_GUIDE_PAGE,
  WEEKLY_LECTURE_NARRATION,
  WEEKLY_LECTURE_VIDEO,
  QUIZ_FROM_REPO,
  ASSIGNMENT_KIT,
  GROW_KNOWLEDGE_BASE,
  MODULE_SLIDES_FROM_TEMPLATE,
  WEEKLY_LECTURE_DECK,
  WEEKLY_KICKOFF_ANNOUNCEMENT,
  COURSE_KICKOFF,
  NO_CODE_KICKOFF,
  COURSE_REFRESH,
  STARTER_MATERIALS,
  IMPORT_COURSES,
  ASSIGN_DUE_DATES,
  GRADE_SUBMISSIONS,
  GRADE_TO_DRAFT,
  CARTRIDGE_GRADING,
  REVIEW_GRADING_DRAFTS,
  BATCH_GRADE_REPOS,
  ZERO_MISSING_SUBMISSIONS,
  PREPARE_LECTURE,
  LECTURE_QA,
  UPDATE_COURSE_TECH,
  REPO_AGENT_UPDATE,
  STUDENT_REPOS,
  CLASS_ROSTER_AND_REPOS,
  MORNING_BRIEFING,
  INBOX_REPLY_DRAFTS,
  MEETING_REQUEST_AUTOPILOT,
  GRADE_WHEN_NEEDED,
  DEADLINE_REMINDER_DRAFTS,
  NUDGE_MISSING_SUBMISSIONS,
  QUIZ_PIPELINE,
  COURSE_HEALTH_CHECK,
  COPILOT_PR_SHEPHERD,
  NEXT_WEEK_LECTURES,
  TERM_KICKOFF_IMPORT,
  CLOSED_INSTITUTION_ONBOARDING,
  REVIEW_AND_EXPORT_GRADES_CSV,
  NUDGE_MISSING_FROM_GRADEBOOK,
  WEEKLY_CONCEPT_ANIMATIONS,
  WEEKLY_EVERYTHING_PREP,
  PROBLEM_SOLVING_COMPANION,
  MODULE_HOMEWORK_ANSWERS,
  ZERO_MISSING_SUBMISSIONS_ALL_COURSES,
  BATCH_GRADE_REPOS_ALL_COURSES,
];

/** The raw, unmodified code preset for `id`, or undefined when `id` is not a
 * preset - i.e. every from-scratch custom workflow (AC5), whose id is always
 * a `crypto.randomUUID()` string that can never collide with a preset's own
 * slug id. */
export function getPresetDef(id: string): WorkflowDef | undefined {
  return PRESET_WORKFLOWS.find((w) => w.id === id);
}

/**
 * Merge built-in presets with custom workflows: one entry per preset (its
 * saved override, if the current user has one, resolved against the
 * CURRENT preset - see preset-overrides.ts), then every remaining custom
 * workflow whose id is NOT a preset's (plain, from-scratch workflows, and
 * any pre-existing "(copy)" row from before this feature - see
 * docs/REGRESSION.md #153 for why those are deliberately left alone rather
 * than guessed at). Returns presets first, then custom workflows, matching
 * the order this function has always returned.
 */
export function allWorkflows(custom: WorkflowDef[]): WorkflowDef[] {
  const customById = new Map(custom.map((w) => [w.id, w]));
  const resolvedPresets = PRESET_WORKFLOWS.map((preset) => {
    const stored = customById.get(preset.id);
    if (!stored) return preset;
    // Consumed: whatever is left in customById after this loop is a plain
    // custom workflow, not tied to any preset's identity.
    customById.delete(preset.id);
    return resolvePresetOverride(preset, stored);
  });
  return [...resolvedPresets, ...customById.values()];
}
