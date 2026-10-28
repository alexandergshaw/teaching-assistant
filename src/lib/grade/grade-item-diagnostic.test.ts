import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import {
  GRADE_ITEM_DIAGNOSTIC_KEYS,
  buildGradeItemDiagnostic,
  createGradeCallSink,
  type GradeItemDiagnosticInput,
} from "./grade-item-diagnostic";

describe("buildGradeItemDiagnostic", () => {
  it("sums calls and projects the whitelist", () => {
    const input: GradeItemDiagnosticInput = {
      serverMs: 4200.6,
      prepMs: 100,
      gradeMs: 4000,
      model: "gemini-3.1-flash-lite",
      calls: [
        { promptTokens: 100, outputTokens: 10, elapsedMs: 1000, finishReason: "STOP" },
        { promptTokens: 50, outputTokens: 5, elapsedMs: 500, finishReason: "MAX_TOKENS" },
      ],
      failure: "model cut off",
    };
    expect(buildGradeItemDiagnostic(input)).toEqual({
      serverMs: 4201,
      prepMs: 100,
      gradeMs: 4000,
      modelMs: 1500,
      model: "gemini-3.1-flash-lite",
      passes: 2,
      promptTokens: 150,
      outputTokens: 15,
      finishReason: "max_tokens",
      failure: "model cut off",
    });
  });

  it("omits absent and invalid values instead of writing 0", () => {
    const d = buildGradeItemDiagnostic({
      serverMs: Number.NaN,
      prepMs: -5,
      model: "Bad Model Name",
      calls: [{ finishReason: "not a token" }, { status: 429 }],
    });
    expect(d).toEqual({ passes: 2 });
    expect(Object.keys(buildGradeItemDiagnostic({ calls: [] }))).toEqual(["passes"]);
  });

  it("every emitted key is on the whitelist", () => {
    const d = buildGradeItemDiagnostic({
      serverMs: 1,
      prepMs: 1,
      gradeMs: 1,
      model: "m1",
      calls: [{ promptTokens: 1, outputTokens: 1, elapsedMs: 1, finishReason: "STOP" }],
      failure: "unclassified",
      picturesPrepared: 1, picturesSent: 1, picturesOmitted: 0, visualCoverage: "complete",
    });
    for (const k of Object.keys(d)) expect(GRADE_ITEM_DIAGNOSTIC_KEYS as readonly string[]).toContain(k);
    expect(Object.keys(d).sort()).toEqual([...GRADE_ITEM_DIAGNOSTIC_KEYS].sort());
  });

  it("AC-13: free-string canaries in a call record or model never reach the output", () => {
    const hostile = {
      student: "ZZ_CANARY_STUDENT",
      message: "ZZ_CANARY_MSG",
      finishReason: "ZZ_CANARY_REASON",
    };
    const d = buildGradeItemDiagnostic({
      model: "ZZ_CANARY_MODEL",
      calls: [{ ...hostile, elapsedMs: 5 }],
    });
    expect(JSON.stringify(d)).not.toContain("ZZ_CANARY");
  });

  it("P4: the only string-typed input fields are model and (per call) finishReason", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/grade/grade-item-diagnostic.ts"), "utf8");
    const input = src.slice(src.indexOf("export interface GradeItemDiagnosticInput"), src.indexOf("const MODEL_TOKEN"));
    expect(input.match(/:\s*string/g) ?? []).toHaveLength(1);
    expect(input).toContain("model?: string");
    const record = src.slice(src.indexOf("export interface GradeCallRecord"), src.indexOf("export interface GradeCallSink "));
    expect((record.match(/:\s*string/g) ?? []).length).toBe(1);
    expect(record).toContain("finishReason?: string");
  });

  it("P1: no runtime import (a type-only import of the class union is the sole exception)", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/grade/grade-item-diagnostic.ts"), "utf8");
    const imports = src.split("\n").filter((l) => /^\s*import\s/.test(l));
    expect(imports.every((l) => /^\s*import type\s/.test(l))).toBe(true);
  });
});

describe("createGradeCallSink", () => {
  it("records calls and the last failure", () => {
    const sink = createGradeCallSink();
    sink.recordCall({ status: 500 });
    sink.recordFailure("model service error");
    expect(sink.calls).toEqual([{ status: 500 }]);
    expect(sink.failure).toBe("model service error");
  });
});
