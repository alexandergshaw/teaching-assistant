// Client-side step catalog: step definitions that run workflows.
//
// Aggregator re-export: combines step definitions from domain-specific modules.
import type { StepDefinition } from "@/lib/workflows/registry-helpers";

import { lmsModuleSteps } from "./steps.lms-modules";
import { lmsExportSteps } from "./steps.lms-export";
import { lmsItemSteps } from "./steps.lms-items";
import { lmsMigrationSteps } from "./steps.lms-migration";

export const lmsSteps: StepDefinition[] = [
  ...lmsModuleSteps,
  ...lmsExportSteps,
  ...lmsItemSteps,
  ...lmsMigrationSteps,
];
