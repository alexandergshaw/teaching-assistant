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
import type { GradeHarshness, GradeResult, SubmittedFileInfo, GradingRun, GradingRunHeader, GradingRunTier2, StampedRubricText, StudentSubmissionEntry } from "@/lib/grade/types";
import { GRADING_FAILURE_PREFIX } from "@/lib/grade/types";
import { OFFICE_IMAGE_SOURCE_MIME_TYPES, graderNeedsFileBytes } from "@/lib/grade/constants";
import { UPLOAD_WIRE_BUDGET_BYTES, wireBytesForFile } from "@/lib/upload-budget";
// A39 incremental-fill W5 (design 6.4): reconcile.ts is a genuinely pure leaf
// as of W1's import move (./prompts, not ./rubric), so importing it here does
// NOT reach lib/supabase from this "use client"-rooted module - see
// canvas-client-boundary.runtime-graph.test.ts (F14), which already runs.
import { reconcileRun, unionAreaNames } from "@/lib/grade/reconcile";

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
  /** Opt-in did-right/did-wrong comment split; only a literal true opts in. */
  readonly commentSplit?: boolean;
  /** Grading harshness; type-only here, buildRunItemRequests leaves it unset like commentSplit. */
  readonly harshness?: GradeHarshness;
  /** Feedback word-count target; type-only here, buildRunItemRequests leaves it unset like harshness. */
  readonly feedbackWordTarget?: number;
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

/** True when the grader reads this file's bytes (visual types). One predicate drives estimate and strip. */
export function graderReadsFileBytes(mimeType: string | undefined): boolean {
  return graderNeedsFileBytes(mimeType) || (mimeType !== undefined && Object.hasOwn(OFFICE_IMAGE_SOURCE_MIME_TYPES, mimeType));
}

/**
 * The WIRE bytes the grader actually NEEDS for one entry: text content plus
 * rawBase64 ONLY for files whose bytes the model reads (graderReadsFileBytes:
 * graderNeedsFileBytes images/pdf PLUS the docx/pptx office types whose
 * embedded images inline-visuals extracts - graderNeedsFileBytes alone is
 * false for docx/pptx). Non-visual base64 is kept only for the Files-UI
 * download and is stripped from the POST by stripUnneededRawBase64, so this
 * estimate equals the stripped POST size (one predicate drives both).
 */
/**
 * File-level predicate shared by the estimate AND the strip. A file the
 * preview truncated (previewTruncated) keeps its bytes even when non-visual:
 * code execution (engine runSubmittedCode / code-run-selection) decodes
 * rawBase64 and skips a truncated candidate that has none.
 */
function fileNeedsRawBytes(file: SubmittedFileInfo): boolean {
  return graderReadsFileBytes(file.mimeType) || file.previewTruncated;
}

export function estimateNeededWireBytes(entry: StudentSubmissionEntry): number {
  let total = entry.content.length;
  for (const file of entry.submittedFiles) {
    if (file.rawBase64 && fileNeedsRawBytes(file)) total += file.rawBase64.length;
  }
  return total;
}

/** A copy of `entry` with rawBase64 removed from every file the grader does
 * not need bytes for; visual files keep their bytes. Never mutates `entry`. */
export function stripUnneededRawBase64(entry: StudentSubmissionEntry): StudentSubmissionEntry {
  return {
    ...entry,
    submittedFiles: entry.submittedFiles.map((file) => {
      if (!file.rawBase64 || fileNeedsRawBytes(file)) return file;
      const { rawBase64: _dropped, ...rest } = file;
      void _dropped;
      return rest;
    }),
  };
}

