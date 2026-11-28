"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { controlRepoGradeTargetRequestAction, readRepoGradeTargetRequestsAction } from "@/app/actions/repo-grade-target-request";
import type { RepoGradeActiveCell } from "@/app/actions/repo-grade-target-request";

export type ActiveGradeCell = RepoGradeActiveCell;

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
export function useRepoGradeTargetRequests(accountId: string | null, courseId?: string | null) {
  const [current, setCurrent] = useState<{
    accountId: string; courseId?: string | null; requests: TargetRequest[]; unavailable: boolean;
    activeCells: ActiveGradeCell[]; activeCellsUnavailable: boolean;
  }>();
  const scope = useRef<{
    accountId: string; courseId?: string | null; revision: number; pending: boolean; lastRead: number; fastPolling: boolean;
  } | null>(null);
  const refresh = useCallback(async () => {
    const active = scope.current;
    if (!accountId || active?.accountId !== accountId || active.courseId !== courseId) return;
    const attempt = ++active.revision;
    active.pending = true;
    active.lastRead = Date.now();
    try {
      const read = courseId ? readRepoGradeTargetRequestsAction(accountId, courseId)
        : readRepoGradeTargetRequestsAction(accountId);
      const result = await read.catch(() => ({ status: "unavailable" } as const));
      if (scope.current !== active || active.revision !== attempt) return;
      active.fastPolling = Boolean(courseId && result.status === "loaded" && !result.activeCellsUnavailable && (
        result.requests.some((request) => request.courseId === courseId && (request.state === "running" || request.inFlight))
        || result.activeCells?.some((cell) => cell.state === "queued" || cell.state === "running" || cell.state === "waiting")
      ));
      setCurrent((previous) => result.status === "loaded"
        ? {
          accountId, courseId, requests: result.requests as TargetRequest[], unavailable: false,
          activeCells: result.activeCells ?? [], activeCellsUnavailable: result.activeCellsUnavailable ?? false,
        }
        : {
          accountId, courseId, requests: previous?.accountId === accountId ? previous.requests : [], unavailable: true,
          activeCells: [], activeCellsUnavailable: Boolean(courseId),
        });
    } finally {
      if (active.revision === attempt) active.pending = false;
    }
  }, [accountId, courseId]);
  useEffect(() => {
    if (!accountId) return;
    const active = { accountId, courseId, revision: 0, pending: false, lastRead: 0, fastPolling: false };
    const activeScope = scope;
    activeScope.current = active;
    void refresh();
    const timer = setInterval(() => {
      // A status read can take longer than the polling cadence. Keep it
      // current until it settles instead of repeatedly superseding it.
      const interval = active.fastPolling ? 2_000 : 5_000;
      if (!active.pending && Date.now() - active.lastRead >= interval) void refresh();
    }, 1_000);
    return () => {
      clearInterval(timer);
      if (activeScope.current === active) activeScope.current = null;
    };
  }, [accountId, courseId, refresh]);
  const control = useCallback(async (id: number, action: TargetCommand) => {
    const active = scope.current;
    if (!accountId || active?.accountId !== accountId || active.courseId !== courseId) return false;
    const result = await controlRepoGradeTargetRequestAction(accountId, id, action).catch(() => ({ status: "unavailable" } as const));
    if (scope.current !== active) return false;
    await refresh();
    return scope.current === active && result.status === "loaded" && result.changed;
  }, [accountId, courseId, refresh]);
  return {
    requests: current?.accountId === accountId ? current.requests : [],
    activeCells: current?.accountId === accountId && current.courseId === courseId ? current.activeCells : [],
    activeCellsUnavailable: current?.accountId === accountId && current.courseId === courseId
      && current.activeCellsUnavailable,
    unavailable: current?.accountId === accountId && current.unavailable,
    ready: !!accountId && current?.accountId === accountId && !current.unavailable,
    refresh,
    control,
  };
}
