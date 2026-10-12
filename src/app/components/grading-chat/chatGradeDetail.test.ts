import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { GRADE_ITEM_DIAGNOSTIC_KEYS } from "@/lib/grade/grade-item-diagnostic";
import {
  readSessionDiagnosticLogState,
  recordSessionDiagnosticEntry,
  resetSessionDiagnosticLogForTests,
  sanitizeSessionDiagnosticDetail,
} from "@/lib/session-diagnostic-log";
import {
  buildGradeItemDetail,
  buildPrepareSubmissionDetail,
  buildResolveHeaderDetail,
  readServerDiagnostic,
  type ChatDetailBag,
} from "./chatGradeDetail";

describe("chatGradeDetail: grade_item projection (AC-11, AC-12)", () => {
  it("maps client signals exactly", () => {
    const bag: ChatDetailBag = buildGradeItemDetail({
      item: 1,
      attempt: 2,
      trigger: "regrade",
      hasPraise: false,
      hasAdvice: true,
      areas: 2,
      areasExpected: 3,
      truncated: true,
      link: "failed",
      code: "needs-input",
      rubricFp: "0123456789ab",
    });
    expect(bag).toEqual({
      item: 1,
      attempt: 2,
      trigger: "regrade",
      hasPraise: false,
      hasAdvice: true,
      areas: 2,
      areasExpected: 3,
      truncated: true,
      link: "failed",
      code: "needs-input",
      rubricFp: "0123456789ab",
    });
  });

  it("merges the server diagnostic and derives netMs, never negative", () => {
    const server = { serverMs: 900, gradeMs: 800, modelMs: 700, model: "gemini-2.5-flash", passes: 1, promptTokens: 10, outputTokens: 5, finishReason: "STOP" };
    const bag = buildGradeItemDetail({ item: 1, clientMs: 1500 }, server);
    expect(bag).toMatchObject({ ...server, finishReason: "stop", netMs: 600 });
    expect(buildGradeItemDetail({ clientMs: 100 }, server).netMs).toBe(0);
    const none = buildGradeItemDetail({ item: 1, clientMs: 100 }, undefined);
    expect(Object.keys(none).sort()).toEqual(["item"]);
  });

  it("failure class is stored as a dash token that survives the log backstop", () => {
    const bag = buildGradeItemDetail({ failure: "transport lost" }, { failure: "model quota" });
    expect(bag.failure).toBe("model-quota");
    expect(buildGradeItemDetail({ failure: "transport lost" }).failure).toBe("transport-lost");
    expect(sanitizeSessionDiagnosticDetail(bag)).toEqual(bag);
  });

  it("a malformed or future server body degrades to nothing", () => {
    expect(readServerDiagnostic("x")).toEqual({});
    expect(readServerDiagnostic(null)).toEqual({});
    expect(readServerDiagnostic([1])).toEqual({});
    expect(readServerDiagnostic({ serverMs: "9", model: "Bad Model", failure: "made up", future: 1 })).toEqual({});
  });
});

describe("chatGradeDetail: PII by construction (AC-13)", () => {
  it("canaries in every untrusted slot never reach the stored detail", () => {
    const hostile = "ZZ_CANARY_STUDENT";
    const bag = buildGradeItemDetail(
      {
        item: 1,
        trigger: hostile as never,
        link: hostile as never,
        code: hostile as never,
        failure: hostile as never,
        rubricFp: hostile,
      },
      {
        model: hostile,
        finishReason: hostile,
        failure: hostile,
        student: hostile,
        error: hostile,
        message: hostile,
        file: "ZZ_CANARY_FILE.pdf",
      }
    );
    expect(JSON.stringify(bag)).not.toMatch(/canary/i);
    expect(JSON.stringify(buildResolveHeaderDetail({ harshness: hostile as never, rubricSource: hostile as never, rubricFp: hostile }))).not.toMatch(/canary/i);
    expect(
      JSON.stringify(
        buildPrepareSubmissionDetail({ inputKind: hostile as never, transport: hostile as never, stage: hostile as never, ext: hostile as never, urlKind: hostile as never })
      )
    ).not.toMatch(/canary/i);
  });

  it("every server key a bag can carry is in the whitelist", () => {
    const bag = readServerDiagnostic(Object.fromEntries(GRADE_ITEM_DIAGNOSTIC_KEYS.map((k) => [k, 1])));
    for (const key of Object.keys(bag)) expect((GRADE_ITEM_DIAGNOSTIC_KEYS as readonly string[]).includes(key)).toBe(true);
  });

  it("builder source has no string-typed parameter except the two validated tokens", () => {
    const src = fs.readFileSync(path.resolve(process.cwd(), "src/app/components/grading-chat/chatGradeDetail.ts"), "utf-8");
    const strings = [...src.matchAll(/^\s+(\w+)\?: string;/gm)].map((m) => m[1]);
    expect(strings).toEqual(["rubricFp", "rubricFp"]);
    expect(/\(\s*\w+\s*:\s*string\b/.test(src.replace(/function failureToken\(failure: string\)/, ""))).toBe(false);
  });

  it("recorded through the real write path, one enriched entry, nothing extra", () => {
    resetSessionDiagnosticLogForTests("2026-10-12T09:00:00.000Z");
    recordSessionDiagnosticEntry({
      at: "2026-10-12T10:00:00.000Z",
      surface: "grading",
      operation: "grade_item",
      outcome: "failure",
      error: "model quota",
      detail: buildGradeItemDetail({ item: 4, attempt: 1, trigger: "first" }, { failure: "model quota", serverMs: 12 }),
    });
    const entries = readSessionDiagnosticLogState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].detail).toEqual({ item: 4, attempt: 1, trigger: "first", serverMs: 12, failure: "model-quota" });
  });
});

describe("chatGradeDetail: header and intake bags", () => {
  it("resolve_header keeps settings, omits unset wordTarget", () => {
    expect(buildResolveHeaderDetail({ harshness: "strict", splitOn: true, criteria: 3, concurrency: 3, cap: 40 })).toEqual({
      harshness: "strict",
      splitOn: true,
      criteria: 3,
      concurrency: 3,
      cap: 40,
    });
  });

  it("prepare_submission keeps counts and closed kinds", () => {
    expect(buildPrepareSubmissionDetail({ inputKind: "zip-storage", transport: "storage", ext: "zip", sizeKb: 2048, found: 10, emitted: 8, skipped: 2 })).toEqual({
      inputKind: "zip-storage",
      transport: "storage",
      ext: "zip",
      sizeKb: 2048,
      found: 10,
      emitted: 8,
      skipped: 2,
    });
  });
});
