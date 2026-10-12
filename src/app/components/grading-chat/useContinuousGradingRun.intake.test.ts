// CHAT-GRADING-DETAILED-DIAGNOSTICS WE (AC-14, AC-22 corollary): the intake
// seams record their detail ONLY when something notable happens (a refusal, a
// clip, a skip, a split decision); the ordinary admit path adds no entry. Same
// no-render harness as useContinuousGradingRun.split.test.ts (copied, not
// imported), RECORDING_SPLIT_ENABLED forced on for this file only.
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

vi.mock("@/lib/grade/constants", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/grade/constants")>()),
  RECORDING_SPLIT_ENABLED: true,
}));

const resolveChatRunHeaderActionMock = vi.fn();
const prepareChatSubmissionActionMock = vi.fn();
vi.mock("@/app/actions/grading-chat-intake", () => ({
  prepareCompositeSubmissionAction: vi.fn(),
  resolveChatRunHeaderAction: (...args: unknown[]) => resolveChatRunHeaderActionMock(...args),
  prepareChatSubmissionAction: (...args: unknown[]) => prepareChatSubmissionActionMock(...args),
}));

import { useContinuousGradingRun } from "./useContinuousGradingRun";
import type { ClassifyRecordingFn, PrepareVideoFn } from "./videoClient";
import type { GradeResult, StudentSubmissionEntry } from "@/lib/grade/types";
import type { RecordingSplit } from "@/lib/grade/recording-split";
import type { IngestOutcome } from "@/lib/grade/ndjson-ingest-parser";

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
const prepareVideoMock = vi.fn<PrepareVideoFn>();
const classifyMock = vi.fn<ClassifyRecordingFn>();
const ingestZipMock = vi.fn();

function useTestDriver(maxEntries = 40) {
  h0.begin();
  return useContinuousGradingRun({
    provider: "gemini",
    dispatchItem: dispatchItemMock,
    prepareVideo: prepareVideoMock,
    classifyRecording: classifyMock,
    ingestZip: ingestZipMock,
    maxEntries,
  });
}

const VIDEO_PATH = "u1/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.mp4";
const ZIP_PATH = "u1/grading-uploads/3f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.zip";

function entryFor(student: string, source?: "filename" | "inferred" | "unresolved"): StudentSubmissionEntry {
  return {
    student,
    content: "some submission text",
    mergedFileCount: 1,
    submittedFiles: [],
    ...(source ? { studentNameSource: source } : {}),
  };
}

function videoEntry(): StudentSubmissionEntry {
  return {
    student: "Jordan Lee",
    content: "File: demo.mp4",
    mergedFileCount: 1,
    submittedFiles: [
      {
        name: "demo.mp4",
        extension: "mp4",
        previewContent: "[Video file: demo.mp4]",
        previewTruncated: false,
        mimeType: "video/mp4",
        videoRef: { storagePath: VIDEO_PATH, sizeBytes: 1234 },
      },
    ],
  };
}

const SPLIT: RecordingSplit = {
  kind: "multiple",
  segments: [
    { startSec: 0, endSec: 90, label: "Presenter" },
    { startSec: 90, endSec: 200, label: "Presenter" },
  ],
};

beforeEach(() => {
  resetSessionDiagnosticLogForTests("2026-10-08T10:00:00.000Z");
  h0.reset();
  resolveChatRunHeaderActionMock.mockReset();
  prepareChatSubmissionActionMock.mockReset();
  dispatchItemMock.mockReset();
  prepareVideoMock.mockReset();
  classifyMock.mockReset();
  ingestZipMock.mockReset();
  resolveChatRunHeaderActionMock.mockResolvedValue(readyHeader);
  prepareVideoMock.mockResolvedValue({ kind: "entry", entry: videoEntry() });
  dispatchItemMock.mockImplementation(async (req: { entry: StudentSubmissionEntry }) => gradedRow(req.entry.student));
});

