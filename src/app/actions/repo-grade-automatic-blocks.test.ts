import { beforeEach, describe, expect, it, vi } from "vitest";
import { readRepoGradeAutomaticBlocksAction } from "./repo-grade-automatic-blocks";

const mocks = vi.hoisted(() => ({
  requireAppOwner: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/repo-grades-dashboard/admission-mode", () => ({ repoGradeDurableStartupAvailable: () => true }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: mocks.requireAppOwner }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));

const owner = "00000000-0000-0000-0000-000000000001";
const course = "00000000-0000-0000-0000-000000000002";
const run = "00000000-0000-0000-0000-000000000003";
const startedAt = "2026-11-06T15:00:00.000Z";
const runRecord = {
  id: run, created_at: startedAt,
  repo_grade_automatic_courses: [{ state: "partial", reason: "access-denied" }],
};

function query(result: unknown) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    retry: vi.fn().mockResolvedValue(result),
  };
  mocks.from.mockReturnValueOnce(builder);
  return builder;
}

describe("automatic gradebook blockers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireAppOwner.mockResolvedValue({ id: owner });
    mocks.rpc.mockReturnValue({ retry: vi.fn().mockResolvedValue({ data: { total: 0, targets: [] }, error: null }) });
  });

  it("never reads blockers for a different account or a class without current ownership", async () => {
    await expect(readRepoGradeAutomaticBlocksAction("different-account", course)).resolves.toEqual({ status: "unavailable" });
    expect(mocks.from).not.toHaveBeenCalled();
    query({ data: runRecord });
    query({ data: null });
    await expect(readRepoGradeAutomaticBlocksAction(owner, course)).resolves.toEqual({ status: "unavailable" });
    expect(mocks.from).not.toHaveBeenCalledWith("repo_grade_automatic_targets");
  });

  it("uses the latest class run even if a later account run excluded the class", async () => {
    const runQuery = query({ data: runRecord });
    const courseQuery = query({ data: { id: course } });
    const targetQuery = query({ data: [
      { repo: "school/one", folder: "Lab", source_ref: "work", state: "blocked", reason: "configuration-changed" },
      { repo: "school/two", folder: "Lab", source_ref: "main", state: "blocked", reason: "Private upstream error", recovery: "not visible" },
      { repo: "school/three", folder: "Lab", source_ref: "main", state: "embedded-profile-required", reason: null },
      { repo: "school/four", folder: "Lab", source_ref: "main", state: "partial", reason: "grading-source-rate-limited" },
    ], count: 4 });
    const result = await readRepoGradeAutomaticBlocksAction(owner, course);
    expect(runQuery.select).toHaveBeenCalledWith("id,created_at,repo_grade_automatic_courses!inner(state,reason)");
    expect(runQuery.eq.mock.calls).toEqual([["user_id", owner], ["repo_grade_automatic_courses.course_id", course]]);
    expect(runQuery.order.mock.calls).toEqual([["created_at", { ascending: false }], ["id", { ascending: false }]]);
    expect(runQuery.limit).toHaveBeenCalledWith(1);
    expect(courseQuery.eq.mock.calls).toEqual([["id", course], ["user_id", owner]]);
    expect(targetQuery.eq.mock.calls).toEqual([["run_id", run], ["course_id", course]]);
    expect(targetQuery.in).toHaveBeenCalledWith("state", ["blocked", "embedded-profile-required", "partial", "no-submission"]);
    expect(result).toEqual({
      status: "loaded",
      run: { id: run, startedAt, discoveryExplanation: expect.stringContaining("GitHub denied access") },
      targets: [
        { repo: "school/one", folder: "Lab", sourceRef: "work", runStartedAt: startedAt, explanation: expect.stringContaining("saved grading settings changed") },
        { repo: "school/two", folder: "Lab", sourceRef: "main", runStartedAt: startedAt, explanation: "The worker did not provide a recognized reason." },
        { repo: "school/three", folder: "Lab", sourceRef: "main", runStartedAt: startedAt, explanation: expect.stringContaining("Save an Embedded grading profile") },
        { repo: "school/four", folder: "Lab", sourceRef: "main", runStartedAt: startedAt, partial: true, explanation: expect.stringContaining("GitHub rate-limited the worker") },
      ],
    });
  });

  it("returns a persisted no-submission target for the owning class after reload", async () => {
    query({ data: runRecord });
    query({ data: { id: course } });
    query({ data: [{ repo: "school/empty", folder: "Lab", source_ref: "main", source_sha: "a".repeat(40), state: "no-submission", reason: null }], count: 1 });
    mocks.rpc.mockReturnValue({ retry: vi.fn().mockResolvedValue({ data: { total: 1, targets: [{ repo: "school/empty", folder: "Lab",
      source_ref: "main", source_sha: "a".repeat(40), run_started_at: startedAt, observed_source_ref: "main",
      observed_source_sha: "a".repeat(40), observed_state: "no-submission", observed_run_started_at: startedAt, reason: null }] }, error: null }) });
    expect(await readRepoGradeAutomaticBlocksAction(owner, course)).toMatchObject({ status: "loaded", targets: [
      { repo: "school/empty", folder: "Lab", noSubmission: true, sourceSha: "a".repeat(40), runStartedAt: startedAt },
    ] });
  });

  it("retains the exact pin only for a verified prior-attempt target", async () => {
    query({ data: runRecord }); query({ data: { id: course } });
    query({ data: [{ repo: "school/one", folder: "Lab", source_ref: "main", source_sha: "a".repeat(40), state: "partial", reason: "prior-attempt" }], count: 1 });
    expect(await readRepoGradeAutomaticBlocksAction(owner, course)).toMatchObject({ targets: [
      { repo: "school/one", priorAttempt: true, sourceSha: "a".repeat(40), runStartedAt: startedAt },
    ] });
  });

  it("keeps an older cell's no-submission after a newer targeted run touched a different cell", async () => {
    const newerRun = { ...runRecord, created_at: "2026-11-07T15:00:00.000Z" };
    query({ data: newerRun });
    query({ data: { id: course } });
    query({ data: [{ repo: "school/other", folder: "Other", source_ref: "main", state: "blocked", reason: "access-denied" }], count: 1 });
    mocks.rpc.mockReturnValue({ retry: vi.fn().mockResolvedValue({ data: { total: 1, targets: [{ repo: "school/empty", folder: "Lab",
      source_ref: "main", source_sha: "a".repeat(40), run_started_at: startedAt, observed_source_ref: "main",
      observed_source_sha: "a".repeat(40), observed_state: "no-submission", observed_run_started_at: startedAt, reason: null }] }, error: null }) });
    expect(await readRepoGradeAutomaticBlocksAction(owner, course)).toMatchObject({ status: "loaded", targets: [
      { repo: "school/other", folder: "Other" },
      { repo: "school/empty", folder: "Lab", noSubmission: true, runStartedAt: startedAt },
    ] });
    expect(mocks.rpc).toHaveBeenCalledWith("repo_grade_latest_no_submission_targets", { p_user_id: owner, p_course_id: course });
  });

  it.each(["blocked", "partial", "running"])('marks an older empty result as stale for a newer %s pin', async (state) => {
    query({ data: runRecord });
    query({ data: { id: course } });
    query({ data: [], count: 0 });
    mocks.rpc.mockReturnValue({ retry: vi.fn().mockResolvedValue({ data: { total: 1, targets: [{
      repo: "school/empty", folder: "Lab", source_ref: "main", source_sha: "a".repeat(40), run_started_at: startedAt,
      observed_source_ref: "main", observed_source_sha: "b".repeat(40), observed_state: state,
      observed_run_started_at: "2026-11-07T15:00:00.000Z", reason: null,
    }] }, error: null }) });
    expect(await readRepoGradeAutomaticBlocksAction(owner, course)).toMatchObject({ status: "loaded", targets: [{
      noSubmission: true, noSubmissionStale: true, observedSourceSha: "b".repeat(40), observedState: state,
    }] });
  });

  it("keeps an empty result current when a newer inconclusive check uses the same pin", async () => {
    query({ data: runRecord });
    query({ data: { id: course } });
    query({ data: [], count: 0 });
    mocks.rpc.mockReturnValue({ retry: vi.fn().mockResolvedValue({ data: { total: 1, targets: [{
      repo: "school/empty", folder: "Lab", source_ref: "main", source_sha: "a".repeat(40), run_started_at: startedAt,
      observed_source_ref: "main", observed_source_sha: "a".repeat(40), observed_state: "running",
      observed_run_started_at: "2026-11-07T15:00:00.000Z", reason: null,
    }] }, error: null }) });
    const result = await readRepoGradeAutomaticBlocksAction(owner, course);
    expect(result.status).toBe("loaded");
    if (result.status !== "loaded") throw new Error("Expected loaded status");
    expect(result.targets[0]).not.toHaveProperty("noSubmissionStale");
  });

  it("marks only an atomically settled explicit empty regrade as an overwrite", async () => {
    query({ data: runRecord });
    query({ data: { id: course } });
    query({ data: [], count: 0 });
    mocks.rpc.mockReturnValue({ retry: vi.fn().mockResolvedValue({ data: { total: 1, targets: [{
      repo: "school/empty", folder: "Lab", source_ref: "main", source_sha: "a".repeat(40), run_started_at: startedAt,
      observed_source_ref: "main", observed_source_sha: "a".repeat(40), observed_state: "no-submission",
      observed_run_started_at: startedAt, reason: "verified-empty-explicit",
    }] }, error: null }) });
    expect(await readRepoGradeAutomaticBlocksAction(owner, course)).toMatchObject({ status: "loaded", targets: [
      { repo: "school/empty", noSubmission: true, noSubmissionExplicit: true },
    ] });
  });

  it("fails closed when the durable empty-result projection is unavailable or malformed", async () => {
    for (const response of [{ error: { code: "temporary" } }, { data: { total: 1, targets: [{ repo: "school/one" }] }, error: null },
      { data: { total: 1001, targets: [] }, error: null }, { data: { total: 2, targets: [] }, error: null }]) {
      query({ data: runRecord });
      query({ data: { id: course } });
      query({ data: [], count: 0 });
      mocks.rpc.mockReturnValue({ retry: vi.fn().mockResolvedValue(response) });
      expect(await readRepoGradeAutomaticBlocksAction(owner, course)).toEqual({ status: "unavailable" });
    }
  });

  it("returns no blocker history for a class never included in a run", async () => {
    query({ data: null });
    query({ data: { id: course } });
    await expect(readRepoGradeAutomaticBlocksAction(owner, course)).resolves.toEqual({
      status: "loaded", run: null, targets: [],
    });
    expect(mocks.from).not.toHaveBeenCalledWith("repo_grade_automatic_targets");
  });

  it("shows the first observed README example only on the owner-scoped result", async () => {
    query({ data: runRecord });
    query({ data: { id: course } });
    query({ data: [{ repo: "school/one", folder: "Lab", source_ref: "main", state: "blocked",
      reason: "missing-instruction-evidence", readme_example: { kind: "absent", repo: "school/two" } }], count: 1 });
    const result = await readRepoGradeAutomaticBlocksAction(owner, course);
    expect(result).toMatchObject({ status: "loaded", targets: [{
      explanation: expect.stringContaining("First observed example: school/two"),
    }] });
  });

  it("a repeated read can recover from a transient error without changing grading state", async () => {
    query({ data: runRecord });
    query({ data: { id: course } });
    query({ error: { code: "temporary failure" } });
    await expect(readRepoGradeAutomaticBlocksAction(owner, course)).resolves.toEqual({ status: "unavailable" });
    query({ data: runRecord });
    query({ data: { id: course } });
    query({ data: [], count: 0 });
    await expect(readRepoGradeAutomaticBlocksAction(owner, course)).resolves.toMatchObject({
      status: "loaded", run: { id: run }, targets: [],
    });
  });

  it("does not return partial coverage as complete if the API silently caps the result", async () => {
    query({ data: runRecord });
    query({ data: { id: course } });
    query({ data: [], count: 1 });
    await expect(readRepoGradeAutomaticBlocksAction(owner, course)).resolves.toEqual({ status: "unavailable" });
  });
});
