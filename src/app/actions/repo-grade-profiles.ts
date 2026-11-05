"use server";

import { validateGithubOwnerRepo } from "@/lib/github-ref-name";
import { getRepoGraderIdentity } from "@/lib/repo-grades-dashboard/grader-identity";
import { captureRepoGradeProfile, type RepoGradeProfile } from "@/lib/repo-grades-dashboard/profile";
import { readCurrentRepoGradeProfile, saveRepoGradeProfile } from "@/lib/repo-grades-dashboard/profile-store";
import { requireAppOwner } from "@/lib/supabase/auth";
import { table } from "@/lib/supabase/courses.row";

type CourseFolder = Pick<RepoGradeProfile, "courseId" | "folder">;

function parseScope(courseId: unknown, folder: unknown): CourseFolder | null {
  if (typeof courseId !== "string" || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(courseId)
    || typeof folder !== "string" || folder.length > 1024 || [...folder].length > 512
    || !folder.isWellFormed() || /[\\\u0000-\u001f\u007f]/.test(folder)
    || !folder.split("/").every((segment) => segment.trim() !== "" && segment !== "." && segment !== "..")) {
    return null;
  }
  return { courseId: courseId.toLowerCase(), folder };
}

async function courseSetupStatus(accountId: string, courseId: string) {
  const { data, error }: { data: { github_org: string | null } | null; error: unknown } = await table()
    .select("github_org").eq("user_id", accountId).eq("id", courseId).maybeSingle();
  if (error) return "storage-unavailable";
  if (!data) return "course-unavailable";
  const organization = data.github_org?.trim();
  return organization && validateGithubOwnerRepo(organization, "repo") ? "ready" : "organization-unavailable";
}

function profileView({ accountId: _accountId, ...profile }: RepoGradeProfile) {
  void _accountId;
  return profile;
}

export async function readRepoGradeProfileAction(courseId: unknown, folder: unknown) {
  const owner = await requireAppOwner();
  const scope = parseScope(courseId, folder);
  if (!scope) return { status: "invalid-scope" } as const;

  try {
    const status = await courseSetupStatus(owner.id, scope.courseId);
    if (status !== "ready") return { status } as const;
    const profile = await readCurrentRepoGradeProfile(scope);
    return profile ? { status: "loaded", profile: profileView(profile) } as const : { status: "not-configured" } as const;
  } catch {
    return { status: "storage-unavailable" } as const;
  }
}

export async function saveRepoGradeProfileAction(
  courseId: unknown,
  folder: unknown,
  settings: unknown,
  expectedConfigurationFingerprint: unknown,
  provider: unknown = "gemini",
) {
  const owner = await requireAppOwner();
  const scope = parseScope(courseId, folder);
  if (!scope) return { status: "invalid-scope" } as const;
  if (expectedConfigurationFingerprint !== null && (typeof expectedConfigurationFingerprint !== "string"
    || !/^[0-9a-f]{64}$/.test(expectedConfigurationFingerprint))) {
    return { status: "invalid-fingerprint" } as const;
  }
  if (provider !== "gemini" && provider !== "embedded") return { status: "invalid-provider" } as const;

  try {
    const status = await courseSetupStatus(owner.id, scope.courseId);
    if (status !== "ready") return { status } as const;
    const grader = getRepoGraderIdentity(provider);
    const captured = captureRepoGradeProfile({ accountId: owner.id, ...scope }, settings, grader);
    if (captured.status === "blocked") return { status: captured.reason } as const;
    const { sourceRef, targetBranch, instructions, rubric, useReadmeInstructions, applyNamingDeduction, runCode } = captured.profile;
    // Discovery pins the commit later. GitHub's ref endpoint also accepts a
    // raw SHA, so reject one in the saved source override.
    if (sourceRef && /^[0-9a-f]{40}$/i.test(sourceRef)) return { status: "invalid-settings" } as const;

    const profile = await saveRepoGradeProfile(scope, {
      sourceRef, targetBranch, instructions, rubric, useReadmeInstructions, applyNamingDeduction, runCode,
    }, grader, expectedConfigurationFingerprint);
    return profile ? { status: "saved", profile: profileView(profile) } as const : { status: "conflict" } as const;
  } catch {
    return { status: "storage-unavailable" } as const;
  }
}
