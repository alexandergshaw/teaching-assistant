/**
 * A39 wave 4c (docs/a39-waves.md 8.4.3, step S3): the PURE plan leaf behind
 * the incremental grading pool. Everything here is synchronous and
 * side-effect-free - no fetch, no FormData mutation, no React - so it can be
 * unit-tested without a render and shared, unchanged, between
 * `grading-incremental.ts` (the server action that builds a plan) and
 * `useIncrementalGradingRun.ts` (the client pool that executes it).
 *
 * Ordering safety (A44's identity constraint, carried by docs/a46-scope.md
 * section 3): every ticket carries a `sourceIndex` fixed at ticket-build
 * time, in source order, before any Route Handler call is ever dispatched.
 * `mergeArrivedResults` keys off that index, never off arrival order - "a
 * row never moves, it only appears" (a39-architecture.md, RULING 30).
 */
import type { LlmProvider } from "@/lib/llm";
import type { GradeResult, StudentSubmissionEntry } from "@/lib/grade/types";
import { GRADING_FAILURE_PREFIX } from "@/lib/grade/types";
import { UPLOAD_WIRE_BUDGET_BYTES, wireBytesForFile } from "@/lib/upload-budget";

/**
 * Matches BULK_GRADE_CONCURRENCY (repoGradesBulkGrade.ts:143) - the same
 * number, same provider, already running in production (docs/a46-scope.md
 * section 2.1). Not a hard provider ceiling; a deliberate compromise between
 * throughput and rate-limit pressure on both the model and GitHub sides.
 */
export const INCREMENTAL_CONCURRENCY = 3;

/**
 * The per-item WIRE-byte cap for one grade-run-item POST body. DERIVED from
 * upload-budget.ts's UPLOAD_WIRE_BUDGET_BYTES (branch A, docs/a39-waves.md
 * 8.4.3 step S3) rather than a bespoke constant: that module is the one
 * owner of "how big may a request body's encoded content be", and a second,
 * independently-set threshold is exactly the class of bug a9d9771's own
 * commit message names ("two thresholds that disagree is a bug nobody sees
 * until a real upload lands between them").
 */
export const ITEM_REQUEST_BYTE_BUDGET = UPLOAD_WIRE_BUDGET_BYTES;

export interface GradingItemTicket {
  readonly sourceIndex: number;
  readonly entry: StudentSubmissionEntry;
}

export interface IncrementalRunPlan {
  readonly tickets: readonly GradingItemTicket[];
  readonly assignmentInstructions: string;
  readonly rubric: string;
  readonly provider: LlmProvider;
  readonly pointsPossible: number | null;
}

/** The JSON body POSTed to one /api/grade-run-item call. */
export interface GradeRunItemRequestBody {
  readonly sourceIndex: number;
  readonly entry: StudentSubmissionEntry;
  readonly assignmentInstructions: string;
  readonly rubric: string;
  readonly provider: LlmProvider;
  readonly pointsPossible: number | null;
}

export interface ArrivedItemResult {
  readonly sourceIndex: number;
  readonly result: GradeResult;
}

/**
 * Estimates the WIRE bytes one StudentSubmissionEntry will occupy once
 * JSON-encoded into a grade-run-item request body: its text content plus
 * every attached file's already-base64 `rawBase64` string (base64 IS the
 * wire representation for those - no further inflation to apply, unlike
 * `wireBytesForFile`, which is for a FILE-bytes count that has not been
 * encoded yet).
 */
export function estimateEntryWireBytes(entry: StudentSubmissionEntry): number {
  let total = entry.content.length;
  for (const file of entry.submittedFiles) {
    if (file.rawBase64) total += file.rawBase64.length;
  }
  return total;
}

/**
 * PURE and SYNCHRONOUS (S4 step 2): decides whether a submitted form should
 * go through the incremental pool or the existing whole-run Server Action,
 * from nothing but the picked file's size and the selected provider -
 * before any network call, before prepareGradingRunAction ever runs.
 *
 * Only the Gemini path pools: "other" (the deterministic Grading API) and
 * "embedded" never call a model per student, so neither has the sequential-
 * loop-plus-sleep felt loss this whole wave exists to fix, and routing them
 * through a new transport would spend review budget on a path with nothing
 * to gain. A Canvas URL has no client-side file size to gate on - the
 * per-item budget is enforced server-side, in prepareGradingRunAction, once
 * the entries are actually extracted (W4-12 clause 2).
 */
export function routeGradingRun(fd: FormData, provider: LlmProvider): "whole-run" | "incremental" {
  if (provider !== "gemini") return "whole-run";

  const canvasUrl = ((fd.get("canvasUrl") as string | null) ?? "").trim();
  if (canvasUrl) return "incremental";

  const file = fd.get("studentSubmissions") as File | null;
  if (!file || file.size === 0) {
    // No file at all: let the existing whole-run refusal ("Please upload a
    // student submissions zip file.") produce its familiar message rather
    // than inventing a second copy of it on this path.
    return "whole-run";
  }
  if (wireBytesForFile(file.size) > ITEM_REQUEST_BYTE_BUDGET) return "whole-run";
  return "incremental";
}

/** Builds the per-item request bodies for every ticket in `plan`, in the
 * SAME order the tickets were built - callers still key results by
 * `sourceIndex`, never by array position, but there is no reason to shuffle
 * the dispatch order either. */
export function buildRunItemRequests(plan: IncrementalRunPlan): GradeRunItemRequestBody[] {
  return plan.tickets.map((ticket) => ({
    sourceIndex: ticket.sourceIndex,
    entry: ticket.entry,
    assignmentInstructions: plan.assignmentInstructions,
    rubric: plan.rubric,
    provider: plan.provider,
    pointsPossible: plan.pointsPossible,
  }));
}

/**
 * The dense, sourceIndex-ordered projection of arrived rows ONLY - a row
 * never moves, it only appears (RULING 30). A pending or not-yet-dispatched
 * ticket produces NO ROW AT ALL here, never a placeholder; the caller's own
 * progress line (done/total) carries the outstanding count instead.
 */
export function mergeArrivedResults(
  totalTicketCount: number,
  arrived: readonly ArrivedItemResult[]
): GradeResult[] {
  const bySourceIndex = new Map<number, GradeResult>();
  for (const item of arrived) bySourceIndex.set(item.sourceIndex, item.result);

  const dense: GradeResult[] = [];
  for (let i = 0; i < totalTicketCount; i += 1) {
    const result = bySourceIndex.get(i);
    if (result !== undefined) dense.push(result);
  }
  return dense;
}

/**
 * Maps a TRANSPORT failure for one item (a rejected fetch, a non-2xx
 * response, a malformed body) onto the same "grading-failed" shape
 * gradeStudentEntries already uses for an in-process throw
 * (engine.ts:257-279) - so one item's failure is an ordinary ungraded row,
 * isolated from every other item in the pool, never something that aborts
 * the run.
 */
export function classifyItemFailure(sourceIndex: number, student: string, error: unknown): GradeResult {
  const message = error instanceof Error ? error.message : "The grading service did not respond.";
  const strengths = `${GRADING_FAILURE_PREFIX}${message}`;
  return {
    student,
    overallComment: strengths,
    strengths,
    improvements: "",
    resubmitNotice: "",
    rubricAreas: [],
    totalScore: "",
    feedback: strengths,
    mergedFileCount: 0,
    submittedFiles: [],
    ungraded: { kind: "grading-failed", sourceIndex, student, message: strengths },
  };
}
