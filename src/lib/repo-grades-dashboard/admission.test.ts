import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runManualRepoGrade, runWithRepoGradeAdmission } from "./admission";
import { repoGradeAdmissionMode } from "./admission-mode";
import { beginRepoGradeDispatch, claimRepoGrade, settleRepoGrade } from "./ledger";
import { BoundedRubricRefusalError } from "@/lib/grade/rubric";
import { LlmOutcomeUnknownError, type LlmExecutionPolicy } from "@/lib/llm";
import { SandboxExecutionRefusedError } from "@/lib/code-runner";
import { ingestRepo } from "@/lib/github";
import { evaluateRepoGrade } from "@/lib/repo-grade-evaluator";

vi.mock("./ledger", () => ({ beginRepoGradeDispatch: vi.fn(), claimRepoGrade: vi.fn(), settleRepoGrade: vi.fn() }));
vi.mock("./admission-mode", () => ({ repoGradeAdmissionMode: vi.fn() }));
vi.mock("@/lib/github", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/github")>(),
  ingestRepo: vi.fn(),
}));

const manual = { mode: "manual", repo: "school/repo" } as const;
const automatic = {
  mode: "automatic" as const, repo: manual.repo, courseId: "course", folder: "module_01",
  sourceRef: "main", sha: "a".repeat(40),
  cohort: {
    cohortId: "8d74ee61-463c-4b3f-af5d-5fc9b55023c1",
    receipt: {
      accountId: "owner", courseId: "course", folder: "module_01",
      configurationFingerprint: "b".repeat(64), rubric: "Rubric",
      rubricFingerprint: "c".repeat(64), profileFingerprint: "d".repeat(64),
    },
  },
  courseConfig: {
    github_org: "school", repos: [], rubric_name: null, rubric_data: null,
    repo_module_pairing: null, student_repos: [],
  },
};
const complete = () => ({ value: "grade", settlement: { outcome: "failed" } as const });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(repoGradeAdmissionMode).mockReturnValue("coordinated");
  vi.mocked(beginRepoGradeDispatch).mockResolvedValue(60_000);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("repository grading admission", () => {
  it("pauses untracked manual requests only when the selected Embedded pilot can start", async () => {
    const actual = await vi.importActual<typeof import("./admission-mode")>("./admission-mode");
    vi.mocked(repoGradeAdmissionMode).mockImplementation(actual.repoGradeAdmissionMode);
    vi.stubEnv("REPO_GRADE_ADMISSION_MODE", undefined);
    vi.stubEnv("REPO_GRADE_DISCOVERY_ENABLED", undefined);
    vi.stubEnv("REPO_GRADE_EMBEDDED_CUTOVER_CONFIRMED", undefined);
    expect(repoGradeAdmissionMode()).toBe("legacy-manual");
    vi.stubEnv("REPO_GRADE_ADMISSION_MODE", "embedded-only");
    expect(repoGradeAdmissionMode()).toBe("legacy-manual");
    vi.stubEnv("REPO_GRADE_DISCOVERY_ENABLED", "true");
    expect(repoGradeAdmissionMode()).toBe("legacy-manual");
    vi.stubEnv("REPO_GRADE_EMBEDDED_CUTOVER_CONFIRMED", "true");
    vi.stubEnv("REPO_GRADE_DISCOVERY_ENABLED", "false");
    expect(repoGradeAdmissionMode()).toBe("legacy-manual");
    const manualGrade = vi.fn(async () => ({ noSubmission: true as const }));
    await expect(runManualRepoGrade(manual.repo, manualGrade)).resolves.toEqual({ noSubmission: true });
    expect(manualGrade).toHaveBeenCalledExactlyOnceWith(undefined);
    vi.stubEnv("REPO_GRADE_DISCOVERY_ENABLED", "true");
    expect(repoGradeAdmissionMode()).toBe("embedded-only");
    const evaluate = vi.fn();
    await expect(runManualRepoGrade(manual.repo, evaluate)).resolves.toEqual({
      error: "Manual repository grading is paused during the Embedded startup pilot.",
    });
    expect(evaluate).not.toHaveBeenCalled();
    expect(claimRepoGrade).not.toHaveBeenCalled();
  });

  it("never issues an external dispatch permit in the Embedded pilot", async () => {
    vi.mocked(repoGradeAdmissionMode).mockReturnValue("embedded-only");
    const claim = { mode: "automatic", token: "server", generation: 7 } as const;
    vi.mocked(claimRepoGrade).mockResolvedValue({ status: "claimed", claim });
    vi.mocked(settleRepoGrade).mockResolvedValue(true);
    const dispatch = vi.fn();
    await expect(runWithRepoGradeAdmission(automatic, async (beforeDispatch) => {
      await beforeDispatch!(new AbortController().signal);
      dispatch();
      return complete();
    })).resolves.toEqual({ status: "pre-dispatch-failed" });
    expect(beginRepoGradeDispatch).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "failed" });
  });

  it("keeps the actual coordinated mode unavailable even when explicitly configured", async () => {
    const actual = await vi.importActual<typeof import("./admission-mode")>("./admission-mode");
    vi.stubEnv("REPO_GRADE_ADMISSION_MODE", "coordinated");
    vi.mocked(repoGradeAdmissionMode).mockImplementation(actual.repoGradeAdmissionMode);
    const evaluate = vi.fn(async () => complete());
    expect(actual.repoGradeAdmissionMode()).toBe("unavailable");
    await expect(runWithRepoGradeAdmission(automatic, evaluate)).resolves.toEqual({ status: "runtime-unavailable" });
    expect(claimRepoGrade).not.toHaveBeenCalled();
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("preserves default legacy manual output and refuses automatic work without touching the ledger", async () => {
    const actual = await vi.importActual<typeof import("./admission-mode")>("./admission-mode");
    vi.stubEnv("REPO_GRADE_ADMISSION_MODE", undefined);
    vi.mocked(repoGradeAdmissionMode).mockImplementation(actual.repoGradeAdmissionMode);
    const evaluate = vi.fn().mockResolvedValue({ noSubmission: true });
    await expect(runManualRepoGrade(manual.repo, evaluate)).resolves.toEqual({ noSubmission: true });
    expect(evaluate).toHaveBeenCalledExactlyOnceWith(undefined);
    const automaticEvaluate = vi.fn(async () => complete());
    await expect(runWithRepoGradeAdmission(automatic, automaticEvaluate)).resolves.toEqual({ status: "runtime-unavailable" });
    expect(automaticEvaluate).not.toHaveBeenCalled();
    expect(claimRepoGrade).not.toHaveBeenCalled();
  });

  it.each([[manual, automatic], [automatic, manual]] as const)(
    "uses one reservation to fence manual and automatic work in either order", async (first, second) => {
      let active = false;
      vi.mocked(claimRepoGrade).mockImplementation(async (request) => {
        if (active) return { status: "busy" };
        active = true;
        return { status: "claimed", claim: { mode: request.mode, generation: 7, token: "server" } };
      });
      vi.mocked(settleRepoGrade).mockImplementation(async () => {
        active = false;
        return true;
      });
      const release = Promise.withResolvers<ReturnType<typeof complete>>();
      const entered = Promise.withResolvers<void>();
      const firstEvaluation = vi.fn(() => {
        entered.resolve();
        return release.promise;
      });
      const secondEvaluation = vi.fn(async () => complete());
      const pending = first.mode === "manual"
        ? runWithRepoGradeAdmission(first, firstEvaluation)
        : runWithRepoGradeAdmission(first, firstEvaluation);
      await entered.promise;
      const collision = second.mode === "manual"
        ? runWithRepoGradeAdmission(second, secondEvaluation)
        : runWithRepoGradeAdmission(second, secondEvaluation);
      await expect(collision).resolves.toEqual({ status: "busy" });
      expect(secondEvaluation).not.toHaveBeenCalled();
      release.resolve(complete());
      await expect(pending).resolves.toEqual({ status: "completed", value: "grade" });
      expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(
        { mode: first.mode, generation: 7, token: "server" }, { outcome: "failed" },
      );
    },
  );

  it("fails closed on missing storage for both coordinated entry points", async () => {
    vi.mocked(claimRepoGrade).mockRejectedValue(new Error("Missing RPC"));
    const evaluate = vi.fn(async () => complete());
    await expect(runWithRepoGradeAdmission(manual, evaluate)).resolves.toEqual({ status: "storage-unavailable" });
    await expect(runWithRepoGradeAdmission(automatic, evaluate)).resolves.toEqual({ status: "storage-unavailable" });
    expect(evaluate).not.toHaveBeenCalled();
    expect(settleRepoGrade).not.toHaveBeenCalled();
  });

  it("retains an ambiguous reservation and never evaluates a duplicate denial", async () => {
    const claim = { mode: "automatic", token: "server", generation: 7 } as const;
    vi.mocked(claimRepoGrade).mockResolvedValueOnce({ status: "claimed", claim })
      .mockResolvedValueOnce({ status: "busy" });
    vi.mocked(settleRepoGrade).mockResolvedValue(true);
    const evaluate = vi.fn(async (beforeDispatch?: LlmExecutionPolicy["beforeDispatch"]) => {
      await beforeDispatch?.(new AbortController().signal);
      throw new Error("Response lost");
    });
    await expect(runWithRepoGradeAdmission(automatic, evaluate)).resolves.toEqual({ status: "unknown" });
    await expect(runWithRepoGradeAdmission(automatic, evaluate)).resolves.toEqual({ status: "busy" });
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "unknown" });
  });

  it.each(["preparation failure", "denial", "lost marker", "expired permit"])(
    "settles %s without authorizing dispatch", async (failure) => {
      const claim = { mode: "automatic", token: "server", generation: 7 } as const;
      vi.mocked(claimRepoGrade).mockResolvedValue({ status: "claimed", claim });
      vi.mocked(settleRepoGrade).mockResolvedValue(true);
      if (failure === "denial") vi.mocked(beginRepoGradeDispatch).mockResolvedValue(null);
      if (failure === "lost marker") vi.mocked(beginRepoGradeDispatch).mockRejectedValue(new Error("Lost reply"));
      if (failure === "expired permit") {
        vi.mocked(beginRepoGradeDispatch).mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 1;
        });
      }
      const dispatch = vi.fn();
      await expect(runWithRepoGradeAdmission(automatic, async (beforeDispatch) => {
        if (failure === "preparation failure") throw new Error("GitHub unavailable");
        await beforeDispatch!(new AbortController().signal);
        dispatch();
        return complete();
      })).resolves.toEqual({ status: "pre-dispatch-failed" });
      expect(dispatch).not.toHaveBeenCalled();
      expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "failed" });
    },
  );

  it.each(["before", "during"])("stops dispatch when the signal aborts %s the marker RPC", async (timing) => {
    const claim = { mode: "automatic", token: "server", generation: 7 } as const;
    vi.mocked(claimRepoGrade).mockResolvedValue({ status: "claimed", claim });
    vi.mocked(settleRepoGrade).mockResolvedValue(true);
    const marker = Promise.withResolvers<number>();
    vi.mocked(beginRepoGradeDispatch).mockReturnValue(marker.promise);
    const controller = new AbortController();
    const dispatch = vi.fn();

    await expect(runWithRepoGradeAdmission(automatic, async (beforeDispatch) => {
      if (timing === "before") controller.abort();
      const authorization = beforeDispatch!(controller.signal);
      if (timing === "during") controller.abort();
      await authorization;
      dispatch();
      return complete();
    })).resolves.toEqual({ status: "pre-dispatch-failed" });

    marker.resolve(60_000);
    expect(beginRepoGradeDispatch).toHaveBeenCalledTimes(timing === "before" ? 0 : 1);
    expect(dispatch).not.toHaveBeenCalled();
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "failed" });
  });

  it("releases reservations after known validation and bounded refusals, and retains lost transport", async () => {
    const claim = { mode: "manual", token: "server", generation: 7 } as const;
    vi.mocked(claimRepoGrade).mockResolvedValue({ status: "claimed", claim });
    vi.mocked(settleRepoGrade).mockResolvedValue(true);
    await expect(runManualRepoGrade(manual.repo, async (execution) => {
      execution?.markKnownFailure();
      return { error: "Provide a rubric." };
    })).resolves.toEqual({ error: "Provide a rubric." });
    expect(settleRepoGrade).toHaveBeenLastCalledWith(claim, { outcome: "failed" });
    await expect(runManualRepoGrade(manual.repo, async () => {
      throw new BoundedRubricRefusalError("Refused.");
    })).resolves.toEqual({ error: "Refused." });
    expect(settleRepoGrade).toHaveBeenLastCalledWith(claim, { outcome: "failed" });
    await expect(runManualRepoGrade(manual.repo, async (execution) => {
      await execution?.modelExecution.beforeDispatch?.(new AbortController().signal);
      execution?.callSink.recordCall({ status: 429 });
      execution?.callSink.recordFailure("model quota");
      return { run: { results: [{ ungraded: { kind: "grading-failed" } }] } };
    })).resolves.toMatchObject({ run: { results: [{ ungraded: { kind: "grading-failed" } }] } });
    expect(settleRepoGrade).toHaveBeenLastCalledWith(claim, { outcome: "failed" });
    await expect(runManualRepoGrade(manual.repo, async () => {
      throw new LlmOutcomeUnknownError();
    })).resolves.toEqual({ error: expect.stringContaining("Reconcile") });
    expect(settleRepoGrade).toHaveBeenLastCalledWith(claim, { outcome: "unknown" });
  });

  it.each([
    { scenario: "prompt safety block", body: { promptFeedback: { blockReason: "SAFETY" } }, outcome: "failed" },
    { scenario: "candidate safety block", body: { candidates: [{ finishReason: "SAFETY" }] }, outcome: "failed" },
    { scenario: "empty terminal output", body: { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [] } }] }, outcome: "failed" },
    { scenario: "unusable terminal rubric", body: { candidates: [{ finishReason: "STOP", content: { parts: [{ text: '{"rubric":"No criteria available."}' }] } }] }, outcome: "failed" },
    { scenario: "absent candidates without a block", body: {}, outcome: "unknown" },
    { scenario: "empty candidates with unspecified prompt feedback", body: { candidates: [], promptFeedback: { blockReason: "BLOCK_REASON_UNSPECIFIED" } }, outcome: "unknown" },
    { scenario: "candidate text without finish metadata", body: { candidates: [{ content: { parts: [{ text: "Correctness (100%): Runs." }] } }] }, outcome: "unknown" },
    { scenario: "malformed parts despite a terminal reason", body: { candidates: [{ finishReason: "STOP", content: { parts: [{}] } }] }, outcome: "unknown" },
    { scenario: "malformed safety response", body: { promptFeedback: { blockReason: "SAFETY" }, candidates: {} }, outcome: "unknown" },
    { scenario: "transport loss", body: undefined, outcome: "unknown" },
  ])("settles actual rubric generation for $scenario as $outcome", async ({ body, outcome }) => {
    const claim = { mode: "manual", token: "server", generation: 7 } as const;
    vi.mocked(claimRepoGrade).mockResolvedValue({ status: "claimed", claim });
    vi.mocked(settleRepoGrade).mockResolvedValue(true);
    vi.mocked(ingestRepo).mockResolvedValue({
      fullName: manual.repo, description: "", fileCount: 1, text: "print(42)", truncated: false,
      files: [{ path: "main.py", content: "print(42)", truncated: false }],
    });
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const fetchMock = vi.fn<typeof fetch>();
    if (body === undefined) fetchMock.mockRejectedValue(new TypeError("Response lost"));
    else fetchMock.mockResolvedValue(Response.json(body));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runManualRepoGrade(manual.repo, (execution) => evaluateRepoGrade(
      { owner: "school", repo: "repo" }, "Grade for correctness.", "", "gemini",
      undefined, undefined, false, false, false, "a".repeat(40), execution,
    ));

    expect(result).toEqual({ error: expect.stringContaining(outcome === "failed" ? "rubric" : "Reconcile") });
    expect(beginRepoGradeDispatch).toHaveBeenCalledExactlyOnceWith(claim);
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]?.body).toEqual(expect.stringContaining("creating a grading rubric"));
  });

  it("releases a coordinated manual reservation after a conclusive sandbox refusal", async () => {
    const claim = { mode: "manual", token: "server", generation: 7 } as const;
    vi.mocked(claimRepoGrade).mockResolvedValue({ status: "claimed", claim });
    vi.mocked(settleRepoGrade).mockResolvedValue(true);
    await expect(runManualRepoGrade(manual.repo, async (execution) => {
      await execution?.modelExecution.beforeDispatch?.(new AbortController().signal);
      throw new SandboxExecutionRefusedError();
    })).resolves.toEqual({ error: "The sandbox declined the code execution request." });
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "failed" });
  });
});
