// docs/a38-acceptance-criteria.md AC-1/AC-3/AC-8; docs/a38-scope.md section
// 4.6 "The thin hook composes them". useGradingRowGrade.ts is a hook - this
// repo's vitest is `environment: "node"` and drives no hook (no
// `renderHook`, no `@testing-library/react`), so the MACHINE assertions for
// AC-1/AC-3/AC-8 live in grading-dispatch.test.ts / grade-lock.test.ts,
// against the real pure units, never here. This file is READING/wiring
// only: it pins, by source text, that the hook actually COMPOSES those
// units the way the pure-unit tests assume it does - a hook that passed
// every pure-unit test but silently called a different function, or sent
// `rawRows` instead of a one-element literal, would go undetected without
// this file.
//
// Fact/ordering pins only (source-text-tests-overspecify): this checks that
// the right functions are called, in the right order relative to the
// await, never the exact spelling of an unrelated line.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SOURCE = fs.readFileSync(
  path.resolve(process.cwd(), "src/app/components/grading-recording/useGradingRowGrade.ts"),
  "utf-8"
);

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

const STRIPPED = stripComments(SOURCE);

describe("useGradingRowGrade.ts composes the pure units (reading only - no hook is driven)", () => {
  it("holds ONE stable lock instance via a lazy useState initializer + createGradeLock, and RETURNS it (so handleGradeAll can share the same instance)", () => {
    expect(STRIPPED).toMatch(/const \[lock\] = useState<GradeLock>\(\(\) => createGradeLock\(\)\);/);
    expect(STRIPPED).toMatch(/return \{ lock, rowError, gradeRow \};/);
  });

  it("calls checkGradingReadiness with rowCount = 1 - this row's own readiness, never the whole table's", () => {
    expect(STRIPPED).toMatch(/checkGradingReadiness\(rubricText, 1\)/);
  });

  it("the readiness refusal returns BEFORE lock.acquire() is ever reached - a refused press never touches the lock", () => {
    const readinessIdx = STRIPPED.indexOf("checkGradingReadiness(rubricText, 1)");
    const acquireIdx = STRIPPED.indexOf("lock.acquire()");
    expect(readinessIdx).toBeGreaterThan(-1);
    expect(acquireIdx).toBeGreaterThan(-1);
    expect(readinessIdx).toBeLessThan(acquireIdx);
  });

  it("acquire() is checked with an early return - a refused acquire never proceeds to dispatch", () => {
    expect(STRIPPED).toMatch(/if \(!lock\.acquire\(\)\) return;/);
  });

  it("sends exactly gradeCapturedSubmissionsAction([buildSingleSubmission(row)], ...) - a one-element array literal, never rawRows or gradingRows.rawRows", () => {
    expect(STRIPPED).toMatch(/gradeCapturedSubmissionsAction\(\s*\[buildSingleSubmission\(row\)\]\s*,/);
    expect(STRIPPED).not.toMatch(/gradeCapturedSubmissionsAction\(\s*rawRows/);
    expect(STRIPPED).not.toMatch(/gradeCapturedSubmissionsAction\(\s*gradingRows\.rawRows/);
  });

  it("markRowState(id, \"grading\") is written BEFORE the gradeCapturedSubmissionsAction await - the dispatch write happens pre-await, not post-result", () => {
    const dispatchIdx = STRIPPED.indexOf('markRowState(id, "grading")');
    const awaitIdx = STRIPPED.indexOf("await gradeCapturedSubmissionsAction");
    expect(dispatchIdx).toBeGreaterThan(-1);
    expect(awaitIdx).toBeGreaterThan(-1);
    expect(dispatchIdx).toBeLessThan(awaitIdx);
  });

  it("captures the row's PRIOR state before dispatch, and restores it (not some other row's) via markRowState on both the error-result and thrown-exception paths", () => {
    expect(STRIPPED).toMatch(/const prior = row\.state;/);
    // Two restore sites: the "error" in result branch and the catch branch.
    const restoreCount = (STRIPPED.match(/markRowState\(id, prior\)/g) ?? []).length;
    expect(restoreCount).toBe(2);
  });

  it("on success, routes result.results[0] through classifyGradingResult into applyGradingResult - the SAME reuse handleGradeAll's own success path makes", () => {
    expect(STRIPPED).toMatch(/const \[first\] = result\.results;/);
    // A38 wave 2 (AC-6): classifyGradingResult now takes the CURRENT
    // rubric's digest as a second argument (gradedRubricDigestOf(rubricText)),
    // so the pin allows any second argument rather than requiring none.
    expect(STRIPPED).toMatch(/applyGradingResult\(id, classifyGradingResult\(first,\s*gradedRubricDigestOf\(rubricText\)\)\)/);
  });

  it("lock.release() runs in a finally block - always runs, whichever branch returned", () => {
    expect(STRIPPED).toMatch(/finally\s*\{\s*[\s\S]*?lock\.release\(\);/);
  });

  it("gradeRow looks the row up in rawRows by id and returns early when it is gone - no crash on a removed row", () => {
    expect(STRIPPED).toMatch(/const row = rawRows\.find\(\(r\) => r\.id === id\);/);
    expect(STRIPPED).toMatch(/if \(!row\) return;/);
  });
});
