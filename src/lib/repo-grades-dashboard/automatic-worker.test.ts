import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAutomaticRepoGradeWorker } from "./automatic-worker";
import { repoGradeStartupKey } from "./scheduler";
import type { RepoGradeLedgerObservation, RepoGradeStartupTarget } from "./scheduler";
import { PreparationGithubThrottle } from "./preparation-github-throttle";
import { prepareRepoGradeStartupProfile } from "./preparation-runtime";
import { PreparationEvidenceContinue } from "./automatic-evidence";

const mocks = vi.hoisted(() => ({ plan: vi.fn(), evaluate: vi.fn(), history: vi.fn(), snapshot: vi.fn(), evidenceStore: vi.fn(), cooldown: vi.fn(), targeted: vi.fn(), authorize: vi.fn() }));
vi.mock("@/lib/github-grade-archive", () => ({ confirmedGradeSourceCooldown: mocks.cooldown }));
vi.mock("./runner", () => ({ planRepoGradeCourse: mocks.plan, runRepoGradeTarget: mocks.evaluate }));
vi.mock("./automatic-store", () => ({ readAutomaticRepoGradeSnapshot: mocks.snapshot, automaticRepoGradeEvidenceStore: mocks.evidenceStore, isTargetedAutomaticRepoGrade: mocks.targeted }));
vi.mock("./startup-history", () => ({ readRepoGradeStartupHistory: mocks.history }));
vi.mock("./automatic-evidence", async (importOriginal) => ({
  ...await importOriginal<typeof import("./automatic-evidence")>(), authorizeAutomaticRepoGradeEvidence: mocks.authorize,
}));
vi.mock("./preparation-runtime", () => ({
  prepareEmbeddedRepoGradeStartupProfile: vi.fn(), prepareRepoGradeStartupProfile: vi.fn(),
}));

