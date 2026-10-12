// LARGE-SINGLE-FILE W2 (driver half): storaged-file -> prepareSingleFile -> ONE
// text-only entry -> the grade dispatch, the counts-only prepare_submission
// diagnostic, and the reset ghost guard. Same no-render harness as
// useContinuousGradingRun.video.test.ts (copied, not imported).
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
import type { PrepareSingleFileFn } from "./singleFileClient";
import type { GradeResult, StudentSubmissionEntry } from "@/lib/grade/types";

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
const prepareSingleFileMock = vi.fn<PrepareSingleFileFn>();

function useTestDriver() {
  h0.begin();
  return useContinuousGradingRun({
    provider: "gemini",
    dispatchItem: dispatchItemMock,
    prepareSingleFile: prepareSingleFileMock,
    maxEntries: 40,
  });
}

const FILE_PATH = "u1/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.docx";

function textEntry(student = "Jordan Lee"): StudentSubmissionEntry {
  return {
    student,
    content: "File: essay.docx" + String.fromCharCode(10) + "The extracted text.",
    mergedFileCount: 1,
    submittedFiles: [],
  };
}

beforeEach(() => {
  resetSessionDiagnosticLogForTests("2026-10-08T10:00:00.000Z");
  h0.reset();
  resolveChatRunHeaderActionMock.mockReset();
  prepareChatSubmissionActionMock.mockReset();
  prepareCompositeSubmissionActionMock.mockReset();
  dispatchItemMock.mockReset();
  prepareSingleFileMock.mockReset();
  resolveChatRunHeaderActionMock.mockResolvedValue(readyHeader);
});

async function beginReady(first: ReturnType<typeof useTestDriver>): Promise<void> {
  await first.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
}

function prepDiag() {
  return readSessionDiagnosticSurfaceEntries("grading").entries.filter((e) => e.operation === "prepare_submission");
}

describe("useContinuousGradingRun - storaged-file (large single file)", () => {
  it("prepares the stored file and dispatches the text-only entry to the grade seam", async () => {
    prepareSingleFileMock.mockResolvedValue({ kind: "entry", entry: textEntry() });
    dispatchItemMock.mockResolvedValue(gradedRow("Jordan Lee"));
    await beginReady(useTestDriver());
    const driver = useTestDriver();
    const outcome = await driver.submit({ kind: "storaged-file", storagePath: FILE_PATH, name: "essay.docx" });
    expect(outcome).toEqual({ kind: "accepted", entryCount: 1 });
    expect(prepareSingleFileMock).toHaveBeenCalledWith(FILE_PATH, "essay.docx", "gemini", undefined);
    await flushMicrotasks();
    expect(dispatchItemMock).toHaveBeenCalledTimes(1);
    expect(dispatchItemMock.mock.calls[0][0].entry.content).toContain("The extracted text.");
  });

  it("applies a typed label to the single admitted entry", async () => {
    prepareSingleFileMock.mockResolvedValue({ kind: "entry", entry: textEntry("essay") });
    dispatchItemMock.mockResolvedValue(gradedRow("Sam Rivera"));
    await beginReady(useTestDriver());
    const driver = useTestDriver();
    await driver.submit({ kind: "storaged-file", storagePath: FILE_PATH, name: "essay.docx", label: " Sam Rivera " });
    await flushMicrotasks();
    expect(prepareSingleFileMock).toHaveBeenCalledWith(FILE_PATH, "essay.docx", "gemini", "Sam Rivera");
    expect(dispatchItemMock.mock.calls[0][0].entry.student).toBe("Sam Rivera");
  });

  it("records a counts-only prepare_submission success carrying no filename or path", async () => {
    prepareSingleFileMock.mockResolvedValue({ kind: "entry", entry: textEntry() });
    dispatchItemMock.mockResolvedValue(gradedRow("Jordan Lee"));
    await beginReady(useTestDriver());
    const driver = useTestDriver();
    await driver.submit({ kind: "storaged-file", storagePath: FILE_PATH, name: "essay.docx" });
    await flushMicrotasks();
    const entries = prepDiag();
    expect(entries.map((e) => e.outcome)).toEqual(["success"]);
    expect(JSON.stringify(entries)).not.toContain("essay.docx");
    expect(JSON.stringify(entries)).not.toContain("grading-uploads");
  });

  it("a refused prepare surfaces the worded reason, records a fixed class and dispatches nothing", async () => {
    prepareSingleFileMock.mockResolvedValue({ kind: "refused", reason: "This file could not be read for Jordan Lee." });
    await beginReady(useTestDriver());
    const driver = useTestDriver();
    const outcome = await driver.submit({ kind: "storaged-file", storagePath: FILE_PATH, name: "essay.docx" });
    expect(outcome).toEqual({ kind: "refused", reason: "This file could not be read for Jordan Lee." });
    expect(dispatchItemMock).not.toHaveBeenCalled();
    const entries = prepDiag();
    expect(entries.map((e) => [e.outcome, e.error])).toEqual([["failure", "unreadable"]]);
    expect(JSON.stringify(entries)).not.toContain("Jordan");
  });

  it("a throwing injected prepare becomes a refusal, not a crash", async () => {
    prepareSingleFileMock.mockRejectedValue(new Error("boom"));
    await beginReady(useTestDriver());
    const driver = useTestDriver();
    const outcome = await driver.submit({ kind: "storaged-file", storagePath: FILE_PATH, name: "essay.docx" });
    expect(outcome.kind).toBe("refused");
    expect(dispatchItemMock).not.toHaveBeenCalled();
  });

  it("a reset during prepare refuses and grades nothing (ghost guard)", async () => {
    let release: (v: Awaited<ReturnType<PrepareSingleFileFn>>) => void = () => undefined;
    prepareSingleFileMock.mockReturnValue(new Promise((resolve) => { release = resolve; }));
    await beginReady(useTestDriver());
    const driver = useTestDriver();
    const pending = driver.submit({ kind: "storaged-file", storagePath: FILE_PATH, name: "essay.docx" });
    driver.reset();
    release({ kind: "entry", entry: textEntry() });
    const outcome = await pending;
    expect(outcome.kind).toBe("refused");
    await flushMicrotasks();
    expect(dispatchItemMock).not.toHaveBeenCalled();
  });
});
