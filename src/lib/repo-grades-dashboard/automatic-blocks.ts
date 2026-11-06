export type AutomaticRepoGradeBlock = {
  repo: string;
  folder: string;
  sourceRef: string;
  explanation: string;
  runStartedAt?: string;
};

export type AutomaticRepoGradeBlocks = {
  status: "loaded";
  run: { id: string; startedAt: string; discoveryExplanation: string | null } | null;
  targets: AutomaticRepoGradeBlock[];
}
  | { status: "unavailable" };
