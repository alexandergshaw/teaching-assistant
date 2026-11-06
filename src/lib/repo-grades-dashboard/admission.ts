import "server-only";

import type { RepoGradeClaimStatus } from "@/lib/supabase/types.repo-grades-dashboard";
import { LlmOutcomeUnknownError, type LlmExecutionPolicy } from "@/lib/llm";
import { SandboxExecutionRefusedError } from "@/lib/code-runner";
import { createGradeCallSink, type GradeCallSink } from "@/lib/grade/grade-item-diagnostic";
import { BoundedRubricRefusalError } from "@/lib/grade/rubric";
import { beginRepoGradeDispatch, claimRepoGrade, settleRepoGrade } from "./ledger";
import type { RepoGradeAutomaticSettlement, RepoGradeClaimRequest, RepoGradeManualSettlement } from "./state";
import { repoGradeAdmissionMode } from "./admission-mode";

export { repoGradeAdmissionMode } from "./admission-mode";

type ManualRequest = Extract<RepoGradeClaimRequest, { mode: "manual" }>;
type AutomaticRequest = Exclude<RepoGradeClaimRequest, ManualRequest>;
type Evaluation<T, Settlement> = { value: T; settlement: Settlement };
type AdmissionFailure = RepoGradeClaimStatus | "runtime-unavailable" | "storage-unavailable" | "unknown"
  | "pre-dispatch-failed" | "sandbox-refused" | "manual-paused";
type AdmissionResult<T> = { status: "completed"; value: T } | { status: AdmissionFailure };
type BeforeDispatch = NonNullable<LlmExecutionPolicy["beforeDispatch"]>;
type Evaluate<T, Settlement> = (beforeDispatch?: BeforeDispatch) => Promise<Evaluation<T, Settlement>>;

export function runWithRepoGradeAdmission<T>(
  request: ManualRequest, evaluate: Evaluate<T, RepoGradeManualSettlement>,
): Promise<AdmissionResult<T>>;
export function runWithRepoGradeAdmission<T>(
  request: AutomaticRequest, evaluate: Evaluate<T, RepoGradeAutomaticSettlement>,
): Promise<AdmissionResult<T>>;
export async function runWithRepoGradeAdmission<T>(
  request: RepoGradeClaimRequest, evaluate: Evaluate<T, RepoGradeAutomaticSettlement | RepoGradeManualSettlement>,
): Promise<AdmissionResult<T>> {
  const mode = repoGradeAdmissionMode();
  if (mode === "embedded-only" && request.mode === "manual") return { status: "manual-paused" };
  if (mode === "legacy-manual" && request.mode === "manual") {
    return { status: "completed", value: (await evaluate()).value };
  }
  if (mode !== "coordinated" && !(mode === "embedded-only" && request.mode === "automatic")) {
    return { status: "runtime-unavailable" };
  }

  let admission: Awaited<ReturnType<typeof claimRepoGrade>>;
  try {
    admission = await claimRepoGrade(request);
  } catch {
    return { status: "storage-unavailable" };
  }
  if (admission.status !== "claimed") return { status: admission.status };
  const { claim } = admission;
  if (claim.mode !== request.mode) return { status: "unknown" };

  let dispatch: Promise<number | null> | undefined;
  let dispatchRequestedAt = 0;
  let dispatchAllowed = false;
  let evaluating = true;
  const beforeDispatch: BeforeDispatch = async (signal) => {
    if (mode === "embedded-only") throw new Error("External grading dispatch is disabled for the Embedded startup pilot.");
    signal.throwIfAborted();
    if (!evaluating) throw new Error("Repository grading evaluation ended.");
    if (!dispatch) {
      dispatchRequestedAt = performance.now();
      dispatch = beginRepoGradeDispatch(claim);
    }
    // Each caller can stop waiting without cancelling the shared marker RPC.
    const interrupted = Promise.withResolvers<never>();
    const abort = () => interrupted.reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    try {
      const remainingMs = await Promise.race([dispatch, interrupted.promise]);
      signal.throwIfAborted();
      // Subtract the entire RPC round trip from the database's remaining lease.
      if (!evaluating || remainingMs === null || performance.now() - dispatchRequestedAt >= remainingMs) {
        throw new Error("Repository grading dispatch was denied.");
      }
      dispatchAllowed = true;
    } finally {
      signal.removeEventListener("abort", abort);
    }
  };
  let evaluation: Evaluation<T, RepoGradeAutomaticSettlement | RepoGradeManualSettlement> | undefined;
  let knownFailure: "pre-dispatch-failed" | "sandbox-refused" | undefined;
  try {
    evaluation = await evaluate(beforeDispatch);
  } catch (error) {
    if (error instanceof SandboxExecutionRefusedError) knownFailure = "sandbox-refused";
    else if (!dispatchAllowed && !(error instanceof LlmOutcomeUnknownError)) knownFailure = "pre-dispatch-failed";
  } finally {
    evaluating = false;
  }
  const settlement = evaluation?.settlement ?? { outcome: knownFailure ? "failed" : "unknown" } as const;
  try {
    // The public overloads tie settlement to the request mode, which has
    // already been checked against the actual claim.
    const settled = claim.mode === "manual"
      ? await settleRepoGrade(claim, settlement as RepoGradeManualSettlement)
      : await settleRepoGrade(claim, settlement as RepoGradeAutomaticSettlement);
    if (settled && knownFailure) return { status: knownFailure };
    if (settled && evaluation && settlement.outcome !== "unknown") {
      return { status: "completed", value: evaluation.value };
    }
  } catch {
    // A lost settlement response may have been committed. Do not repeat it.
  }
  return { status: "unknown" };
}

