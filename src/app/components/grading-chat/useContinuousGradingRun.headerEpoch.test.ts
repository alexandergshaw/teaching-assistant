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
  prepareCompositeSubmissionActionMock.mockReset();
  dispatchItemMock.mockReset();
  resolveChatRunHeaderActionMock.mockResolvedValue(readyHeader);
});

describe("beginSession epoch ownership across reset", () => {
  it("returns a readable refusal after a current setup exception and allows a fresh successful attempt", async () => {
    resolveChatRunHeaderActionMock.mockRejectedValueOnce(new Error("private provider failure"));
    let driver = useTestDriver();
    const result = await driver.beginSession({ assignmentInstructions: "Instructions", rubric: "Rubric" });
    expect(result).toEqual({ kind: "refused", reason: "Assignment setup could not be prepared. Try again." });
    driver = useTestDriver();
    expect(driver.headerState).toBe("refused"); expect(driver.sessionError).toBe(result.kind === "refused" ? result.reason : null);
    expect((await driver.submit({ kind: "text", content: "Not yet" })).kind).toBe("refused");
    expect(dispatchItemMock).not.toHaveBeenCalled();
    await driver.beginSession({ assignmentInstructions: "Retry instructions", rubric: "Retry rubric" }); driver = useTestDriver();
    expect(driver.headerState).toBe("ready"); expect(driver.sessionError).toBeNull();
    dispatchItemMock.mockResolvedValue(gradedRow("Student"));
    await driver.submit({ kind: "text", content: "Now ready", label: "Student" });
    expect(dispatchItemMock.mock.calls[0][0]).toMatchObject({ assignmentInstructions: "Retry instructions", rubric: readyHeader.effectiveRubric });
  });
  it("restores a canceled setup attempt without publishing its later exception", async () => {
    let reject!: (error: Error) => void, current = true;
    resolveChatRunHeaderActionMock.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    let driver = useTestDriver(); const pending = driver.beginSession({ assignmentInstructions: "Canceled", rubric: "Rubric", isCurrent: () => current });
    driver = useTestDriver(); expect(driver.headerState).toBe("resolving"); current = false;
    reject(new Error("canceled private failure")); expect((await pending).kind).toBe("refused");
    driver = useTestDriver(); expect(driver.headerState).toBe("unset"); expect(driver.sessionError).toBeNull();
  });
  it("keeps a newer attempt in the same session when the older attempt rejects", async () => {
    let rejectOld!: (error: Error) => void;
    resolveChatRunHeaderActionMock.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectOld = reject; }));
    let driver = useTestDriver(); const old = driver.beginSession({ assignmentInstructions: "Old", rubric: "Old" });
    driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "New", rubric: "New" });
    rejectOld(new Error("Old private failure")); expect((await old).kind).toBe("refused");
    driver = useTestDriver(); expect(driver.headerState).toBe("ready"); expect(driver.sessionError).toBeNull();
    dispatchItemMock.mockResolvedValue(gradedRow("Student")); await driver.submit({ kind: "text", content: "Work" });
    expect(dispatchItemMock.mock.calls[0][0]).toMatchObject({ assignmentInstructions: "New" });
  });
  it.each(["success", "refusal", "throw"].flatMap((old) => ["ready", "resolving", "refused"].map((newer) => ({ old, newer }))))("keeps NEW $newer state when OLD resolves as $old", async ({ old, newer }) => {
    let resolveOld!: (value: typeof readyHeader | { kind: "refused"; error: string }) => void, rejectOld!: (error: Error) => void;
    let resolveNew!: (value: typeof readyHeader | { kind: "refused"; error: string }) => void;
    const oldPromise = new Promise<typeof readyHeader | { kind: "refused"; error: string }>((resolve, reject) => { resolveOld = resolve; rejectOld = reject; });
    const newPromise = new Promise<typeof readyHeader | { kind: "refused"; error: string }>((resolve) => { resolveNew = resolve; });
    resolveChatRunHeaderActionMock.mockReturnValueOnce(oldPromise).mockReturnValueOnce(newPromise);
    let driver = useTestDriver(); const pendingOld = driver.beginSession({ assignmentInstructions: "OLD_INSTRUCTIONS", rubric: "OLD_RUBRIC", harshness: "lenient", feedbackWordTarget: 40, applyNamingDeduction: true, applyLengthDeduction: false });
    driver.reset(); driver = useTestDriver();
    const pendingNew = driver.beginSession({ assignmentInstructions: "NEW_INSTRUCTIONS", rubric: "NEW_RUBRIC", harshness: "strict", feedbackWordTarget: 120, applyNamingDeduction: false, applyLengthDeduction: true });
    if (newer !== "resolving") { resolveNew(newer === "ready" ? { ...readyHeader, effectiveRubric: "NEW_EFFECTIVE_RUBRIC", rubricFingerprint: "new-fingerprint" } : { kind: "refused", error: "NEW_REFUSAL" }); await pendingNew; }
    if (old === "throw") rejectOld(new Error("OLD_THROW"));
    else resolveOld(old === "success" ? { ...readyHeader, effectiveRubric: "OLD_EFFECTIVE_RUBRIC" } : { kind: "refused", error: "OLD_REFUSAL" });
    expect((await pendingOld).kind).toBe("refused"); driver = useTestDriver();
    expect(driver.headerState).toBe(newer); expect(driver.sessionError).toBe(newer === "refused" ? "NEW_REFUSAL" : null);
    dispatchItemMock.mockResolvedValue(gradedRow("Student")); await driver.submit({ kind: "text", label: "Student", content: "student" });
    if (newer === "ready") expect(dispatchItemMock.mock.calls[0][0]).toMatchObject({ assignmentInstructions: "NEW_INSTRUCTIONS", rubric: "NEW_EFFECTIVE_RUBRIC", harshness: "strict", feedbackWordTarget: 120, applyNamingDeduction: false, applyLengthDeduction: true });
    else expect(dispatchItemMock).not.toHaveBeenCalled();
    if (newer === "resolving") { resolveNew({ kind: "refused", error: "NEW_REFUSAL" }); await pendingNew; }
  });
});
