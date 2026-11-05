import { describe, expect, it } from "vitest";
import {
  createRepoGradeStartupSchedule as createSchedule,
  repoGradeStartupKey as key,
  reserveNextRepoGradeStartupTarget as reserve,
  settleRepoGradeStartupTarget as settle,
  stopRepoGradeStartupSchedule as stop,
  type RepoGradeStartupTarget,
} from "./scheduler";
import type { RepoGradeSourceRow } from "./discovery";

const scope = { accountId: "owner", generation: "opening-a" };
const target: RepoGradeStartupTarget = {
  accountId: scope.accountId, courseId: "class-a", repo: "Org/repo",
  sourceRef: "main", sha: "a".repeat(40), folder: "work/1",
};

function inventory(
  courseId = target.courseId, rows: RepoGradeSourceRow[] = [source()], enumerationComplete = true,
) {
  return {
    accountId: scope.accountId,
    organization: "Org",
    courseId,
    discovery: { status: "scanned" as const, enumerationComplete, repos: rows },
  };
}

function source(overrides: Partial<RepoGradeStartupTarget> = {}): Extract<RepoGradeSourceRow, { status: "ready" }> {
  const { repo, sourceRef, sha, folder } = { ...target, ...overrides };
  return { status: "ready", repo, sourceRef, sourceCommit: sha, folders: [folder] };
}

function neverAttempted(targets: RepoGradeStartupTarget[]) {
  return new Map(targets.map((item) => [key(item), "never-attempted"] as const));
}

function requireReservation(state: ReturnType<typeof createSchedule>) {
  const result = reserve(state, state.scope);
  if (!result) throw new Error("Expected available startup work");
  return result;
}

