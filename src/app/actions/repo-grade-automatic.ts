"use server";

import { repoGradeDurableStartupAvailable } from "@/lib/repo-grades-dashboard/admission-mode";
import {
  automaticPreparationRetry, controlAutomaticRepoGrade, isAutomaticRepoGradeId, readAutomaticRecovery, readAutomaticRepoGrade,
} from "@/lib/repo-grades-dashboard/automatic-store";
import type { AutomaticRepoGradeStatus } from "@/lib/repo-grades-dashboard/automatic-status";
import { requireAppOwner } from "@/lib/supabase/auth";
import { retryRepoGradePreparationAction } from "./repo-grades-dashboard";

const unavailable = { status: "unavailable" } as const;

async function resolveAccount(expectedAccountId: unknown) {
  const owner = await requireAppOwner().catch(() => null);
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
  const accountId = await resolveAccount(expectedAccountId);
  return accountId ? readStatus(accountId) : unavailable;
}

/** Called once per opening. The database checks the saved preference and returns
 * the active run across reloads and concurrently opened tabs. */
export async function enqueueRepoGradeAutomaticRunAction(expectedAccountId: unknown): Promise<AutomaticRepoGradeStatus> {
  const accountId = await resolveAccount(expectedAccountId);
  if (!accountId) return unavailable;
  try {
    await controlAutomaticRepoGrade(accountId, { action: "enqueue" });
    return readStatus(accountId);
  } catch {
    return unavailable;
  }
}

export async function setRepoGradeAutomaticEnabledAction(expectedAccountId: unknown, enabled: unknown): Promise<AutomaticRepoGradeStatus> {
  const accountId = await resolveAccount(expectedAccountId);
  if (!accountId || typeof enabled !== "boolean") return unavailable;
  try {
    if (!await controlAutomaticRepoGrade(accountId, { action: "preference", enabled })) return unavailable;
    return readStatus(accountId);
  } catch {
    return unavailable;
  }
}

export async function stopRepoGradeAutomaticRunAction(expectedAccountId: unknown, runId: unknown): Promise<AutomaticRepoGradeStatus> {
  const accountId = await resolveAccount(expectedAccountId);
  if (!accountId || !isAutomaticRepoGradeId(runId)) return unavailable;
  try {
    await controlAutomaticRepoGrade(accountId, { action: "stop", runId });
    return readStatus(accountId);
  } catch {
    return unavailable;
  }
}

function validTargetId(targetId: unknown): targetId is number {
  return typeof targetId === "number" && Number.isSafeInteger(targetId) && targetId > 0;
}

export async function readRepoGradeAutomaticRecoveryAction(expectedAccountId: unknown, targetId: unknown) {
  const accountId = await resolveAccount(expectedAccountId);
  if (!accountId || !validTargetId(targetId)) return null;
  return readAutomaticRecovery(accountId, targetId).catch(() => null);
}

export async function retryRepoGradeAutomaticPreparationAction(expectedAccountId: unknown, targetId: unknown) {
  const accountId = await resolveAccount(expectedAccountId);
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
