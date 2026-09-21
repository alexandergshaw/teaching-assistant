// docs/a26-a27-scope.md, section 8: behavioural tests for backlog rows A26
// (a second "Grade all" click during a pending rubric fetch sends duplicate
// grading calls) and A27 (a rejected grading call leaves every "Grade all"
// button disabled and nothing logged, until a reload throws away every
// unposted score). Also covers R-6, the per-cell "Grade" button's own
// sibling defect.
//
// This drives handleGradeColumn and handleGradeCell - the functions the
// buttons actually reach - never runBulkGrade directly (scope section 8:
// "A26 exists only because of the await in the handler"). Nothing renders in
// this repo's vitest (node-env, collects only src/**/*.test.ts - see
// vitest.config.ts and useRepoGradesBulkGrade.test.ts's own header comment
// for why), so the harness below stands in for React: one call of
// useRepoGradesGradingActions is one "render" - it returns a fresh set of
// closures every time, exactly like a real render would, which is what lets
// A26's stale-closure defect and A26b's same-closure defect show up here
// without a browser. useState's setter writes into a slot that the NEXT
// render's call sees; useRef returns the SAME object on every call, which is
// what makes a ref-based lock (unlike a state-based one) visible to an
// ALREADY-RETURNED closure without waiting for a new render - see A26b below.
//
// No helper is imported from another *.test.ts (no-cross-test-file-imports -
// AGENTS memory). Fixtures are built the way repoGradesBulkGrade.test.ts's
// own `cell`/`row` helpers build them (docs/a26-a27-scope.md section 8: rows
// come from the emitted shape).
import { describe, expect, it, vi, beforeEach } from "vitest";

const h0 = vi.hoisted(() => {
  const slots: Array<{ value: unknown }> = [];
  let cursor = 0;
  return {
    begin: () => {
      cursor = 0;
    },
    reset: () => {
      slots.length = 0;
      cursor = 0;
    },
    useState: (init: unknown) => {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof init === "function" ? (init as () => unknown)() : init };
      const s = slots[i];
      return [
        s.value,
        (next: unknown) => {
          s.value = typeof next === "function" ? (next as (prev: unknown) => unknown)(s.value) : next;
        },
      ];
    },
    useRef: (init: unknown) => {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: { current: init } };
      return slots[i].value;
    },
  };
});

vi.mock("react", () => ({
  useState: h0.useState,
  useRef: h0.useRef,
  default: { useState: h0.useState, useRef: h0.useRef },
}));

const gradeRepoActionMock = vi.fn();
vi.mock("@/app/actions", () => ({
  gradeRepoAction: (...args: unknown[]) => gradeRepoActionMock(...args),
  postCanvasGradesAction: vi.fn(),
}));

import { useRepoGradesGradingActions, type UseRepoGradesGradingActionsParams } from "./useRepoGradesGradingActions";
import type { RepoGradeCell, RepoGradeColumn, RepoGradeRow } from "./repoGradesRows";
import type { RepoGradeCellEditsByRepo } from "./repoGradesCellEdits";
import type { RepoGradeLogEntry } from "./repoGradesLog";
import type { ResolvedRubric } from "./useRepoGradesRubricSource";
import type { RepoBindingSuggestion } from "@/lib/repo-student-bindings";
import type { Course } from "@/lib/supabase/courses.types";

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const POISON_BINDING: RepoBindingSuggestion = {
  repo: "poison/should-never-be-read",
  state: "unbound",
  canvasUserId: null,
  student: null,
  candidates: [],
  derivedHandle: "POISON_HANDLE",
};

function cell(status: RepoGradeCell["status"], score = ""): RepoGradeCell {
  return { status, score, comment: "", postStatus: "idle" };
}

function row(repo: string): RepoGradeRow {
  return {
    repo,
    htmlUrl: `https://github.com/${repo}`,
    defaultBranch: "main",
    binding: POISON_BINDING,
    folders: ["week-1"],
    folderError: null,
    cells: { "week-1": cell("ungraded") },
  };
}

