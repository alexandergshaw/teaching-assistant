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

// ---------------------------------------------------------------------------
// Grader Wave W1 (docs/grader-w1-test-notes.md): six oracles, every expected
// value a frozen literal (nothing imported to build an expectation).
// ---------------------------------------------------------------------------

const CANVAS_URL = "https://canvas.example.edu/courses/1/assignments/2";
const OTHER_CANVAS_URL = "https://canvas.example.edu/courses/1/assignments/9";
const GITHUB_URL = "https://github.com/acme/repo";

const okHeader = {
  kind: "ok" as const,
  effectiveRubric: "1. Correctness",
  generatedRubric: undefined,
  criteriaNames: [],
  rubricUsed: "1. Correctness",
  rubricFingerprint: "fp-123",
};

const genHeader = {
  kind: "ok" as const,
  effectiveRubric: "GENERATED RUBRIC",
  generatedRubric: "GENERATED RUBRIC",
  criteriaNames: [],
  rubricUsed: "GENERATED RUBRIC",
  rubricFingerprint: "fp-gen",
};

function oneEntry(student: string) {
  return {
    kind: "entries" as const,
    entries: [{ student, content: "x", mergedFileCount: 1, submittedFiles: [] }],
    pointsPossible: 100,
  };
}

describe("W1 oracle 1 - G1/FF-L: the driver pins the Canvas URL", () => {
  it("a Canvas URL submission is retained as driver.canvasUrl; starts empty", async () => {
    let driver = useTestDriver();
    expect(driver.canvasUrl).toBe("");
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver();
    prepareChatSubmissionActionMock.mockResolvedValue(oneEntry("Ada"));
    dispatchItemMock.mockReturnValue(new Promise(() => {}));
    await driver.submit({ kind: "url", url: CANVAS_URL });
    driver = useTestDriver();
    expect(driver.canvasUrl).toBe("https://canvas.example.edu/courses/1/assignments/2");
  });

  it("a GitHub URL submission never becomes canvasUrl", async () => {
    let driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver();
    prepareChatSubmissionActionMock.mockResolvedValue(oneEntry("Ada"));
    dispatchItemMock.mockReturnValue(new Promise(() => {}));
    await driver.submit({ kind: "url", url: GITHUB_URL });
    driver = useTestDriver();
    expect(driver.canvasUrl).toBe("");
  });

  it("a second, different Canvas URL is refused and does not change canvasUrl (F3=A)", async () => {
    let driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver();
    prepareChatSubmissionActionMock.mockResolvedValue(oneEntry("Ada"));
    dispatchItemMock.mockReturnValue(new Promise(() => {}));
    await driver.submit({ kind: "url", url: CANVAS_URL });
    driver = useTestDriver();
    const second = await driver.submit({ kind: "url", url: OTHER_CANVAS_URL });
    expect(second.kind).toBe("refused");
    driver = useTestDriver();
    expect(driver.canvasUrl).toBe("https://canvas.example.edu/courses/1/assignments/2");
    expect(dispatchItemMock).toHaveBeenCalledTimes(1);
  });
});

describe("W1 oracle 2 - G2/FF-2: cross-event duplicate names are disambiguated", () => {
  it("two separate events yielding the same name dispatch 'Assignment 1' then 'Assignment 1 (2)'", async () => {
    let driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver();
    prepareChatSubmissionActionMock.mockResolvedValue(oneEntry("Assignment 1"));
    dispatchItemMock.mockReturnValue(new Promise(() => {}));
    await driver.submit({ kind: "url", url: GITHUB_URL });
    driver = useTestDriver();
    await driver.submit({ kind: "url", url: GITHUB_URL });
    expect(dispatchItemMock).toHaveBeenCalledTimes(2);
    expect(dispatchItemMock.mock.calls[0][0].entry.student).toBe("Assignment 1");
    expect(dispatchItemMock.mock.calls[1][0].entry.student).toBe("Assignment 1 (2)");
    expect(dispatchItemMock.mock.calls[0][0].sourceIndex).toBe(0);
    expect(dispatchItemMock.mock.calls[1][0].sourceIndex).toBe(1);
  });
});

describe("W1 oracle 3 - G3/FF-3: a new session has a different discriminator", () => {
  it("sessionId and runKey are non-empty and differ across reset()", async () => {
    let driver = useTestDriver();
    const before = driver.runKey;
    const sessionBefore = driver.sessionId;
    expect(before).not.toBe("");
    driver.reset();
    driver = useTestDriver();
    expect(driver.runKey).not.toBe("");
    expect(driver.runKey).not.toBe(before);
    expect(driver.sessionId).not.toBe(sessionBefore);
  });
});

describe("W1 oracle 4 - G4/FF-4: runKey is stable within a session", () => {
  it("runKey is identical after two arrivals and changes after reset()", async () => {
    let driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver();
    dispatchItemMock.mockResolvedValueOnce(gradedRow("Alice"));
    await driver.submit({ kind: "text", content: "one" });
    await flushMicrotasks();
    driver = useTestDriver();
    expect(driver.runKey).toBe("grading-chat-0");

    dispatchItemMock.mockResolvedValueOnce(gradedRow("Bob"));
    await driver.submit({ kind: "text", content: "two" });
    await flushMicrotasks();
    driver = useTestDriver();
    expect(driver.results).toHaveLength(2);
    expect(driver.runKey).toBe("grading-chat-0");

    driver.reset();
    driver = useTestDriver();
    expect(driver.runKey).toBe("grading-chat-1");
  });
});

