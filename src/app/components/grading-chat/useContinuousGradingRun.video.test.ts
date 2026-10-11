// VIDEO-GRADING W4 (T13 reachability, driver half): storaged-video -> prepareVideo
// -> a videoRef-bearing entry -> the grade dispatch (what /api/grade-run-item
// receives), the typed videoFailure the grade POST surfaces, the pending-video
// count, and the prepare_video diagnostics on the LIVE path. Same no-render
// harness as useContinuousGradingRun.lifecycle.test.ts (copied, not imported).
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
import { VideoGradeError, gradeFailureFromBody, type PrepareVideoFn } from "./videoClient";
import type { IngestOutcome } from "@/lib/grade/ndjson-ingest-parser";
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
const prepareVideoMock = vi.fn<PrepareVideoFn>();
const ingestZipMock = vi.fn();

function useTestDriver() {
  h0.begin();
  return useContinuousGradingRun({
    provider: "gemini",
    dispatchItem: dispatchItemMock,
    prepareVideo: prepareVideoMock,
    ingestZip: ingestZipMock,
    maxEntries: 40,
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

beforeEach(() => {
  resetSessionDiagnosticLogForTests("2026-10-08T10:00:00.000Z");
  h0.reset();
  resolveChatRunHeaderActionMock.mockReset();
  prepareChatSubmissionActionMock.mockReset();
  prepareCompositeSubmissionActionMock.mockReset();
  dispatchItemMock.mockReset();
  prepareVideoMock.mockReset();
  ingestZipMock.mockReset();
  resolveChatRunHeaderActionMock.mockResolvedValue(readyHeader);
});

async function beginReady(first: ReturnType<typeof useTestDriver>): Promise<void> {
  await first.beginSession({ assignmentInstructions: "Grade it.", rubric: "" });
}

function videoDiag() {
  return readSessionDiagnosticSurfaceEntries("grading").entries.filter((e) => e.operation === "prepare_video");
}

describe("useContinuousGradingRun - storaged-video (loose video)", () => {
  it("prepares the stored video and dispatches a videoRef entry with NO rawBase64 to the grade seam", async () => {
    prepareVideoMock.mockResolvedValue({ kind: "entry", entry: videoEntry() });
    dispatchItemMock.mockResolvedValue(gradedRow("Jordan Lee"));
    await beginReady(useTestDriver());
    const driver = useTestDriver();
    const outcome = await driver.submit({ kind: "storaged-video", storagePath: VIDEO_PATH, name: "demo.mp4" });
    expect(outcome).toEqual({ kind: "accepted", entryCount: 1 });
    expect(prepareVideoMock).toHaveBeenCalledWith(VIDEO_PATH, "demo.mp4", undefined);
    await flushMicrotasks();
    expect(dispatchItemMock).toHaveBeenCalledTimes(1);
    const dispatched = dispatchItemMock.mock.calls[0][0].entry.submittedFiles[0];
    expect(dispatched.videoRef).toEqual({ storagePath: VIDEO_PATH, sizeBytes: 1234 });
    expect(dispatched.rawBase64).toBeUndefined();
  });

  it("records a prepare_video success on the live path, carrying no filename or path", async () => {
    prepareVideoMock.mockResolvedValue({ kind: "entry", entry: videoEntry() });
    dispatchItemMock.mockResolvedValue(gradedRow("Jordan Lee"));
    await beginReady(useTestDriver());
    const driver = useTestDriver();
    await driver.submit({ kind: "storaged-video", storagePath: VIDEO_PATH, name: "demo.mp4" });
    await flushMicrotasks();
    const entries = videoDiag();
    expect(entries.map((e) => e.outcome)).toEqual(["success"]);
    expect(JSON.stringify(entries)).not.toContain("demo.mp4");
    expect(JSON.stringify(entries)).not.toContain("grading-uploads");
  });

  it("a refused prepare surfaces the worded reason, records the TYPED class and dispatches nothing", async () => {
    prepareVideoMock.mockResolvedValue({ kind: "refused", reason: "not a video file", videoFailure: "unsupported format" });
    await beginReady(useTestDriver());
    const driver = useTestDriver();
    const outcome = await driver.submit({ kind: "storaged-video", storagePath: VIDEO_PATH, name: "demo.mp4" });
    expect(outcome).toEqual({ kind: "refused", reason: "not a video file" });
    expect(dispatchItemMock).not.toHaveBeenCalled();
    expect(videoDiag().map((e) => [e.outcome, e.error])).toEqual([["failure", "unsupported format"]]);
  });

  it("a throwing injected prepare becomes an upload-failed refusal, not a crash", async () => {
    prepareVideoMock.mockRejectedValue(new Error("boom"));
    await beginReady(useTestDriver());
    const driver = useTestDriver();
    const outcome = await driver.submit({ kind: "storaged-video", storagePath: VIDEO_PATH, name: "demo.mp4" });
    expect(outcome.kind).toBe("refused");
    expect(videoDiag().map((e) => e.error)).toEqual(["upload failed"]);
  });

  it("a typed video failure from the grade POST becomes a failed row and a recorded class", async () => {
    prepareVideoMock.mockResolvedValue({ kind: "entry", entry: videoEntry() });
    dispatchItemMock.mockRejectedValue(new VideoGradeError("The model could not use this video.", "model rejected"));
    await beginReady(useTestDriver());
    const driver = useTestDriver();
    await driver.submit({ kind: "storaged-video", storagePath: VIDEO_PATH, name: "demo.mp4" });
    await flushMicrotasks();
    const rerendered = useTestDriver();
    expect(rerendered.results).toHaveLength(1);
    expect(rerendered.results[0].ungraded?.kind).toBe("grading-failed");
    expect(rerendered.results[0].ungraded?.message).toContain("The model could not use this video.");
    expect(videoDiag().map((e) => [e.outcome, e.error])).toEqual([
      ["success", ""],
      ["failure", "model rejected"],
    ]);
  });

  it("pendingVideoCount counts a queued or in-flight video row and drops it once graded", async () => {
    prepareVideoMock.mockResolvedValue({ kind: "entry", entry: videoEntry() });
    let release: (row: GradeResult) => void = () => undefined;
    dispatchItemMock.mockReturnValue(new Promise<GradeResult>((resolve) => (release = resolve)));
    await beginReady(useTestDriver());
    const driver = useTestDriver();
    await driver.submit({ kind: "storaged-video", storagePath: VIDEO_PATH, name: "demo.mp4" });
    expect(driver.pendingVideoCount()).toBe(1);
    release(gradedRow("Jordan Lee"));
    await flushMicrotasks();
    expect(useTestDriver().pendingVideoCount()).toBe(0);
  });

  it("a label is forwarded to prepareVideo and names the single row", async () => {
    prepareVideoMock.mockResolvedValue({ kind: "entry", entry: videoEntry("demo") });
    dispatchItemMock.mockResolvedValue(gradedRow("Sam"));
    await beginReady(useTestDriver());
    const driver = useTestDriver();
    await driver.submit({ kind: "storaged-video", storagePath: VIDEO_PATH, name: "demo.mp4", label: "  Sam  " });
    expect(prepareVideoMock).toHaveBeenCalledWith(VIDEO_PATH, "demo.mp4", "Sam");
    await flushMicrotasks();
    expect(dispatchItemMock.mock.calls[0][0].entry.student).toBe("Sam");
  });
});

describe("useContinuousGradingRun - in-zip video diagnostics", () => {
  it("fans the ingest ledger's video counts out to prepare_video entries (counts only)", async () => {
    const outcome: IngestOutcome = {
      kind: "complete",
      entryCount: 0,
      ledger: {
        studentsFound: 1,
        studentsEmitted: 0,
        skipped: [{ student: "bob", reason: "x" }],
        failedSupportedFiles: [],
        videoOutcomes: { accepted: 1, failed: { "too large": 1 } },
      },
    };
    ingestZipMock.mockResolvedValue(outcome);
    await beginReady(useTestDriver());
    const driver = useTestDriver();
    await driver.submit({ kind: "storaged-zip", storagePath: "u1/grading-uploads/abc.zip", name: "class.zip" });
    expect(videoDiag().map((e) => [e.outcome, e.error])).toEqual([
      ["success", ""],
      ["failure", "too large"],
    ]);
  });

  it("records the typed class when the whole ingest is refused for a video reason", async () => {
    ingestZipMock.mockResolvedValue({ kind: "refused", reason: "Refused: too many videos", videoFailure: "too many videos" });
    await beginReady(useTestDriver());
    const driver = useTestDriver();
    const outcome = await driver.submit({ kind: "storaged-zip", storagePath: "u1/grading-uploads/abc.zip", name: "class.zip" });
    expect(outcome.kind).toBe("refused");
    expect(videoDiag().map((e) => e.error)).toEqual(["too many videos"]);
  });
});

describe("gradeFailureFromBody", () => {
  it("returns a VideoGradeError only for a valid class, else a plain Error with the message", () => {
    const typed = gradeFailureFromBody({ error: "too big", videoFailure: "too large" });
    expect(typed).toBeInstanceOf(VideoGradeError);
    expect((typed as VideoGradeError).videoFailure).toBe("too large");
    const plain = gradeFailureFromBody({ error: "nope", videoFailure: "made up" });
    expect(plain).not.toBeInstanceOf(VideoGradeError);
    expect(plain.message).toBe("nope");
    expect(gradeFailureFromBody({}).message).toBe("The grading service did not respond.");
  });
});
