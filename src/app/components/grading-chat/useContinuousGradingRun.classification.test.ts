// ZIP-CLASS-VS-SINGLE W1: the driver captures a zip ingest's classification
// into classificationRef and every rebuilt run carries it. The no-render
// harness is a copy of useContinuousGradingRun.lifecycle.test.ts's h0 (copied,
// not imported: no-cross-test-file-imports).
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
  prepareCompositeSubmissionAction: vi.fn(),
  resolveChatRunHeaderAction: (...args: unknown[]) => resolveChatRunHeaderActionMock(...args),
  prepareChatSubmissionAction: (...args: unknown[]) => prepareChatSubmissionActionMock(...args),
}));

import { useContinuousGradingRun } from "./useContinuousGradingRun";
import {
  readSessionDiagnosticSurfaceEntries,
  resetSessionDiagnosticLogForTests,
} from "@/lib/session-diagnostic-log";
import type { GradeResult, StudentSubmissionEntry, SubmissionZipClassification } from "@/lib/grade/types";

type Ingest = NonNullable<Parameters<typeof useContinuousGradingRun>[0]["ingestZip"]>;

const dispatchItemMock = vi.fn();

const readyHeader = {
  kind: "ok" as const,
  effectiveRubric: "1. Correctness",
  generatedRubric: undefined,
  criteriaNames: [],
  rubricUsed: "",
  rubricFingerprint: "",
};

const CLASS_OF_3: SubmissionZipClassification = {
  kind: "class",
  studentCount: 3,
  markerStudentCount: 3,
  signal: "canvas-convention",
};

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

function entryOf(student: string): StudentSubmissionEntry {
  return { student, content: "x", mergedFileCount: 0, submittedFiles: [] };
}

function renderDriver(ingestZip: Ingest): ReturnType<typeof useContinuousGradingRun> {
  h0.begin();
  // eslint-disable-next-line react-hooks/rules-of-hooks -- no-render harness: one call is one render
  return useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, ingestZip });
}

async function readyDriver(ingestZip: Ingest) {
  let driver = renderDriver(ingestZip);
  await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
  driver = renderDriver(ingestZip);
  return driver;
}

const zipInput = { kind: "storaged-zip" as const, storagePath: "u/grading-uploads/a.zip", name: "class.zip" };

function ingestWith(classification: SubmissionZipClassification | undefined): Ingest {
  return async (_path, _provider, onEntry) => {
    onEntry(entryOf("A"));
    onEntry(entryOf("B"));
    onEntry(entryOf("C"));
    return {
      kind: "complete",
      entryCount: 3,
      ledger: {
        studentsFound: 3,
        studentsEmitted: 3,
        skipped: [],
        failedSupportedFiles: [],
        ...(classification ? { classification } : {}),
      },
    };
  };
}

beforeEach(() => {
  resetSessionDiagnosticLogForTests("2026-10-08T10:00:00.000Z");
  h0.reset();
  resolveChatRunHeaderActionMock.mockReset();
  prepareChatSubmissionActionMock.mockReset();
  dispatchItemMock.mockReset();
  resolveChatRunHeaderActionMock.mockResolvedValue(readyHeader);
  dispatchItemMock.mockImplementation(async () => gradedRow("graded"));
});

