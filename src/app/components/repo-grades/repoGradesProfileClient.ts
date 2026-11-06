import { readRepoGradeProfileAction, saveRepoGradeProfileAction } from "@/app/actions/repo-grade-profiles";
import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";

export type ProfileReadResult = Awaited<ReturnType<typeof readRepoGradeProfileAction>> | { status: "request-failed" };
type ProfileSaveResult = Awaited<ReturnType<typeof saveRepoGradeProfileAction>> | { status: "request-failed" };
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

async function measureProfileRequest<T extends { status: string }>(
  kind: "read" | "save",
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
  const succeeded = status === "loaded" || status === "not-configured" || status === "saved";
  try {
    recordSessionDiagnosticEntry({
      at: new Date().toISOString(),
      surface: "grading",
      operation: `repo_grade_profile_${kind}`,
      label: kind === "read" ? "Read automatic repository grading profile" : "Save automatic repository grading profile",
      outcome: succeeded ? "success" : "failure",
      durationMs: Math.min(3_600_000, Math.max(0, Math.round(performance.now() - started))),
      ...(succeeded ? {} : { cause: status }),
    });
  } catch {
    // Diagnostics are independent of profile storage.
  }
  return result;
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