async function beginReady(driver: ReturnType<typeof useTestDriver>): Promise<void> {
  await driver.beginSession({ assignmentInstructions: "Each student presents.", rubric: "" });
}

function ops(name: string) {
  return readSessionDiagnosticSurfaceEntries("grading").entries.filter((e) => e.operation === name);
}

function everything(): string {
  return JSON.stringify(readSessionDiagnosticSurfaceEntries("grading").entries);
}

const FILE_INPUT = () => ({ kind: "file", file: new File(["x"], "ZZ_CANARY_FILE.txt") }) as const;

describe("intake diagnostics - prepare_submission", () => {
  it("a non-video zip ingest refusal records a prepare failure with a fixed class (AC-14a)", async () => {
    await beginReady(useTestDriver());
    ingestZipMock.mockResolvedValue({ kind: "refused", reason: "Refused: ZZ_CANARY_STUDENT collides with ZZ_CANARY_STUDENT" } satisfies IngestOutcome);
    await useTestDriver().submit({ kind: "storaged-zip", storagePath: ZIP_PATH, name: "ZZ_CANARY_FILE.zip" });
    const [entry] = ops("prepare_submission");
    expect(entry.outcome).toBe("failure");
    expect(entry.error).toBe("name collision");
    expect(entry.detail).toEqual({ inputKind: "zip-storage", stage: "prepare", transport: "storage" });
    expect(everything()).not.toContain("ZZ_CANARY");
  });

  it("a zip success records the ledger as COUNTS, never the skipped names (AC-14e)", async () => {
    await beginReady(useTestDriver());
    ingestZipMock.mockImplementation(async (_p: string, _prov: string, onEntry: (e: StudentSubmissionEntry) => void) => {
      onEntry(entryFor("A"));
      onEntry(entryFor("B"));
      return {
        kind: "complete",
        entryCount: 2,
        ledger: {
          studentsFound: 4,
          studentsEmitted: 2,
          skipped: [{ student: "ZZ_CANARY_STUDENT", reason: "too large to grade on this surface" }],
          failedSupportedFiles: ["ZZ_CANARY_FILE.docx"],
          classification: { kind: "class", studentCount: 4, markerStudentCount: 3, signal: "folders" },
        },
      } satisfies IngestOutcome;
    });
    await useTestDriver().submit({ kind: "storaged-zip", storagePath: ZIP_PATH, name: "class.zip" });
    const [entry] = ops("prepare_submission");
    expect(entry.outcome).toBe("success");
    expect(entry.detail).toEqual({
      inputKind: "zip-storage",
      stage: "prepare",
      transport: "storage",
      found: 4,
      emitted: 2,
      skipped: 1,
      failedFiles: 1,
      markers: 3,
    });
    expect(everything()).not.toContain("ZZ_CANARY");
  });

  it("a typed server refusal lands as detail.refusal and the raw reason never does", async () => {
    await beginReady(useTestDriver());
    prepareChatSubmissionActionMock.mockResolvedValue({
      kind: "refused",
      reason: "This file is too large: ZZ_CANARY_FILE.txt for ZZ_CANARY_STUDENT",
      refusalClass: "over-wire-budget",
    });
    await useTestDriver().submit(FILE_INPUT());
    const [entry] = ops("prepare_submission");
    expect(entry.error).toBe("too large");
    expect(entry.detail).toEqual({ inputKind: "file", stage: "prepare", transport: "body", sizeKb: 1, ext: "text", refusal: "over-wire-budget" });
    expect(everything()).not.toContain("ZZ_CANARY");
  });

  it("a forged refusal class is dropped, not recorded", async () => {
    await beginReady(useTestDriver());
    prepareChatSubmissionActionMock.mockResolvedValue({ kind: "refused", reason: "x", refusalClass: "ZZ_CANARY_CLASS" });
    await useTestDriver().submit(FILE_INPUT());
    expect(ops("prepare_submission")[0].detail).not.toHaveProperty("refusal");
    expect(everything()).not.toContain("ZZ_CANARY");
  });

  it("an accepted file records counts and name-source tallies", async () => {
    await beginReady(useTestDriver());
    prepareChatSubmissionActionMock.mockResolvedValue({
      kind: "entries",
      pointsPossible: null,
      entries: [entryFor("A", "filename"), entryFor("B", "inferred"), entryFor("C", "unresolved")],
    });
    await useTestDriver().submit(FILE_INPUT());
    await flushMicrotasks();
    expect(ops("prepare_submission")[0].detail).toMatchObject({
      entries: 3,
      namesFilename: 1,
      namesInferred: 1,
      namesUnresolved: 1,
      chars: 60,
    });
  });
});

