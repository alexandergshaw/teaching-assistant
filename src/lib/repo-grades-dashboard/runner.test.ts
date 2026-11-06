import { beforeEach, describe, expect, it, vi } from "vitest";
import * as repoGradeEvaluator from "@/lib/repo-grade-evaluator";
import { GithubGradeSourceRateLimitError } from "@/lib/github-http-error";
import { requireAppOwner } from "@/lib/supabase/auth";
import { repoGradeAdmissionMode } from "./admission-mode";
import { beginRepoGradeDispatch, claimRepoGrade, settleRepoGrade } from "./ledger";
import { captureRepoGradeProfile, resolveRepoGradeRubric } from "./profile";
import { runRepoGradeTarget } from "./runner";

vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn() }));
vi.mock("./ledger", () => ({ beginRepoGradeDispatch: vi.fn(), claimRepoGrade: vi.fn(), settleRepoGrade: vi.fn() }));
vi.mock("./admission-mode", () => ({ repoGradeAdmissionMode: vi.fn() }));

const sha = "a".repeat(40);
const cohortId = "8d74ee61-463c-4b3f-af5d-5fc9b55023c1";
const courseConfig = {
  github_org: "school", repos: [], rubric_name: null, rubric_data: null, repo_module_pairing: null, student_repos: [],
};
const source = {
  status: "ready" as const, repo: "school/student", sourceRef: "main", sourceCommit: sha, folders: ["assignment"],
};
const target = { repo: source.repo, sourceRef: source.sourceRef, sha, folder: "assignment" };
const plan = {
  accountId: "owner", courseId: "course", courseConfig,
  discovery: { status: "scanned" as const, enumerationComplete: true, repos: [source] },
  folderSources: new Map<string, string | null>(),
};
const claim = { mode: "automatic" as const, generation: 7, token: "server-owned-token" };
const provenance = { sourceCommit: sha, fullName: source.repo, digestTruncated: false, readmePath: "assignment/README.md" };
const grade = {
  student: "student", totalScore: "0/10", rubricAreas: [], overallComment: "Feedback",
  strengths: "", improvements: "", resubmitNotice: "", feedback: "", mergedFileCount: 1, submittedFiles: [],
};
const graded = {
  ...provenance, rubric: "Frozen rubric",
  run: { results: [grade], rubricAreaNames: [], fullCreditChecklist: [] },
};

