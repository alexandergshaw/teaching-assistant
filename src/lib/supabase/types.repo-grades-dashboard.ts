export type RepoGradeOutcome = "succeeded" | "no-submission" | "partial" | "failed" | "unknown";

/** Read-side projection of the attempt ledger. Writes use the ledger RPCs. */
export type RepoGradeAttemptReceiptRow = {
  generation: number;
  user_id: string;
  course_id: string | null;
  repo: string;
  folder: string | null;
  source_ref: string | null;
  source_sha: string | null;
  mode: "automatic" | "retry" | "manual";
  status: "claimed" | RepoGradeOutcome;
  claimed_at: string;
  dispatch_state: "prepared" | "started" | null;
};

export type RepoGradeFeedbackSections = {
  strengths: string;
  improvements: string;
  resubmitNotice: string;
  rawScore: string;
};

export type RepoGradeFeedbackField = keyof RepoGradeFeedbackSections | "overall" | "rubric";

export type RepoGradeResultRecord = {
  score: number;
  feedback: string;
  sections: RepoGradeFeedbackSections;
  rubric: Array<{ area: string; score: string; comment: string }>;
};

export type RepoGradeHistoryRow = {
  generation: number;
  repo: string;
  folder: string;
  source_ref: string;
  source_sha: string;
  profile_fingerprint: string;
  status: "claimed" | RepoGradeOutcome;
  claimed_at: string;
  settled_at: string | null;
  reconciled_at: string | null;
  score: number | null;
  feedback: string | null;
  rubric: RepoGradeResultRecord["rubric"] | null;
  /** A legacy result has overall feedback but no original sections. */
  feedback_sections?: RepoGradeFeedbackSections | null;
  feedback_retention?: RepoGradeFeedbackField | null;
};

export type RepoGradeClaimStatus =
  | "terminal"
  | "busy"
  | "capacity"
  | "explicit-retry-required"
  | "forbidden"
  | "configuration-changed";
import type { Json } from "./types";

/** Raw saved columns captured by the server planner before discovery. */
export type RepoGradeCourseConfig = {
  github_org: string | null;
  repos: Json;
  rubric_name: string | null;
  rubric_data: string | null;
  repo_module_pairing: Json;
  student_repos: Json;
};
