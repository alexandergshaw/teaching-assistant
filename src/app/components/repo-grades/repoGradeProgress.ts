import { automaticReasonLabel } from "@/lib/repo-grades-dashboard/automatic-reason-label";
import type { AutomaticRepoGradeRun } from "@/lib/repo-grades-dashboard/automatic-status";
import { gradeSelectionKey } from "./repoGradeSelection";
import type { ActiveGradeCell, TargetRequest } from "./useRepoGradeTargetRequests";

const groups = {
  graded: { label: "Graded", color: "success.main" },
  noSubmission: { label: "No submission", color: "text.secondary" },
  alreadyProcessed: { label: "Already processed", color: "info.dark" },
  attention: { label: "Needs attention", color: "warning.main" },
  stopped: { label: "Stopped or not started", color: "error.main" },
  running: { label: "Recorded running", color: "primary.main" },
  waiting: { label: "Waiting", color: "action.disabled" },
  other: { label: "Other recorded states", color: "text.disabled" },
} as const;

type Group = keyof typeof groups;
type ProgressCount = { group: Group; label: string; color: string; count: number };
type Repos = NonNullable<AutomaticRepoGradeRun["courses"][number]["repositories"]>;
export type GradeProgressEntry = {
  key: string;
  title: string;
  requestId?: number;
  scope: string;
  stage: string;
  finished: boolean;
  tone: "info" | "success" | "warning" | "default";
  reasons: string[];
  tracked: number;
  settled: number;
  graded: number;
  segments: ProgressCount[];
  repositories?: Repos;
};

function targetGroup(state: string): Group {
  switch (state) {
    case "succeeded": return "graded";
    case "no-submission": return "noSubmission";
    case "already-processed": return "alreadyProcessed";
    case "partial": case "failed": case "unknown": case "busy": case "blocked": case "embedded-profile-required": return "attention";
    case "stopped": case "not-started": return "stopped";
    case "running": return "running";
    case "queued": return "waiting";
    default: return "other";
  }
}

export function gradeProgressCounts(counts: readonly { state: string; count: number }[]) {
  const values: Record<Group, number> = {
    graded: 0, noSubmission: 0, alreadyProcessed: 0, attention: 0, stopped: 0, running: 0, waiting: 0, other: 0,
  };
  for (const { state, count } of counts) {
    if (Number.isSafeInteger(count) && count > 0) values[targetGroup(state)] += count;
  }
  const segments = (Object.keys(groups) as Group[]).flatMap((group) => values[group] > 0
    ? [{ group, ...groups[group], count: values[group] }] : []);
  return {
    tracked: segments.reduce((total, segment) => total + segment.count, 0),
    settled: values.graded + values.noSubmission + values.alreadyProcessed + values.attention + values.stopped,
    graded: values.graded,
    segments,
  };
}

function requestFolders(request: TargetRequest): string[] | null {
  if (!request.bulk) return [request.folder];
  return request.pairs ? [...new Set(request.pairs.map(({ folder }) => folder))] : request.folders;
}

function terminal(request: TargetRequest) {
  return request.state === "complete" || request.state === "incomplete" || request.state === "stopped";
}

type BackgroundStatus = {
  run: AutomaticRepoGradeRun | null;
  githubRetryAt: string | null;
  stale: boolean;
};

function workerStage(run: AutomaticRepoGradeRun, retryAt: string | null) {
  if (run.waitingForBrowserStartup) return "Waiting for the previous startup check";
  if (retryAt && (run.phase === "discovering" || run.phase === "grading")) {
    return `Waiting for GitHub · retry ${new Date(retryAt).toLocaleString()}`;
  }
  if (run.phase === "discovering") return "Checking GitHub repositories";
  if (run.phase === "stopped" && run.settling) return "Stopped · finishing work already started";
  if (run.phase === "stopped") return "Stopped";
  if (run.phase === "incomplete") return "Finished · needs attention";
  if (run.phase === "complete") return "Finished";
  return "Worker is processing the run";
}

function requestProgress(request: TargetRequest, folders: string[] | null, background: BackgroundStatus | null, previous: boolean, assignmentView: boolean): GradeProgressEntry {
  const run = background?.run?.id === request.runId && !background.stale ? background.run : null;
  const matchingRetry = run ? background?.githubRetryAt ?? null : null;
  const counts = gradeProgressCounts(Object.entries(request.counts ?? {}).map(([state, count]) => ({ state, count })));
  const hasRunningTargets = counts.segments.some(({ group }) => group === "running");
  const stage = request.state === "paused-running" ? (request.inFlight ? "Paused · finishing work already started" : "Paused")
    : request.state === "paused" ? "Paused before processing"
    : request.state === "queued" ? "Waiting for the background worker"
    : request.state === "stopped" ? "Stopped"
    : request.state === "incomplete" ? "Finished · needs attention"
    : request.state === "complete" ? "Finished"
    : hasRunningTargets && !request.inFlight && !matchingRetry && (!run || run.phase === "grading") ? "Waiting for worker confirmation"
    : run ? workerStage(run, matchingRetry) : "Worker is processing the request";
  const detail = !request.bulk ? (request.folder || "Repository root") + (request.repo ? ` · ${request.repo}` : "")
    : folders?.length === 1 ? folders[0] || "Repository root" : folders ? `${folders.length} assignments` : "Multiple assignments";
  const scope = request.bulk && folders?.length !== 1 ? `Group totals · ${detail}${assignmentView ? " · includes other assignments" : ""}`
    : request.bulk ? `Selected group · ${detail}` : request.repo ? `One repository · ${detail}` : `Assignment request · ${detail}`;
  return {
    ...counts, key: `request-${request.id}`, title: previous ? "Latest finished request" : "Grading request",
    requestId: request.id, scope, stage, finished: terminal(request),
    tone: request.state === "complete" ? "success"
      : request.state === "incomplete" || request.state === "paused" || request.state === "paused-running" ? "warning"
      : request.state === "stopped" ? "default" : "info",
    reasons: request.reason && request.reason !== "stopped-by-user" ? [automaticReasonLabel(request.reason)] : [],
    ...(run?.phase === "discovering" && { repositories: run.courses.find(({ courseId }) => courseId === request.courseId)?.repositories ?? undefined }),
  };
}

