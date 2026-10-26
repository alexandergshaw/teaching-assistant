import { beforeEach, describe, expect, it, vi } from "vitest";
import * as gradingLog from "../grading/gradingDiagnosticLog";
import { buildSessionDiagnosticLog, formatSessionDiagnosticLogCsv, formatSessionDiagnosticLogJson, readSessionDiagnosticLogState, resetSessionDiagnosticLogForTests } from "@/lib/session-diagnostic-log";
import { recordRepositoryStaging, recordRepositoryBatchResult } from "./chatRepositoryDiagnostic";
import { emptyRepositoryEvidence, stageRepositoryBatch, stageRepositoryBatchResult } from "./chatRepositoryBatch";

beforeEach(() => { vi.restoreAllMocks(); resetSessionDiagnosticLogForTests("2026-10-25T00:00:00.000Z"); });
describe("repository staging diagnostics", () => {
  it("records the actual UI batch-result helper as success for a valid batch after unresolved history", () => {
    const history = stageRepositoryBatch("Alice: https://github.com/a/b", emptyRepositoryEvidence());
    const result = stageRepositoryBatchResult("https://github.com/c/d", history);
    recordRepositoryBatchResult(result, { startedAtMs: 5, settledAtMs: 12, at: "2026-10-25T00:00:01.000Z" });
    expect(result.state.lines.map((line) => line.status)).toEqual(["unresolved", "accepted"]);
    expect(readSessionDiagnosticLogState().entries).toMatchObject([{ operation: "stage_repository_evidence", outcome: "success", error: "", durationMs: 7 }]);
    const log = buildSessionDiagnosticLog(readSessionDiagnosticLogState(), { currentInstitution: "", currentCourse: "", currentPage: "/", browser: "test" }, "2026-10-25T00:00:02.000Z");
    expect(JSON.parse(formatSessionDiagnosticLogJson(log)).entries[0].outcome).toBe("success");
    expect(formatSessionDiagnosticLogCsv(log)).toContain("Stage repository evidence,,,success,,7");
  });
  it("exports the actual recorder chain with fixed outcome, label and duration and no pasted data", () => {
    const secrets = ["Alice Private", "https://github.com/private/secret", "src/private.ts", "secretSourceFragment", "raw provider exception"];
    const result = stageRepositoryBatch(secrets.join("\n"), emptyRepositoryEvidence());
    recordRepositoryStaging({ outcome: result.lines.some((line) => line.status !== "accepted") ? "needs_attention" : "staged", startedAtMs: 10, settledAtMs: 22.4, at: "2026-10-25T00:00:01.000Z" });
    recordRepositoryStaging({ outcome: "staged", startedAtMs: 10, settledAtMs: 13, at: "2026-10-25T00:00:02.000Z" });
    recordRepositoryStaging({ outcome: "refused", startedAtMs: 10, settledAtMs: 11, at: "2026-10-25T00:00:03.000Z" });
    const state = readSessionDiagnosticLogState();
    expect(state.entries.map(({ operation, label, outcome, durationMs, error }) => ({ operation, label, outcome, durationMs, error }))).toEqual([
      { operation: "stage_repository_evidence", label: "Stage repository evidence", outcome: "failure", durationMs: 12, error: "Repository evidence needs attention" },
      { operation: "stage_repository_evidence", label: "Stage repository evidence", outcome: "success", durationMs: 3, error: "" },
      { operation: "stage_repository_evidence", label: "Stage repository evidence", outcome: "failure", durationMs: 1, error: "Repository evidence batch refused" },
    ]);
    expect(state.entries.every((entry) => entry.classificationStudentCount === undefined)).toBe(true);
    const log = buildSessionDiagnosticLog(state, { currentInstitution: "", currentCourse: "", currentPage: "/", browser: "test" }, "2026-10-25T00:00:04.000Z");
    for (const exported of [formatSessionDiagnosticLogJson(log), formatSessionDiagnosticLogCsv(log)]) {
      for (const secret of secrets) expect(exported).not.toContain(secret);
      expect(exported).toContain("Stage repository evidence");
      expect(exported).toContain("Repository evidence needs attention");
    }
    expect(JSON.parse(formatSessionDiagnosticLogJson(log)).entries).toMatchObject(state.entries);
    expect(formatSessionDiagnosticLogJson(log)).toContain('"operation": "stage_repository_evidence"');
    expect(formatSessionDiagnosticLogCsv(log)).toContain('2026-10-25T00:00:01.000Z,Grading,Stage repository evidence,,,failure,Repository evidence needs attention,12,,,,,,');
    expect(formatSessionDiagnosticLogCsv(log)).toContain('2026-10-25T00:00:02.000Z,Grading,Stage repository evidence,,,success,,3,,,,,,');
    expect(formatSessionDiagnosticLogCsv(log)).toContain('2026-10-25T00:00:03.000Z,Grading,Stage repository evidence,,,failure,Repository evidence batch refused,1,,,,,,');
  });
  it("isolates telemetry failure", () => {
    vi.spyOn(gradingLog, "recordGradingDiagnosticEntry").mockImplementation(() => { throw new Error("private provider response"); });
    expect(() => recordRepositoryStaging({ outcome: "staged", startedAtMs: 0, settledAtMs: 1, at: "fixed" })).not.toThrow();
  });
});
