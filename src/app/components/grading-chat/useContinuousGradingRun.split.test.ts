// RECORDING ONE-VS-MANY W2/W3 (driver half): storaged-video -> classify ->
// pendingSplit held -> confirm -> N DISTINCT rows each carrying its own grade
// window; decline/single/failed -> ONE whole-video row as today. Same no-render
// harness as useContinuousGradingRun.video.test.ts (copied, not imported), with
// RECORDING_SPLIT_ENABLED forced on for this file only (the shipped value is false).
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
vi.mock("@/app/actions/grading-chat-intake", () => ({
  prepareCompositeSubmissionAction: vi.fn(),
  resolveChatRunHeaderAction: (...args: unknown[]) => resolveChatRunHeaderActionMock(...args),
  prepareChatSubmissionAction: vi.fn(),
}));

import { useContinuousGradingRun } from "./useContinuousGradingRun";
import type { ClassifyRecordingFn, PrepareVideoFn } from "./videoClient";
import type { GradeResult, StudentSubmissionEntry } from "@/lib/grade/types";
import type { RecordingSplit } from "@/lib/grade/recording-split";

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

function useTestDriver(maxEntries = 40) {
  h0.begin();
  return useContinuousGradingRun({
    provider: "gemini",
    dispatchItem: dispatchItemMock,
    prepareVideo: prepareVideoMock,
    classifyRecording: classifyMock,
    maxEntries,
  });
}

const VIDEO_PATH = "u1/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.mp4";

function videoEntry(student = "Jordan Lee"): StudentSubmissionEntry {
  return {
    student,
    content: "File: demo.mp4",
    mergedFileCount: 1,
    submittedFiles: [
      {
        name: "demo.mp4",
        extension: "mp4",
        previewContent: "[Video file: demo.mp4, 0.0MB, mp4]",
        previewTruncated: false,
        mimeType: "video/mp4",
        videoRef: { storagePath: VIDEO_PATH, sizeBytes: 1234 },
      },
    ],
  };
}

// Two segments with the SAME model label: the distinctness hazard.
const SAME_LABEL_SPLIT: RecordingSplit = {
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
  dispatchItemMock.mockReset();
  prepareVideoMock.mockReset();
  classifyMock.mockReset();
  resolveChatRunHeaderActionMock.mockResolvedValue(readyHeader);
  prepareVideoMock.mockResolvedValue({ kind: "entry", entry: videoEntry() });
  dispatchItemMock.mockImplementation(async (req: { entry: StudentSubmissionEntry }) => gradedRow(req.entry.student));
});

async function beginReady(first: ReturnType<typeof useTestDriver>): Promise<void> {
  await first.beginSession({ assignmentInstructions: "Each student presents.", rubric: "" });
}

function classifyDiag() {
  return readSessionDiagnosticSurfaceEntries("grading").entries.filter((e) => e.operation.startsWith("classify_recording"));
}

const SUBMIT = { kind: "storaged-video", storagePath: VIDEO_PATH, name: "demo.mp4" } as const;

