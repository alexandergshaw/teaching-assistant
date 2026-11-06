import {
  createRepoGradeStartupSchedule,
  reserveNextRepoGradeStartupTarget,
  settleRepoGradeStartupTarget,
  stopRepoGradeStartupSchedule,
  type RepoGradeStartupScope,
  type RepoGradeStartupTarget,
} from "@/lib/repo-grades-dashboard/scheduler";
import { recordRepoGradesStartup, recordRepoGradesStartupPreparation } from "./startup-diagnostics";
import type {
  CourseStartupProgress, CourseStartupState, RepoGradesStartupPreparation, RepoGradesStartupPreparationResult,
  RepoGradesStartupProgress, RepoGradesStartupRecovery,
} from "./startup-progress";

type Schedule = ReturnType<typeof createRepoGradeStartupSchedule>;
type Inventory = Schedule["courses"][number];
type OwnedCourse = Omit<Inventory, "discovery"> & { displayName?: string };
type History = Parameters<typeof createRepoGradeStartupSchedule>[2];
type Reservation = Parameters<typeof settleRepoGradeStartupTarget>[1];
type Outcome = Parameters<typeof settleRepoGradeStartupTarget>[2];
type Evaluation = (
  | { status: Outcome; unretainedResult?: never; feedbackRetention?: never; preparationRetry?: RetrySelector }
  | (Omit<RepoGradesStartupRecovery, "target"> & { preparationRetry?: never })
) & { preparationDiagnostic?: Omit<RepoGradesStartupPreparationResult, "preparationRetry"> };
type RetrySelector = NonNullable<RepoGradesStartupPreparationResult["preparationRetry"]>;
type Preparation = { progress: RepoGradesStartupPreparation; selector?: RetrySelector };
type Diagnostic = typeof recordRepoGradesStartup;
type BatchCount = CourseStartupProgress["states"][number] & { courseId: string };

type ReadyRuntime = {
  accountId: string;
  dispatchOneAtATime?: true;
  batch?: {
    read(): Promise<{ active: boolean; counts: readonly BatchCount[] } | null>;
    seal(count: number): Promise<boolean>;
    close(): Promise<boolean>;
  };
  loadOwnedCourses(): Promise<readonly OwnedCourse[] | null>;
  discoverCourse(courseId: string): Promise<Inventory["discovery"]>;
  loadDurableHistory(targets: readonly RepoGradeStartupTarget[]): Promise<History>;
  runTarget(reservation: Reservation): Promise<Evaluation>;
  retryPreparation?(request: {
    scope: RepoGradeStartupScope;
    courseId: string;
    folder: string;
    selector: RetrySelector;
  }): Promise<RepoGradesStartupPreparationResult>;
};

export type RepoGradesStartupAdapter =
  | { status: "disabled" }
  | {
      status: "configured";
      // Server calls must authorize each request and verify its original
      // account. Return null until durable admission, history and the
      // bounded evaluator are all available.
      openReadyRuntime(scope: RepoGradeStartupScope): Promise<ReadyRuntime | null>;
    };

export const disabledRepoGradesStartupAdapter: RepoGradesStartupAdapter = { status: "disabled" };

function discoveryState(discovery: Inventory["discovery"]): CourseStartupState {
  if (discovery.status === "not-configured") return "not-configured";
  if (discovery.status === "blocked") return "blocked";
  if (!discovery.enumerationComplete) return "unknown";
  if (discovery.repos.some((repo) => repo.status !== "ready")) return "partial";
  return "succeeded";
}

function evaluationDiagnostic(outcome: Outcome): Parameters<Diagnostic>[1] {
  switch (outcome) {
    case "succeeded":
    case "no-submission":
    case "terminal":
      return "success";
    case "partial":
      return "incomplete";
    case "failed":
      return "failed";
    case "unknown":
    case "storage-unavailable":
      return "unknown";
    case "embedded-profile-required":
      return outcome;
    default:
      return "blocked";
  }
}

