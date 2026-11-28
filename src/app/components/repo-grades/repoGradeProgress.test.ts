import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AutomaticRepoGradeRun } from "@/lib/repo-grades-dashboard/automatic-status";
import { activeGradeCellsByKey, gradeCellProgress, gradeProgressCounts, repoGradeProgress } from "./repoGradeProgress";
import type { ActiveGradeCell, TargetRequest } from "./useRepoGradeTargetRequests";

const courseId = "current-class";
const folder = "assignments/module_14";
const anotherFolder = "assignments/module_15";
const request = (patch: Partial<TargetRequest> = {}): TargetRequest => ({
  id: 1, courseId, folder, repo: null, state: "queued", runId: null, inFlight: false,
  bulk: false, folders: null, repos: null, counts: {}, ...patch,
});

const run = (patch: Partial<AutomaticRepoGradeRun> = {}): AutomaticRepoGradeRun => ({
  id: "class-run", phase: "grading", settling: false, waitingForBrowserStartup: false,
  courses: [{ courseId, label: "Class", state: "scanned", reason: null, repositories: null,
    counts: [{ state: "queued", count: 4, reason: null }, { state: "succeeded", count: 3, reason: null }] }],
  ...patch,
});

describe("repo grader progress counts", () => {
  it("counts all known outcomes but only counts saved grades as graded", () => {
    const progress = gradeProgressCounts([
      { state: "succeeded", count: 3 }, { state: "no-submission", count: 1 }, { state: "already-processed", count: 2 },
      { state: "partial", count: 1 }, { state: "failed", count: 2 }, { state: "unknown", count: 1 },
      { state: "busy", count: 1 }, { state: "blocked", count: 1 }, { state: "embedded-profile-required", count: 1 },
      { state: "not-started", count: 2 }, { state: "stopped", count: 1 },
      { state: "running", count: 3 }, { state: "queued", count: 4 }, { state: "future-state", count: 1 },
      { state: "succeeded", count: -1 },
    ]);
    expect(progress).toMatchObject({ tracked: 24, settled: 16, graded: 3 });
    expect(progress.segments.map(({ group, count }) => [group, count])).toEqual([
      ["graded", 3], ["noSubmission", 1], ["alreadyProcessed", 2], ["attention", 7], ["stopped", 3],
      ["running", 3], ["waiting", 4], ["other", 1],
    ]);
    expect(gradeProgressCounts([])).toEqual({ tracked: 0, settled: 0, graded: 0, segments: [] });
  });
});

describe("repo grader progress scoping and stages", () => {
  it("keeps simultaneous requests separate and takes the newest matching terminal request", () => {
    const view = repoGradeProgress([
      request({ id: 6, state: "complete", counts: { succeeded: 7 } }),
      request({ id: 1 }),
      request({ id: 4, state: "running", runId: "active-run", inFlight: true, counts: { running: 1, succeeded: 2 } }),
      request({ id: 7, state: "stopped", folder: anotherFolder, counts: { stopped: 5 } }),
      request({ id: 8, state: "complete", courseId: "other-class", counts: { succeeded: 8 } }),
      request({ id: 5, state: "incomplete", counts: { partial: 1 } }),
    ], courseId, folder, null);
    expect(view.activeRequests.map(({ key, tracked }) => [key, tracked])).toEqual([["request-4", 3], ["request-1", 0]]);
    expect(view.latestRequest).toMatchObject({ key: "request-6", finished: true, tracked: 7, settled: 7, graded: 7 });
  });

  it("keeps exact selected-cell and multi-assignment totals labeled at their own scope", () => {
    const group = request({ bulk: true, pairs: [{ folder, repo: "school/a" }, { folder: anotherFolder, repo: "school/b" }], counts: { queued: 2 } });
    const rectangle = request({ id: 2, bulk: true, folders: [folder], repos: ["school/a", "school/b"], counts: { queued: 2 } });
    const selected = repoGradeProgress([group, rectangle], courseId, folder, null);
    expect(selected.activeRequests[0]).toMatchObject({ scope: expect.stringContaining("includes other assignments"), tracked: 2 });
    expect(selected.activeRequests[1].scope).toBe(`Selected group · ${folder}`);
    expect(repoGradeProgress([group, rectangle], courseId, anotherFolder, null).activeRequests.map(({ key }) => key)).toEqual(["request-1"]);
    expect(repoGradeProgress([group, rectangle], courseId, null, null).activeRequests).toHaveLength(2);
  });

  it("distinguishes lease expiry, paused work and the GitHub retry for its own fresh run", () => {
    const running = request({ state: "running", runId: "class-run", counts: { running: 2 }, reason: "prior-attempt" });
    const progress = (entry: TargetRequest, status?: { run: AutomaticRepoGradeRun; githubRetryAt: string; stale: boolean }) =>
      repoGradeProgress([entry], courseId, folder, status ?? null).activeRequests[0];
    expect(progress(running)).toMatchObject({ stage: "Waiting for worker confirmation", tracked: 2, settled: 0 });
    expect(progress(running, { run: run({ id: "different" }), githubRetryAt: "2026-11-28T10:00:00Z", stale: false }).stage)
      .toBe("Waiting for worker confirmation");
    expect(progress(running, { run: run(), githubRetryAt: "2026-11-28T10:00:00Z", stale: true }).stage)
      .toBe("Waiting for worker confirmation");
    expect(progress(running, { run: run(), githubRetryAt: "2026-11-28T10:00:00Z", stale: false }).stage)
      .toContain("Waiting for GitHub");
    expect(progress({ ...running, state: "paused-running", inFlight: true }).stage).toBe("Paused · finishing work already started");
    expect(progress({ ...running, state: "paused-running" }).stage).toBe("Paused");
    expect(progress(running).reasons[0]).toContain("previous attempt");
  });

  it("shows active class-wide counts separately during a folder view and retains class terminal state in All Folders", () => {
    const current = { run: run(), githubRetryAt: null, stale: false };
    expect(repoGradeProgress([request()], courseId, folder, current).courseProgress)
      .toMatchObject({ scope: expect.stringContaining("Class-wide"), tracked: 7, settled: 3, graded: 3 });
    expect(repoGradeProgress([request({ runId: current.run.id })], courseId, folder, current).courseProgress).toBeUndefined();
    expect(repoGradeProgress([], courseId, folder, current, false).courseProgress).toBeUndefined();
    expect(repoGradeProgress([], "other-class", null, current).courseProgress).toBeUndefined();
    const finished = { ...current, run: run({ phase: "incomplete" }) };
    expect(repoGradeProgress([], courseId, folder, finished).courseProgress).toBeUndefined();
    expect(repoGradeProgress([], courseId, null, finished).courseProgress).toMatchObject({ finished: true, stage: "Finished · needs attention" });
  });
});

