"use client";

import { useEffect, useRef, useState } from "react";
import {
  enqueueRepoGradeAutomaticRunAction, readRepoGradeAutomaticRecoveryAction, readRepoGradeAutomaticStatusAction,
  retryRepoGradeAutomaticPreparationAction, setRepoGradeAutomaticEnabledAction, setRepoGradeAutomaticGithubRetryAction,
  setRepoGradeAutomaticScheduleAction,
  startRepoGradeAutomaticRunAction, stopRepoGradeAutomaticRunAction,
} from "@/app/actions/repo-grade-automatic";
import type { AutomaticRepoGradeRun, AutomaticRepoGradeStatus } from "@/lib/repo-grades-dashboard/automatic-status";
import type { AutomaticRepoGradeScheduleDraft } from "@/lib/repo-grades-dashboard/automatic-schedule";
import { recordRepoGradesStartup } from "./startup-diagnostics";

const POLL_MS = 5_000;
const unavailable = { status: "unavailable" } as const;

function recordControl(
  operation: "background_preference" | "background_schedule" | "background_retry" | "background_recovery" | "background_start"
    | "background_stop" | "background_github_retry",
  outcome: "success" | "failed" | "unavailable" | "unchanged",
  startedAt: number,
) {
  try {
    recordRepoGradesStartup(operation, outcome, startedAt);
  } catch {
    // A local diagnostics failure must not affect an authorized operation.
  }
}

export function automaticRepoGradeRunActive(run: AutomaticRepoGradeRun | null | undefined) {
  return run?.phase === "discovering" || run?.phase === "grading";
}

export function useRepoGradesAutomatic(accountId: string | null) {
  const [current, setCurrent] = useState<{ accountId: string; status: AutomaticRepoGradeStatus }>();
  const [pendingAccount, setPendingAccount] = useState<string>();
  const [control, setControl] = useState<{ accountId: string; action: "start" | "stop"; changed: boolean }>();
  const controller = useRef<{ update: (request: () => Promise<AutomaticRepoGradeStatus>) => Promise<AutomaticRepoGradeStatus | undefined> }>(null);

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    let revision = 0;
    let lastDiagnostic = "";
    let timer: ReturnType<typeof setTimeout> | undefined;

    const update = async (request: () => Promise<AutomaticRepoGradeStatus>) => {
      const attempt = ++revision;
      clearTimeout(timer);
      const startedAt = performance.now();
      const status = await request().catch(() => unavailable);
      if (!active || attempt !== revision) return;
      const run = status.status === "loaded" ? status.run : null;
      const retryAt = status.status === "loaded" ? status.githubRetryAt : null;
      const diagnostic = [run?.id, run?.phase, status.status, retryAt].join(":");
      if (diagnostic !== lastDiagnostic) {
        lastDiagnostic = diagnostic;
        try {
          const outcome = status.status === "unavailable" ? "unavailable" : run?.phase === "incomplete" ? "incomplete" : "success";
          recordRepoGradesStartup(retryAt ? "background_github_cooldown" : "background",
            retryAt ? "blocked" : outcome, startedAt, run?.courses.length);
        } catch {
          // The session diagnostic must not interrupt the durable status view.
        }
      }
      setCurrent({ accountId, status });
      const readAgain = () => void update(() => readRepoGradeAutomaticStatusAction(accountId));
      if (status.status === "unavailable" || automaticRepoGradeRunActive(run)
        || run?.settling) {
        timer = setTimeout(readAgain, POLL_MS);
      } else if (status.status === "loaded" && status.schedule) {
        const untilDue = Date.parse(status.schedule.nextAt) - Date.now();
        timer = setTimeout(readAgain, Math.max(POLL_MS, Math.min(untilDue, 30_000)));
      }
      return status;
    };

    controller.current = { update };
    void update(() => enqueueRepoGradeAutomaticRunAction(accountId));
    return () => {
      active = false;
      controller.current = null;
      clearTimeout(timer);
    };
  }, [accountId]);

  async function change(
    request: (accountId: string) => Promise<AutomaticRepoGradeStatus>,
    diagnostic: "background_preference" | "background_schedule" | "background_start" | "background_stop" | "background_github_retry",
  ) {
    if (!accountId || !controller.current) return;
    setPendingAccount(accountId);
    try {
      const startedAt = performance.now();
      const status = await controller.current.update(() => request(accountId));
      if (status) {
        const outcome = status.status === "unavailable" ? "unavailable"
          : status.control?.changed === false ? "unchanged" : "success";
        recordControl(diagnostic, outcome, startedAt);
        setControl(status.status === "loaded" && status.control ? { accountId, ...status.control } : undefined);
      }
    } finally {
      setPendingAccount((previous) => previous === accountId ? undefined : previous);
    }
  }

  return {
    status: current?.accountId === accountId ? current?.status : undefined,
    pending: pendingAccount === accountId,
    control: control?.accountId === accountId ? control : undefined,
    setEnabled: (enabled: boolean) => change((id) => setRepoGradeAutomaticEnabledAction(id, enabled), "background_preference"),
    setGithubRetry: (enabled: boolean) =>
      change((id) => setRepoGradeAutomaticGithubRetryAction(id, enabled), "background_github_retry"),
    setSchedule: (schedule: AutomaticRepoGradeScheduleDraft | null) =>
      change((id) => setRepoGradeAutomaticScheduleAction(id, schedule), "background_schedule"),
    start: () => change(startRepoGradeAutomaticRunAction, "background_start"),
    stop: (runId: string) => change((id) => stopRepoGradeAutomaticRunAction(id, runId), "background_stop"),
    async readRecovery(targetId: number) {
      const connection = controller.current;
      if (!accountId || !connection) return null;
      const startedAt = performance.now();
      const result = await readRepoGradeAutomaticRecoveryAction(accountId, targetId).catch(() => null);
      if (connection === controller.current) recordControl("background_recovery", result === null ? "unavailable" : "success", startedAt);
      return result;
    },
    async retryPreparation(targetId: number) {
      const connection = controller.current;
      if (!accountId || !connection) return unavailable;
      setPendingAccount(accountId);
      try {
        const startedAt = performance.now();
        const result = await retryRepoGradeAutomaticPreparationAction(accountId, targetId).catch(() => unavailable);
        if (connection === controller.current) {
          recordControl("background_retry", result.status === "ready" ? "success" : result.status === "unavailable" ? "unavailable" : "failed", startedAt);
          await connection.update(() => readRepoGradeAutomaticStatusAction(accountId));
        }
        return result;
      } finally {
        setPendingAccount((previous) => previous === accountId ? undefined : previous);
      }
    },
  };
}
