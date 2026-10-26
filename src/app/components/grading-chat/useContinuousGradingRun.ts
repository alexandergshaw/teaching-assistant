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
import { createContinuousRepositoryAdapter, listRepositoryStudents, type ContinuousRepositoryAdapter, type RepositorySessionStudent } from "./continuousRepositoryAdapter";
import {
  resolveChatRunHeaderAction,
  prepareChatSubmissionAction,
  prepareCompositeSubmissionAction,
} from "@/app/actions/grading-chat-intake";
import { buildTextEntry, CHAT_LABEL_MAX_CHARS, type ChatSubmissionInput } from "./chatSubmissionIntake";
import type {
  GradeHarshness,
  GradeResult,
  GradingRun,
  GradingRunHeader,
  StudentSubmissionEntry,
  SubmissionZipClassification,
} from "@/lib/grade/types";
import type { LlmProvider } from "@/lib/llm";
import { chatSeamNowMs, classifyChatSeamFailure, decideChatSeamDiagnostic, recordChatSeamSettled, type ChatSeamFailureClass } from "./chatSeamDiagnostic";
import { GRADING_DIAGNOSTIC_OPERATION_LABELS, recordClassifySettled } from "@/app/components/grading/gradingDiagnosticLog";
import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
import { buildGradeItemDetail, clientFailureClass, resultSignals, type ChatDetailBag, type GradeItemClientSignals, type GradeTrigger, type ItemDiagnostic, type ItemDiagnosticSink } from "./chatGradeDetail";
import { RECORDING_SPLIT_ENABLED } from "@/lib/grade/constants";
import type { RecordingSplit, RecordingWindow } from "@/lib/grade/recording-split";
import { buildSplitEntries, classifyVideoEntry, videoRefOf, type PendingSplit } from "./recordingSplitDriver";
import { detectCanvasUrlKind } from "@/lib/canvas-url";
import { assignUnclaimedLabel } from "@/lib/grade/utils";
import { ingestStoragedZip, type IngestLedger, type IngestOutcome } from "@/lib/grade/ndjson-ingest-parser";
import { mergeIngestLedgers } from "./ingestLedger";
import { gradeFailureFromBody, postClassifyRecording, postPrepareVideo, videoFailureOf, type ClassifyRecordingFn, type PrepareVideoFn } from "./videoClient";
import { postPrepareSingleFile, type PrepareSingleFileFn } from "./singleFileClient";
import { recordVideoSettled, recordZipVideoOutcomes } from "./videoDiagnostic";
import { intakeExtBucket, intakeSignalsFor, ledgerSignals, recordAdmitAnomaly, recordPrepareDetail, recordSplitDecision } from "./chatIntakeDiagnostic";
import {
  mergeArrivedResults,
  buildIncrementalRun,
  classifyItemFailure,
  stripUnneededRawBase64,
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

export type { ItemDiagnostic, ItemDiagnosticSink };

const ITEM_DIAGNOSTIC_CAP = 200;

/** Diagnostics must never change a grade (scope 4.6, AC-24): any throw in
 * diagnostic code is swallowed here, never rethrown into the grade path. */
function safeDiagnostic(fn: () => void): void {
  try {
    fn();
  } catch {
    // Deliberately empty.
  }
}

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
  readonly dispatchItem?: (request: GradeRunItemRequestBody, sink?: ItemDiagnosticSink) => Promise<GradeResult>;
  /** Injected storaged-zip ingest (BULK-ZIP BW2). Defaults to the real
   * never-throw NDJSON client for POST /api/grade-submission-zip. */
  readonly ingestZip?: (
    storagePath: string,
    provider: string,
    onEntry: (entry: StudentSubmissionEntry) => void
  ) => Promise<IngestOutcome>;
  /** Injected loose-video prepare (VIDEO-GRADING W4). Defaults to the real
   * never-throw POST /api/grade-submission-video. */
  readonly prepareVideo?: PrepareVideoFn;
  /** Injected one-vs-many classifier (RECORDING ONE-VS-MANY W2). Defaults to the
   * real never-throw POST /api/classify-recording; only consulted when
   * RECORDING_SPLIT_ENABLED is on. */
  readonly classifyRecording?: ClassifyRecordingFn;
  /** Injected large-single-file prepare (LARGE-SINGLE-FILE W2). Defaults to the
   * real never-throw POST /api/grade-submission-file. */
  readonly prepareSingleFile?: PrepareSingleFileFn;
  /** The per-session entry ceiling (R4). Defaults to DEFAULT_MAX_ENTRIES. */
  readonly maxEntries?: number;
  /** Opt in to the did-right/did-wrong comment split on every grade request.
   * Absent = body byte-identical to before. */
  readonly commentSplit?: boolean;
}

