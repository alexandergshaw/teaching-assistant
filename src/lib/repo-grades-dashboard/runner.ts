import "server-only";

import { validateGithubOwnerRepo } from "@/lib/github-ref-name";
import { isGithubCommitSha } from "@/lib/github.repos";
import { evaluateRepoGrade, type RepoGradeResponse } from "@/lib/repo-grade-evaluator";
import { createGradeCallSink } from "@/lib/grade/grade-item-diagnostic";
import { parseEarnedPossibleScore } from "@/lib/grade/parsing";
import { isUngraded } from "@/lib/grade/types";
import { requireAppOwner } from "@/lib/supabase/auth";
import { table } from "@/lib/supabase/courses.row";
import type {
  RepoGradeClaimStatus, RepoGradeCourseConfig, RepoGradeFeedbackField, RepoGradeResultRecord,
} from "@/lib/supabase/types.repo-grades-dashboard";
import { discoverRepoGradeSources, type RepoGradeDiscovery } from "./discovery";
import { repoGradeDiscoveryEnabled } from "./discovery-mode";
import { repoGradeAdmissionMode, runWithRepoGradeAdmission } from "./admission";
import { restoreRepoGradeProfile, restoreRepoGradeRubric, type RepoGradeProfile } from "./profile";
import { readCurrentRepoGradeProfilesForOwner } from "./profile-store";
import type { RepoGradeStartupTarget } from "./scheduler";
import { unretainedRepoGradeFeedbackField, validRepoGradeCohortId, type RepoGradeAutomaticSettlement } from "./state";

const COURSE_COLUMNS = "github_org, repos, rubric_name, rubric_data, repo_module_pairing, student_repos";

type CoursePlan = {
  accountId: string;
  courseId: string;
  courseConfig: RepoGradeCourseConfig;
  discovery: RepoGradeDiscovery;
  folderSources: ReadonlyMap<string, string | null>;
};

/** The saved organization is the existing Repo Grades scope. Course codebases
 * and student mappings serve other callers and do not filter this inventory. */
export async function planRepoGradeCourse(accountId: string, courseId: string): Promise<CoursePlan | null> {
  const { data, error }: { data: RepoGradeCourseConfig | null; error: unknown } = await table().select(COURSE_COLUMNS)
    .eq("user_id", accountId).eq("id", courseId).maybeSingle();
  if (error) throw new Error("Repository grading course storage is unavailable");
  if (!data) return null;
  const organization = data.github_org?.trim();
  if (!organization || !repoGradeDiscoveryEnabled()) {
    const discovery: RepoGradeDiscovery = organization
      ? { status: "blocked", reason: "branch-aware-discovery-disabled" }
      : { status: "not-configured" };
    return { accountId, courseId, courseConfig: data, discovery, folderSources: new Map() };
  }
  const folderSources = await readCurrentRepoGradeProfilesForOwner(accountId, courseId);
  const discovery = await discoverRepoGradeSources({ organization, folderSources });
  return { accountId, courseId, courseConfig: data, discovery, folderSources };
}

type PinnedInput = { repo: string; folder: string; sourceCommit: string; profile: RepoGradeProfile; rubric: string; runCode: boolean };
type PinnedEvaluation = RepoGradeResponse | { knownFailure: true };

type AutomaticRuntime = {
  loadPreparedProfile(scope: {
    accountId: string; courseId: string; folder: string;
  }): Promise<{ profile: RepoGradeProfile; cohortId: string; receipt: unknown } | null>;
  evaluatePinned?: (input: PinnedInput) => Promise<PinnedEvaluation>;
};

const PINNED_EVALUATION_BUDGET_MS = 45_000;

/** Only the admitted runner invokes the real evaluator. The injected loader
 * must supply a previously prepared cohort, including its exact receipt. */
