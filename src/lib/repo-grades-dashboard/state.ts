import type { RepoGradeCourseConfig, RepoGradeFeedbackField, RepoGradeResultRecord, RepoGradeReviewDraft } from "@/lib/supabase/types.repo-grades-dashboard";
import type { RepoGradeRubricReceipt } from "./profile";
import type { RepoGradeTargetEvidence } from "./preparation-input";

export type RepoGradeCohort = Readonly<{ cohortId: string; receipt: RepoGradeRubricReceipt }>;

export type RepoGradePreparedProvenance = Readonly<{
  key: string;
  context: Readonly<{ instructions: string; source: RepoGradeTargetEvidence["source"] }>;
}>;

export function validRepoGradeCohortId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export type RepoGradeClaimRequest = {
  repo: string;
} & (
  | { mode: "manual"; courseId?: string; folder?: string }
  | {
      mode: "automatic" | "retry";
      courseId: string;
      courseConfig: RepoGradeCourseConfig;
      folder: string;
      sourceRef: string;
      sha: string;
      cohort: RepoGradeCohort;
      preparation?: RepoGradePreparedProvenance;
      startupBatchId?: string;
      targetedRun?: { runId: string; lease: string };
      changedRefreshRun?: { runId: string; lease: string };
      recoveryRun?: { runId: string; lease: string; capability?: "text-extension-v1" };
    }
);

export type RepoGradeClaim = {
  generation: number;
  token: string;
} & (
  | { mode: "manual" }
  | { mode: "automatic" | "retry" }
);

export type RepoGradeManualSettlement = { outcome: "succeeded" | "failed" | "unknown" };
export type RepoGradeAutomaticSettlement =
  | { outcome: "succeeded"; inputsComplete: true; result: RepoGradeResultRecord, RepoGradeReviewDraft }
  | { outcome: "no-submission"; inputsComplete: true }
  | { outcome: "partial"; feedbackRetention?: RepoGradeFeedbackField }
  | { outcome: "partial"; inputsComplete: true; result: RepoGradeReviewDraft }
  | { outcome: "failed" | "unknown" };

// Mirrors the durable bounds. PostgreSQL text cannot represent NUL or
// unmatched UTF-16 surrogates. Refuse these instead of altering the content.
export function retainableFeedbackText(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.length <= 2 * limit
    && !value.includes("\u0000") && value.isWellFormed() && [...value].length <= limit;
}

const SECTION_LIMITS = { strengths: 16000, improvements: 16000, resubmitNotice: 16000, rawScore: 128 } as const;
const SECTION_FIELDS = Object.keys(SECTION_LIMITS) as Array<keyof typeof SECTION_LIMITS>;

export function isRepoGradeFeedbackField(value: unknown): value is RepoGradeFeedbackField {
  return value === "overall" || value === "rubric"
    || (typeof value === "string" && Object.hasOwn(SECTION_LIMITS, value));
}

export function unretainedRepoGradeFeedbackField(
  feedback: unknown, sections: unknown, rubric: unknown,
): RepoGradeFeedbackField | undefined {
  if (!retainableFeedbackText(feedback, 48000)) return "overall";
  if (sections === null || typeof sections !== "object" || Array.isArray(sections)) return "strengths";
  const values = sections as Record<string, unknown>;
  for (const field of SECTION_FIELDS) {
    if (!retainableFeedbackText(values[field], SECTION_LIMITS[field])) return field;
  }
  if (!Array.isArray(rubric) || rubric.length > 40 || !rubric.every((row) => (
    row && retainableFeedbackText(row.area, 256) && retainableFeedbackText(row.score, 128)
    && retainableFeedbackText(row.comment, 4096)
  ))) return "rubric";
}