describe("intake diagnostics - admit_submissions is anomaly-only", () => {
  it("the ordinary all-admitted path records NO admit entry and NO split entry", async () => {
    await beginReady(useTestDriver());
    prepareChatSubmissionActionMock.mockResolvedValue({ kind: "entries", pointsPossible: null, entries: [entryFor("A"), entryFor("B")] });
    await useTestDriver().submit(FILE_INPUT());
    await flushMicrotasks();
    expect(ops("admit_submissions")).toHaveLength(0);
    expect(ops("resolve_recording_split")).toHaveLength(0);
  });

  it("a clip records requested/admitted/clipped/cap exactly (AC-14b)", async () => {
    await beginReady(useTestDriver(2));
    prepareChatSubmissionActionMock.mockResolvedValue({
      kind: "entries",
      pointsPossible: null,
      entries: [entryFor("A"), entryFor("B"), entryFor("C")],
    });
    await useTestDriver(2).submit(FILE_INPUT());
    const [entry] = ops("admit_submissions");
    expect(entry.outcome).toBe("success");
    expect(entry.detail).toEqual({ requested: 3, admitted: 2, clipped: 1, skipped: 0, cap: 2, reason: "cap-clipped" });
  });

  it("the cap refusing outright records a failure (AC-14c)", async () => {
    await beginReady(useTestDriver(1));
    prepareChatSubmissionActionMock.mockResolvedValue({ kind: "entries", pointsPossible: null, entries: [entryFor("A")] });
    await useTestDriver(1).submit(FILE_INPUT());
    await flushMicrotasks();
    await useTestDriver(1).submit(FILE_INPUT());
    const [entry] = ops("admit_submissions");
    expect(entry.outcome).toBe("failure");
    expect(entry.error).toBe("cap exceeded");
    expect(entry.detail).toEqual({ requested: 1, admitted: 0, clipped: 1, cap: 1, reason: "cap-reached" });
  });
});

describe("intake diagnostics - resolve_recording_split", () => {
  it("records a confirm with segment and clip counts (AC-14d)", async () => {
    classifyMock.mockResolvedValue({ split: SPLIT, failed: false });
    await beginReady(useTestDriver());
    await useTestDriver().submit({ kind: "storaged-video", storagePath: VIDEO_PATH, name: "demo.mp4" });
    expect(ops("resolve_recording_split")).toHaveLength(0);
    useTestDriver().confirmRecordingSplit();
    const [entry] = ops("resolve_recording_split");
    expect(entry.outcome).toBe("success");
    expect(entry.detail).toEqual({ decision: "confirm", segments: 2, admitted: 2, clipped: 0 });
  });

  it("records a reject", async () => {
    classifyMock.mockResolvedValue({ split: SPLIT, failed: false });
    await beginReady(useTestDriver());
    await useTestDriver().submit({ kind: "storaged-video", storagePath: VIDEO_PATH, name: "demo.mp4" });
    useTestDriver().rejectRecordingSplit();
    expect(ops("resolve_recording_split")[0].detail).toEqual({ decision: "reject", segments: 2, admitted: 1, clipped: 0 });
  });
});