const TARGET_REPOS = ["org/a", "org/b", "org/c"];
const ROWS: RepoGradeRow[] = TARGET_REPOS.map(row);
const COLUMNS: RepoGradeColumn[] = [{ folder: "week-1", assignmentId: "42" }];

function resolvedRubric(overrides: Partial<ResolvedRubric> = {}): ResolvedRubric {
  return { text: "the instructor's picked rubric", source: "assignment", identity: "week-1 rubric", failureReason: null, ...overrides };
}

/** Matches the shape gradeOneTarget actually reads (useRepoGradesBulkGrade.ts
 * gradeOneTarget, docs/a26-a27-scope.md section 8: "the success payload
 * carries run.results[0] with every field gradeOneTarget reads ... and a
 * rubric"). */
function successResult(repo: string) {
  return {
    run: {
      results: [
        {
          student: repo,
          overallComment: "",
          strengths: "",
          improvements: "",
          resubmitNotice: "",
          rubricAreas: [{ area: "Structure", score: "9", comment: "" }],
          totalScore: "9",
          feedback: "",
          mergedFileCount: 1,
          submittedFiles: [],
        },
      ],
    },
    rubric: "the instructor's picked rubric",
    fullName: repo,
    readmePath: "README.md",
    readmeMissing: false,
  };
}

