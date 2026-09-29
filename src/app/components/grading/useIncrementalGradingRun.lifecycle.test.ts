// A39 wave 4c, W4-9 (docs/a39-waves.md 8.4.3, step S4): a PORT of the
// proven no-render harness useRepoGradesBulkGrade.lifecycle.test.ts already
// ships (its own header, verbatim): "Nothing renders in this repo's vitest
// ... so the harness below stands in for React: one call of [the hook] is
// one 'render' ... useRef returns the SAME object on every call, which is
// what makes a ref-based lock (unlike a state-based one) visible to an
// ALREADY-RETURNED closure without waiting for a new render."
//
// Copied, not imported (no-cross-test-file-imports: importing a helper from
// another *.test.ts re-runs its describe blocks).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const h0 = vi.hoisted(() => {
  const slots: Array<{ value: unknown }> = [];
  let cursor = 0;
  return {
    reset: () => {
      slots.length = 0;
      cursor = 0;
    },
    begin: () => {
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

const prepareGradingRunActionMock = vi.fn();
// W6: resolves empty by default so pre-existing tests need no stub for it.
const completeGradingRunHeaderActionMock = vi.fn().mockResolvedValue({ fullCreditChecklist: [], sampleAnswer: "" });
vi.mock("@/app/actions/grading-incremental", () => ({
  prepareGradingRunAction: (...args: unknown[]) => prepareGradingRunActionMock(...args),
  completeGradingRunHeaderAction: (...args: unknown[]) => completeGradingRunHeaderActionMock(...args),
}));

// RULING 117: this file proves the POOL's own behaviour (the press-twice
// lock, cancellation, early-arrival rendering), which is a different
// question from RULING 116's routing default. RULING 116 set
// INCREMENTAL_ROUTE_ENABLED to false in incrementalRunPlan.ts, so the REAL
// routeGradingRun now always returns "whole-run" - which would make every
// pool assertion below vacuous regardless of which way that flag is set.
// Stubbed here, as a PARTIAL mock (the idiom already in this repo, see
// src/app/actions/grading-incremental.test.ts:15's `{ ...actual, callLlm:
// vi.fn() }`), so INCREMENTAL_CONCURRENCY, buildRunItemRequests,
// mergeArrivedResults and classifyItemFailure all stay REAL and this file's
// claims survive RULING 116's flag flipping in either direction. Whether the
// flag itself is off is incrementalRunPlan.test.ts's claim, not this file's.
const routeGradingRunMock = vi.fn();
vi.mock("./incrementalRunPlan", async () => {
  const actual = await vi.importActual<typeof import("./incrementalRunPlan")>("./incrementalRunPlan");
  return { ...actual, routeGradingRun: (...args: unknown[]) => routeGradingRunMock(...args) };
});

import { useIncrementalGradingRun } from "./useIncrementalGradingRun";
import type { IncrementalRunPlan } from "./incrementalRunPlan";
import type { GradeResult, GradingRunHeader } from "@/lib/grade/types";

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function gradedRow(student: string): GradeResult {
  return {
    student,
    overallComment: "",
    strengths: "",
    improvements: "",
    resubmitNotice: "",
    rubricAreas: [],
    totalScore: "",
    feedback: "",
    mergedFileCount: 1,
    submittedFiles: [],
  };
}

function twoTicketPlan(): IncrementalRunPlan {
  return {
    tickets: [
      { sourceIndex: 0, entry: { student: "Alice", content: "a", mergedFileCount: 1, submittedFiles: [] } },
      { sourceIndex: 1, entry: { student: "Bob", content: "b", mergedFileCount: 1, submittedFiles: [] } },
    ],
    assignmentInstructions: "Grade it.",
    rubric: "1. Correctness",
    provider: "gemini",
    pointsPossible: null,
  };
}

// A39 incremental-fill W5 (docs/a39-fill-waves.md): `mode: "incremental"`
// now carries a resolved header and a speedGraderUrl (design section 4.3) -
// buildIncrementalRun reads both. An empty criteriaNames keeps
// canonicalColumns on its arrival-order union branch, same as before this
// wave for every existing case here.
function resolvedHeader(overrides: Partial<Extract<GradingRunHeader, { kind: "ok" }>> = {}): Extract<
  GradingRunHeader,
  { kind: "ok" }
> {
  return {
    kind: "ok",
    effectiveRubric: "1. Correctness",
    generatedRubric: undefined,
    criteriaNames: [],
    rubricUsed: "",
    rubricFingerprint: "",
    ...overrides,
  };
}

function incrementalPrepared(plan: IncrementalRunPlan) {
  return { mode: "incremental" as const, plan, header: resolvedHeader(), speedGraderUrl: null };
}

function fdWithCanvasUrl(): FormData {
  const fd = new FormData();
  fd.set("canvasUrl", "https://x.instructure.com/courses/1/assignments/2");
  fd.set("provider", "gemini");
  return fd;
}

// RES-FILL-2: no canvasUrl, non-gemini provider - the client-side
// synchronous whole-run fixture (mirrors the "client-side synchronous
// whole-run route (non-gemini provider)" test below). routeGradingRun is
// stubbed in this file (see the header comment above routeGradingRunMock),
// so the fixture's own field values don't drive the route decision here -
// routeGradingRunMock.mockReturnValue("whole-run") does - but the fixture is
// still built the way that real route would actually resolve, for fidelity.
function fdWithoutCanvasUrl(): FormData {
  const fd = new FormData();
  fd.set("provider", "other");
  return fd;
}

const fetchMock = vi.fn();

function useTestRender(submitWholeRunMock: (fd: FormData) => void) {
  h0.begin();
  return useIncrementalGradingRun({ provider: "gemini", submitWholeRun: submitWholeRunMock });
}

beforeEach(() => {
  h0.reset();
  prepareGradingRunActionMock.mockReset();
  completeGradingRunHeaderActionMock.mockClear();
  fetchMock.mockReset();
  routeGradingRunMock.mockReset();
  // Default: the pool branch, regardless of INCREMENTAL_ROUTE_ENABLED - see
  // the header comment above the mock declaration. Individual tests of the
  // whole-run branch override this per-call.
  routeGradingRunMock.mockReturnValue("incremental");
  vi.stubGlobal("fetch", fetchMock);
});

describe("useIncrementalGradingRun - W4-9: the press-twice instrument", () => {
  it("OBJECT: total dispatches (prepareGradingRunAction + item fetches + submitWholeRun) is 1 after TWO calls from the SAME render, no tick between", async () => {
    const prepareDeferred = deferred<ReturnType<typeof twoTicketPlan> extends never ? never : unknown>();
    prepareGradingRunActionMock.mockReturnValueOnce(prepareDeferred.promise);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ sourceIndex: 0, result: gradedRow("Alice") }),
    });

    const submitWholeRunMock = vi.fn();
    const render1 = useTestRender(submitWholeRunMock);

    const p1 = render1.startReview(fdWithCanvasUrl());
    // Click 2 reuses click 1's OWN closure - the same render object, no new
    // render, no tick, no await - exactly A26b's shape.
    const p2 = render1.startReview(fdWithCanvasUrl());

    prepareDeferred.resolve(incrementalPrepared(twoTicketPlan()));
    await flushMicrotasks();
    await Promise.all([p1, p2]);

    // DIRECTION OF FAILURE: RED if the total is anything other than 1 - not
    // an assertion that a flag is set.
    const total = prepareGradingRunActionMock.mock.calls.length + fetchMock.mock.calls.length + submitWholeRunMock.mock.calls.length;
    expect(prepareGradingRunActionMock.mock.calls.length).toBe(1);
    expect(total).toBe(1 + 2); // one prepare call, two item fetches (one per ticket) - never doubled.
  });

  it("a fresh render taken immediately after click 1, with no tick, already shows incrementalRunning - the flag commits synchronously before any await", async () => {
    const prepareDeferred = deferred<unknown>();
    prepareGradingRunActionMock.mockReturnValueOnce(prepareDeferred.promise);

    const submitWholeRunMock = vi.fn();
    const render1 = useTestRender(submitWholeRunMock);
    const p1 = render1.startReview(fdWithCanvasUrl());

    // No await, no macrotask - a render taken from the SAME synchronous
    // task as click 1.
    const render1b = useTestRender(submitWholeRunMock);
    expect(render1b.incrementalRunning).toBe(true);

    prepareDeferred.resolve(incrementalPrepared({ ...twoTicketPlan(), tickets: [] }));
    await p1;
  });

  it("WATCHED: without the lock, two calls from the same render would each independently call prepareGradingRunAction (anti-vacuity for the lock's effect)", async () => {
    // This does not mutate production code (per this repo's own restore
    // discipline: cp-backup, never git checkout -- on an uncommitted file).
    // It demonstrates the CONTRAST directly: calling startReview through TWO
    // separate hook instances (i.e. with no shared lock at all, the
    // structural equivalent of the guard being absent) does call the
    // action twice - proving prepareGradingRunActionMock is capable of
    // being called more than once, so the "exactly 1" assertion above is
    // not vacuously satisfied by a mock that can only ever be called once.
    prepareGradingRunActionMock.mockResolvedValue(incrementalPrepared({ ...twoTicketPlan(), tickets: [] }));
    const submitWholeRunMock = vi.fn();
    const renderA = useTestRender(submitWholeRunMock);
    // A REAL second instance (not a re-render of the same one): h0.reset()
    // clears every slot, so renderB's useRef/useState calls allocate BRAND
    // NEW objects rather than reusing renderA's already-captured lock -
    // renderA's own closures still hold references to the OLD slot objects,
    // captured before this reset ran.
    h0.reset();
    const renderB = useTestRender(submitWholeRunMock);
    await Promise.all([renderA.startReview(fdWithCanvasUrl()), renderB.startReview(fdWithCanvasUrl())]);
    expect(prepareGradingRunActionMock.mock.calls.length).toBe(2);
  });

  it("RES-FILL-2: the whole-run branch (routeGradingRun resolving synchronously to 'whole-run', a fdWithoutCanvasUrl()/non-gemini fixture) also totals exactly ONE dispatch after TWO calls from the SAME render, no tick between", async () => {
    // Unlike the incremental branch above, this branch has no `await`
    // before `beginWholeRun` - the whole call completes in one synchronous
    // turn, which is exactly why the lock alone (without RES-FILL-2's
    // deferred release) gave this branch no protection at all: by the time
    // the second call below is made, the first has already run to
    // completion and released the lock in the same script.
    routeGradingRunMock.mockReturnValue("whole-run");
    const submitWholeRunMock = vi.fn();
    const render1 = useTestRender(submitWholeRunMock);
    const fd = fdWithoutCanvasUrl();

    const p1 = render1.startReview(fd);
    // Click 2 reuses click 1's OWN closure - the same render object, no new
    // render, no tick, no await - exactly the incremental case's shape
    // above (and A26b's).
    const p2 = render1.startReview(fd);

    await Promise.all([p1, p2]);

    // DIRECTION OF FAILURE: RED if submitWholeRun is called more than once -
    // not an assertion that a flag is set.
    expect(submitWholeRunMock).toHaveBeenCalledTimes(1);
    expect(prepareGradingRunActionMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("useIncrementalGradingRun - RULING 40: the server-decided whole-run branch has a named consumer", () => {
  it("calls the injected submitWholeRun when prepareGradingRunAction returns mode:'whole-run', and never starts the pool", async () => {
    prepareGradingRunActionMock.mockResolvedValueOnce({ mode: "whole-run", reason: "Nothing to grade was found." });
    const submitWholeRunMock = vi.fn();
    const render1 = useTestRender(submitWholeRunMock);
    const fd = fdWithCanvasUrl();

    await render1.startReview(fd);

    expect(submitWholeRunMock).toHaveBeenCalledTimes(1);
    expect(submitWholeRunMock).toHaveBeenCalledWith(fd);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("WATCHED FAILURE: a startReview that ignored the returned mode would start the pool anyway - this is the direction that must not happen", async () => {
    prepareGradingRunActionMock.mockResolvedValueOnce({ mode: "whole-run", reason: "too large" });
    const submitWholeRunMock = vi.fn();
    const render1 = useTestRender(submitWholeRunMock);
    await render1.startReview(fdWithCanvasUrl());
    // The failure this guards against: fetch called despite a whole-run
    // decision. Asserted as an explicit negative, not merely inferred from
    // the positive assertions above.
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("the client-side synchronous whole-run route (non-gemini provider) also calls the SAME injected submitWholeRun, never prepareGradingRunAction", async () => {
    // routeGradingRun is stubbed (see header comment); this test exercises
    // the hook's OWN branch on the "whole-run" return, not routeGradingRun's
    // real non-gemini logic (that belongs to incrementalRunPlan.test.ts).
    routeGradingRunMock.mockReturnValueOnce("whole-run");
    const submitWholeRunMock = vi.fn();
    h0.begin();
    const hook = useIncrementalGradingRun({ provider: "other", submitWholeRun: submitWholeRunMock });
    const fd = new FormData();
    fd.set("canvasUrl", "https://x.instructure.com/courses/1/assignments/2");

    await hook.startReview(fd);

    expect(submitWholeRunMock).toHaveBeenCalledTimes(1);
    expect(prepareGradingRunActionMock).not.toHaveBeenCalled();
  });

  it("RULING 116/117: with routeGradingRun returning 'whole-run', the hook takes the whole-run branch and never calls prepareGradingRunAction - pinning the gate from this side too, so this file proves both branches", async () => {
    routeGradingRunMock.mockReturnValueOnce("whole-run");
    const submitWholeRunMock = vi.fn();
    const render1 = useTestRender(submitWholeRunMock);
    const fd = fdWithCanvasUrl();

    await render1.startReview(fd);

    expect(submitWholeRunMock).toHaveBeenCalledTimes(1);
    expect(submitWholeRunMock).toHaveBeenCalledWith(fd);
    expect(prepareGradingRunActionMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("useIncrementalGradingRun - RULING 118: a refusal never reaches the paying whole-run seam", () => {
  // THE REAL CLAIM (RULING 118, moved here from grading-incremental.test.ts
  // per the iteration-caps rule - that file's own "not called" assertion is
  // vacuous, since grading-incremental.ts has no model-call site at all).
  // submitWholeRun IS the seam: it is the one call site that dispatches the
  // paying whole-run gradeAction (useIncrementalGradingRun.ts's own header
  // comment). This describe block is the only place in the repo where "did a
  // refusal cost money" is observable at all.
  //
  // Positive control for the SAME mock: the "RULING 40" describe block above
  // already proves submitWholeRunMock IS reachable from this exact hook, for
  // an ordinary `mode: 'whole-run'` result ("calls the injected
  // submitWholeRun when prepareGradingRunAction returns mode:'whole-run'" and
  // the two tests after it) - so a "not called" assertion below is not
  // trivially true of a mock that can never fire.
  it("mode:'refused' surfaces the reason via incrementalError and NEVER calls submitWholeRun or fetch", async () => {
    prepareGradingRunActionMock.mockResolvedValueOnce({
      mode: "refused",
      reason: 'Refused: 2 files resolve to the same student name "Homework", so they would have been graded together as one row.',
    });
    const submitWholeRunMock = vi.fn();
    const render1 = useTestRender(submitWholeRunMock);
    const fd = fdWithCanvasUrl();

    await render1.startReview(fd);

    expect(submitWholeRunMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    const after = useTestRender(submitWholeRunMock);
    expect(after.incrementalError).toBe(
      'Refused: 2 files resolve to the same student name "Homework", so they would have been graded together as one row.'
    );
    expect(after.incrementalRunning).toBe(false);
  });

  // SABOTAGE PROOF: with the Defect-1 fix reverted (a refusal routed back
  // into the whole-run branch, exactly as production code did before this
  // ruling), the test above must fail RED. Verified manually per this
  // ticket's instructions by temporarily changing this hook's
  // `if (prepared.mode === "refused")` branch to
  // `if (prepared.mode === "whole-run" || prepared.mode === "refused")`
  // (merged into the existing whole-run branch, the exact shape of the
  // pre-fix defect) after backing up useIncrementalGradingRun.ts to a
  // directory OUTSIDE the repo with `cp`, then restoring the backup - see
  // docs/ruling-118.md for the verbatim RED output and the restore command.
});

describe("useIncrementalGradingRun - cancellation", () => {
  it("cancel() stops further dispatch once the pool is at capacity; already-dispatched calls still land", async () => {
    // FOUR tickets against INCREMENTAL_CONCURRENCY=3: the pool opens exactly
    // three workers, so the fourth ticket is only picked up once one of the
    // first three completes. Blocking all three and cancelling before any
    // of them resolves proves the fourth is NEVER dispatched.
    const fourTicketPlan: IncrementalRunPlan = {
      tickets: [0, 1, 2, 3].map((i) => ({
        sourceIndex: i,
        entry: { student: `S${i}`, content: "x", mergedFileCount: 1, submittedFiles: [] },
      })),
      assignmentInstructions: "Grade it.",
      rubric: "1. Correctness",
      provider: "gemini",
      pointsPossible: null,
    };
    prepareGradingRunActionMock.mockResolvedValueOnce(incrementalPrepared(fourTicketPlan));
    const blocked = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    fetchMock.mockReturnValue(blocked.promise);

    const submitWholeRunMock = vi.fn();
    const render1 = useTestRender(submitWholeRunMock);
    const p1 = render1.startReview(fdWithCanvasUrl());
    await flushMicrotasks();

    // Exactly three in flight (the concurrency ceiling), the fourth still
    // waiting on the cursor.
    expect(fetchMock.mock.calls.length).toBe(3);

    render1.cancel();
    blocked.resolve({ ok: true, json: async () => ({ sourceIndex: 0, result: gradedRow("S0") }) });
    await p1;

    // No fourth dispatch after cancel, even though a worker freed up.
    expect(fetchMock.mock.calls.length).toBe(3);
  });
});

describe("useIncrementalGradingRun - row 1 renders while row 7 is still running (the wave's own motivation)", () => {
  it("incrementalResults contains an early arrival BEFORE a later ticket has resolved at all - never all-or-nothing", async () => {
    prepareGradingRunActionMock.mockResolvedValueOnce(incrementalPrepared(twoTicketPlan()));
    const bobDeferred = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sourceIndex: 0, result: gradedRow("Alice") }) })
      .mockReturnValueOnce(bobDeferred.promise);

    const submitWholeRunMock = vi.fn();
    const render1 = useTestRender(submitWholeRunMock);
    const p1 = render1.startReview(fdWithCanvasUrl());
    await flushMicrotasks();
    await flushMicrotasks();

    // WATCHED FAILURE direction: an implementation that only calls
    // setIncrementalResults once, after Promise.all resolves, would show
    // an EMPTY array here, identical to the whole-run path's own "nothing
    // renders until every student is done" - exactly the felt loss A39
    // exists to fix. Read via a fresh render, per this harness's own idiom.
    const midRun = useTestRender(submitWholeRunMock);
    expect(midRun.incrementalResults.length).toBe(1);
    expect(midRun.incrementalResults[0].student).toBe("Alice");

    bobDeferred.resolve({ ok: true, json: async () => ({ sourceIndex: 1, result: gradedRow("Bob") }) });
    await p1;
  });
});

describe("F4 (docs/a39-fill-waves.md W5): tier 1 completes before any ticket is dispatched - ORDER at the consumer", () => {
  it("the prepare call-log entry precedes every fetch entry, and every fetch body's rubric equals the resolved header's effectiveRubric", async () => {
    const log: string[] = [];
    const effectiveRubric = "1. Correctness (resolved by tier 1)";
    prepareGradingRunActionMock.mockImplementationOnce(async () => {
      log.push("prepare");
      return {
        mode: "incremental" as const,
        plan: { ...twoTicketPlan(), rubric: effectiveRubric },
        header: resolvedHeader({ effectiveRubric }),
        speedGraderUrl: null,
      };
    });
    fetchMock.mockImplementation(async (_url: string, init: { body: string }) => {
      log.push("fetch");
      const body = JSON.parse(init.body) as { rubric: string; sourceIndex: number };
      return { ok: true, json: async () => ({ sourceIndex: body.sourceIndex, result: gradedRow(`S${body.sourceIndex}`) }) };
    });

    const submitWholeRunMock = vi.fn();
    const render1 = useTestRender(submitWholeRunMock);
    await render1.startReview(fdWithCanvasUrl());

    // DIRECTION OF FAILURE: dispatching the pool before awaiting
    // prepareGradingRunAction (useIncrementalGradingRun.ts's own
    // `await prepareGradingRunAction(fd)` ahead of `buildRunItemRequests`/
    // `runPool`) would invert this order - the log would open with a "fetch".
    expect(log[0]).toBe("prepare");
    expect(log.slice(1)).toEqual(["fetch", "fetch"]);

    for (const call of fetchMock.mock.calls) {
      const body = JSON.parse((call[1] as { body: string }).body) as { rubric: string };
      expect(body.rubric).toBe(effectiveRubric);
      expect(body.rubric.length).toBeGreaterThan(0);
    }
  });
});

describe("the phase machine (docs/a39-fill-waves.md W5, architecture 5.3)", () => {
  it("idle -> running the instant the route is decided incremental, before prepareGradingRunAction resolves", async () => {
    const prepareDeferred = deferred<unknown>();
    prepareGradingRunActionMock.mockReturnValueOnce(prepareDeferred.promise);
    const submitWholeRunMock = vi.fn();
    const render1 = useTestRender(submitWholeRunMock);
    expect(render1.phase).toBe("idle");

    const p1 = render1.startReview(fdWithCanvasUrl());
    const render1b = useTestRender(submitWholeRunMock);
    expect(render1b.phase).toBe("running");

    prepareDeferred.resolve(incrementalPrepared(twoTicketPlan()));
    await p1;
  });

  it("running -> complete once every ticket has arrived", async () => {
    prepareGradingRunActionMock.mockResolvedValueOnce(incrementalPrepared(twoTicketPlan()));
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ sourceIndex: 0, result: gradedRow("Alice") }) });
    const submitWholeRunMock = vi.fn();
    const render1 = useTestRender(submitWholeRunMock);
    await render1.startReview(fdWithCanvasUrl());

    const after = useTestRender(submitWholeRunMock);
    expect(after.phase).toBe("complete");
  });

  it("running -> stopping -> stopped when cancelled with tickets still outstanding", async () => {
    const fourTicketPlan: IncrementalRunPlan = {
      tickets: [0, 1, 2, 3].map((i) => ({
        sourceIndex: i,
        entry: { student: `S${i}`, content: "x", mergedFileCount: 1, submittedFiles: [] },
      })),
      assignmentInstructions: "Grade it.",
      rubric: "1. Correctness",
      provider: "gemini",
      pointsPossible: null,
    };
    prepareGradingRunActionMock.mockResolvedValueOnce(incrementalPrepared(fourTicketPlan));
    const blocked = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    fetchMock.mockReturnValue(blocked.promise);

    const submitWholeRunMock = vi.fn();
    const render1 = useTestRender(submitWholeRunMock);
    const p1 = render1.startReview(fdWithCanvasUrl());
    await flushMicrotasks();

    render1.cancel();
    const afterCancel = useTestRender(submitWholeRunMock);
    expect(afterCancel.phase).toBe("stopping");

    blocked.resolve({ ok: true, json: async () => ({ sourceIndex: 0, result: gradedRow("S0") }) });
    await p1;

    const afterStop = useTestRender(submitWholeRunMock);
    expect(afterStop.phase).toBe("stopped");
  });

  it("running -> refused surfaces via mode:'refused', never reaching complete", async () => {
    prepareGradingRunActionMock.mockResolvedValueOnce({ mode: "refused", reason: "Refused: test" });
    const submitWholeRunMock = vi.fn();
    const render1 = useTestRender(submitWholeRunMock);
    await render1.startReview(fdWithCanvasUrl());

    const after = useTestRender(submitWholeRunMock);
    expect(after.phase).toBe("refused");
  });

  it("beginWholeRun (the ONE door) resets the phase to idle - architecture 5.4/5.7 obligation 1", async () => {
    routeGradingRunMock.mockReturnValueOnce("whole-run");
    const submitWholeRunMock = vi.fn();
    const render1 = useTestRender(submitWholeRunMock);
    await render1.startReview(fdWithCanvasUrl());

    const after = useTestRender(submitWholeRunMock);
    expect(after.phase).toBe("idle");
    expect(submitWholeRunMock).toHaveBeenCalledTimes(1);
  });
});

describe("W6 (docs/a39-fill-waves.md, design 4.3 TIER 2): F16 - dispatched on mode:'incremental' ONLY", () => {
  it("calls completeGradingRunHeaderAction exactly once, with the resolved plan's own fields, on the incremental path", async () => {
    prepareGradingRunActionMock.mockResolvedValueOnce(incrementalPrepared(twoTicketPlan()));
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ sourceIndex: 0, result: gradedRow("Alice") }) });
    const submitWholeRunMock = vi.fn();
    await useTestRender(submitWholeRunMock).startReview(fdWithCanvasUrl());
    expect(completeGradingRunHeaderActionMock).toHaveBeenCalledTimes(1);
    expect(completeGradingRunHeaderActionMock).toHaveBeenCalledWith("Grade it.", "1. Correctness", "gemini");
  });

  it("WATCHED FAILURE: never calls it when prepareGradingRunAction returns mode:'whole-run'", async () => {
    prepareGradingRunActionMock.mockResolvedValueOnce({ mode: "whole-run", reason: "too large" });
    const submitWholeRunMock = vi.fn();
    await useTestRender(submitWholeRunMock).startReview(fdWithCanvasUrl());
    expect(completeGradingRunHeaderActionMock).not.toHaveBeenCalled();
  });

  it("WATCHED FAILURE: never calls it when prepareGradingRunAction returns mode:'refused'", async () => {
    prepareGradingRunActionMock.mockResolvedValueOnce({ mode: "refused", reason: "Refused: test" });
    const submitWholeRunMock = vi.fn();
    await useTestRender(submitWholeRunMock).startReview(fdWithCanvasUrl());
    expect(completeGradingRunHeaderActionMock).not.toHaveBeenCalled();
  });
});

describe("F17 (design 4.3): Tier 2 SURVIVES every later arrival - storage is a REF, not state", () => {
  it("a Tier 2 payload that resolves before the SECOND ticket arrives is still on the run once every ticket is in", async () => {
    prepareGradingRunActionMock.mockResolvedValueOnce(incrementalPrepared(twoTicketPlan()));
    const tier2Deferred = deferred<{ fullCreditChecklist: string[]; sampleAnswer: string }>();
    completeGradingRunHeaderActionMock.mockReturnValueOnce(tier2Deferred.promise);
    const bobDeferred = deferred<{ ok: boolean; json: () => Promise<unknown> }>();
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sourceIndex: 0, result: gradedRow("Alice") }) })
      .mockReturnValueOnce(bobDeferred.promise);

    const submitWholeRunMock = vi.fn();
    const render1 = useTestRender(submitWholeRunMock);
    const p1 = render1.startReview(fdWithCanvasUrl());
    await flushMicrotasks();
    await flushMicrotasks();

    // Tier 2 lands while Bob (the LATER arrival) is still outstanding.
    tier2Deferred.resolve({ fullCreditChecklist: ["Cite sources"], sampleAnswer: "A model answer." });
    await flushMicrotasks();
    bobDeferred.resolve({ ok: true, json: async () => ({ sourceIndex: 1, result: gradedRow("Bob") }) });
    await p1;

    // WATCHED FAILURE: useState instead of a ref rebuilds from a stale closure.
    const after = useTestRender(submitWholeRunMock);
    expect(after.incrementalRun?.fullCreditChecklist).toEqual(["Cite sources"]);
    expect(after.incrementalRun?.sampleAnswer).toBe("A model answer.");
  });
});