async function evaluatePinnedRepoGrade(input: PinnedInput): Promise<PinnedEvaluation> {
  const { repo, folder, sourceCommit, profile, rubric, runCode } = input;
  const [owner, name, extra] = repo.split("/");
  // The sandbox has its own timeout and result contract. A persisted opt-in
  // requires a coordinated execution policy before automatic dispatch.
  if (runCode || !owner || !name || extra !== undefined || repo.trim() !== repo
    || !validateGithubOwnerRepo(owner, name) || !isGithubCommitSha(sourceCommit)) return { knownFailure: true };

  const callSink = createGradeCallSink();
  const deadlineMs = Date.now() + PINNED_EVALUATION_BUDGET_MS;
  const signal = AbortSignal.timeout(PINNED_EVALUATION_BUDGET_MS);
  let dispatched = false;
  try {
    const response = await evaluateRepoGrade(
      { owner, repo: name }, profile.instructions, rubric, profile.provider, undefined, folder,
      profile.useReadmeInstructions, runCode, profile.applyNamingDeduction, sourceCommit,
      {
        automaticGrader: profile,
        modelExecution: {
          deadlineMs, signal,
          ...(profile.provider === "gemini" && {
            pinnedGemini: { model: profile.model, onDispatch: () => { dispatched = true; } },
          }),
        },
        callSink,
        markKnownFailure: () => undefined,
      },
    );
    if ("error" in response && !response.partial && !dispatched) return { knownFailure: true };
    if ("run" in response && profile.provider === "gemini") {
      if (!dispatched || (response.run.results.some(isUngraded) && callSink.failure && callSink.failure !== "unclassified")) {
        return { knownFailure: true };
      }
    }
    return response;
  } catch (error) {
    if (!dispatched) return { knownFailure: true };
    throw error;
  }
}

type RunOutcome = RepoGradeAutomaticSettlement["outcome"] | RepoGradeClaimStatus
  | "ungraded" | "runtime-unavailable" | "profile-unavailable" | "unsupported-target-branch" | "storage-unavailable";

type UnsettledEvaluation = { feedbackRetention?: RepoGradeFeedbackField; unretainedResult: RepoGradeResultRecord };
type RunResult =
  | { status: RunOutcome; feedbackRetention?: never; unretainedResult?: never }
  | { status: "partial"; feedbackRetention: RepoGradeFeedbackField; unretainedResult: RepoGradeResultRecord }
  | ({ status: "unknown" } & UnsettledEvaluation);

function classifyEvaluation(
  response: PinnedEvaluation,
  sourceCommit: string,
  repo: string,
  profile: RepoGradeProfile,
  rubric: string,
): RunResult & { settlement: RepoGradeAutomaticSettlement } {
  if ("knownFailure" in response) return { status: "failed", settlement: { outcome: "failed" } };
  if ("error" in response) {
    return response.partial && response.sourceCommit === sourceCommit
      ? { status: "partial", settlement: { outcome: "partial" } }
      : { status: "unknown", settlement: { outcome: "unknown" } };
  }
  if (response.sourceCommit !== sourceCommit || response.fullName !== repo) {
    return { status: "unknown", settlement: { outcome: "unknown" } };
  }
  if (response.digestTruncated !== false) return { status: "partial", settlement: { outcome: "partial" } };
  if (profile.useReadmeInstructions && !response.readmePath && !profile.instructions) {
    return { status: "unknown", settlement: { outcome: "unknown" } };
  }
  if ("noSubmission" in response) {
    return { status: "no-submission", settlement: { outcome: "no-submission", inputsComplete: true } };
  }
  if (response.rubric !== rubric) {
    return { status: "unknown", settlement: { outcome: "unknown" } };
  }
  const [grade] = response.run.results;
  if (response.run.results.length !== 1 || !grade) {
    return { status: "unknown", settlement: { outcome: "unknown" } };
  }
  if (grade.submissionTruncated) return { status: "partial", settlement: { outcome: "partial" } };
  if (isUngraded(grade)) {
    return grade.ungraded.kind === "not-attempted"
      ? { status: "ungraded", settlement: { outcome: "failed" } }
      : { status: "unknown", settlement: { outcome: "unknown" } };
  }
  const fraction = parseEarnedPossibleScore(grade.totalScore);
  if (!fraction || fraction.earned < 0 || fraction.earned > fraction.possible || grade.determination) {
    return { status: "ungraded", settlement: { outcome: "failed" } };
  }
  const result: RepoGradeResultRecord = {
    score: (fraction.earned / fraction.possible) * 100,
    feedback: grade.overallComment,
    sections: {
      strengths: grade.strengths, improvements: grade.improvements,
      resubmitNotice: grade.resubmitNotice, rawScore: grade.totalScore,
    },
    rubric: grade.rubricAreas,
  };
  const feedbackRetention = unretainedRepoGradeFeedbackField(result.feedback, result.sections, result.rubric);
  if (feedbackRetention) {
    return {
      status: "partial", feedbackRetention, unretainedResult: result,
      settlement: { outcome: "partial", feedbackRetention },
    };
  }
  return {
    status: "succeeded",
    settlement: {
      outcome: "succeeded",
      inputsComplete: true,
      result,
    },
  };
}

