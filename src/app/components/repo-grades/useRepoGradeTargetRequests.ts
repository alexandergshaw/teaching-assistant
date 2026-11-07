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
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    if (!accountId) return;
    const attempt = ++revision.current;
    const result = await readRepoGradeTargetRequestsAction(accountId).catch(() => ({ status: "unavailable" } as const));
    if (revision.current !== attempt) return;
    setCurrent((previous) => result.status === "loaded"
      ? { accountId, requests: result.requests as TargetRequest[], unavailable: false }
      : { accountId, requests: previous?.accountId === accountId ? previous.requests : [], unavailable: true });
  }, [accountId]);
  useEffect(() => {
    const requestsRevision = revision;
    void refresh();
    const timer = setInterval(() => void refresh(), 5_000);
    return () => { clearInterval(timer); requestsRevision.current++; };
  }, [refresh]);
  const control = useCallback(async (id: number, action: TargetCommand) => {
    if (!accountId) return false;
    const result = await controlRepoGradeTargetRequestAction(accountId, id, action).catch(() => ({ status: "unavailable" } as const));
    await refresh();
    return result.status === "loaded" && result.changed;
  }, [accountId, refresh]);
  return {
    requests: current?.accountId === accountId ? current.requests : [],
    unavailable: current?.accountId === accountId && current.unavailable,
    ready: !!accountId && current?.accountId === accountId && !current.unavailable,
    refresh,
    control,
  };
}
