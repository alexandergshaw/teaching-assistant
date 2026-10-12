import { beforeEach, describe, expect, it } from "vitest";
import type { SubmissionZipClassification } from "@/lib/grade/types";
import {
  readSessionDiagnosticLogState,
  readSessionDiagnosticSurfaceEntries,
  resetSessionDiagnosticLogForTests,
  type SessionDiagnosticEntry,
} from "@/lib/session-diagnostic-log";
import {
  GRADING_DIAGNOSTIC_OPERATION_LABELS,
  decideClassifyDiagnostic,
  decideClassifyRecordingDiagnostic,
  recordClassifyRecordingSettled,
  decideWholeRunDiagnostic,
  recordClassifySettled,
  recordGradingDiagnosticEntry,
  recordWholeRunSettled,
  type WholeRunSettledState,
} from "./gradingDiagnosticLog";

beforeEach(() => {
  resetSessionDiagnosticLogForTests("2026-10-08T10:00:00.000Z");
});

function okState(): WholeRunSettledState {
  return { error: null, run: { id: "r" } };
}

function errState(message: string): WholeRunSettledState {
  return { error: message, run: null };
}

describe("decideWholeRunDiagnostic (pure)", () => {
  it("returns null when no whole-run dispatch is in flight", () => {
    expect(decideWholeRunDiagnostic({ startedAtMs: null, settledAtMs: 5000, state: okState() })).toBeNull();
  });

  it("records a success with the dispatch-to-settle duration", () => {
    expect(decideWholeRunDiagnostic({ startedAtMs: 1000, settledAtMs: 3360.4, state: okState() })).toEqual({
      operation: "grade_whole_run",
      outcome: "success",
      durationMs: 2360,
    });
  });

  it("records a failure carrying the action's own error and the duration", () => {
    expect(decideWholeRunDiagnostic({ startedAtMs: 100, settledAtMs: 400, state: errState("boom") })).toEqual({
      operation: "grade_whole_run",
      outcome: "failure",
      durationMs: 300,
      error: "boom",
    });
  });

  it("never yields a negative duration", () => {
    const d = decideWholeRunDiagnostic({ startedAtMs: 500, settledAtMs: 400, state: okState() });
    expect(d?.durationMs).toBe(0);
  });
});

describe("recordGradingDiagnosticEntry / recordWholeRunSettled (call shape)", () => {
  it("writes a surface:grading entry with the fixed label and a numeric durationMs", () => {
    recordGradingDiagnosticEntry({
      at: "2026-10-08T10:00:01.000Z",
      operation: "grade_whole_run",
      outcome: "success",
      durationMs: 1234,
    });
    const slice = readSessionDiagnosticSurfaceEntries("grading").entries;
    expect(slice.length).toBe(1);
    const entry: SessionDiagnosticEntry = slice[0];
    expect(entry.surface).toBe("grading");
    expect(entry.operation).toBe("grade_whole_run");
    expect(entry.label).toBe(GRADING_DIAGNOSTIC_OPERATION_LABELS.grade_whole_run);
    expect(entry.durationMs).toBe(1234);
    expect(entry.outcome).toBe("success");
  });

  it("recordWholeRunSettled records one entry on a started run and none otherwise", () => {
    expect(
      recordWholeRunSettled({ startedAtMs: null, settledAtMs: 10, state: okState(), at: "2026-10-08T10:00:02.000Z" })
    ).toBe(false);
    expect(readSessionDiagnosticLogState().entries.length).toBe(0);
    expect(
      recordWholeRunSettled({ startedAtMs: 0, settledAtMs: 2000, state: errState("denied"), at: "2026-10-08T10:00:03.000Z" })
    ).toBe(true);
    const entries = readSessionDiagnosticSurfaceEntries("grading").entries;
    expect(entries.length).toBe(1);
    expect(entries[0].outcome).toBe("failure");
    expect(entries[0].error).toContain("denied");
    expect(entries[0].durationMs).toBe(2000);
  });
});

function classOf(kind: SubmissionZipClassification["kind"], studentCount: number): SubmissionZipClassification {
  return { kind, studentCount, markerStudentCount: studentCount, signal: "canvas-convention" };
}

