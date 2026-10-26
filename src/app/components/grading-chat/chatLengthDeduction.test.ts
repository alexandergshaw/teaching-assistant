import { beforeEach, describe, expect, it, vi } from "vitest";
import { lengthDeductionThresholdError, parseLengthDeductionThreshold, recordLengthDeductionThresholdChange } from "./chatLengthDeduction";
import * as grading from "../grading/gradingDiagnosticLog";
import { buildSessionDiagnosticLog, formatSessionDiagnosticLogCsv, formatSessionDiagnosticLogJson, readSessionDiagnosticLogState, resetSessionDiagnosticLogForTests } from "@/lib/session-diagnostic-log";
beforeEach(() => { vi.restoreAllMocks(); resetSessionDiagnosticLogForTests("2026-10-25T00:00:00Z"); });
describe("strict length threshold preference", () => {
  it("accepts bounded integers without rounding, clamping or feedback-word-count coercion", () => {
    expect(parseLengthDeductionThreshold("1")).toBe(1); expect(parseLengthDeductionThreshold("25")).toBe(25); expect(parseLengthDeductionThreshold("1000000")).toBe(1_000_000);
    for (const raw of ["", " ", " 25", "0", "-1", "1.5", "1e2", "Infinity", "1000001", "PRIVATE_INPUT"]) expect(parseLengthDeductionThreshold(raw)).toBeNull();
    expect(lengthDeductionThresholdError(true, NaN)).toContain("whole number"); expect(lengthDeductionThresholdError(true, undefined)).toBeNull(); expect(lengthDeductionThresholdError(false, NaN)).toBeNull();
  });
  it("records only meaningful valid numeric changes through actual JSON and CSV", () => {
    recordLengthDeductionThresholdChange("1", "25"); recordLengthDeductionThresholdChange("25", "25"); recordLengthDeductionThresholdChange("25", "PRIVATE_INPUT"); recordLengthDeductionThresholdChange("PRIVATE_INPUT", "1");
    grading.recordGradingDiagnosticEntry({ at: "2026-10-25T00:00:01Z", operation: "change_length_deduction_threshold", outcome: "success", durationMs: 0,
      lengthPolicyDetail: { thresholdWords: 25, raw: "PRIVATE_INPUT", student: "PRIVATE_STUDENT", rubric: "PRIVATE_RUBRIC" } as never });
    grading.recordGradingDiagnosticEntry({ at: "2026-10-25T00:00:01Z", operation: "change_length_deduction_threshold", outcome: "success", durationMs: 0, lengthPolicyDetail: { thresholdWords: 1.5 } });
    const state = readSessionDiagnosticLogState(); expect(state.entries.map((entry) => entry.detail)).toEqual([{ thresholdWords: 25 }, { thresholdWords: 1 }, { thresholdWords: 25 }, undefined]);
    const log = buildSessionDiagnosticLog(state, { currentInstitution: "", currentCourse: "", currentPage: "/", browser: "test" }, "2026-10-25T00:00:02Z");
    for (const output of [formatSessionDiagnosticLogJson(log), formatSessionDiagnosticLogCsv(log)]) {
      expect(output).toContain("thresholdWords"); expect(output).toContain("Change length deduction threshold"); for (const secret of ["PRIVATE_INPUT", "PRIVATE_STUDENT", "PRIVATE_RUBRIC"]) expect(output).not.toContain(secret);
    }
  });
  it("isolates diagnostic failures from settings", () => {
    vi.spyOn(grading, "recordGradingDiagnosticEntry").mockImplementation(() => { throw new Error("private failure"); }); expect(() => recordLengthDeductionThresholdChange("1", "25")).not.toThrow();
  });
});
