import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// A39 wave 4c, step S1 (docs/a39-waves.md 8.4.3): the Route Handler's own
// guard. action-guard-coverage.test.ts CANNOT see this file - its
// collectActionExports() skips any file that is not a "use server" module
// (isUseServerModule, action-guard-coverage.test.ts:123), and a Route
// Handler never is one. This file is therefore the ONLY thing standing
// behind /api/grade-run-item's guard - RULING 41's negative control is
// rebuilt to three fixtures, one per check, plus a fourth for check 1's
// ordering half (F1b), so each assertion is proven to be able to fail, not
// merely to pass on real source.
const ROUTE_PATH = join(process.cwd(), "src/app/api/grade-run-item/route.ts");
const routeSource = readFileSync(ROUTE_PATH, "utf8");

/** AUTH ORDER (S1 check 1): requireUser( appears, gradeEntries( appears,
 * and the guard comes strictly first. */
function checkAuthOrder(src: string): boolean {
  const idxGuard = src.indexOf("requireUser(");
  const idxGrade = src.indexOf("gradeEntries(");
  return idxGuard >= 0 && idxGrade >= 0 && idxGuard < idxGrade;
}

/** CSRF FLOOR, before the body is parsed (S1 check 2): the call-expression
 * anchor, never the bare substring "content-type" (a comment could contain
 * that alone). */
function checkCsrfFloor(src: string): boolean {
  const idxCt = src.indexOf('req.headers.get("content-type")');
  const idxJson = src.indexOf("req.json(");
  const idxGrade = src.indexOf("gradeEntries(");
  return idxCt >= 0 && idxJson >= 0 && idxCt < idxJson && idxGrade >= 0 && idxCt < idxGrade;
}

/** THE SOFT BUDGET IS UNDER THE HARD CAP (S1 check 3). */
function checkSoftBudgetUnderCap(src: string): boolean {
  const maxDurationMatch = src.match(/export const maxDuration = (\d+)/);
  const totalBudgetMatch = src.match(/TOTAL_BUDGET_MS = ([\d_]+)/);
  if (!maxDurationMatch || !totalBudgetMatch) return false;
  const maxDurationMs = Number.parseInt(maxDurationMatch[1], 10) * 1000;
  const totalBudgetMs = Number.parseInt(totalBudgetMatch[1].replace(/_/g, ""), 10);
  return totalBudgetMs < maxDurationMs;
}

describe("S1: the route's own three checks, real source (positive control)", () => {
  it("check 1 (AUTH ORDER) passes on real route.ts", () => {
    expect(checkAuthOrder(routeSource)).toBe(true);
  });
  it("check 2 (CSRF FLOOR) passes on real route.ts", () => {
    expect(checkCsrfFloor(routeSource)).toBe(true);
  });
  it("check 3 (SOFT BUDGET UNDER HARD CAP) passes on real route.ts", () => {
    expect(checkSoftBudgetUnderCap(routeSource)).toBe(true);
  });
});

// RULING 41: three fixtures, one per check, each must FAIL exactly its own
// check and PASS the other two - proving each assertion is a real
// discriminator, not noise that fails everything or nothing.
const BASE_FIXTURE = [
  'export const maxDuration = 60;',
  "const TOTAL_BUDGET_MS = 50_000;",
  "export async function POST(req) {",
  "  await requireUser();",
  '  const contentType = req.headers.get("content-type") ?? "";',
  "  const rawBody = await req.json();",
  "  const outcome = await raceWithTimeout(gradeEntries([entry], instructions, rubric, provider), waitMs);",
  "  return NextResponse.json(outcome);",
  "}",
].join("\n");

