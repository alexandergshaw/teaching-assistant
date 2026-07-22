// Client-side step catalog: step definitions that run workflows.
//
// Aggregator re-export: combines step definitions from domain-specific modules.
import type { StepDefinition } from "@/lib/workflows/registry-helpers";

import { gradingRunSteps } from "./steps.grading-run";
import { gradingDraftFlowSteps } from "./steps.grading-draft-flow";
import { gradingRepoSteps } from "./steps.grading-repos";
import { gradingSinglesSteps } from "./steps.grading-singles";
import { gradingCartridgeSteps } from "./steps.grading-cartridge";

export const gradingSteps: StepDefinition[] = [
  ...gradingRunSteps,
  ...gradingDraftFlowSteps,
  ...gradingRepoSteps,
  ...gradingSinglesSteps,
  ...gradingCartridgeSteps,
];