describe("A26/A27 lifecycle: useRepoGradesBulkGrade + useRepoGradesGradingActions, driven via handleGradeColumn/handleGradeCell", () => {
  let cellEditsState: RepoGradeCellEditsByRepo;
  let recordLogCalls: RepoGradeLogEntry[];
  let announceCalls: string[];
  let resolveRubricForColumnMock: ReturnType<typeof vi.fn>;
  let rubricDeferreds: Array<ReturnType<typeof deferred<ResolvedRubric>>>;

  beforeEach(() => {
    h0.reset();
    cellEditsState = {};
    recordLogCalls = [];
    announceCalls = [];
    rubricDeferreds = [];
    gradeRepoActionMock.mockReset();
    gradeRepoActionMock.mockImplementation(async (repo: string) => successResult(repo));
    resolveRubricForColumnMock = vi.fn(() => {
      const d = deferred<ResolvedRubric>();
      rubricDeferreds.push(d);
      return d.promise;
    });
  });

  function makeParams(overrides: Partial<UseRepoGradesGradingActionsParams> = {}): UseRepoGradesGradingActionsParams {
    return {
      rows: ROWS,
      cellEdits: cellEditsState,
      setCellEdits: (updater) => {
        cellEditsState = updater(cellEditsState);
      },
      selected: new Set(),
      instructions: "grade this folder",
      resolveRubricForColumn: resolveRubricForColumnMock as unknown as (assignmentId: string | null) => Promise<ResolvedRubric>,
      columns: COLUMNS,
      useReadmeInstructions: false,
      bulkSelectionOnly: false,
      runCodeScoring: false,
      courseId: "course-1",
      course: { name: "Course One" } as Course,
      provider: "gemini",
      recordLog: (entries) => {
        recordLogCalls.push(...entries);
      },
      buildLogEntry: (kind, fields): RepoGradeLogEntry => ({
        kind,
        at: "2026-09-21T00:00:00.000Z",
        courseId: "course-1",
        courseName: "Course One",
        repo: "",
        folder: "",
        assignmentId: "",
        score: "",
        detail: "",
        ...fields,
      }),
      setPostSummary: (message) => {
        announceCalls.push(message);
      },
      ...overrides,
    };
  }

  function useTestRender() {
    h0.begin();
    return useRepoGradesGradingActions(makeParams());
  }

  /** Makes every gradeRepoAction call hang until explicitly released - needed
   * whenever a test must observe an IN-PROGRESS run (bulkRunningFolder still
   * set, a click still refused) rather than a run that has already finished
   * and reset its own flag, which a real network call would never do within
   * one microtask turn but this mock's default (resolve immediately) does. */
  function usePendingGradeCalls(): { resolveAll: () => void } {
    const pending: Array<() => void> = [];
    gradeRepoActionMock.mockImplementation(
      (repo: string) =>
        new Promise((resolve) => {
          pending.push(() => resolve(successResult(repo)));
        })
    );
    return {
      resolveAll: () => pending.forEach((release) => release()),
    };
  }

  it("A26: two clicks during a pending rubric fetch must not double every grading call", async () => {
    const grading = usePendingGradeCalls();
    const render1 = useTestRender();
    const p1 = render1.handleGradeColumn("week-1");

    // one macrotask, then a NEW render - the render a real re-render (e.g.
    // from setLastRunCohort(null)) would produce while the rubric fetch is
    // still pending.
    await flushMicrotasks();
    const render2 = useTestRender();
    const p2 = render2.handleGradeColumn("week-1");

    // On HEAD, click 2's own stale-render guard never fires, so it also
    // starts its own rubric fetch (resolvesStarted: 2). Fixed, click 2's live
    // ref lock refuses it before it ever calls the resolver
    // (resolvesStarted: 1, R-5: "0 for a refused click") - so this resolves
    // whichever fetches are actually outstanding rather than asserting a
    // fixed count either way.
    expect(rubricDeferreds.length).toBeGreaterThan(0);
    rubricDeferreds.forEach((d) => d.resolve(resolvedRubric()));
    await flushMicrotasks();
    grading.resolveAll();
    await Promise.all([p1, p2]);

    // RED on HEAD: the stale-render guard lets both runs through, so every
    // repo is graded twice (6 calls for 3 targets). Fixed: exactly one call
    // per target.
    expect(gradeRepoActionMock.mock.calls.length).toBe(TARGET_REPOS.length);
  });

  it("A26b: a second click from the SAME render, same task, must still be refused, and the render taken with no tick after click 1 already shows the run disabled", async () => {
    const grading = usePendingGradeCalls();
    const render1 = useTestRender();
    const p1 = render1.handleGradeColumn("week-1");

    // No await, no macrotask: a fresh render taken immediately must already
    // reflect the run as started (this is what makes the button disable on
    // the very next commit, before the rubric even resolves).
    const render1b = useTestRender();
    expect(render1b.bulkRunningFolder).not.toBeNull();

    // Click 2 reuses click 1's own closure - the same render object, no new
    // render in between.
    const p2 = render1.handleGradeColumn("week-1");

    expect(rubricDeferreds.length).toBeGreaterThan(0);
    rubricDeferreds.forEach((d) => d.resolve(resolvedRubric()));
    await flushMicrotasks();
    grading.resolveAll();
    await Promise.all([p1, p2]);

    expect(gradeRepoActionMock.mock.calls.length).toBe(TARGET_REPOS.length);
  });

  it("canary: once the flag is already committed in a render, a click from THAT render is refused before it fetches a rubric", async () => {
    const grading = usePendingGradeCalls();
    const render1 = useTestRender();
    const p1 = render1.handleGradeColumn("week-1");
    // Resolve click 1's own rubric fetch first, so its flag actually commits
    // before the next render is taken (unlike A26, which takes the new
    // render WHILE the fetch is still pending).
    expect(rubricDeferreds.length).toBe(1);
    rubricDeferreds[0].resolve(resolvedRubric());
    await flushMicrotasks();

    // A render taken AFTER the flag has committed - the run's own grading
    // calls are still pending (held open by usePendingGradeCalls), so the
    // flag has not yet had a chance to reset.
    const render2 = useTestRender();
    expect(render2.bulkRunningFolder).not.toBeNull();
    // Not awaited: on HEAD this click is NOT refused and starts its own
    // resolveRubricForColumn fetch that this test never resolves, so
    // awaiting it here would hang rather than fail cleanly.
    void render2.handleGradeColumn("week-1");
    await flushMicrotasks();
    // The refused click never even reaches the resolver - only click 1's own
    // call is on record.
    expect(resolveRubricForColumnMock.mock.calls.length).toBe(1);

    grading.resolveAll();
    await p1;
    expect(gradeRepoActionMock.mock.calls.length).toBe(TARGET_REPOS.length);
  });

  it("A27: a rejected grading call must not leave the run stuck - every Grade all button re-enables, and the run finishes", async () => {
    gradeRepoActionMock.mockImplementation(async (repo: string) => {
      if (repo === "org/b") throw new Error("Failed to fetch");
      return successResult(repo);
    });

    const render1 = useTestRender();
    const p1 = render1.handleGradeColumn("week-1");
    rubricDeferreds.forEach((d) => d.resolve(resolvedRubric()));
    await p1;

    const renderAfter = useTestRender();
    expect(renderAfter.bulkRunningFolder).toBeNull();
    expect(renderAfter.bulkProgress).toBeNull();
  });

  it("A27a: the rejected repo becomes an ordinary failed outcome - logged, retryable, and the run still announces a summary", async () => {
    gradeRepoActionMock.mockImplementation(async (repo: string) => {
      if (repo === "org/b") throw new Error("Failed to fetch");
      return successResult(repo);
    });

    const render1 = useTestRender();
    const p1 = render1.handleGradeColumn("week-1");
    rubricDeferreds.forEach((d) => d.resolve(resolvedRubric()));
    await p1;

    const failedEdit = cellEditsState["org/b"]?.["week-1"];
    expect(failedEdit?.grading).toBe(false);
    expect(failedEdit?.gradeError).toBeTruthy();

    const kinds = recordLogCalls.map((e) => e.kind);
    expect(kinds.filter((k) => k === "grade-succeeded")).toHaveLength(2);
    expect(kinds.filter((k) => k === "grade-failed")).toHaveLength(1);
    expect(announceCalls.length).toBe(1);
    expect(announceCalls[0]).toBe("Bulk grading finished: 2 graded, 1 failed.");
  });

  it("A27b: a rejecting rubric fetch itself must not leave the lock or the flag stuck", async () => {
    const render1 = useTestRender();
    const p1 = render1.handleGradeColumn("week-1");
    expect(rubricDeferreds.length).toBe(1);
    rubricDeferreds[0].reject(new Error("rubric fetch failed"));

    // handleGradeColumn awaits runBulkGrade unconditionally and never
    // catches; a rejecting rubric fetch is expected to propagate here, same
    // as it does today.
    await expect(p1).rejects.toThrow();

    const renderAfter = useTestRender();
    expect(renderAfter.bulkRunningFolder).toBeNull();
    expect(renderAfter.bulkProgress).toBeNull();
  });

  it("R-6: the per-cell Grade button's own rejected call must not leave the cell stuck on Grading", async () => {
    gradeRepoActionMock.mockImplementation(async () => {
      throw new Error("Failed to fetch");
    });

    const render1 = useTestRender();
    // handleGradeCell awaits resolveRubricForColumn directly (not via
    // runBulkGrade), so its own deferred must resolve before this promise
    // can settle.
    const p = render1.handleGradeCell(ROWS[0], COLUMNS[0]);
    expect(rubricDeferreds.length).toBe(1);
    rubricDeferreds[0].resolve(resolvedRubric());
    await p;

    const edit = cellEditsState["org/a"]?.["week-1"];
    expect(edit?.grading).toBe(false);
    expect(edit?.gradeError).toBeTruthy();
    expect(recordLogCalls.some((e) => e.kind === "grade-failed" && e.repo === "org/a")).toBe(true);
  });
});
