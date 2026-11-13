import type { AutomaticRepoGradeTargetState } from "./automatic-status";

export const AUTOMATIC_GRADE_DETAIL_STATES: readonly AutomaticRepoGradeTargetState[] =
  ["blocked", "embedded-profile-required", "partial", "no-submission"];

export type AutomaticRepoGradeBlock = {
  repo: string;
  folder: string;
  sourceRef: string;
  explanation: string;
  partial?: true;
  noSubmission?: true;
  sourceSha?: string;
  noSubmissionStale?: true;
  noSubmissionExplicit?: true;
  observedSourceSha?: string;
  observedSourceRef?: string;
  priorAttempt?: true;
  observedState?: string;
  observedRunStartedAt?: string;
  runStartedAt?: string;
};

export type AutomaticRepoGradeBlocks = {
  status: "loaded";
  run: { id: string; startedAt: string; discoveryExplanation: string | null } | null;
  targets: AutomaticRepoGradeBlock[];
}
  | { status: "unavailable" };
