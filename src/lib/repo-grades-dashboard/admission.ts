import "server-only";

import type { RepoGradeClaimStatus } from "@/lib/supabase/types.repo-grades-dashboard";
import type { LlmExecutionPolicy } from "@/lib/llm";
import { createGradeCallSink, type GradeCallSink } from "@/lib/grade/grade-item-diagnostic";
import { BoundedRubricRefusalError } from "@/lib/grade/rubric";
import { claimRepoGrade, settleRepoGrade } from "./ledger";
import type { RepoGradeAutomaticSettlement, RepoGradeClaimRequest, RepoGradeManualSettlement } from "./state";
import { repoGradeAdmissionMode } from "./admission-mode";

export { repoGradeAdmissionMode } from "./admission-mode";

type ManualRequest = Extract<RepoGradeClaimRequest, { mode: "manual" }>;
type AutomaticRequest = Exclude<RepoGradeClaimRequest, ManualRequest>;
type Evaluation<T, Settlement> = { value: T; settlement: Settlement };
type AdmissionFailure = RepoGradeClaimStatus | "runtime-unavailable" | "storage-unavailable" | "unknown";
type AdmissionResult<T> = { status: "completed"; value: T } | { status: AdmissionFailure };

export function runWithRepoGradeAdmission<T>(
  request: ManualRequest, evaluate: () => Promise<Evaluation<T, RepoGradeManualSettlement>>,
): Promise<AdmissionResult<T>>;
export function runWithRepoGradeAdmission<T>(
  request: AutomaticRequest, evaluate: () => Promise<Evaluation<T, RepoGradeAutomaticSettlement>>,
): Promise<AdmissionResult<T>>;
export async function runWithRepoGradeAdmission<T>(
  request: RepoGradeClaimRequest, evaluate: () => Promise<Evaluation<T, RepoGradeAutomaticSettlement | RepoGradeManualSettlement>>,
): Promise<AdmissionResult<T>> {
  const mode = repoGradeAdmissionMode();
  if (mode === "legacy-manual" && request.mode === "manual") {
    return { status: "completed", value: (await evaluate()).value };
  }
  if (mode !== "coordinated") return { status: "runtime-unavailable" };

  let admission: Awaited<ReturnType<typeof claimRepoGrade>>;
  try {
    admission = await claimRepoGrade(request);
  } catch {
    return { status: "storage-unavailable" };
  }
  if (admission.status !== "claimed") return { status: admission.status };
  const { claim } = admission;
  if (claim.mode !== request.mode) return { status: "unknown" };

  let evaluation: Evaluation<T, RepoGradeAutomaticSettlement | RepoGradeManualSettlement> | undefined;
  try {
    evaluation = await evaluate();
  } catch {
    // A throw may mean the provider received the request but the reply was lost.
  }
  const settlement = evaluation?.settlement ?? { outcome: "unknown" };
  try {
    // The public overloads tie settlement to the request mode, which has
    // already been checked against the actual claim.
    const settled = claim.mode === "manual"
      ? await settleRepoGrade(claim, settlement as RepoGradeManualSettlement)
      : await settleRepoGrade(claim, settlement as RepoGradeAutomaticSettlement);
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

export async function runManualRepoGrade<T extends { run: { results: Array<{ ungraded?: { kind: string } }> } } | { error: string } | { noSubmission: true }>(
  repo: string, evaluate: (execution?: ManualRepoGradeExecution) => Promise<T>,
): Promise<T | { error: string }> {
  // Legacy ingestion accepts case-insensitive prefixes. Reserve the whole
  // repository so those scopes also conflict with exact automatic folders.
  const result = await runWithRepoGradeAdmission({ mode: "manual", repo }, async () => {
    const callSink = createGradeCallSink();
    let knownFailure = false;
    const execution = repoGradeAdmissionMode() === "coordinated"
      ? {
          modelExecution: { deadlineMs: Date.now() + 2 * 60_000 },
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
    if ("error" in value) outcome = knownFailure ? "failed" : "unknown";
    if ("run" in value) {
      const classifiedCall = callSink.calls.length > 0 && callSink.failure && callSink.failure !== "unclassified";
      // With a bounded policy, the engine rethrows unknown transport outcomes.
      // A classified response that produced a row is known to have finished.
      if (value.run.results.some((row) => row.ungraded && row.ungraded.kind !== "not-attempted")) {
        outcome = classifiedCall ? "failed" : "unknown";
      }
      else if (value.run.results.some((row) => row.ungraded)) outcome = "failed";
    }
    return { value, settlement: { outcome } };
  });
  if (result.status === "completed") return result.value;
  if (result.status === "busy") return { error: "Repository grading is already in progress or awaiting reconciliation." };
  if (result.status === "capacity") return { error: "Your repository grading capacity is currently full." };
  if (result.status === "unknown") return { error: "Repository grading could not be confirmed. Reconcile the attempt before retrying." };
  return { error: "Repository grading admission is unavailable." };
}