export interface UseContinuousGradingRunResult {
  readonly repositoryAdapter: ContinuousRepositoryAdapter;
  readonly repositoryStudents: readonly RepositorySessionStudent[];
  readonly beginSession: (params: {
    readonly assignmentInstructions: string;
    readonly rubric: string;
    /** Captured once at session start and frozen for the session; absent = balanced. */
    readonly harshness?: GradeHarshness;
    /** Captured once and frozen for the session; absent = no length directive. */
    readonly feedbackWordTarget?: number;
    /** Captured once and frozen for the session; absent = deduct (default on). */
    readonly applyNamingDeduction?: boolean;
    /** Captured once and frozen for the session; absent = no length deduction (default off). */
    readonly applyLengthDeduction?: boolean;
  }) => Promise<{ kind: "ready" } | { kind: "refused"; reason: string }>;
  readonly submit: (input: ChatSubmissionInput) => Promise<SubmitOutcome>;
  readonly reset: () => void;
  /** Re-dispatches the ORIGINAL request body of a failed row in place (same
   * sourceIndex, no new row). A no-op on a graded or still-pending row. */
  readonly retry: (sourceIndex: number) => void;
  /** Re-dispatches the retained body of an already-arrived row (graded or
   * failed) so it is re-graded and REPLACED in place. Keyed by the row's
   * student label. A no-op for an unknown student or a row already in flight. */
  readonly regrade: (student: string) => void;
  /** The one Canvas URL pinned for this session (F3=A); "" until a Canvas URL
   * submission is accepted. */
  readonly canvasUrl: string;
  /** Loose videos submitted and not yet graded or failed (the pending-staged
   * cap input, ops 5.3). */
  readonly pendingVideoCount: () => number;
  /** Stable for a session, changes only across reset(): "grading-chat-" + sessionId. */
  readonly runKey: string;
  readonly sessionId: number;
  /** The resolved header's rubric fields, exposed at the top level. */
  readonly effectiveRubric: string;
  readonly rubricFingerprint: string;
  readonly generatedRubric: string | undefined;
  readonly headerState: HeaderState;
  readonly results: readonly GradeResult[];
  readonly run: GradingRun | null;
  readonly dispatchedCount: number;
  readonly completedCount: number;
  readonly inFlight: number;
  readonly sessionError: string | null;
  /** Students (row keys) whose single-file name was neither in the file name nor
   * inferable from content and who carry no typed label. A labelled row is never
   * in it. Consumed only by the chat grading mount. */
  readonly unresolvedStudents: ReadonlySet<string>;
  /** BULK-ZIP BW4: the retained ingest ledger (skipped students, unreadable
   * files, student counts) accumulated across every storaged-zip submit in this
   * session; null until one completes, cleared by reset(). */
  readonly ingestLedger: IngestLedger | null;
  /** Read-only presentation signal: student labels of rows queued or in flight
   * (first-time grades, retries and regrades alike). Derived from pendingRef. */
  readonly pendingStudents: ReadonlySet<string>;
  /** Read-only presentation signal: student labels being graded right now (the
   * active concurrency slots), in dispatch order. */
  readonly inFlightStudents: readonly string[];
  /** RECORDING ONE-VS-MANY: the oldest multi-submission recording awaiting the
   * instructor's confirm; null when none. Nothing is graded until it resolves. */
  readonly pendingSplit: PendingSplit | null;
  /** True while a prepared video is being classified (the "Analyzing" phase). */
  readonly classifyingRecording: boolean;
  /** Grades the held recording as one distinct row per detected segment. */
  readonly confirmRecordingSplit: () => SubmitOutcome;
  /** Grades the held recording as ONE submission (today's path). */
  readonly rejectRecordingSplit: () => SubmitOutcome;
  /** One entry per dispatch attempt (newest last), bounded; cleared by reset().
   * Hook-local, not read from the session log, so it is not subject to the
   * log's entry cap. */
  readonly diagnostics: readonly ItemDiagnostic[];
}

interface GradeRunItemResponse {
  sourceIndex: number;
  result: GradeResult;
}

async function postGradeRunItem(request: GradeRunItemRequestBody, sink?: ItemDiagnosticSink): Promise<GradeResult> {
  const res = await fetch("/api/grade-run-item", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...request, entry: stripUnneededRawBase64(request.entry) }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<GradeRunItemResponse> & { error?: string; videoFailure?: unknown; diagnostic?: unknown };
  if (sink) {
    sink.httpStatus = res.status;
    sink.diagnostic = body.diagnostic;
  }
  if (!res.ok || !body.result) {
    // A typed `videoFailure` rides the error so the driver records the class.
    throw gradeFailureFromBody(body);
  }
  return body.result;
}

