import { beforeEach, describe, expect, it, vi } from "vitest";
import { readRepoGradeAutomaticBlocksAction } from "./repo-grade-automatic-blocks";

const mocks = vi.hoisted(() => ({
  requireAppOwner: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/repo-grades-dashboard/admission-mode", () => ({ repoGradeDurableStartupAvailable: () => true }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: mocks.requireAppOwner }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ from: mocks.from }) }));

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
    expect(targetQuery.in).toHaveBeenCalledWith("state", ["blocked", "embedded-profile-required", "partial"]);
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

  it("returns no blocker history for a class never included in a run", async () => {
    query({ data: null });
    query({ data: { id: course } });
    await expect(readRepoGradeAutomaticBlocksAction(owner, course)).resolves.toEqual({
      status: "loaded", run: null, targets: [],
    });
    expect(mocks.from).not.toHaveBeenCalledWith("repo_grade_automatic_targets");
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
