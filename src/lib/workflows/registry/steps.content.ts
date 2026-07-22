// Client-side step catalog: aggregates content-related step definitions.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import { type StepDefinition } from "@/lib/workflows/registry-helpers";
import { contentLectureSteps } from "./steps.content-lectures";
import { contentInsightSteps } from "./steps.content-insights";
import { contentGeneratorSteps } from "./steps.content-generators";

export const contentSteps: StepDefinition[] = [
  ...contentLectureSteps,
  ...contentInsightSteps,
  ...contentGeneratorSteps,
];