describe("useContinuousGradingRun - submissionClassification carrier", () => {
  it("the storaged-zip path stamps the ingest's classification onto driver.run", async () => {
    const ingest = ingestWith(CLASS_OF_3);
    const driver = await readyDriver(ingest);
    await driver.submit(zipInput);
    await flushMicrotasks();
    expect(renderDriver(ingest).run?.submissionClassification).toEqual(CLASS_OF_3);
  });

  it("an ingest with no classification (old server) leaves the run without one", async () => {
    const ingest = ingestWith(undefined);
    const driver = await readyDriver(ingest);
    await driver.submit(zipInput);
    await flushMicrotasks();
    const run = renderDriver(ingest).run;
    expect(run).not.toBeNull();
    expect(run?.submissionClassification).toBeUndefined();
  });

  it("NIT-A: a later text submit does not wipe the zip's classification", async () => {
    const ingest = ingestWith(CLASS_OF_3);
    let driver = await readyDriver(ingest);
    await driver.submit(zipInput);
    await flushMicrotasks();
    driver = renderDriver(ingest);
    await driver.submit({ kind: "text", content: "my essay", label: "Solo" });
    await flushMicrotasks();
    expect(renderDriver(ingest).run?.submissionClassification).toEqual(CLASS_OF_3);
  });

  it("NIT-A: a later file-branch outcome WITHOUT classification does not wipe it", async () => {
    const ingest = ingestWith(CLASS_OF_3);
    let driver = await readyDriver(ingest);
    await driver.submit(zipInput);
    await flushMicrotasks();
    prepareChatSubmissionActionMock.mockResolvedValue({ kind: "entries", entries: [entryOf("Solo")], pointsPossible: null });
    driver = renderDriver(ingest);
    await driver.submit({ kind: "url", url: "https://example.com/doc" });
    await flushMicrotasks();
    expect(renderDriver(ingest).run?.submissionClassification).toEqual(CLASS_OF_3);
  });

  it("the small-zip file branch captures outcome.classification, and the latest zip ingest wins", async () => {
    const single: SubmissionZipClassification = {
      kind: "single",
      studentCount: 1,
      markerStudentCount: 1,
      signal: "single-group",
    };
    const ingest = ingestWith(CLASS_OF_3);
    prepareChatSubmissionActionMock.mockResolvedValue({
      kind: "entries",
      entries: [entryOf("Solo")],
      pointsPossible: null,
      classification: single,
    });
    let driver = await readyDriver(ingest);
    await driver.submit(zipInput);
    await flushMicrotasks();
    driver = renderDriver(ingest);
    await driver.submit({ kind: "url", url: "https://example.com/small.zip" });
    await flushMicrotasks();
    expect(renderDriver(ingest).run?.submissionClassification).toEqual(single);
  });

  it("NIT-2: a refused zip (empty ingest, or over the session ceiling) does not overwrite the prior badge", async () => {
    const good = ingestWith(CLASS_OF_3);
    let driver = await readyDriver(good);
    await driver.submit(zipInput);
    await flushMicrotasks();

    const emptyUnknown: SubmissionZipClassification = { kind: "unknown", studentCount: 0, markerStudentCount: 0, signal: "empty" };
    const emptyIngest: Ingest = async () => ({
      kind: "complete",
      entryCount: 0,
      ledger: { studentsFound: 0, studentsEmitted: 0, skipped: [], failedSupportedFiles: [], classification: emptyUnknown },
    });
    driver = renderDriver(emptyIngest);
    const refusedEmpty = await driver.submit(zipInput);
    expect(refusedEmpty.kind).toBe("refused");
    // A refusal alone does not rebuild the run, so follow it with a non-zip
    // submit (which does) and read the badge the rebuilt run carries.
    prepareChatSubmissionActionMock.mockResolvedValue({ kind: "entries", entries: [entryOf("Solo")], pointsPossible: null });
    driver = renderDriver(emptyIngest);
    await driver.submit({ kind: "url", url: "https://example.com/doc" });
    await flushMicrotasks();
    expect(renderDriver(emptyIngest).run?.submissionClassification).toEqual(CLASS_OF_3);

    // Over the ceiling: the session already holds 3 rows, so a ceiling of 3 refuses.
    h0.reset();
    const capped = (): ReturnType<typeof useContinuousGradingRun> => {
      h0.begin();
      // eslint-disable-next-line react-hooks/rules-of-hooks -- no-render harness: one call is one render
      return useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, ingestZip: good, maxEntries: 3 });
    };
    driver = capped();
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    driver = capped();
    await driver.submit(zipInput);
    await flushMicrotasks();
    driver = capped();
    const single: SubmissionZipClassification = { kind: "single", studentCount: 1, markerStudentCount: 1, signal: "single-group" };
    const overCeiling: Ingest = async (_p, _pr, onEntry) => {
      onEntry(entryOf("D"));
      return {
        kind: "complete",
        entryCount: 1,
        ledger: { studentsFound: 1, studentsEmitted: 1, skipped: [], failedSupportedFiles: [], classification: single },
      };
    };
    const cappedOver = (): ReturnType<typeof useContinuousGradingRun> => {
      h0.begin();
      // eslint-disable-next-line react-hooks/rules-of-hooks -- no-render harness: one call is one render
      return useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatchItemMock, ingestZip: overCeiling, maxEntries: 3 });
    };
    const refusedCeiling = await cappedOver().submit(zipInput);
    expect(refusedCeiling.kind).toBe("refused");
    // Weak half: the ceiling refusal does not rebuild the run, so this only
    // pins that the visible badge is unchanged; the empty-ingest half above is
    // the red-then-green proof.
    await flushMicrotasks();
    expect(cappedOver().run?.submissionClassification).toEqual(CLASS_OF_3);
  });

  it("reset() clears the classification", async () => {
    const ingest = ingestWith(CLASS_OF_3);
    let driver = await readyDriver(ingest);
    await driver.submit(zipInput);
    await flushMicrotasks();
    driver = renderDriver(ingest);
    driver.reset();
    expect(renderDriver(ingest).run).toBeNull();
    // A fresh session with a non-zip submit carries no stale badge.
    driver = renderDriver(ingest);
    await driver.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
    prepareChatSubmissionActionMock.mockResolvedValue({ kind: "entries", entries: [entryOf("Solo")], pointsPossible: null });
    driver = renderDriver(ingest);
    await driver.submit({ kind: "url", url: "https://example.com/doc" });
    await flushMicrotasks();
    expect(renderDriver(ingest).run?.submissionClassification).toBeUndefined();
  });
});

