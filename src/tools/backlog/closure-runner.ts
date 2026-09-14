// Runs one item's `verify` command and decides done vs not-done. This is
// where Blocker B4 lives (backlog-automation.md section 4 / Ruling BA-2),
// measured directly in this repo without a pipeline (a pipe makes `$?`
// report the pipe's exit, not the command's):
//
//   npx vitest run src/does-not-exist.test.ts
//     -> exit 1   "No test files found, exiting with code 1"   SAFE
//
//   npx vitest run src/lib/no-emojis.test.ts -t "zzNoSuchTestNamezz"
//     -> exit 0   "Tests  18 skipped (18)"                     DANGEROUS
//
// The second case is the trap: a filter that selects a real file and skips
// every test in it exits 0, and the word "failed" appears nowhere. Checking
// the exit code alone would close the item having asserted nothing. So this
// runner additionally requires, whenever the output is shaped like a vitest
// summary, that at least one test actually PASSED - "all skipped" fails, the
// same as "all failed".

import { spawnSync } from "node:child_process";

export interface VerifyResult {
  ok: boolean;
  reason: string;
  exitCode: number | null;
  raw: string;
}

// Matches vitest's own summary line, e.g. "Tests  18 skipped (18)" or
// "Tests  1 failed | 1 passed (2)". Captured group 1 is everything between
// "Tests" and the trailing "(N)" total.
const TESTS_SUMMARY_RE = /Tests\s+([^\n\r]+?)\s*\(\d+\)/;

export function looksLikeVitestOutput(raw: string): boolean {
  return TESTS_SUMMARY_RE.test(raw);
}

/** True only if the vitest summary line reports a nonzero "N passed" count. "18 skipped (18)" has no "passed" segment at all, so this is false for exactly the B4 shape. */
export function ranAtLeastOnePassingAssertion(raw: string): boolean {
  const m = raw.match(TESTS_SUMMARY_RE);
  if (!m) return false;
  const passedMatch = m[1].match(/(\d+)\s+passed/);
  return passedMatch !== null && Number(passedMatch[1]) > 0;
}

/** Runs `command` with no shell pipe (spawnSync's own exit code is the command's, never a pipeline's) and applies the B4 kill control on top of the exit code. */
export function runVerify(command: string): VerifyResult {
  const result = spawnSync(command, { shell: true, encoding: "utf-8" });
  const raw = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const exitCode = result.status;

  if (exitCode !== 0) {
    return { ok: false, reason: `command exited ${String(exitCode)}`, exitCode, raw };
  }
  if (looksLikeVitestOutput(raw) && !ranAtLeastOnePassingAssertion(raw)) {
    return {
      ok: false,
      reason:
        "exit 0, but the test summary reports zero passed assertions (all skipped, or none ran) - " +
        "treated as a FAILED verify per Ruling BA-2 / Blocker B4",
      exitCode,
      raw,
    };
  }
  return { ok: true, reason: "exit 0 with at least one assertion run", exitCode, raw };
}

/**
 * Proves a `verify` command CAN fail, per Ruling BA-2: "no item gets a
 * `verify` command that has not been proven able to FAIL." Runs the command
 * once under a name known not to exist (the same shape as the measured
 * DANGEROUS case above, generalised) and requires runVerify to report
 * ok:false. This is the mechanism `next`/`wave` would need before ever
 * trusting a newly-authored `verify` - not currently called by any migrated
 * item, since none of them carries a `verify` command yet (Ruling BA-2
 * forbids fabricating one).
 */
export function provenAbleToFail(command: string, knownAbsentFilter: string): VerifyResult {
  return runVerify(`${command} -t "${knownAbsentFilter}"`);
}
