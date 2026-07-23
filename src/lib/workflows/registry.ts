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
import { courseSetupSteps } from "./registry/steps.course-setup";
import { contentSteps } from "./registry/steps.content";
import { mediaSteps } from "./registry/steps.media";
import { assignmentSteps } from "./registry/steps.assignments";
import { rubricSteps } from "./registry/steps.rubrics";
import { gradingSteps } from "./registry/steps.grading";
import { lmsSteps } from "./registry/steps.lms";
import { lmsIntegrationsSteps } from "./registry/steps.lms-integrations";
import { announcementSteps } from "./registry/steps.announcements";
import { messagingSteps } from "./registry/steps.messaging";
import { githubSteps } from "./registry/steps.github";
import { testingSteps } from "./registry/steps.testing";
import { syllabusSteps } from "./registry/steps.syllabus";
import { knowledgeSteps } from "./registry/steps.knowledge";

export const STEP_REGISTRY: StepDefinition[] = [
  ...planningSteps,
  ...courseSetupSteps,
  ...contentSteps,
  ...mediaSteps,
  ...assignmentSteps,
  ...rubricSteps,
  ...gradingSteps,
  ...lmsSteps,
  ...lmsIntegrationsSteps,
  ...announcementSteps,
  ...messagingSteps,
  ...githubSteps,
  ...testingSteps,
  ...syllabusSteps,
  ...knowledgeSteps,
];

export function getStepDefinition(type: string): StepDefinition | undefined {
  return STEP_REGISTRY.find((s) => s.type === type);
}