function retrySelector({ status, preparationRetry }: { status: string; preparationRetry?: RetrySelector }) {
  const digest = /^[0-9a-f]{64}$/;
  if ((status === "failed" || status === "explicit-retry-required") && preparationRetry
    && digest.test(preparationRetry.key) && digest.test(preparationRetry.generation)) return preparationRetry;
}

function preparationKey({ courseId, folder }: Pick<RepoGradesStartupPreparation, "courseId" | "folder">) {
  return JSON.stringify([courseId, folder]);
}

export function startRepoGradesStartup(
  scope: RepoGradeStartupScope,
  adapter: RepoGradesStartupAdapter,
  onProgress?: (progress: RepoGradesStartupProgress) => void,
) {
  let schedule: Schedule | null = null;
  let stopped = false;
  let attached = true;
  let phase: RepoGradesStartupProgress["phase"] = "checking";
  const courses = new Map<string, OwnedCourse>();
  const discoveries = new Map<string, Inventory["discovery"]>();
  const recoverableResults: RepoGradesStartupRecovery[] = [];
  const preparations = new Map<string, Preparation>();
  let runtime: ReadyRuntime | null = null;
  let startupFinished = false;
  let retryPending = false;
  let previousBatch: RepoGradesStartupProgress["previousBatch"];
  const historyRevisionByCourse = new Map<string, number>();
  const startedAt = performance.now();

  function report() {
    if (!attached || !onProgress) return;
    const byCourse = new Map<string, Map<CourseStartupState, number>>();
    for (const { target, state } of schedule?.work.values() ?? []) {
      const counts = byCourse.get(target.courseId) ?? new Map<CourseStartupState, number>();
      let status: CourseStartupState;
      switch (state.status) {
        case "queued": status = stopped ? "stopped" : "queued"; break;
        case "claimed": status = "busy"; break;
        case "terminal": status = "already-processed"; break;
        case "blocked":
          status = state.reason === "history-unavailable" ? "unknown"
            : state.reason === "embedded-profile-required" ? state.reason : "blocked";
          break;
        default: status = state.status;
      }
      counts.set(status, (counts.get(status) ?? 0) + 1);
      byCourse.set(target.courseId, counts);
    }
    onProgress({
      phase: stopped ? "stopped" : phase,
      ...(historyRevisionByCourse.size ? { historyRevisionByCourse: new Map(historyRevisionByCourse) } : {}),
      ...(recoverableResults.length ? { recoverableResults: [...recoverableResults] } : {}),
      ...(preparations.size ? {
        preparations: [...preparations.values()].map(({ progress }) => progress),
        preparationRetryAvailable: startupFinished && !retryPending,
      } : {}),
      ...(previousBatch ? { previousBatch } : {}),
      courses: [...courses.values()].map((course, index) => {
        const discovery = discoveries.get(course.courseId);
        const counts = byCourse.get(course.courseId) ?? new Map<CourseStartupState, number>();
        const coverage = discovery ? discoveryState(discovery) : stopped ? "stopped" : "checking";
        if (coverage !== "succeeded" || !counts.size) {
          const state = coverage === "succeeded"
            ? schedule ? "no-work" : stopped ? "stopped" : "checking"
            : coverage;
          counts.set(state, counts.get(state) ?? 0);
        }
        return {
          courseId: course.courseId,
          label: course.displayName?.trim() || `Class ${index + 1}`,
          states: [...counts].map(([state, count]) => ({ state, count })),
        };
      }),
    });
  }

  function diagnose(...args: Parameters<Diagnostic>) {
    if (attached) recordRepoGradesStartup(...args);
  }

  async function measure<T>(
    operation: Parameters<Diagnostic>[0],
    action: () => Promise<T>,
    summarize: (value: T) => readonly [Parameters<Diagnostic>[1], number?],
  ): Promise<T> {
    const start = performance.now();
    let value: T;
    try {
      value = await action();
    } catch (error) {
      diagnose(operation, "request-failed", start);
      throw error;
    }
    const [outcome, count] = summarize(value);
    diagnose(operation, outcome, start, count);
    return value;
  }

  function halt() {
    stopped = true;
    if (schedule) schedule = stopRepoGradeStartupSchedule(schedule, scope);
  }

  function stop() {
    if (stopped || (phase !== "checking" && phase !== "processing") || adapter.status === "disabled") return;
    halt();
    diagnose("stop", "success", startedAt);
    report();
  }

  async function retryPreparation(progress: RepoGradesStartupPreparation) {
    if (!attached || !startupFinished || retryPending || !runtime?.retryPreparation) return;
    const key = preparationKey(progress);
    const entry = preparations.get(key);
    if (entry?.progress !== progress || !entry.selector) return;

    const { courseId, folder } = progress;
    const start = performance.now();
    retryPending = true;
    preparations.set(key, { progress: { courseId, folder, status: "retrying", canRetry: false } });
    report();
    try {
      const result = await runtime.retryPreparation({ scope, courseId, folder, selector: entry.selector });
      if (!attached) return;
      const selector = retrySelector(result);
      preparations.set(key, { progress: { courseId, folder, status: result.status, canRetry: !!selector }, selector });
      recordRepoGradesStartupPreparation(result, "repo_grades_startup_preparation_retry");
    } catch {
      if (!attached) return;
      preparations.set(key, { progress: { courseId, folder, status: "request-failed", canRetry: false } });
      recordRepoGradesStartupPreparation({
        status: "request-failed", durationMs: Math.max(0, Math.round(performance.now() - start)),
      }, "repo_grades_startup_preparation_retry");
    } finally {
      retryPending = false;
      report();
    }
  }

  async function run() {
    if (stopped) return;
    if (adapter.status === "disabled") {
      phase = "unavailable";
      return;
    }
    report();
    const readyRuntime = await measure("readiness", () => adapter.openReadyRuntime(scope), (ready) =>
      [ready?.accountId === scope.accountId ? "success" : "unavailable"],
    );
    if (stopped) return;
    if (!readyRuntime || readyRuntime.accountId !== scope.accountId) {
      phase = "unavailable";
      return;
    }
    runtime = readyRuntime;
    const { batch } = readyRuntime;

    const ownedCourses = await measure("courses", () => readyRuntime.loadOwnedCourses(), (owned) =>
      owned ? ["success", owned.length] : ["unknown"],
    );
    if (stopped) return;
    if (!ownedCourses) {
      phase = "incomplete";
      return;
    }
    for (const course of ownedCourses) {
      if (course.accountId !== scope.accountId || courses.has(course.courseId)) continue;
      courses.set(course.courseId, course);
      if (!course.organization?.trim()) discoveries.set(course.courseId, { status: "not-configured" });
    }
    if (batch) {
      const notice = await measure("batch_read", () => batch.read(), (result) => [
        "success", result?.counts.reduce((total, row) => total + row.count, 0),
      ]);
      if (stopped) return;
      if (notice) {
        previousBatch = {
          active: notice.active,
          courses: [...courses.values()].flatMap((course, index) => {
            const states = notice.counts.filter(({ courseId }) => courseId === course.courseId)
              .map(({ state, count }) => ({ state, count }));
            return states.length ? [{
              courseId: course.courseId, label: course.displayName?.trim() || `Class ${index + 1}`, states,
            }] : [];
          }),
        };
        if (notice.active) {
          phase = "incomplete";
          return;
        }
      }
    }
    report();
    for (const course of courses.values()) {
      if (stopped) return;
      if (discoveries.has(course.courseId)) continue;
      let discovery: Inventory["discovery"];
      try {
        discovery = await measure("discovery", () => readyRuntime.discoverCourse(course.courseId), (result) => [
          discoveryState(result) === "succeeded" ? "success" : result.status === "blocked" ? "blocked" : "incomplete",
          result.status === "scanned" ? result.repos.length : undefined,
        ]);
      } catch {
        discovery = { status: "blocked", reason: "unavailable" };
      }
      if (stopped) return;
      discoveries.set(course.courseId, discovery);
      report();
    }
    const inventories = [...courses.values()].map((course) => ({ ...course, discovery: discoveries.get(course.courseId)! }));
    const plan = createRepoGradeStartupSchedule(scope, inventories, new Map(), false);
    const targets = [...plan.work.values()].map(({ target }) => target);
    if (!targets.length) {
      schedule = plan;
      return;
    }

    // Only explicit durable observations can authorize a first attempt.
    const history = await measure("history", () => readyRuntime.loadDurableHistory(targets), (receipts) => [
      [...plan.work.keys()].every((key) => receipts.has(key)) ? "success" : "incomplete",
      targets.length,
    ]).catch((error: unknown) => {
      if (!stopped) schedule = plan;
      throw error;
    });
    if (stopped) return;
    schedule = createRepoGradeStartupSchedule(scope, inventories, history, true);
    const queued = [...schedule.work.values()].filter(({ state }) => state.status === "queued").length;
    if (!queued) return;
    const pending = new Set<Promise<void>>();
    const dispatch = async (reservation: Reservation) => {
      let evaluation: Evaluation;
      try {
        evaluation = await measure("evaluation", () => readyRuntime.runTarget(reservation), ({ status }) => [evaluationDiagnostic(status)]);
      } catch {
        evaluation = { status: "unknown" };
        if (batch) halt();
      }
      const { status, unretainedResult, feedbackRetention, preparationDiagnostic } = evaluation;
      if (attached && preparationDiagnostic) recordRepoGradesStartupPreparation(preparationDiagnostic);
      const { target } = reservation;
      historyRevisionByCourse.set(target.courseId, (historyRevisionByCourse.get(target.courseId) ?? 0) + 1);
      if (unretainedResult) recoverableResults.push({
        status, unretainedResult, ...(feedbackRetention && { feedbackRetention }), target,
      });
      if (readyRuntime.retryPreparation && (status === "failed" || status === "explicit-retry-required")) {
        const selector = retrySelector(evaluation);
        if (selector) {
          const { courseId, folder } = target;
          const progress = { courseId, folder, status, canRetry: true };
          preparations.set(preparationKey(progress), { progress, selector });
        }
      }
      if (schedule) schedule = settleRepoGradeStartupTarget(schedule, reservation, status);
      if (status === "storage-unavailable" || status === "runtime-unavailable" || status === "forbidden") halt();
      report();
    };

    try {
      if (batch && !await measure("batch_seal", () => batch.seal(queued),
        (sealed) => [sealed ? "success" : "unavailable", queued])) {
        phase = "incomplete";
        return;
      }
      phase = "processing";
      report();
      for (;;) {
        while (schedule && !stopped && (!readyRuntime.dispatchOneAtATime || !pending.size)) {
          const next = reserveNextRepoGradeStartupTarget(schedule, scope);
          if (!next) break;
          schedule = next.state;
          const job = dispatch(next.reservation).finally(() => pending.delete(job));
          pending.add(job);
        }
        report();
        if (!pending.size) break;
        await Promise.race(pending);
      }
    } finally {
      // A failed acknowledgement can hide a committed seal. Close this
      // generation even when no target was dispatched.
      if (batch && !await measure("batch_close", () => batch.close(),
        (closed) => [closed ? "success" : "unavailable"])) phase = "incomplete";
    }
  }

  function incomplete() {
    return [...discoveries.values()].some((discovery) =>
      discovery.status !== "not-configured" && discoveryState(discovery) !== "succeeded",
    ) || [...schedule?.work.values() ?? []].some(({ state }) =>
      state.status !== "succeeded" && state.status !== "no-submission" && state.status !== "terminal",
    );
  }

  // Cleanup can discard a mount before any action. In-flight requests retain
  // their original scope and can settle locally after user stop or teardown.
  const done = Promise.resolve().then(run).then(
    () => {
      startupFinished = true;
      if (phase === "checking" || phase === "processing") phase = incomplete() ? "incomplete" : "complete";
      report();
    },
    () => {
      startupFinished = true;
      phase = schedule ? "incomplete" : "unavailable";
      report();
    },
  );
  return {
    done,
    stop,
    retryPreparation,
    dispose: () => { attached = false; halt(); },
    readSchedule: () => schedule,
  };
}
