"use server";

import { repoGradeDurableStartupAvailable } from "@/lib/repo-grades-dashboard/admission-mode";
import {
  automaticPreparationRetry, controlAutomaticRepoGrade, isAutomaticRepoGradeId, readAutomaticRecovery,
  readAutomaticRepoGrade, saveAutomaticRepoGradeSchedule,
  saveAutomaticRepoGradeClassQueue, saveAutomaticRepoGradeGithubRetry, startTargetedAutomaticRepoGrade, enqueueBulkAutomaticRepoGrade, enqueueCellsAutomaticRepoGrade, enqueueChangedRepoGrade,
} from "@/lib/repo-grades-dashboard/automatic-store";
import type { AutomaticRepoGradeStatus } from "@/lib/repo-grades-dashboard/automatic-status";
import { parseAutomaticRepoGradeSchedule } from "@/lib/repo-grades-dashboard/automatic-schedule";
import { requireAppOwner } from "@/lib/supabase/auth";
import { retryRepoGradePreparationAction } from "./repo-grades-dashboard";
import { isRepoGradeProfileFolder } from "@/lib/repo-grades-dashboard/profile";
import { validateGithubOwnerRepo } from "@/lib/github-ref-name";

const unavailable = { status: "unavailable" } as const;

/** Queue a newly scanned revision only when the server's durable history has an earlier empty check. */
export async function enqueueChangedRepoGradeAction(expectedAccountId: unknown, courseId: unknown, input: unknown, explicit = false) {
  const accountId = resolveAccount(expectedAccountId, await requireAppOwner().catch(() => null));
  if (!accountId || !isAutomaticRepoGradeId(courseId) || !input || typeof input !== "object" || typeof explicit !== "boolean") return unavailable;
  const target = input as Record<string, unknown>;
  if (!isRepoGradeProfileFolder(target.folder) || typeof target.repo !== "string" || target.repo.length > 200
    || typeof target.ref !== "string" || !target.ref.trim() || target.ref.length > 255
    || typeof target.sha !== "string" || !/^[0-9a-f]{40}$/.test(target.sha)) return unavailable;
  const [owner, name, extra] = target.repo.split("/");
  if (!owner || !name || extra !== undefined || !validateGithubOwnerRepo(owner, name)) return unavailable;
  try {
    const result = await enqueueChangedRepoGrade(accountId, courseId,
      { repo: target.repo, folder: target.folder, ref: target.ref, sha: target.sha }, explicit);
    return { status: result === "queued" ? "started" : result === "already-queued" ? "already-queued" : "unavailable" } as const;
  } catch { return unavailable; }
}

function resolveAccount(expectedAccountId: unknown, owner: Awaited<ReturnType<typeof requireAppOwner>> | null) {
  return owner && owner.id === expectedAccountId && repoGradeDurableStartupAvailable() ? owner.id : undefined;
}

async function readStatus(accountId: string): Promise<AutomaticRepoGradeStatus> {
  try {
    return { status: "loaded", ...await readAutomaticRepoGrade(accountId) };
  } catch {
    return unavailable;
  }
}

export async function readRepoGradeAutomaticStatusAction(expectedAccountId: unknown): Promise<AutomaticRepoGradeStatus> {
  const accountId = resolveAccount(expectedAccountId, await requireAppOwner().catch(() => null));
  return accountId ? readStatus(accountId) : unavailable;
}

/** Called once per opening. The database checks the saved preference and returns
 * the active run across reloads and concurrently opened tabs. */
export async function enqueueRepoGradeAutomaticRunAction(expectedAccountId: unknown): Promise<AutomaticRepoGradeStatus> {
  const accountId = resolveAccount(expectedAccountId, await requireAppOwner().catch(() => null));
  if (!accountId) return unavailable;
  try {
    await controlAutomaticRepoGrade(accountId, { action: "enqueue" });
    return readStatus(accountId);
  } catch {
    return unavailable;
  }
}