describe("useContinuousGradingRun - recording split (flag on)", () => {
  it("classifies once with the stored ref and the frozen assignment context", async () => {
    classifyMock.mockResolvedValue({ split: { kind: "single" }, failed: false });
    await beginReady(useTestDriver());
    await useTestDriver().submit(SUBMIT);
    expect(classifyMock).toHaveBeenCalledTimes(1);
    expect(classifyMock).toHaveBeenCalledWith({
      storagePath: VIDEO_PATH,
      sizeBytes: 1234,
      assignmentInstructions: "Each student presents.",
      rubric: "1. Correctness",
    });
  });

  it("a MULTIPLE result is HELD as pendingSplit and dispatches nothing", async () => {
    classifyMock.mockResolvedValue({ split: SAME_LABEL_SPLIT, failed: false });
    await beginReady(useTestDriver());
    const outcome = await useTestDriver().submit({ ...SUBMIT, label: "  Class A  " });
    await flushMicrotasks();
    expect(outcome).toEqual({ kind: "accepted", entryCount: 0 });
    expect(dispatchItemMock).not.toHaveBeenCalled();
    const driver = useTestDriver();
    expect(driver.pendingSplit?.segments).toHaveLength(2);
    expect(driver.pendingSplit?.name).toBe("demo.mp4");
    expect(driver.dispatchedCount).toBe(0);
    expect(classifyDiag().map((e) => [e.operation, e.outcome, e.classificationStudentCount])).toEqual([
      ["classify_recording_multiple", "success", 2],
    ]);
  });

  it("CONFIRM yields N PAIRWISE-DISTINCT rows from the one video, each with its own window (removal test)", async () => {
    classifyMock.mockResolvedValue({ split: SAME_LABEL_SPLIT, failed: false });
    await beginReady(useTestDriver());
    await useTestDriver().submit(SUBMIT);
    const outcome = useTestDriver().confirmRecordingSplit();
    expect(outcome).toEqual({ kind: "accepted", entryCount: 2 });
    await flushMicrotasks();
    expect(dispatchItemMock).toHaveBeenCalledTimes(2);
    const bodies = dispatchItemMock.mock.calls.map((c) => c[0]);
    const students = bodies.map((b) => b.entry.student);
    expect(students).toEqual(["Presenter", "Presenter (2)"]);
    expect(new Set(students).size).toBe(students.length);
    // Same stored video, different window.
    expect(bodies.map((b) => b.entry.submittedFiles[0].videoRef.storagePath)).toEqual([VIDEO_PATH, VIDEO_PATH]);
    expect(bodies.map((b) => b.gradeWindowSec)).toEqual([
      { startSec: 0, endSec: 90 },
      { startSec: 90, endSec: 200 },
    ]);
    const after = useTestDriver();
    expect(after.pendingSplit).toBeNull();
    const resultStudents = after.results.map((r) => r.student);
    expect(resultStudents).toHaveLength(2);
    expect(resultStudents[0]).not.toBe(resultStudents[1]);
  });

  it("a confirm with nothing held is a refusal, not a dispatch", async () => {
    await beginReady(useTestDriver());
    expect(useTestDriver().confirmRecordingSplit().kind).toBe("refused");
    expect(dispatchItemMock).not.toHaveBeenCalled();
  });

  it("DECLINE grades the whole recording as ONE row with the submit-time label and NO window", async () => {
    classifyMock.mockResolvedValue({ split: SAME_LABEL_SPLIT, failed: false });
    await beginReady(useTestDriver());
    await useTestDriver().submit({ ...SUBMIT, label: "Class A" });
    expect(useTestDriver().rejectRecordingSplit()).toEqual({ kind: "accepted", entryCount: 1 });
    await flushMicrotasks();
    expect(dispatchItemMock).toHaveBeenCalledTimes(1);
    const body = dispatchItemMock.mock.calls[0][0];
    expect(body.entry.student).toBe("Class A");
    expect(Object.keys(body)).not.toContain("gradeWindowSec");
    expect(useTestDriver().pendingSplit).toBeNull();
  });

  it("a SINGLE result dispatches one whole-video row immediately, no window, nothing held", async () => {
    classifyMock.mockResolvedValue({ split: { kind: "single" }, failed: false });
    await beginReady(useTestDriver());
    expect(await useTestDriver().submit(SUBMIT)).toEqual({ kind: "accepted", entryCount: 1 });
    await flushMicrotasks();
    expect(dispatchItemMock).toHaveBeenCalledTimes(1);
    expect(Object.keys(dispatchItemMock.mock.calls[0][0])).not.toContain("gradeWindowSec");
    expect(useTestDriver().pendingSplit).toBeNull();
    expect(classifyDiag().map((e) => [e.operation, e.outcome])).toEqual([["classify_recording_single", "success"]]);
  });

  it("a FAILED classification grades as one AND records a failure entry (not a success single)", async () => {
    classifyMock.mockResolvedValue({ split: { kind: "single" }, failed: true });
    await beginReady(useTestDriver());
    expect(await useTestDriver().submit(SUBMIT)).toEqual({ kind: "accepted", entryCount: 1 });
    await flushMicrotasks();
    expect(dispatchItemMock).toHaveBeenCalledTimes(1);
    expect(classifyDiag().map((e) => [e.operation, e.outcome])).toEqual([["classify_recording_single", "failure"]]);
  });

  it("a THROWING injected classifier is the failed single, never a crash or a hold", async () => {
    classifyMock.mockRejectedValue(new Error("boom"));
    await beginReady(useTestDriver());
    expect(await useTestDriver().submit(SUBMIT)).toEqual({ kind: "accepted", entryCount: 1 });
    expect(useTestDriver().pendingSplit).toBeNull();
    expect(classifyDiag().map((e) => e.outcome)).toEqual(["failure"]);
  });

  it("recorded classify entries carry no file name, path, label or student name", async () => {
    classifyMock.mockResolvedValue({ split: SAME_LABEL_SPLIT, failed: false });
    await beginReady(useTestDriver());
    await useTestDriver().submit(SUBMIT);
    const text = JSON.stringify(classifyDiag());
    expect(text).not.toContain("demo.mp4");
    expect(text).not.toContain("grading-uploads");
    expect(text).not.toContain("Presenter");
  });

  it("the classifying flag is cleared once classification settles", async () => {
    classifyMock.mockResolvedValue({ split: { kind: "single" }, failed: false });
    await beginReady(useTestDriver());
    await useTestDriver().submit(SUBMIT);
    expect(useTestDriver().classifyingRecording).toBe(false);
  });

  it("confirm clips to the session ceiling: first N dispatch, the rest are a worded partial", async () => {
    classifyMock.mockResolvedValue({ split: SAME_LABEL_SPLIT, failed: false });
    await beginReady(useTestDriver(1));
    await useTestDriver(1).submit(SUBMIT);
    const outcome = useTestDriver(1).confirmRecordingSplit();
    expect(outcome.kind).toBe("partial");
    await flushMicrotasks();
    expect(dispatchItemMock).toHaveBeenCalledTimes(1);
  });

  it("reset drops a held recording", async () => {
    classifyMock.mockResolvedValue({ split: SAME_LABEL_SPLIT, failed: false });
    await beginReady(useTestDriver());
    await useTestDriver().submit(SUBMIT);
    useTestDriver().reset();
    expect(useTestDriver().pendingSplit).toBeNull();
  });
});
