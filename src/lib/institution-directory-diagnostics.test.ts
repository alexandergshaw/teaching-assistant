import { beforeEach, describe, expect, it, vi } from "vitest";

const recordedEntries = vi.hoisted(() => ({ values: [] as unknown[] }));

vi.mock("./session-diagnostic-log", () => ({
  recordSessionDiagnosticEntry: vi.fn((entry: unknown) => { recordedEntries.values.push(entry); }),
}));

import { buildInstitutionDirectoryDiagnostic, institutionDirectoryDiagnosticReason, recordInstitutionDirectoryDiagnostic, runInstitutionDirectoryRequest } from "./institution-directory-diagnostics";
import { recordSessionDiagnosticEntry } from "./session-diagnostic-log";

describe("institution directory diagnostics", () => {
  beforeEach(() => {
    recordedEntries.values.length = 0;
    vi.mocked(recordSessionDiagnosticEntry).mockImplementation((entry) => { recordedEntries.values.push(entry); });
  });

  it("records only fixed operation, target and outcome tokens", () => {
    const entry = buildInstitutionDirectoryDiagnostic({
      at: "2026-10-17T00:00:00.000Z", operation: "save-value", outcome: "failure", target: "value", reason: "storage",
      metrics: { durationMs: 18.6, institutionCount: 2, columnCount: 3 },
    });
    expect(entry).toEqual({
      at: "2026-10-17T00:00:00.000Z", surface: "courses", operation: "institution_directory_save_value",
      label: "Save institution value", institution: "", course: "", outcome: "failure", error: "",
      durationMs: 19,
      detail: { target: "value", reason: "storage", institutionCount: 2, columnCount: 3 },
    });
    expect(JSON.stringify(entry)).not.toMatch(/WWU|example\.edu|canvas\.|password|secret/i);
  });

  it("records only a fixed destination category for an external-link dispatch", () => {
    const entry = buildInstitutionDirectoryDiagnostic({
      at: "2026-10-17T00:00:00.000Z", operation: "external-open", outcome: "success", target: "lms",
    });
    expect(entry.operation).toBe("institution_directory_external_open");
    expect(entry.detail).toEqual({ target: "lms" });
    expect(JSON.stringify(entry)).not.toMatch(/https|WWU|example/i);
  });

  it("keeps a diagnostic-sink failure from escaping into the user operation", () => {
    vi.mocked(recordSessionDiagnosticEntry).mockImplementation(() => { throw new Error("diagnostic sink unavailable"); });
    expect(() => recordInstitutionDirectoryDiagnostic("create-profile", "success", "profile")).not.toThrow();
  });

  it.each([
    ["missing-email-client-name", "validation"],
    ["missing-lms-name", "validation"],
  ] as const)("classifies %s as %s", (code, expected) => {
    expect(institutionDirectoryDiagnosticReason(code)).toBe(expected);
  });

  it.each([
    ["list", "directory"], ["create-profile", "profile"], ["update-profile", "profile"],
    ["remove-profile", "profile"], ["create-column", "column"], ["rename-column", "column"],
    ["remove-column", "column"], ["save-value", "value"], ["clear-value", "value"],
  ] as const)("records %s transport rejection as a bounded unavailable failure", async (operation, target) => {
    const uiState = { error: "", busy: true };
    const result = await runInstitutionDirectoryRequest({
      operation, target, startedAt: 100, now: () => 138,
      request: async () => { throw new Error("PRIVATE_INSTITUTION private@example.edu https://evil.test/path?secret=PRIVATE PRIVATE_VALUE"); },
      onUnavailable: () => { uiState.error = "A closed failure message."; uiState.busy = false; },
    });
    expect(result).toEqual({ kind: "unavailable" });
    expect(uiState).toEqual({ error: "A closed failure message.", busy: false });
    expect(recordedEntries.values).toHaveLength(1);
    expect(recordedEntries.values[0]).toMatchObject({
      operation: `institution_directory_${operation.replaceAll("-", "_")}`,
      outcome: "failure", durationMs: 38, error: "",
      detail: { target, reason: "unavailable" },
    });
    expect(JSON.stringify(recordedEntries.values)).not.toMatch(/PRIVATE_INSTITUTION|private@example\.edu|evil\.test|PRIVATE_VALUE|secret=PRIVATE/);
  });

  it("preserves ordinary returned action outcomes for the caller", async () => {
    const returned = { ok: false, code: "missing-lms-name" };
    await expect(runInstitutionDirectoryRequest({
      operation: "update-profile", target: "profile", startedAt: 100,
      now: () => 120, request: async () => returned,
    })).resolves.toEqual({ kind: "returned", value: returned });
    expect(recordedEntries.values).toHaveLength(0);
  });
});
