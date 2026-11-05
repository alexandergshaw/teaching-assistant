import "server-only";

import { isDeepStrictEqual } from "node:util";
import { requireAppOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  captureRepoGradeProfile,
  resolveRepoGradeRubric,
  restoreRepoGradeRubric,
  type RepoGradeProfile,
} from "./profile";
import { validRepoGradeCohortId, type RepoGradeCohort } from "./state";

type CourseFolder = Pick<RepoGradeProfile, "courseId" | "folder">;
type GraderIdentity = Pick<RepoGradeProfile, "provider" | "model" | "graderVersion">;
type ProfileSettings = Partial<Pick<RepoGradeProfile,
  "sourceRef" | "targetBranch" | "instructions" | "rubric" | "useReadmeInstructions" | "applyNamingDeduction" | "runCode"
>>;
type FrozenProfile = RepoGradeCohort & { profile: RepoGradeProfile };

const MAX_CURRENT_PROFILES = 1_000;

function scopedArgs(accountId: string, { courseId, folder }: CourseFolder) {
  return { p_user_id: accountId, p_course_id: courseId, p_folder: folder };
}

function validateCohortId(cohortId: string) {
  if (!validRepoGradeCohortId(cohortId)) {
    throw new Error("Invalid repository grading cohort");
  }
}

async function profileRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    const { data, error } = await createServiceClient().rpc(name, args);
    if (!error) return data;
  } catch {
    // A lost response can follow a successful write. The caller can read back
    // the current version or reuse the same cohort ID to recover its receipt.
  }
  throw new Error("Repository grading profile storage is unavailable");
}

function validateProfile(accountId: string, scope: CourseFolder, raw: unknown): RepoGradeProfile {
  if (raw !== null && typeof raw === "object") {
    const {
      provider, model, graderVersion, sourceRef, targetBranch, instructions, rubric,
      useReadmeInstructions, applyNamingDeduction, runCode,
    } = raw as RepoGradeProfile;
    const captured = captureRepoGradeProfile({ accountId, courseId: scope.courseId, folder: scope.folder }, {
      sourceRef, targetBranch, instructions, rubric, useReadmeInstructions, applyNamingDeduction, runCode,
    }, { provider, model, graderVersion });
    if (captured.status === "ready" && isDeepStrictEqual(raw, captured.profile)) return captured.profile;
  }
  throw new Error("Invalid stored repository grading profile");
}

/** Save only settings explicitly selected for this course and folder. The
 * expected fingerprint is null on initial setup and the last read value on edits. */
export async function saveRepoGradeProfile(
  scope: CourseFolder,
  settings: ProfileSettings,
  grader: GraderIdentity,
  expectedConfigurationFingerprint: string | null,
): Promise<RepoGradeProfile | null> {
  const owner = await requireAppOwner();
  const captured = captureRepoGradeProfile({ accountId: owner.id, courseId: scope.courseId, folder: scope.folder }, settings, grader);
  if (captured.status === "blocked") throw new Error("Invalid repository grading profile settings");
  if (expectedConfigurationFingerprint !== null && !/^[0-9a-f]{64}$/.test(expectedConfigurationFingerprint)) {
    throw new Error("Invalid repository grading configuration fingerprint");
  }

  const profile = captured.profile;
  const result = await profileRpc("repo_grade_save_profile", {
    ...scopedArgs(owner.id, profile),
    p_configuration_fingerprint: profile.configurationFingerprint,
    p_expected_configuration_fingerprint: expectedConfigurationFingerprint,
    p_profile: profile,
  });
  if (typeof result !== "boolean") throw new Error("Invalid repository grading profile save response");
  return result ? profile : null;
}

async function readProfile(scope: CourseFolder, cohortId: string | null) {
  const owner = await requireAppOwner();
  const result = await profileRpc("repo_grade_read_profile", {
    ...scopedArgs(owner.id, scope),
    p_cohort_id: cohortId,
  });
  if (result === null) return null;
  if (typeof result !== "object" || !("profile" in result) || !("receipt" in result)) {
    throw new Error("Invalid repository grading profile read response");
  }
  return { profile: validateProfile(owner.id, scope, result.profile), receipt: result.receipt };
}

export async function readCurrentRepoGradeProfile(scope: CourseFolder): Promise<RepoGradeProfile | null> {
  const result = await readProfile(scope, null);
  if (result && result.receipt !== null) throw new Error("Invalid repository grading profile read response");
  return result?.profile ?? null;
}

