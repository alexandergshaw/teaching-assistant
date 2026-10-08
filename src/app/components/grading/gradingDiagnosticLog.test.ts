import { beforeEach, describe, expect, it } from "vitest";
import {
  readSessionDiagnosticLogState,
  readSessionDiagnosticSurfaceEntries,
  resetSessionDiagnosticLogForTests,
  type SessionDiagnosticEntry,
} from "@/lib/session-diagnostic-log";
import {
  GRADING_DIAGNOSTIC_OPERATION_LABELS,
  decideWholeRunDiagnostic,
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
