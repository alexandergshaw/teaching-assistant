import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { describeRunRubricProvenance } from "./rubricProvenance";
import { restoreStampedRubricText } from "./rubric-provenance-stamp";
import { saveRubricMemory } from "./rubric-memory";
import type { GradingRun } from "./types";

// Plain strings in, not StampedRubricText - these fixtures are testing
// describeRunRubricProvenance's own reading of the run, not the pin
// (RULING 58), so restoreStampedRubricText is the legitimate way to obtain
// the brand from a literal here (see rubric-provenance-stamp.ts's header).
function run(
  overrides: Partial<Omit<GradingRun, "rubricUsed" | "rubricFingerprint">> & {
    rubricUsed?: string;
    rubricFingerprint?: string;
  } = {}
): GradingRun {
  const { rubricUsed, rubricFingerprint, ...rest } = overrides;
  return {
    results: [],
    rubricAreaNames: [],
    fullCreditChecklist: [],
    ...rest,
    rubricUsed: restoreStampedRubricText(rubricUsed),
    rubricFingerprint: restoreStampedRubricText(rubricFingerprint),
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

// W2-3, THE REMOVAL TEST for claim 1 (docs/a39-waves.md 8.2), rebuilt per
// docs/a39-build-check.md BLOCKER 1 / docs/a39-build-rulings.md RULING 55.
// The original version's "mutated store value" was a dead local literal
// never written to any store, so `not.toContain(...)` was true by
// construction - it could not fail no matter what
// describeRunRubricProvenance did. This version installs the same
// window/localStorage stub rubric-memory.test.ts:33-45 already uses (the
// module returns `{}` under node without it), actually WRITES a different
// rubric into the real store via saveRubricMemory, and only then asserts
// the reported line still matches the run, not the store. A sabotaged
// implementation that called loadRubricMemory and preferred its text would
// now diverge for real, because the store genuinely holds different text.
describe("W2-3: the removal test - the line comes from the run, not any external store", () => {
  class FakeStorage {
    private store = new Map<string, string>();
    getItem(key: string): string | null {
      return this.store.has(key) ? (this.store.get(key) as string) : null;
    }
    setItem(key: string, value: string): void {
      this.store.set(key, value);
    }
    removeItem(key: string): void {
      this.store.delete(key);
    }
    clear(): void {
      this.store.clear();
    }
  }

  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

  beforeEach(() => {
    (globalThis as { window?: unknown }).window = globalThis;
    (globalThis as { localStorage?: unknown }).localStorage = new FakeStorage();
  });

  afterEach(() => {
    if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window?: unknown }).window = originalWindow;

    if (originalLocalStorage === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
  });

  it("keeps reporting the run's own rubricUsed even when the store genuinely holds a different rubric under the matching scope", () => {
    saveRubricMemory("ta-grading-rubric-memory", "upload:report.docx", {
      rubric: "A DIFFERENT rubric, edited after grading finished",
    });

    const graded = run({
      rubricUsed: "Original rubric graded against",
      rubricFingerprint: "originalfingerprint1",
    });
    const line = describeRunRubricProvenance(graded);
    expect(line).toContain("Original rubric graded against");
    expect(line).not.toContain("A DIFFERENT rubric, edited after grading finished");
  });
});