export async function startRepoGradeAutomaticRunAction(expectedAccountId: unknown): Promise<AutomaticRepoGradeStatus> {
  const accountId = resolveAccount(expectedAccountId, await requireAppOwner().catch(() => null));
  if (!accountId) return unavailable;
  try {
    const changed = await controlAutomaticRepoGrade(accountId, { action: "start" });
    const status = await readStatus(accountId);
    return status.status === "loaded" ? { ...status, control: { action: "start", changed } } : status;
  } catch {
    return unavailable;
  }
}

/** The selectors only narrow a server-discovered course inventory. */
export async function startRepoGradeTargetedRunAction(
  expectedAccountId: unknown, courseId: unknown, folder: unknown, repo: unknown,
): Promise<{ status: "started" | "busy" | "unavailable" }> {
  const accountId = resolveAccount(expectedAccountId, await requireAppOwner().catch(() => null));
  if (!accountId || !isAutomaticRepoGradeId(courseId) || !isRepoGradeProfileFolder(folder)
    || folder.length > 512 || !(repo === null || typeof repo === "string")) return unavailable;
  if (typeof repo === "string") {
    const [owner, name, extra] = repo.split("/");
    if (!owner || !name || extra !== undefined || repo.length > 200 || !validateGithubOwnerRepo(owner, name)) return unavailable;
  }
  try {
    const result = await startTargetedAutomaticRepoGrade(accountId, courseId, folder, repo);
    return { status: result === "queued" ? "started" : result === "already-queued" ? "busy" : "unavailable" };
  } catch {
    return unavailable;
  }
}

/** Bulk selectors only narrow the server-discovered inventory. */
export async function startRepoGradeBulkRunAction(
  expectedAccountId: unknown, courseId: unknown, folders: unknown, repos: unknown,
): Promise<{ status: "started" | "busy" | "unavailable" }> {
  const accountId = resolveAccount(expectedAccountId, await requireAppOwner().catch(() => null));
  if (!accountId || !isAutomaticRepoGradeId(courseId)
    || !(folders === null || (Array.isArray(folders) && folders.length > 0 && folders.length <= 1000
      && Array.from(folders).every((folder) => isRepoGradeProfileFolder(folder) && folder.length <= 512)))
    || !(repos === null || (Array.isArray(repos) && repos.length > 0 && repos.length <= 1000
      && Array.from(repos).every((repo) => {
        if (typeof repo !== "string" || repo.length > 200) return false;
        const [owner, name, extra] = repo.split("/");
        return !!owner && !!name && extra === undefined && validateGithubOwnerRepo(owner, name);
      })))) return unavailable;
  try {
    const result = await enqueueBulkAutomaticRepoGrade(accountId, courseId, folders as string[] | null, repos as string[] | null);
    return { status: result === "queued" ? "started" : result === "already-queued" ? "busy" : "unavailable" };
  } catch {
    return unavailable;
  }
}

/** Exact cells are evaluated only after matching the server-discovered inventory. */
export async function startRepoGradeCellsRunAction(expectedAccountId: unknown, courseId: unknown, cells: unknown)
  : Promise<{ status: "started" | "busy" | "unavailable" | "too-many" }> {
  const accountId = resolveAccount(expectedAccountId, await requireAppOwner().catch(() => null));
  if (!accountId || !isAutomaticRepoGradeId(courseId) || !Array.isArray(cells) || cells.length === 0) return unavailable;
  if (cells.length > 1000) return { status: "too-many" };
  const pairs: { folder: string; repo: string }[] = [];
  for (const cell of cells) {
    if (!cell || typeof cell !== "object" || !isRepoGradeProfileFolder(cell.folder) || cell.folder.length > 512
      || typeof cell.repo !== "string" || cell.repo.length > 200) return unavailable;
    const [owner, name, extra] = cell.repo.split("/");
    if (!owner || !name || extra !== undefined || !validateGithubOwnerRepo(owner, name)) return unavailable;
    pairs.push({ folder: cell.folder, repo: cell.repo });
  }
  try {
    const result = await enqueueCellsAutomaticRepoGrade(accountId, courseId, pairs);
    return { status: result === "queued" ? "started" : result === "already-queued" ? "busy" : "unavailable" };
  } catch {
    return unavailable;
  }
}

