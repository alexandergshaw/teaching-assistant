// GRADING-DIAGNOSTICS WC (AC-24): a throwing detail builder never changes a grade.
// Same no-render harness as useContinuousGradingRun.lifecycle.test.ts (copied, not imported).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { resetSessionDiagnosticLogForTests } from "@/lib/session-diagnostic-log";

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

function useTestDriver() {
  h0.begin();
  return useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, maxEntries: 40 });
}

beforeEach(() => {
  resetSessionDiagnosticLogForTests("2026-10-08T10:00:00.000Z");
  h0.reset();
  resolveChatRunHeaderActionMock.mockReset();
  prepareChatSubmissionActionMock.mockReset();
  prepareCompositeSubmissionActionMock.mockReset();
  dispatchItemMock.mockReset();
  resolveChatRunHeaderActionMock.mockResolvedValue(readyHeader);
});


vi.mock("./chatGradeDetail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./chatGradeDetail")>();
  return {
    ...actual,
    buildGradeItemDetail: () => {
      throw new Error("detail builder exploded");
    },
  };
});

describe("useContinuousGradingRun - diagnostics cannot change a grade (AC-24)", () => {
  it("a throwing detail builder leaves the graded row graded, counts it, and lets no rejection escape", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      let driver = useTestDriver();
      await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
      driver = useTestDriver();
      dispatchItemMock.mockResolvedValueOnce(gradedRow("Alice"));
      await driver.submit({ kind: "text", content: "one" });
      await flushMicrotasks();
      await flushMicrotasks();
      driver = useTestDriver();
      expect(driver.completedCount).toBe(1);
      expect(driver.results).toHaveLength(1);
      expect(driver.results[0].ungraded).toBeUndefined();
      expect(driver.results[0].student).toBe("Alice");
      expect(driver.inFlight).toBe(0);
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });

  it("a throwing detail builder on a rejected dispatch still records the failed row and frees the slot", async () => {
    let driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver();
    dispatchItemMock.mockRejectedValueOnce(new Error("x"));
    await driver.submit({ kind: "text", content: "one" });
    await flushMicrotasks();
    driver = useTestDriver();
    expect(driver.completedCount).toBe(1);
    expect(driver.results[0].ungraded).toBeDefined();
    expect(driver.inFlight).toBe(0);
  });
});
