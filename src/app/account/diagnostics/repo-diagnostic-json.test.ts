import { describe, expect, it } from "vitest";
import { buildSessionDiagnosticLog } from "@/lib/session-diagnostic-log";
import { formatRepoDiagnosticExportJson } from "./repo-diagnostic-json";

describe("repository diagnostic JSON export", () => {
  it("retains canonical coverage and summary while disclosing the paused session and target statuses", () => {
    const log = buildSessionDiagnosticLog({ recordingActive: false, recordingStartedAt: "2026-01-01", entries: [], droppedCount: 0, droppedBySurface: {} }, { currentInstitution: "", currentCourse: "", currentPage: "/", browser: "" }, "2026-01-02");
    const targets = { status: "partial", targets: [{ repo: "org/a", url: "https://github.com/org/a", state: "failed" }, { repo: "org/b", url: "https://github.com/org/b", state: "succeeded" }] };
    const manual = { scope: "current-tab", dropped: 0, targets: [] };
    const result = JSON.parse(formatRepoDiagnosticExportJson(log, true, targets, manual));
    expect(result.recordingActive).toBe(false);
    expect(result.sessionLogRequiresReload).toBe(true);
    expect(result.summary.total).toBe(0);
    expect(result.coverage.instrumented.length).toBeGreaterThan(0);
    expect(result.coverage.notInstrumented.length).toBeGreaterThan(0);
    expect(result.repoGradeRecentRunTargets).toEqual(targets);
    expect(result.repoGradeManualAttempts).toEqual(manual);
  });
});
