"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { controlRepoGradeTargetRequestAction, readRepoGradeTargetRequestsAction } from "@/app/actions/repo-grade-target-request";

export type TargetRequest = {
  id: number; courseId: string; folder: string; repo: string | null;
  state: "queued" | "paused" | "running" | "paused-running" | "complete" | "incomplete" | "stopped";
  runId: string | null; inFlight: boolean;
  bulk: boolean; folders: string[] | null; repos: string[] | null;
  pairs?: { folder: string; repo: string }[] | null;
  reason?: string | null; counts?: Record<string, number>;
};
export type TargetCommand = "pause" | "resume" | "stop";

/** Requests are scoped by owner and polled independently of the automatic-run view. */
export function useRepoGradeTargetRequests(accountId: string | null) {
  const [current, setCurrent] = useState<{ accountId: string; requests: TargetRequest[]; unavailable: boolean }>();
  const scope = useRef<{ accountId: string; revision: number; pending: boolean } | null>(null);
  const refresh = useCallback(async () => {
    const active = scope.current;
    if (!accountId || active?.accountId !== accountId) return;
    const attempt = ++active.revision;
    active.pending = true;
    try {
      const result = await readRepoGradeTargetRequestsAction(accountId).catch(() => ({ status: "unavailable" } as const));
      if (scope.current !== active || active.revision !== attempt) return;
      setCurrent((previous) => result.status === "loaded"
        ? { accountId, requests: result.requests as TargetRequest[], unavailable: false }
        : { accountId, requests: previous?.accountId === accountId ? previous.requests : [], unavailable: true });
    } finally {
      if (active.revision === attempt) active.pending = false;
    }
  }, [accountId]);
  useEffect(() => {
    if (!accountId) return;
    const active = { accountId, revision: 0, pending: false };
    const activeScope = scope;
    activeScope.current = active;
    void refresh();
    const timer = setInterval(() => {
      // A status read can take longer than the polling cadence. Keep it
      // current until it settles instead of repeatedly superseding it.
      if (!active.pending) void refresh();
    }, 5_000);
    return () => {
      clearInterval(timer);
      if (activeScope.current === active) activeScope.current = null;
    };
  }, [accountId, refresh]);
  const control = useCallback(async (id: number, action: TargetCommand) => {
    const active = scope.current;
    if (!accountId || active?.accountId !== accountId) return false;
    const result = await controlRepoGradeTargetRequestAction(accountId, id, action).catch(() => ({ status: "unavailable" } as const));
    if (scope.current !== active) return false;
    await refresh();
    return scope.current === active && result.status === "loaded" && result.changed;
  }, [accountId, refresh]);
  return {
    requests: current?.accountId === accountId ? current.requests : [],
    unavailable: current?.accountId === accountId && current.unavailable,
    ready: !!accountId && current?.accountId === accountId && !current.unavailable,
    refresh,
    control,
  };
}
