// GRADING-DIAGNOSTICS-COVERAGE W2b: the chat seams record through the grading
// wrapper. Same no-render harness as useContinuousGradingRun.lifecycle.test.ts
// (copied, not imported: no-cross-test-file-imports).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { readSessionDiagnosticSurfaceEntries, resetSessionDiagnosticLogForTests } from "@/lib/session-diagnostic-log";

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

function grading() {
  return readSessionDiagnosticSurfaceEntries("grading").entries;
}

describe("useContinuousGradingRun - diagnostic seams", () => {
  it("resolve_header records success", async () => {
    const driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    const e = grading();
    expect(e).toHaveLength(1);
    expect(e[0].surface).toBe("grading");
    expect([e[0].operation, e[0].outcome]).toEqual(["resolve_header", "success"]);
    expect(typeof e[0].durationMs).toBe("number");
  });

  it("resolve_header records a refusal as a fixed class, never the raw text", async () => {
    resolveChatRunHeaderActionMock.mockResolvedValue({ kind: "refused", error: "Jane Smith did not provide anything" });
    const driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "", rubric: "" });
    const e = grading();
    expect(e[0].outcome).toBe("failure");
    expect(e[0].error).toBe("refused");
    expect(JSON.stringify(e)).not.toContain("Jane");
  });

  it("prepare_submission records a collision refusal as the fixed class", async () => {
    let driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver();
    prepareChatSubmissionActionMock.mockResolvedValue({
      kind: "refused",
      reason: 'Refused: 2 files resolve to the same student name "Jane Smith" in a/b.txt',
    });
    await driver.submit({ kind: "file", file: new File(["x"], "a.zip") });
    const entry = grading().find((e) => e.operation === "prepare_submission");
    expect(entry?.surface).toBe("grading");
    expect(entry?.outcome).toBe("failure");
    expect(entry?.error).toBe("name collision");
    expect(typeof entry?.durationMs).toBe("number");
    expect(JSON.stringify(grading())).not.toContain("Jane");
  });

  it("prepare_submission records an interrupted failure when the action throws", async () => {
    let driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver();
    prepareChatSubmissionActionMock.mockRejectedValue(new Error("network down for Alice"));
    await expect(driver.submit({ kind: "file", file: new File(["x"], "a.zip") })).rejects.toThrow();
    const entry = grading().find((e) => e.operation === "prepare_submission");
    expect(entry?.error).toBe("interrupted");
    expect(JSON.stringify(grading())).not.toContain("Alice");
  });

  it("grade_item records success, and a rejection as a fixed class", async () => {
    let driver = useTestDriver();
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = useTestDriver();
    dispatchItemMock.mockResolvedValueOnce(gradedRow("Alice"));
    await driver.submit({ kind: "text", content: "one" });
    await flushMicrotasks();
    dispatchItemMock.mockRejectedValueOnce(new Error("Alice request timed out"));
    driver = useTestDriver();
    await driver.submit({ kind: "text", content: "two" });
    await flushMicrotasks();
    const items = grading().filter((e) => e.operation === "grade_item");
    expect(items.map((e) => [e.outcome, e.error])).toEqual([
      ["success", ""],
      ["failure", "timed out"],
    ]);
    expect(items.every((e) => typeof e.durationMs === "number")).toBe(true);
    expect(JSON.stringify(grading())).not.toContain("Alice");
  });
});
