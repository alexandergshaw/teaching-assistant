import type { RepoGradeRepositoryCoverage } from "./scheduler";
import type { AutomaticRepoGradeScheduleDraft } from "./automatic-schedule";

export type AutomaticRepoGradeSchedule = AutomaticRepoGradeScheduleDraft & { nextAt: string };

export type AutomaticRepoGradePreparation = { id: number; label: string; folder: string };
export type AutomaticRepoGradeRecovery = AutomaticRepoGradePreparation & { repo: string; expiresAt: string };

export type AutomaticRepoGradeClassQueue = {
  customized: boolean;
  courses: { courseId: string; label: string; included: boolean }[];
};

export type AutomaticRepoGradeCourseState = "checking" | "scanned" | "partial" | "not-configured" | "stopped";
export type AutomaticRepoGradeTargetState = "queued" | "running" | "succeeded" | "no-submission" | "partial"
  | "failed" | "unknown" | "busy" | "blocked" | "already-processed" | "not-started" | "embedded-profile-required" | "stopped";

export type AutomaticRepoGradeRun = {
  id: string;
  phase: "discovering" | "grading" | "complete" | "incomplete" | "stopped";
  settling: boolean;
  waitingForBrowserStartup: boolean;
  courses: {
    courseId: string;
    label: string;
    state: AutomaticRepoGradeCourseState;
    reason: string | null;
    repositories: RepoGradeRepositoryCoverage | null;
    counts: { state: AutomaticRepoGradeTargetState; count: number; reason: string | null }[];
  }[];
};

export type AutomaticRepoGradeStatus = {
  status: "loaded";
  enabled: boolean;
  githubRetryEnabled: boolean;
  githubRetryAt: string | null;
  schedule: AutomaticRepoGradeSchedule | null;
  classQueue?: AutomaticRepoGradeClassQueue | null;
  run: AutomaticRepoGradeRun | null;
  preparations: AutomaticRepoGradePreparation[];
  recoveries: AutomaticRepoGradeRecovery[];
  control?: { action: "start" | "stop"; changed: boolean };
} | { status: "unavailable" };
