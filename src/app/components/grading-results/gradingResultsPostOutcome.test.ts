// B1 (ux-audit-grading.md): a row read "Posted to Canvas" for a student
// whose grade never reached Canvas - postCanvasGradesAction's `skipped`
// array (a blank grade AND blank comment - Canvas was never called) was
// silently treated as a success by GradingResults.tsx's old inline "absent
// from failures" logic. fanOutGradingPostResult (gradingResultsHelpers.ts)
// is the pure decision that replaced it; a skipped student must never be
// counted as posted.
//
// Split into its own file (rather than living inside
// gradingResultsHelpers.test.ts, where the rest of that module's tests
// already sit) purely to stay under the repo's 1000-line-per-file ceiling
// (docs/DEV_LOOP.md) - gradingResultsHelpers.test.ts was already close to
// it before this feature.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fanOutGradingPostResult } from "./gradingResultsHelpers";

describe("fanOutGradingPostResult - B1: a skipped student is never counted as posted", () => {
  const attempted = [
    { student: "Alvarez", userId: 1 },
    { student: "Chen", userId: 2 },
    { student: "Okafor", userId: 3 },
  ];

  it("a userId in `skipped` is reported as skipped, not posted - the exact B1 defect", () => {
    const fanout = fanOutGradingPostResult(attempted, {
      failures: [],
      skipped: [{ userId: 2, reason: "No grade or comment to send for this student." }],
    });
    expect(fanout).toEqual({
      Alvarez: { status: "posted" },
      Chen: { status: "skipped", message: "No grade or comment to send for this student." },
      Okafor: { status: "posted" },
    });
    // The direct assertion the audit asked for: count how many are marked
    // "posted" and confirm the skipped student is not among them.
    expect(Object.values(fanout).filter((f) => f.status === "posted")).toHaveLength(2);
    expect(fanout.Chen.status).not.toBe("posted");
  });

  it("a userId in `failures` takes priority over a skip for the same userId (defensive - mutually exclusive on the real payload)", () => {
    const fanout = fanOutGradingPostResult(attempted, {
      failures: [{ userId: 2, error: "HTTP 500." }],
      skipped: [{ userId: 2, reason: "No grade or comment to send." }],
    });
    expect(fanout.Chen).toEqual({ status: "error", message: "HTTP 500." });
  });

  it("no failures and no skips marks every attempted student posted", () => {
    const fanout = fanOutGradingPostResult(attempted, { failures: [], skipped: [] });
    expect(Object.values(fanout).every((f) => f.status === "posted")).toBe(true);
  });

  it("a row with no numeric userId is never reported (mirrors GradingResults.tsx's own gradableResults filter)", () => {
    const fanout = fanOutGradingPostResult([{ student: "NoId", userId: undefined }], {
      failures: [],
      skipped: [],
    });
    expect(fanout).toEqual({});
  });

  it("only rows actually in `attempted` are reported - a skip for a userId outside this batch is ignored", () => {
    const fanout = fanOutGradingPostResult(attempted, {
      failures: [],
      skipped: [{ userId: 999, reason: "unrelated" }],
    });
    expect(Object.keys(fanout)).toEqual(["Alvarez", "Chen", "Okafor"]);
    expect(Object.values(fanout).every((f) => f.status === "posted")).toBe(true);
  });

  // SABOTAGE-CHECK ANCHOR: temporarily deleting the `skipReason !== undefined`
  // branch (falling straight through to "posted" the instant a userId is not
  // in `failures` - the exact pre-fix behaviour) was verified to make "a
  // userId in `skipped` is reported as skipped, not posted" FAIL - Chen came
  // back "posted" instead of "skipped". Reverted after confirming the
  // failure; see the implementer's final report for the full log.
});

describe("GradingResults.tsx wires both post paths through fanOutGradingPostResult (B1)", () => {
  function readStrippedSource(): string {
    return readFileSync(fileURLToPath(new URL("../GradingResults.tsx", import.meta.url)), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  }

  it("handlePostGrades (the bulk post) calls fanOutGradingPostResult, not a hand-rolled failedByStudent-only map", () => {
    const source = readStrippedSource();
    const defIdx = source.indexOf("const handlePostGrades");
    expect(defIdx).toBeGreaterThan(-1);
    const nextFnIdx = source.indexOf("useImperativeHandle", defIdx);
    const body = source.slice(defIdx, nextFnIdx > -1 ? nextFnIdx : source.length);
    expect(body).toContain("fanOutGradingPostResult(gradableResults, result)");
  });

  it("handlePostOne (the single-row post) calls fanOutGradingPostResult too", () => {
    const source = readStrippedSource();
    const defIdx = source.indexOf("const handlePostOne = async");
    expect(defIdx).toBeGreaterThan(-1);
    const body = source.slice(defIdx, defIdx + 1200);
    expect(body).toContain("fanOutGradingPostResult([row], res)");
  });
});