export type ManualRepoGradeExecution = {
  modelExecution: LlmExecutionPolicy;
  callSink: GradeCallSink;
  markKnownFailure: () => void;
};

export type ManualRepoGradeError = { error: string; admissionStatus?: "blocked" | "unknown" };

export const EMBEDDED_STARTUP_MANUAL_PAUSE = "Manual repository grading is paused during the Embedded startup pilot.";

export async function runManualRepoGrade<T extends { run: { results: Array<{ ungraded?: { kind: string } }> } } | { error: string } | { noSubmission: true }>(
  repo: string, evaluate: (execution?: ManualRepoGradeExecution) => Promise<T>,
): Promise<T | ManualRepoGradeError> {
  // Legacy ingestion accepts case-insensitive prefixes. Reserve the whole
  // repository so those scopes also conflict with exact automatic folders.
  const result = await runWithRepoGradeAdmission({ mode: "manual", repo }, async (beginDispatch) => {
    const callSink = createGradeCallSink();
    let knownFailure = false;
    let dispatched = false;
    const execution = beginDispatch
      ? {
          modelExecution: {
            deadlineMs: Date.now() + 2 * 60_000,
            beforeDispatch: async (signal: AbortSignal) => {
              await beginDispatch(signal);
              dispatched = true;
            },
          },
          callSink,
          markKnownFailure: () => { knownFailure = true; },
        }
      : undefined;
    let value: T | { error: string };
    try {
      value = await evaluate(execution);
    } catch (error) {
      if (!(execution && error instanceof BoundedRubricRefusalError)) throw error;
      knownFailure = true;
      value = { error: error.message };
    }
    let outcome: RepoGradeManualSettlement["outcome"] = knownFailure ? "failed" : "succeeded";
    if ("error" in value) outcome = knownFailure || !dispatched ? "failed" : "unknown";
    if ("run" in value) {
      const classifiedCall = callSink.calls.length > 0 && callSink.failure && callSink.failure !== "unclassified";
      // With a bounded policy, the engine rethrows unknown transport outcomes.
      // A classified response that produced a row is known to have finished.
      if (value.run.results.some((row) => row.ungraded && row.ungraded.kind !== "not-attempted")) {
        outcome = classifiedCall || !dispatched ? "failed" : "unknown";
      }
      else if (value.run.results.some((row) => row.ungraded)) outcome = "failed";
    }
    return { value, settlement: { outcome } };
  });
  if (result.status === "completed") return result.value;
  if (result.status === "manual-paused") return { error: EMBEDDED_STARTUP_MANUAL_PAUSE, admissionStatus: "blocked" };
  if (result.status === "busy") return { error: "Repository grading is already in progress or awaiting reconciliation.", admissionStatus: "blocked" };
  if (result.status === "capacity") return { error: "Your repository grading capacity is currently full.", admissionStatus: "blocked" };
  if (result.status === "pre-dispatch-failed") return { error: "Repository grading failed before dispatch." };
  if (result.status === "sandbox-refused") return { error: "The sandbox declined the code execution request." };
  if (result.status === "unknown") return { error: "Repository grading could not be confirmed. Reconcile the attempt before retrying.", admissionStatus: "unknown" };
  return { error: "Repository grading admission is unavailable.", admissionStatus: "blocked" };
}
