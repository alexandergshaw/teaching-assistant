import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decidePostOneClick, isRowArmed, postOneRowSignature, postOneSignature } from "./postOneArming";

const sig = postOneSignature("90", "good");

describe("decidePostOneClick", () => {
  it("first click on an unarmed first-post row arms", () => {
    expect(decidePostOneClick({ status: undefined, armed: null, student: "A", signature: sig })).toBe("arm");
    expect(decidePostOneClick({ status: "idle", armed: null, student: "A", signature: sig })).toBe("arm");
    expect(decidePostOneClick({ status: "skipped", armed: null, student: "A", signature: sig })).toBe("arm");
  });
  it("second click on the armed row posts", () => {
    const armed = { student: "A", signature: sig };
    expect(decidePostOneClick({ status: undefined, armed, student: "A", signature: sig })).toBe("post");
  });
  it("arming another row does not arm this one", () => {
    const armed = { student: "B", signature: sig };
    expect(isRowArmed(armed, "A", sig)).toBe(false);
    expect(decidePostOneClick({ status: undefined, armed, student: "A", signature: sig })).toBe("arm");
  });
  it("an edit after arming disarms", () => {
    const armed = { student: "A", signature: sig };
    const edited = postOneSignature("80", "good");
    expect(decidePostOneClick({ status: undefined, armed, student: "A", signature: edited })).toBe("arm");
  });
  it("an area-score edit that keeps the total constant disarms", () => {
    const row = { rubricAreas: [{ area: "A", score: "5" }, { area: "B", score: "5" }] };
    const before = postOneRowSignature(row, { total: "10", overall: "ok", areas: {} });
    const after = postOneRowSignature(row, { total: "10", overall: "ok", areas: { A: { score: "6" }, B: { score: "4" } } });
    expect(after).not.toBe(before);
    const armed = { student: "A", signature: before };
    expect(decidePostOneClick({ status: undefined, armed, student: "A", signature: before })).toBe("post");
    expect(decidePostOneClick({ status: undefined, armed, student: "A", signature: after })).toBe("arm");
  });
  it("retry after error and re-post after success stay one click", () => {
    expect(decidePostOneClick({ status: "error", armed: null, student: "A", signature: sig })).toBe("post");
    expect(decidePostOneClick({ status: "posted", armed: null, student: "A", signature: sig })).toBe("post");
  });
});

describe("GradingResults handlePostOne wiring", () => {
  const src = readFileSync(join(__dirname, "..", "GradingResults.tsx"), "utf8");
  const start = src.indexOf("const handlePostOne = async");
  const end = src.indexOf("const handleRunCode", start);
  const body = src.slice(start, end);

  it("the arm decision precedes the gradebook write and returns before it", () => {
    const decide = body.indexOf("decidePostOneClick(");
    const arm = body.indexOf("setArmedPostOne({");
    const write = body.indexOf("postCanvasGradesAction(");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(decide).toBeGreaterThan(-1);
    expect(arm).toBeGreaterThan(decide);
    expect(write).toBeGreaterThan(arm);
    expect(body).toMatch(/if \(decision === "arm"\) \{\s*setArmedPostOne\(\{[^}]*\}\);\s*return;\s*\}/);
  });

  it("the decision is derived from decidePostOneClick with the real inputs", () => {
    expect(body).toMatch(
      /const decision = decidePostOneClick\(\{\s*status: postStatus\[row\.student\]\?\.status,\s*armed: armedPostOne,\s*student: row\.student,\s*signature,?\s*\}\)/,
    );
    expect(body).toContain("const signature = postOneRowSignature(row, edit);");
    expect(src).toContain("postOneRowSignature(result, edit)");
  });

  it("the A13 postability guard still precedes the write", () => {
    const check = body.indexOf("checkRowPostability(");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(body.indexOf("postCanvasGradesAction("));
  });

  it("the bulk path does not use the per-row arm", () => {
    expect(src.slice(0, start)).not.toContain("decidePostOneClick(");
  });
});
