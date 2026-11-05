import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runManualRepoGrade, runWithRepoGradeAdmission } from "./admission";
import { repoGradeAdmissionMode } from "./admission-mode";
import { claimRepoGrade, settleRepoGrade } from "./ledger";
import { BoundedRubricRefusalError } from "@/lib/grade/rubric";
import { LlmOutcomeUnknownError } from "@/lib/llm";

vi.mock("./ledger", () => ({ claimRepoGrade: vi.fn(), settleRepoGrade: vi.fn() }));
vi.mock("./admission-mode", () => ({ repoGradeAdmissionMode: vi.fn() }));

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
});

afterEach(() => vi.unstubAllEnvs());

describe("repository grading admission", () => {
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
    const evaluate = vi.fn<() => Promise<ReturnType<typeof complete>>>().mockRejectedValue(new Error("Response lost"));
    await expect(runWithRepoGradeAdmission(automatic, evaluate)).resolves.toEqual({ status: "unknown" });
    await expect(runWithRepoGradeAdmission(automatic, evaluate)).resolves.toEqual({ status: "busy" });
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(settleRepoGrade).toHaveBeenCalledExactlyOnceWith(claim, { outcome: "unknown" });
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
});
