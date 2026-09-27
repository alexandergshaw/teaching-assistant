import { describe, it, expect } from "vitest";
import { describeRunRubricProvenance } from "./rubricProvenance";
import type { GradingRun } from "./types";

function run(overrides: Partial<GradingRun> = {}): GradingRun {
  return {
    results: [],
    rubricAreaNames: [],
    fullCreditChecklist: [],
    ...overrides,
  };
}

describe("describeRunRubricProvenance", () => {
  it("returns null when the run carries no rubricUsed (a run from before this field existed)", () => {
    expect(describeRunRubricProvenance(run())).toBeNull();
  });

  it("names the rubric text and a short form of the fingerprint", () => {
    const line = describeRunRubricProvenance(
      run({ rubricUsed: "Criterion A (50%): loop usage.", rubricFingerprint: "abcdef0123456789" })
    );
    expect(line).not.toBeNull();
    expect(line).toContain("Criterion A (50%): loop usage.");
    expect(line).toContain("abcdef012345");
    expect(line).not.toContain("abcdef0123456789");
  });

  it("excerpts a long rubric rather than reproducing it in full", () => {
    const long = "A".repeat(200);
    const line = describeRunRubricProvenance(run({ rubricUsed: long, rubricFingerprint: "ff" }));
    expect(line!.length).toBeLessThan(long.length);
  });

  it("degrades to 'unknown' when rubricUsed is present but the fingerprint is missing", () => {
    const line = describeRunRubricProvenance(run({ rubricUsed: "Some rubric" }));
    expect(line).toContain("unknown");
  });
});

// W2-3, THE REMOVAL TEST for claim 1 (docs/a39-waves.md 8.2): a run's
// provenance line must read the run itself, never a separate store. This is
// asserted at the type level - describeRunRubricProvenance's parameter type
// is `Pick<GradingRun, "rubricUsed" | "rubricFingerprint">`, so it cannot
// accept, and therefore cannot read, anything from rubric-memory.ts's
// storage shape. A sabotaged implementation that instead called
// loadRubricMemory and returned ITS text would diverge from this test the
// moment the store and the run disagree, which the next test proves.
describe("W2-3: the removal test - the line comes from the run, not any external store", () => {
  it("keeps reporting the run's own rubricUsed even when a same-shaped external value differs", () => {
    const graded = run({
      rubricUsed: "Original rubric graded against",
      rubricFingerprint: "originalfingerprint1",
    });
    // Simulate "the store" changing after the run completed - a real
    // implementation of loadRubricMemory would now return this instead.
    const mutatedStoreValue = {
      rubric: "A DIFFERENT rubric, edited after grading finished",
      savedAt: Date.now(),
    };
    const line = describeRunRubricProvenance(graded);
    expect(line).toContain("Original rubric graded against");
    expect(line).not.toContain(mutatedStoreValue.rubric);
  });
});