describe("W1 oracle 5 - G6/FF-7: a failed row is retried in place", () => {
  it("retry re-dispatches the original body at the same sourceIndex, adds no row, and is a no-op on a graded row", async () => {
    resolveChatRunHeaderActionMock.mockResolvedValue(okHeader);
    let driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver();
    prepareChatSubmissionActionMock.mockResolvedValue(oneEntry("Ada"));
    dispatchItemMock.mockRejectedValueOnce(new Error("boom"));
    await driver.submit({ kind: "url", url: CANVAS_URL });
    await flushMicrotasks();
    driver = useTestDriver();
    expect(driver.results).toHaveLength(1);
    expect(driver.results[0].ungraded?.kind).toBe("grading-failed");

    dispatchItemMock.mockResolvedValueOnce(gradedRow("Ada"));
    driver.retry(0);
    await flushMicrotasks();
    driver = useTestDriver();
    expect(driver.results).toHaveLength(1);
    expect(driver.dispatchedCount).toBe(1);
    expect(driver.results[0].ungraded).toBeUndefined();
    // W1-R2: a retried row replaces its failed arrival, never double-counts.
    expect(driver.completedCount).toBe(1);

    expect(dispatchItemMock).toHaveBeenCalledTimes(2);
    const retryBody = dispatchItemMock.mock.calls[1][0];
    expect(retryBody.sourceIndex).toBe(0);
    expect(retryBody.rubric).toBe("1. Correctness");
    expect(retryBody.pointsPossible).toBe(100);
    expect(retryBody.entry.student).toBe("Ada");

    driver.retry(0);
    await flushMicrotasks();
    expect(dispatchItemMock).toHaveBeenCalledTimes(2);
  });
});

describe("W1 oracle 6 - G7/FF-9: the driver exposes the effective rubric and provenance", () => {
  it("exposes effectiveRubric and rubricFingerprint at the top level, consistent with the stamped run", async () => {
    resolveChatRunHeaderActionMock.mockResolvedValue(okHeader);
    let driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "1. Correctness" });
    driver = useTestDriver();
    expect(driver.effectiveRubric).toBe("1. Correctness");
    expect(driver.rubricFingerprint).toBe("fp-123");

    dispatchItemMock.mockResolvedValueOnce(gradedRow("Alice"));
    await driver.submit({ kind: "text", content: "one" });
    await flushMicrotasks();
    driver = useTestDriver();
    expect(dispatchItemMock.mock.calls[0][0].rubric).toBe("1. Correctness");
    expect(driver.run?.rubricFingerprint).toBe("fp-123");
    expect(driver.rubricFingerprint).toBe("fp-123");
  });

  it("FF-1: a blank rubric box with a generated rubric exposes the generated text, not empty", async () => {
    resolveChatRunHeaderActionMock.mockResolvedValue(genHeader);
    let driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver();
    expect(driver.effectiveRubric).toBe("GENERATED RUBRIC");
    expect(driver.generatedRubric).toBe("GENERATED RUBRIC");
    expect(driver.rubricFingerprint).toBe("fp-gen");
  });
});

describe("W1 B1 - reset() clears every per-session ref (F3=A is per session)", () => {
  it("a new session inherits no Canvas URL, no claimed labels, and no retry bodies", async () => {
    resolveChatRunHeaderActionMock.mockResolvedValue(okHeader);
    let driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver();
    prepareChatSubmissionActionMock.mockResolvedValue(oneEntry("Assignment 1"));
    dispatchItemMock.mockRejectedValueOnce(new Error("boom"));
    await driver.submit({ kind: "url", url: CANVAS_URL });
    await flushMicrotasks();
    driver = useTestDriver();
    expect(driver.canvasUrl).toBe("https://canvas.example.edu/courses/1/assignments/2");
    expect(driver.results[0].ungraded?.kind).toBe("grading-failed");

    driver.reset();
    driver = useTestDriver();
    // (a) the pinned Canvas URL is gone.
    expect(driver.canvasUrl).toBe("");

    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver();
    // (b) a different Canvas URL is accepted in the new session, and the
    // first new-session "Assignment 1" is NOT suffixed.
    dispatchItemMock.mockReset();
    dispatchItemMock.mockReturnValue(new Promise(() => {}));
    const outcome = await driver.submit({ kind: "url", url: OTHER_CANVAS_URL });
    expect(outcome.kind).toBe("accepted");
    expect(dispatchItemMock).toHaveBeenCalledTimes(1);
    expect(dispatchItemMock.mock.calls[0][0].entry.student).toBe("Assignment 1");
    driver = useTestDriver();
    expect(driver.canvasUrl).toBe("https://canvas.example.edu/courses/1/assignments/9");

    // (c) a retry aimed at the prior session's sourceIndex 0 must not
    // re-dispatch: the new session has no arrived row there yet, and the
    // old retained body is gone.
    dispatchItemMock.mockClear();
    driver.retry(0);
    await flushMicrotasks();
    expect(dispatchItemMock).toHaveBeenCalledTimes(0);
    driver.retry(5);
    expect(dispatchItemMock).toHaveBeenCalledTimes(0);
  });
});

describe("useContinuousGradingRun - W2 O3-A: commentSplit reaches the dispatched body", () => {
  it("a driver constructed with commentSplit: true dispatches commentSplit === true", async () => {
    h0.begin();
    let driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, commentSplit: true });
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    h0.begin();
    driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, commentSplit: true });
    dispatchItemMock.mockReturnValue(new Promise(() => {}));
    await driver.submit({ kind: "text", content: "x" });
    expect(dispatchItemMock.mock.calls[0][0].commentSplit).toBe(true);
  });

  it("the default driver (no commentSplit) dispatches commentSplit === undefined (opt-in, no over-fire)", async () => {
    let driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver();
    dispatchItemMock.mockReturnValue(new Promise(() => {}));
    await driver.submit({ kind: "text", content: "x" });
    expect(dispatchItemMock.mock.calls[0][0].commentSplit).toBeUndefined();
  });
});
