// GRADING-CHAT wave 1 (docs/grading-chat-waves.md section 3, T4). The
// no-render harness is a PORT of useIncrementalGradingRun.lifecycle.test.ts's
// own h0 (its own header explains why: nothing renders in this repo's
// vitest, so one hook call is one "render", and useRef returns the SAME
// object across calls). Copied, not imported (no-cross-test-file-imports).
import { describe, expect, it, vi, beforeEach } from "vitest";

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

const resolveChatRunHeaderActionMock = vi.fn();
const prepareChatSubmissionActionMock = vi.fn();
vi.mock("@/app/actions/grading-chat-intake", () => ({
  resolveChatRunHeaderAction: (...args: unknown[]) => resolveChatRunHeaderActionMock(...args),
  prepareChatSubmissionAction: (...args: unknown[]) => prepareChatSubmissionActionMock(...args),
}));

import { useContinuousGradingRun } from "./useContinuousGradingRun";
import type { GradeResult } from "@/lib/grade/types";

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

const readyHeader = {
  kind: "ok" as const,
  effectiveRubric: "1. Correctness",
  generatedRubric: undefined,
  criteriaNames: [],
  rubricUsed: "",
  rubricFingerprint: "",
};

const dispatchItemMock = vi.fn();

function useTestDriver(maxEntries = 40) {
  h0.begin();
  return useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, maxEntries });
}

beforeEach(() => {
  h0.reset();
  resolveChatRunHeaderActionMock.mockReset();
  prepareChatSubmissionActionMock.mockReset();
  dispatchItemMock.mockReset();
  resolveChatRunHeaderActionMock.mockResolvedValue(readyHeader);
});

