import type { AutomaticRepoGradeTargetState } from "./automatic-status";

export const AUTOMATIC_GRADE_DETAIL_STATES: readonly AutomaticRepoGradeTargetState[] =
  ["blocked", "embedded-profile-required", "partial"];

export type AutomaticRepoGradeBlock = {
  repo: string;
  folder: string;
  sourceRef: string;
  explanation: string;
  partial?: true;
  runStartedAt?: string;
};

export type AutomaticRepoGradeBlocks = {
  status: "loaded";
  run: { id: string; startedAt: string; discoveryExplanation: string | null } | null;
  targets: AutomaticRepoGradeBlock[];
}
  | { status: "unavailable" };
