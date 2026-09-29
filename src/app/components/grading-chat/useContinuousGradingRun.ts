"use client";

// GRADING-CHAT wave 1 (docs/grading-chat-waves.md section 3, N3). The
// continuous, dispatch-on-arrival driver behind the chat surface (AC-L/AC-5/
// AC-6). NOT an extension of useIncrementalGradingRun.ts - that hook is a
// fixed-total drain over one FormData; this surface has no known total,
// submissions keep arriving (docs/grading-chat-architecture.md section 2).
//
// Reuses the pure plan leaf (incrementalRunPlan.ts) unchanged:
// mergeArrivedResults/buildIncrementalRun/classifyItemFailure/canonicalColumns
// are all keyed on sourceIndex, which is exactly what makes them append-safe
// for a growing queue. The transport shape (postGradeRunItem) and the
// per-item try/catch idiom are copied from useIncrementalGradingRun.ts, not
// imported (they are file-private there).
//
// RES-GC-9 (docs/grading-chat-reliability.md section 3): the wedge risk. A
// hand-rolled event-driven pool that decrements `inFlight` and re-invokes
// `pump()` only on the RESOLVED path of a dispatch permanently loses a slot
// on every rejection - after INCREMENTAL_CONCURRENCY consecutive failures the
// pool silently stops accepting real work while still returning `{kind:
// "accepted"}`. This driver's `pump()` below uses a single `.finally()` on
// every dispatch so the decrement-and-pump step runs on BOTH the resolved and
// the rejected path, unconditionally - the same guarantee the batch pool gets
// for free from its worker-loop shape (the retry is the next line of the same
// function, not a second scheduled callback).
//
// react budget matches useIncrementalGradingRun.ts: only useRef/useState are
// imported from "react", so this file can be driven by the same no-render
// vi.mock("react", ...) lifecycle-test harness.
import { useRef, useState } from "react";
import { resolveChatRunHeaderAction, prepareChatSubmissionAction } from "@/app/actions/grading-chat-intake";
import { buildTextEntry, type ChatSubmissionInput } from "./chatSubmissionIntake";
import type { GradeResult, GradingRun, GradingRunHeader, StudentSubmissionEntry } from "@/lib/grade/types";
import type { LlmProvider } from "@/lib/llm";
import {
  mergeArrivedResults,
  buildIncrementalRun,
  classifyItemFailure,
  INCREMENTAL_CONCURRENCY,
  type ArrivedItemResult,
  type GradeRunItemRequestBody,
} from "@/app/components/grading/incrementalRunPlan";

type ResolvedRunHeader = Extract<GradingRunHeader, { kind: "ok" }>;

// R4 (docs/grading-chat-architecture.md section 5.3): reuse the VALUE of
// DEFAULT_MAX_SUBMISSIONS (getGeminiMaxSubmissions(), src/lib/gemini.ts) as
// the session ceiling, not a second number. gemini.ts reads process.env and
// is a server-only-convention module (every caller today is a Server Action
// or the grading engine) - this client hook does not import it, and instead
// mirrors its documented default (40) as this driver's own fallback. An env
// override to GRADE_MAX_SUBMISSIONS is therefore not honored client-side;
// recorded as a known simplification (RES-GC-5 already ships at 40 either
// way).
const DEFAULT_MAX_ENTRIES = 40;

export type HeaderState = "unset" | "resolving" | "ready" | "refused";

export type SubmitOutcome =
  | { readonly kind: "accepted"; readonly entryCount: number }
  | { readonly kind: "refused"; readonly reason: string }
  // RES-GC-8 (docs/grading-chat-reliability.md section 2): a multi-entry
  // submission (a zip or Canvas URL) that would carry dispatchedCount past
  // maxEntries dispatches what fits and refuses only the remainder - never a
  // whole-event refusal after the extraction cost was already paid.
  | { readonly kind: "partial"; readonly dispatchedCount: number; readonly refusedCount: number; readonly reason: string };