describe("S1 negative controls (RULING 41: one fixture per check, real discriminators)", () => {
  it("F1: guard deleted - fails check 1 only", () => {
    const f1 = BASE_FIXTURE.replace("  await requireUser();\n", "");
    expect(checkAuthOrder(f1)).toBe(false);
    expect(checkCsrfFloor(f1)).toBe(true);
    expect(checkSoftBudgetUnderCap(f1)).toBe(true);
  });

  it("F1b: guard present but moved AFTER the first gradeEntries( call - fails check 1 only", () => {
    const f1b = BASE_FIXTURE
      .replace("  await requireUser();\n", "")
      .replace(
        "  const outcome = await raceWithTimeout(gradeEntries([entry], instructions, rubric, provider), waitMs);",
        "  const outcome = await raceWithTimeout(gradeEntries([entry], instructions, rubric, provider), waitMs);\n  await requireUser();"
      );
    expect(checkAuthOrder(f1b)).toBe(false);
    expect(checkCsrfFloor(f1b)).toBe(true);
    expect(checkSoftBudgetUnderCap(f1b)).toBe(true);
  });

  it("F2: the content-type read deleted - fails check 2 only", () => {
    const f2 = BASE_FIXTURE.replace('  const contentType = req.headers.get("content-type") ?? "";\n', "");
    expect(checkAuthOrder(f2)).toBe(true);
    expect(checkCsrfFloor(f2)).toBe(false);
    expect(checkSoftBudgetUnderCap(f2)).toBe(true);
  });

  it("F3: TOTAL_BUDGET_MS set equal to maxDuration * 1000 - fails check 3 only", () => {
    const f3 = BASE_FIXTURE.replace("const TOTAL_BUDGET_MS = 50_000;", "const TOTAL_BUDGET_MS = 60_000;");
    expect(checkAuthOrder(f3)).toBe(true);
    expect(checkCsrfFloor(f3)).toBe(true);
    expect(checkSoftBudgetUnderCap(f3)).toBe(false);
  });

  it("canary: the base fixture itself passes all three (proves the fixtures above are minimal single mutations)", () => {
    expect(checkAuthOrder(BASE_FIXTURE)).toBe(true);
    expect(checkCsrfFloor(BASE_FIXTURE)).toBe(true);
    expect(checkSoftBudgetUnderCap(BASE_FIXTURE)).toBe(true);
  });
});