describe("individual gradebook cell progress", () => {
  const cell = (patch: Partial<ActiveGradeCell> = {}): ActiveGradeCell => ({
    courseId, folder, repo: "school/alice", runId: "active-run", state: "running", ...patch,
  });

  it("matches case-insensitive repositories and exact class/folder, never the whole group's running badge", () => {
    const active = activeGradeCellsByKey([
      cell(), cell({ repo: "school/bob", state: "queued" }),
      cell({ repo: "school/eve", courseId: "other-class" }), cell({ repo: "school/carl", folder: anotherFolder }),
      cell({ repo: "SCHOOL/ALICE", state: "settled" }),
    ], courseId);
    const group = request({ state: "running", runId: "active-run", inFlight: true, counts: { running: 1, queued: 1 } });
    const progress = (repo: string, assignment = folder) => gradeCellProgress(active, courseId, repo, assignment, [group], false, false, false);
    expect(progress("SCHOOL/ALICE")).toBe("running");
    expect(progress("school/bob")).toBe("queued");
    expect(progress("school/eve")).toBeUndefined();
    expect(progress("school/carl")).toBeUndefined();
    expect(progress("school/alice", folder.toUpperCase())).toBeUndefined();
  });

  it("downgrades stale exact progress and treats only a single-cell request as a waiting fallback", () => {
    const active = activeGradeCellsByKey([cell()], courseId);
    const read = (requests: TargetRequest[], queueStale = false, cellsStale = false, saved = false) =>
      gradeCellProgress(cellsStale ? active : new Map(), courseId, "school/alice", folder, requests, queueStale, cellsStale, saved);
    expect(read([], false, true)).toBe("unconfirmed");
    const target = request({ repo: "SCHOOL/ALICE", state: "running", inFlight: true });
    expect(read([target])).toBe("waiting");
    expect(read([target], true)).toBe("unconfirmed");
    expect(read([{ ...target, state: "paused-running" }])).toBe("paused");
    expect(read([{ ...target, state: "stopped" }])).toBe("stopped");
    expect(read([{ ...target, state: "incomplete" }])).toBe("attention");
    expect(read([{ ...target, state: "complete" }])).toBe("settled");
    expect(read([{ ...target, state: "complete" }], false, false, true)).toBeUndefined();
  });
});

it("places the scoped panel above the grid with an accessible disclosure and progress values", () => {
  const page = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("./RepoGradesRunProgress.tsx", import.meta.url), "utf8");
  expect(page.indexOf("<RepoGradesRunProgress")).toBeGreaterThan(page.indexOf("<RepoGradeCourseFilters"));
  expect(page.indexOf("<RepoGradesRunProgress")).toBeLessThan(page.indexOf("<RepoGradesGrid"));
  expect(page).toContain("currentSelectedFolder === ALL_FOLDERS ? null : currentSelectedFolder");
  expect(panel).toContain("INITIAL_ACTIVE_REQUESTS = 2");
  expect(panel).toContain("aria-expanded={expanded}");
  expect(panel).toContain('role="progressbar"');
  expect(panel).toContain("aria-valuenow={entry.settled}");
  expect(panel).toContain("prefers-reduced-motion");
  expect(panel).toContain('document.querySelector<HTMLElement>("[data-repo-grades-quota]")?.offsetHeight');
  expect(panel).toContain("panel.focus({ preventScroll: true })");
  expect(page).toContain("onClick={focusRepoGradesRunProgress}");
  expect(panel.match(/role="status"/g)).toHaveLength(1);
});

it("renders cell activity next to the saved result and leaves request controls in the cell", () => {
  const page = readFileSync(new URL("./index.tsx", import.meta.url), "utf8");
  const grid = readFileSync(new URL("./RepoGradesGrid.tsx", import.meta.url), "utf8");
  const result = readFileSync(new URL("./RepoGradesDashboard.tsx", import.meta.url), "utf8");
  const cell = readFileSync(new URL("./RepoGradeCellProgress.tsx", import.meta.url), "utf8");
  expect(page).toContain("activeGradeCells={targetRequests.activeCells}");
  expect(grid).toContain("requests={requests} showRequestStatus={false}");
  expect(grid).toContain("bulkQueue?.cells.get(repo.name)");
  expect(grid).toContain("progress={progress}");
  expect(result).toContain("<RepoGradeCellProgress state={progress}");
  expect(result).toContain("<SavedMatrixResult result={cell.saved}");
  expect(cell).toContain('state === "running" && <LinearProgress');
  expect(cell).toContain("prefers-reduced-motion");
  expect(cell).not.toContain('role="status"');
});
