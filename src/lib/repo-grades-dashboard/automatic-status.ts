export type AutomaticRepoGradePreparation = { id: number; label: string; folder: string };
export type AutomaticRepoGradeRecovery = AutomaticRepoGradePreparation & { repo: string };

export type AutomaticRepoGradeCourseState = "checking" | "scanned" | "partial" | "not-configured" | "stopped";
export type AutomaticRepoGradeTargetState = "queued" | "running" | "succeeded" | "no-submission" | "partial"
  | "failed" | "unknown" | "busy" | "blocked" | "already-processed" | "not-started" | "embedded-profile-required" | "stopped";

export type AutomaticRepoGradeRun = {
  id: string;
  phase: "discovering" | "grading" | "complete" | "incomplete" | "stopped";
  courses: {
    courseId: string;
    label: string;
    state: AutomaticRepoGradeCourseState;
    reason: string | null;
    counts: { state: AutomaticRepoGradeTargetState; count: number; reason: string | null }[];
  }[];
};

export type AutomaticRepoGradeStatus = {
  status: "loaded";
  enabled: boolean;
  run: AutomaticRepoGradeRun | null;
  preparations: AutomaticRepoGradePreparation[];
  recoveries: AutomaticRepoGradeRecovery[];
} | { status: "unavailable" };
