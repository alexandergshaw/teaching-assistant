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
function Driver() { hooks.begin(); return useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatch, enableSetupCorrections: true }); }
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
  it("retains the render's rubric for an adapter after a same-session correction", async () => {
    dispatch.mockResolvedValue(row("Student"));
    resolveHeader.mockResolvedValueOnce({ ...header, rubricFingerprint: "before" });
    let current = Driver();
    await current.beginSession({ assignmentInstructions: "Assignment", rubric: "" });
    current = Driver();
    await current.submit({ kind: "text", label: "Student", content: "Work" });
    await flush();
    current = Driver();
    const adapter = current.repositoryAdapter;
    const key = current.repositoryStudents[0].key;
    expect(adapter.capture(key)?.rubricFingerprint).toBe("before");
    resolveHeader.mockResolvedValueOnce({ ...header, effectiveRubric: "Updated", rubricFingerprint: "after" });
    await current.correctSetup({ assignmentInstructions: "Updated assignment", rubric: "Updated" });
    current = Driver();
    expect(current.effectiveRubric).toBe("Updated");
    expect(adapter.capture(key)?.rubricFingerprint).toBe("before");
    expect(current.repositoryAdapter.capture(key)?.rubricFingerprint).toBe("after");
  });

  it("publishes the current session and fences adapters retained across reset", async () => {
    dispatch.mockResolvedValue(row("Student"));
    let current = Driver();
    const oldAdapter = current.repositoryAdapter;
    const initialSession = current.sessionId;
    await current.beginSession({ assignmentInstructions: "Assignment", rubric: "" });
    current = Driver();
    expect(current.effectiveRubric).toBe("Correctness");
    await current.submit({ kind: "text", label: "Student", content: "Work" });
    await flush();
    current = Driver();
    const oldKey = current.repositoryStudents[0].key;
    const oldSnapshot = current.repositoryAdapter.capture(oldKey);
    expect(oldSnapshot).not.toBeNull();
    const lastAdapter = current.repositoryAdapter;
    current.reset();
    current = Driver();
    expect(current.sessionId).not.toBe(initialSession);
    expect(current.runKey).toBe(`grading-chat-${current.sessionId}`);
    expect(current.effectiveRubric).toBe("");
    expect(current.canvasUrl).toBe("");
    expect(lastAdapter.capture(oldKey)).toBeNull();
    const newKey = { sessionEpoch: current.runKey, sourceIndex: oldKey.sourceIndex };
    expect(oldAdapter.capture(newKey)).toBeNull();
    expect(lastAdapter.capture(newKey)).toBeNull();
    expect(lastAdapter.adopt(oldSnapshot!, row("Student"), oldSnapshot!.body.entry)).toBe(false);
    await current.beginSession({ assignmentInstructions: "New assignment", rubric: "" });
    current = Driver();
    await current.submit({ kind: "text", label: "Student", content: "New work" });
    await flush();
    current = Driver();
    const populatedKey = current.repositoryStudents[0].key;
    const newSnapshot = current.repositoryAdapter.capture(populatedKey);
    expect(newSnapshot).not.toBeNull();
    expect(oldAdapter.capture(populatedKey)).toBeNull();
    expect(lastAdapter.capture(populatedKey)).toBeNull();
    expect(lastAdapter.adopt(newSnapshot!, row("Student"), newSnapshot!.body.entry)).toBe(false);
  });

  it.each(["resolve", "reject"] as const)("ignores an old grade that settles after reset (%s)", async (settlement) => {
    const oldGrade = deferred<GradeResult>();
    const newGrade = deferred<GradeResult>();
    dispatch.mockReturnValueOnce(oldGrade.promise).mockReturnValueOnce(newGrade.promise);
    let current = Driver();
    await current.beginSession({ assignmentInstructions: "Old assignment", rubric: "" });
    current = Driver();
    await current.submit({ kind: "text", label: "Old student", content: "Old work" });
    current.reset();
    current = Driver();
    await current.beginSession({ assignmentInstructions: "New assignment", rubric: "" });
    current = Driver();
    await current.submit({ kind: "text", label: "New student", content: "New work" });

    if (settlement === "resolve") oldGrade.resolve(row("Old student"));
    else oldGrade.reject(new Error("Old grade failed"));
    await flush();
    current = Driver();
    expect(current.results).toHaveLength(0);
    expect(current.inFlight).toBe(1);
    expect(current.completedCount).toBe(0);

    newGrade.resolve(row("New student"));
    await flush();
    current = Driver();
    expect(current.results.map((result) => result.student)).toEqual(["New student"]);
    expect(current.inFlight).toBe(0);
    expect(current.completedCount).toBe(1);
  });

  it.each(["resolve", "reject"] as const)("refuses old URL intake that settles after reset (%s)", async (settlement) => {
    const oldIntake = deferred<ReturnType<typeof entry>>();
    prepareSubmission.mockReturnValueOnce(oldIntake.promise);
    dispatch.mockResolvedValue(row("Unexpected student"));
    let current = Driver();
    await current.beginSession({ assignmentInstructions: "Old assignment", rubric: "" });
    current = Driver();
    const pending = current.submit({ kind: "url", url: "https://canvas.example.edu/courses/1/assignments/2" });
    current.reset();
    current = Driver();
    await current.beginSession({ assignmentInstructions: "New assignment", rubric: "" });
    if (settlement === "resolve") oldIntake.resolve(entry("Old student"));
    else oldIntake.reject(new Error("Old intake failed"));
    expect(await pending).toMatchObject({ kind: "refused", reason: expect.stringContaining("session was reset") });
    current = Driver();
    expect(current.canvasUrl).toBe("");
    expect(current.dispatchedCount).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
