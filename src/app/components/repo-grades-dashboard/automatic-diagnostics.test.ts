import { beforeEach, describe, expect, it } from "vitest";
import { readSessionDiagnosticLogState, resetSessionDiagnosticLogForTests } from "@/lib/session-diagnostic-log";
import { recordRepoGradesStartup } from "./startup-diagnostics";

describe("automatic repo grading control diagnostics", () => {
  beforeEach(() => resetSessionDiagnosticLogForTests("2026-11-06T12:00:00.000Z"));

  it.each([
    ["background_preference", "success"],
    ["background_schedule", "success"],
    ["background_start", "unchanged"],
    ["background_stop", "unavailable"],
    ["background_retry", "failed"],
    ["background_recovery", "success"],
  ] as const)("records %s with a fixed outcome and no identifiers or payloads", (operation, outcome) => {
    recordRepoGradesStartup(operation, outcome, performance.now());
    const label = `repo_grades_startup_${operation}`;
    expect(readSessionDiagnosticLogState().entries).toEqual([{
      at: expect.any(String), surface: "grading", operation: label, label, course: "", institution: "", error: "",
      durationMs: expect.any(Number), outcome: outcome === "success" ? "success" : "failure",
      ...(outcome === "success" ? {} : { cause: outcome }),
    }]);
  });
});