function fixture(runCode?: boolean, sourceRef?: string) {
  const saved = captureRepoGradeProfile(
    { accountId: "owner", courseId: "course", folder: "assignment" },
    { runCode, sourceRef },
    { provider: "gemini", model: "configured-model", graderVersion: "configured-version" },
  );
  if (saved.status !== "ready") throw new Error("Invalid fixture");
  const receipt = resolveRepoGradeRubric(saved.profile, graded.rubric);
  if (!receipt) throw new Error("Invalid rubric fixture");
  const runtime = {
    loadPreparedProfile: vi.fn<NonNullable<Parameters<typeof runRepoGradeTarget>[2]>["loadPreparedProfile"]>()
      .mockResolvedValue({ profile: saved.profile, receipt, cohortId }),
    evaluatePinned: vi.fn<NonNullable<NonNullable<Parameters<typeof runRepoGradeTarget>[2]>["evaluatePinned"]>>()
      .mockResolvedValue(graded),
  };
  return { runtime, receipt };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(repoGradeAdmissionMode).mockReturnValue("coordinated");
  vi.mocked(requireAppOwner).mockResolvedValue({ id: "owner", email: "owner@example.test" });
  vi.mocked(claimRepoGrade).mockResolvedValue({ status: "claimed", claim });
  vi.mocked(beginRepoGradeDispatch).mockResolvedValue(60_000);
  vi.mocked(settleRepoGrade).mockResolvedValue(true);
});
describe("repository grading dashboard runner", () => {
  it("blocks an injected runtime in default legacy mode", async () => {
    vi.mocked(repoGradeAdmissionMode).mockReturnValue("legacy-manual");
    const { runtime } = fixture();
    await expect(runRepoGradeTarget(plan, target, runtime)).resolves.toEqual({ status: "runtime-unavailable" });
    expect(runtime.loadPreparedProfile).not.toHaveBeenCalled();
    expect(claimRepoGrade).not.toHaveBeenCalled();
  });
  it("admits the immutable discovered target, sends the exact saved rubric and explicit false, and settles a genuine zero", async () => {
    const { runtime, receipt } = fixture();
    await expect(runRepoGradeTarget(plan, target, runtime)).resolves.toEqual({ status: "succeeded" });
    expect(claimRepoGrade).toHaveBeenCalledWith({
      mode: "automatic", courseId: "course", courseConfig, repo: source.repo, folder: "assignment",
      sourceRef: "main", sha, cohort: { cohortId, receipt },
    });
    expect(runtime.evaluatePinned).toHaveBeenCalledWith(expect.objectContaining({
      repo: source.repo, folder: "assignment", sourceCommit: sha, rubric: receipt.rubric, runCode: false,
    }));
    expect(vi.mocked(claimRepoGrade).mock.invocationCallOrder[0]).toBeLessThan(runtime.evaluatePinned.mock.invocationCallOrder[0]);
    expect(settleRepoGrade).toHaveBeenCalledWith(claim, {
      outcome: "succeeded", inputsComplete: true,
      result: {
        score: 0, feedback: "Feedback", rubric: [],
        sections: { strengths: "", improvements: "", resubmitNotice: "", rawScore: "0/10" },
      },
    });
  });

  it("settles oversize feedback as partial and returns the exact current-session text", async () => {
    const { runtime } = fixture();
    const improvements = `  https://example.test/lesson\r\n${"x".repeat(16001)}`;
    runtime.evaluatePinned.mockResolvedValue({
      ...graded, run: { ...graded.run, results: [{ ...grade, improvements }] },
    });
    await expect(runRepoGradeTarget(plan, target, runtime)).resolves.toEqual({
      status: "partial", feedbackRetention: "improvements",
      unretainedResult: {
        score: 0, feedback: "Feedback", rubric: [],
        sections: { strengths: "", improvements, resubmitNotice: "", rawScore: "0/10" },
      },
    });
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, {
      outcome: "partial", feedbackRetention: "improvements",
    });
  });

  it("only opts in to code execution with the saved matching course profile", async () => {
    const { runtime } = fixture(true);
    await runRepoGradeTarget(plan, target, runtime);
    expect(runtime.evaluatePinned).toHaveBeenCalledWith(expect.objectContaining({ runCode: true }));
  });

  it("skips evaluation when the saved profile changed after the cohort was frozen", async () => {
    const { runtime } = fixture();
    vi.mocked(claimRepoGrade).mockResolvedValue({ status: "configuration-changed" });
    await expect(runRepoGradeTarget(plan, target, runtime))
      .resolves.toEqual({ status: "configuration-changed" });
    expect(runtime.evaluatePinned).not.toHaveBeenCalled();
    expect(settleRepoGrade).not.toHaveBeenCalled();
  });

  it("blocks an unavailable or tampered rubric receipt before admission", async () => {
    const { runtime, receipt } = fixture();
    const prepared = await runtime.loadPreparedProfile({ accountId: "owner", courseId: "course", folder: "assignment" });
    if (!prepared) throw new Error("Invalid fixture");
    runtime.loadPreparedProfile.mockResolvedValue({ ...prepared, receipt: { ...receipt, rubric: "Different" } });
    await expect(runRepoGradeTarget(plan, target, runtime)).resolves.toEqual({ status: "profile-unavailable" });
    expect(claimRepoGrade).not.toHaveBeenCalled();
    expect(runtime.evaluatePinned).not.toHaveBeenCalled();
  });

  it("keeps incomplete inventory and missing folders outside admission", async () => {
    const { runtime } = fixture();
    const partialPlan = { ...plan, discovery: { ...plan.discovery, enumerationComplete: false } };
    await expect(runRepoGradeTarget(partialPlan, target, runtime)).resolves.toEqual({ status: "partial" });
    await expect(runRepoGradeTarget(plan, { ...target, folder: "missing" }, runtime)).resolves.toEqual({ status: "ungraded" });
    await expect(runRepoGradeTarget(plan, { ...target, repo: "other/repo" }, runtime)).resolves.toEqual({ status: "ungraded" });
    expect(runtime.loadPreparedProfile).not.toHaveBeenCalled();
    expect(claimRepoGrade).not.toHaveBeenCalled();
  });

  it("admits the captured folder, ref, and SHA even when that repo has another source row", async () => {
    const alternate = { ...source, sourceRef: "course/work", sourceCommit: "b".repeat(40) };
    const defaultSource = { ...source, folders: ["another"] };
    const alternateTarget = { ...target, sourceRef: alternate.sourceRef, sha: alternate.sourceCommit };
    const mixed = {
      ...plan,
      folderSources: new Map([[target.folder, alternate.sourceRef]]),
      discovery: { ...plan.discovery, repos: [defaultSource, alternate] },
    };
    const { runtime } = fixture(undefined, alternate.sourceRef);
    runtime.evaluatePinned.mockResolvedValue({ ...graded, sourceCommit: alternate.sourceCommit });

    await expect(runRepoGradeTarget(mixed, target, runtime)).resolves.toEqual({ status: "ungraded" });
    await expect(runRepoGradeTarget(mixed, { ...alternateTarget, sha }, runtime)).resolves.toEqual({ status: "ungraded" });
    await expect(runRepoGradeTarget(mixed, alternateTarget, runtime)).resolves.toEqual({ status: "succeeded" });
    expect(claimRepoGrade).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(alternateTarget));
    expect(runtime.evaluatePinned).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      sourceCommit: alternate.sourceCommit, folder: target.folder,
    }));
  });

  it("rejects ambiguous sources and a prepared profile whose saved ref was removed", async () => {
    const { runtime } = fixture();
    for (const conflictingSource of [source, { ...source, sourceCommit: "b".repeat(40) }, { ...source, sourceRef: "other" }]) {
      const ambiguous = { ...plan, discovery: { ...plan.discovery, repos: [source, conflictingSource] } };
      await expect(runRepoGradeTarget(ambiguous, target, runtime)).resolves.toEqual({ status: "partial" });
    }
    expect(runtime.loadPreparedProfile).not.toHaveBeenCalled();

    const planned = { ...plan, folderSources: new Map([[target.folder, target.sourceRef]]) };
    await expect(runRepoGradeTarget(planned, target, runtime)).resolves.toEqual({ status: "configuration-changed" });
    expect(claimRepoGrade).not.toHaveBeenCalled();
    expect(runtime.evaluatePinned).not.toHaveBeenCalled();
  });

  it("fences another account and blocks when production runtime is unavailable", async () => {
    const { runtime } = fixture();
    await expect(runRepoGradeTarget({ ...plan, accountId: "another" }, target, runtime))
      .resolves.toEqual({ status: "forbidden" });
    await expect(runRepoGradeTarget(plan, target)).resolves.toEqual({ status: "runtime-unavailable" });
    expect(runtime.loadPreparedProfile).not.toHaveBeenCalled();
    expect(claimRepoGrade).not.toHaveBeenCalled();
  });

  it("honors terminal and ambiguous-attempt ledger denials and fails closed on missing storage", async () => {
    const { runtime } = fixture();
    vi.mocked(claimRepoGrade).mockResolvedValueOnce({ status: "terminal" })
      .mockResolvedValueOnce({ status: "explicit-retry-required" })
      .mockRejectedValueOnce(new Error("RPC unavailable"));
    for (const status of ["terminal", "explicit-retry-required", "storage-unavailable"]) {
      await expect(runRepoGradeTarget(plan, target, runtime)).resolves.toEqual({ status });
    }
    expect(runtime.evaluatePinned).not.toHaveBeenCalled();
    expect(settleRepoGrade).not.toHaveBeenCalled();
  });

  it("dispatches a changed discovered commit after the old commit is terminal", async () => {
    const { runtime } = fixture();
    const nextSha = "b".repeat(40);
    const next = { ...plan, discovery: { ...plan.discovery, repos: [{ ...source, sourceCommit: nextSha }] } };
    vi.mocked(claimRepoGrade).mockResolvedValueOnce({ status: "terminal" });
    runtime.evaluatePinned.mockResolvedValueOnce({ ...graded, sourceCommit: nextSha });
    await expect(runRepoGradeTarget(plan, target, runtime)).resolves.toEqual({ status: "terminal" });
    await expect(runRepoGradeTarget(next, { ...target, sha: nextSha }, runtime)).resolves.toEqual({ status: "succeeded" });
    expect(runtime.evaluatePinned).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ sourceCommit: nextSha }));
  });

  it("settles complete no-submission independently from scores and withholds success on incomplete input", async () => {
    const { runtime } = fixture();
    runtime.evaluatePinned.mockResolvedValueOnce({ ...provenance, noSubmission: true, reason: "Empty assignment" })
      .mockResolvedValueOnce({ ...graded, digestTruncated: true });
    await expect(runRepoGradeTarget(plan, target, runtime)).resolves.toEqual({ status: "no-submission" });
    expect(settleRepoGrade).toHaveBeenLastCalledWith(claim, { outcome: "no-submission", inputsComplete: true });
    await expect(runRepoGradeTarget(plan, target, runtime)).resolves.toEqual({ status: "partial", reason: "digest-truncated" });
    expect(settleRepoGrade).toHaveBeenLastCalledWith(claim, { outcome: "partial" });
  });

  it("settles a source throttle with a safe reason before dispatch", async () => {
    const { runtime } = fixture();
    const evaluate = vi.spyOn(repoGradeEvaluator, "evaluateRepoGrade")
      .mockRejectedValueOnce(new GithubGradeSourceRateLimitError());
    try {
      await expect(runRepoGradeTarget(plan, target, { loadPreparedProfile: runtime.loadPreparedProfile }))
        .resolves.toEqual({ status: "partial", reason: "grading-source-rate-limited" });
      expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "partial" });
      expect(beginRepoGradeDispatch).not.toHaveBeenCalled();
    } finally {
      evaluate.mockRestore();
    }
  });

  it("only retains a pinned partial reason for the admitted source commit", async () => {
    const { runtime } = fixture();
    const error = { error: "An internal source read detail", partial: true as const, reason: "file-fetch-failed" as const };
    runtime.evaluatePinned.mockResolvedValueOnce({ ...error, sourceCommit: sha })
      .mockResolvedValueOnce({ ...error, sourceCommit: "b".repeat(40) });
    await expect(runRepoGradeTarget(plan, target, runtime)).resolves.toEqual({ status: "partial", reason: error.reason });
    await expect(runRepoGradeTarget(plan, target, runtime)).resolves.toEqual({ status: "unknown" });
  });

  it("settles an ambiguous evaluator response as unknown with a single dispatch", async () => {
    const { runtime } = fixture();
    runtime.evaluatePinned.mockImplementationOnce(async ({ beforeDispatch }) => {
      await beforeDispatch?.(new AbortController().signal);
      throw new Error("Lost response");
    });
    await expect(runRepoGradeTarget(plan, target, runtime)).resolves.toEqual({ status: "unknown" });
    expect(runtime.evaluatePinned).toHaveBeenCalledTimes(1);
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "unknown" });
  });

  it("keeps known failures, missing instructions and ambiguous returned errors out of successful history", async () => {
    const { runtime } = fixture();
    runtime.evaluatePinned.mockResolvedValueOnce({ knownFailure: true })
      .mockResolvedValueOnce({ ...graded, readmePath: undefined, readmeMissing: true })
      .mockResolvedValueOnce({ error: "Unclassified provider error" });
    for (const status of ["failed", "unknown", "unknown"]) {
      await expect(runRepoGradeTarget(plan, target, runtime)).resolves.toEqual({ status });
      expect(settleRepoGrade).toHaveBeenLastCalledWith(claim, { outcome: status });
    }
  });

  it("reports a typed not-attempted row as ungraded with no successful watermark", async () => {
    const { runtime } = fixture();
    runtime.evaluatePinned.mockResolvedValueOnce({
      ...graded,
      run: {
        ...graded.run,
        results: [{
          ...grade,
          ungraded: { kind: "not-attempted", stoppedBy: "run-deadline", sourceIndex: 0, student: grade.student, message: "Deadline" },
        }],
      },
    });
    await expect(runRepoGradeTarget(plan, target, runtime)).resolves.toEqual({ status: "ungraded" });
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "failed" });
  });

  it("reports unknown when a successful evaluation cannot be settled with its original claim", async () => {
    const { runtime } = fixture();
    vi.mocked(settleRepoGrade).mockResolvedValue(false);
    await expect(runRepoGradeTarget(plan, target, runtime)).resolves.toEqual({
      status: "unknown",
      unretainedResult: {
        score: 0, feedback: "Feedback", rubric: [],
        sections: { strengths: "", improvements: "", resubmitNotice: "", rawScore: "0/10" },
      },
    });
    expect(runtime.evaluatePinned).toHaveBeenCalledTimes(1);
    expect(settleRepoGrade).toHaveBeenCalledTimes(1);
  });

  it.each(["rejected", "transport failure"])("keeps exact oversized feedback after settlement %s", async (failure) => {
    const { runtime } = fixture();
    const strengths = `  https://example.test/lesson\r\n${"x".repeat(16001)}\t`;
    runtime.evaluatePinned.mockResolvedValue({
      ...graded, run: { ...graded.run, results: [{ ...grade, strengths }] },
    });
    if (failure === "rejected") vi.mocked(settleRepoGrade).mockResolvedValue(false);
    else vi.mocked(settleRepoGrade).mockRejectedValue(new Error("Ambiguous response"));
    await expect(runRepoGradeTarget(plan, target, runtime)).resolves.toEqual({
      status: "unknown", feedbackRetention: "strengths",
      unretainedResult: {
        score: 0, feedback: "Feedback", rubric: [],
        sections: { strengths, improvements: "", resubmitNotice: "", rawScore: "0/10" },
      },
    });
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, {
      outcome: "partial", feedbackRetention: "strengths",
    });
  });
});
