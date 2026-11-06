import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAutomaticRepoGradeWorker } from "./automatic-worker";
import { repoGradeStartupKey } from "./scheduler";
import type { RepoGradeLedgerObservation, RepoGradeStartupTarget } from "./scheduler";

const mocks = vi.hoisted(() => ({ plan: vi.fn(), evaluate: vi.fn(), history: vi.fn(), snapshot: vi.fn(), evidenceStore: vi.fn(), cooldown: vi.fn() }));
vi.mock("@/lib/github-grade-archive", () => ({ confirmedGradeSourceCooldown: mocks.cooldown }));
vi.mock("./runner", () => ({ planRepoGradeCourse: mocks.plan, runRepoGradeTarget: mocks.evaluate }));
vi.mock("./automatic-store", () => ({ readAutomaticRepoGradeSnapshot: mocks.snapshot, automaticRepoGradeEvidenceStore: mocks.evidenceStore }));
vi.mock("./startup-history", () => ({ readRepoGradeStartupHistory: mocks.history }));
vi.mock("./preparation-runtime", () => ({
  prepareEmbeddedRepoGradeStartupProfile: vi.fn(), prepareRepoGradeStartupProfile: vi.fn(),
}));

describe("durable repository grading discovery", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.snapshot.mockResolvedValue({ status: "legacy" }); });

  it("keeps a throttled scan in the same run only when retry is enabled", async () => {
    const work = { phase: "discovering", runId: "run", accountId: "owner", courseId: "course" } as const;
    const rateLimit = { retryAtMs: Date.now() + 360_000, primary: true };
    mocks.plan.mockResolvedValue({ discovery: { status: "blocked", reason: "rate-limited", rateLimit } });
    const worker = createAutomaticRepoGradeWorker("coordinated");
    await expect(worker(work, "lease")).resolves.toEqual({ state: "partial", reason: "rate-limited", targets: [] });
    await expect(worker({ ...work, retryGithubRateLimits: true }, "lease")).resolves.toEqual({ state: "github-throttled", rateLimit });
    mocks.plan.mockResolvedValue({ discovery: { status: "not-configured" } });
    await expect(worker({ ...work, retryGithubRateLimits: true }, "lease")).resolves.toEqual({ state: "not-configured", targets: [] });
    expect(mocks.plan).toHaveBeenCalledTimes(3);
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
    await expect(worker(work, "lease")).resolves.toEqual({ state: "github-throttled", rateLimit: { retryAtMs: null, primary: false } });
    expect(mocks.evaluate).not.toHaveBeenCalled();
    await expect(worker(work, "lease")).resolves.toEqual({ state: "unknown" });
  });

  it("defers a known source cooldown before admitting work and resumes the same target when it clears", async () => {
    const work = {
      phase: "grading", runId: "run", accountId: "owner", courseId: "course", repo: "Org/Student",
      folder: "assignment", ref: "main", sha: "a".repeat(40), retryGithubRateLimits: true,
    } as const;
    const cooldown = { retryAtMs: Date.now() + 120_000, primary: false };
    mocks.plan.mockResolvedValue({ discovery: { status: "scanned", repos: [] }, folderSources: new Map() });
    mocks.cooldown.mockReturnValueOnce(cooldown).mockReturnValueOnce(null);
    mocks.history.mockImplementation(async (_owner, _course, targets: RepoGradeStartupTarget[]) =>
      new Map(targets.map((target) => [repoGradeStartupKey(target), "never-attempted"])));
    mocks.evaluate.mockResolvedValue({ status: "succeeded" });
    const worker = createAutomaticRepoGradeWorker("coordinated");
    await expect(worker(work, "lease-1")).resolves.toEqual({ state: "github-throttled", rateLimit: cooldown });
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.evaluate).not.toHaveBeenCalled();
    await expect(worker(work, "lease-2")).resolves.toEqual({ state: "succeeded" });
    expect(mocks.evaluate).toHaveBeenCalledOnce();
  });

  it("keeps a complete scan that used the final GitHub request and defers the grade before admission", async () => {
    const work = { runId: "run", accountId: "owner", courseId: "course", retryGithubRateLimits: true };
    const repo = "Org/Student";
    const sha = "a".repeat(40);
    const rateLimit = { retryAtMs: Date.now() + 360_000, primary: true };
    mocks.plan.mockResolvedValue({
      snapshotBasis: "d".repeat(64), courseConfig: { github_org: "Org" },
      discovery: { status: "scanned", enumerationComplete: true, rateLimit, repos: [
        { status: "ready", repo, sourceCommit: sha, sourceRef: "main", folders: ["assignment"] },
      ] },
    });
    mocks.history.mockImplementation(async (_owner, _course, targets: RepoGradeStartupTarget[]) =>
      new Map(targets.map((target) => [repoGradeStartupKey(target), "never-attempted"])));
    const worker = createAutomaticRepoGradeWorker("coordinated");
    const staged = await worker({ ...work, phase: "discovering" }, "discover-lease");
    expect(staged).toMatchObject({
      state: "scanned", targets: [{ repo, folder: "assignment", ref: "main", sha }],
    });
    if (!("targets" in staged) || !staged.snapshot) throw new Error("Expected a pinned discovery");
    mocks.snapshot.mockResolvedValue({ status: "ready", snapshot: staged.snapshot });
    await expect(createAutomaticRepoGradeWorker("coordinated")({ ...work, phase: "grading", repo, folder: "assignment", ref: "main", sha }, "grade-lease"))
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
      accountId: work.accountId, courseId: work.courseId, snapshotBasis: "d".repeat(64), courseConfig: { github_org: "Org" },
      discovery: { status: "scanned", enumerationComplete: true, repos: [
        { status: "ready", repo, sourceCommit: sha, sourceRef: "main", folders: Object.keys(observations) },
      ] },
    });
    mocks.history.mockImplementation(async (_owner, _course, targets: RepoGradeStartupTarget[]) =>
      new Map(targets.map((target) => [repoGradeStartupKey(target), observations[target.folder]])));

    const result = await createAutomaticRepoGradeWorker("coordinated")(work, "lease");
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
  it("keeps ready targets without certifying an unresolved course inventory", async () => {
    const work = { phase: "discovering", runId: "run", accountId: "owner", courseId: "course" } as const;
    mocks.plan.mockResolvedValue({
      snapshotBasis: "d".repeat(64), courseConfig: { github_org: "Org" },
      discovery: { status: "scanned", enumerationComplete: true, repos: [
        { status: "ready", repo: "Org/Ready", sourceCommit: "a".repeat(40), sourceRef: "main", folders: ["lab"] },
        { status: "blocked", repo: "Org/Unknown", sourceRef: "main", reason: "unavailable" },
      ] },
    });
    mocks.history.mockImplementation(async (_owner, _course, targets: RepoGradeStartupTarget[]) =>
      new Map(targets.map((target) => [repoGradeStartupKey(target), "never-attempted"])));
    const result = await createAutomaticRepoGradeWorker("coordinated")(work, "discovery-lease");
    expect(result).toMatchObject({
      state: "partial", reason: "unavailable", targets: [{ repo: "Org/Ready", folder: "lab", ref: "main", sha: "a".repeat(40) }],
      repositories: { checked: 1, found: 2, enumerationComplete: true },
    });
    expect(result).not.toHaveProperty("snapshot");
  });

  it("revalidates a stored snapshot and refuses an unavailable or denied inventory", async () => {
    const work = {
      phase: "grading", runId: "run", accountId: "owner", courseId: "course", repo: "Org/Student",
      folder: "lab", ref: "main", sha: "a".repeat(40),
    } as const;
    const snapshot = { version: 1, basis: "d".repeat(64),
      discovery: { status: "scanned", enumerationComplete: true, repos: [] } };
    mocks.snapshot.mockResolvedValueOnce({ status: "ready", snapshot }).mockResolvedValueOnce({ status: "unavailable" });
    mocks.plan.mockResolvedValue(null);
    expect(await createAutomaticRepoGradeWorker("coordinated")(work, "live-lease"))
      .toEqual({ state: "blocked", reason: "configuration-changed" });
    expect(mocks.plan).toHaveBeenCalledExactlyOnceWith(work.accountId, work.courseId, snapshot);
    expect(await createAutomaticRepoGradeWorker("coordinated")(work, "denied-lease"))
      .toEqual({ state: "blocked", reason: "pinned-inventory-unavailable" });
    expect(mocks.plan).toHaveBeenCalledTimes(1);
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
    const result = await createAutomaticRepoGradeWorker("coordinated")(work, "lease");
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
    const worker = createAutomaticRepoGradeWorker("coordinated");
    expect(await worker(work, "lease")).toEqual({
      state: "blocked", reason: "explicit-retry-required", preparationRetry,
    });
    mocks.evaluate.mockResolvedValue({ status: "partial", reason: "grading-source-rate-limited" });
    expect(await worker(work, "lease")).toEqual({ state: "partial", reason: "grading-source-rate-limited" });
  });

  it("passes a never-dispatched throttle claim to the atomic cooldown transition", async () => {
    const work = {
      phase: "grading", runId: "run", accountId: "owner", courseId: "course", repo: "Org/Student",
      folder: "assignment", ref: "main", sha: "a".repeat(40), retryGithubRateLimits: true,
    } as const;
    const claim = { mode: "automatic", generation: 7, token: "token" } as const;
    mocks.plan.mockResolvedValue({ folderSources: new Map() });
    mocks.history.mockImplementation(async (_owner, _course, targets: RepoGradeStartupTarget[]) =>
      new Map(targets.map((target) => [repoGradeStartupKey(target), "never-attempted"])));
    mocks.evaluate.mockResolvedValue({ status: "deferred-source-throttle", claim });
    await expect(createAutomaticRepoGradeWorker("coordinated")(work, "lease")).resolves.toEqual({
      state: "github-throttled", rateLimit: { retryAtMs: null, primary: false }, claim,
    });
    expect(mocks.evaluate.mock.calls[0][2]).toMatchObject({ deferSourceThrottle: true });
  });
});
