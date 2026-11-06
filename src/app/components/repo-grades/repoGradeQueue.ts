import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";

export type RepoGradeQueueCommand = "pause" | "resume" | "stop";
export type RepoGradeQueueState = "queued" | "paused" | "running" | "stopped";
export type RepoGradeFolderState = "running" | "paused" | "stopping";

export type RepoGradeQueueSnapshot = {
  folderState: RepoGradeFolderState;
  cells: ReadonlyMap<string, RepoGradeQueueState>;
  waiting: number;
  running: number;
  stopped: number;
};

export function recordRepoGradeQueueCommand(scope: "folder" | "cell", command: RepoGradeQueueCommand) {
  recordSessionDiagnosticEntry({
    at: new Date().toISOString(),
    surface: "grading",
    operation: "repo_grade_run_control",
    label: "Control a manual repository grading run",
    outcome: "success",
    detail: { scope, command },
  });
}

/** Gates dispatch only. Once a task is handed to the server, it always settles. */
export function createRepoGradeQueue<T>(
  targets: readonly T[],
  keyOf: (target: T) => string,
  isCurrent: () => boolean,
  publish: (snapshot: RepoGradeQueueSnapshot) => void,
) {
  const pending = new Map(targets.map((target) => [keyOf(target), target]));
  const paused = new Set<string>();
  const running = new Set<string>();
  const stopped = new Set<string>();
  let folderState: RepoGradeFolderState = "running";
  let closed = false;
  let waiters: (() => void)[] = [];

  function changed() {
    const wake = waiters;
    waiters = [];
    for (const resume of wake) resume();
    if (closed || !isCurrent()) return;
    const cells = new Map<string, RepoGradeQueueState>();
    for (const key of pending.keys()) cells.set(key, paused.has(key) || folderState === "paused" ? "paused" : "queued");
    for (const key of running) cells.set(key, "running");
    for (const key of stopped) cells.set(key, "stopped");
    publish({ folderState, cells, waiting: pending.size, running: running.size, stopped: stopped.size });
  }

  function change(command: RepoGradeQueueCommand, key?: string): boolean {
    if (closed || !isCurrent() || folderState === "stopping" || pending.size === 0) return false;
    if (key !== undefined) {
      if (!pending.has(key)) return false;
      if (command === "stop") {
        pending.delete(key);
        paused.delete(key);
        stopped.add(key);
      } else {
        if (folderState === "paused" || paused.has(key) === (command === "pause")) return false;
        if (command === "pause") paused.add(key);
        else paused.delete(key);
      }
    } else if (command === "stop") {
      folderState = "stopping";
      for (const key of pending.keys()) stopped.add(key);
      pending.clear();
      paused.clear();
    } else {
      const next = command === "pause" ? "paused" : "running";
      if (folderState === next) return false;
      folderState = next;
    }
    changed();
    return true;
  }

  async function runNext<R>(task: (target: T) => Promise<R>): Promise<{ value: R } | null> {
    while (!closed && isCurrent() && pending.size > 0) {
      if (folderState === "running") {
        for (const [key, target] of pending) {
          if (paused.has(key)) continue;
          pending.delete(key);
          running.add(key);
          changed();
          try {
            return { value: await task(target) };
          } finally {
            running.delete(key);
            changed();
          }
        }
      }
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
    return null;
  }

  return {
    change,
    runNext,
    publish: changed,
    stopped: () => [...stopped],
    close() {
      closed = true;
      changed();
    },
  };
}
