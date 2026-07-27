// Client-side step catalog: step definitions that run workflows.
//
// Aggregator re-export: combines step definitions from domain-specific modules.
import type { StepDefinition } from "@/lib/workflows/registry-helpers";

import { assignmentCreationSteps } from "./steps.assignments-creation";
import { assignmentSyncSteps } from "./steps.assignments-sync";
import { assignmentQuizSteps } from "./steps.assignments-quiz";
import { assignmentAnswerSteps } from "./steps.assignments-answers";
import { assignmentTemplateSteps } from "./steps.assignments-template";
import { assignmentTestTemplateSteps } from "./steps.assignments-test-template";
import { classSessionTemplateSteps } from "./steps.class-session-template";
import { classSessionPopulateSteps } from "./steps.class-session-populate";

export const assignmentSteps: StepDefinition[] = [
  ...assignmentCreationSteps,
  ...assignmentSyncSteps,
  ...assignmentQuizSteps,
  ...assignmentAnswerSteps,
  ...assignmentTemplateSteps,
  ...assignmentTestTemplateSteps,
  ...classSessionTemplateSteps,
  ...classSessionPopulateSteps,
];
