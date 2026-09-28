// A39 incremental-fill W5 (docs/a39-fill-waves.md, RES-P-4; docs/a39-
// incremental-fill-architecture.md section 7.2, F12): describeRunProgress and
// shouldShowEmptyState were split out of incrementalRunPlan.ts (and its own
// test file) because that file exceeded its -le 300 bound at this wave's
// gate - not a speculative extraction, the exact one the design names for
// that case.
import { describe, it, expect } from "vitest";
import { describeRunProgress, shouldShowEmptyState } from "./runProgressCopy";
import type { IncrementalPhase } from "./incrementalRunPlan";
import type { GradeResult, GradingRun } from "@/lib/grade/types";

const ALL_PHASES: IncrementalPhase[] = ["idle", "running", "stopping", "stopped", "complete", "refused"];

function gradedRow(student: string, areas: string[]): GradeResult {
  return {
    student,
    overallComment: "",
    strengths: "",
    improvements: "",
    resubmitNotice: "",
    rubricAreas: areas.map((area) => ({ area, score: "8/10", comment: "" })),
    totalScore: "",
    feedback: "",
    mergedFileCount: 1,
    submittedFiles: [],
  };
}

describe("describeRunProgress: total over all six phases", () => {
  it("running: today's unchanged sentence", () => {
    expect(describeRunProgress("running", 3, 10)).toBe("3 of 10 submissions graded.");
  });

  it("stopping: names what is still finishing", () => {
    expect(describeRunProgress("stopping", 3, 10)).toBe(
      "Stopping. 3 of 10 submissions graded; finishing the ones already in progress."
    );
  });

  it("stopped: the terminal sentence", () => {
    expect(describeRunProgress("stopped", 3, 10)).toBe(
      "Stopped. 3 of 10 submissions were graded; the rest were not started."
    );
  });

  it("complete, idle and refused all need no line", () => {
    expect(describeRunProgress("complete", 10, 10)).toBeNull();
    expect(describeRunProgress("idle", 0, 0)).toBeNull();
    expect(describeRunProgress("refused", 0, 0)).toBeNull();
  });
});

describe("shouldShowEmptyState (F12): total over all six phases - stopped and refused now specified", () => {
  const zeroRun: GradingRun = { results: [], rubricAreaNames: [], fullCreditChecklist: [] };
  const nonEmptyRun: GradingRun = {
    results: [gradedRow("Alice", ["Clarity"])],
    rubricAreaNames: ["Clarity"],
    fullCreditChecklist: [],
  };

  it("false for every phase when the run is null", () => {
    for (const phase of ALL_PHASES) expect(shouldShowEmptyState(phase, null)).toBe(false);
  });

  it("false for running, stopping and stopped, regardless of the run's row count - that state has its own sentence", () => {
    for (const phase of ["running", "stopping", "stopped"] as const) {
      expect(shouldShowEmptyState(phase, zeroRun)).toBe(false);
      expect(shouldShowEmptyState(phase, nonEmptyRun)).toBe(false);
    }
  });

  it("true only for idle/complete with a non-null, zero-result run", () => {
    expect(shouldShowEmptyState("idle", zeroRun)).toBe(true);
    expect(shouldShowEmptyState("complete", zeroRun)).toBe(true);
    expect(shouldShowEmptyState("idle", nonEmptyRun)).toBe(false);
    expect(shouldShowEmptyState("complete", nonEmptyRun)).toBe(false);
  });

  it("false for refused (its run is always null, so the null clause already covers it)", () => {
    expect(shouldShowEmptyState("refused", zeroRun)).toBe(false);
  });

  it("WATCHED: `run !== null && run.results.length === 0` (no phase check) would show the sentence mid-run and mid-stop", () => {
    expect(shouldShowEmptyState("running", zeroRun)).not.toBe(true);
    expect(shouldShowEmptyState("stopped", zeroRun)).not.toBe(true);
  });

  it("WATCHED: returning false for complete too would hide the genuine empty-zip sentence", () => {
    expect(shouldShowEmptyState("complete", zeroRun)).not.toBe(false);
  });
});