export async function setRepoGradeAutomaticScheduleAction(
  expectedAccountId: unknown, value: unknown,
): Promise<AutomaticRepoGradeStatus> {
  const accountId = resolveAccount(expectedAccountId, await requireAppOwner().catch(() => null));
  if (!accountId) return unavailable;
  const schedule = parseAutomaticRepoGradeSchedule(value);
  if (value !== null && !schedule) return unavailable;
  try {
    if (!await saveAutomaticRepoGradeSchedule(accountId, schedule)) return unavailable;
    return readStatus(accountId);
  } catch {
    return unavailable;
  }
}

export async function setRepoGradeAutomaticClassQueueAction(
  expectedAccountId: unknown, courseIds: unknown,
): Promise<AutomaticRepoGradeStatus> {
  const accountId = resolveAccount(expectedAccountId, await requireAppOwner().catch(() => null));
  if (!accountId || (courseIds !== null && (!Array.isArray(courseIds) || courseIds.length > 1_000
    || !Array.from(courseIds).every(isAutomaticRepoGradeId) || new Set(courseIds).size !== courseIds.length))) {
    return unavailable;
  }
  try {
    if (!await saveAutomaticRepoGradeClassQueue(accountId, courseIds)) return unavailable;
    return readStatus(accountId);
  } catch {
    return unavailable;
  }
}

export async function setRepoGradeAutomaticEnabledAction(expectedAccountId: unknown, enabled: unknown): Promise<AutomaticRepoGradeStatus> {
  const accountId = resolveAccount(expectedAccountId, await requireAppOwner().catch(() => null));
  if (!accountId || typeof enabled !== "boolean") return unavailable;
  try {
    if (!await controlAutomaticRepoGrade(accountId, { action: "preference", enabled })) return unavailable;
    return readStatus(accountId);
  } catch {
    return unavailable;
  }
}

export async function setRepoGradeAutomaticGithubRetryAction(expectedAccountId: unknown, enabled: unknown): Promise<AutomaticRepoGradeStatus> {
  const accountId = resolveAccount(expectedAccountId, await requireAppOwner().catch(() => null));
  if (!accountId || typeof enabled !== "boolean") return unavailable;
  try {
    if (!await saveAutomaticRepoGradeGithubRetry(accountId, enabled)) return unavailable;
    return readStatus(accountId);
  } catch {
    return unavailable;
  }
}

export async function stopRepoGradeAutomaticRunAction(expectedAccountId: unknown, runId: unknown): Promise<AutomaticRepoGradeStatus> {
  const accountId = resolveAccount(expectedAccountId, await requireAppOwner().catch(() => null));
  if (!accountId || !isAutomaticRepoGradeId(runId)) return unavailable;
  try {
    const changed = await controlAutomaticRepoGrade(accountId, { action: "stop", runId });
    const status = await readStatus(accountId);
    return status.status === "loaded" ? { ...status, control: { action: "stop", changed } } : status;
  } catch {
    return unavailable;
  }
}

function validTargetId(targetId: unknown): targetId is number {
  return typeof targetId === "number" && Number.isSafeInteger(targetId) && targetId > 0;
}

export async function readRepoGradeAutomaticRecoveryAction(expectedAccountId: unknown, targetId: unknown) {
  const accountId = resolveAccount(expectedAccountId, await requireAppOwner().catch(() => null));
  if (!accountId || !validTargetId(targetId)) return null;
  return readAutomaticRecovery(accountId, targetId).catch(() => null);
}

export async function retryRepoGradeAutomaticPreparationAction(expectedAccountId: unknown, targetId: unknown) {
  const accountId = resolveAccount(expectedAccountId, await requireAppOwner().catch(() => null));
  if (!accountId || !validTargetId(targetId)) return unavailable;
  try {
    const selector = await automaticPreparationRetry(accountId, targetId);
    if (!selector) return unavailable;
    const { courseId, folder, key, generation } = selector;
    const result = await retryRepoGradePreparationAction(accountId, courseId, folder, key, generation);
    if (result.status === "ready" || result.preparationRetry) {
      await automaticPreparationRetry(accountId, targetId, {
        expectedGeneration: generation, replacement: result.preparationRetry ?? null,
      });
    }
    return { status: result.status };
  } catch {
    return unavailable;
  }
}
