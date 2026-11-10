import { beforeEach, describe, expect, it } from "vitest";
import { readSessionDiagnosticLogState, resetSessionDiagnosticLogForTests } from "@/lib/session-diagnostic-log";
import { backgroundDiagnosticDetail, recordRepoGradesStartup } from "./startup-diagnostics";
import type { AutomaticRepoGradeRun } from "@/lib/repo-grades-dashboard/automatic-status";

it("aggregates fixed status counts without retaining identities or reason text", () => {
  const run = { courses: [{ courseId: "private-course", label: "private-name", state: "partial", reason: "private-reason", counts: [{ state: "blocked", count: 2, reason: "private-repo" }, { state: "unknown", count: 1, reason: null }, { state: "running", count: 3, reason: null }] }] } as AutomaticRepoGradeRun;
  const detail = backgroundDiagnosticDetail(run);
  expect(detail).toMatchObject({ courseCount: 1, partialCourses: 1, blockedTargets: 2, unknownTargets: 1, runningTargets: 3 });
  expect(JSON.stringify(detail)).not.toContain("private");
});

describe("automatic repo grading control diagnostics", () => {
  beforeEach(() => resetSessionDiagnosticLogForTests("2026-11-06T12:00:00.000Z"));

  it.each([
    ["background_preference", "success"],
    ["background_schedule", "success"],
    ["background_schedule", "unavailable"],
    ["background_start", "unchanged"],
    ["background_stop", "unavailable"],
    ["background_retry", "failed"],
    ["background_recovery", "success"],
    ["background_github_retry", "success"],
    ["background_github_cooldown", "blocked"],
    ["background_class_queue", "success"],
    ["background_class_queue", "unavailable"],
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
