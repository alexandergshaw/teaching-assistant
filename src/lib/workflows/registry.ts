// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.

import type { StepDefinition } from "./registry-helpers";

// Re-export everything from registry-helpers for backward compatibility
export type {
  TermCoursePreviewRow,
  StepRunHelpers,
  StepRunSummary,
  TableRowDetail,
  StepRunResult,
  StepDefinition,
  StepInputSpec,
  StepOutputSpec,
} from "./registry-helpers";
export {
  encodeTextBase64,
  parseRosterLines,
  courseToInputPayload,
  base64ToBlob,
  blobToBase64,
  parseDayTime,
  weekDeadline,
  getCachedLiveModules,
  setCachedLiveModules,
  classifyRubricSource,
  resolveModulesAhead,
  resolveTileCurrentWeek,
  deriveCurrentModule,
  resolveModuleObjectives,
  resolveModuleContext,
  loadTileWeekTopic,
  resolveDeckTheme,
  gatherModuleMaterials,
  assembleLectureFiles,
} from "./registry-helpers";

import { planningSteps } from "./registry/steps.planning";
import { courseScheduleFromSourceSteps } from "./registry/steps.course-schedule-from-source";
import { courseBuildScopeSteps } from "./registry/steps.course-build-scope";
import { courseBuildCodebaseSteps } from "./registry/steps.course-build-codebase";
import { courseSetupSteps } from "./registry/steps.course-setup";
import { contentSteps } from "./registry/steps.content";
import { mediaSteps } from "./registry/steps.media";
import { assignmentSteps } from "./registry/steps.assignments";
import { rubricSteps } from "./registry/steps.rubrics";
import { gradingSteps } from "./registry/steps.grading";
import { lmsSteps } from "./registry/steps.lms";
import { lmsIntegrationsSteps } from "./registry/steps.lms-integrations";
import { announcementSteps } from "./registry/steps.announcements";
import { weeklyAnnouncementScheduleSteps } from "./registry/steps.weekly-announcement-schedule";
import { messagingSteps } from "./registry/steps.messaging";
import { githubSteps } from "./registry/steps.github";
import { testingSteps } from "./registry/steps.testing";
import { syllabusSteps } from "./registry/steps.syllabus";
import { knowledgeSteps } from "./registry/steps.knowledge";
import { visualizerSteps } from "./registry/steps.visualizer";
import { courseCalendarSteps } from "./registry/steps.course-calendar";
import { caseStudyResearchSteps } from "./registry/steps.case-study-research";

export const STEP_REGISTRY: StepDefinition[] = [
  ...planningSteps,
  ...courseScheduleFromSourceSteps,
  ...courseBuildScopeSteps,
  ...courseBuildCodebaseSteps,
  ...courseSetupSteps,
  ...contentSteps,
  ...mediaSteps,
  ...assignmentSteps,
  ...rubricSteps,
  ...gradingSteps,
  ...lmsSteps,
  ...lmsIntegrationsSteps,
  ...announcementSteps,
  ...weeklyAnnouncementScheduleSteps,
  ...messagingSteps,
  ...githubSteps,
  ...testingSteps,
  ...syllabusSteps,
  ...knowledgeSteps,
  ...visualizerSteps,
  ...courseCalendarSteps,
  ...caseStudyResearchSteps,
];

export function getStepDefinition(type: string): StepDefinition | undefined {
  return STEP_REGISTRY.find((s) => s.type === type);
}