describe("useContinuousGradingRun - classify diagnostic (one record per zip ingest)", () => {
  const classifyEntries = () =>
    readSessionDiagnosticSurfaceEntries("grading").entries.filter((e) => e.operation.startsWith("classify_submission_"));

  it("the storaged-zip branch records exactly one entry with the count and no student name", async () => {
    const ingest = ingestWith(CLASS_OF_3);
    const driver = await readyDriver(ingest);
    await driver.submit(zipInput);
    await flushMicrotasks();
    const entries = classifyEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].operation).toBe("classify_submission_class");
    expect(entries[0].classificationStudentCount).toBe(3);
    const serialized = JSON.stringify(entries);
    for (const name of ["A", "B", "C", "class.zip", "a.zip"]) {
      expect(serialized).not.toContain(`"${name}"`);
      expect(serialized).not.toContain(name + ".zip");
    }
  });

  it("the small-zip file branch records exactly one entry per ingest", async () => {
    const single: SubmissionZipClassification = { kind: "single", studentCount: 1, markerStudentCount: 1, signal: "single-group" };
    prepareChatSubmissionActionMock.mockResolvedValue({
      kind: "entries",
      entries: [entryOf("Zelda Q")],
      pointsPossible: null,
      classification: single,
    });
    const driver = await readyDriver(ingestWith(undefined));
    await driver.submit({ kind: "url", url: "https://example.com/small.zip" });
    await flushMicrotasks();
    const entries = classifyEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].operation).toBe("classify_submission_single");
    expect(entries[0].classificationStudentCount).toBe(1);
    expect(JSON.stringify(entries)).not.toContain("Zelda");
  });

  it("a non-zip submit and an old-server ingest record nothing", async () => {
    const ingest = ingestWith(undefined);
    let driver = await readyDriver(ingest);
    await driver.submit(zipInput);
    driver = renderDriver(ingest);
    await driver.submit({ kind: "text", content: "my essay", label: "Solo" });
    await flushMicrotasks();
    expect(classifyEntries().length).toBe(0);
  });
});
