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

/** AUTH ORDER (S1 check 1): requireAppOwner( appears, gradeEntries( appears,
 * and the guard comes strictly first. Tightened from requireUser( - see
 * route.ts's own header (docs/grading-chat-security.md finding F1): this
 * route spends the shared owner-configured GEMINI_API_KEY on
 * caller-supplied content, so only requireAppOwner() (the real owner gate)
 * belongs here, not requireUser() (admits any approved account) or
 * requireOwner() (a deprecated alias that delegates to requireUser()). */
function checkAuthOrder(src: string): boolean {
  const idxGuard = src.indexOf("requireAppOwner(");
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
  "  await requireAppOwner();",
  '  const contentType = req.headers.get("content-type") ?? "";',
  "  const rawBody = await req.json();",
  "  const outcome = await raceWithTimeout(gradeEntries([entry], instructions, rubric, provider), waitMs);",
  "  return NextResponse.json(outcome);",
  "}",
].join("\n");

describe("S1 negative controls (RULING 41: one fixture per check, real discriminators)", () => {
  it("F1: guard deleted - fails check 1 only", () => {
    const f1 = BASE_FIXTURE.replace("  await requireAppOwner();\n", "");
    expect(checkAuthOrder(f1)).toBe(false);
    expect(checkCsrfFloor(f1)).toBe(true);
    expect(checkSoftBudgetUnderCap(f1)).toBe(true);
  });

  it("F1b: guard present but moved AFTER the first gradeEntries( call - fails check 1 only", () => {
    const f1b = BASE_FIXTURE
      .replace("  await requireAppOwner();\n", "")
      .replace(
        "  const outcome = await raceWithTimeout(gradeEntries([entry], instructions, rubric, provider), waitMs);",
        "  const outcome = await raceWithTimeout(gradeEntries([entry], instructions, rubric, provider), waitMs);\n  await requireAppOwner();"
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
// NOTE: this top-level module mock stubs requireAppOwner() away entirely -
// it exists so the tests below it can drive the route's OWN response
// shaping (401/400/504/502/200) without depending on the guard's real
// session/role logic. It proves nothing about whether the guard itself
// admits or refuses a non-owner - that is what the separate
// "real requireAppOwner() guard" describe block further down drives, with
// this module mock unmocked and the real guard executing (the idiom
// src/app/actions/grading.guard.test.ts already uses for the same
// distinction).
vi.mock("@/lib/supabase/auth", () => ({
  requireAppOwner: vi.fn(async () => ({ id: "u1", email: "owner@example.com" })),
}));
vi.mock("@/lib/grade/engine", () => ({
  gradeEntries: vi.fn(),
}));
vi.mock("@/lib/bounded-race", () => ({
  raceWithTimeout: vi.fn(),
}));

import { requireAppOwner } from "@/lib/supabase/auth";
import { gradeEntries } from "@/lib/grade/engine";
import { raceWithTimeout } from "@/lib/bounded-race";
import { POST } from "./route";

const mockRequireUser = vi.mocked(requireAppOwner);
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

  describe("harshness parse is default-safe (harshness wave 1)", () => {
    async function harshnessReachedEngine(extra: Record<string, unknown>): Promise<unknown> {
      mockGradeEntries.mockResolvedValueOnce({ results: [{ student: "Alice" }], rubricAreaNames: [], fullCreditChecklist: [] } as never);
      mockRaceWithTimeout.mockImplementationOnce(async (work) => ({ kind: "settled", value: await work } as never));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await POST(jsonRequest({ ...VALID_BODY, ...extra }) as any);
      const options = mockGradeEntries.mock.calls[0][5];
      return options?.harshness;
    }

    it("passes lenient and strict through", async () => {
      expect(await harshnessReachedEngine({ harshness: "strict" })).toBe("strict");
      vi.clearAllMocks();
      expect(await harshnessReachedEngine({ harshness: "lenient" })).toBe("lenient");
    });

    it("resolves an absent harshness to balanced", async () => {
      expect(await harshnessReachedEngine({})).toBe("balanced");
    });

    it("resolves an invalid harshness (string, number, null) to balanced", async () => {
      expect(await harshnessReachedEngine({ harshness: "savage" })).toBe("balanced");
      vi.clearAllMocks();
      expect(await harshnessReachedEngine({ harshness: 7 })).toBe("balanced");
      vi.clearAllMocks();
      expect(await harshnessReachedEngine({ harshness: null })).toBe("balanced");
    });
  });

  describe("feedbackWordTarget parse is default-safe (feedback length wave 1)", () => {
    async function targetReachedEngine(extra: Record<string, unknown>): Promise<unknown> {
      vi.clearAllMocks();
      mockGradeEntries.mockResolvedValueOnce({ results: [{ student: "Alice" }], rubricAreaNames: [], fullCreditChecklist: [] } as never);
      mockRaceWithTimeout.mockImplementationOnce(async (work) => ({ kind: "settled", value: await work } as never));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await POST(jsonRequest({ ...VALID_BODY, ...extra }) as any);
      const options = mockGradeEntries.mock.calls[0][5];
      return options?.feedbackWordTarget;
    }

    it("passes a valid target through, including a numeric string", async () => {
      expect(await targetReachedEngine({ feedbackWordTarget: 150 })).toBe(150);
      expect(await targetReachedEngine({ feedbackWordTarget: "150" })).toBe(150);
    });

    it("resolves an absent target to undefined", async () => {
      expect(await targetReachedEngine({})).toBeUndefined();
    });

    it("resolves an out-of-range or invalid target to undefined", async () => {
      for (const bad of [5, 600, "big", 150.5, null, 0, -20]) {
        expect(await targetReachedEngine({ feedbackWordTarget: bad })).toBeUndefined();
      }
    });
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

// ---------------------------------------------------------------------------
// docs/grading-chat-security.md finding F1: this route used to gate its POST
// with requireUser() (admits ANY active account), which let any approved
// non-owner "instructor" account spend the shared owner-configured
// GEMINI_API_KEY by POSTing straight to this route - a cost-abuse gap, since
// the guard above module-mocks "@/lib/supabase/auth" wholesale and therefore
// proves nothing about whether the REAL guard admits or refuses a non-owner.
//
// This block unmocks "@/lib/supabase/auth" and mocks ONE layer further down
// instead - "@/lib/supabase/server" (the Supabase client) and
// "@/lib/supabase/app-users" (the stored account-row lookup) - the exact
// idiom src/app/actions/grading.guard.test.ts already uses, and for the
// same reason its own header states: mocking "@/lib/supabase/auth" itself
// would replace the guard with a stub and never run it. vi.resetModules()
// plus a dynamic import gives this block a fresh module graph so these
// mocks never leak into, or get clobbered by, the top-level
// vi.mock("@/lib/supabase/auth", ...) used by every test above.
// ---------------------------------------------------------------------------
describe("POST /api/grade-run-item - real requireAppOwner() guard (F1 fix)", () => {
  function makeFakeAuthClient(userId: string, email: string) {
    return {
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: { id: userId, email, email_confirmed_at: "2026-01-01T00:00:00.000Z" } },
            error: null,
          }),
        mfa: {
          getAuthenticatorAssuranceLevel: () =>
            Promise.resolve({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }),
        },
      },
    };
  }

  // An active, approved, non-owner "instructor" row - the real, provisioned
  // account tier this finding is about (docs/grading-chat-security.md F1),
  // not a hypothetical the type system merely allows.
  function fakeInstructorRow() {
    return {
      id: "u2",
      email: "instructor@example.com",
      displayName: null,
      status: "active" as const,
      role: "instructor" as const,
      approvedAt: null,
      approvedBy: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      statusChangedAt: null,
      statusChangedBy: null,
      roleGrantedBy: null,
    };
  }

  it("refuses an authenticated, active, NON-owner (instructor) session with 401, before the model seam is ever reached - proving the REAL guard runs, not a mocked stub", async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/supabase/auth");
    vi.doMock("@/lib/supabase/server", () => ({
      createClient: vi.fn(async () => makeFakeAuthClient("u2", "instructor@example.com")),
      createServiceClient: vi.fn(() => ({})),
    }));
    vi.doMock("@/lib/supabase/app-users", () => ({
      getAppUser: vi.fn(async () => fakeInstructorRow()),
      ensureAppUser: vi.fn(async () => fakeInstructorRow()),
      ensureAppUserRowExists: vi.fn(async () => undefined),
      appUserNeedsReconciliation: vi.fn(() => false),
    }));

    const { OWNER_ONLY_MESSAGE } = await import("@/lib/supabase/auth");
    const { gradeEntries: freshGradeEntries } = await import("@/lib/grade/engine");
    const mockFreshGradeEntries = vi.mocked(freshGradeEntries);
    mockFreshGradeEntries.mockClear();

    const { POST: freshPost } = await import("./route");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await freshPost(jsonRequest(VALID_BODY) as any);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe(OWNER_ONLY_MESSAGE);
    expect(mockFreshGradeEntries).not.toHaveBeenCalled();
  });
});