describe("Repo Grades startup scheduler", () => {
  it("takes work from every owned configured course and excludes untrusted or incomplete inventories", () => {
    const otherCourse = { ...target, courseId: "class-b" };
    const incompleteCourse = { ...target, courseId: "incomplete" };
    const mappingOnly = { ...target, courseId: "mapping-only" };
    const foreign = { ...target, accountId: "another-owner", courseId: "foreign" };
    const partial = { ...target, repo: "Org/partial" };
    const { repo, sourceRef, sourceCommit } = source(partial);
    const plan = createSchedule(scope, [
      inventory(otherCourse.courseId),
      { ...inventory(foreign.courseId), accountId: foreign.accountId },
      { ...inventory(mappingOnly.courseId), organization: "  " },
      inventory(incompleteCourse.courseId, [source()], false),
      inventory(target.courseId, [source(), { repo, sourceRef, sourceCommit, status: "partial", reason: "tree-truncated" }]),
    ], neverAttempted([target, otherCourse, incompleteCourse, mappingOnly, foreign, partial]), true);

    expect(plan.courses.find(({ courseId }) => courseId === mappingOnly.courseId)?.discovery).toEqual({ status: "not-configured" });
    expect(plan.courses.find(({ courseId }) => courseId === incompleteCourse.courseId)?.discovery).toMatchObject({
      status: "scanned", enumerationComplete: false,
    });
    const first = requireReservation(plan);
    const second = requireReservation(first.state);
    expect(first.reservation.target).toEqual(target);
    expect(second.reservation.target).toEqual(otherCourse);
    expect(reserve(second.state, scope)).toBeNull();
  });

  it("keys observations by account, course, GitHub repo, exact ref, SHA, and exact folder", () => {
    expect(key({ ...target, repo: "org/REPO" })).toBe(key(target));
    for (const overrides of [
      { accountId: "other" }, { courseId: "other" }, { repo: "Org/other" },
      { sourceRef: "Main" }, { sha: "b".repeat(40) }, { folder: "Work/1" },
    ]) {
      expect(key({ ...target, ...overrides })).not.toBe(key(target));
    }
  });

  it("preserves each folder's durable outcome and evaluates only newly observed work on restart", () => {
    const statuses = ["succeeded", "no-submission", "partial", "failed", "unknown", "claimed"] as const;
    const previous = statuses.map((status) => ({ ...target, folder: status }));
    const changed = { ...previous[0], sha: "b".repeat(40) };
    const unproven = { ...target, folder: "unproven" };
    const history = new Map(statuses.map((status, index) => [key(previous[index]), status] as const));
    const plan = createSchedule(
      scope,
      [inventory(target.courseId, [...previous, unproven, changed].map(source))],
      new Map([...history, ...neverAttempted([changed])]),
      true,
    );

    for (const item of previous) expect(plan.work.get(key(item))?.state.status).toBe(item.folder);
    expect(plan.work.get(key(unproven))?.state).toEqual({ status: "blocked", reason: "history-unavailable" });
    const next = requireReservation(plan);
    expect(next.reservation.target).toEqual(changed);
    expect(reserve(next.state, scope)).toBeNull();
  });

  it("enforces one fixed local budget across classes and retires ambiguous or denied requests", () => {
    const targets = ["class-a", "class-b", "class-c", "class-d"].map((courseId) => ({ ...target, courseId }));
    const plan = createSchedule(scope, targets.map(({ courseId }) => inventory(courseId)), neverAttempted(targets), true);
    const first = requireReservation(plan);
    const second = requireReservation(first.state);
    const third = requireReservation(second.state);
    expect(reserve(third.state, scope)).toBeNull();

    const uncertain = settle(third.state, first.reservation, "storage-unavailable");
    expect(uncertain.work.get(key(targets[0]))?.state).toEqual({ status: "unknown" });
    const last = requireReservation(uncertain);
    expect(last.reservation.target).toEqual(targets[3]);
    const denied = settle(last.state, last.reservation, "capacity");
    expect(denied.work.get(key(targets[3]))?.state).toEqual({ status: "blocked", reason: "capacity" });
    expect(reserve(denied, scope)).toBeNull();
  });

  it("stops future reservations while accepting running completions only for the matching generation", () => {
    const other = { ...target, folder: "work/2" };
    const courses = [inventory(target.courseId, [source(), source(other)])];
    const history = neverAttempted([target, other]);
    const first = requireReservation(createSchedule(scope, courses, history, true));
    const stopped = stop(first.state, scope);
    expect(reserve(stopped, scope)).toBeNull();
    expect(stopped.work.get(key(target))?.state.status).toBe("running");
    const finished = settle(stopped, first.reservation, "no-submission");
    expect(finished.work.get(key(target))?.state.status).toBe("no-submission");
    expect(finished.work.get(key(other))?.state.status).toBe("queued");
    expect(settle(finished, first.reservation, "succeeded")).toBe(finished);
    expect(reserve(finished, scope)).toBeNull();

    const replacement = requireReservation(createSchedule({ ...scope, generation: "opening-b" }, courses, history, true));
    expect(settle(replacement.state, first.reservation, "succeeded")).toBe(replacement.state);
    expect(reserve(replacement.state, scope)).toBeNull();
    expect(stop(replacement.state, scope)).toBe(replacement.state);
    expect(stop(replacement.state, { ...replacement.state.scope, accountId: "other" })).toBe(replacement.state);
  });

  it("blocks dispatch without an installed runtime and never infers a grade from a terminal denial", () => {
    const history = neverAttempted([target]);
    const plan = createSchedule(scope, [inventory()], history, false);
    expect(plan.work.get(key(target))?.state).toEqual({ status: "blocked", reason: "runtime-unavailable" });
    expect(reserve(plan, scope)).toBeNull();

    const active = requireReservation(createSchedule(scope, [inventory()], history, true));
    const terminal = settle(active.state, active.reservation, "terminal");
    expect(terminal.work.get(key(target))?.state).toEqual({ status: "terminal" });
    expect(reserve(terminal, scope)).toBeNull();
  });
});
