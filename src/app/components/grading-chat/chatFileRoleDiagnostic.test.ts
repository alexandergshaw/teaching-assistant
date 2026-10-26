import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordChatFileRoleDiagnostic } from "./chatFileRoleDiagnostic";
import * as grading from "../grading/gradingDiagnosticLog";
import { buildSessionDiagnosticLog, formatSessionDiagnosticLogCsv, formatSessionDiagnosticLogJson, readSessionDiagnosticLogState, resetSessionDiagnosticLogForTests } from "@/lib/session-diagnostic-log";
import type { ChatRoleRow } from "./chatFileRoles";
beforeEach(() => { vi.restoreAllMocks(); resetSessionDiagnosticLogForTests("2026-10-25T00:00:00Z"); });
describe("role diagnostics actual recorder/export chain", () => {
  it("exports closed roles/counts/failures and excludes all filename, setup, source and caller fields", () => {
    vi.spyOn(performance, "now").mockReturnValue(30);
    const rows: ChatRoleRow[] = [{ id: 99, name: "Private Student secret.txt", size: 40, file: new File(["PRIVATE_SETUP"], "private.txt"), role: "instructions", status: "ready", text: "PRIVATE_SETUP" }, { id: 100, name: "https://private.example/secret", size: 5, file: null, role: "submission", status: "failed", error: "RAW_PROVIDER_EXCEPTION" }];
    recordChatFileRoleDiagnostic({ operation: "stage", outcome: "success", startedAtMs: 10, rows });
    recordChatFileRoleDiagnostic({ operation: "confirm", outcome: "failure", startedAtMs: 20, rows, failure: "file-failed" });
    grading.recordGradingDiagnosticEntry({ at: "2026-10-25T00:00:01Z", operation: "stage_file_roles", outcome: "failure", durationMs: 1,
      roleDetail: { files: 2, failedFiles: Infinity, excludedFiles: -1, unresolvedFiles: "RAW_PROVIDER_EXCEPTION", student: "Private Student secret.txt", setup: "PRIVATE_SETUP" } as never });
    const state = readSessionDiagnosticLogState(); expect(state.entries[0]).toMatchObject({ operation: "stage_file_roles", durationMs: 20, detail: { files: 2, assignmentFiles: 1, submissionFiles: 1, failedFiles: 1 } });
    expect(state.entries[1]).toMatchObject({ operation: "confirm_file_roles", durationMs: 10, error: "File role submission failed" }); expect(state.entries[2].detail).toEqual({ files: 2 });
    const log = buildSessionDiagnosticLog(state, { currentInstitution: "", currentCourse: "", currentPage: "/", browser: "test" }, "2026-10-25T00:00:02Z");
    for (const output of [formatSessionDiagnosticLogJson(log), formatSessionDiagnosticLogCsv(log)]) {
      expect(output).toContain("assignmentFiles"); expect(output).toContain("File role submission failed");
      for (const secret of ["Private Student", "PRIVATE_SETUP", "https://private.example", "RAW_PROVIDER_EXCEPTION"]) expect(output).not.toContain(secret);
    }
  });
  it("cannot turn recorder failure into intake failure", () => {
    vi.spyOn(grading, "recordGradingDiagnosticEntry").mockImplementation(() => { throw new Error("private failure"); });
    expect(() => recordChatFileRoleDiagnostic({ operation: "confirm", outcome: "success", startedAtMs: 0, rows: [] })).not.toThrow();
  });
});
