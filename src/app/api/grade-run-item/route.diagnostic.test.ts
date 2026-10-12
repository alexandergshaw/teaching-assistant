import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// Chat-grading diagnostics WA (docs/chat-grading-detailed-diagnostics-scope.md
// AC-3, AC-4, P2). Mocks engine and raceWithTimeout exactly as route.test.ts
// does; the REAL normalizeGeminiError and GradeCallError leaves are used.

vi.mock("@/lib/supabase/auth", () => ({
  requireAppOwner: vi.fn(async () => ({ id: "u1", email: "owner@example.com" })),
}));
vi.mock("@/lib/grade/engine", () => ({ gradeEntries: vi.fn() }));
vi.mock("@/lib/bounded-race", () => ({ raceWithTimeout: vi.fn() }));
vi.mock("@/lib/grade/extraction", () => ({
  resolveEntryLinks: vi.fn(async (entry: unknown) => entry),
}));

import { gradeEntries } from "@/lib/grade/engine";
import { raceWithTimeout } from "@/lib/bounded-race";
import { normalizeGeminiError } from "@/lib/grade/parsing";
import { GRADE_ITEM_DIAGNOSTIC_KEYS } from "@/lib/grade/grade-item-diagnostic";
import { POST } from "./route";

const mockGradeEntries = vi.mocked(gradeEntries);
const mockRace = vi.mocked(raceWithTimeout);

function jsonRequest(body: unknown) {
  return {
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? "application/json" : null) },
    json: async () => body,
  };
}

const VALID_BODY = {
  sourceIndex: 0,
  entry: {
    student: "ZZ_CANARY_STUDENT",
    content: "ZZ_CANARY_BODY",
    mergedFileCount: 1,
    submittedFiles: [{ name: "ZZ_CANARY_FILE.pdf", extension: "pdf", previewContent: "x", previewTruncated: false }],
  },
  assignmentInstructions: "Grade it.",
  rubric: "ZZ_CANARY_RUBRIC",
  provider: "gemini",
  pointsPossible: null,
};

const ALLOWED = GRADE_ITEM_DIAGNOSTIC_KEYS as readonly string[];

beforeEach(() => {
  vi.clearAllMocks();
});

async function call(): Promise<{ status: number; body: Record<string, unknown> }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await POST(jsonRequest(VALID_BODY) as any);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