/** A single snapshot of current source choices for an already verified owner/course. */
export async function readCurrentRepoGradeProfilesForOwner(
  accountId: string, courseId: string,
): Promise<ReadonlyMap<string, string | null>> {
  try {
    const { data, error, count } = await createServiceClient().from("repo_grade_current_profiles")
      .select("user_id, course_id, folder, configuration_fingerprint, repo_grade_profile_versions(profile)", { count: "exact" })
      .eq("user_id", accountId).eq("course_id", courseId).limit(MAX_CURRENT_PROFILES).retry(false);
    // A capped read must not make omitted overrides look like default refs.
    if (!error && Array.isArray(data) && data.length === count && data.length <= MAX_CURRENT_PROFILES) {
      const refs = new Map<string, string | null>();
      for (const row of data) {
        if (!row || row.user_id !== accountId || row.course_id !== courseId || typeof row.folder !== "string" || refs.has(row.folder)) {
          throw new Error("Invalid repository grading profile row");
        }
        const profile = validateProfile(accountId, { courseId, folder: row.folder }, row.repo_grade_profile_versions?.profile);
        if (row.configuration_fingerprint !== profile.configurationFingerprint) {
          throw new Error("Invalid repository grading profile version");
        }
        refs.set(row.folder, profile.sourceRef);
      }
      return refs;
    }
  } catch {
    // Missing coverage and invalid data both preclude default-source planning.
  }
  throw new Error("Repository grading profile storage is unavailable");
}

/** Recovery loads the historical version and receipt together in one snapshot. */
export async function readFrozenRepoGradeProfile(scope: CourseFolder, cohortId: string): Promise<FrozenProfile | null> {
  validateCohortId(cohortId);
  const result = await readProfile(scope, cohortId);
  if (result === null) return null;
  const receipt = restoreRepoGradeRubric(result.profile, result.receipt);
  if (!receipt) throw new Error("Invalid stored repository grading rubric receipt");
  return { profile: result.profile, receipt, cohortId: cohortId.toLowerCase() };
}

/** Restore an admitted attempt without generating or selecting a new cohort. */
export async function readRepoGradeAttemptProfile(scope: CourseFolder, generation: number): Promise<FrozenProfile | null> {
  const owner = await requireAppOwner();
  if (!Number.isSafeInteger(generation) || generation <= 0) {
    throw new Error("Invalid repository grading generation");
  }
  const result = await profileRpc("repo_grade_read_attempt_profile", {
    ...scopedArgs(owner.id, scope),
    p_generation: generation,
  });
  if (result === null) return null;
  if (typeof result === "object" && "cohortId" in result && validRepoGradeCohortId(result.cohortId)
    && "profile" in result && "receipt" in result) {
    const profile = validateProfile(owner.id, scope, result.profile);
    const receipt = restoreRepoGradeRubric(profile, result.receipt);
    if (receipt && "configurationFingerprint" in result && "rubricFingerprint" in result && "profileFingerprint" in result
      && result.configurationFingerprint === receipt.configurationFingerprint
      && result.rubricFingerprint === receipt.rubricFingerprint && result.profileFingerprint === receipt.profileFingerprint) {
      return { cohortId: result.cohortId.toLowerCase(), profile, receipt };
    }
  }
  throw new Error("Invalid stored repository grading attempt profile");
}

/** Freeze before dispatch and grade with the returned receipt. A competing
 * writer for the same cohort may have frozen a different generated rubric. */
export async function freezeRepoGradeRubric(
  profile: RepoGradeProfile, cohortId: string, generatedRubric?: string,
): Promise<FrozenProfile | null> {
  const owner = await requireAppOwner();
  validateCohortId(cohortId);
  const validated = validateProfile(owner.id, profile, profile);
  const candidate = resolveRepoGradeRubric(validated, generatedRubric);
  if (!candidate) throw new Error("Missing repository grading rubric");

  const result = await profileRpc("repo_grade_freeze_rubric", {
    ...scopedArgs(owner.id, validated),
    p_configuration_fingerprint: validated.configurationFingerprint,
    p_cohort_id: cohortId,
    p_receipt: candidate,
  });
  if (result === null) return null;
  const receipt = restoreRepoGradeRubric(validated, result);
  if (!receipt) throw new Error("Invalid stored repository grading rubric receipt");
  return { profile: validated, receipt, cohortId: cohortId.toLowerCase() };
}
