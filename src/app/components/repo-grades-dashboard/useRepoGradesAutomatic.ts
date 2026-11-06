"use client";

import { useEffect, useRef, useState } from "react";
import {
  enqueueRepoGradeAutomaticRunAction, readRepoGradeAutomaticRecoveryAction, readRepoGradeAutomaticStatusAction,
  retryRepoGradeAutomaticPreparationAction, setRepoGradeAutomaticEnabledAction, stopRepoGradeAutomaticRunAction,
} from "@/app/actions/repo-grade-automatic";
import type { AutomaticRepoGradeRun, AutomaticRepoGradeStatus } from "@/lib/repo-grades-dashboard/automatic-status";
import { recordRepoGradesStartup } from "./startup-diagnostics";

const POLL_MS = 5_000;
const unavailable = { status: "unavailable" } as const;

export function automaticRepoGradeRunActive(run: AutomaticRepoGradeRun | null | undefined) {
  return run?.phase === "discovering" || run?.phase === "grading";
}

export function useRepoGradesAutomatic(accountId: string | null) {
  const [current, setCurrent] = useState<{ accountId: string; status: AutomaticRepoGradeStatus }>();
  const [pendingAccount, setPendingAccount] = useState<string>();
  const controller = useRef<{ update: (request: () => Promise<AutomaticRepoGradeStatus>) => Promise<void> }>(null);

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
      const diagnostic = [run?.id, run?.phase, status.status].join(":");
      if (diagnostic !== lastDiagnostic) {
        lastDiagnostic = diagnostic;
        try {
          const outcome = status.status === "unavailable" ? "unavailable" : run?.phase === "incomplete" ? "incomplete" : "success";
          recordRepoGradesStartup("background", outcome, startedAt, run?.courses.length);
        } catch {
          // The session diagnostic must not interrupt the durable status view.
        }
      }
      setCurrent({ accountId, status });
      if (status.status === "unavailable" || automaticRepoGradeRunActive(run)
        || run?.courses.some((course) => course.counts.some(({ state }) => state === "running"))) {
        timer = setTimeout(() => void update(() => readRepoGradeAutomaticStatusAction(accountId)), POLL_MS);
      }
    };

    controller.current = { update };
    void update(() => enqueueRepoGradeAutomaticRunAction(accountId));
    return () => {
      active = false;
      controller.current = null;
      clearTimeout(timer);
    };
  }, [accountId]);

  async function change(request: (accountId: string) => Promise<AutomaticRepoGradeStatus>) {
    if (!accountId || !controller.current) return;
    setPendingAccount(accountId);
    try {
      await controller.current.update(() => request(accountId));
    } finally {
      setPendingAccount((previous) => previous === accountId ? undefined : previous);
    }
  }

  return {
    status: current?.accountId === accountId ? current?.status : undefined,
    pending: pendingAccount === accountId,
    setEnabled: (enabled: boolean) => change((id) => setRepoGradeAutomaticEnabledAction(id, enabled)),
    start: () => change(enqueueRepoGradeAutomaticRunAction),
    stop: (runId: string) => change((id) => stopRepoGradeAutomaticRunAction(id, runId)),
    readRecovery: (targetId: number) => accountId ? readRepoGradeAutomaticRecoveryAction(accountId, targetId) : Promise.resolve(null),
    async retryPreparation(targetId: number) {
      const connection = controller.current;
      if (!accountId || !connection) return unavailable;
      setPendingAccount(accountId);
      try {
        const result = await retryRepoGradeAutomaticPreparationAction(accountId, targetId).catch(() => unavailable);
        if (connection === controller.current) await connection.update(() => readRepoGradeAutomaticStatusAction(accountId));
        return result;
      } finally {
        setPendingAccount((previous) => previous === accountId ? undefined : previous);
      }
    },
  };
}
