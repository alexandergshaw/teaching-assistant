// GRADING-DIAGNOSTICS WC: per-attempt grade_item detail, the view model and the entry budget.
// Same no-render harness as useContinuousGradingRun.lifecycle.test.ts (copied, not imported).
import { readFileSync } from "node:fs";
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


type Sink = { httpStatus?: number; diagnostic?: unknown };

function gradedWith(student: string, over: Partial<GradeResult> = {}): GradeResult {
  return { ...gradedRow(student), strengths: "good", improvements: "", totalScore: "9/10", ...over } as GradeResult;
}

async function useStartedDriver() {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- no-render harness: one call is one render
  let driver = useTestDriver();
  await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
  // eslint-disable-next-line react-hooks/rules-of-hooks -- no-render harness: one call is one render
  driver = useTestDriver();
  return driver;
}

function items() {
  return grading().filter((e) => e.operation === "grade_item");
}

describe("useContinuousGradingRun - per-attempt grade_item detail", () => {
  it("AC-10: first, failed, retry and regrade each record one entry with the right attempt and trigger", async () => {
    let driver = await useStartedDriver();
    dispatchItemMock.mockResolvedValueOnce(gradedWith("A"));
    await driver.submit({ kind: "text", content: "one" });
    await flushMicrotasks();
    dispatchItemMock.mockRejectedValueOnce(new Error("boom"));
    driver = useTestDriver();
    await driver.submit({ kind: "text", content: "two" });
    await flushMicrotasks();
    dispatchItemMock.mockResolvedValueOnce(gradedWith("B"));
    driver = useTestDriver();
    driver.retry(1);
    await flushMicrotasks();
    driver = useTestDriver();
    dispatchItemMock.mockResolvedValueOnce(gradedWith("A"));
    driver.regrade(driver.diagnostics[0].label);
    await flushMicrotasks();
    const details = items().map((e) => e.detail);
    expect(details.map((d) => [d?.item, d?.attempt, d?.trigger])).toEqual([
      [1, 1, "first"],
      [2, 1, "first"],
      [2, 2, "retry"],
      [1, 2, "regrade"],
    ]);
    expect(items()).toHaveLength(dispatchItemMock.mock.calls.length);
    for (const d of details) {
      expect(d?.waitMs as number).toBeGreaterThanOrEqual(0);
      expect(d?.inflight as number).toBeGreaterThanOrEqual(1);
      expect(d?.inflight as number).toBeLessThanOrEqual(3);
    }
    expect(details[1]?.failure).toBeDefined();
  });

  it("AC-11: result-derived signals map exactly", async () => {
    const driver = await useStartedDriver();
    dispatchItemMock.mockResolvedValueOnce(
      gradedWith("A", {
        strengths: "",
        improvements: "x",
        rubricAreas: [{ name: "a" }, { name: "b" }] as unknown as GradeResult["rubricAreas"],
        submissionTruncated: true,
        linkFetch: "failed",
        codeExecution: { ran: false, neededStdin: true } as unknown as GradeResult["codeExecution"],
      })
    );
    await driver.submit({ kind: "text", content: "one" });
    await flushMicrotasks();
    const d = items()[0].detail;
    expect(d).toMatchObject({ hasPraise: false, hasAdvice: true, areas: 2, truncated: true, link: "failed", code: "needs-input", scored: true });
  });

  it("AC-12: the server diagnostic filled into the sink is merged and netMs is derived", async () => {
    const driver = await useStartedDriver();
    dispatchItemMock.mockImplementationOnce(async (_req: unknown, sink?: Sink) => {
      if (sink) {
        sink.httpStatus = 200;
        sink.diagnostic = { serverMs: 1500, gradeMs: 1200, modelMs: 1000, model: "gemini-test", promptTokens: 120, outputTokens: 30, finishReason: "STOP", extra: "Ada Lovelace" };
      }
      return gradedWith("A");
    });
    await driver.submit({ kind: "text", content: "one" });
    await flushMicrotasks();
    const d = items()[0].detail;
    expect(d).toMatchObject({ serverMs: 1500, gradeMs: 1200, modelMs: 1000, model: "gemini-test", promptTokens: 120, outputTokens: 30, finishReason: "stop", httpStatus: 200 });
    expect(typeof d?.netMs).toBe("number");
    expect(JSON.stringify(grading())).not.toContain("Ada");
  });

  it("the typed server failure class is stored in its dashed form on a rejection", async () => {
    const driver = await useStartedDriver();
    dispatchItemMock.mockImplementationOnce(async (_req: unknown, sink?: Sink) => {
      if (sink) {
        sink.httpStatus = 502;
        sink.diagnostic = { failure: "model quota", serverMs: 900 };
      }
      throw new Error("quota");
    });
    await driver.submit({ kind: "text", content: "one" });
    await flushMicrotasks();
    expect(items()[0].detail).toMatchObject({ failure: "model-quota", httpStatus: 502 });
    expect(items()[0].outcome).toBe("failure");
  });

  it("a rejection with no response is client-classified as transport lost", async () => {
    const driver = await useStartedDriver();
    dispatchItemMock.mockRejectedValueOnce(new Error("network"));
    await driver.submit({ kind: "text", content: "one" });
    await flushMicrotasks();
    expect(items()[0].detail?.failure).toBe("transport-lost");
  });

  it("AC-13: no canary reaches the log, and the copyable row label is Row N", async () => {
    let driver = await useStartedDriver();
    dispatchItemMock.mockImplementationOnce(async (_req: unknown, sink?: Sink) => {
      if (sink) sink.httpStatus = 504;
      throw new Error("... ZZ_CANARY_ERR ...");
    });
    await driver.submit({ kind: "text", content: "ZZ_CANARY_BODY", label: "ZZ_CANARY_STUDENT" });
    await flushMicrotasks();
    dispatchItemMock.mockResolvedValueOnce(
      gradedWith("ZZ_CANARY_STUDENT", {
        ungraded: { kind: "grading-failed", sourceIndex: 1, student: "ZZ_CANARY_STUDENT", message: "ZZ_CANARY_MSG" },
      } as Partial<GradeResult>)
    );
    driver = useTestDriver();
    await driver.submit({ kind: "text", content: "two" });
    await flushMicrotasks();
    const text = JSON.stringify(grading());
    for (const canary of ["ZZ_CANARY_ERR", "ZZ_CANARY_MSG", "ZZ_CANARY_STUDENT", "ZZ_CANARY_BODY"]) {
      expect(text).not.toContain(canary);
    }
    driver = useTestDriver();
    expect(driver.diagnostics.map((r) => r.rowLabel)).toEqual(["Row 1", "Row 2"]);
  });

  it("AC-10 parity: the view model rows carry the same detail as the exported entries, and reset clears them", async () => {
    let driver = await useStartedDriver();
    dispatchItemMock.mockResolvedValue(gradedWith("A"));
    await driver.submit({ kind: "text", content: "one" });
    await driver.submit({ kind: "text", content: "two" });
    await flushMicrotasks();
    driver = useTestDriver();
    expect(driver.diagnostics.map((r) => r.detail)).toEqual(items().map((e) => e.detail));
    expect(driver.diagnostics.map((r) => r.outcome)).toEqual(["graded", "graded"]);
    driver.reset();
    expect(useTestDriver().diagnostics).toEqual([]);
  });

  it("AC-22: a 40-row run records exactly 1 header entry plus 40 grade_item entries", async () => {
    let driver = await useStartedDriver();
    dispatchItemMock.mockResolvedValue(gradedWith("A"));
    for (let i = 0; i < 40; i += 1) {
      // eslint-disable-next-line react-hooks/rules-of-hooks -- no-render harness: one call is one render
      driver = useTestDriver();
      await driver.submit({ kind: "text", content: "row " + i });
    }
    await flushMicrotasks();
    await flushMicrotasks();
    expect(grading()).toHaveLength(41);
    expect(items()).toHaveLength(40);
  });

  it("P5: diagnostic code sits inside safeDiagnostic, after recordArrival, in the .then body", () => {
    const src = readFileSync("src/app/components/grading-chat/useContinuousGradingRun.ts", "utf-8");
    const body = src.slice(src.indexOf(".then((result) => {"), src.indexOf(".catch((err) => {"));
    expect(body.indexOf("recordArrival(")).toBeGreaterThan(-1);
    expect(body.indexOf("safeDiagnostic(")).toBeGreaterThan(body.indexOf("recordArrival("));
    const guardAt = body.indexOf("safeDiagnostic(");
    expect(body.slice(0, guardAt)).not.toContain("buildGradeItemDetail(");
    expect(body.slice(0, guardAt)).not.toContain("recordItem(");
  });
});
