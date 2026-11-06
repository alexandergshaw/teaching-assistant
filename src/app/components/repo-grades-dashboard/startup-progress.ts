import type { RepoGradeStartupTarget } from "@/lib/repo-grades-dashboard/scheduler";
import type { RepoGradePreparationDiagnostic } from "@/lib/repo-grades-dashboard/preparation-runtime";
import type { RepoGradePreparationRetry } from "@/lib/repo-grades-dashboard/preparation-ledger";
import type { RepoGradeFeedbackField, RepoGradeResultRecord } from "@/lib/supabase/types.repo-grades-dashboard";

export type CourseStartupState =
  | "checking"
  | "queued"
  | "running"
  | "succeeded"
  | "no-submission"
  | "no-work"
  | "partial"
  | "failed"
  | "unknown"
  | "blocked"
  | "embedded-profile-required"
  | "busy"
  | "already-processed"
  | "stopped"
  | "not-started"
  | "not-configured";

export type CourseStartupProgress = Readonly<{
  courseId: string;
  label: string;
  states: readonly Readonly<{ state: CourseStartupState; count: number }>[];
}>;

export type RepoGradesStartupProgress = Readonly<{
  phase: "unavailable" | "checking" | "processing" | "complete" | "incomplete" | "stopped";
  courses: readonly CourseStartupProgress[];
  historyRevisionByCourse?: ReadonlyMap<string, number>;
  previousBatch?: Readonly<{ active: boolean; courses: readonly CourseStartupProgress[] }>;
  recoverableResults?: readonly RepoGradesStartupRecovery[];
  preparations?: readonly RepoGradesStartupPreparation[];
  preparationRetryAvailable?: boolean;
}>;

export type RepoGradesStartupPreparationResult = RepoGradePreparationDiagnostic & {
  preparationRetry?: RepoGradePreparationRetry;
};

export type RepoGradesStartupPreparation = Readonly<{
  courseId: string;
  folder: string;
  status: RepoGradePreparationDiagnostic["status"] | "retrying" | "request-failed";
  canRetry: boolean;
}>;

export type RepoGradesStartupRecovery = Readonly<{
  target: RepoGradeStartupTarget;
  status: "partial" | "unknown";
  unretainedResult: RepoGradeResultRecord;
  feedbackRetention?: RepoGradeFeedbackField;
}>;
