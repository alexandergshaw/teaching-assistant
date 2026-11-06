"use server";

import { repoGradeDurableStartupAvailable } from "@/lib/repo-grades-dashboard/admission-mode";
import {
  automaticPreparationRetry, controlAutomaticRepoGrade, isAutomaticRepoGradeId, readAutomaticRecovery,
  readAutomaticRepoGrade, saveAutomaticRepoGradeSchedule,
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

export async function startRepoGradeAutomaticRunAction(expectedAccountId: unknown): Promise<AutomaticRepoGradeStatus> {
  const accountId = await resolveAccount(expectedAccountId);
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
  expectedAccountId: unknown, time: unknown, zone: unknown,
): Promise<AutomaticRepoGradeStatus> {
  const accountId = await resolveAccount(expectedAccountId);
  if (!accountId) return unavailable;
  if (!(time === null && zone === null) && (typeof time !== "string" || !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)
    || typeof zone !== "string" || !/^[A-Za-z_+0-9/-]{1,100}$/.test(zone))) return unavailable;
  try {
    if (typeof zone === "string") new Intl.DateTimeFormat("en", { timeZone: zone });
    if (!await saveAutomaticRepoGradeSchedule(accountId, time as string | null, zone as string | null)) return unavailable;
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