export interface UseContinuousGradingRunParams {
  readonly provider: LlmProvider;
  /** Injected so the hook is driven by the no-render lifecycle harness with a
   * MOCKED seam. Defaults to the real /api/grade-run-item POST. */
  readonly dispatchItem?: (request: GradeRunItemRequestBody) => Promise<GradeResult>;
  /** The per-session entry ceiling (R4). Defaults to DEFAULT_MAX_ENTRIES. */
  readonly maxEntries?: number;
}

export interface UseContinuousGradingRunResult {
  readonly beginSession: (params: {
    readonly assignmentInstructions: string;
    readonly rubric: string;
  }) => Promise<{ kind: "ready" } | { kind: "refused"; reason: string }>;
  readonly submit: (input: ChatSubmissionInput) => Promise<SubmitOutcome>;
  readonly reset: () => void;
  readonly headerState: HeaderState;
  readonly results: readonly GradeResult[];
  readonly run: GradingRun | null;
  readonly dispatchedCount: number;
  readonly completedCount: number;
  readonly inFlight: number;
  readonly sessionError: string | null;
}

interface GradeRunItemResponse {
  sourceIndex: number;
  result: GradeResult;
}

async function postGradeRunItem(request: GradeRunItemRequestBody): Promise<GradeResult> {
  const res = await fetch("/api/grade-run-item", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<GradeRunItemResponse> & { error?: string };
  if (!res.ok || !body.result) {
    throw new Error(body.error ?? "The grading service did not respond.");
  }
  return body.result;
}

export function useContinuousGradingRun(params: UseContinuousGradingRunParams): UseContinuousGradingRunResult {
  const { provider, maxEntries = DEFAULT_MAX_ENTRIES } = params;
  const dispatchItem = params.dispatchItem ?? postGradeRunItem;

  const headerRef = useRef<ResolvedRunHeader | null>(null);
  const assignmentInstructionsRef = useRef("");
  const arrivedRef = useRef<ArrivedItemResult[]>([]);
  const queueRef = useRef<GradeRunItemRequestBody[]>([]);
  const inFlightRef = useRef(0);
  const dispatchedCountRef = useRef(0);
  const ordinalRef = useRef(0);

  const [headerState, setHeaderState] = useState<HeaderState>("unset");
  const [results, setResults] = useState<readonly GradeResult[]>([]);
  const [run, setRun] = useState<GradingRun | null>(null);
  const [dispatchedCount, setDispatchedCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [inFlight, setInFlight] = useState(0);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const rebuildRun = () => {
    const header = headerRef.current;
    if (!header) return;
    setResults(mergeArrivedResults(dispatchedCountRef.current, arrivedRef.current));
    setRun(
      buildIncrementalRun({
        header,
        speedGraderUrl: null,
        totalTicketCount: dispatchedCountRef.current,
        arrived: arrivedRef.current,
        phase: "running",
        tier2: null,
      })
    );
  };

  // pump(): the bounded in-flight dispatcher. Dispatches from the head of the
  // queue while inFlightRef is under INCREMENTAL_CONCURRENCY. THE WEDGE FIX
  // (RES-GC-9): `.finally()` runs the decrement-and-pump step on every
  // dispatch regardless of outcome - a rejected dispatchItem promise still
  // frees its slot and still asks for the next item, so
  // INCREMENTAL_CONCURRENCY consecutive failures cannot permanently occupy
  // every slot.
  const pump = () => {
    while (inFlightRef.current < INCREMENTAL_CONCURRENCY && queueRef.current.length > 0) {
      const request = queueRef.current.shift()!;
      inFlightRef.current += 1;
      setInFlight(inFlightRef.current);

      dispatchItem(request)
        .then((result) => {
          arrivedRef.current.push({ sourceIndex: request.sourceIndex, result });
        })
        .catch((err) => {
          arrivedRef.current.push({
            sourceIndex: request.sourceIndex,
            result: classifyItemFailure(request.sourceIndex, request.entry, err),
          });
        })
        .finally(() => {
          inFlightRef.current -= 1;
          setInFlight(inFlightRef.current);
          setCompletedCount(arrivedRef.current.length);
          rebuildRun();
          pump();
        });
    }
  };

  const beginSession = async (sessionParams: { assignmentInstructions: string; rubric: string }) => {
    // Idempotent: a header already resolved for this session is a no-op, so
    // a second call (e.g. from every submit()) never re-spends a
    // generateRubric model call.
    if (headerRef.current) return { kind: "ready" as const };

    setHeaderState("resolving");
    const header = await resolveChatRunHeaderAction(sessionParams.assignmentInstructions, sessionParams.rubric, provider);
    if (header.kind === "refused") {
      setHeaderState("refused");
      setSessionError(header.error);
      return { kind: "refused" as const, reason: header.error };
    }

    headerRef.current = header;
    assignmentInstructionsRef.current = sessionParams.assignmentInstructions;
    setHeaderState("ready");
    setSessionError(null);
    return { kind: "ready" as const };
  };

  const submit = async (input: ChatSubmissionInput): Promise<SubmitOutcome> => {
    const header = headerRef.current;
    if (!header) {
      return { kind: "refused", reason: "Set instructions and a rubric before submitting." };
    }

    let entries: StudentSubmissionEntry[];
    let pointsPossible: number | null = null;

    if (input.kind === "text") {
      if (!input.content.trim()) {
        return { kind: "refused", reason: "This submission is empty." };
      }
      ordinalRef.current += 1;
      entries = [buildTextEntry({ label: input.label, content: input.content }, ordinalRef.current)];
    } else {
      const formData = new FormData();
      if (input.kind === "file") {
        formData.set("kind", "file");
        formData.set("file", input.file);
      } else {
        formData.set("kind", "url");
        formData.set("url", input.url);
      }
      formData.set("provider", provider);
      const outcome = await prepareChatSubmissionAction(formData);
      if (outcome.kind === "refused") {
        return { kind: "refused", reason: outcome.reason };
      }
      entries = outcome.entries;
      pointsPossible = outcome.pointsPossible;
    }

    // RES-GC-8: clip to what the session ceiling still allows; refuse only
    // the remainder, never the whole event.
    const available = maxEntries - dispatchedCountRef.current;
    if (available <= 0) {
      return {
        kind: "refused",
        reason: `This session has reached its ${maxEntries}-submission limit. Start a new session to grade more.`,
      };
    }
    const admitted = entries.slice(0, available);
    const refusedCount = entries.length - admitted.length;

    for (const entry of admitted) {
      const sourceIndex = dispatchedCountRef.current;
      dispatchedCountRef.current += 1;
      queueRef.current.push({
        sourceIndex,
        entry,
        assignmentInstructions: assignmentInstructionsRef.current,
        rubric: header.effectiveRubric,
        provider,
        pointsPossible,
      });
    }
    setDispatchedCount(dispatchedCountRef.current);
    pump();

    if (refusedCount > 0) {
      return {
        kind: "partial",
        dispatchedCount: admitted.length,
        refusedCount,
        reason:
          `Graded the first ${admitted.length} of ${entries.length} students in this submission; ` +
          `the session's ${maxEntries}-submission limit was reached. Start a new session to grade the rest.`,
      };
    }
    return { kind: "accepted", entryCount: admitted.length };
  };

  const reset = () => {
    headerRef.current = null;
    assignmentInstructionsRef.current = "";
    arrivedRef.current = [];
    queueRef.current = [];
    inFlightRef.current = 0;
    dispatchedCountRef.current = 0;
    ordinalRef.current = 0;
    setHeaderState("unset");
    setResults([]);
    setRun(null);
    setDispatchedCount(0);
    setCompletedCount(0);
    setInFlight(0);
    setSessionError(null);
  };

  return {
    beginSession,
    submit,
    reset,
    headerState,
    results,
    run,
    dispatchedCount,
    completedCount,
    inFlight,
    sessionError,
  };
}
