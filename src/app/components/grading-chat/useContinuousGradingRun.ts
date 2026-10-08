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
import {
  resolveChatRunHeaderAction,
  prepareChatSubmissionAction,
  prepareCompositeSubmissionAction,
} from "@/app/actions/grading-chat-intake";
import { buildTextEntry, CHAT_LABEL_MAX_CHARS, type ChatSubmissionInput } from "./chatSubmissionIntake";
import type { GradeHarshness, GradeResult, GradingRun, GradingRunHeader, StudentSubmissionEntry } from "@/lib/grade/types";
import type { LlmProvider } from "@/lib/llm";
import { chatSeamNowMs, classifyChatSeamFailure, recordChatSeamSettled } from "./chatSeamDiagnostic";
import { detectCanvasUrlKind } from "@/lib/canvas-url";
import { assignUnclaimedLabel } from "@/lib/grade/utils";
import { ingestStoragedZip, type IngestLedger, type IngestOutcome } from "@/lib/grade/ndjson-ingest-parser";
import { mergeIngestLedgers } from "./ingestLedger";
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
  /** Injected storaged-zip ingest (BULK-ZIP BW2). Defaults to the real
   * never-throw NDJSON client for POST /api/grade-submission-zip. */
  readonly ingestZip?: (
    storagePath: string,
    provider: string,
    onEntry: (entry: StudentSubmissionEntry) => void
  ) => Promise<IngestOutcome>;
  /** The per-session entry ceiling (R4). Defaults to DEFAULT_MAX_ENTRIES. */
  readonly maxEntries?: number;
  /** Opt in to the did-right/did-wrong comment split on every grade request.
   * Absent = body byte-identical to before. */
  readonly commentSplit?: boolean;
}

