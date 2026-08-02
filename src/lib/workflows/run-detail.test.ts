import { describe, it, expect } from "vitest";
import { joinStepErrorDetail, type StepErrorDetailInput } from "./run-detail";

function step(overrides: Partial<StepErrorDetailInput> = {}): StepErrorDetailInput {
  return {
    index: 0,
    type: "grade-repo",
    status: "error",
    error: "Provide a repository.",
    ...overrides,
  };
}

describe("joinStepErrorDetail", () => {
  it("returns an empty string when nothing failed", () => {
    expect(joinStepErrorDetail([])).toBe("");
    expect(
      joinStepErrorDetail([
        step({ status: "done", error: null }),
        step({ status: "skipped", error: null }),
        step({ status: "disabled", error: null }),
      ])
    ).toBe("");
  });

  it("renders a single failure with no count suffix", () => {
    const detail = joinStepErrorDetail([step({ index: 0, type: "grade-repo", error: "Provide a repository." })]);
    expect(detail).toBe("step 1 grade-repo: Provide a repository.");
  });

  it("collapses all-identical messages into one entry with a count", () => {
    const steps = Array.from({ length: 7 }, () =>
      step({ index: 0, type: "grade-repo", error: "Provide a repository." })
    );
    const detail = joinStepErrorDetail(steps);
    expect(detail).toBe("step 1 grade-repo: Provide a repository. (x7)");
  });

  it("keeps distinct messages separate, each with its own count, ordered by first appearance", () => {
    const steps: StepErrorDetailInput[] = [
      step({ index: 0, type: "grade-repo", error: "Provide a repository." }),
      step({ index: 0, type: "grade-repo", error: "Provide the assignment instructions." }),
      step({ index: 0, type: "grade-repo", error: "Provide a repository." }),
      step({ index: 0, type: "grade-repo", error: "Provide the assignment instructions." }),
      step({ index: 0, type: "grade-repo", error: "Provide a repository." }),
    ];
    const detail = joinStepErrorDetail(steps);
    expect(detail).toBe(
      "step 1 grade-repo: Provide a repository. (x3); step 1 grade-repo: Provide the assignment instructions. (x2)"
    );
  });

  it("includes needs-interaction steps alongside error steps, and ignores done/skipped/disabled", () => {
    const steps: StepErrorDetailInput[] = [
      step({ index: 0, type: "grade-repo", status: "done", error: null }),
      step({ index: 1, type: "post-to-canvas", status: "needs-interaction", error: "Needs review" }),
      step({ index: 2, type: "send-message", status: "skipped", error: null }),
    ];
    const detail = joinStepErrorDetail(steps);
    expect(detail).toBe("step 2 post-to-canvas: Needs review");
  });

  it("falls back to status text when error is null", () => {
    const detail = joinStepErrorDetail([
      step({ index: 3, type: "some-step", status: "needs-interaction", error: null }),
    ]);
    expect(detail).toBe("step 4 some-step: needs-interaction");
  });

  it("preserves order across many distinct entries", () => {
    const steps: StepErrorDetailInput[] = [
      step({ index: 0, type: "a", error: "err-a" }),
      step({ index: 1, type: "b", error: "err-b" }),
      step({ index: 2, type: "c", error: "err-c" }),
    ];
    const detail = joinStepErrorDetail(steps);
    expect(detail).toBe("step 1 a: err-a; step 2 b: err-b; step 3 c: err-c");
  });

  it("truncates on an entry boundary rather than mid-word when over budget", () => {
    const steps: StepErrorDetailInput[] = Array.from({ length: 50 }, (_, i) =>
      step({ index: i, type: "grade-repo", error: `Failure number ${i} with a fairly long descriptive message attached` })
    );
    const detail = joinStepErrorDetail(steps, 200);
    expect(detail.length).toBeLessThanOrEqual(200);
    // The whole trailing "(+N more)" marker must be intact, never cut off.
    expect(detail).toMatch(/\(\+\d+ more\)$/);
    // No entry is sliced mid-word: every "step N type:" prefix that appears
    // is followed by a complete "Failure number ..." message or the omitted
    // marker, never a partial word ending mid-string.
    expect(detail).not.toMatch(/\.\.\.$/);
  });

  it("always includes at least the first entry even if it alone exceeds maxChars", () => {
    const longMessage = "x".repeat(300);
    const detail = joinStepErrorDetail([step({ index: 0, type: "grade-repo", error: longMessage })], 50);
    expect(detail).toBe(`step 1 grade-repo: ${longMessage}`);
  });

  it("defaults maxChars to 500, matching the workflow_run detail column cap", () => {
    const steps: StepErrorDetailInput[] = Array.from({ length: 100 }, (_, i) =>
      step({ index: i, type: "grade-repo", error: `error ${i}` })
    );
    const detail = joinStepErrorDetail(steps);
    expect(detail.length).toBeLessThanOrEqual(500);
  });

  // AC3 (defect-1 write-up, real run 556b49f0): one root failure cascaded
  // into 47 "Skipped - depends on step..." entries that buried it in the
  // Detail line - these prove cascades collapse into a single trailing
  // count and the root failure(s) lead, rather than being interleaved with
  // (or drowned out by) the cascade wall.
  describe("cascade collapsing (AC3)", () => {
    function cascade(index: number, dependsOnIndex: number, dependsOnType: string, reason: "failed" | "disabled" = "failed") {
      return step({
        index,
        type: "some-step",
        error: `Skipped - depends on step ${dependsOnIndex + 1} ("${dependsOnType}"), which ${
          reason === "failed" ? "failed" : "is disabled"
        }.`,
      });
    }

    it("puts the root failure first and collapses every cascade entry into one trailing count", () => {
      const steps: StepErrorDetailInput[] = [
        step({ index: 1, type: "course-schedule-from-source", error: "Failed to fetch" }),
        cascade(2, 1, "course-schedule-from-source"),
        cascade(3, 1, "course-schedule-from-source"),
        cascade(5, 1, "course-schedule-from-source"),
      ];
      const detail = joinStepErrorDetail(steps);
      expect(detail).toBe("step 2 course-schedule-from-source: Failed to fetch; 3 steps skipped as a result");
    });

    it("still dedupes IDENTICAL root entries with a count, same as before, ahead of the cascade count", () => {
      // The real run's shape: the SAME step failing the SAME way in more
      // than one course of a fan-out.
      const steps: StepErrorDetailInput[] = [
        step({ index: 1, type: "course-schedule-from-source", error: "Failed to fetch" }),
        cascade(2, 1, "course-schedule-from-source"),
        step({ index: 1, type: "course-schedule-from-source", error: "Failed to fetch" }),
        cascade(2, 1, "course-schedule-from-source"),
      ];
      const detail = joinStepErrorDetail(steps);
      expect(detail).toBe("step 2 course-schedule-from-source: Failed to fetch (x2); 2 steps skipped as a result");
    });

    it("keeps multiple DISTINCT root causes each on their own line, still ahead of the cascade count", () => {
      // Mirrors the real run: the tile-export "Failed to fetch" bug AND two
      // unrelated LMS errors, all genuine root causes - none of them may be
      // silently dropped just because cascades also occurred.
      const steps: StepErrorDetailInput[] = [
        step({ index: 1, type: "course-schedule-from-source", error: "Failed to fetch" }),
        step({ index: 10, type: "lms-wipe", error: "Could not read a course from that URL." }),
        step({ index: 19, type: "starter-materials", error: "Starter materials failed for every course." }),
        cascade(2, 1, "course-schedule-from-source"),
        cascade(3, 1, "course-schedule-from-source"),
      ];
      const detail = joinStepErrorDetail(steps);
      expect(detail).toBe(
        "step 2 course-schedule-from-source: Failed to fetch; " +
          "step 11 lms-wipe: Could not read a course from that URL.; " +
          "step 20 starter-materials: Starter materials failed for every course.; " +
          "2 steps skipped as a result"
      );
    });

    it("uses singular wording for exactly one cascaded step", () => {
      const steps: StepErrorDetailInput[] = [
        step({ index: 1, type: "course-schedule-from-source", error: "Failed to fetch" }),
        cascade(2, 1, "course-schedule-from-source"),
      ];
      const detail = joinStepErrorDetail(steps);
      expect(detail).toBe("step 2 course-schedule-from-source: Failed to fetch; 1 step skipped as a result");
    });

    it("also collapses a step skipped because its dependency was DISABLED, not just failed", () => {
      const steps: StepErrorDetailInput[] = [
        step({ index: 1, type: "course-schedule-from-source", error: "Failed to fetch" }),
        cascade(2, 1, "course-schedule-from-source", "disabled"),
      ];
      const detail = joinStepErrorDetail(steps);
      expect(detail).toContain("1 step skipped as a result");
    });

    it("produces just the cascade count with no leading root line when every failure is itself a cascade", () => {
      // Only possible when the ROOT is a disabled step (never itself
      // "error"/"needs-interaction", so it never enters `failing`) - a
      // defensive edge case, not the common shape, but must not crash or
      // produce a blank leading "; ".
      const steps: StepErrorDetailInput[] = [cascade(2, 1, "course-schedule-from-source", "disabled")];
      const detail = joinStepErrorDetail(steps);
      expect(detail).toBe("1 step skipped as a result");
    });

    it("does not mistake a genuine step error that merely CONTAINS the cascade wording for a cascade", () => {
      // The cascade prefix must match from the START of the message, not
      // anywhere within it - a real step legitimately reporting on OTHER
      // steps' skip state must still count as a root failure.
      const steps: StepErrorDetailInput[] = [
        step({ index: 4, type: "summary-step", error: "3 dependents were Skipped - depends on step 2, which failed." }),
      ];
      const detail = joinStepErrorDetail(steps);
      expect(detail).toBe(
        "step 5 summary-step: 3 dependents were Skipped - depends on step 2, which failed."
      );
    });
  });
});