/** Server-internal only. The requested target must identify one exact folder
 * and pinned source in the captured inventory. Run at most one evaluation. */
export async function runRepoGradeTarget(
  plan: CoursePlan,
  { repo, folder, sourceRef, sha }: Pick<RepoGradeStartupTarget, "repo" | "folder" | "sourceRef" | "sha">,
  runtime?: AutomaticRuntime,
): Promise<RunResult> {
  const owner = await requireAppOwner();
  if (plan.accountId !== owner.id) return { status: "forbidden" };
  if (plan.discovery.status !== "scanned") return { status: "ungraded" };
  if (!plan.discovery.enumerationComplete) return { status: "partial" };
  const repoSources = plan.discovery.repos.filter((row) => row.repo.toLowerCase() === repo.toLowerCase());
  const sources = repoSources.filter((row) => row.sourceRef === sourceRef);
  if (sources.length > 1) return { status: "partial" };
  const [source] = sources;
  if (!source || source.repo !== repo) return { status: "ungraded" };
  if (source.status !== "ready") return { status: "partial" };
  if (source.sourceCommit !== sha || !source.folders.includes(folder)) return { status: "ungraded" };
  if (repoSources.some((row) => row !== source && row.status === "ready" && row.folders.includes(folder))) {
    return { status: "partial" };
  }
  const plannedRef = plan.folderSources.get(folder) ?? null;
  if (plannedRef !== null && plannedRef !== sourceRef) return { status: "configuration-changed" };
  if (!runtime || repoGradeAdmissionMode() !== "coordinated") return { status: "runtime-unavailable" };

  let prepared: Awaited<ReturnType<AutomaticRuntime["loadPreparedProfile"]>>;
  try {
    prepared = await runtime.loadPreparedProfile({ accountId: owner.id, courseId: plan.courseId, folder });
  } catch {
    return { status: "profile-unavailable" };
  }
  if (!prepared) return { status: "profile-unavailable" };
  const { cohortId } = prepared;
  const profile = restoreRepoGradeProfile(prepared.profile);
  if (!profile || !validRepoGradeCohortId(cohortId) || profile.accountId !== owner.id
    || profile.courseId !== plan.courseId || profile.folder !== folder) {
    return { status: "profile-unavailable" };
  }
  // The pinned evaluator currently skips the manual merge-target checks.
  if (profile.targetBranch) return { status: "unsupported-target-branch" };
  if (profile.sourceRef !== plannedRef) return { status: "configuration-changed" };
  const receipt = restoreRepoGradeRubric(profile, prepared.receipt);
  if (!receipt) return { status: "profile-unavailable" };

  let unsettled: UnsettledEvaluation | undefined;
  const admission = await runWithRepoGradeAdmission({
    mode: "automatic", courseId: plan.courseId, courseConfig: plan.courseConfig,
    repo: source.repo, folder, sourceRef: source.sourceRef, sha: source.sourceCommit,
    cohort: { cohortId, receipt },
  }, async () => {
    const evaluatePinned = runtime.evaluatePinned ?? evaluatePinnedRepoGrade;
    const evaluation = classifyEvaluation(await evaluatePinned({
      repo: source.repo, folder, sourceCommit: source.sourceCommit, profile, rubric: receipt.rubric,
      runCode: profile.runCode === true,
    }), source.sourceCommit, source.repo, profile, receipt.rubric);
    const { settlement, ...value } = evaluation;
    // Settlement can fail after the evaluator has already returned. Keep the
    // exact payload for this caller even if durability cannot be confirmed.
    if (value.unretainedResult) {
      unsettled = { unretainedResult: value.unretainedResult, feedbackRetention: value.feedbackRetention };
    } else if (settlement.outcome === "succeeded") {
      unsettled = { unretainedResult: settlement.result };
    }
    return { value, settlement };
  });
  if (admission.status === "completed") return admission.value;
  if (admission.status === "unknown" && unsettled) {
    return { status: "unknown", ...unsettled };
  }
  return { status: admission.status };
}
