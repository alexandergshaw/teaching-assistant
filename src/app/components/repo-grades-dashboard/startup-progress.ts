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
  | "busy"
  | "already-processed"
  | "stopped"
  | "not-configured";

export type CourseStartupProgress = Readonly<{
  courseId: string;
  label: string;
  states: readonly Readonly<{ state: CourseStartupState; count: number }>[];
}>;

export type RepoGradesStartupProgress = Readonly<{
  phase: "unavailable" | "checking" | "processing" | "complete" | "stopped";
  courses: readonly CourseStartupProgress[];
}>;
