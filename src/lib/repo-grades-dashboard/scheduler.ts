import type { RepoGradeOutcome } from "@/lib/supabase/types.repo-grades-dashboard";
import type { RepoGradeDiscovery } from "./discovery";
import type { runRepoGradeTarget } from "./runner";

// Mirrors the coordinated ledger limit. Only the ledger can admit work across callers.
const LOCAL_CAPACITY = 3;

export type RepoGradeRepositoryCoverage = Readonly<{ checked: number; found: number; enumerationComplete: boolean }>;

export function repoGradeRepositoryCoverage(
  discovery: Extract<RepoGradeDiscovery, { status: "scanned" }>,
): RepoGradeRepositoryCoverage {
  const found = new Set<string>();
  const incomplete = new Set<string>();
  for (const { repo, status } of discovery.repos) {
    const key = repo.toLowerCase();
    found.add(key);
    if (status !== "ready") incomplete.add(key);
  }
  return { checked: found.size - incomplete.size, found: found.size, enumerationComplete: discovery.enumerationComplete };
}

export type RepoGradeStartupScope = Readonly<{
  accountId: string;
  // A fresh token per opening, remount, or account change, including A -> B -> A.
  generation: string;
}>;

export type RepoGradeStartupTarget = Readonly<{
  accountId: string;
  courseId: string;
  repo: string;
  sourceRef: string;
  sha: string;
  folder: string;
}>;

type CourseInventory = Readonly<{
  accountId: string;
  courseId: string;
  organization: string | null;
  discovery: RepoGradeDiscovery;
}>;

export type RepoGradeLedgerObservation = "never-attempted" | "claimed" | RepoGradeOutcome;
export type RepoGradeHistoryObservation = RepoGradeLedgerObservation | "not-started" | "terminal";
type RunnerStatus = Awaited<ReturnType<typeof runRepoGradeTarget>>["status"];
type BlockReason = Exclude<RunnerStatus, RepoGradeOutcome | "terminal" | "storage-unavailable"> | "history-unavailable";
type TargetStatus =
  | { status: "queued" | "running" | "claimed" | "terminal" | "not-started" | RepoGradeOutcome }
  | { status: "blocked"; reason: BlockReason };
type Work = Readonly<{ target: RepoGradeStartupTarget; state: Readonly<TargetStatus> }>;
type State = Readonly<{
  scope: RepoGradeStartupScope;
  stopped: boolean;
  courses: readonly CourseInventory[];
  work: ReadonlyMap<string, Work>;
}>;

// Configuration is attempt provenance, so a change never makes a terminal SHA eligible.
// GitHub owner/repo comparison follows the ledger. Ref and folder remain exact.
export function repoGradeStartupKey(target: RepoGradeStartupTarget): string {
  const { accountId, courseId, repo, sourceRef, sha, folder } = target;
  return JSON.stringify([accountId, courseId, repo.toLowerCase(), sourceRef, sha, folder]);
}

/** Read-only, server-derived planning input. Absence of an observation means
 * history coverage is unproven. Supply "never-attempted" only after a complete
 * durable read for that target. Any terminal receipt takes precedence over
 * newer nonterminal attempts, matching the automatic admission rule. */
export function createRepoGradeStartupSchedule(
  scope: RepoGradeStartupScope,
  inventories: readonly CourseInventory[],
  history: ReadonlyMap<string, RepoGradeHistoryObservation>,
  runtimeReady: boolean,
): State {
  const courses = inventories.filter((course) => course.accountId === scope.accountId).map((course) =>
    course.organization?.trim()
      ? course
      : { ...course, discovery: { status: "not-configured" } as const },
  );
  const targets = new Map<string, RepoGradeStartupTarget>();
  for (const course of courses) {
    const { discovery } = course;
    if (discovery.status !== "scanned" || !discovery.enumerationComplete) continue;
    for (const source of discovery.repos) {
      if (source.status !== "ready") continue;
      for (const folder of source.folders) {
        const target = {
          accountId: scope.accountId,
          courseId: course.courseId,
          repo: source.repo,
          sourceRef: source.sourceRef,
          sha: source.sourceCommit,
          folder,
        };
        const key = repoGradeStartupKey(target);
        const previous = targets.get(key);
        if (!previous || target.repo < previous.repo) targets.set(key, target);
      }
    }
  }
  const work = new Map<string, Work>();
  const ordered = [...targets].sort(([left], [right]) => left < right ? -1 : left === right ? 0 : 1);
  for (const [key, target] of ordered) {
    const receipt = history.get(key);
    let state: TargetStatus;
    if (!receipt) state = { status: "blocked", reason: "history-unavailable" };
    else if (receipt !== "never-attempted") state = { status: receipt };
    else if (!runtimeReady) state = { status: "blocked", reason: "runtime-unavailable" };
    else state = { status: "queued" };
    work.set(key, { target, state });
  }
  return { scope: { ...scope }, stopped: false, courses, work };
}

type Reservation = Readonly<{ scope: RepoGradeStartupScope; target: RepoGradeStartupTarget }>;

function matchesScope(state: State, scope: RepoGradeStartupScope): boolean {
  return state.scope.accountId === scope.accountId && state.scope.generation === scope.generation;
}

/** Serialize this transition in the adapter and commit the returned state
 * before dispatch. The server runner must still claim the target atomically. */
export function reserveNextRepoGradeStartupTarget(
  state: State,
  scope: RepoGradeStartupScope,
): { state: State; reservation: Reservation } | null {
  if (state.stopped || !matchesScope(state, scope)) return null;
  const work = [...state.work];
  const running = work.filter(([, row]) => row.state.status === "running");
  if (running.length >= LOCAL_CAPACITY) return null;
  const next = work.find(([, row]) => row.state.status === "queued" && !running.some(([, active]) =>
    active.target.courseId === row.target.courseId
    && active.target.repo.toLowerCase() === row.target.repo.toLowerCase()
    && active.target.folder === row.target.folder,
  ));
  if (!next) return null;
  const [key, row] = next;
  const updated = new Map(state.work);
  updated.set(key, { ...row, state: { status: "running" } });
  return {
    state: { ...state, work: updated },
    reservation: { scope: state.scope, target: row.target },
  };
}

export function stopRepoGradeStartupSchedule(state: State, scope: RepoGradeStartupScope): State {
  return matchesScope(state, scope) && !state.stopped ? { ...state, stopped: true } : state;
}

/** Report the runner response (or "unknown" for an interrupted transport).
 * This updates local progress only. A stopped generation may still settle its
 * outstanding requests. A replacement generation ignores their completions. */
export function settleRepoGradeStartupTarget(
  state: State,
  reservation: Reservation,
  status: RunnerStatus | "claimed",
): State {
  if (!matchesScope(state, reservation.scope)) return state;
  const key = repoGradeStartupKey(reservation.target);
  const row = state.work.get(key);
  if (!row || row.state.status !== "running") return state;

  let settled: TargetStatus;
  switch (status) {
    case "succeeded":
    case "no-submission":
    case "partial":
    case "failed":
    case "unknown":
    case "terminal":
    case "claimed":
      settled = { status };
      break;
    case "busy":
      settled = { status: "claimed" };
      break;
    case "storage-unavailable":
      settled = { status: "unknown" };
      break;
    default:
      settled = { status: "blocked", reason: status };
  }
  const work = new Map(state.work);
  work.set(key, { ...row, state: settled });
  return { ...state, work };
}
