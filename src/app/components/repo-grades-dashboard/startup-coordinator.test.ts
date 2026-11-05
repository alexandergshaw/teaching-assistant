import { describe, expect, it, vi } from "vitest";
import { repoGradeStartupKey } from "@/lib/repo-grades-dashboard/scheduler";
import { readSessionDiagnosticLogState, resetSessionDiagnosticLogForTests } from "@/lib/session-diagnostic-log";
import {
  disabledRepoGradesStartupAdapter,
  startRepoGradesStartup,
  type RepoGradesStartupAdapter,
} from "./startup-coordinator";
import type { RepoGradesStartupProgress } from "./startup-progress";

type ConfiguredAdapter = Extract<RepoGradesStartupAdapter, { status: "configured" }>;
type Runtime = NonNullable<Awaited<ReturnType<ConfiguredAdapter["openReadyRuntime"]>>>;

const scope = { accountId: "a", generation: "first" };
const owned = (courseId: string, organization = "org", accountId = "a") => ({ accountId, courseId, organization });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function scanned(courseId: string, folders = ["assignment"]): Awaited<ReturnType<Runtime["discoverCourse"]>> {
  return {
    status: "scanned",
    enumerationComplete: true,
    repos: [{ status: "ready", repo: `org/${courseId}`, sourceRef: "main", sourceCommit: "sha", folders }],
  };
}

function setup(courses = [owned("one")], accountId = "a") {
  const loadOwnedCourses = vi.fn<Runtime["loadOwnedCourses"]>().mockResolvedValue(courses);
  const discoverCourse = vi.fn<Runtime["discoverCourse"]>(async (courseId) => scanned(courseId));
  const loadDurableHistory = vi.fn<Runtime["loadDurableHistory"]>(async (targets) =>
    new Map(targets.map((target) => [repoGradeStartupKey(target), "never-attempted"])),
  );
  const runTarget = vi.fn<Runtime["runTarget"]>().mockResolvedValue("succeeded");
  const openReadyRuntime = vi.fn<ConfiguredAdapter["openReadyRuntime"]>().mockResolvedValue({
    accountId, loadOwnedCourses, discoverCourse, loadDurableHistory, runTarget,
  });
  const adapter: ConfiguredAdapter = { status: "configured", openReadyRuntime };
  return { adapter, openReadyRuntime, loadOwnedCourses, discoverCourse, loadDurableHistory, runTarget };
}

