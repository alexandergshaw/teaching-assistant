import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import {
  GRADE_FAILURE_CLASSES,
  GradeCallError,
  gradeFailureClassForFinishReason,
  gradeFailureClassForStatus,
  isGradeFailureClass,
} from "./grade-failure";

describe("grade-failure", () => {
  it("pins the closed class list (frozen literal)", () => {
    expect([...GRADE_FAILURE_CLASSES]).toEqual([
      "model rejected request",
      "model quota",
      "model unavailable",
      "model service error",
      "model unreachable",
      "model http other",
      "model cut off",
      "model stopped early",
      "model unparseable",
      "route budget",
      "route error",
      "request refused",
      "transport lost",
      "unclassified",
    ]);
  });

  it("maps statuses by number", () => {
    const table: Array<[number, string]> = [
      [400, "model rejected request"],
      [429, "model quota"],
      [404, "model unavailable"],
      [408, "model service error"],
      [500, "model service error"],
      [503, "model service error"],
      [0, "model unreachable"],
      [401, "model http other"],
      [403, "model http other"],
    ];
    for (const [status, cls] of table) expect(gradeFailureClassForStatus(status)).toBe(cls);
  });

  it("maps finish reasons into two buckets", () => {
    expect(gradeFailureClassForFinishReason("MAX_TOKENS")).toBe("model cut off");
    expect(gradeFailureClassForFinishReason("SAFETY")).toBe("model stopped early");
    expect(gradeFailureClassForFinishReason("RECITATION")).toBe("model stopped early");
  });

  it("GradeCallError carries the class and keeps the message verbatim", () => {
    const err = new GradeCallError("exact text", "model quota", "MAX_TOKENS");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("exact text");
    expect(err.failureClass).toBe("model quota");
    expect(err.finishReason).toBe("MAX_TOKENS");
    expect("finishReason" in new GradeCallError("x", "unclassified")).toBe(false);
  });

  it("isGradeFailureClass accepts members only", () => {
    expect(isGradeFailureClass("model quota")).toBe(true);
    expect(isGradeFailureClass("grade failed")).toBe(false);
    expect(isGradeFailureClass(3)).toBe(false);
  });

  it("P1: the leaf has no import line", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/grade/grade-failure.ts"), "utf8");
    expect(src).not.toMatch(/^\s*import\s/m);
  });
});