export interface UseContinuousGradingRunResult {
  readonly beginSession: (params: {
    readonly assignmentInstructions: string;
    readonly rubric: string;
    /** Captured once at session start and frozen for the session; absent = balanced. */
    readonly harshness?: GradeHarshness;
    /** Captured once and frozen for the session; absent = no length directive. */
    readonly feedbackWordTarget?: number;
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
  const { provider, maxEntries = DEFAULT_MAX_ENTRIES, commentSplit } = params;
  const dispatchItem = params.dispatchItem ?? postGradeRunItem;
  const ingestZip = params.ingestZip ?? ingestStoragedZip;

  const headerRef = useRef<ResolvedRunHeader | null>(null);
  const assignmentInstructionsRef = useRef("");
  const harshnessRef = useRef<GradeHarshness>("balanced");
  const feedbackWordTargetRef = useRef<number | undefined>(undefined);
  const arrivedRef = useRef<ArrivedItemResult[]>([]);
  const queueRef = useRef<GradeRunItemRequestBody[]>([]);
  const inFlightRef = useRef(0);
  const dispatchedCountRef = useRef(0);
  const ordinalRef = useRef(0);
  const canvasUrlRef = useRef("");
  const sessionIdRef = useRef(0);
  const takenLabelsRef = useRef<Set<string>>(new Set());
  const retainedBodiesRef = useRef<Map<number, GradeRunItemRequestBody>>(new Map());
  const pendingRef = useRef<Set<number>>(new Set());

  const [headerState, setHeaderState] = useState<HeaderState>("unset");
  const [results, setResults] = useState<readonly GradeResult[]>([]);
  const [run, setRun] = useState<GradingRun | null>(null);
  const [dispatchedCount, setDispatchedCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [inFlight, setInFlight] = useState(0);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [unresolvedStudents, setUnresolvedStudents] = useState<ReadonlySet<string>>(new Set());
  const [ingestLedger, setIngestLedger] = useState<IngestLedger | null>(null);

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
  // Last-wins by sourceIndex: a retried row replaces its failed arrival so
  // completedCount never double-counts (W1-R2).
  const recordArrival = (arrived: ArrivedItemResult) => {
    const at = arrivedRef.current.findIndex((a) => a.sourceIndex === arrived.sourceIndex);
    if (at >= 0) arrivedRef.current[at] = arrived;
    else arrivedRef.current.push(arrived);
  };

  const pump = () => {
    while (inFlightRef.current < INCREMENTAL_CONCURRENCY && queueRef.current.length > 0) {
      const request = queueRef.current.shift()!;
      inFlightRef.current += 1;
      setInFlight(inFlightRef.current);

      const itemStartedAtMs = chatSeamNowMs();
      dispatchItem(request)
        .then((result) => {
          recordArrival({ sourceIndex: request.sourceIndex, result });
          recordChatSeamSettled({
            operation: "grade_item",
            startedAtMs: itemStartedAtMs,
            failureClass: result.ungraded ? "grade failed" : null,
          });
        })
        .catch((err) => {
          recordChatSeamSettled({
            operation: "grade_item",
            startedAtMs: itemStartedAtMs,
            failureClass: classifyChatSeamFailure(err) === "timed out" ? "timed out" : "grade failed",
          });
          recordArrival({
            sourceIndex: request.sourceIndex,
            result: classifyItemFailure(request.sourceIndex, request.entry, err),
          });
        })
        .finally(() => {
          pendingRef.current.delete(request.sourceIndex);
          inFlightRef.current -= 1;
          setInFlight(inFlightRef.current);
          setCompletedCount(arrivedRef.current.length);
          rebuildRun();
          pump();
        });
    }
  };

  const beginSession = async (sessionParams: { assignmentInstructions: string; rubric: string; harshness?: GradeHarshness; feedbackWordTarget?: number }) => {
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
    let ingestSkipped: readonly { readonly student: string; readonly reason: string }[] = [];

    if (input.kind === "storaged-zip") {
      // R4: a reset while the zip is being prepared must not spend grading
      // calls on a ghost run, so the session is captured before the await.
      const sessionAtStart = sessionIdRef.current;
      const collected: StudentSubmissionEntry[] = [];
      let ingest: IngestOutcome;
      try {
        ingest = await ingestZip(input.storagePath, provider, (entry) => collected.push(entry));
      } catch {
        // ingestStoragedZip never throws; this guards an injected replacement.
        ingest = { kind: "refused", reason: "The zip could not be prepared." };
      }
      if (ingest.kind === "refused") return { kind: "refused", reason: ingest.reason };
      if (sessionIdRef.current !== sessionAtStart) {
        return { kind: "refused", reason: "The session was reset while the zip was being prepared. Nothing was graded." };
      }
      ingestSkipped = ingest.ledger.skipped;
      // Retained structurally (skipped AND unreadable files) so it outlives this
      // submit's transient outcome string.
      const completedLedger = ingest.ledger;
      setIngestLedger((prev) => mergeIngestLedgers(prev, completedLedger));
      if (collected.length === 0 && ingestSkipped.length === 0) {
        return { kind: "refused", reason: `No student submissions were found in ${input.name}.` };
      }
      entries = collected;
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
      recordChatSeamSettled({
        operation: "prepare_submission",
        startedAtMs: prepareStartedAtMs,
        failureClass: outcome.kind === "refused" ? classifyChatSeamFailure(outcome.reason) : null,
      });
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
    if (canvasUrlToPin !== null) canvasUrlRef.current = canvasUrlToPin;
    const admitted = entries.slice(0, available);
    const refusedCount = entries.length - admitted.length;

    // Optional submit-time label for a file or url submission. Applied ONLY
    // when the submission resolved to exactly one entry: a zip or a whole
    // Canvas assignment resolves to many, and one label must never collapse
    // distinct students. Blank/absent leaves the derived student untouched.
    const submitLabel =
      (input.kind === "file" || input.kind === "url") && entries.length === 1
        ? (input.label?.trim().slice(0, CHAT_LABEL_MAX_CHARS) ?? "")
        : "";

    const flaggedNow: string[] = [];
    for (const rawEntry of admitted) {
      const sourceIndex = dispatchedCountRef.current;
      dispatchedCountRef.current += 1;
      // Cross-event duplicate display names: the first claimant keeps its
      // name, later ones get " (2)", " (3)" so row identity stays unique.
      const baseStudent = submitLabel.length > 0 ? submitLabel : rawEntry.student;
      const label = assignUnclaimedLabel(baseStudent, takenLabelsRef.current);
      takenLabelsRef.current.add(label);
      const entry = label === rawEntry.student ? rawEntry : { ...rawEntry, student: label };
      // A labelled row is NEVER flagged: the instructor already named it.
      if (rawEntry.studentNameSource === "unresolved" && submitLabel === "") flaggedNow.push(label);
      const body: GradeRunItemRequestBody = {
        sourceIndex,
        entry,
        assignmentInstructions: assignmentInstructionsRef.current,
        rubric: header.effectiveRubric,
        provider,
        pointsPossible,
        ...(commentSplit ? { commentSplit: true } : {}),
        ...(harshnessRef.current !== "balanced" ? { harshness: harshnessRef.current } : {}),
        ...(feedbackWordTargetRef.current !== undefined ? { feedbackWordTarget: feedbackWordTargetRef.current } : {}),
      };
      retainedBodiesRef.current.set(sourceIndex, body);
      pendingRef.current.add(sourceIndex);
      queueRef.current.push(body);
    }
    setDispatchedCount(dispatchedCountRef.current);
    if (flaggedNow.length > 0) {
      setUnresolvedStudents((prev) => new Set([...prev, ...flaggedNow]));
    }
    pump();

    if (refusedCount > 0 || ingestSkipped.length > 0) {
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

  const retry = (sourceIndex: number) => {
    const body = retainedBodiesRef.current.get(sourceIndex);
    if (!body || pendingRef.current.has(sourceIndex)) return;
    const arrived = arrivedRef.current.find((a) => a.sourceIndex === sourceIndex);
    if (!arrived || !arrived.result.ungraded) return;
    pendingRef.current.add(sourceIndex);
    queueRef.current.push(body);
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
    pump();
  };

  const reset = () => {
    sessionIdRef.current += 1;
    canvasUrlRef.current = "";
    takenLabelsRef.current = new Set();
    retainedBodiesRef.current = new Map();
    pendingRef.current = new Set();
    headerRef.current = null;
    assignmentInstructionsRef.current = "";
    harshnessRef.current = "balanced";
    feedbackWordTargetRef.current = undefined;
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
  };

  return {
    beginSession,
    submit,
    reset,
    retry,
    regrade,
    canvasUrl: canvasUrlRef.current,
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
  };
}
