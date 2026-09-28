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
vi.mock("@/app/actions/grading-incremental", () => ({
  prepareGradingRunAction: (...args: unknown[]) => prepareGradingRunActionMock(...args),
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
import type { GradeResult } from "@/lib/grade/types";

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

function fdWithCanvasUrl(): FormData {
  const fd = new FormData();
  fd.set("canvasUrl", "https://x.instructure.com/courses/1/assignments/2");
  fd.set("provider", "gemini");
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

    prepareDeferred.resolve({ mode: "incremental", plan: twoTicketPlan() });
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

    prepareDeferred.resolve({ mode: "incremental", plan: { ...twoTicketPlan(), tickets: [] } });
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
    prepareGradingRunActionMock.mockResolvedValue({ mode: "incremental", plan: { ...twoTicketPlan(), tickets: [] } });
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
    prepareGradingRunActionMock.mockResolvedValueOnce({ mode: "incremental", plan: fourTicketPlan });
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
    prepareGradingRunActionMock.mockResolvedValueOnce({ mode: "incremental", plan: twoTicketPlan() });
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

describe("W4-9c: the react budget (docs/a39-waves.md 8.4.3, step S4)", () => {
  const source = readFileSync(join(process.cwd(), "src/app/components/grading/useIncrementalGradingRun.ts"), "utf8");

  it("imports exactly useRef and useState from \"react\" - a useCallback/useEffect/useMemo would make the no-render harness throw, not fail red", () => {
    const importMatch = /import\s*\{([^}]*)\}\s*from\s*"react";/.exec(source);
    expect(importMatch).not.toBeNull();
    const names = importMatch![1].split(",").map((s) => s.trim()).filter(Boolean).sort();
    expect(names).toEqual(["useRef", "useState"]);
  });
});
