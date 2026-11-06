import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeRepoGradeStartupBatchAction,
  planRepoGradeCourseAction,
  readRepoGradeStartupBatchAction,
  readRepoGradeStartupCoursesAction,
  readRepoGradeStartupReadinessAction,
  retryRepoGradePreparationAction,
  runRepoGradeStartupTargetAction,
  sealRepoGradeStartupBatchAction,
} from "@/app/actions/repo-grades-dashboard";
import { readSessionDiagnosticLogState, resetSessionDiagnosticLogForTests } from "@/lib/session-diagnostic-log";
import { serverRepoGradesStartupAdapter } from "./startup-adapter";
import { startRepoGradesStartup } from "./startup-coordinator";

vi.mock("@/app/actions/repo-grades-dashboard", () => ({
  closeRepoGradeStartupBatchAction: vi.fn(),
  planRepoGradeCourseAction: vi.fn(),
  readRepoGradeStartupBatchAction: vi.fn(),
  readRepoGradeStartupCoursesAction: vi.fn(),
  readRepoGradeStartupReadinessAction: vi.fn(),
  retryRepoGradePreparationAction: vi.fn(),
  runRepoGradeStartupTargetAction: vi.fn(),
  sealRepoGradeStartupBatchAction: vi.fn(),
}));

const scope = { accountId: "owner", generation: "opening" };
const { accountId, generation } = scope;
const repo = "School/Classroom";
const sourceRef = "Assignments/Main";
const commit = "b".repeat(40);
const course = (courseId: string, organization = "School") => ({ accountId, courseId, organization, displayName: courseId });

type Plan = Extract<Awaited<ReturnType<typeof planRepoGradeCourseAction>>, { status: "planned" }>;
type Preview = Plan["preview"];
type TargetState = Preview["targets"][number]["state"];

function plan(history: Preview["history"], assignments: Record<string, TargetState>): Plan {
  return {
    status: "planned",
    discovery: {
      status: "scanned", enumerationComplete: true,
      repos: [{ status: "ready", repo, sourceRef, sourceCommit: commit, folders: Object.keys(assignments) }],
    },
    execution: "runtime-unavailable",
    preview: {
      history,
      targets: Object.entries(assignments).map(([folder, state]) => ({ repo, sourceRef, commit, folder, state })),
    },
  };
}

const unattempted = { status: "blocked", reason: "runtime-unavailable" } as const;
const selector = { key: "c".repeat(64), generation: "d".repeat(64) };
type RetryResult = Awaited<ReturnType<typeof retryRepoGradePreparationAction>>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(readRepoGradeStartupBatchAction).mockResolvedValue({ status: "loaded", notice: null });
  vi.mocked(sealRepoGradeStartupBatchAction).mockResolvedValue(true);
  vi.mocked(closeRepoGradeStartupBatchAction).mockResolvedValue(true);
  vi.mocked(readRepoGradeStartupReadinessAction).mockResolvedValue({ status: "ready", accountId });
  vi.mocked(runRepoGradeStartupTargetAction).mockResolvedValue({ status: "succeeded" });
});

