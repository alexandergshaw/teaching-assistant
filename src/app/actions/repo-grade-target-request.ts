"use server";

import { repoGradeDurableStartupAvailable } from "@/lib/repo-grades-dashboard/admission-mode";
import { requireAppOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { isAutomaticRepoGradeId } from "@/lib/repo-grades-dashboard/automatic-store";
import { isRepoGradeProfileFolder } from "@/lib/repo-grades-dashboard/profile";
import { validateGithubOwnerRepo } from "@/lib/github-ref-name";

function isRequest(value: unknown): value is { id: number; courseId: string; folder: string; repo: string | null; bulk: boolean; folders: string[] | null; repos: string[] | null; pairs: { folder: string; repo: string }[] | null; state: "queued" | "paused" | "running" | "paused-running" | "complete" | "incomplete" | "stopped"; runId: string | null; inFlight: boolean; reason: string | null; counts: Record<string, number> } {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "number" || !Number.isSafeInteger(row.id) || row.id < 1
    || !isAutomaticRepoGradeId(row.courseId) || !isRepoGradeProfileFolder(row.folder)
    || (row.runId !== null && !isAutomaticRepoGradeId(row.runId)) || typeof row.inFlight !== "boolean" || typeof row.bulk !== "boolean"
    || !["queued", "paused", "running", "paused-running", "complete", "incomplete", "stopped"].includes(String(row.state))
    || !(row.reason === null || (typeof row.reason === "string" && /^[a-z0-9-]{1,80}$/.test(row.reason)))
    || !row.counts || typeof row.counts !== "object" || Array.isArray(row.counts)
    || Object.entries(row.counts).some(([key, count]) => !/^[a-z0-9-]{1,80}$/.test(key)
      || typeof count !== "number" || !Number.isSafeInteger(count) || count < 0 || count > 1000)) return false;
  if (!(row.folders === null || (Array.isArray(row.folders) && row.folders.length > 0 && row.folders.length <= 1000
    && row.folders.every(isRepoGradeProfileFolder)))) return false;
  if (!(row.repos === null || (Array.isArray(row.repos) && row.repos.length > 0 && row.repos.length <= 1000
    && row.repos.every((repo: unknown) => {
      if (typeof repo !== "string") return false;
      const [owner, name, extra] = repo.split("/");
      return !!owner && !!name && extra === undefined && validateGithubOwnerRepo(owner, name);
    })))) return false;
  if (!(row.pairs === null || (Array.isArray(row.pairs) && row.pairs.length > 0 && row.pairs.length <= 1000
    && row.pairs.every((pair: unknown) => {
      if (!pair || typeof pair !== "object") return false;
      const entry = pair as Record<string, unknown>;
      if (!isRepoGradeProfileFolder(entry.folder) || typeof entry.repo !== "string") return false;
      const [owner, name, extra] = entry.repo.split("/");
      return !!owner && !!name && extra === undefined && validateGithubOwnerRepo(owner, name);
    })))) return false;
  if (row.repo === null) return true;
  if (typeof row.repo !== "string") return false;
  const [owner, name, extra] = row.repo.split("/");
  return !!owner && !!name && extra === undefined && validateGithubOwnerRepo(owner, name);
}

export async function readRepoGradeTargetRequestsAction(expectedAccountId: unknown) {
  const owner = await requireAppOwner().catch(() => null);
  const accountId = owner && owner.id === expectedAccountId && repoGradeDurableStartupAvailable() ? owner.id : null;
  if (!accountId) return { status: "unavailable" } as const;
  try {
    const { data, error } = await createServiceClient().rpc("repo_grade_target_request_status", { p_user_id: accountId }).retry(false).abortSignal(AbortSignal.timeout(10_000));
    if (error || !Array.isArray(data) || data.length > 1100 || !data.every(isRequest)) return { status: "unavailable" } as const;
    return { status: "loaded", requests: data } as const;
  } catch {
    return { status: "unavailable" } as const;
  }
}

export async function controlRepoGradeTargetRequestAction(expectedAccountId: unknown, id: unknown, action: unknown) {
  const owner = await requireAppOwner().catch(() => null);
  const accountId = owner && owner.id === expectedAccountId && repoGradeDurableStartupAvailable() ? owner.id : null;
  if (!accountId || typeof id !== "number" || !Number.isSafeInteger(id) || id < 1
    || (action !== "pause" && action !== "resume" && action !== "stop")) return { status: "unavailable" } as const;
  try {
    const { data, error } = await createServiceClient().rpc("repo_grade_target_request_control", {
      p_user_id: accountId, p_id: id, p_action: action,
    }).retry(false).abortSignal(AbortSignal.timeout(10_000));
    return error ? { status: "unavailable" } as const : { status: "loaded", changed: data === true } as const;
  } catch {
    return { status: "unavailable" } as const;
  }
}
