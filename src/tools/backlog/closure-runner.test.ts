import { describe, it, expect } from "vitest";
import { looksLikeVitestOutput, ranAtLeastOnePassingAssertion, runVerify } from "./closure-runner";

describe("ranAtLeastOnePassingAssertion (pure, in-memory - the B4 mutant kill in miniature)", () => {
  it("is false for the exact DANGEROUS shape measured in Ruling BA-2: exit 0, all skipped", () => {
    const raw = "\n Test Files  1 skipped (1)\n      Tests  18 skipped (18)\n";
    expect(looksLikeVitestOutput(raw)).toBe(true);
    expect(ranAtLeastOnePassingAssertion(raw)).toBe(false);
  });

  it("is true for a normal passing summary", () => {
    const raw = "\n Test Files  1 passed (1)\n      Tests  18 passed (18)\n";
    expect(ranAtLeastOnePassingAssertion(raw)).toBe(true);
  });

  it("is true for a mixed failed|passed summary as long as some passed", () => {
    const raw = "\n Test Files  1 failed (1)\n      Tests  1 failed | 1 passed (2)\n";
    expect(ranAtLeastOnePassingAssertion(raw)).toBe(true);
  });

  it("is false for output with no Tests summary line at all", () => {
    expect(looksLikeVitestOutput("No test files found, exiting with code 1")).toBe(false);
    expect(ranAtLeastOnePassingAssertion("No test files found, exiting with code 1")).toBe(false);
  });
});

// These three exercise the REAL kill control end-to-end: a real npx vitest
// subprocess, no pipe, matching Ruling BA-2's own measurement exactly. Slow
// (each spawns a real vitest run), but this is precisely the mutant the
// whole module exists to kill - a runner that only had the in-memory tests
// above could still be wired to the exit code alone and pass them by
// accident if the regex were checked against the wrong field.
describe("runVerify against real vitest subprocesses (proves the B4 kill control, not just its regex)", () => {
  it(
    "treats a missing test file (exit 1, 'No test files found') as a FAILED verify - the SAFE case",
    () => {
      const result = runVerify("npx vitest run src/does-not-exist.test.ts");
      expect(result.exitCode).toBe(1);
      expect(result.ok).toBe(false);
    },
    30_000
  );

  it(
    "treats a filter matching zero tests in a real file (exit 0, 'Tests 18 skipped (18)') as a FAILED verify - the DANGEROUS case this module exists for",
    () => {
      const result = runVerify('npx vitest run src/lib/no-emojis.test.ts -t "zzNoSuchTestNamezz"');
      expect(result.exitCode).toBe(0);
      expect(result.ok).toBe(false);
      expect(result.reason).toMatch(/zero passed assertions/);
    },
    30_000
  );

  it(
    "treats a real passing run as a PASSED verify - proves the runner does not just always fail",
    () => {
      const result = runVerify("npx vitest run src/lib/no-emojis.test.ts");
      expect(result.exitCode).toBe(0);
      expect(result.ok).toBe(true);
    },
    30_000
  );
});