describe("Repo Grades app startup coordinator", () => {
  it("completes a successful class scan with no targets and skips history and evaluation", async () => {
    const fake = setup();
    fake.discoverCourse.mockResolvedValue(scanned("one", []));
    const observer = vi.fn<(progress: RepoGradesStartupProgress) => void>();
    await startRepoGradesStartup(scope, fake.adapter, observer).done;
    expect(observer).toHaveBeenLastCalledWith({
      phase: "complete",
      courses: [{ courseId: "one", label: "Class 1", states: [{ state: "no-work", count: 0 }] }],
    });
    expect(fake.loadDurableHistory).not.toHaveBeenCalled();
    expect(fake.runTarget).not.toHaveBeenCalled();
  });

  it("distinguishes an already-processed target from known success and no submission", async () => {
    const fake = setup();
    fake.discoverCourse.mockResolvedValue(scanned("one", ["a", "b", "c"]));
    fake.runTarget
      .mockResolvedValueOnce("terminal")
      .mockResolvedValueOnce("succeeded")
      .mockResolvedValueOnce("no-submission");
    const observer = vi.fn<(progress: RepoGradesStartupProgress) => void>();
    await startRepoGradesStartup(scope, fake.adapter, observer).done;
    expect(observer.mock.lastCall?.[0].courses[0].states).toEqual([
      { state: "already-processed", count: 1 },
      { state: "succeeded", count: 1 },
      { state: "no-submission", count: 1 },
    ]);
  });

  it("reports per-class discovery, pending work, and running settlements after stop", async () => {
    const fake = setup([owned("one"), owned("mapping-only", "")]);
    fake.discoverCourse.mockResolvedValue(scanned("one", ["a", "b", "c", "d"]));
    const outcome = deferred<"partial">();
    fake.runTarget.mockReturnValue(outcome.promise);
    const updates: RepoGradesStartupProgress[] = [];
    const run = startRepoGradesStartup(scope, fake.adapter, (progress) => updates.push(progress));
    await vi.waitFor(() => expect(fake.runTarget).toHaveBeenCalledTimes(3));

    const states = () => updates.at(-1)?.courses[0].states;
    expect(updates.some(({ courses }) => courses[0]?.states[0].state === "checking")).toBe(true);
    expect(updates.some(({ courses }) => courses[0]?.states[0].state === "queued")).toBe(true);
    expect(states()).toEqual([{ state: "running", count: 3 }, { state: "queued", count: 1 }]);
    run.stop();
    expect(updates.at(-1)?.phase).toBe("stopped");
    expect(states()).toEqual([{ state: "running", count: 3 }, { state: "stopped", count: 1 }]);
    outcome.resolve("partial");
    await run.done;
    expect(states()).toEqual([{ state: "partial", count: 3 }, { state: "stopped", count: 1 }]);
    expect(updates.at(-1)?.courses[1].states).toEqual([{ state: "not-configured", count: 0 }]);
    expect(fake.runTarget).toHaveBeenCalledTimes(3);
  });

  it("fences a disposed generation's notifications and diagnostics while preserving its settlement", async () => {
    resetSessionDiagnosticLogForTests(new Date().toISOString());
    const fake = setup();
    const outcome = deferred<"succeeded">();
    fake.runTarget.mockReturnValue(outcome.promise);
    const observer = vi.fn();
    const run = startRepoGradesStartup(scope, fake.adapter, observer);
    await vi.waitFor(() => expect(fake.runTarget).toHaveBeenCalledTimes(1));
    run.dispose();
    observer.mockClear();
    const before = readSessionDiagnosticLogState();
    outcome.resolve("succeeded");
    await run.done;
    expect(observer).not.toHaveBeenCalled();
    expect(readSessionDiagnosticLogState()).toEqual(before);
    expect([...run.readSchedule()!.work.values()][0].state).toEqual({ status: "succeeded" });
  });

  it("publishes disabled readiness and stores only fixed diagnostic categories and aggregate counts", async () => {
    resetSessionDiagnosticLogForTests(new Date().toISOString());
    const observer = vi.fn();
    await startRepoGradesStartup(scope, disabledRepoGradesStartupAdapter, observer).done;
    expect(observer).toHaveBeenLastCalledWith({ phase: "unavailable", courses: [] });
    expect(readSessionDiagnosticLogState().entries).toEqual([]);

    const fake = setup([owned("private-course"), owned("private-discovery")]);
    fake.discoverCourse.mockRejectedValueOnce(new Error("secret-discovery-exception"));
    fake.runTarget.mockRejectedValueOnce(new Error("secret-evaluation-exception"));
    await startRepoGradesStartup(scope, fake.adapter, observer).done;
    const { entries } = readSessionDiagnosticLogState();
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: "repo_grades_startup_discovery", outcome: "failure", cause: "request-failed" }),
      expect.objectContaining({ operation: "repo_grades_startup_history", outcome: "success", detail: { itemCount: 1 } }),
      expect.objectContaining({ operation: "repo_grades_startup_evaluation", outcome: "failure", cause: "request-failed" }),
    ]));
    expect(JSON.stringify(entries)).not.toMatch(/private-|secret-|assignment|org\//);
    expect(observer.mock.lastCall?.[0].courses.map((course: RepoGradesStartupProgress["courses"][number]) => course.states[0].state))
      .toEqual(["blocked", "unknown"]);
  });

  it("starts no server work with the disabled default, missing readiness or the wrong owner", async () => {
    const fake = setup();
    const disabled = { ...fake.adapter, ...disabledRepoGradesStartupAdapter };
    const local = startRepoGradesStartup(scope, disabled);
    await local.done;
    expect(local.readSchedule()).toBeNull();
    expect(fake.openReadyRuntime).not.toHaveBeenCalled();

    fake.openReadyRuntime.mockResolvedValueOnce(null);
    await startRepoGradesStartup(scope, fake.adapter).done;
    const wrongOwner = setup([owned("one", "org", "b")], "b");
    await startRepoGradesStartup(scope, wrongOwner.adapter).done;
    for (const dependency of [fake, wrongOwner]) {
      expect(dependency.loadOwnedCourses).not.toHaveBeenCalled();
      expect(dependency.discoverCourse).not.toHaveBeenCalled();
      expect(dependency.runTarget).not.toHaveBeenCalled();
    }
  });

  it("checks every owned configured course, even when one discovery fails, and requires an explicit history observation", async () => {
    const fake = setup([
      owned("one"), owned("two"), owned("two"), owned("broken"), owned("mapping-only", "  "), owned("foreign", "org", "b"),
    ]);
    fake.discoverCourse.mockImplementation(async (id) => {
      if (id === "broken") throw new Error("discovery failed");
      return scanned(id, id === "one" ? ["changed", "unchanged", "missing-history"] : ["baseline"]);
    });
    fake.loadDurableHistory.mockImplementation(async (targets) => {
      expect(targets.map(({ courseId, folder }) => [courseId, folder])).toEqual([
        ["one", "changed"], ["one", "missing-history"], ["one", "unchanged"], ["two", "baseline"],
      ]);
      return new Map(targets.flatMap((target) => {
        if (target.folder === "missing-history") return [];
        return [[repoGradeStartupKey(target), target.folder === "unchanged" ? "succeeded" : "never-attempted"]];
      }));
    });
    const run = startRepoGradesStartup(scope, fake.adapter);
    await run.done;

    expect(fake.discoverCourse.mock.calls).toEqual([["one"], ["two"], ["broken"]]);
    expect(fake.runTarget.mock.calls.map(([{ target }]) => [target.courseId, target.folder])).toEqual([
      ["one", "changed"], ["two", "baseline"],
    ]);
    expect(run.readSchedule()?.courses.map(({ courseId, discovery }) => [courseId, discovery.status])).toEqual([
      ["one", "scanned"], ["two", "scanned"], ["broken", "blocked"], ["mapping-only", "not-configured"],
    ]);
    expect([...run.readSchedule()!.work.values()].find(({ target }) => target.folder === "missing-history")?.state)
      .toEqual({ status: "blocked", reason: "history-unavailable" });
  });

  it("keeps evaluation blocked if the durable history read rejects", async () => {
    const fake = setup();
    fake.loadDurableHistory.mockRejectedValue(new Error("unavailable"));
    const run = startRepoGradesStartup(scope, fake.adapter);
    await run.done;
    expect(fake.discoverCourse).toHaveBeenCalledWith("one");
    expect(fake.runTarget).not.toHaveBeenCalled();
    expect([...run.readSchedule()!.work.values()][0].state).toEqual({ status: "blocked", reason: "history-unavailable" });
  });

  it("reserves distinct requests up to capacity and advances after simultaneous settlements", async () => {
    const fake = setup();
    fake.discoverCourse.mockResolvedValue(scanned("one", ["a", "b", "c", "d", "e"]));
    const gate = deferred<"succeeded">();
    fake.runTarget.mockReturnValue(gate.promise);
    const run = startRepoGradesStartup(scope, fake.adapter);
    await vi.waitFor(() => expect(fake.runTarget).toHaveBeenCalledTimes(3));
    expect(fake.runTarget.mock.calls.map(([r]) => r.target.folder)).toEqual(["a", "b", "c"]);
    gate.resolve("succeeded");
    await run.done;
    expect(fake.runTarget.mock.calls.map(([r]) => r.target.folder)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("stops new dispatch on teardown and retains a late outcome only on its original generation", async () => {
    const original = setup();
    original.discoverCourse.mockResolvedValue(scanned("one", ["a", "b", "c", "d"]));
    const late = deferred<"partial">();
    original.runTarget.mockReturnValue(late.promise);
    const first = startRepoGradesStartup(scope, original.adapter);
    await vi.waitFor(() => expect(original.runTarget).toHaveBeenCalledTimes(3));
    first.stop();

    const other = setup([owned("one", "org", "b")], "b");
    const secondScope = { accountId: "b", generation: "second" };
    const second = startRepoGradesStartup(secondScope, other.adapter);
    await second.done;
    second.stop();

    const returning = setup();
    returning.discoverCourse.mockResolvedValue(scanned("one", ["a"]));
    const thirdScope = { ...scope, generation: "third" };
    const third = startRepoGradesStartup(thirdScope, returning.adapter);
    await third.done;
    late.resolve("partial");
    await first.done;

    expect(original.runTarget.mock.calls.map(([r]) => r.scope)).toEqual([scope, scope, scope]);
    expect(other.runTarget.mock.calls.map(([r]) => r.scope)).toEqual([secondScope]);
    expect(returning.runTarget.mock.calls.map(([r]) => r.scope)).toEqual([thirdScope]);
    expect([...first.readSchedule()!.work.values()].map(({ state }) => state.status))
      .toEqual(["partial", "partial", "partial", "queued"]);
    expect([...third.readSchedule()!.work.values()].map(({ state }) => state.status)).toEqual(["succeeded"]);
  });

  it("stops a discarded mount before preflight and stops an interrupted discovery before the next course", async () => {
    const fake = setup([owned("one"), owned("two")]);
    const discarded = startRepoGradesStartup(scope, fake.adapter);
    discarded.stop();
    await discarded.done;
    expect(fake.openReadyRuntime).not.toHaveBeenCalled();

    const gate = deferred<Awaited<ReturnType<Runtime["discoverCourse"]>>>();
    fake.discoverCourse.mockReturnValueOnce(gate.promise);
    const run = startRepoGradesStartup(scope, fake.adapter);
    await vi.waitFor(() => expect(fake.discoverCourse).toHaveBeenCalledWith("one"));
    run.stop();
    gate.resolve(scanned("one"));
    await run.done;
    expect(fake.discoverCourse).toHaveBeenCalledTimes(1);
    expect(fake.loadDurableHistory).not.toHaveBeenCalled();
    expect(fake.runTarget).not.toHaveBeenCalled();
  });
});
