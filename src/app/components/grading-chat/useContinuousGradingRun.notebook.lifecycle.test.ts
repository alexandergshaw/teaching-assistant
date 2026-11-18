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
const prepareCompositeSubmissionActionMock = vi.fn();
vi.mock("@/app/actions/grading-chat-intake", () => ({
  prepareCompositeSubmissionAction: (...args: unknown[]) => prepareCompositeSubmissionActionMock(...args),
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

beforeEach(() => {
  h0.reset();
  resolveChatRunHeaderActionMock.mockReset();
  prepareChatSubmissionActionMock.mockReset();
  prepareCompositeSubmissionActionMock.mockReset();
  dispatchItemMock.mockReset();
  resolveChatRunHeaderActionMock.mockResolvedValue(readyHeader);
});

describe("notebook recovery", () => {
  it("keeps the bound source index while counting one restored row", async () => {
    const prepareNotebook = vi.fn(async (request: import("@/app/components/grading/incrementalRunPlan").GradeRunItemRequestBody) => request);
    h0.begin(); let driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, prepareNotebook });
    dispatchItemMock.mockImplementation(async request => gradedRow(request.entry.student));
    const body = { sourceIndex: 47, entry: { student: "Recovered", content: "https://github.com/a/b", submissionUrl: "https://github.com/a/b", mergedFileCount: 0, submittedFiles: [] }, assignmentInstructions: "Grade it.", rubric: "1. Correctness", provider: "gemini" as const, pointsPossible: null };
    expect(await driver.recoverNotebook(body, () => true)).toBe(true);
    await flushMicrotasks();
    h0.begin(); driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, prepareNotebook });
    expect(driver.dispatchedCount).toBe(1);
    expect(driver.results).toHaveLength(1);
    await driver.submit({ kind: "text", content: "new work", label: "New" });
    await flushMicrotasks();
    expect(dispatchItemMock.mock.calls.map(call => call[0].sourceIndex)).toEqual([47, 48]);
    driver.reset();
    h0.begin(); driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, prepareNotebook });
    expect(await driver.recoverNotebook({ ...body, sourceIndex: 48 }, () => true)).toBe(true);
    await flushMicrotasks();
    h0.begin(); driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, prepareNotebook });
    expect(driver.dispatchedCount).toBe(1);
    await driver.submit({ kind: "text", content: "another", label: "Next" }); await flushMicrotasks();
    expect(dispatchItemMock.mock.calls.map(call => call[0].sourceIndex)).toEqual([47, 48, 48, 49]);
  });
});

describe("notebook preparation fences", () => {
  it("does not dispatch a prepared result after reset", async () => {
    let finish!: (body: import("@/app/components/grading/incrementalRunPlan").GradeRunItemRequestBody) => void;
    const prepareNotebook = vi.fn((body: import("@/app/components/grading/incrementalRunPlan").GradeRunItemRequestBody) => new Promise<typeof body>(resolve => { finish = resolve; }));
    h0.begin(); let driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, prepareNotebook });
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "1. Correctness" });
    h0.begin(); driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, prepareNotebook });
    await driver.submit({ kind: "text", content: "https://github.com/a/b", label: "Student" });
    const body = prepareNotebook.mock.calls[0][0];
    driver.reset(); finish(body); await flushMicrotasks();
    expect(dispatchItemMock).not.toHaveBeenCalled();
  });
  it("retries notebook preparation before dispatching a held row", async () => {
    const prepareNotebook = vi.fn().mockRejectedValueOnce(new Error("unavailable")).mockImplementationOnce(async request => ({ ...request, notebookAttempt: "receipt" }));
    h0.begin(); let driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, prepareNotebook });
    dispatchItemMock.mockImplementation(async request => gradedRow(request.entry.student));
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "1. Correctness" });
    h0.begin(); driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, prepareNotebook });
    await driver.submit({ kind: "text", content: "https://github.com/a/b", label: "Student" });
    await flushMicrotasks();
    expect(dispatchItemMock).not.toHaveBeenCalled();
    h0.begin(); driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, prepareNotebook });
    driver.retry(0); await flushMicrotasks();
    expect(prepareNotebook).toHaveBeenCalledTimes(2);
    expect(dispatchItemMock).toHaveBeenCalledOnce();
    expect(dispatchItemMock.mock.calls[0][0].notebookAttempt).toBe("receipt");
  });
});

it("prepares again before a notebook regrade", async () => {
  const prepareNotebook = vi.fn(async (request: import("@/app/components/grading/incrementalRunPlan").GradeRunItemRequestBody) => ({ ...request, notebookAttempt: "receipt" }));
  h0.begin(); let driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, prepareNotebook });
  dispatchItemMock.mockImplementation(async request => gradedRow(request.entry.student));
  await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "1. Correctness" });
  h0.begin(); driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, prepareNotebook });
  await driver.submit({ kind: "text", content: "https://github.com/a/b", label: "Student" }); await flushMicrotasks();
  h0.begin(); driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, prepareNotebook });
  driver.regrade("Student"); await flushMicrotasks();
  expect(prepareNotebook).toHaveBeenCalledTimes(2);
  expect(dispatchItemMock).toHaveBeenCalledTimes(2);
});

it("a stale recovery does not reset a competing setup that won", async () => {
  let finish!: (header: typeof readyHeader) => void;
  resolveChatRunHeaderActionMock.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(readyHeader);
  const prepareNotebook = vi.fn(async (request: import("@/app/components/grading/incrementalRunPlan").GradeRunItemRequestBody) => request);
  h0.begin(); const driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, prepareNotebook });
  const body = { sourceIndex: 0, entry: { student: "Recovered", content: "https://github.com/a/b", submissionUrl: "https://github.com/a/b", mergedFileCount: 0, submittedFiles: [] }, assignmentInstructions: "Old", rubric: "1. Correctness", provider: "gemini" as const, pointsPossible: null };
  const recovering = driver.recoverNotebook(body, () => true);
  expect((await driver.beginSession({ assignmentInstructions: "New", rubric: "1. Correctness" })).kind).toBe("ready");
  finish(readyHeader);
  expect(await recovering).toBe(false);
  h0.begin(); const latest = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, prepareNotebook });
  expect(latest.headerState).toBe("ready");
  expect(latest.dispatchedCount).toBe(0);
});

it("does not admit recovered work if the setup commit loses ownership", async () => {
  const prepareNotebook = vi.fn(async (request: import("@/app/components/grading/incrementalRunPlan").GradeRunItemRequestBody) => request);
  h0.begin(); const driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, prepareNotebook });
  const body = { sourceIndex: 0, entry: { student: "Recovered", content: "https://github.com/a/b", submissionUrl: "https://github.com/a/b", mergedFileCount: 0, submittedFiles: [] }, assignmentInstructions: "Instructions", rubric: "1. Correctness", provider: "gemini" as const, pointsPossible: null };
  expect(await driver.recoverNotebook(body, () => true, () => false)).toBe(false);
  await flushMicrotasks();
  expect(prepareNotebook).not.toHaveBeenCalled();
  expect(dispatchItemMock).not.toHaveBeenCalled();
  h0.begin(); const latest = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, prepareNotebook });
  expect(latest.headerState).toBe("unset");
  expect(latest.dispatchedCount).toBe(0);
});
