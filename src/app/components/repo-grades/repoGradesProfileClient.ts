import { readRepoGradeProfileAction, reviewRepoGradePreparationPolicyAction, saveRepoGradeProfileAction } from "@/app/actions/repo-grade-profiles";
import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";

export type ProfileReadResult = Awaited<ReturnType<typeof readRepoGradeProfileAction>> | { status: "request-failed" };
type ProfileSaveResult = Awaited<ReturnType<typeof saveRepoGradeProfileAction>> | { status: "request-failed" };
export type PolicyReviewResult = Awaited<ReturnType<typeof reviewRepoGradePreparationPolicyAction>> | { status: "request-failed" };
export type SavedProfile = Extract<ProfileReadResult, { status: "loaded" }>["profile"];

export type ProfileDraft = Pick<SavedProfile, "provider" | "instructions" | "rubric" | "useReadmeInstructions" | "applyNamingDeduction" | "runCode">
  & { sourceRef: string; targetBranch: SavedProfile["targetBranch"] };

export function profileDraft(profile: SavedProfile | null): ProfileDraft {
  return {
    provider: profile?.provider ?? "gemini",
    sourceRef: profile?.sourceRef ?? "",
    targetBranch: profile?.targetBranch ?? null,
    instructions: profile?.instructions ?? "",
    rubric: profile?.rubric ?? "",
    useReadmeInstructions: profile?.useReadmeInstructions ?? false,
    applyNamingDeduction: profile?.applyNamingDeduction ?? true,
    runCode: profile?.runCode ?? false,
  };
}

const PROFILE_OPERATION = {
  read: "Read automatic repository grading profile",
  save: "Save automatic repository grading profile",
  policy_preview: "Preview repository rubric preparation policy",
  policy_apply: "Update repository rubric preparation policy",
};

async function measureProfileRequest<T extends { status: string }>(
  kind: keyof typeof PROFILE_OPERATION,
  request: () => Promise<T>,
): Promise<T | { status: "request-failed" }> {
  const started = performance.now();
  let result: T | { status: "request-failed" };
  try {
    result = await request();
  } catch {
    result = { status: "request-failed" };
  }
  const status = result.status;
  const succeeded = ["loaded", "not-configured", "saved", "preview", "current", "updated"].includes(status);
  try {
    recordSessionDiagnosticEntry({
      at: new Date().toISOString(),
      surface: "grading",
      operation: `repo_grade_profile_${kind}`,
      label: PROFILE_OPERATION[kind],
      outcome: succeeded ? "success" : "failure",
      durationMs: Math.min(3_600_000, Math.max(0, Math.round(performance.now() - started))),
      ...(succeeded ? {} : { cause: status }),
    });
  } catch {
    // Diagnostics are independent of profile storage.
  }
  return result;
}

export function reviewRepoGradePreparationPolicy(
  courseId: string, folder: string, expectedPreview?: string,
): Promise<PolicyReviewResult> {
  return measureProfileRequest(expectedPreview === undefined ? "policy_preview" : "policy_apply",
    () => reviewRepoGradePreparationPolicyAction(courseId, folder, expectedPreview));
}

export function loadRepoGradeProfile(courseId: string, folder: string): Promise<ProfileReadResult> {
  return measureProfileRequest("read", () => readRepoGradeProfileAction(courseId, folder));
}

export function saveRepoGradeProfile(
  courseId: string, folder: string, { provider, ...settings }: ProfileDraft, baseline: SavedProfile | null,
): Promise<ProfileSaveResult> {
  return measureProfileRequest("save", () => saveRepoGradeProfileAction(
    courseId, folder, settings, baseline?.configurationFingerprint ?? null, provider,
  ));
}
