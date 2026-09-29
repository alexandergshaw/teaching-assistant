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
import { prepareGradingRunAction, completeGradingRunHeaderAction } from "@/app/actions/grading-incremental";
import type { GradeResult, GradingRun, GradingRunHeader, GradingRunTier2 } from "@/lib/grade/types";
import type { LlmProvider } from "@/lib/llm";
import {
  routeGradingRun,
  buildRunItemRequests,
  buildIncrementalRun,
  mergeArrivedResults,
  classifyItemFailure,
  INCREMENTAL_CONCURRENCY,
  type ArrivedItemResult,
  type GradeRunItemRequestBody,
  type IncrementalPhase,
  type IncrementalRunPlan,
} from "./incrementalRunPlan";

// A39 incremental-fill W5 (docs/a39-fill-waves.md, S1): the header shape
// prepareGradingRunAction's `mode: "incremental"` branch carries and
// buildIncrementalRun consumes - only the "ok" branch ever reaches here.
type ResolvedRunHeader = Extract<GradingRunHeader, { kind: "ok" }>;

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
  // A39 incremental-fill W5 (architecture 5.4): the ONE door for every
  // whole-run dispatch, injected callers included (GradingTab.tsx's
  // handleAutoGrade) - resets the phase to `idle` BEFORE calling the
  // injected submitWholeRun, which is what hands the whole-run path back its
  // reference-comparison identity (5.7 obligation 1).
  beginWholeRun: (fd: FormData) => void;
  phase: IncrementalPhase;
  incrementalRunning: boolean;
  incrementalRun: GradingRun | null;
  runId: number;
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
  // A39 incremental-fill W5 (architecture 6.3): RAW arrived rows for the life
  // of the run. Only ever APPENDED to; buildIncrementalRun reads it and
  // returns a new object - nothing writes a projected result back into it
  // (F21). A ref, not state: runIdRef below needs the same "read the live
  // value inside an already-running closure" property this already has.
  const arrivedRef = useRef<ArrivedItemResult[]>([]);
  // Increments once per run that actually reaches `running` (never on a
  // whole-run dispatch) - selectRunKey's `runId`, so two different
  // GradingRun objects belonging to the SAME run share one identity
  // (RULING 131, architecture 5.7).
  const runIdRef = useRef(0);
  // W6 (F16-F18): the non-blocking Tier 2 payload, for the run currently
  // owning runIdRef.current. A ref, not useState - a useState slot's captured
  // closure would rebuild with the stale pre-arrival value (F17).
  const tier2Ref = useRef<GradingRunTier2 | null>(null);

  const [phase, setPhase] = useState<IncrementalPhase>("idle");
  const [incrementalRun, setIncrementalRun] = useState<GradingRun | null>(null);
  const [incrementalResults, setIncrementalResults] = useState<readonly GradeResult[]>([]);
  const [incrementalDone, setIncrementalDone] = useState(0);
  const [incrementalTotal, setIncrementalTotal] = useState(0);
  const [incrementalError, setIncrementalError] = useState<string | null>(null);
  const incrementalRunning = phase === "running" || phase === "stopping";

  // A39 incremental-fill W5 (architecture 5.4, 5.5): the ONE door. Every
  // whole-run dispatch - both of startReview's own branches below, AND
  // GradingTab.tsx's handleAutoGrade - now calls this instead of the
  // injected submitWholeRun directly, so a whole-run object can never travel
  // with a stale incremental runKey (selectRunKey("idle", n) === undefined
  // is what hands the whole-run path back its reference comparison).
  const beginWholeRun = (fd: FormData) => {
    setPhase("idle");
    setIncrementalRun(null);
    submitWholeRun(fd);
  };

  const cancel = () => {
    // 7.3: a state transition, not an AbortController - the in-flight
    // handler calls cannot be stopped and have already been paid for. Not
    // gated on the currently-rendered `phase` value: GradingTab.tsx only
    // renders the Stop control while `incrementalRunning` is true, so this
    // is only ever reachable during a real run.
    cancelledRef.current = true;
    setPhase("stopping");
  };

  const runPool = async (
    requests: readonly GradeRunItemRequestBody[],
    header: ResolvedRunHeader,
    speedGraderUrl: string | null,
    plan: IncrementalRunPlan
  ) => {
    let cursor = 0;
    let doneCount = 0;

    const rebuild = (forPhase: IncrementalPhase) => {
      setIncrementalRun(
        buildIncrementalRun({
          header,
          speedGraderUrl,
          totalTicketCount: requests.length,
          arrived: arrivedRef.current,
          phase: forPhase,
          tier2: tier2Ref.current,
        })
      );
    };

    // W6 (design 4.3, F16-F18): fired here, on the incremental path only,
    // NEVER awaited - it must not sit on the critical path to row 1. myRunId
    // is the SAME identity token selectRunKey reads (RULING 131): a late
    // Tier 2 promise from a superseded run must not write into its successor.
    const myRunId = runIdRef.current;
    completeGradingRunHeaderAction(plan.assignmentInstructions, plan.rubric, plan.provider)
      .then((tier2) => {
        if (runIdRef.current !== myRunId) return;
        tier2Ref.current = tier2;
        rebuild(arrivedRef.current.length === requests.length ? "complete" : cancelledRef.current ? "stopping" : "running");
      })
      .catch((err) => {
        if (runIdRef.current !== myRunId) return;
        // F18: caught and OBSERVABLE, but never stops the run.
        setIncrementalError(
          `${err instanceof Error ? err.message : "Could not load the full-credit checklist or sample answer."} Grades are unaffected.`
        );
      });

    const runWorker = async (): Promise<void> => {
      for (;;) {
        if (cancelledRef.current) return;
        const index = cursor;
        cursor += 1;
        if (index >= requests.length) return;
        const request = requests[index];
        try {
          const response = await postGradeRunItem(request);
          arrivedRef.current.push({ sourceIndex: response.sourceIndex, result: response.result });
        } catch (err) {
          arrivedRef.current.push({
            sourceIndex: request.sourceIndex,
            result: classifyItemFailure(request.sourceIndex, request.entry, err),
          });
        }
        doneCount += 1;
        setIncrementalDone(doneCount);
        setIncrementalResults(mergeArrivedResults(requests.length, arrivedRef.current));
        rebuild(cancelledRef.current ? "stopping" : "running");
      }
    };

    const workerCount = Math.min(INCREMENTAL_CONCURRENCY, requests.length);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

    // 5.3: `running`/`stopping` both end at `complete` when every ticket
    // arrived, `stopped` otherwise - the terminal normalisation (RULING 132)
    // happens on THIS rebuild, via canonicalColumns' isTerminal(phase).
    const finalPhase: IncrementalPhase = arrivedRef.current.length === requests.length ? "complete" : "stopped";
    setPhase(finalPhase);
    rebuild(finalPhase);
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
        beginWholeRun(fd);
        return;
      }

      // 5.3: idle -> running. A NEW run identity, and the raw arrived set
      // starts empty for it.
      runIdRef.current += 1;
      arrivedRef.current = [];
      tier2Ref.current = null;
      setPhase("running");
      setIncrementalRun(null);
      setIncrementalResults([]);
      setIncrementalDone(0);
      setIncrementalTotal(0);
      setIncrementalError(null);

      const prepared = await prepareGradingRunAction(fd);
      // RULING 40: the SAME injected submitWholeRun the client-side
      // synchronous route already calls - two routes, one call site, A5
      // stays at exactly two `formAction(` occurrences.
      if (prepared.mode === "whole-run") {
        beginWholeRun(fd);
        return;
      }
      // RULING 118: a refusal is a decision, not an ordinary fallback reason -
      // it must NOT reach submitWholeRun, or the whole-run gradeAction pays
      // for generateRubric/synthesizeFullCreditChecklist/generateSampleAnswer
      // (dispatched in the same Promise.all as the again-throwing
      // gradeSubmissions call, and not cancelled by that rejection) on a run
      // the app has already decided to refuse. This branch is a dead end: it
      // surfaces the reason via the same incrementalError banner
      // GradingTab.tsx already renders, and starts nothing else.
      if (prepared.mode === "refused") {
        setPhase("refused");
        setIncrementalError(prepared.reason);
        return;
      }

      const { plan, header, speedGraderUrl } = prepared;
      setIncrementalTotal(plan.tickets.length);
      const requests = buildRunItemRequests(plan);
      await runPool(requests, header, speedGraderUrl, plan);
    } catch (err) {
      setIncrementalError(err instanceof Error ? err.message : "Could not start this run.");
      // No tickets were ever dispatched down this path (the throw happens at
      // or before prepareGradingRunAction) - back to idle rather than
      // fabricating a "stopped" run with a terminal sentence nothing earned.
      setPhase("idle");
    } finally {
      // Released on EVERY exit, same discipline as
      // useRepoGradesBulkGrade.ts's own finally - a rejecting prepare call
      // or a rejecting pool must never leave the lock stuck. RES-FILL-2: the
      // release itself is deferred one microtask rather than assigned
      // in-line here. The incremental branch already suspends at an `await`
      // before ever reaching this `finally`, so the extra microtask hop is
      // unobservable there. The whole-run branch (both the client-side
      // synchronous `routeGradingRun` return and `prepareGradingRunAction`'s
      // own `mode: "whole-run"`) has NO await before this point, so
      // startReview runs start-to-finish inside one synchronous turn - an
      // in-line release here would clear the lock before a second,
      // same-render call to startReview (no tick in between, e.g. two rapid
      // presses) has even been made, leaving that second call free to
      // dispatch again. Deferring the release means a second synchronous
      // call still observes startLockRef.current === true, exactly as the
      // incremental branch's in-flight await already guarantees.
      queueMicrotask(() => {
        startLockRef.current = false;
      });
    }
  };

  return {
    startReview,
    cancel,
    beginWholeRun,
    phase,
    incrementalRunning,
    incrementalRun,
    runId: runIdRef.current,
    incrementalResults,
    incrementalDone,
    incrementalTotal,
    incrementalError,
  };
}
