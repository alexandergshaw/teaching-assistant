"use client";

// N15a Wave 1 (docs/n15-one-upload-per-student-scope.md section 3): the thin
// hook behind "each upload is one student". A GROWING queue drained by ONE
// serial worker that paces its dispatches by the server's
// GRADE_INTER_REQUEST_DELAY_MS (returned by gradingOneUploadAction) and grades
// each upload through the existing owner-gated, budget-checked
// POST /api/grade-run-item. Every decision (identity, pacing, run projection)
// lives in oneUploadQueue.ts; this file only holds the refs and sequences the
// calls.
//
// Same react budget as useIncrementalGradingRun.ts: ONLY useRef and useState,
// no useEffect, so the same no-render vi.mock("react", ...) harness drives it.
//
// THE IDENTITY INVARIANT (scope section 3, RES-N15M-7): the read of
// identityStateRef.current, the assignNextUploadIdentity call and the
// write-back happen in ONE synchronous block with NO await between them, so
// two builds that resolve back to back cannot both read the same taken-set
// and emit the same display string. Stated here, exercised in the lifecycle
// test only as far as node allows; real-browser concurrent-upload timing is an
// owner-walk residual.
//
// DIAGNOSTIC: one `grade_item` entry per settled upload (outcome + duration).
// The disambiguated display is a filename-derived student NAME, which
// gradingDiagnosticLog's NO-STUDENT-DATA rule forbids recording, so it is
// never passed. The upload ordinal is observable as entry order and the pacing
// as the gaps between consecutive `at` timestamps. The whole-run diagnostic
// (markWholeRunStart) deliberately does not fire on this path.
import { useRef, useState } from "react";
import { gradingOneUploadAction } from "@/app/actions/grading-one-upload";
import type { GradeResult, GradingRun } from "@/lib/grade/types";
import type { LlmProvider } from "@/lib/llm";
import { preflightUploadFile } from "@/lib/grade/zip-upload-preflight";
import { recordGradingDiagnosticEntry } from "./gradingDiagnosticLog";
import {
  classifyItemFailure,
  type ArrivedItemResult,
  type GradeRunItemRequestBody,
} from "./incrementalRunPlan";
import {
  EMPTY_IDENTITY_STATE,
  assignNextUploadIdentity,
  describeOneUploadStatus,
  nextDispatchWaitMs,
  projectRun,
  type IdentityFoldState,
} from "./oneUploadQueue";

/** The identity GradingResults.tsx's runResetKey compares: constant for the
 * life of the hook, so each arriving row is "the same run, one row longer". */
export const ONE_UPLOAD_RUN_KEY = "one-upload";

export interface UseOneUploadRunParams {
  provider: LlmProvider;
  /** localStorage key the checkbox persists under ("1" on, absent off). The
   * literal lives in GradingTab.tsx, where componentStorageKeys.structure.test.ts
   * counts it. */
  modeStorageKey: string;
  /** Surfaces a refusal (or null to clear one) in the tab's alert region. */
  onReject: (message: string | null) => void;
  /** Test seams: the wall clock and the pacing sleep. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface OneUploadContext {
  assignmentInstructions: string;
  rubric: string;
}

/** The slice of an <input type="file"> a pick needs. */
export interface UploadInputLike {
  files: ArrayLike<File> | null;
  value: string;
}

export interface UseOneUploadRunResult {
  enqueueUpload: (file: File, context: OneUploadContext) => Promise<void>;
  /** A file input's change: preflight, clear the input, then enqueue. */
  pick: (input: UploadInputLike, context: OneUploadContext) => void;
  /** The "each upload is one student" checkbox, persisted. */
  mode: boolean;
  setMode: (next: boolean) => void;
  statusLine: string;
  run: GradingRun | null;
  runKey: string;
  /** Uploads still building, queued or grading. */
  inFlight: number;
}

interface GradeRunItemResponse {
  sourceIndex: number;
  result: GradeResult;
}

// Same wire contract as useIncrementalGradingRun.ts's private
// postGradeRunItem; duplicated rather than exported so that file stays
// outside this wave's write set.
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

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useOneUploadRun(params: UseOneUploadRunParams): UseOneUploadRunResult {
  const { provider, modeStorageKey, onReject } = params;
  const now = params.now ?? Date.now;
  const sleep = params.sleep ?? defaultSleep;

  const queueRef = useRef<GradeRunItemRequestBody[]>([]);
  const arrivedRef = useRef<ArrivedItemResult[]>([]);
  const lastDispatchAtRef = useRef<number | null>(null);
  const workerRunningRef = useRef(false);
  const identityStateRef = useRef<IdentityFoldState>(EMPTY_IDENTITY_STATE);
  const interRequestDelayRef = useRef(0);
  const pendingRef = useRef(0);

  const [mode, setModeState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(modeStorageKey) === "1";
  });
  const [run, setRun] = useState<GradingRun | null>(null);
  const [inFlight, setInFlight] = useState(0);

