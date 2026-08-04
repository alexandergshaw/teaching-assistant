// A capability can be fully implemented, fully tested, and still do nothing
// in production if its one call site never passes the new arguments. That is
// exactly what happened to the run-log course attribution (docs/REGRESSION.md
// entry 211): finalizeRunDownload grew optional `courseOutcomes` and
// `failureGroups` parameters with 26 passing tests behind them, while
// useWorkflowRun.ts - its only caller - kept calling it without either, so
// every downloaded Run Log still carried the old unattributed text. The unit
// tests were green the entire time, because they tested the function, not the
// wiring.
//
// useWorkflowRun.ts is a React hook and this project's vitest is
// environment:"node" over src/**/*.test.ts with no jsdom and no
// testing-library, so the call site CANNOT be exercised by rendering it. This
// file therefore checks the wiring the only way available here: by reading the
// source as text, the same idiom src/app/components/courses/
// page-module-css-classes.test.ts uses for its stylesheet guard.
//
// It is a narrow structural guard, not a behavioural test, and it is written
// to fail loudly if the argument is dropped again rather than to prove the
// attribution is correct - finalize-run-download.test.ts owns that.

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const HOOK_PATH = join(process.cwd(), "src/app/components/workflows/useWorkflowRun.ts");
const source = readFileSync(HOOK_PATH, "utf8");

/** The single finalizeRunDownload({...}) call's argument object. */
function finalizeRunDownloadCallText(): string {
  const start = source.indexOf("finalizeRunDownload({");
  if (start === -1) return "";
  // Walk braces from the opening "{" so a nested object (buildWorkflowFileName's
  // own argument) cannot terminate the match early.
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return "";
}

describe("useWorkflowRun wires the run-log course attribution", () => {
  // CANARY: if the extractor silently returns "" (the call was renamed, moved,
  // or the brace walk broke), every assertion below would pass vacuously.
  it("the extractor actually finds the call and its argument object", () => {
    const call = finalizeRunDownloadCallText();
    expect(call).not.toBe("");
    expect(call.length).toBeGreaterThan(50);
    // A field that has always been there - proves we are reading the right object.
    expect(call).toContain("combinedFileName");
    expect(call).toContain("workflowRunId");
  });

  it("passes courseOutcomes, so the log can name which courses ran", () => {
    expect(finalizeRunDownloadCallText()).toContain("courseOutcomes");
  });

  it("passes failureGroups, so each failure is attributed to its course", () => {
    expect(finalizeRunDownloadCallText()).toContain("failureGroups");
  });

  it("builds failureGroups per course rather than reusing the flat run-wide list", () => {
    // The whole point is the per-course split. Passing `allErrors` straight
    // through would type-check and produce a log that is still unattributed.
    expect(source).toContain("const failureGroups: CourseFailureGroup[] = []");
    expect(source).toContain("errorsBeforeGroup");
    expect(source).toContain("allErrors.slice(errorsBeforeGroup)");
  });

  it("only records a course's failure group when that course actually failed", () => {
    // An empty group would render a course heading with nothing under it.
    expect(source).toContain("if (groupErrors.length > 0)");
  });
});

// D6: an attended run must persist its run report exactly like a scheduled
// one does. buildAttendedStepHelpers now sets StepRunHelpers.saveRunReport
// (see attended-step-helpers.test.ts, which proves that piece in isolation)
// but that alone does nothing if handleRun never CALLS it - the same
// "implemented but never wired" failure mode this file's own header
// describes for the run-log course attribution. These are narrow structural
// guards (the same source-as-text idiom the rest of this file uses, since
// this hook cannot be rendered here) - reverting the report-save block added
// to handleRun (the `if (helpers.saveRunReport)` block, right after the
// hard-cancel mid-course handling) makes them fail.
describe("useWorkflowRun wires the D6 run report", () => {
  it("calls buildRunReportMarkdown (the same shared function server-runner.ts's post-run stage calls) once the fan-out loop finishes", () => {
    expect(source).toContain("buildRunReportMarkdown(");
  });

  it("guards the save on helpers.saveRunReport being set (never assumes it exists)", () => {
    expect(source).toContain("if (helpers.saveRunReport)");
  });

  it("actually calls helpers.saveRunReport with the built markdown", () => {
    expect(source).toContain("await helpers.saveRunReport(");
  });

  it("accumulates a StepRunOutcome per step (allStepOutcomes) rather than reusing the error-only accumulator", () => {
    expect(source).toContain("allStepOutcomes");
  });

  it("D6: unifies error counting with the four unattended entry points (status === \"error\" || \"needs-interaction\"), not error-only", () => {
    expect(source).toContain('status === "error" || status === "needs-interaction"');
  });
});
