"use server";

import { repoGradeDurableStartupAvailable } from "@/lib/repo-grades-dashboard/admission-mode";
import { requireAppOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { isAutomaticRepoGradeId } from "@/lib/repo-grades-dashboard/automatic-store";
import { isRepoGradeProfileFolder } from "@/lib/repo-grades-dashboard/profile";
import { validateGithubOwnerRepo } from "@/lib/github-ref-name";

export type RepoGradeActiveCell = {
  courseId: string;
  repo: string;
  folder: string;
  runId: string;
  state: "queued" | "running" | "paused" | "waiting" | "settled";
};

async function readActiveCells(client: ReturnType<typeof createServiceClient>, accountId: string, courseId: string): Promise<RepoGradeActiveCell[]> {
  const timeout = AbortSignal.timeout(5_000);
  const { data: runs, count, error } = await client.from("repo_grade_automatic_runs")
    .select("id,phase,lease,lease_until,targeted_paused,repo_grade_automatic_courses!inner(course_id)", { count: "exact" })
    .eq("user_id", accountId).eq("repo_grade_automatic_courses.course_id", courseId)
    .or(`phase.in.(discovering,grading),and(phase.eq.stopped,lease_until.gt.${new Date().toISOString()})`)
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(10).retry(false).abortSignal(timeout);
  if (error || !runs || count !== runs.length) throw new Error("Active grading runs unavailable");
  if (runs.length === 0) return [];

  const cells = new Map<string, RepoGradeActiveCell>();
  const targetPages = await Promise.all(runs.map((run) => {
    let query = client.from("repo_grade_automatic_targets").select("repo,folder,state", { count: "exact" })
      .eq("course_id", courseId).eq("run_id", run.id);
    if (run.phase === "stopped") query = query.eq("state", "running");
    return query.order("id").limit(1000).retry(false).abortSignal(timeout);
  }));
  const now = Date.now();
  for (const [index, run] of runs.entries()) {
    const { data: targets, count: targetCount, error: targetError } = targetPages[index];
    if (targetError || !targets || targetCount !== targets.length) throw new Error("Active grading targets unavailable");
    const hasLease = Boolean(run.lease && run.lease_until && Date.parse(run.lease_until) > now);
    if (run.phase === "stopped" && !hasLease) continue;
    for (const target of targets) {
      let state: RepoGradeActiveCell["state"] = "settled";
      if (target.state === "running" || target.state === "queued") {
        if (target.state === "running" && hasLease) state = "running";
        else if (run.targeted_paused) state = "paused";
        else state = target.state === "queued" ? "queued" : "waiting";
      }
      const key = JSON.stringify([target.repo.toLowerCase(), target.folder]);
      const previous = cells.get(key);
      if (!previous || (state === "running" && previous.state !== "running")) {
        cells.set(key, { courseId, repo: target.repo, folder: target.folder, runId: run.id, state });
      }
    }
  }
  return [...cells.values()];
}

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

export async function readRepoGradeTargetRequestsAction(expectedAccountId: unknown, courseId?: unknown) {
  const owner = await requireAppOwner().catch(() => null);
  const accountId = owner && owner.id === expectedAccountId && repoGradeDurableStartupAvailable() ? owner.id : null;
  if (!accountId) return { status: "unavailable" } as const;
  try {
    const client = createServiceClient();
    const readCells = isAutomaticRepoGradeId(courseId);
    const [status, activeCells] = await Promise.all([
      client.rpc("repo_grade_target_request_status", { p_user_id: accountId }).retry(false).abortSignal(AbortSignal.timeout(10_000)),
      readCells ? readActiveCells(client, accountId, courseId).catch(() => null) : null,
    ]);
    const { data, error } = status;
    if (error || !Array.isArray(data) || data.length > 1100 || !data.every(isRequest)) return { status: "unavailable" } as const;
    if (!readCells) return { status: "loaded", requests: data } as const;
    return { status: "loaded", requests: data, activeCells: activeCells ?? [], activeCellsUnavailable: activeCells === null } as const;
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
