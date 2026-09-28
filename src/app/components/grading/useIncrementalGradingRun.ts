"use client";

// A39 wave 4c, step S4 (docs/a39-waves.md 8.4.3): the client-driven
// bounded-concurrency pool over /api/grade-run-item. PORTED from
// src/app/components/repo-grades/useRepoGradesBulkGrade.ts - the run-lock
// ref, the shared-cursor worker pool and the per-item `.catch` isolation are
// all the SAME shape that hook already ships in production. This file adds
// cancellation, which that hook lacks, and the whole-run consumer branches
// RULING 40 requires.
//
// W4-9c's react budget: this file imports ONLY useRef and useState from
// "react" - useIncrementalGradingRun.lifecycle.test.ts drives it with the
// SAME no-render vi.mock("react", ...) harness
// useRepoGradesBulkGrade.lifecycle.test.ts already uses (a useCallback,
// useEffect or useMemo would make that harness THROW rather than fail red).
// NO useEffect here for the same reason useRepoGradesBulkGrade.ts has none
// (that file's own header comment): startReview only ever runs from a real
// onSubmit, so eslint's react-hooks/set-state-in-effect rule never applies.
import { useRef, useState } from "react";
import { prepareGradingRunAction } from "@/app/actions/grading-incremental";
import type { GradeResult } from "@/lib/grade/types";
import type { LlmProvider } from "@/lib/llm";
import {
  routeGradingRun,
  buildRunItemRequests,
  mergeArrivedResults,
  classifyItemFailure,
  INCREMENTAL_CONCURRENCY,
  type ArrivedItemResult,
  type GradeRunItemRequestBody,
} from "./incrementalRunPlan";

export interface UseIncrementalGradingRunParams {
  provider: LlmProvider;
  /** The EXISTING whole-run Server Action dispatch, injected rather than
   * imported directly, so BOTH whole-run routes - the client-side
   * synchronous one (routeGradingRun) and the server-decided one
   * (prepareGradingRunAction's `mode: "whole-run"` return, RULING 40) - go
   * through the SAME call site in the caller (GradingTab.tsx's
   * submitWholeRun), keeping A5's `formAction(` count at exactly two. */
  submitWholeRun: (fd: FormData) => void;
}

export interface UseIncrementalGradingRunResult {
  startReview: (fd: FormData) => Promise<void>;
  cancel: () => void;
  incrementalRunning: boolean;
  incrementalResults: readonly GradeResult[];
  incrementalDone: number;
  incrementalTotal: number;
  incrementalError: string | null;
}

interface GradeRunItemResponse {
  sourceIndex: number;
  result: GradeResult;
}

async function postGradeRunItem(request: GradeRunItemRequestBody): Promise<GradeRunItemResponse> {
  const res = await fetch("/api/grade-run-item", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<GradeRunItemResponse> & { error?: string };
  if (!res.ok || !body.result) {
    throw new Error(body.error ?? "The grading service did not respond.");
  }
  return { sourceIndex: request.sourceIndex, result: body.result };
}

export function useIncrementalGradingRun(params: UseIncrementalGradingRunParams): UseIncrementalGradingRunResult {
  const { provider, submitWholeRun } = params;

  // W4-9: the run lock, claimed BEFORE anything else in startReview, exactly
  // like useRepoGradesBulkGrade.ts's own runLockRef - a live ref read, never
  // captured render state, is what makes a second press from the SAME
  // render a real refusal rather than a race.
  const startLockRef = useRef(false);
  const cancelledRef = useRef(false);

  const [incrementalRunning, setIncrementalRunning] = useState(false);
  const [incrementalResults, setIncrementalResults] = useState<readonly GradeResult[]>([]);
  const [incrementalDone, setIncrementalDone] = useState(0);
  const [incrementalTotal, setIncrementalTotal] = useState(0);
  const [incrementalError, setIncrementalError] = useState<string | null>(null);

  const cancel = () => {
    cancelledRef.current = true;
  };

  const runPool = async (requests: readonly GradeRunItemRequestBody[]) => {
    const arrived: ArrivedItemResult[] = [];
    let cursor = 0;
    let doneCount = 0;

    const runWorker = async (): Promise<void> => {
      for (;;) {
        if (cancelledRef.current) return;
        const index = cursor;
        cursor += 1;
        if (index >= requests.length) return;
        const request = requests[index];
        try {
          const response = await postGradeRunItem(request);
          arrived.push({ sourceIndex: response.sourceIndex, result: response.result });
        } catch (err) {
          arrived.push({
            sourceIndex: request.sourceIndex,
            result: classifyItemFailure(request.sourceIndex, request.entry.student, err),
          });
        }
        doneCount += 1;
        setIncrementalDone(doneCount);
        setIncrementalResults(mergeArrivedResults(requests.length, arrived));
      }
    };

    const workerCount = Math.min(INCREMENTAL_CONCURRENCY, requests.length);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  };

  const startReview = async (fd: FormData): Promise<void> => {
    // W4-9: claimed before ANYTHING else - before routeGradingRun, before
    // prepareGradingRunAction, before the pool. A second call from the same
    // render with no tick between must total exactly one dispatch.
    if (startLockRef.current) return;
    startLockRef.current = true;
    cancelledRef.current = false;

    try {
      const route = routeGradingRun(fd, provider);
      if (route === "whole-run") {
        submitWholeRun(fd);
        return;
      }

      setIncrementalRunning(true);
      setIncrementalResults([]);
      setIncrementalDone(0);
      setIncrementalTotal(0);
      setIncrementalError(null);

      const prepared = await prepareGradingRunAction(fd);
      // RULING 40: the SAME injected submitWholeRun the client-side
      // synchronous route already calls - two routes, one call site, A5
      // stays at exactly two `formAction(` occurrences.
      if (prepared.mode === "whole-run") {
        setIncrementalRunning(false);
        submitWholeRun(fd);
        return;
      }

      const { plan } = prepared;
      setIncrementalTotal(plan.tickets.length);
      const requests = buildRunItemRequests(plan);
      await runPool(requests);
    } catch (err) {
      setIncrementalError(err instanceof Error ? err.message : "Could not start this run.");
    } finally {
      // Released on EVERY exit, same discipline as
      // useRepoGradesBulkGrade.ts's own finally - a rejecting prepare call
      // or a rejecting pool must never leave the lock, or `incrementalRunning`,
      // stuck.
      startLockRef.current = false;
      setIncrementalRunning(false);
    }
  };

  return {
    startReview,
    cancel,
    incrementalRunning,
    incrementalResults,
    incrementalDone,
    incrementalTotal,
    incrementalError,
  };
}
