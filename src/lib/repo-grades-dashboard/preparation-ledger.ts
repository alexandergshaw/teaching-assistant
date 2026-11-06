import "server-only";

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { CourseKind } from "@/lib/course-kind";
import { createServiceClient } from "@/lib/supabase/server";
import type { RepoGradeCourseConfig } from "@/lib/supabase/types.repo-grades-dashboard";
import type { RepoGradePreparationCapture } from "./preparation-input";
import { restoreRepoGradeRubric, type RepoGradeProfile, type RepoGradeRubricReceipt } from "./profile";
import { readFrozenRepoGradeProfile } from "./profile-store";
import { validRepoGradeCohortId } from "./state";

type Evidence = Extract<RepoGradePreparationCapture, { status: "ready" }>;
export type RepoGradeCourseKindBasis = readonly [name: string | null, kind: string | null];
type Claim = { accountId: string; cohortId: string; token: string; key: string };
type Finish = { outcome: "succeeded"; receipt: RepoGradeRubricReceipt }
  | { outcome: "failed-before-dispatch" | "failed" | "unknown" };
type Ready = { status: "ready"; cohortId: string; receipt: RepoGradeRubricReceipt };
type ClaimDenied = "busy" | "capacity" | "configuration-changed" | "forbidden"
  | "profile-unavailable" | "retry-unavailable" | "unknown";
export type RepoGradePreparationRetry = Readonly<{ key: string; generation: string }>;
type RetryRequired = { status: "explicit-retry-required"; preparationRetry: RepoGradePreparationRetry };

export function isPreparationDigest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

type LeaseArgs = { p_user_id: string; p_id: string; p_token: string };
type RpcArgs = {
  repo_grade_bootstrap_preparation: {
    p_user_id: string;
    p_course_id: string;
    p_folder: string;
    p_course_config: RepoGradeCourseConfig;
    p_course_kind_basis: RepoGradeCourseKindBasis;
    p_course_kind: CourseKind;
    p_prompt_parser_version: string;
    p_expected_fingerprint: string | null;
    p_profile: RepoGradeProfile;
  };
  repo_grade_claim_preparation: {
    p_user_id: string;
    p_course_id: string;
    p_folder: string;
    p_course_config: RepoGradeCourseConfig;
    p_fingerprint: string;
    p_key: string;
    p_instructions: string;
    p_targets: Evidence["evidence"];
    p_retry_generation?: string;
  };
  repo_grade_begin_preparation: LeaseArgs;
  repo_grade_finish_preparation: LeaseArgs & {
    p_key: string;
    p_outcome: Finish["outcome"];
    p_receipt: RepoGradeRubricReceipt | null;
  };
};

async function preparationRpc<Name extends keyof RpcArgs>(name: Name, args: RpcArgs[Name]): Promise<unknown> {
  const { data, error } = await createServiceClient().rpc(name, args).retry(false);
  if (error) throw new Error("Repository rubric preparation storage is unavailable");
  return data;
}

/** The gated caller establishes complete evidence before provisioning. SQL
 * rechecks the owned course and uses compare-and-set for the current profile. */
export async function bootstrapRepoGradePreparation(
  profile: RepoGradeProfile, courseConfig: RepoGradeCourseConfig, courseKindBasis: RepoGradeCourseKindBasis,
  courseKind: CourseKind, promptParserVersion: string, expectedFingerprint: string | null,
): Promise<boolean> {
  const result = await preparationRpc("repo_grade_bootstrap_preparation", {
    p_user_id: profile.accountId, p_course_id: profile.courseId, p_folder: profile.folder,
    p_course_config: courseConfig, p_course_kind_basis: courseKindBasis, p_course_kind: courseKind,
    p_prompt_parser_version: promptParserVersion, p_expected_fingerprint: expectedFingerprint, p_profile: profile,
  });
  if (typeof result !== "boolean") throw new Error("Invalid repository rubric preparation setup response");
  return result;
}

function responseRecord(data: unknown): Record<string, unknown> | undefined {
  return data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : undefined;
}