describe("durable repository grading discovery", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.snapshot.mockResolvedValue({ status: "legacy" }); mocks.targeted.mockResolvedValue(false); mocks.authorize.mockResolvedValue(true); });

  it("queues a prepared partial and uses the fenced recovery claim only for that state", async () => {
    const sha = "a".repeat(40);
    const work = { phase: "grading", runId: "run", accountId: "owner", courseId: "course",
      repo: "Org/Student", folder: "lab", ref: "main", sha } as const;
    mocks.plan.mockResolvedValue({ discovery: { status: "scanned", repos: [] }, folderSources: new Map() });
    let prior: RepoGradeLedgerObservation = "recoverable-partial";
    mocks.history.mockImplementation(async (_owner, _course, targets: RepoGradeStartupTarget[]) =>
      new Map(targets.map((target) => [repoGradeStartupKey(target), prior])));
    mocks.evaluate.mockResolvedValue({ status: "succeeded" });
    const worker = createAutomaticRepoGradeWorker("coordinated");
    await expect(worker(work, "lease")).resolves.toEqual({ state: "succeeded" });
    expect(mocks.evaluate).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      recoveryRun: { runId: "run", lease: "lease" },
    }));
    mocks.evaluate.mockClear();
    prior = "recoverable-text";
    // Legacy snapshots or missing proof must not permit the new retry.
    await expect(worker(work, "lease")).resolves.toEqual({ state: "partial", reason: "prior-attempt" });
    expect(mocks.evaluate).not.toHaveBeenCalled();
    const discovery = { status: "scanned", enumerationComplete: true, repos: [{ status: "ready", repo: work.repo,
      sourceRef: work.ref, sourceCommit: sha, folders: ["lab"], textRecoveryFolders: ["lab"] }] };
    mocks.snapshot.mockResolvedValue({ status: "ready", snapshot: { basis: "b".repeat(64), discovery } });
    mocks.plan.mockResolvedValue({ discovery, folderSources: new Map() });
    await expect(worker(work, "lease")).resolves.toEqual({ state: "succeeded" });
    expect(mocks.evaluate).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      recoveryRun: { runId: "run", lease: "lease", capability: "text-extension-v1" },
    }));
    mocks.evaluate.mockClear();
    mocks.plan.mockResolvedValueOnce({ discovery: { ...discovery, repos: [{ ...discovery.repos[0], sourceCommit: "b".repeat(40) }] }, folderSources: new Map() });
    await expect(worker(work, "lease")).resolves.toEqual({ state: "partial", reason: "prior-attempt" });
    expect(mocks.evaluate).not.toHaveBeenCalled();
    prior = "partial";
    await expect(worker(work, "lease")).resolves.toEqual({ state: "partial", reason: "prior-attempt" });
    expect(mocks.evaluate).not.toHaveBeenCalled();
  });

  it("settles a targeted prior grade as verified empty without rubric or model work", async () => {
    const sha = "a".repeat(40), work = { phase: "grading", runId: "run", accountId: "owner", courseId: "course",
      repo: "Org/Student", folder: "lab", ref: "main", sha } as const;
    const discovery = { status: "scanned", enumerationComplete: true, repos: [{ status: "ready", repo: work.repo,
      sourceRef: work.ref, sourceCommit: sha, folders: ["lab"], emptyFolders: ["lab"] }] };
    mocks.snapshot.mockResolvedValue({ status: "ready", snapshot: { basis: "b".repeat(64), discovery } });
    mocks.plan.mockResolvedValue({ discovery, folderSources: new Map() });
    mocks.targeted.mockResolvedValue(true);
    mocks.history.mockImplementation(async (_owner, _course, targets: RepoGradeStartupTarget[]) =>
      new Map(targets.map((target) => [repoGradeStartupKey(target), "succeeded"])));
    const worker = createAutomaticRepoGradeWorker("coordinated");
    await expect(worker(work, "lease")).resolves.toEqual({ state: "verified-empty-regrade" });
    expect(mocks.authorize).toHaveBeenCalledWith(work.repo, sha);
    expect(mocks.evaluate).not.toHaveBeenCalled();
    mocks.authorize.mockResolvedValueOnce(false);
    await expect(worker(work, "lease")).resolves.toEqual({ state: "blocked", reason: "source-unavailable" });
    mocks.targeted.mockResolvedValue(false);
    await expect(worker(work, "lease")).resolves.toEqual({ state: "already-processed" });
  });

  it("marks only verified empty automatic targets without a prior claim as no submission", async () => {
    const sha = "a".repeat(40);
    mocks.plan.mockResolvedValue({ snapshotBasis: "d".repeat(64), courseConfig: { github_org: "Org" },
      discovery: { status: "scanned", enumerationComplete: true, repos: [
        { status: "ready", repo: "Org/Empty", sourceCommit: sha, sourceRef: "main", folders: ["lab"], emptyFolders: ["lab"] },
        { status: "ready", repo: "Org/Work", sourceCommit: sha, sourceRef: "main", folders: ["lab"], emptyFolders: [] },
        { status: "ready", repo: "Org/Unverified", sourceCommit: sha, sourceRef: "main", folders: ["lab"] },
        { status: "ready", repo: "Org/Uncertain", sourceCommit: sha, sourceRef: "main", folders: ["lab"], emptyFolders: ["lab"] },
      ] } });
    mocks.history.mockImplementation(async (_owner, _course, targets: RepoGradeStartupTarget[]) => new Map(targets.map((target) => [
      repoGradeStartupKey(target), target.repo === "Org/Uncertain" ? "unknown" : "never-attempted",
    ])));
    const work = { phase: "discovering", runId: "run", accountId: "owner", courseId: "course" } as const;
    const result = await createAutomaticRepoGradeWorker("coordinated")(work, "lease");
    expect(result).toMatchObject({ state: "scanned", targets: expect.arrayContaining([
      expect.objectContaining({ repo: "Org/Empty", state: "no-submission" }),
      expect.objectContaining({ repo: "Org/Uncertain", state: "unknown", reason: "prior-attempt" }),
      expect.objectContaining({ repo: "Org/Work", folder: "lab" }),
      expect.objectContaining({ repo: "Org/Unverified", folder: "lab" }),
    ]) });
    if (!("targets" in result)) throw new Error("Expected discovery targets");
    expect(result.targets.find((row) => row.repo === "Org/Work")?.state).toBeUndefined();
    expect(result.targets.find((row) => row.repo === "Org/Unverified")?.state).toBeUndefined();
    const manual = await createAutomaticRepoGradeWorker("coordinated")({ ...work, targetFilter: { folders: ["lab"], repos: ["Org/Empty"] } }, "lease");
    if (!("targets" in manual)) throw new Error("Expected targeted discovery");
    expect(manual.targets[0].state).toBe("no-submission");
  });

  it("retains the first bounded README example with a blocked result", async () => {
    const work = { phase: "grading", runId: "run", accountId: "owner", courseId: "course", repo: "Org/Student",
      folder: "lab", ref: "main", sha: "a".repeat(40) } as const;
    mocks.plan.mockResolvedValue({ discovery: { status: "scanned", repos: [] }, folderSources: new Map() });
    mocks.history.mockImplementation(async (_owner, _course, targets: RepoGradeStartupTarget[]) =>
      new Map(targets.map((target) => [repoGradeStartupKey(target), "never-attempted"])));
    vi.mocked(prepareRepoGradeStartupProfile).mockImplementation(async (_scope, _discovery, _ref, _target, _config, _basis, options) => {
      options?.observeProfileFailure?.("missing-instruction-evidence", { kind: "blank", repo: "Org/Example" });
      return null;
    });
    mocks.evaluate.mockImplementation(async (_plan, _target, runtime) => {
      await runtime.loadPreparedProfile({ accountId: "owner", courseId: "course", folder: "lab" });
      return { status: "profile-unavailable" };
    });
    await expect(createAutomaticRepoGradeWorker("coordinated")(work, "lease")).resolves.toEqual({
      state: "blocked", reason: "missing-instruction-evidence", readmeExample: { kind: "blank", repo: "Org/Example" },
    });
  });

  it("regrades an explicit target while scheduled work still skips its existing grade", async () => {
    const work = { phase: "grading", runId: "run", accountId: "owner", courseId: "course", repo: "Org/Student",
      folder: "lab", ref: "main", sha: "a".repeat(40) } as const;
    mocks.plan.mockResolvedValue({ discovery: { status: "scanned", repos: [] }, folderSources: new Map() });
    mocks.history.mockImplementation(async (_owner, _course, targets: RepoGradeStartupTarget[]) =>
      new Map(targets.map((target) => [repoGradeStartupKey(target), "succeeded"])));
    mocks.evaluate.mockResolvedValue({ status: "succeeded" });
    const worker = createAutomaticRepoGradeWorker("coordinated");
    await expect(worker(work, "lease")).resolves.toEqual({ state: "already-processed" });
    expect(mocks.evaluate).not.toHaveBeenCalled();
    mocks.targeted.mockResolvedValue(true);
    await expect(worker(work, "lease")).resolves.toEqual({ state: "succeeded" });
    expect(mocks.evaluate).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      targetedRun: { runId: "run", lease: "lease" },
    }));
    mocks.targeted.mockResolvedValue(null);
    await expect(worker(work, "expired-lease")).resolves.toEqual({ state: "blocked", reason: "targeted-run-unavailable" });
  });

  it("limits a targeted run to discovered matching repository folders", async () => {
    const sha = "a".repeat(40);
    mocks.plan.mockResolvedValue({ snapshotBasis: "d".repeat(64), courseConfig: { github_org: "Org" },
      discovery: { status: "scanned", enumerationComplete: true, repos: [
        { status: "ready", repo: "Org/One", sourceCommit: sha, sourceRef: "main", folders: ["lab", "other"] },
        { status: "ready", repo: "Org/Two", sourceCommit: sha, sourceRef: "main", folders: ["lab"] },
      ] } });
    mocks.history.mockImplementation(async (_owner, _course, targets: RepoGradeStartupTarget[]) =>
      new Map(targets.map((target) => [repoGradeStartupKey(target), "never-attempted"])));
    const work = { phase: "discovering", runId: "run", accountId: "owner", courseId: "course" } as const;
    const worker = createAutomaticRepoGradeWorker("coordinated");
    expect(await worker({ ...work, targetFilter: { folders: ["lab"], repos: null } }, "lease"))
      .toMatchObject({ state: "scanned", targets: [{ repo: "Org/One", folder: "lab" }, { repo: "Org/Two", folder: "lab" }] });
    expect(await worker({ ...work, targetFilter: { folders: ["lab"], repos: ["Org/Two"] } }, "lease"))
      .toMatchObject({ state: "scanned", targets: [{ repo: "Org/Two", folder: "lab" }] });
    expect(await worker({ ...work, targetFilter: { folders: ["lab"], repos: ["Org/Other"] } }, "lease"))
      .toMatchObject({ state: "partial", reason: "target-not-found", targets: [] });
    expect(await worker({ ...work, targetFilter: { folders: null, repos: null, pairs: [
      { folder: "other", repo: "Org/One" }, { folder: "lab", repo: "Org/Two" },
    ] } }, "lease")).toMatchObject({ state: "scanned", targets: [
      { repo: "Org/One", folder: "other" }, { repo: "Org/Two", folder: "lab" },
    ] });
  });

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

  it("defers a confirmed preparation throttle only when retry is enabled", async () => {
    const work = { phase: "grading", runId: "run", accountId: "owner", courseId: "course",
      repo: "Org/Student", folder: "assignment", ref: "main", sha: "a".repeat(40) } as const;
    const rateLimit = { retryAtMs: Date.now() + 120_000, primary: true };
    mocks.plan.mockResolvedValue({ discovery: { status: "scanned", repos: [] }, folderSources: new Map() });
    mocks.history.mockImplementation(async (_owner, _course, targets: RepoGradeStartupTarget[]) =>
      new Map(targets.map((target) => [repoGradeStartupKey(target), "never-attempted"])));
    vi.mocked(prepareRepoGradeStartupProfile).mockRejectedValue(new PreparationGithubThrottle(rateLimit));
    mocks.evaluate.mockImplementation(async (_plan, _target, runtime) => {
      try { await runtime.loadPreparedProfile({ accountId: "owner", courseId: "course", folder: "assignment" }); }
      catch { return { status: "profile-unavailable" }; }
      throw new Error("Expected pre-dispatch preparation failure");
    });
    const worker = createAutomaticRepoGradeWorker("coordinated");
    await expect(worker({ ...work, retryGithubRateLimits: true }, "lease")).resolves.toEqual({ state: "github-throttled", rateLimit });
    await expect(worker(work, "lease")).resolves.toEqual({ state: "blocked", reason: "profile-unavailable" });
  });

  it("continues incomplete evidence before any evaluation is dispatched", async () => {
    const work = { phase: "grading", runId: "run", accountId: "owner", courseId: "course",
      repo: "Org/Student", folder: "assignment", ref: "main", sha: "a".repeat(40) } as const;
    const progress = { version: 1 as const, basis: "a".repeat(64), key: "b".repeat(64), instructions: "text", rows: [] };
    mocks.plan.mockResolvedValue({ discovery: { status: "scanned", repos: [] }, folderSources: new Map() });
    mocks.history.mockImplementation(async (_owner, _course, targets: RepoGradeStartupTarget[]) =>
      new Map(targets.map((target) => [repoGradeStartupKey(target), "never-attempted"])));
    vi.mocked(prepareRepoGradeStartupProfile).mockRejectedValue(new PreparationEvidenceContinue("c".repeat(64), progress));
    mocks.evaluate.mockImplementation(async (_plan, _target, runtime) => {
      try { await runtime.loadPreparedProfile({ accountId: "owner", courseId: "course", folder: "assignment" }); }
      catch { return { status: "profile-unavailable" }; }
      throw new Error("Expected pre-dispatch continuation");
    });
    await expect(createAutomaticRepoGradeWorker("coordinated")(work, "lease"))
      .resolves.toEqual({ state: "evidence-continue", basis: "c".repeat(64), progress });
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