/**
 * RULING 116 (docs/ruling-116.md): the incremental route is a THINNER
 * surface than the whole-run path it would otherwise displace by default -
 * it does not go through gradeAction, so it has no RubricProvenance mount
 * (GradingTab.tsx has exactly one, on the whole-run branch), no rubric
 * auto-generation (grading.ts's `rubric.trim() ? rubric :
 * await generateRubric(...)` has no incremental-route counterpart, so a
 * blank rubric there grades against NO rubric at all), and no
 * blank-instructions refusal ("Please provide assignment instructions.").
 * None of that is being added here - fixing the incremental route's shape is
 * an owner decision that has not been made. This flag only keeps the
 * incremental route from being reached BY DEFAULT until that decision lands.
 * It is a module-private constant, not an env var, so it behaves identically
 * in every environment (local, preview, prod) rather than varying by
 * deployment config while the shape question is still open.
 */
export const INCREMENTAL_ROUTE_ENABLED = false;

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
 *
 * RULING 116: gated behind INCREMENTAL_ROUTE_ENABLED above. All of the
 * routing logic below stays exactly as it was - this is a reachability
 * change, not a revert - but with the flag off, every gemini request that
 * would otherwise have pooled now falls through to "whole-run" instead.
 */
export function routeGradingRun(fd: FormData, provider: LlmProvider): "whole-run" | "incremental" {
  if (!INCREMENTAL_ROUTE_ENABLED) return "whole-run";

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
 * The sourceIndex-ordered projection of arrived rows ONLY - a row never
 * moves, it only appears (RULING 30). A pending or not-yet-dispatched ticket
 * produces NO ROW AT ALL here, never a placeholder; the caller's own progress
 * line (done/total) carries the outstanding count instead.
 *
 * F22 (docs/a39-fill-waves.md W5): `totalTicketCount` is NOT a filter bound.
 * An arrived index at or above it is still kept - dropping it would silently
 * lose a row for an input this pure function cannot rule out, even though the
 * pool's own cursor cannot produce one today. Duplicate `sourceIndex` entries
 * are LAST-WINS, because `Map.set` overwrites - written down here rather than
 * left as an accident of the data structure.
 */
export function mergeArrivedResults(
  totalTicketCount: number,
  arrived: readonly ArrivedItemResult[]
): GradeResult[] {
  const bySourceIndex = new Map<number, GradeResult>();
  for (const item of arrived) bySourceIndex.set(item.sourceIndex, item.result);

  return [...bySourceIndex.keys()]
    .sort((a, b) => a - b)
    .map((sourceIndex) => bySourceIndex.get(sourceIndex)!);
}

/**
 * Maps a TRANSPORT failure for one item (a rejected fetch, a non-2xx
 * response, a malformed body) onto the same "grading-failed" shape
 * gradeStudentEntries already uses for an in-process throw
 * (engine.ts:257-279) - so one item's failure is an ordinary ungraded row,
 * isolated from every other item in the pool, never something that aborts
 * the run.
 *
 * F19's M4 clause (docs/a39-fill-waves.md W5): the failure row carries the
 * TICKET's own file list (`mergedFileCount`/`submittedFiles`) rather than a
 * hardcoded 0/[] - a transport failure at index 0 must not empty the header
 * that a downstream reader (e.g. a "files submitted" column) expects every
 * row to carry.
 */
export function classifyItemFailure(sourceIndex: number, entry: StudentSubmissionEntry, error: unknown): GradeResult {
  const message = error instanceof Error ? error.message : "The grading service did not respond.";
  const strengths = `${GRADING_FAILURE_PREFIX}${message}`;
  return {
    student: entry.student,
    overallComment: strengths,
    strengths,
    improvements: "",
    resubmitNotice: "",
    rubricAreas: [],
    totalScore: "",
    feedback: strengths,
    mergedFileCount: entry.mergedFileCount,
    submittedFiles: entry.submittedFiles,
    ungraded: { kind: "grading-failed", sourceIndex, student: entry.student, message: strengths },
  };
}

// A39 incremental-fill W5: the phase machine and run-assembly leaf behind
// "one machine, one mount, one door" (architecture 5.3, 6, 7.2). Pure/sync.

/** `idle` = no incremental run owns the display; selectDisplayRun/
 * selectRunKey special-case it so the whole-run path's reference comparison
 * stays byte-identical (architecture 5.7 obligation 1). */
export type IncrementalPhase = "idle" | "running" | "stopping" | "stopped" | "complete" | "refused";

/** The two phases at which rows are re-projected in DENSE (ascending
 * sourceIndex) order rather than arrival order (RULING 132). */
export function isTerminal(phase: IncrementalPhase): boolean {
  return phase === "complete" || phase === "stopped";
}

/**
 * RULING 134 on the client: the SAME union reconcile.ts's empty-canonical
 * fallback uses. Frozen `criteriaNames` when non-empty; otherwise a
 * first-seen union in ARRIVAL order while running (RULING 132, prefix-
 * stable - an existing column never moves or is renamed under a reader), or
 * over the dense rows once terminal (deterministic column order).
 */
export function canonicalColumns(
  header: Pick<Extract<GradingRunHeader, { kind: "ok" }>, "criteriaNames">,
  arrived: readonly ArrivedItemResult[],
  rows: readonly GradeResult[],
  phase: IncrementalPhase
): string[] {
  if (header.criteriaNames.length > 0) return [...header.criteriaNames];
  return isTerminal(phase) ? unionAreaNames(rows) : unionAreaNames(arrived.map((a) => a.result));
}

/** Assembles the ONE object the merged mount renders (architecture 6.1),
 * recomputed from RAW arrived rows every call - never from a previously
 * projected output (F21; reconcileRun's stray-fold cannot recover a dropped
 * score, 6.3). */
export interface BuildIncrementalRunParams {
  readonly header: Extract<GradingRunHeader, { kind: "ok" }>;
  readonly speedGraderUrl: string | null;
  readonly totalTicketCount: number;
  readonly arrived: readonly ArrivedItemResult[];
  readonly phase: IncrementalPhase;
  readonly tier2: GradingRunTier2 | null;
}

export function buildIncrementalRun(params: BuildIncrementalRunParams): GradingRun {
  const { header, speedGraderUrl, totalTicketCount, arrived, phase, tier2 } = params;
  const rows = mergeArrivedResults(totalTicketCount, arrived);
  const canonical = canonicalColumns(header, arrived, rows, phase);
  const projected = reconcileRun(rows, canonical);
  return {
    results: projected.results,
    rubricAreaNames: projected.rubricAreaNames,
    fullCreditChecklist: tier2?.fullCreditChecklist ?? [],
    sampleAnswer: tier2?.sampleAnswer,
    speedGraderUrl,
    // The header's plain `string` (possibly "" when unstamped) passing
    // through as the already-stamped BRANDED value - never a fresh string.
    rubricUsed: header.rubricUsed as StampedRubricText,
    rubricFingerprint: header.rubricFingerprint as StampedRubricText,
  };
}

/** Precedence between the two run objects (architecture 5.3) - total by
 * construction, a ternary rather than a switch with a default branch. */
export function selectDisplayRun(
  phase: IncrementalPhase,
  incrementalRun: GradingRun | null,
  wholeRun: GradingRun | null
): GradingRun | null {
  return phase === "idle" ? wholeRun : incrementalRun;
}

/** The run IDENTITY GradingResults.tsx's runResetKey compares (RULING 131,
 * architecture 5.7) - `undefined` for EXACTLY `idle`, so a whole-run
 * dispatch that failed to reset the phase would carry a stale incremental
 * key onto the new whole-run object and suppress the seven resets. */
export function selectRunKey(phase: IncrementalPhase, runId: number): string | undefined {
  return phase === "idle" ? undefined : `incremental-${runId}`;
}

// describeRunProgress and shouldShowEmptyState (F12) moved to
// ./runProgressCopy.ts (RES-P-4, docs/a39-fill-waves.md W5 3.1): this file
// would otherwise land at about 365 against its -le 300 bound. Neither is
// re-exported here - GradingTab.tsx imports the copy leaf directly.
