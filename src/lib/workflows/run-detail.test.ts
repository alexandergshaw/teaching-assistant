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
});