export async function claimRepoGradePreparation(
  profile: RepoGradeProfile, courseConfig: RepoGradeCourseConfig, evidence: Evidence,
  retry?: RepoGradePreparationRetry,
): Promise<Ready | { status: "claimed"; claim: Claim } | { status: ClaimDenied } | RetryRequired> {
  const { accountId, courseId, folder, configurationFingerprint } = profile;
  const result = responseRecord(await preparationRpc("repo_grade_claim_preparation", {
    p_user_id: accountId, p_course_id: courseId, p_folder: folder, p_course_config: courseConfig,
    p_fingerprint: configurationFingerprint, p_key: evidence.key, p_instructions: evidence.instructions,
    p_targets: evidence.evidence, ...(retry && { p_retry_generation: retry.generation }),
  }));
  switch (result?.status) {
    case "claimed":
      if (validRepoGradeCohortId(result.cohortId) && validRepoGradeCohortId(result.token)) {
        return { status: "claimed", claim: { accountId, cohortId: result.cohortId, token: result.token, key: evidence.key } };
      }
      break;
    case "ready":
      if (validRepoGradeCohortId(result.cohortId)) {
        const receipt = restoreRepoGradeRubric(profile, result.receipt);
        if (receipt) return { status: "ready", cohortId: result.cohortId, receipt };
      }
      break;
    case "explicit-retry-required":
      if (isPreparationDigest(result.retryGeneration)) {
        return { status: result.status, preparationRetry: { key: evidence.key, generation: result.retryGeneration } };
      }
      break;
    case "busy":
    case "capacity":
    case "configuration-changed":
    case "forbidden":
    case "retry-unavailable":
    case "unknown":
      return { status: result.status };
    case "disabled":
    case "invalid-evidence":
      return { status: "profile-unavailable" };
  }
  return { status: "unknown" };
}

export async function beginRepoGradePreparation(claim: Claim): Promise<number | null> {
  const result = await preparationRpc("repo_grade_begin_preparation", {
    p_user_id: claim.accountId, p_id: claim.cohortId, p_token: claim.token,
  });
  if (result === null) return null;
  if (typeof result !== "number" || !Number.isSafeInteger(result) || result <= 0 || result > 15 * 60_000) {
    throw new Error("Invalid repository rubric preparation dispatch response");
  }
  return result;
}

export async function finishRepoGradePreparation(
  profile: RepoGradeProfile, claim: Claim, finish: Finish,
): Promise<Ready | { status: "unknown" | "configuration-changed" }
  | { status: "failed"; preparationRetry: RepoGradePreparationRetry }> {
  try {
    const result = responseRecord(await preparationRpc("repo_grade_finish_preparation", {
      p_user_id: claim.accountId, p_id: claim.cohortId, p_token: claim.token, p_key: claim.key,
      p_outcome: finish.outcome, p_receipt: finish.outcome === "succeeded" ? finish.receipt : null,
    }));
    if (result?.status === "configuration-changed" || result?.status === "unknown") return { status: result.status };
    if ((finish.outcome === "failed" || finish.outcome === "failed-before-dispatch") && result?.status === "failed") {
      return { status: "failed", preparationRetry: {
        key: claim.key, generation: createHash("sha256").update(claim.token.toLowerCase()).digest("hex"),
      } };
    }
    if (finish.outcome === "succeeded" && result?.status === "succeeded") {
      const receipt = restoreRepoGradeRubric(profile, result.receipt);
      if (receipt && isDeepStrictEqual(receipt, finish.receipt)) return { status: "ready", cohortId: claim.cohortId, receipt };
    }
  } catch {
    // A lost finish response can follow a committed receipt. Only read back
    // the exact candidate under this cohort. Never claim or dispatch again.
  }
  if (finish.outcome === "succeeded") {
    try {
      const frozen = await readFrozenRepoGradeProfile(profile, claim.cohortId);
      if (frozen?.cohortId === claim.cohortId && isDeepStrictEqual(frozen.receipt, finish.receipt)) {
        return { status: "ready", cohortId: frozen.cohortId, receipt: frozen.receipt };
      }
    } catch {
      // A missing or unavailable read leaves settlement unconfirmed.
    }
  }
  return { status: "unknown" };
}
