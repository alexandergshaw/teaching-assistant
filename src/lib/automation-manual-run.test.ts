import { describe, it, expect } from "vitest";
import {
  assembleManualRunInput,
  manualRunEligibility,
  describeManualRunOutcome,
  type ManualRunSource,
} from "./automation-manual-run";

function makeSource(overrides: Partial<ManualRunSource> = {}): ManualRunSource {
  return {
    id: "s1",
    workflowId: "w1",
    workflowName: "Weekly Announcement",
    fieldValues: { course: "CS101" },
    disabledSteps: [2],
    courseId: "course-1",
    institution: "ACME",
    ...overrides,
  };
}

describe("assembleManualRunInput", () => {
  it("carries the source's own fieldValues, disabled steps, course, and institution through unchanged", () => {
    const source = makeSource();
    const input = assembleManualRunInput(source);
    expect(input.fieldValues).toEqual({ course: "CS101" });
    expect(Array.from(input.disabledTopIndices)).toEqual([2]);
    expect(input.institution).toBe("ACME");
    expect(input.courseId).toBe("course-1");
  });

  it("never runs a blank input - an empty snapshot stays empty, not defaulted", () => {
    const source = makeSource({ fieldValues: {}, disabledSteps: [], courseId: null, institution: null });
    const input = assembleManualRunInput(source);
    expect(input.fieldValues).toEqual({});
    expect(input.disabledTopIndices.size).toBe(0);
    expect(input.institution).toBeNull();
    expect(input.courseId).toBeNull();
  });

  it("returns a copy - mutating the result never touches the source's own objects", () => {
    const source = makeSource();
    const input = assembleManualRunInput(source);
    input.fieldValues.course = "MUTATED";
    input.disabledTopIndices.add(99);
    expect(source.fieldValues.course).toBe("CS101");
    expect(source.disabledSteps).toEqual([2]);
  });

  it("converts the disabled-steps array into a Set (duplicates collapse)", () => {
    const source = makeSource({ disabledSteps: [1, 1, 3] });
    const input = assembleManualRunInput(source);
    expect(Array.from(input.disabledTopIndices).sort()).toEqual([1, 3]);
  });
});

describe("manualRunEligibility", () => {
  it("is eligible when the workflow exists and is headless-safe", () => {
    expect(manualRunEligibility({ workflowExists: true, isHeadlessSafe: true })).toEqual({
      eligible: true,
      reason: null,
    });
  });

  it("is ineligible with a reason when the workflow no longer exists", () => {
    const result = manualRunEligibility({ workflowExists: false, isHeadlessSafe: true });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/no longer exists/);
  });

  it("is ineligible with a reason when the workflow is not headless-safe, even if it exists", () => {
    const result = manualRunEligibility({ workflowExists: true, isHeadlessSafe: false });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/cannot be run this way/);
  });

  it("a missing workflow takes precedence over the headless-safety reason", () => {
    const result = manualRunEligibility({ workflowExists: false, isHeadlessSafe: false });
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/no longer exists/);
  });
});

describe("describeManualRunOutcome", () => {
  it("reports ok for a fully successful run", () => {
    const result = describeManualRunOutcome({ ok: true, steps: [] });
    expect(result).toEqual({ ok: true, status: "ok", message: "Ran successfully." });
  });

  it("never reports success for a run that errored - status/ok always agree with the outcome", () => {
    const result = describeManualRunOutcome({
      ok: false,
      steps: [{ index: 0, type: "draft-announcement", status: "error", error: "LLM call failed" }],
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("error");
    expect(result.message).toContain("draft-announcement");
    expect(result.message).toContain("LLM call failed");
  });

  it("falls back to a generic message when a failed run has no error detail to join", () => {
    const result = describeManualRunOutcome({ ok: false, steps: [] });
    expect(result).toEqual({ ok: false, status: "error", message: "The run failed." });
  });

  it("reports a truncated fan-out as an honest partial skip, not a success", () => {
    const result = describeManualRunOutcome({ ok: true, steps: [], fanout: { truncated: true } });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("skipped");
    expect(result.message).toMatch(/time budget/);
  });

  it("a non-truncated fan-out is judged purely by outcome.ok, same as a non-fan-out run", () => {
    const result = describeManualRunOutcome({ ok: true, steps: [], fanout: { truncated: false } });
    expect(result).toEqual({ ok: true, status: "ok", message: "Ran successfully." });
  });
});
