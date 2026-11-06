import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAutomaticRepoGradeWorker } from "./automatic-worker";
import { repoGradeStartupKey } from "./scheduler";
import type { RepoGradeLedgerObservation, RepoGradeStartupTarget } from "./scheduler";

const mocks = vi.hoisted(() => ({ plan: vi.fn(), evaluate: vi.fn(), history: vi.fn() }));
vi.mock("./runner", () => ({ planRepoGradeCourse: mocks.plan, runRepoGradeTarget: mocks.evaluate }));
vi.mock("./startup-history", () => ({ readRepoGradeStartupHistory: mocks.history }));
vi.mock("./preparation-runtime", () => ({
  prepareEmbeddedRepoGradeStartupProfile: vi.fn(), prepareRepoGradeStartupProfile: vi.fn(),
}));

describe("durable repository grading discovery", () => {
  beforeEach(() => vi.resetAllMocks());

  it("keeps a throttled scan in the same run only when retry is enabled", async () => {
    const work = { phase: "discovering", runId: "run", accountId: "owner", courseId: "course" } as const;
    const rateLimit = { retryAtMs: 1_800_000_000_000, primary: true };
    mocks.plan.mockResolvedValue({ discovery: { status: "blocked", reason: "rate-limited", rateLimit } });
    const worker = createAutomaticRepoGradeWorker("coordinated");
    await expect(worker(work)).resolves.toEqual({ state: "partial", reason: "rate-limited", targets: [] });
    await expect(worker({ ...work, retryGithubRateLimits: true })).resolves.toEqual({ state: "github-throttled", rateLimit });
    mocks.plan.mockResolvedValue({ discovery: { status: "not-configured" } });
    await expect(worker({ ...work, retryGithubRateLimits: true })).resolves.toEqual({ state: "not-configured", targets: [] });
    expect(mocks.plan).toHaveBeenCalledTimes(2);
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });

  it("defers only a pre-admission throttle during grading", async () => {
    const work = {
      phase: "grading", runId: "run", accountId: "owner", courseId: "course", repo: "Org/Student",
      folder: "assignment", ref: "main", sha: "a".repeat(40), retryGithubRateLimits: true,
    } as const;
    mocks.plan.mockResolvedValueOnce({ discovery: { status: "blocked", reason: "rate-limited" } })
      .mockResolvedValueOnce({ discovery: { status: "scanned", repos: [] }, folderSources: new Map() });
    mocks.history.mockImplementation(async (_owner, _course, targets: RepoGradeStartupTarget[]) =>
      new Map(targets.map((target) => [repoGradeStartupKey(target), "never-attempted"])));
    mocks.evaluate.mockResolvedValue({ status: "unknown" });
    const worker = createAutomaticRepoGradeWorker("coordinated");
    await expect(worker(work)).resolves.toEqual({ state: "github-throttled", rateLimit: { retryAtMs: null, primary: false } });
    expect(mocks.evaluate).not.toHaveBeenCalled();
    await expect(worker(work)).resolves.toEqual({ state: "unknown" });
  });

  it("keeps a complete scan that used the final GitHub request and defers the grade before admission", async () => {
    const work = { runId: "run", accountId: "owner", courseId: "course", retryGithubRateLimits: true };
    const repo = "Org/Student";
    const sha = "a".repeat(40);
    const rateLimit = { retryAtMs: 1_800_000_000_000, primary: true };
    mocks.plan.mockResolvedValue({
      courseConfig: { github_org: "Org" },
      discovery: { status: "scanned", enumerationComplete: true, rateLimit, repos: [
        { status: "ready", repo, sourceCommit: sha, sourceRef: "main", folders: ["assignment"] },
      ] },
    });
    mocks.history.mockImplementation(async (_owner, _course, targets: RepoGradeStartupTarget[]) =>
      new Map(targets.map((target) => [repoGradeStartupKey(target), "never-attempted"])));
    const worker = createAutomaticRepoGradeWorker("coordinated");
    await expect(worker({ ...work, phase: "discovering" })).resolves.toMatchObject({
      state: "scanned", targets: [{ repo, folder: "assignment", ref: "main", sha }],
    });
    await expect(worker({ ...work, phase: "grading", repo, folder: "assignment", ref: "main", sha }))
      .resolves.toEqual({ state: "github-throttled", rateLimit });
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });

  it("queues only unseen targets and keeps prior failures and unconfirmed attempts visible after reopening", async () => {
    const work = { phase: "discovering", runId: "run", accountId: "owner", courseId: "course" } as const;
    const repo = "Org/Student";
    const sha = "a".repeat(40);
    const observations: Record<string, RepoGradeLedgerObservation> = {
      unseen: "never-attempted", failure: "failed", partial: "partial", uncertain: "unknown",
      active: "claimed", completed: "succeeded", noSubmission: "no-submission",
    };
    mocks.plan.mockResolvedValue({
      accountId: work.accountId, courseId: work.courseId, courseConfig: { github_org: "Org" },
      discovery: { status: "scanned", enumerationComplete: true, repos: [
        { status: "ready", repo, sourceCommit: sha, sourceRef: "main", folders: Object.keys(observations) },
      ] },
    });
    mocks.history.mockImplementation(async (_owner, _course, targets: RepoGradeStartupTarget[]) =>
      new Map(targets.map((target) => [repoGradeStartupKey(target), observations[target.folder]])));

    const result = await createAutomaticRepoGradeWorker("coordinated")(work);
    expect(result).toMatchObject({
      state: "scanned", targets: expect.any(Array),
      repositories: { checked: 1, found: 1, enumerationComplete: true },
    });
    if (!("targets" in result)) throw new Error("Expected a discovery completion");
    expect(Object.fromEntries(result.targets.map(({ folder, state }) => [folder, state ?? "queued"]))).toEqual({
      unseen: "queued", failure: "failed", partial: "partial", uncertain: "unknown", active: "busy",
      completed: "already-processed", noSubmission: "already-processed",
    });
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });
  it("preserves the exact unsettled feedback for bounded owner recovery", async () => {
    const work = {
      phase: "grading", runId: "run", accountId: "owner", courseId: "course", repo: "Org/Student",
      folder: "assignment", ref: "main", sha: "a".repeat(40),
    } as const;
    mocks.plan.mockResolvedValue({ folderSources: new Map() });
    mocks.history.mockImplementation(async (_owner, _course, targets: RepoGradeStartupTarget[]) =>
      new Map(targets.map((target) => [repoGradeStartupKey(target), "never-attempted"])));
    const unretainedResult = { score: 10, feedback: "Feedback with \u0000", rubric: [], sections: {} };
    mocks.evaluate.mockResolvedValue({ status: "unknown", unretainedResult });
    const result = await createAutomaticRepoGradeWorker("coordinated")(work);
    expect(result).toMatchObject({ state: "unknown", reason: "feedback-retention-unconfirmed" });
    if (!("recovery" in result) || !result.recovery) throw new Error("Expected an encoded recovery record");
    expect(JSON.parse(Buffer.from(result.recovery, "base64").toString("utf8"))).toMatchObject({
      status: "unknown", unretainedResult, target: { accountId: work.accountId, sha: work.sha },
    });
  });

  it("passes only an explicit rubric retry selector through to durable storage", async () => {
    const work = {
      phase: "grading", runId: "run", accountId: "owner", courseId: "course", repo: "Org/Student",
      folder: "assignment", ref: "main", sha: "a".repeat(40),
    } as const;
    mocks.plan.mockResolvedValue({ folderSources: new Map() });
    mocks.history.mockImplementation(async (_owner, _course, targets: RepoGradeStartupTarget[]) =>
      new Map(targets.map((target) => [repoGradeStartupKey(target), "never-attempted"])));
    const preparationRetry = { key: "b".repeat(64), generation: "c".repeat(64) };
    mocks.evaluate.mockResolvedValue({ status: "explicit-retry-required", preparationRetry });
    expect(await createAutomaticRepoGradeWorker("coordinated")(work)).toEqual({
      state: "blocked", reason: "explicit-retry-required", preparationRetry,
    });
  });
});