describe("server-backed startup runtime", () => {
  it("checks every configured class and dispatches only pinned targets with proven eligibility", async () => {
    vi.mocked(readRepoGradeStartupCoursesAction).mockResolvedValue({
      status: "complete", courses: [course("first"), course("second"), course("unknown"), course("empty"), course("unmapped", " ")],
    });
    vi.mocked(planRepoGradeCourseAction)
      .mockResolvedValueOnce(plan("complete", { changed: unattempted, unchanged: { status: "succeeded" } }))
      .mockResolvedValueOnce(plan("complete", { baseline: unattempted }))
      .mockResolvedValueOnce(plan("unknown", { missing: { status: "blocked", reason: "history-unavailable" } }))
      .mockResolvedValueOnce(plan("not-read", {}));
    const observer = vi.fn();
    const run = startRepoGradesStartup(scope, serverRepoGradesStartupAdapter, observer);
    await run.done;

    expect(readRepoGradeStartupReadinessAction).toHaveBeenCalledExactlyOnceWith(accountId);
    expect(readRepoGradeStartupCoursesAction).toHaveBeenCalledExactlyOnceWith(accountId);
    expect(vi.mocked(planRepoGradeCourseAction).mock.calls).toEqual(
      ["first", "second", "unknown", "empty"].map((id) => [id, accountId, generation]),
    );
    expect(vi.mocked(runRepoGradeStartupTargetAction).mock.calls).toEqual([
      [accountId, "first", repo, "changed", sourceRef, commit, generation],
      [accountId, "second", repo, "baseline", sourceRef, commit, generation],
    ]);
    expect(sealRepoGradeStartupBatchAction).toHaveBeenCalledExactlyOnceWith(accountId, generation, 2);
    expect(vi.mocked(sealRepoGradeStartupBatchAction).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(runRepoGradeStartupTargetAction).mock.invocationCallOrder[0]);
    expect(closeRepoGradeStartupBatchAction).toHaveBeenCalledExactlyOnceWith(accountId, generation);
    expect(observer).toHaveBeenLastCalledWith({
      phase: "incomplete",
      courses: [
        { courseId: "first", label: "first", states: [{ state: "succeeded", count: 2 }] },
        { courseId: "second", label: "second", states: [{ state: "succeeded", count: 1 }] },
        { courseId: "unknown", label: "unknown", states: [{ state: "unknown", count: 1 }] },
        { courseId: "empty", label: "empty", states: [{ state: "no-work", count: 0 }] },
        { courseId: "unmapped", label: "unmapped", states: [{ state: "not-configured", count: 0 }] },
      ],
    });
  });

  it("continues the proven unstarted tail while preserving unknown and failed results", async () => {
    const owned = course("first");
    const counts = [{ courseId: owned.courseId, state: "not-started", count: 1 }, {
      courseId: owned.courseId, state: "unknown", count: 1,
    }, { courseId: owned.courseId, state: "failed", count: 1 }] as const;
    vi.mocked(readRepoGradeStartupBatchAction).mockResolvedValue({ status: "loaded", notice: { active: false, counts: [...counts] } });
    vi.mocked(readRepoGradeStartupCoursesAction).mockResolvedValue({ status: "complete", courses: [owned] });
    vi.mocked(planRepoGradeCourseAction).mockResolvedValue(plan("complete", {
      prior: { status: "unknown" }, refused: { status: "failed" }, tail: unattempted,
    }));
    const observer = vi.fn();
    await startRepoGradesStartup(scope, serverRepoGradesStartupAdapter, observer).done;
    expect(observer).toHaveBeenLastCalledWith({
      phase: "incomplete", courses: [{ courseId: "first", label: "first", states: [
        { state: "unknown", count: 1 }, { state: "failed", count: 1 }, { state: "succeeded", count: 1 },
      ] }],
      previousBatch: { active: false, courses: [{ courseId: "first", label: "first", states: [
        { state: "not-started", count: 1 }, { state: "unknown", count: 1 }, { state: "failed", count: 1 },
      ] }] },
    });
    expect(sealRepoGradeStartupBatchAction).toHaveBeenCalledExactlyOnceWith(accountId, generation, 1);
    expect(runRepoGradeStartupTargetAction).toHaveBeenCalledExactlyOnceWith(accountId, "first", repo, "tail", sourceRef, commit, generation);
  });

  it.each([false, null])("fails closed when batch sealing returns %s", async (seal) => {
    resetSessionDiagnosticLogForTests("2026-11-05T12:00:00.000Z");
    vi.mocked(readRepoGradeStartupCoursesAction).mockResolvedValue({ status: "complete", courses: [course("first")] });
    vi.mocked(planRepoGradeCourseAction).mockResolvedValue(plan("complete", { target: unattempted }));
    if (seal === null) vi.mocked(sealRepoGradeStartupBatchAction).mockRejectedValue(new Error("private failure"));
    else vi.mocked(sealRepoGradeStartupBatchAction).mockResolvedValue(seal);
    const observer = vi.fn();
    await startRepoGradesStartup(scope, serverRepoGradesStartupAdapter, observer).done;
    expect(observer.mock.lastCall?.[0].phase).toBe("incomplete");
    expect(runRepoGradeStartupTargetAction).not.toHaveBeenCalled();
    expect(closeRepoGradeStartupBatchAction).not.toHaveBeenCalled();
    expect(readSessionDiagnosticLogState().entries.at(-1)).toMatchObject({
      operation: "repo_grades_startup_batch_seal", outcome: "failure",
      cause: seal === null ? "request-failed" : "unavailable", course: "", institution: "", error: "",
    });
  });

  it("distinguishes a complete empty class list from an unproven one", async () => {
    const observer = vi.fn();
    vi.mocked(readRepoGradeStartupCoursesAction).mockResolvedValueOnce({ status: "complete", courses: [] });
    await startRepoGradesStartup(scope, serverRepoGradesStartupAdapter, observer).done;
    expect(observer).toHaveBeenLastCalledWith({ phase: "complete", courses: [] });

    vi.mocked(readRepoGradeStartupCoursesAction).mockResolvedValueOnce({ status: "unknown", reason: "storage-unavailable" });
    await startRepoGradesStartup(scope, serverRepoGradesStartupAdapter, observer).done;
    expect(observer).toHaveBeenLastCalledWith({ phase: "incomplete", courses: [] });
    expect(planRepoGradeCourseAction).not.toHaveBeenCalled();
    expect(runRepoGradeStartupTargetAction).not.toHaveBeenCalled();
  });

  it("fences readiness and reservations to the original account and generation", async () => {
    vi.mocked(readRepoGradeStartupReadinessAction).mockResolvedValueOnce({ status: "ready", accountId: "other" });
    await startRepoGradesStartup(scope, serverRepoGradesStartupAdapter).done;
    expect(readRepoGradeStartupCoursesAction).not.toHaveBeenCalled();

    if (serverRepoGradesStartupAdapter.status !== "configured") throw new Error("Expected the server adapter to be configured");
    const runtime = await serverRepoGradesStartupAdapter.openReadyRuntime(scope);
    expect(runtime).not.toBeNull();
    const target = { accountId, courseId: "first", repo, sourceRef, sha: commit, folder: "assignment" };
    await expect(runtime!.runTarget({ scope: { ...scope, generation: "another" }, target })).resolves.toEqual({ status: "forbidden" });
    await expect(runtime!.runTarget({ scope, target: { ...target, accountId: "other" } })).resolves.toEqual({ status: "forbidden" });
    const request = { scope, courseId: target.courseId, folder: target.folder, selector };
    await expect(runtime!.retryPreparation!({ ...request, scope: { ...scope, accountId: "other" } }))
      .resolves.toMatchObject({ status: "forbidden" });
    await expect(runtime!.retryPreparation!({ ...request, scope: { ...scope, generation: "another" } }))
      .resolves.toMatchObject({ status: "forbidden" });
    expect(runRepoGradeStartupTargetAction).not.toHaveBeenCalled();
    expect(retryRepoGradePreparationAction).not.toHaveBeenCalled();
  });

  it.each(["ready", "failed", "unknown"] as const)("records only the bounded %s preparation diagnostic", async (status) => {
    resetSessionDiagnosticLogForTests("2026-11-05T12:00:00.000Z");
    vi.mocked(readRepoGradeStartupCoursesAction).mockResolvedValue({ status: "complete", courses: [course("first")] });
    vi.mocked(planRepoGradeCourseAction).mockResolvedValue(plan("complete", { assignment: unattempted }));
    vi.mocked(runRepoGradeStartupTargetAction).mockResolvedValue({
      status: status === "ready" ? "succeeded" : status, preparationDiagnostic: { status, durationMs: 123 },
    });
    await startRepoGradesStartup(scope, serverRepoGradesStartupAdapter).done;
    const entries = readSessionDiagnosticLogState().entries.filter(({ operation }) => operation === "repo_grades_startup_preparation");
    expect(entries).toEqual([{
      at: expect.any(String), surface: "grading", operation: "repo_grades_startup_preparation",
      label: "repo_grades_startup_preparation", course: "", institution: "", error: "",
      outcome: status === "ready" ? "success" : "failure", durationMs: 123,
      ...(status === "ready" ? {} : { cause: status }),
    }]);
  });

  it("discards preparation diagnostics when the startup action settles after disposal", async () => {
    resetSessionDiagnosticLogForTests("2026-11-05T12:00:00.000Z");
    vi.mocked(readRepoGradeStartupCoursesAction).mockResolvedValue({ status: "complete", courses: [course("first")] });
    vi.mocked(planRepoGradeCourseAction).mockResolvedValue(plan("complete", { assignment: unattempted }));
    let settle!: (result: Awaited<ReturnType<typeof runRepoGradeStartupTargetAction>>) => void;
    vi.mocked(runRepoGradeStartupTargetAction).mockReturnValue(new Promise((resolve) => { settle = resolve; }));
    const observer = vi.fn();
    const run = startRepoGradesStartup(scope, serverRepoGradesStartupAdapter, observer);
    await vi.waitFor(() => expect(runRepoGradeStartupTargetAction).toHaveBeenCalledTimes(1));
    run.dispose();
    observer.mockClear();
    const before = readSessionDiagnosticLogState();
    settle({ status: "failed", preparationRetry: selector, preparationDiagnostic: { status: "failed", durationMs: 123 } });
    await run.done;
    expect(observer).not.toHaveBeenCalled();
    expect(readSessionDiagnosticLogState()).toEqual(before);
    expect([...run.readSchedule()!.work.values()][0].state).toEqual({ status: "failed" });
  });

  it("does not pre-submit evaluations behind the active action and retains its feedback after Stop", async () => {
    vi.mocked(readRepoGradeStartupCoursesAction).mockResolvedValue({ status: "complete", courses: [course("first")] });
    vi.mocked(planRepoGradeCourseAction).mockResolvedValue(plan("complete", { active: unattempted, waiting: unattempted }));
    const evaluation = {
      status: "unknown" as const,
      feedbackRetention: "rubric" as const,
      unretainedResult: {
        score: 0, feedback: "Overall",
        sections: { strengths: "Strengths", improvements: "Improvements", resubmitNotice: "Resubmit", rawScore: "0/1" },
        rubric: [{ area: "Area", score: "0/1", comment: "Rubric feedback" }],
      },
    };
    let settle!: (result: typeof evaluation) => void;
    vi.mocked(runRepoGradeStartupTargetAction).mockReturnValue(new Promise((resolve) => { settle = resolve; }));

    const observer = vi.fn();
    const run = startRepoGradesStartup(scope, serverRepoGradesStartupAdapter, observer);
    await vi.waitFor(() => expect(runRepoGradeStartupTargetAction).toHaveBeenCalledTimes(1));
    run.stop();
    settle(evaluation);
    await run.done;

    expect(runRepoGradeStartupTargetAction).toHaveBeenCalledExactlyOnceWith(accountId, "first", repo, "active", sourceRef, commit, generation);
    expect(observer).toHaveBeenLastCalledWith({
      phase: "stopped",
      courses: [{ courseId: "first", label: "first", states: [{ state: "unknown", count: 1 }, { state: "stopped", count: 1 }] }],
      recoverableResults: [{ ...evaluation, target: { accountId, courseId: "first", repo, sourceRef, sha: commit, folder: "active" } }],
    });
  });

  it("offers one explicit retry per class and folder and keeps grading history and recoverable feedback", async () => {
    resetSessionDiagnosticLogForTests("2026-11-05T12:00:00.000Z");
    const owned = course("private-course");
    vi.mocked(readRepoGradeStartupCoursesAction).mockResolvedValue({ status: "complete", courses: [owned] });
    const discovered = plan("complete", { "private-folder": unattempted, feedback: unattempted });
    if (discovered.discovery.status !== "scanned") throw new Error("Expected pinned inventory");
    const expanded: Plan = {
      ...discovered,
      discovery: { ...discovered.discovery, repos: [...discovered.discovery.repos, {
        status: "ready", repo: "School/Other", sourceRef, sourceCommit: commit, folders: ["private-folder"],
      }] },
      preview: { history: "complete", targets: [...discovered.preview.targets, {
        repo: "School/Other", sourceRef, commit, folder: "private-folder", state: unattempted,
      }] },
    };
    vi.mocked(planRepoGradeCourseAction).mockResolvedValue(expanded);
    const unretainedResult = {
      score: 0, feedback: "Private feedback", rubric: [],
      sections: { strengths: "S", improvements: "I", resubmitNotice: "R", rawScore: "0/1" },
    };
    vi.mocked(runRepoGradeStartupTargetAction).mockImplementation(async (_account, _course, _repo, folder) =>
      folder === "feedback" ? { status: "unknown", unretainedResult }
        : { status: "failed", preparationRetry: selector });
    const nextSelector = { ...selector, generation: "e".repeat(64) };
    let resolveRetry!: (result: RetryResult) => void;
    vi.mocked(retryRepoGradePreparationAction)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRetry = resolve; }))
      .mockResolvedValueOnce({ status: "ready", durationMs: 35 });
    const observer = vi.fn();
    const progress = () => observer.mock.lastCall?.[0];
    const run = startRepoGradesStartup(scope, serverRepoGradesStartupAdapter, observer);
    await run.done;
    expect(retryRepoGradePreparationAction).not.toHaveBeenCalled();
    const offer = progress().preparations[0];
    expect(progress().preparations).toEqual([{
      courseId: owned.courseId, folder: "private-folder", status: "failed", canRetry: true,
    }]);
    const { courses, recoverableResults } = progress();
    expect(recoverableResults[0].unretainedResult).toEqual(unretainedResult);
    await run.retryPreparation({ ...offer, courseId: "other" });
    await run.retryPreparation({ ...offer, folder: "other" });
    expect(retryRepoGradePreparationAction).not.toHaveBeenCalled();

    const pending = run.retryPreparation(offer);
    expect(progress()).toMatchObject({ preparationRetryAvailable: false, preparations: [{ status: "retrying", canRetry: false }] });
    await run.retryPreparation(offer);
    expect(retryRepoGradePreparationAction).toHaveBeenCalledExactlyOnceWith(
      accountId, owned.courseId, "private-folder", selector.key, selector.generation,
    );
    resolveRetry({ status: "failed", durationMs: 34, preparationRetry: nextSelector });
    await pending;
    await run.retryPreparation(offer);
    expect(retryRepoGradePreparationAction).toHaveBeenCalledTimes(1);
    await run.retryPreparation(progress().preparations[0]);
    expect(retryRepoGradePreparationAction).toHaveBeenLastCalledWith(
      accountId, owned.courseId, "private-folder", selector.key, nextSelector.generation,
    );
    expect(progress()).toMatchObject({ phase: "incomplete", courses, recoverableResults, preparations: [{ status: "ready", canRetry: false }] });
    expect(runRepoGradeStartupTargetAction).toHaveBeenCalledTimes(3);
    expect(planRepoGradeCourseAction).toHaveBeenCalledTimes(1);
    const metrics = readSessionDiagnosticLogState().entries.filter(({ operation }) => operation === "repo_grades_startup_preparation_retry");
    expect(metrics).toMatchObject([
      { outcome: "failure", cause: "failed", durationMs: 34 }, { outcome: "success", durationMs: 35 },
    ]);
    expect(JSON.stringify(metrics)).not.toMatch(/private-|Private feedback|[cde]{64}/);
  });

  it.each(["unknown", "busy", "failed"] as const)("offers no retry for %s without a valid terminal selector", async (status) => {
    vi.mocked(readRepoGradeStartupCoursesAction).mockResolvedValue({ status: "complete", courses: [course("first")] });
    vi.mocked(planRepoGradeCourseAction).mockResolvedValue(plan("complete", { assignment: unattempted }));
    vi.mocked(runRepoGradeStartupTargetAction).mockResolvedValue({
      status, preparationRetry: status === "failed" ? { ...selector, generation: "malformed" } : selector,
    });
    const observer = vi.fn();
    await startRepoGradesStartup(scope, serverRepoGradesStartupAdapter, observer).done;
    expect(observer.mock.lastCall?.[0].preparations).toBeUndefined();
    expect(retryRepoGradePreparationAction).not.toHaveBeenCalled();
  });

  it.each(["transport", "disposed"] as const)("fences a %s retry and never dispatches it on reopening", async (result) => {
    resetSessionDiagnosticLogForTests("2026-11-05T12:00:00.000Z");
    vi.mocked(readRepoGradeStartupCoursesAction).mockResolvedValue({ status: "complete", courses: [course("first")] });
    vi.mocked(planRepoGradeCourseAction).mockResolvedValue(plan("complete", { assignment: unattempted }));
    vi.mocked(runRepoGradeStartupTargetAction).mockResolvedValue({ status: "explicit-retry-required", preparationRetry: selector });
    let rejectRetry!: (reason: Error) => void;
    vi.mocked(retryRepoGradePreparationAction).mockImplementation(() => new Promise((_resolve, reject) => { rejectRetry = reject; }));
    const observer = vi.fn();
    const run = startRepoGradesStartup(scope, serverRepoGradesStartupAdapter, observer);
    await run.done;
    const offer = observer.mock.lastCall?.[0].preparations[0];
    const pending = run.retryPreparation(offer);
    if (result === "disposed") {
      run.dispose();
      observer.mockClear();
    }
    rejectRetry(new Error("Private transport failure"));
    await pending;
    await run.retryPreparation(offer);
    const metrics = readSessionDiagnosticLogState().entries.filter(({ operation }) => operation === "repo_grades_startup_preparation_retry");
    if (result === "disposed") {
      expect(metrics).toEqual([]);
      expect(observer).not.toHaveBeenCalled();
    } else {
      expect(observer.mock.lastCall?.[0].preparations[0]).toMatchObject({ status: "request-failed", canRetry: false });
      expect(metrics).toMatchObject([{ outcome: "failure", cause: "request-failed", durationMs: expect.any(Number) }]);
      expect(JSON.stringify(metrics)).not.toContain("Private transport failure");
    }
    await startRepoGradesStartup({ ...scope, generation: "reopened" }, serverRepoGradesStartupAdapter).done;
    expect(retryRepoGradePreparationAction).toHaveBeenCalledTimes(1);
  });
});