describe("F18 (design 4.3): a Tier 2 rejection is caught, OBSERVABLE, and never stops the run", () => {
  it("every row arrives, phase reaches complete, incrementalError reports the failure", async () => {
    prepareGradingRunActionMock.mockResolvedValueOnce(incrementalPrepared(twoTicketPlan()));
    // Rejects AFTER "complete" - catches mutation (b): a rejection landing
    // earlier would let the run's own finalPhase silently overwrite it.
    let rejectTier2!: (err: unknown) => void;
    const tier2Promise = new Promise<never>((_resolve, reject) => (rejectTier2 = reject));
    tier2Promise.catch(() => {});
    completeGradingRunHeaderActionMock.mockReturnValueOnce(tier2Promise);
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sourceIndex: 0, result: gradedRow("Alice") }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sourceIndex: 1, result: gradedRow("Bob") }) });

    const submitWholeRunMock = vi.fn();
    await useTestRender(submitWholeRunMock).startReview(fdWithCanvasUrl());
    expect(useTestRender(submitWholeRunMock).phase).toBe("complete");

    rejectTier2(new Error("checklist synthesis exploded"));
    await flushMicrotasks();
    const after = useTestRender(submitWholeRunMock);
    expect(after.incrementalResults.map((r) => r.student).sort()).toEqual(["Alice", "Bob"]); // (a)
    expect(after.phase).toBe("complete"); // (b) never diverted by the Tier 2 failure
    expect(after.incrementalError).toContain("checklist synthesis exploded"); // (c)
    expect(after.incrementalError).toContain("Grades are unaffected");
  });
});

describe("W4-9c: the react budget (docs/a39-waves.md 8.4.3, step S4)", () => {
  const source = readFileSync(join(process.cwd(), "src/app/components/grading/useIncrementalGradingRun.ts"), "utf8");

  it("imports exactly useRef and useState from \"react\" - a useCallback/useEffect/useMemo would make the no-render harness throw, not fail red", () => {
    const importMatch = /import\s*\{([^}]*)\}\s*from\s*"react";/.exec(source);
    expect(importMatch).not.toBeNull();
    const names = importMatch![1].split(",").map((s) => s.trim()).filter(Boolean).sort();
    expect(names).toEqual(["useRef", "useState"]);
  });
});