describe("useContinuousGradingRun - beginSession / AC-3 / AC-4", () => {
  it("resolves to ready and is idempotent on a second call", async () => {
    let driver = useTestDriver();
    const first = await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    expect(first.kind).toBe("ready");
    driver = useTestDriver();
    expect(driver.headerState).toBe("ready");

    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    expect(resolveChatRunHeaderActionMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces the blank-instructions refusal and dispatches nothing", async () => {
    resolveChatRunHeaderActionMock.mockResolvedValue({ kind: "refused", error: "Please provide assignment instructions." });
    let driver = useTestDriver();
    const result = await driver.beginSession({ assignmentInstructions: "", rubric: "" });
    expect(result.kind).toBe("refused");
    driver = useTestDriver();
    expect(driver.headerState).toBe("refused");
    expect(driver.sessionError).toBe("Please provide assignment instructions.");
  });
});

describe("useContinuousGradingRun - AC-5/AC-6/AC-L: dispatch-on-arrival, non-blocking", () => {
  it("dispatches one call per text submission, immediately, before a later submission arrives (AC-L)", async () => {
    let driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver();

    dispatchItemMock.mockReturnValue(new Promise(() => {})); // never resolves in this test
    await driver.submit({ kind: "text", content: "submission one" });
    // AC-L: the first dispatch is already in flight before the SECOND
    // submission is even entered.
    expect(dispatchItemMock).toHaveBeenCalledTimes(1);
    await driver.submit({ kind: "text", content: "submission two" });
    expect(dispatchItemMock).toHaveBeenCalledTimes(2);
  });

  it("appends results across submissions and NEVER resets the accumulated rows (the surface's leverage over a plain chat)", async () => {
    let driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver();

    dispatchItemMock.mockResolvedValueOnce(gradedRow("Alice"));
    await driver.submit({ kind: "text", content: "one" });
    await flushMicrotasks();
    driver = useTestDriver();
    expect(driver.results).toHaveLength(1);

    dispatchItemMock.mockResolvedValueOnce(gradedRow("Bob"));
    await driver.submit({ kind: "text", content: "two" });
    await flushMicrotasks();
    driver = useTestDriver();
    expect(driver.results).toHaveLength(2);
    expect(driver.results.map((r) => r.student)).toEqual(["Alice", "Bob"]);
  });
});

describe("useContinuousGradingRun - RES-GC-9: the pool must not wedge", () => {
  it("repeated-failure-does-not-wedge: 3 consecutive rejections free their slots, and a 4th submission still dispatches", async () => {
    let driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver();

    dispatchItemMock
      .mockRejectedValueOnce(new Error("boom 1"))
      .mockRejectedValueOnce(new Error("boom 2"))
      .mockRejectedValueOnce(new Error("boom 3"));

    // INCREMENTAL_CONCURRENCY is 3: three submissions fill every slot at once.
    await driver.submit({ kind: "text", content: "one" });
    await driver.submit({ kind: "text", content: "two" });
    await driver.submit({ kind: "text", content: "three" });
    expect(dispatchItemMock).toHaveBeenCalledTimes(3);

    // Let every rejected promise's .catch/.finally run - a pool written
    // without a .finally on the rejected path would leave inFlight stuck at
    // 3 forever, and the 4th submission below would never reach dispatchItem.
    await flushMicrotasks();
    await flushMicrotasks();

    dispatchItemMock.mockReturnValueOnce(new Promise(() => {}));
    await driver.submit({ kind: "text", content: "four" });
    expect(dispatchItemMock).toHaveBeenCalledTimes(4);
  });
});

describe("useContinuousGradingRun - RES-GC-8: partial-grade-to-the-ceiling", () => {
  it("a 41-entry submission against maxEntries=40 dispatches 40 and returns a named partial refusal, never zero", async () => {
    let driver = useTestDriver(40);
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver(40);

    const entries = Array.from({ length: 41 }, (_, i) => ({
      student: `Student ${i}`,
      content: "x",
      mergedFileCount: 0,
      submittedFiles: [],
    }));
    prepareChatSubmissionActionMock.mockResolvedValue({ kind: "entries", entries, pointsPossible: null });
    dispatchItemMock.mockReturnValue(new Promise(() => {}));

    const outcome = await driver.submit({ kind: "url", url: "https://canvas.example.edu/courses/1/assignments/2" });
    expect(outcome.kind).toBe("partial");
    if (outcome.kind === "partial") {
      expect(outcome.dispatchedCount).toBe(40);
      expect(outcome.refusedCount).toBe(1);
      expect(outcome.reason).toContain("40");
    }
    // All 40 admitted entries are ENQUEUED (never zero), but only
    // INCREMENTAL_CONCURRENCY (3) dispatch at once - the rest wait in the
    // queue for a slot to free, exactly like the batch pool's own bound.
    expect(dispatchItemMock).toHaveBeenCalledTimes(3);

    driver = useTestDriver(40);
    expect(driver.dispatchedCount).toBe(40);
  });

  it("refuses a submission outright once the ceiling is already reached, never dispatching", async () => {
    let driver = useTestDriver(1);
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver(1);

    dispatchItemMock.mockReturnValue(new Promise(() => {}));
    const first = await driver.submit({ kind: "text", content: "one" });
    expect(first.kind).toBe("accepted");

    driver = useTestDriver(1);
    const second = await driver.submit({ kind: "text", content: "two" });
    expect(second.kind).toBe("refused");
    expect(dispatchItemMock).toHaveBeenCalledTimes(1);
  });
});

describe("useContinuousGradingRun - reset() genuinely clears the run for a new session (verify doc RESIDUAL A / fix #1)", () => {
  it("reset() clears headerState, results, run and dispatchedCount, and a fresh session starts sourceIndex over rather than appending", async () => {
    let driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "Grade assignment one.", rubric: "1. Correctness" });
    driver = useTestDriver();

    dispatchItemMock.mockResolvedValueOnce(gradedRow("Alice"));
    await driver.submit({ kind: "text", content: "one" });
    await flushMicrotasks();
    driver = useTestDriver();
    expect(driver.results).toHaveLength(1);
    expect(driver.dispatchedCount).toBe(1);

    driver.reset();
    driver = useTestDriver();
    expect(driver.headerState).toBe("unset");
    expect(driver.results).toHaveLength(0);
    expect(driver.run).toBeNull();
    expect(driver.dispatchedCount).toBe(0);
    expect(driver.completedCount).toBe(0);
    expect(driver.inFlight).toBe(0);
    expect(driver.sessionError).toBeNull();

    // A genuinely NEW session, not a continuation: beginSession must actually
    // re-resolve (not short-circuit on the old idempotent header), and the
    // first submission after reset gets a fresh sourceIndex 0, never appended
    // onto Alice's old row.
    resolveChatRunHeaderActionMock.mockClear();
    await driver.beginSession({ assignmentInstructions: "Grade assignment two.", rubric: "2. Style" });
    expect(resolveChatRunHeaderActionMock).toHaveBeenCalledTimes(1);
    driver = useTestDriver();

    dispatchItemMock.mockResolvedValueOnce(gradedRow("Carol"));
    await driver.submit({ kind: "text", content: "fresh" });
    await flushMicrotasks();
    driver = useTestDriver();
    expect(driver.results).toHaveLength(1);
    expect(driver.results.map((r) => r.student)).toEqual(["Carol"]);
    expect(driver.dispatchedCount).toBe(1);
  });
});

describe("useContinuousGradingRun - BLOCKER-1: pointsPossible threading", () => {
  it("a Canvas-URL submission's dispatched body carries the Canvas pointsPossible, not null", async () => {
    let driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver();

    prepareChatSubmissionActionMock.mockResolvedValue({
      kind: "entries",
      entries: [{ student: "Ada", content: "post", mergedFileCount: 1, submittedFiles: [] }],
      pointsPossible: 100,
    });
    dispatchItemMock.mockReturnValue(new Promise(() => {}));

    await driver.submit({ kind: "url", url: "https://canvas.example.edu/courses/1/assignments/2" });
    expect(dispatchItemMock).toHaveBeenCalledTimes(1);
    const dispatchedBody = dispatchItemMock.mock.calls[0][0];
    expect(dispatchedBody.pointsPossible).toBe(100);
  });

  it("a text submission's dispatched body carries pointsPossible: null", async () => {
    let driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver();

    dispatchItemMock.mockReturnValue(new Promise(() => {}));
    await driver.submit({ kind: "text", content: "hello" });
    const dispatchedBody = dispatchItemMock.mock.calls[0][0];
    expect(dispatchedBody.pointsPossible).toBeNull();
  });
});
