import "server-only";

import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { getRepoGraderIdentity } from "./grader-identity";
import { captureRepoGradePreparationPolicy, type RepoGradeCourseKindBasis } from "./preparation-generator";
import type { RepoGradeProfile } from "./profile";

type Scope = Pick<RepoGradeProfile, "accountId" | "courseId" | "folder">;

export async function reviewRepoGradePreparationPolicy(scope: Scope, expectedPreview?: string) {
  const args = { p_user_id: scope.accountId, p_course_id: scope.courseId, p_folder: scope.folder };
  const client = createServiceClient();
  const { data, error } = await client.rpc("repo_grade_preparation_policy_snapshot", args).retry(false);
  if (error) return { status: "storage-unavailable" } as const;
  if (data === null) return { status: expectedPreview ? "conflict" : "not-configured" } as const;

  const snapshot = parsePolicySnapshot(data);
  if (!snapshot) return { status: "storage-unavailable" } as const;
  const active = getRepoGraderIdentity("gemini");
  if (snapshot.model !== active.model || snapshot.graderVersion !== active.graderVersion) {
    return { status: "grader-changed" } as const;
  }
  const candidate = captureRepoGradePreparationPolicy(active.model, snapshot.basis);
  if (candidate.status !== "ready") return { status: candidate.status } as const;

  const courseKind = candidate.generator.courseKind;
  const version = candidate.version;
  const preview = createHash("sha256").update(JSON.stringify([
    scope.accountId, scope.courseId, scope.folder, snapshot.revision, snapshot.profileFingerprint, version, courseKind,
  ])).digest("hex");
  if (expectedPreview !== undefined && expectedPreview !== preview) return { status: "conflict" } as const;
  if (snapshot.basisMatches && snapshot.version === version && snapshot.courseKind === courseKind) {
    return { status: "current" } as const;
  }
  if (expectedPreview === undefined) return {
    status: "preview", preview,
    current: { version: snapshot.version, courseKind: snapshot.courseKind },
    replacement: { version, courseKind },
  } as const;

  const result = await client.rpc("repo_grade_update_preparation_policy", {
    ...args, p_expected_revision: snapshot.revision, p_expected_fingerprint: snapshot.profileFingerprint,
    p_course_kind: courseKind, p_prompt_parser_version: version,
  }).retry(false);
  if (!result.error && (result.data === "updated" || result.data === "current" || result.data === "conflict" || result.data === "busy")) {
    return { status: result.data } as const;
  }
  return { status: "storage-unavailable" } as const;
}

function parsePolicySnapshot(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const { revision, version, courseKind, basis, basisMatches, profileFingerprint, model, graderVersion } = value as Record<string, unknown>;
  if (typeof revision !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(revision)
    || typeof version !== "string" || version.length === 0 || version.length > 256
    || (courseKind !== "coding" && courseKind !== "applied") || typeof basisMatches !== "boolean"
    || !Array.isArray(basis) || basis.length !== 2 || !basis.every((part) => part === null || typeof part === "string")
    || typeof profileFingerprint !== "string" || !/^[0-9a-f]{64}$/.test(profileFingerprint)
    || typeof model !== "string" || typeof graderVersion !== "string") return null;
  const courseKindBasis: RepoGradeCourseKindBasis = [basis[0], basis[1]];
  return { revision, version, courseKind, basis: courseKindBasis, basisMatches, profileFingerprint, model, graderVersion } as const;
}