// W4-13's wiring half: every gradeEntries( occurrence in the real route sits
// INSIDE a raceWithTimeout( argument - imported and wired, not merely
// imported and awaited directly.
describe("W4-13 wiring: gradeEntries( is always wrapped by raceWithTimeout(", () => {
  function findMatchingCloseParen(text: string, openParenIdx: number): number {
    let depth = 0;
    for (let i = openParenIdx; i < text.length; i++) {
      if (text[i] === "(") depth++;
      else if (text[i] === ")") {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  it("finds at least one gradeEntries( call, and every one is inside a raceWithTimeout( span (anti-vacuity + the real check)", () => {
    const gradeCalls = [...routeSource.matchAll(/gradeEntries\(/g)];
    expect(gradeCalls.length).toBeGreaterThan(0);

    const raceCalls = [...routeSource.matchAll(/raceWithTimeout\(/g)];
    expect(raceCalls.length).toBeGreaterThan(0);
    const raceOpenIdx = raceCalls[0].index! + "raceWithTimeout".length;
    const raceCloseIdx = findMatchingCloseParen(routeSource, raceOpenIdx);
    expect(raceCloseIdx).toBeGreaterThan(raceOpenIdx);

    for (const call of gradeCalls) {
      expect(call.index!).toBeGreaterThan(raceOpenIdx);
      expect(call.index!).toBeLessThan(raceCloseIdx);
    }
  });

  it("imports raceWithTimeout from the shared, domain-free leaf - not withDeadline", () => {
    expect(routeSource).toContain('from "@/lib/bounded-race"');
    expect(routeSource).not.toContain("withDeadline");
  });
});

// ---------------------------------------------------------------------------
// Behavioral: exercise the real POST() against mocked dependencies. Never
// `fetch` (vitest.setup.ts throws on any real fetch) - the model seam is
// mocked at gradeEntries, and raceWithTimeout is mocked directly so this
// file does not re-test bounded-race.ts's own timer logic (already covered
// by bounded-race.test.ts).
// ---------------------------------------------------------------------------
vi.mock("@/lib/supabase/auth", () => ({
  requireUser: vi.fn(async () => ({ id: "u1", email: "owner@example.com" })),
}));
vi.mock("@/lib/grade/engine", () => ({
  gradeEntries: vi.fn(),
}));
vi.mock("@/lib/bounded-race", () => ({
  raceWithTimeout: vi.fn(),
}));

import { requireUser } from "@/lib/supabase/auth";
import { gradeEntries } from "@/lib/grade/engine";
import { raceWithTimeout } from "@/lib/bounded-race";
import { POST } from "./route";

const mockRequireUser = vi.mocked(requireUser);
const mockGradeEntries = vi.mocked(gradeEntries);
const mockRaceWithTimeout = vi.mocked(raceWithTimeout);

// Same idiom as visualizer/create/route.test.ts and
// lms-generation/deck/route.test.ts: a plain fake object, never a real
// Request/NextRequest construction, so this file has no dependency on the
// test environment's fetch-API globals.
function jsonRequest(body: unknown, contentType: string | null = "application/json") {
  return {
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null) },
    json: async () => body,
  };
}

const VALID_BODY = {
  sourceIndex: 0,
  entry: { student: "Alice", content: "some work", mergedFileCount: 1, submittedFiles: [] },
  assignmentInstructions: "Grade it.",
  rubric: "Grade for clarity.",
  provider: "gemini",
  pointsPossible: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/grade-run-item (behavioral, mocked seam)", () => {
  it("401s before reading the body when requireUser rejects", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("not signed in"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(jsonRequest(VALID_BODY) as any);
    expect(res.status).toBe(401);
    expect(mockGradeEntries).not.toHaveBeenCalled();
  });

  it("400s on a non-JSON content-type, before the model seam is ever touched", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(jsonRequest(VALID_BODY, "text/plain") as any);
    expect(res.status).toBe(400);
    expect(mockGradeEntries).not.toHaveBeenCalled();
  });

  it("400s on a malformed body (missing student), before the model seam is ever touched", async () => {
    const malformed = { ...VALID_BODY, entry: { ...VALID_BODY.entry, student: undefined } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(jsonRequest(malformed) as any);
    expect(res.status).toBe(400);
    expect(mockGradeEntries).not.toHaveBeenCalled();
  });

  it("returns {sourceIndex, result} on a settled outcome", async () => {
    const fakeResult = { student: "Alice", overallComment: "Good.", rubricAreas: [], totalScore: "9/10" };
    mockGradeEntries.mockResolvedValueOnce({ results: [fakeResult], rubricAreaNames: [], fullCreditChecklist: [] } as never);
    mockRaceWithTimeout.mockImplementationOnce(async (work) => ({ kind: "settled", value: await work } as never));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(jsonRequest(VALID_BODY) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ sourceIndex: 0, result: fakeResult });
  });

  it("504s on a timed-out outcome, never throwing an unhandled error", async () => {
    mockRaceWithTimeout.mockResolvedValueOnce({ kind: "timedout" } as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(jsonRequest(VALID_BODY) as any);
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(typeof body.error).toBe("string");
  });

  it("502s on a failed outcome, with the underlying error's message", async () => {
    mockRaceWithTimeout.mockResolvedValueOnce({ kind: "failed", error: new Error("model transport error") } as never);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(jsonRequest(VALID_BODY) as any);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("model transport error");
  });

  it("rejects an oversized entry (over ITEM_REQUEST_BYTE_BUDGET) with 400, never reaching the model seam", async () => {
    const oversized = {
      ...VALID_BODY,
      entry: { ...VALID_BODY.entry, content: "x".repeat(4 * 1024 * 1024) },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await POST(jsonRequest(oversized) as any);
    expect(res.status).toBe(400);
    expect(mockGradeEntries).not.toHaveBeenCalled();
  });
});
