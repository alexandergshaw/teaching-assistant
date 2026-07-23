// Client-side step catalog: step definitions that run workflows.
//
// Aggregator re-export: combines step definitions from domain-specific modules.
import type { StepDefinition } from "@/lib/workflows/registry-helpers";

import { courseSetupStorageSteps } from "./steps.course-setup.storage";
import { courseSetupRosterSteps } from "./steps.course-setup.rosters";
import { courseSetupMaterialsSteps } from "./steps.course-setup.materials";
import { courseSetupTilesSteps } from "./steps.course-setup.tiles";
import { courseSetupTermCoursesSteps } from "./steps.course-setup.term-courses";
import { courseSetupTimelineSteps } from "./steps.course-setup.timeline";

export const courseSetupSteps: StepDefinition[] = [
  ...courseSetupStorageSteps,
  courseSetupRosterSteps[0],
  ...courseSetupMaterialsSteps,
  courseSetupTilesSteps[0],
  courseSetupTermCoursesSteps[0],
  courseSetupTermCoursesSteps[1],
  courseSetupTimelineSteps[0],
  courseSetupTimelineSteps[1],
  courseSetupRosterSteps[1],
  courseSetupTermCoursesSteps[2],
  courseSetupRosterSteps[2],
  courseSetupRosterSteps[3],
  courseSetupTilesSteps[1],
  courseSetupTilesSteps[2],
];