  const setMode = (next: boolean) => {
    setModeState(next);
    if (typeof window === "undefined") return;
    if (next) localStorage.setItem(modeStorageKey, "1");
    else localStorage.removeItem(modeStorageKey);
  };

  const drain = async (): Promise<void> => {
    // A second caller while the worker is live just leaves its ticket in the
    // queue: the live loop below re-checks the length after every grade.
    if (workerRunningRef.current) return;
    workerRunningRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const request = queueRef.current.shift()!;
        const wait = nextDispatchWaitMs(now(), lastDispatchAtRef.current, interRequestDelayRef.current);
        if (wait > 0) await sleep(wait);
        const startedAt = now();
        lastDispatchAtRef.current = startedAt;

        let outcome: "success" | "failure" = "success";
        let errorMessage: string | undefined;
        try {
          const response = await postGradeRunItem(request);
          arrivedRef.current.push({ sourceIndex: response.sourceIndex, result: response.result });
        } catch (err) {
          outcome = "failure";
          errorMessage = err instanceof Error ? err.message : "The grading service did not respond.";
          arrivedRef.current.push({
            sourceIndex: request.sourceIndex,
            result: classifyItemFailure(request.sourceIndex, request.entry, err),
          });
        }
        pendingRef.current -= 1;

        const settledAt = now();
        recordGradingDiagnosticEntry({
          at: new Date(settledAt).toISOString(),
          operation: "grade_item",
          outcome,
          durationMs: Math.max(0, Math.round(settledAt - startedAt)),
          error: errorMessage,
        });
        setRun(projectRun({ rubric: request.rubric, arrived: arrivedRef.current, inFlight: pendingRef.current > 0 }));
        setInFlight(pendingRef.current);
      }
    } finally {
      workerRunningRef.current = false;
    }
  };

  const enqueueUpload = async (file: File, context: OneUploadContext): Promise<void> => {
    pendingRef.current += 1;
    setInFlight(pendingRef.current);
    onReject(null);
    try {
      const fd = new FormData();
      fd.set("upload", file);
      fd.set("assignmentInstructions", context.assignmentInstructions);
      fd.set("provider", provider);
      const built = await gradingOneUploadAction(fd);
      if (!built.ok) {
        onReject(built.reason);
        pendingRef.current -= 1;
        setInFlight(pendingRef.current);
        return;
      }
      interRequestDelayRef.current = built.interRequestDelayMs;

      // Synchronous read-modify-write: NO await between the read of
      // identityStateRef.current and the write-back (see the header).
      const step = assignNextUploadIdentity(identityStateRef.current, built.entry.student);
      identityStateRef.current = step.next;
      queueRef.current.push({
        sourceIndex: step.identity.ordinal - 1,
        entry: { ...built.entry, student: step.identity.display },
        assignmentInstructions: context.assignmentInstructions,
        rubric: context.rubric,
        provider,
        pointsPossible: null,
      });
      void drain();
    } catch (err) {
      onReject(err instanceof Error ? err.message : "Could not prepare this upload.");
      pendingRef.current -= 1;
      setInFlight(pendingRef.current);
    }
  };

  const pick = (input: UploadInputLike, context: OneUploadContext): void => {
    const chosen = input.files?.[0];
    if (!chosen) return;
    const preflight = preflightUploadFile(chosen, "The student submission file");
    // Cleared so the same file can be picked again for the next student.
    input.value = "";
    if (!preflight.ok) {
      onReject(preflight.message);
      return;
    }
    void enqueueUpload(chosen, context);
  };

  return {
    enqueueUpload,
    pick,
    mode,
    setMode,
    statusLine: describeOneUploadStatus(inFlight),
    run,
    runKey: ONE_UPLOAD_RUN_KEY,
    inFlight,
  };
}