export function repoGradeProgress(
  requests: readonly TargetRequest[], courseId: string, folder: string | null, background: BackgroundStatus | null,
  requestScopeKnown = true,
) {
  const matches = requests.flatMap((request) => {
    if (request.courseId !== courseId) return [];
    const folders = requestFolders(request);
    return folder === null || folders === null || folders.includes(folder) ? [{ request, folders }] : [];
  });
  const active = matches.filter(({ request }) => !terminal(request))
    .sort((a, b) => Number(b.request.inFlight) - Number(a.request.inFlight) || Number(!!b.request.runId) - Number(!!a.request.runId) || a.request.id - b.request.id);
  const latest = matches.filter(({ request }) => terminal(request))
    .reduce<(typeof matches)[number] | undefined>((result, item) => !result || item.request.id > result.request.id ? item : result, undefined);
  const activeRequests = active.map(({ request, folders }) => requestProgress(request, folders, background, false, folder !== null));
  const latestRequest = latest ? requestProgress(latest.request, latest.folders, background, true, folder !== null) : undefined;
  const run = background?.run;
  const course = run?.courses.find((entry) => entry.courseId === courseId);
  const standaloneRun = requestScopeKnown && run && course && !requests.some(({ runId }) => runId === run.id);
  const classRunActive = standaloneRun && (run.phase === "discovering" || run.phase === "grading" || run.settling);
  const courseProgress: GradeProgressEntry | undefined = standaloneRun && (folder === null || classRunActive) ? {
    ...gradeProgressCounts(course.counts),
    key: `run-${run.id}`, title: "Background run", scope: "Class-wide · tracked targets in this run",
    stage: background?.stale ? "Last known status" : workerStage(run, background?.githubRetryAt ?? null),
    finished: !classRunActive,
    tone: run.phase === "stopped" ? "default" : run.phase === "incomplete" || course.state === "partial" ? "warning"
      : run.phase === "complete" ? "success" : "info",
    reasons: [...new Set([course.reason, ...course.counts.map(({ reason }) => reason)].filter((reason) => reason !== null)
      .map(automaticReasonLabel))],
    repositories: course.repositories ?? undefined,
  } : undefined;
  return { activeRequests, latestRequest, courseProgress };
}

type ExactCellState = ActiveGradeCell["state"];
export type GradeCellProgress = ExactCellState | "stopped" | "attention" | "unconfirmed";

const cellPriority: Record<ExactCellState, number> = { running: 4, waiting: 3, paused: 2, queued: 1, settled: 0 };

export function activeGradeCellsByKey(cells: readonly ActiveGradeCell[], courseId: string): ReadonlyMap<string, ExactCellState> {
  const indexed = new Map<string, ExactCellState>();
  for (const cell of cells) {
    if (cell.courseId !== courseId) continue;
    const key = gradeSelectionKey(cell.repo.toLowerCase(), cell.folder);
    const previous = indexed.get(key);
    if (previous === undefined || cellPriority[cell.state] > cellPriority[previous]) indexed.set(key, cell.state);
  }
  return indexed;
}

/** Only an exact reported target can be running. A bare request may be
 * waiting for scope checks, even when its worker has an active lease. */
export function gradeCellProgress(
  activeCells: ReadonlyMap<string, ExactCellState>, courseId: string, repo: string, folder: string,
  requests: readonly TargetRequest[], requestsUnavailable: boolean, cellsUnavailable: boolean, hasGradedResult: boolean,
): GradeCellProgress | undefined {
  const exact = activeCells.get(gradeSelectionKey(repo.toLowerCase(), folder));
  if (exact) return requestsUnavailable || cellsUnavailable ? "unconfirmed" : exact;

  const request = requests.findLast((item) => !item.bulk && item.courseId === courseId
    && item.folder === folder && item.repo?.toLowerCase() === repo.toLowerCase());
  if (!request) return;
  if (requestsUnavailable && !terminal(request)) return "unconfirmed";
  switch (request.state) {
    case "queued": return "queued";
    case "paused": case "paused-running": return "paused";
    case "running": return "waiting";
    case "incomplete": return "attention";
    case "stopped": return "stopped";
    case "complete": return hasGradedResult ? undefined : "settled";
  }
}
