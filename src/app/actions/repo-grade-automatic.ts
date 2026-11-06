"use server";

import { repoGradeDurableStartupAvailable } from "@/lib/repo-grades-dashboard/admission-mode";
import {
  automaticPreparationRetry, controlAutomaticRepoGrade, isAutomaticRepoGradeId, readAutomaticRecovery,
  readAutomaticRepoGrade, saveAutomaticRepoGradeSchedule,
  saveAutomaticRepoGradeGithubRetry,
} from "@/lib/repo-grades-dashboard/automatic-store";
import type { AutomaticRepoGradeStatus } from "@/lib/repo-grades-dashboard/automatic-status";
import { parseAutomaticRepoGradeSchedule } from "@/lib/repo-grades-dashboard/automatic-schedule";
import { requireAppOwner } from "@/lib/supabase/auth";
import { retryRepoGradePreparationAction } from "./repo-grades-dashboard";

const unavailable = { status: "unavailable" } as const;

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
