import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(), finish: vi.fn(), getUserById: vi.fn(), resolve: vi.fn(), runAsOwner: vi.fn(), worker: vi.fn(),
  mode: vi.fn(), enabled: vi.fn(), enqueueDue: vi.fn(), promote: vi.fn(), factory: vi.fn(),
}));
vi.mock("@/lib/repo-grades-dashboard/admission-mode", () => ({
  repoGradeAdmissionMode: mocks.mode, repoGradeDurableStartupAvailable: mocks.enabled,
}));
vi.mock("@/lib/repo-grades-dashboard/automatic-store", () => ({
  claimAutomaticRepoGrade: mocks.claim, finishAutomaticRepoGrade: mocks.finish, enqueueDueAutomaticRepoGrades: mocks.enqueueDue,
  promoteTargetedAutomaticRepoGrade: mocks.promote,
}));
vi.mock("@/lib/repo-grades-dashboard/automatic-worker", () => ({ createAutomaticRepoGradeWorker: mocks.factory }));
vi.mock("@/lib/supabase/owner-context", () => ({
  resolveImpersonationIdentity: mocks.resolve, runAsOwner: mocks.runAsOwner,
}));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ auth: { admin: { getUserById: mocks.getUserById } } }) }));

import { GET } from "./route";

const accountId = "11111111-1111-4111-8111-111111111111";
const courseId = "22222222-2222-4222-8222-222222222222";
const runId = "33333333-3333-4333-8333-333333333333";
const work = { accountId, courseId, runId, phase: "discovering" } as const;
const request = (authorization: string) =>
  new Request("https://example.test/api/cron/run-repo-grades?account=foreign", { headers: { authorization } });

describe("durable repository grading worker route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("CRON_SECRET", "server-only-test-secret");
    mocks.mode.mockReturnValue("coordinated");
    mocks.factory.mockReturnValue(mocks.worker);
    mocks.enabled.mockReturnValue(true);
    mocks.enqueueDue.mockResolvedValue({ accepted: 0, failed: 0 });
    mocks.promote.mockResolvedValue(false);
    mocks.claim.mockResolvedValueOnce(work).mockResolvedValue(null);
    mocks.finish.mockResolvedValue(true);
    mocks.getUserById.mockResolvedValue({ data: { user: { id: accountId, email: "owner@example.test", email_confirmed_at: "verified" } } });
    mocks.resolve.mockResolvedValue({ id: accountId, role: "owner" });
    mocks.runAsOwner.mockImplementation((_identity, callback) => callback());
    mocks.worker.mockResolvedValue({ state: "scanned", targets: [] });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("requires a configured secret and a matching bearer before claiming", async () => {
    expect((await GET(request("Bearer wrong"))).status).toBe(401);
    vi.stubEnv("CRON_SECRET", undefined);
    expect((await GET(request("Bearer server-only-test-secret"))).status).toBe(500);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.enqueueDue).not.toHaveBeenCalled();
  });

  it("keeps worker work disabled during a dark rollout", async () => {
    mocks.enabled.mockReturnValue(false);
    const response = await GET(request("Bearer server-only-test-secret"));
    expect(await response.json()).toEqual({ status: "disabled" });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.enqueueDue).not.toHaveBeenCalled();
  });

  it("uses the stored account and fences settlement with the same random lease", async () => {
    const started = Date.now();
    const response = await GET(request("Bearer server-only-test-secret"));
    expect(await response.json()).toEqual({ status: "ok", handled: 1, scheduled: { accepted: 0, failed: 0 } });
    expect(mocks.getUserById).toHaveBeenCalledWith(accountId);
    expect(mocks.resolve).toHaveBeenCalledWith(accountId, "owner@example.test", true);
    const [lease] = mocks.claim.mock.calls[0];
    expect(mocks.worker).toHaveBeenCalledWith(work, lease);
    expect(mocks.finish).toHaveBeenCalledWith(work, lease, { state: "scanned", targets: [] });
    const [mode, options] = mocks.factory.mock.calls[0];
    expect(mode).toBe("coordinated");
    expect(options.deadlineMs).toBeGreaterThanOrEqual(started + 270_000);
    expect(options.deadlineMs).toBeLessThanOrEqual(Date.now() + 270_000);
  });

  it("processes queued work even when scheduled wakeup failed", async () => {
    mocks.enqueueDue.mockRejectedValue(new Error("schedule unavailable"));
    const response = await GET(request("Bearer server-only-test-secret"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "schedule-unavailable", handled: 1, scheduled: { accepted: 0, failed: 1 } });
    expect(mocks.finish).toHaveBeenCalledTimes(1);
    expect(mocks.promote.mock.invocationCallOrder[0]).toBeLessThan(mocks.enqueueDue.mock.invocationCallOrder[0]);
    expect(mocks.enqueueDue.mock.invocationCallOrder[0]).toBeLessThan(mocks.claim.mock.invocationCallOrder[0]);
  });

  it("keeps the work from running when the account no longer owns the app", async () => {
    mocks.resolve.mockResolvedValue({ id: accountId, role: "instructor" });
    await GET(request("Bearer server-only-test-secret"));
    expect(mocks.runAsOwner).not.toHaveBeenCalled();
    expect(mocks.finish).toHaveBeenCalledWith(work, expect.any(String), {
      state: "partial", reason: "owner-unavailable", targets: [],
    });
  });

  it("records an interrupted evaluation as unknown", async () => {
    const target = { ...work, phase: "grading", repo: "Example/Repo", folder: "a", ref: "main", sha: "a".repeat(40) };
    mocks.claim.mockReset().mockResolvedValueOnce(target).mockResolvedValue(null);
    mocks.worker.mockRejectedValue(new Error("interrupted"));
    await GET(request("Bearer server-only-test-secret"));
    expect(mocks.worker).toHaveBeenCalledTimes(1);
    expect(mocks.finish).toHaveBeenCalledWith(target, expect.any(String), {
      state: "unknown", reason: "worker-interrupted",
    });
  });
});