export function useContinuousGradingRun(params: UseContinuousGradingRunParams): UseContinuousGradingRunResult {
  const { provider, maxEntries = DEFAULT_MAX_ENTRIES, commentSplit } = params;
  const dispatchItem = params.dispatchItem ?? postGradeRunItem;
  const ingestZip = params.ingestZip ?? ingestStoragedZip;
  const prepareVideo = params.prepareVideo ?? postPrepareVideo;
  const classifyRecording = params.classifyRecording ?? postClassifyRecording;
  const prepareSingleFile = params.prepareSingleFile ?? postPrepareSingleFile;

  const headerRef = useRef<ResolvedRunHeader | null>(null);
  const assignmentInstructionsRef = useRef("");
  const harshnessRef = useRef<GradeHarshness>("balanced");
  const feedbackWordTargetRef = useRef<number | undefined>(undefined);
  const applyNamingDeductionRef = useRef(true);
  const applyLengthDeductionRef = useRef(false);
  const arrivedRef = useRef<ArrivedItemResult[]>([]);
  const queueRef = useRef<GradeRunItemRequestBody[]>([]);
  const inFlightRef = useRef(0);
  const dispatchedCountRef = useRef(0);
  const ordinalRef = useRef(0);
  const canvasUrlRef = useRef("");
  const sessionIdRef = useRef(0);
  const takenLabelsRef = useRef<Set<string>>(new Set());
  const retainedBodiesRef = useRef<Map<number, GradeRunItemRequestBody>>(new Map());
  const repositoryRevisionsRef = useRef(new Map<number, number>());
  const repositoryOriginalsRef = useRef(new Map<number, GradeRunItemRequestBody>());
  const pendingRef = useRef<Set<number>>(new Set());
  const inFlightIndexRef = useRef<Set<number>>(new Set());
  // ZIP-CLASS-VS-SINGLE: the latest zip ingest's classification (per-ingest;
  // a non-zip submit leaves it untouched). Stamped onto every rebuilt run.
  const classificationRef = useRef<SubmissionZipClassification | null>(null);
  // Multi-submission recordings held for confirm, oldest first (a batch of
  // videos can hold several). The state mirrors the head for the confirm card.
  const pendingSplitsRef = useRef<PendingSplit[]>([]);
  // Per-row dispatch bookkeeping for the diagnostics: why the next dispatch
  // happens (first / retry / regrade), when it was queued, attempts so far.
  const dispatchMetaRef = useRef<Map<number, { trigger: GradeTrigger; queuedAtMs: number; attempts: number }>>(new Map());

  const [headerState, setHeaderState] = useState<HeaderState>("unset");
  const [results, setResults] = useState<readonly GradeResult[]>([]);
  const [run, setRun] = useState<GradingRun | null>(null);
  const [dispatchedCount, setDispatchedCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [inFlight, setInFlight] = useState(0);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [unresolvedStudents, setUnresolvedStudents] = useState<ReadonlySet<string>>(new Set());
  const [ingestLedger, setIngestLedger] = useState<IngestLedger | null>(null);
  const [pendingStudents, setPendingStudents] = useState<ReadonlySet<string>>(new Set());
  const [inFlightStudents, setInFlightStudents] = useState<readonly string[]>([]);
  const [pendingSplit, setPendingSplit] = useState<PendingSplit | null>(null);
  const [classifyingRecording, setClassifyingRecording] = useState(false);
  const [diagnostics, setDiagnostics] = useState<readonly ItemDiagnostic[]>([]);
  const [repositoryStudents, setRepositoryStudents] = useState<readonly RepositorySessionStudent[]>([]);

  const markQueued = (sourceIndex: number, trigger: GradeTrigger) => {
    const attempts = dispatchMetaRef.current.get(sourceIndex)?.attempts ?? 0;
    dispatchMetaRef.current.set(sourceIndex, { trigger, queuedAtMs: chatSeamNowMs(), attempts });
  };

  // Presentation only: mirrors pendingRef / inFlightIndexRef as student labels.
  const publishPending = () => {
    setRepositoryStudents(listRepositoryStudents("grading-chat-" + sessionIdRef.current, retainedBodiesRef.current));
    const labelOf = (index: number) => retainedBodiesRef.current.get(index)?.entry.student;
    const pending = new Set<string>();
    for (const index of pendingRef.current) {
      const label = labelOf(index);
      if (label !== undefined) pending.add(label);
    }
    const active: string[] = [];
    for (const index of inFlightIndexRef.current) {
      const label = labelOf(index);
      if (label !== undefined) active.push(label);
    }
    setPendingStudents(pending);
    setInFlightStudents(active);
  };

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
        submissionClassification: classificationRef.current ?? undefined,
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
  // Last-wins by sourceIndex: a retried row replaces its failed arrival so
  // completedCount never double-counts (W1-R2).
  const recordArrival = (arrived: ArrivedItemResult) => {
    repositoryRevisionsRef.current.set(arrived.sourceIndex, (repositoryRevisionsRef.current.get(arrived.sourceIndex) ?? 0) + 1);
    const at = arrivedRef.current.findIndex((a) => a.sourceIndex === arrived.sourceIndex);
    if (at >= 0) arrivedRef.current[at] = arrived;
    else arrivedRef.current.push(arrived);
  };

  // Records one dispatch attempt: the log entry (the existing grade_item entry,
  // now carrying `detail`; exactly one per dispatch) and the view-model row.
  // Callers pass an already-built detail and wrap this in safeDiagnostic.
  const recordItem = (request: GradeRunItemRequestBody, startedAtMs: number, failureClass: ChatSeamFailureClass | null, detail: ChatDetailBag) => {
    const decision = decideChatSeamDiagnostic({ operation: "grade_item", startedAtMs, settledAtMs: chatSeamNowMs(), failureClass });
    if (decision) {
      recordSessionDiagnosticEntry({
        at: new Date().toISOString(),
        surface: "grading",
        operation: decision.operation,
        label: GRADING_DIAGNOSTIC_OPERATION_LABELS.grade_item,
        outcome: decision.outcome,
        durationMs: decision.durationMs,
        error: decision.error,
        detail,
      });
    }
    const row: ItemDiagnostic = {
      sourceIndex: request.sourceIndex,
      rowLabel: "Row " + (request.sourceIndex + 1),
      label: request.entry.student,
      outcome: failureClass === null ? "graded" : "failed",
      detail,
    };
    setDiagnostics((prev) => [...prev, row].slice(-ITEM_DIAGNOSTIC_CAP));
  };

  const pump = () => {
    while (inFlightRef.current < INCREMENTAL_CONCURRENCY && queueRef.current.length > 0) {
      const request = queueRef.current.shift()!;
      inFlightRef.current += 1;
      setInFlight(inFlightRef.current);
      inFlightIndexRef.current.add(request.sourceIndex);
      publishPending();

      const itemStartedAtMs = chatSeamNowMs();
      const sink: ItemDiagnosticSink = {};
      const meta = dispatchMetaRef.current.get(request.sourceIndex);
      const attempt = (meta?.attempts ?? 0) + 1;
      const trigger = meta?.trigger ?? "first";
      const waitMs = Math.max(0, itemStartedAtMs - (meta?.queuedAtMs ?? itemStartedAtMs));
      dispatchMetaRef.current.set(request.sourceIndex, { trigger, queuedAtMs: meta?.queuedAtMs ?? itemStartedAtMs, attempts: attempt });
      const attemptSignals = (): GradeItemClientSignals => ({
        item: request.sourceIndex + 1,
        attempt,
        trigger,
        waitMs,
        inflight: inFlightRef.current,
        queued: queueRef.current.length,
        httpStatus: sink.httpStatus,
        clientMs: chatSeamNowMs() - itemStartedAtMs,
      });
      dispatchItem(request, sink)
        .then((result) => {
          // Restore the FULL submittedFiles (the POST carried the stripped copy)
          // so the Files-UI download of non-visual files survives.
          const full = retainedBodiesRef.current.get(request.sourceIndex) ?? request;
          recordArrival({
            sourceIndex: request.sourceIndex,
            result: { ...result, submittedFiles: full.entry.submittedFiles },
          });
          // Everything below recordArrival is diagnostics only: a throw here would
          // fall into .catch and OVERWRITE the graded row (last-wins by sourceIndex).
          // The detail is produced INSIDE the guard, before it is handed on.
          safeDiagnostic(() => {
            const detail = buildGradeItemDetail(
              { ...attemptSignals(), ...resultSignals(result, full, headerRef.current?.criteriaNames.length ?? 0) },
              sink.diagnostic
            );
            recordItem(request, itemStartedAtMs, result.ungraded ? "grade failed" : null, detail);
          });
        })
        .catch((err) => {
          safeDiagnostic(() => {
            const detail = buildGradeItemDetail({ ...attemptSignals(), failure: clientFailureClass(sink) }, sink.diagnostic);
            recordItem(request, itemStartedAtMs, classifyChatSeamFailure(err) === "timed out" ? "timed out" : "grade failed", detail);
          });
          // VIDEO-GRADING W4: the typed class (too large / unsupported format /
          // timed out / model rejected ...), recorded as its own entry.
          const videoFailure = videoFailureOf(err);
          if (videoFailure !== null) {
            recordVideoSettled({ startedAtMs: itemStartedAtMs, settledAtMs: chatSeamNowMs(), failure: videoFailure });
          }
          recordArrival({
            sourceIndex: request.sourceIndex,
            result: classifyItemFailure(request.sourceIndex, request.entry, err),
          });
        })
        .finally(() => {
          pendingRef.current.delete(request.sourceIndex);
          inFlightIndexRef.current.delete(request.sourceIndex);
          inFlightRef.current -= 1;
          setInFlight(inFlightRef.current);
          publishPending();
          setCompletedCount(arrivedRef.current.length);
          rebuildRun();
          pump();
        });
    }
  };

  // The admit loop shared by submit() and the recording-split settle: each
  // entry gets a session-UNIQUE display (assign-then-add against the taken set,
  // so two entries can never share a gradebook row), a retained body and a slot
  // in the queue. `windows` is index-aligned and carries a split segment's grade
  // window onto its request body.
  const enqueueAdmitted = (
    header: ResolvedRunHeader,
    admitted: readonly StudentSubmissionEntry[],
    opts: { pointsPossible: number | null; submitLabel: string; windows?: readonly RecordingWindow[] }
  ) => {
    const flaggedNow: string[] = [];
    admitted.forEach((rawEntry, index) => {
      const sourceIndex = dispatchedCountRef.current;
      dispatchedCountRef.current += 1;
      // Cross-event duplicate display names: the first claimant keeps its
      // name, later ones get " (2)", " (3)" so row identity stays unique.
      const baseStudent = opts.submitLabel.length > 0 ? opts.submitLabel : rawEntry.student;
      const label = assignUnclaimedLabel(baseStudent, takenLabelsRef.current);
      takenLabelsRef.current.add(label);
      const entry = label === rawEntry.student ? rawEntry : { ...rawEntry, student: label };
      // A labelled row is NEVER flagged: the instructor already named it.
      if (rawEntry.studentNameSource === "unresolved" && opts.submitLabel === "") flaggedNow.push(label);
      const window = opts.windows?.[index];
      const body: GradeRunItemRequestBody = {
        sourceIndex,
        entry,
        assignmentInstructions: assignmentInstructionsRef.current,
        rubric: header.effectiveRubric,
        provider,
        pointsPossible: opts.pointsPossible,
        ...(commentSplit ? { commentSplit: true } : {}),
        ...(harshnessRef.current !== "balanced" ? { harshness: harshnessRef.current } : {}),
        ...(feedbackWordTargetRef.current !== undefined ? { feedbackWordTarget: feedbackWordTargetRef.current } : {}),
        ...(applyNamingDeductionRef.current === false ? { applyNamingDeduction: false } : {}),
        ...(applyLengthDeductionRef.current === true ? { applyLengthDeduction: true } : {}),
        ...(window ? { gradeWindowSec: { startSec: window.startSec, endSec: window.endSec } } : {}),
      };
      retainedBodiesRef.current.set(sourceIndex, body);
      pendingRef.current.add(sourceIndex);
      queueRef.current.push(body);
      markQueued(sourceIndex, "first");
    });
    setDispatchedCount(dispatchedCountRef.current);
    publishPending();
    if (flaggedNow.length > 0) {
      setUnresolvedStudents((prev) => new Set([...prev, ...flaggedNow]));
    }
    pump();
  };

  const beginSession = async (sessionParams: { assignmentInstructions: string; rubric: string; harshness?: GradeHarshness; feedbackWordTarget?: number; applyNamingDeduction?: boolean; applyLengthDeduction?: boolean }) => {
    // Idempotent: a header already resolved for this session is a no-op, so
    // a second call (e.g. from every submit()) never re-spends a
    // generateRubric model call.
    if (headerRef.current) return { kind: "ready" as const };

    setHeaderState("resolving");
    const headerStartedAtMs = chatSeamNowMs();
    const header = await resolveChatRunHeaderAction(sessionParams.assignmentInstructions, sessionParams.rubric, provider);
    recordChatSeamSettled({
      operation: "resolve_header",
      startedAtMs: headerStartedAtMs,
      failureClass: header.kind === "refused" ? classifyChatSeamFailure(header.error) : null,
    });
    if (header.kind === "refused") {
      setHeaderState("refused");
      setSessionError(header.error);
      return { kind: "refused" as const, reason: header.error };
    }

    headerRef.current = header;
    assignmentInstructionsRef.current = sessionParams.assignmentInstructions;
    harshnessRef.current = sessionParams.harshness ?? "balanced";
    feedbackWordTargetRef.current = sessionParams.feedbackWordTarget;
    applyNamingDeductionRef.current = sessionParams.applyNamingDeduction ?? true;
    applyLengthDeductionRef.current = sessionParams.applyLengthDeduction ?? false;
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
    let canvasUrlToPin: string | null = null;
    // BULK-ZIP BW2: students the ingest route skipped (named reason each),
    // reported on the outcome so nothing is dropped silently.
    // ZIP-CLASS-VS-SINGLE: held until every refusal check has passed, so a
    // refused zip never overwrites a prior ingest's badge.
    let zipClassification: SubmissionZipClassification | undefined;
    let ingestSkipped: readonly { readonly student: string; readonly reason: string }[] = [];

    if (input.kind === "storaged-zip") {
      // R4: a reset while the zip is being prepared must not spend grading
      // calls on a ghost run, so the session is captured before the await.
      const sessionAtStart = sessionIdRef.current;
      const collected: StudentSubmissionEntry[] = [];
      let ingest: IngestOutcome;
      const classifyStartedAtMs = chatSeamNowMs();
      try {
        ingest = await ingestZip(input.storagePath, provider, (entry) => collected.push(entry));
      } catch {
        // ingestStoragedZip never throws; this guards an injected replacement.
        ingest = { kind: "refused", reason: "The zip could not be prepared." };
      }
      if (ingest.kind === "refused") {
        if (ingest.videoFailure) {
          recordVideoSettled({ startedAtMs: classifyStartedAtMs, settledAtMs: chatSeamNowMs(), failure: ingest.videoFailure });
        } else {
          // AC-14(a): a non-video ingest refusal used to record nothing.
          const refusedReason = ingest.reason;
          safeDiagnostic(() =>
            recordPrepareDetail({ startedAtMs: classifyStartedAtMs, rawReason: refusedReason, signals: { inputKind: "zip-storage", stage: "prepare", transport: "storage" } })
          );
        }
        return { kind: "refused", reason: ingest.reason };
      }
      if (sessionIdRef.current !== sessionAtStart) {
        return { kind: "refused", reason: "The session was reset while the zip was being prepared. Nothing was graded." };
      }
      ingestSkipped = ingest.ledger.skipped;
      // Retained structurally (skipped AND unreadable files) so it outlives this
      // submit's transient outcome string.
      const completedLedger = ingest.ledger;
      setIngestLedger((prev) => mergeIngestLedgers(prev, completedLedger));
      zipClassification = completedLedger.classification;
      // VIDEO-GRADING W4: one prepare_video entry per counted in-zip video outcome.
      recordZipVideoOutcomes({
        outcomes: completedLedger.videoOutcomes,
        startedAtMs: classifyStartedAtMs,
        settledAtMs: chatSeamNowMs(),
      });
      recordClassifySettled({
        startedAtMs: classifyStartedAtMs,
        settledAtMs: chatSeamNowMs(),
        classification: zipClassification,
        at: new Date().toISOString(),
      });
      safeDiagnostic(() => recordPrepareDetail({ startedAtMs: classifyStartedAtMs, rawReason: null, signals: ledgerSignals(completedLedger) }));
      if (collected.length === 0 && ingestSkipped.length === 0) {
        safeDiagnostic(() => recordAdmitAnomaly({ failureClass: "refused", signals: { requested: 0, admitted: 0, cap: maxEntries, reason: "none-found" } }));
        return { kind: "refused", reason: `No student submissions were found in ${input.name}.` };
      }
      entries = collected;
    } else if (input.kind === "storaged-video") {
      // A reset while the video is being prepared must not spend a grading call
      // on a ghost run.
      const sessionAtStart = sessionIdRef.current;
      const prepareStartedAtMs = chatSeamNowMs();
      let prepared: Awaited<ReturnType<PrepareVideoFn>>;
      try {
        prepared = await prepareVideo(input.storagePath, input.name, input.label?.trim().slice(0, CHAT_LABEL_MAX_CHARS));
      } catch {
        // postPrepareVideo never throws; this guards an injected replacement.
        prepared = { kind: "refused", reason: "The video could not be prepared.", videoFailure: "upload failed" };
      }
      if (prepared.kind === "refused") {
        recordVideoSettled({ startedAtMs: prepareStartedAtMs, settledAtMs: chatSeamNowMs(), failure: prepared.videoFailure });
        return { kind: "refused", reason: prepared.reason };
      }
      recordVideoSettled({ startedAtMs: prepareStartedAtMs, settledAtMs: chatSeamNowMs(), failure: null });
      // RECORDING ONE-VS-MANY (dark behind RECORDING_SPLIT_ENABLED): ask once
      // whether the recording is one submission or several. Anything but a
      // clean "multiple" (single, failed, uncertain) grades as one, as today.
      let split: RecordingSplit = { kind: "single" };
      if (RECORDING_SPLIT_ENABLED && videoRefOf(prepared.entry) !== null) {
        setClassifyingRecording(true);
        try {
          split = await classifyVideoEntry({
            classify: classifyRecording,
            entry: prepared.entry,
            assignmentInstructions: assignmentInstructionsRef.current,
            rubric: header.effectiveRubric,
          });
        } finally {
          setClassifyingRecording(false);
        }
      }
      if (sessionIdRef.current !== sessionAtStart) {
        return { kind: "refused", reason: "The session was reset while the video was being prepared. Nothing was graded." };
      }
      if (split.kind === "multiple") {
        // HOLD: nothing is dispatched until the instructor confirms or declines.
        pendingSplitsRef.current.push({
          entry: prepared.entry,
          segments: split.segments,
          name: input.name,
          label: input.label?.trim().slice(0, CHAT_LABEL_MAX_CHARS) ?? "",
        });
        setPendingSplit(pendingSplitsRef.current[0]);
        return { kind: "accepted", entryCount: 0 };
      }
      entries = [prepared.entry];
    } else if (input.kind === "storaged-file") {
      // LARGE-SINGLE-FILE W2: a reset while the file is being prepared must not
      // spend a grading call on a ghost run.
      const sessionAtStart = sessionIdRef.current;
      const prepareStartedAtMs = chatSeamNowMs();
      let prepared: Awaited<ReturnType<PrepareSingleFileFn>>;
      try {
        prepared = await prepareSingleFile(input.storagePath, input.name, provider, input.label?.trim().slice(0, CHAT_LABEL_MAX_CHARS));
      } catch {
        // postPrepareSingleFile never throws; this guards an injected replacement.
        prepared = { kind: "refused", reason: "This file could not be prepared." };
      }
      // Counts-only: a fixed failure class, never the reason text or file name.
      safeDiagnostic(() =>
        recordPrepareDetail({
          startedAtMs: prepareStartedAtMs,
          rawReason: prepared.kind === "refused" ? prepared.reason : null,
          signals: { inputKind: "file-storage", stage: "prepare", transport: "storage", ext: intakeExtBucket({ name: input.name }) },
        })
      );
      if (prepared.kind === "refused") return { kind: "refused", reason: prepared.reason };
      if (sessionIdRef.current !== sessionAtStart) {
        return { kind: "refused", reason: "The session was reset while the file was being prepared. Nothing was graded." };
      }
      entries = [prepared.entry];
    } else if (input.kind === "text") {
      if (!input.content.trim()) {
        return { kind: "refused", reason: "This submission is empty." };
      }
      ordinalRef.current += 1;
      entries = [buildTextEntry({ label: input.label, content: input.content }, ordinalRef.current)];
    } else {
      if (input.kind === "url" && detectCanvasUrlKind(input.url) !== null) {
        // F3=A: one Canvas URL per session; a different one needs a new session.
        if (canvasUrlRef.current !== "" && canvasUrlRef.current !== input.url) {
          return {
            kind: "refused",
            reason: "This session is already tied to a different Canvas assignment. Start a new session to grade another.",
          };
        }
        canvasUrlToPin = input.url;
      }
      const formData = new FormData();
      if (input.kind === "composite") {
        if (input.parts.length === 0) {
          return { kind: "refused", reason: "Add at least one part to this submission." };
        }
        // One name owns the whole composite; a blank one defaults exactly as a
        // text submission's label does, so the student is never empty.
        const trimmedStudent = input.student.trim();
        ordinalRef.current += 1;
        const student = (trimmedStudent.length > 0 ? trimmedStudent : `Submission ${ordinalRef.current}`).slice(
          0,
          CHAT_LABEL_MAX_CHARS
        );
        formData.set("kind", "composite");
        formData.set("student", student);
        formData.set("partCount", String(input.parts.length));
        input.parts.forEach((part, index) => {
          formData.set(`part.${index}.kind`, part.kind);
          if (part.kind === "text") formData.set(`part.${index}.content`, part.content);
          else if (part.kind === "file") formData.set(`part.${index}.file`, part.file);
          else formData.set(`part.${index}.url`, part.url);
        });
      } else if (input.kind === "file") {
        formData.set("kind", "file");
        formData.set("file", input.file);
        // A typed label reaches the server's `labelled` flag, which suppresses
        // name inference (grading-chat-intake.ts reads formData.get("label")).
        formData.set("label", input.label?.trim().slice(0, CHAT_LABEL_MAX_CHARS) ?? "");
      } else {
        formData.set("kind", "url");
        formData.set("url", input.url);
        formData.set("label", input.label?.trim().slice(0, CHAT_LABEL_MAX_CHARS) ?? "");
      }
      formData.set("provider", provider);
      const prepareStartedAtMs = chatSeamNowMs();
      let outcome: Awaited<ReturnType<typeof prepareChatSubmissionAction>>;
      try {
        outcome =
          input.kind === "composite"
            ? await prepareCompositeSubmissionAction(formData)
            : await prepareChatSubmissionAction(formData);
      } catch (err) {
        recordChatSeamSettled({ operation: "prepare_submission", startedAtMs: prepareStartedAtMs, failureClass: "interrupted" });
        throw err;
      }
      safeDiagnostic(() =>
        recordPrepareDetail({
          startedAtMs: prepareStartedAtMs,
          rawReason: outcome.kind === "refused" ? outcome.reason : null,
          signals: intakeSignalsFor(input, outcome),
        })
      );
      if (outcome.kind === "refused") {
        return { kind: "refused", reason: outcome.reason };
      }
      entries = outcome.entries;
      pointsPossible = outcome.pointsPossible;
      zipClassification = outcome.classification;
      recordClassifySettled({
        startedAtMs: prepareStartedAtMs,
        settledAtMs: chatSeamNowMs(),
        classification: zipClassification,
        at: new Date().toISOString(),
      });
    }

    // RES-GC-8: clip to what the session ceiling still allows; refuse only
    // the remainder, never the whole event.
    const available = maxEntries - dispatchedCountRef.current;
    if (available <= 0) {
      safeDiagnostic(() => recordAdmitAnomaly({ failureClass: "cap exceeded", signals: { requested: entries.length, admitted: 0, clipped: entries.length, cap: maxEntries, reason: "cap-reached" } }));
      return {
        kind: "refused",
        reason: `This session has reached its ${maxEntries}-submission limit. Start a new session to grade more.`,
      };
    }
    if (canvasUrlToPin !== null) canvasUrlRef.current = canvasUrlToPin;
    // The storaged-zip and file/url/composite branches share this point. Assign
    // ONLY when a classification is present (NIT-A): a text/single-file/URL
    // submit must never wipe a prior zip's badge.
    if (zipClassification !== undefined) classificationRef.current = zipClassification;
    const admitted = entries.slice(0, available);
    const refusedCount = entries.length - admitted.length;

    // Optional submit-time label for a file or url submission. Applied ONLY
    // when the submission resolved to exactly one entry: a zip or a whole
    // Canvas assignment resolves to many, and one label must never collapse
    // distinct students. Blank/absent leaves the derived student untouched.
    const submitLabel =
      (input.kind === "file" || input.kind === "url" || input.kind === "storaged-video" || input.kind === "storaged-file") &&
      entries.length === 1
        ? (input.label?.trim().slice(0, CHAT_LABEL_MAX_CHARS) ?? "")
        : "";

    enqueueAdmitted(header, admitted, { pointsPossible, submitLabel });

    if (refusedCount > 0 || ingestSkipped.length > 0) {
      safeDiagnostic(() =>
        recordAdmitAnomaly({
          failureClass: null,
          signals: { requested: entries.length, admitted: admitted.length, clipped: refusedCount, skipped: ingestSkipped.length, cap: maxEntries, reason: refusedCount > 0 ? "cap-clipped" : "zip-skipped" },
        })
      );
      const skipNote =
        ingestSkipped.length > 0
          ? ` Skipped: ${ingestSkipped.map((s) => `${s.student} (${s.reason})`).join("; ")}.`
          : "";
      const clipNote =
        refusedCount > 0
          ? `Graded the first ${admitted.length} of ${entries.length} students in this submission; ` +
            `the session's ${maxEntries}-submission limit was reached. Start a new session to grade the rest.`
          : `Graded ${admitted.length} of ${admitted.length + ingestSkipped.length} students in this zip.`;
      return {
        kind: "partial",
        dispatchedCount: admitted.length,
        refusedCount: refusedCount + ingestSkipped.length,
        reason: clipNote + skipNote,
      };
    }
    return { kind: "accepted", entryCount: admitted.length };
  };

  // Resolves the OLDEST held recording: as one distinct row per segment
  // (split=true, each through the shared admit loop with its own window) or as
  // ONE whole-video row (split=false, today's path with its submit-time label).
  const settlePendingSplit = (split: boolean): SubmitOutcome => {
    const pending = pendingSplitsRef.current[0];
    const header = headerRef.current;
    if (!pending || !header) return { kind: "refused", reason: "There is no recording waiting to be graded." };
    const available = maxEntries - dispatchedCountRef.current;
    if (available <= 0) {
      safeDiagnostic(() => recordAdmitAnomaly({ failureClass: "cap exceeded", signals: { requested: split ? pending.segments.length : 1, admitted: 0, clipped: split ? pending.segments.length : 1, cap: maxEntries, reason: "cap-reached" } }));
      return {
        kind: "refused",
        reason: `This session has reached its ${maxEntries}-submission limit. Start a new session to grade more.`,
      };
    }
    pendingSplitsRef.current.shift();
    setPendingSplit(pendingSplitsRef.current[0] ?? null);
    const built = split ? buildSplitEntries(pending) : { entries: [pending.entry], windows: [] };
    const admitted = built.entries.slice(0, available);
    enqueueAdmitted(header, admitted, { pointsPossible: null, submitLabel: split ? "" : pending.label, windows: built.windows });
    const refusedCount = built.entries.length - admitted.length;
    safeDiagnostic(() =>
      recordSplitDecision({ decision: split ? "confirm" : "reject", segments: pending.segments.length, admitted: admitted.length, clipped: refusedCount })
    );
    if (refusedCount > 0) {
      return {
        kind: "partial",
        dispatchedCount: admitted.length,
        refusedCount,
        reason:
          `Graded the first ${admitted.length} of ${built.entries.length} submissions in this recording; ` +
          `the session's ${maxEntries}-submission limit was reached. Start a new session to grade the rest.`,
      };
    }
    return { kind: "accepted", entryCount: admitted.length };
  };
  const confirmRecordingSplit = () => settlePendingSplit(true);
  const rejectRecordingSplit = () => settlePendingSplit(false);

  const retry = (sourceIndex: number) => {
    const body = retainedBodiesRef.current.get(sourceIndex);
    if (!body || pendingRef.current.has(sourceIndex)) return;
    const arrived = arrivedRef.current.find((a) => a.sourceIndex === sourceIndex);
    if (!arrived || !arrived.result.ungraded) return;
    pendingRef.current.add(sourceIndex);
    queueRef.current.push(body);
    markQueued(sourceIndex, "retry");
    publishPending();
    pump();
  };

  // Unlike retry, works on an already-GRADED row. Resolves student -> sourceIndex
  // through the retained bodies (entry.student is the unique session label), then
  // re-dispatches that body; recordArrival overwrites the arrival in place.
  const regrade = (student: string) => {
    let sourceIndex = -1;
    for (const [idx, body] of retainedBodiesRef.current) {
      if (body.entry.student === student) {
        sourceIndex = idx;
        break;
      }
    }
    if (sourceIndex < 0 || pendingRef.current.has(sourceIndex)) return;
    const body = retainedBodiesRef.current.get(sourceIndex);
    if (!body) return;
    pendingRef.current.add(sourceIndex);
    queueRef.current.push(body);
    markQueued(sourceIndex, "regrade");
    publishPending();
    pump();
  };

  // Pending (queued or in flight) rows whose entry carries a video ref.
  const pendingVideoCount = (): number => {
    let count = 0;
    for (const sourceIndex of pendingRef.current) {
      const body = retainedBodiesRef.current.get(sourceIndex);
      if (body && body.entry.submittedFiles.some((file) => file.videoRef !== undefined)) count += 1;
    }
    return count;
  };

  const reset = () => {
    sessionIdRef.current += 1;
    canvasUrlRef.current = "";
    takenLabelsRef.current = new Set();
    retainedBodiesRef.current = new Map();
    repositoryRevisionsRef.current = new Map();
    repositoryOriginalsRef.current = new Map();
    pendingRef.current = new Set();
    inFlightIndexRef.current = new Set();
    classificationRef.current = null;
    pendingSplitsRef.current = [];
    dispatchMetaRef.current = new Map();
    headerRef.current = null;
    assignmentInstructionsRef.current = "";
    harshnessRef.current = "balanced";
    feedbackWordTargetRef.current = undefined;
    applyNamingDeductionRef.current = true;
    applyLengthDeductionRef.current = false;
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
    setUnresolvedStudents(new Set());
    setIngestLedger(null);
    setPendingStudents(new Set());
    setInFlightStudents([]);
    setPendingSplit(null);
    setClassifyingRecording(false);
    setDiagnostics([]);
    setRepositoryStudents([]);
  };

  return {
    repositoryAdapter: createContinuousRepositoryAdapter({ epoch: () => "grading-chat-" + sessionIdRef.current,
      bodies: retainedBodiesRef.current, arrived: arrivedRef.current, pending: pendingRef.current,
      revisions: repositoryRevisionsRef.current, rubricFingerprint: headerRef.current?.rubricFingerprint ?? "",
      originals: repositoryOriginalsRef.current,
      publish: () => { rebuildRun(); publishPending(); } }),
    repositoryStudents,
    beginSession,
    submit,
    reset,
    retry,
    regrade,
    canvasUrl: canvasUrlRef.current,
    pendingVideoCount,
    runKey: "grading-chat-" + sessionIdRef.current,
    sessionId: sessionIdRef.current,
    effectiveRubric: headerRef.current?.effectiveRubric ?? "",
    rubricFingerprint: headerRef.current?.rubricFingerprint ?? "",
    generatedRubric: headerRef.current?.generatedRubric,
    headerState,
    results,
    run,
    dispatchedCount,
    completedCount,
    inFlight,
    sessionError,
    unresolvedStudents,
    ingestLedger,
    pendingStudents,
    inFlightStudents,
    pendingSplit,
    classifyingRecording,
    confirmRecordingSplit,
    rejectRecordingSplit,
    diagnostics,
  };
}