describe("decideClassifyDiagnostic (pure)", () => {
  it("maps each kind to its operation and carries the count and duration", () => {
    expect(decideClassifyDiagnostic({ startedAtMs: 100, settledAtMs: 104.4, classification: classOf("class", 23) })).toEqual({
      operation: "classify_submission_class",
      studentCount: 23,
      durationMs: 4,
    });
    expect(decideClassifyDiagnostic({ startedAtMs: 0, settledAtMs: 9, classification: classOf("single", 1) })?.operation).toBe(
      "classify_submission_single"
    );
    expect(decideClassifyDiagnostic({ startedAtMs: 0, settledAtMs: 9, classification: classOf("unknown", 0) })?.operation).toBe(
      "classify_submission_unknown"
    );
  });

  it("returns null with no captured start (the start guard)", () => {
    expect(decideClassifyDiagnostic({ startedAtMs: null, settledAtMs: 9, classification: classOf("class", 3) })).toBeNull();
  });

  it("returns null when no classification streamed", () => {
    expect(decideClassifyDiagnostic({ startedAtMs: 0, settledAtMs: 9, classification: undefined })).toBeNull();
  });

  it("never yields a negative duration", () => {
    expect(decideClassifyDiagnostic({ startedAtMs: 500, settledAtMs: 400, classification: classOf("class", 2) })?.durationMs).toBe(0);
  });

  it("every classify operation has a label", () => {
    expect(GRADING_DIAGNOSTIC_OPERATION_LABELS.classify_submission_class).toBe("Classified: class bundle");
    expect(GRADING_DIAGNOSTIC_OPERATION_LABELS.classify_submission_single).toBe("Classified: single submission");
    expect(GRADING_DIAGNOSTIC_OPERATION_LABELS.classify_submission_unknown).toBe("Classification: undetermined");
  });

  it("the recording one-vs-many operations have labels", () => {
    expect(GRADING_DIAGNOSTIC_OPERATION_LABELS.classify_recording_single).toBe("Classified: single recording");
    expect(GRADING_DIAGNOSTIC_OPERATION_LABELS.classify_recording_multiple).toBe(
      "Classified: multiple submissions in one recording"
    );
  });
});

describe("recordClassifySettled (call shape)", () => {
  it("records one success entry carrying the student count and no names", () => {
    expect(
      recordClassifySettled({ startedAtMs: 0, settledAtMs: 12, classification: classOf("class", 23), at: "2026-10-08T10:00:04.000Z" })
    ).toBe(true);
    const entries = readSessionDiagnosticSurfaceEntries("grading").entries;
    expect(entries.length).toBe(1);
    expect(entries[0].operation).toBe("classify_submission_class");
    expect(entries[0].outcome).toBe("success");
    expect(entries[0].classificationStudentCount).toBe(23);
    expect(entries[0].durationMs).toBe(12);
    expect(entries[0].error).toBe("");
  });

  it("records nothing without a start or a classification", () => {
    expect(recordClassifySettled({ startedAtMs: null, settledAtMs: 1, classification: classOf("class", 3), at: "x" })).toBe(false);
    expect(recordClassifySettled({ startedAtMs: 0, settledAtMs: 1, classification: undefined, at: "x" })).toBe(false);
    expect(readSessionDiagnosticLogState().entries.length).toBe(0);
  });
});

describe("classify-recording diagnostic (RECORDING ONE-VS-MANY W2): counts only, failure distinguishable", () => {
  const multiple = {
    kind: "multiple" as const,
    segments: [
      { startSec: 0, endSec: 50, label: "Alice Smith" },
      { startSec: 50, endSec: 99, label: "Bob Jones" },
    ],
  };

  it("a model-confirmed single records a success single", () => {
    expect(decideClassifyRecordingDiagnostic({ startedAtMs: 0, settledAtMs: 40.4, split: { kind: "single" }, failed: false })).toEqual({
      operation: "classify_recording_single",
      outcome: "success",
      durationMs: 40,
    });
  });

  it("a multiple records the bare segment count", () => {
    expect(decideClassifyRecordingDiagnostic({ startedAtMs: 0, settledAtMs: 10, split: multiple, failed: false })).toEqual({
      operation: "classify_recording_multiple",
      outcome: "success",
      durationMs: 10,
      segmentCount: 2,
    });
  });

  it("failed:true is a FAILURE entry, not a success single", () => {
    const d = decideClassifyRecordingDiagnostic({ startedAtMs: 0, settledAtMs: 10, split: { kind: "single" }, failed: true });
    expect(d?.outcome).toBe("failure");
    expect(d?.error).toBe("Recording classification failed");
  });

  it("returns null with no captured start", () => {
    expect(decideClassifyRecordingDiagnostic({ startedAtMs: null, settledAtMs: 1, split: { kind: "single" }, failed: false })).toBeNull();
  });

  it("the recorded entries carry no segment label or student name", () => {
    expect(recordClassifyRecordingSettled({ startedAtMs: 0, settledAtMs: 5, split: multiple, failed: false, at: "2026-10-08T10:00:05.000Z" })).toBe(true);
    expect(recordClassifyRecordingSettled({ startedAtMs: 0, settledAtMs: 5, split: { kind: "single" }, failed: true, at: "2026-10-08T10:00:06.000Z" })).toBe(true);
    const entries = readSessionDiagnosticSurfaceEntries("grading").entries;
    expect(entries.map((e) => [e.operation, e.outcome, e.classificationStudentCount])).toEqual([
      ["classify_recording_multiple", "success", 2],
      ["classify_recording_single", "failure", undefined],
    ]);
    expect(JSON.stringify(entries)).not.toMatch(/Alice|Bob/);
  });
});
