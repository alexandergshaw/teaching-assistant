"use client";

import { useEffect, useRef, useState } from "react";
import {
  enqueueRepoGradeAutomaticRunAction, readRepoGradeAutomaticRecoveryAction, readRepoGradeAutomaticStatusAction,
  retryRepoGradeAutomaticPreparationAction, setRepoGradeAutomaticClassQueueAction,
  setRepoGradeAutomaticEnabledAction, setRepoGradeAutomaticGithubRetryAction,
  setRepoGradeAutomaticScheduleAction,
  startRepoGradeAutomaticRunAction, startRepoGradeBulkRunAction, startRepoGradeCellsRunAction, startRepoGradeTargetedRunAction, stopRepoGradeAutomaticRunAction,
} from "@/app/actions/repo-grade-automatic";
import type { AutomaticRepoGradeRun, AutomaticRepoGradeStatus } from "@/lib/repo-grades-dashboard/automatic-status";
import type { AutomaticRepoGradeScheduleDraft } from "@/lib/repo-grades-dashboard/automatic-schedule";
import { backgroundDiagnosticDetail, recordRepoGradesStartup } from "./startup-diagnostics";

const POLL_MS = 5_000;
const unavailable = { status: "unavailable" } as const;
type ControlDiagnostic = "background_preference" | "background_schedule" | "background_start" | "background_stop"
  | "background_github_retry" | "background_class_queue";
type StatusRequest = () => Promise<AutomaticRepoGradeStatus>;

function recordControl(
  operation: ControlDiagnostic | "background_retry" | "background_recovery",
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
  const [current, setCurrent] = useState<{ accountId: string; status: AutomaticRepoGradeStatus; stale: boolean }>();
  const [pendingAccount, setPendingAccount] = useState<string>();
  const [control, setControl] = useState<{ accountId: string; action: "start" | "stop"; changed: boolean }>();
  const controller = useRef<{
    update: (request: StatusRequest) => Promise<AutomaticRepoGradeStatus | undefined>;
  }>(null);

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    let revision = 0;
    let lastDiagnostic = "";
    let lastLoaded: Extract<AutomaticRepoGradeStatus, { status: "loaded" }> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const update = async (request: StatusRequest) => {
      const attempt = ++revision;
      clearTimeout(timer);
      const startedAt = performance.now();
      const status = await request().catch(() => unavailable);
      if (!active || attempt !== revision) return;
      const readAgain = () => void update(() => readRepoGradeAutomaticStatusAction(accountId));
      const run = status.status === "loaded" ? status.run : null;
      const retryAt = status.status === "loaded" ? status.githubRetryAt : null;
      const diagnostic = [run?.id, run?.phase, run?.settling, status.status, retryAt].join(":");
      if (diagnostic !== lastDiagnostic) {
        lastDiagnostic = diagnostic;
        try {
          const outcome = status.status === "unavailable" ? "unavailable" : run?.phase === "incomplete" ? "incomplete" : run?.phase === "stopped" ? "stopped" : automaticRepoGradeRunActive(run) || run?.settling ? "in-progress" : "success";
          if (outcome !== "in-progress" || retryAt) recordRepoGradesStartup(retryAt ? "background_github_cooldown" : "background",
            retryAt ? "blocked" : outcome, startedAt, run ? backgroundDiagnosticDetail(run) : undefined);
        } catch {
          // The session diagnostic must not interrupt the durable status view.
        }
      }
      if (status.status === "loaded") lastLoaded = status;
      setCurrent({ accountId, status: lastLoaded ?? status, stale: status.status === "unavailable" && !!lastLoaded });
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
    diagnostic: ControlDiagnostic,
  ) {
    if (!accountId || !controller.current) return;
    setPendingAccount(accountId);
    try {
      const startedAt = performance.now();
      const status = await controller.current.update(() => request(accountId));
      if (status) {
        const outcome = status.status === "unavailable" || (diagnostic === "background_class_queue" && !status.classQueue) ? "unavailable"
          : status.control?.changed === false ? "unchanged" : "success";
        recordControl(diagnostic, outcome, startedAt);
        setControl(status.status === "loaded" && status.control ? { accountId, ...status.control } : undefined);
      }
      return status;
    } finally {
      setPendingAccount((previous) => previous === accountId ? undefined : previous);
    }
  }

  return {
    status: current?.accountId === accountId ? current?.status : undefined,
    stale: current?.accountId === accountId && current.stale,
    pending: pendingAccount === accountId,
    control: control?.accountId === accountId ? control : undefined,
    setEnabled: (enabled: boolean) => change((id) => setRepoGradeAutomaticEnabledAction(id, enabled), "background_preference"),
    setGithubRetry: (enabled: boolean) =>
      change((id) => setRepoGradeAutomaticGithubRetryAction(id, enabled), "background_github_retry"),
    async setSchedule(schedule: AutomaticRepoGradeScheduleDraft | null) {
      await change((id) => setRepoGradeAutomaticScheduleAction(id, schedule), "background_schedule");
    },
    async setClassQueue(courseIds: string[] | null) {
      const status = await change((id) => setRepoGradeAutomaticClassQueueAction(id, courseIds), "background_class_queue");
      return status?.status === "loaded" && !!status.classQueue;
    },
    start: () => change(startRepoGradeAutomaticRunAction, "background_start"),
    async startTargeted(courseId: string, folder: string, repo: string | null) {
      const connection = controller.current;
      if (!accountId || !connection) return { status: "unavailable" } as const;
      setPendingAccount(accountId);
      try {
        const result = await startRepoGradeTargetedRunAction(accountId, courseId, folder, repo)
          .catch(() => ({ status: "unavailable" } as const));
        if (connection === controller.current) await connection.update(() => readRepoGradeAutomaticStatusAction(accountId));
        return result;
      } finally {
        setPendingAccount((previous) => previous === accountId ? undefined : previous);
      }
    },
    async startCells(courseId: string, cells: { folder: string; repo: string }[]) {
      const connection = controller.current;
      if (!accountId || !connection) return { status: "unavailable" } as const;
      setPendingAccount(accountId);
      try {
        const result = await startRepoGradeCellsRunAction(accountId, courseId, cells)
          .catch(() => ({ status: "unavailable" } as const));
        if (connection === controller.current) await connection.update(() => readRepoGradeAutomaticStatusAction(accountId));
        return result;
      } finally {
        setPendingAccount((previous) => previous === accountId ? undefined : previous);
      }
    },
    async startBulk(courseId: string, folders: string[] | null, repos: string[] | null) {
      const connection = controller.current;
      if (!accountId || !connection) return { status: "unavailable" } as const;
      setPendingAccount(accountId);
      try {
        const result = await startRepoGradeBulkRunAction(accountId, courseId, folders, repos)
          .catch(() => ({ status: "unavailable" } as const));
        if (connection === controller.current) await connection.update(() => readRepoGradeAutomaticStatusAction(accountId));
        return result;
      } finally {
        setPendingAccount((previous) => previous === accountId ? undefined : previous);
      }
    },
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