describe("AC-3 route envelope", () => {
  it("200: result unchanged, diagnostic additive and whitelisted", async () => {
    const fakeResult = { student: "ZZ_CANARY_STUDENT", overallComment: "Good.", rubricAreas: [], totalScore: "9/10" };
    mockGradeEntries.mockImplementationOnce((async (_e: unknown, _i: unknown, _r: unknown, _p: unknown, _pp: unknown, options?: { callSink?: { recordCall(c: object): void } }) => {
      options?.callSink?.recordCall({ promptTokens: 1200, outputTokens: 340, elapsedMs: 2100, finishReason: "STOP" });
      return { results: [fakeResult], rubricAreaNames: [], fullCreditChecklist: [] };
    }) as never);
    mockRace.mockImplementationOnce(async (work) => ({ kind: "settled", value: await work } as never));
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body.sourceIndex).toBe(0);
    expect(body.result).toEqual({ ...fakeResult, linkFetch: undefined });
    const d = body.diagnostic as Record<string, unknown>;
    expect(d.serverMs).toBeGreaterThanOrEqual(0);
    expect(d.prepMs).toBeGreaterThanOrEqual(0);
    expect(d.gradeMs).toBeGreaterThanOrEqual(0);
    expect(d.modelMs).toBe(2100);
    expect(d.promptTokens).toBe(1200);
    expect(d.outputTokens).toBe(340);
    expect(d.passes).toBe(1);
    expect(d.finishReason).toBe("stop");
    expect(typeof d.model).toBe("string");
    expect(d.failure).toBeUndefined();
    for (const k of Object.keys(d)) expect(ALLOWED).toContain(k);
  });

  it("200 with a failed grade carries the engine's typed failure class", async () => {
    mockGradeEntries.mockImplementationOnce((async (_e: unknown, _i: unknown, _r: unknown, _p: unknown, _pp: unknown, options?: { callSink?: { recordFailure(f: string): void } }) => {
      options?.callSink?.recordFailure("model quota");
      return { results: [{ student: "x", ungraded: { kind: "grading-failed" } }], rubricAreaNames: [], fullCreditChecklist: [] };
    }) as never);
    mockRace.mockImplementationOnce(async (work) => ({ kind: "settled", value: await work } as never));
    const { body } = await call();
    expect((body.diagnostic as Record<string, unknown>).failure).toBe("model quota");
  });

  it("504: error byte-identical, status unchanged, failure route budget", async () => {
    mockRace.mockImplementationOnce(async () => ({ kind: "timedout" } as never));
    const { status, body } = await call();
    expect(status).toBe(504);
    expect(body.error).toBe("This submission did not finish grading in time. It was not graded.");
    const d = body.diagnostic as Record<string, unknown>;
    expect(d.failure).toBe("route budget");
    expect(d.serverMs).toBeGreaterThanOrEqual(0);
    for (const k of Object.keys(d)) expect(ALLOWED).toContain(k);
  });

  it("502 (failed outcome): error byte-identical, failure route error", async () => {
    mockRace.mockImplementationOnce(async () => ({ kind: "failed", error: new Error("kaboom") } as never));
    const { status, body } = await call();
    expect(status).toBe(502);
    expect(body.error).toBe("kaboom");
    expect((body.diagnostic as Record<string, unknown>).failure).toBe("route error");
  });

  it("502 (thrown): error byte-identical, failure route error", async () => {
    mockRace.mockImplementationOnce(async () => {
      throw new Error("thrown here");
    });
    const { status, body } = await call();
    expect(status).toBe(502);
    expect(body.error).toBe("thrown here");
    expect((body.diagnostic as Record<string, unknown>).failure).toBe("route error");
  });

  it("the pre-parse refusals gain no diagnostic key", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST({ headers: { get: () => "text/plain" }, json: async () => ({}) } as any);
    expect(res.status).toBe(400);
    expect(Object.keys(await res.json())).toEqual(["error"]);
  });
});

describe("AC-4 no content in the server diagnostic", () => {
  it("canaries in the student, body, file name, rubric and a Gemini-400 body never reach the diagnostic", async () => {
    const geminiMessage = normalizeGeminiError(
      400,
      JSON.stringify({ error: { message: "ZZ_CANARY_GEMINI_DETAIL ZZ_CANARY_STUDENT" } })
    );
    expect(geminiMessage).toContain("ZZ_CANARY_GEMINI_DETAIL");
    mockGradeEntries.mockImplementationOnce((async (_e: unknown, _i: unknown, _r: unknown, _p: unknown, _pp: unknown, options?: { callSink?: { recordCall(c: object): void; recordFailure(f: string): void } }) => {
      options?.callSink?.recordCall({ status: 400 });
      options?.callSink?.recordFailure("model rejected request");
      return {
        results: [{ student: "ZZ_CANARY_STUDENT", strengths: geminiMessage, ungraded: { kind: "grading-failed", message: geminiMessage } }],
        rubricAreaNames: [],
        fullCreditChecklist: [],
      };
    }) as never);
    mockRace.mockImplementationOnce(async (work) => ({ kind: "settled", value: await work } as never));
    const { body } = await call();
    const diagnostic = JSON.stringify(body.diagnostic);
    expect(diagnostic).not.toContain("ZZ_CANARY");
    expect((body.diagnostic as Record<string, unknown>).failure).toBe("model rejected request");
    // Control: the canary IS in the result body, so the assertion above can fail.
    expect(JSON.stringify(body.result)).toContain("ZZ_CANARY");
  });
});

describe("P2 browser-only boundary", () => {
  // The structure test for the browser-only session log owns the boundary for
  // every route and server file, so this test only guards the WA-new token.
  it("route.ts does not reach the client detail builder", () => {
    const src = readFileSync(join(process.cwd(), "src/app/api/grade-run-item/route.ts"), "utf8");
    expect(src).not.toContain("chatGradeDetail");
  });
});
