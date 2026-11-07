import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => {
  const slots: Array<{ value: unknown }> = [];
  let cursor = 0;
  return {
    reset: () => { slots.length = 0; cursor = 0; },
    begin: () => { cursor = 0; },
    useState: (initial: unknown) => {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === "function" ? (initial as () => unknown)() : initial };
      const slot = slots[index];
      return [slot.value, (next: unknown) => { slot.value = typeof next === "function" ? (next as (value: unknown) => unknown)(slot.value) : next; }];
    },
    useRef: (initial: unknown) => {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: { current: initial } };
      return slots[index].value;
    },
  };
});

vi.mock("react", () => ({ useState: hooks.useState, useRef: hooks.useRef }));
const resolveHeader = vi.fn();
const prepareSubmission = vi.fn();
const prepareComposite = vi.fn();
vi.mock("@/app/actions/grading-chat-intake", () => ({
  resolveChatRunHeaderAction: (...args: unknown[]) => resolveHeader(...args),
  prepareChatSubmissionAction: (...args: unknown[]) => prepareSubmission(...args),
  prepareCompositeSubmissionAction: (...args: unknown[]) => prepareComposite(...args),
}));

import { useContinuousGradingRun } from "./useContinuousGradingRun";
import type { GradeResult } from "@/lib/grade/types";

const dispatch = vi.fn();
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const header = { kind: "ok" as const, effectiveRubric: "Correctness", generatedRubric: undefined, criteriaNames: [], rubricUsed: "", rubricFingerprint: "" };
const row = (student: string): GradeResult => ({ student, overallComment: "", strengths: "", improvements: "", resubmitNotice: "", rubricAreas: [], totalScore: "", feedback: "", mergedFileCount: 1, submittedFiles: [] });
const entry = (student: string) => ({ kind: "entries" as const, entries: [{ student, content: "work", mergedFileCount: 1, submittedFiles: [] }], pointsPossible: null });
function driver() { hooks.begin(); return useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatch }); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  hooks.reset();
  resolveHeader.mockReset().mockResolvedValue(header);
  prepareSubmission.mockReset();
  prepareComposite.mockReset();
  dispatch.mockReset();
});

describe("grading chat session reset races", () => {
  it.each(["resolve", "reject"] as const)("ignores an old grade that settles after reset (%s)", async (settlement) => {
    const oldGrade = deferred<GradeResult>();
    const newGrade = deferred<GradeResult>();
    dispatch.mockReturnValueOnce(oldGrade.promise).mockReturnValueOnce(newGrade.promise);
    let current = driver();
    await current.beginSession({ assignmentInstructions: "Old assignment", rubric: "" });
    current = driver();
    await current.submit({ kind: "text", label: "Old student", content: "Old work" });
    current.reset();
    current = driver();
    await current.beginSession({ assignmentInstructions: "New assignment", rubric: "" });
    current = driver();
    await current.submit({ kind: "text", label: "New student", content: "New work" });

    if (settlement === "resolve") oldGrade.resolve(row("Old student"));
    else oldGrade.reject(new Error("Old grade failed"));
    await flush();
    current = driver();
    expect(current.results).toHaveLength(0);
    expect(current.inFlight).toBe(1);
    expect(current.completedCount).toBe(0);

    newGrade.resolve(row("New student"));
    await flush();
    current = driver();
    expect(current.results.map((result) => result.student)).toEqual(["New student"]);
    expect(current.inFlight).toBe(0);
    expect(current.completedCount).toBe(1);
  });

  it.each(["resolve", "reject"] as const)("refuses old URL intake that settles after reset (%s)", async (settlement) => {
    const oldIntake = deferred<ReturnType<typeof entry>>();
    prepareSubmission.mockReturnValueOnce(oldIntake.promise);
    dispatch.mockResolvedValue(row("Unexpected student"));
    let current = driver();
    await current.beginSession({ assignmentInstructions: "Old assignment", rubric: "" });
    current = driver();
    const pending = current.submit({ kind: "url", url: "https://canvas.example.edu/courses/1/assignments/2" });
    current.reset();
    current = driver();
    await current.beginSession({ assignmentInstructions: "New assignment", rubric: "" });
    if (settlement === "resolve") oldIntake.resolve(entry("Old student"));
    else oldIntake.reject(new Error("Old intake failed"));
    expect(await pending).toMatchObject({ kind: "refused", reason: expect.stringContaining("session was reset") });
    current = driver();
    expect(current.canvasUrl).toBe("");
    expect(current.dispatchedCount).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
