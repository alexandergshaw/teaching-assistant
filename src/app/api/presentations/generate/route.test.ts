import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocked at the EXACT specifier route.ts imports it from (mirrors
// src/app/api/lms-generation/deck/route.test.ts's own approach) so an inert
// mock fails loudly rather than silently falling through to a real
// implementation, which here would mean a real network call - vitest.setup.ts
// throws on any real fetch (docs/loop/this-repo.md, "tests are network
// blocked").
vi.mock("@/lib/supabase/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/presentations/generate", () => ({
  generateOneArtifact: vi.fn(),
  reviewArtifact: vi.fn(),
  regenerateArtifact: vi.fn(),
}));
// Default behaviour is a plain passthrough (await the work, ignore the
// budget/label) so every test that does not care about the deadline race
// behaves exactly as if withDeadline were the real implementation. Individual
// tests override this with mockImplementationOnce/mockRejectedValueOnce to
// force the timeout branch (B1) without waiting out a real 50s budget.
vi.mock("@/lib/course-intel/fetch", () => ({
  withDeadline: vi.fn((work: Promise<unknown>) => work),
}));

import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { generateOneArtifact, reviewArtifact, regenerateArtifact } from "@/lib/presentations/generate";
import { withDeadline } from "@/lib/course-intel/fetch";
import type { PresentationContext, ProducedArtifact } from "@/lib/presentations/types";
import { POST } from "./route";

function makeReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

async function readJson(res: Response) {
  return res.json();
}

function mockUser() {
  vi.mocked(requireUser).mockResolvedValue({ id: "user-1", email: "owner@example.com" } as never);
}

const CONTEXT: PresentationContext = {
  text: "some pasted lecture notes",
  sources: [{ name: "syllabus.txt", text: "syllabus body" }],
};

const OUTLINE_ARTIFACT: ProducedArtifact = {
  kind: "outline",
  content: { markdown: "# Outline\n- one\n- two" },
  critique: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/presentations/generate", () => {
  it("returns 401 when requireUser yields no signed-in user", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error("Not authorized. Sign in with an approved account."));

    const res = await POST(
      makeReq({ context: CONTEXT, selection: { outline: true, activities: false, deck: false, review: false }, kind: "outline" })
    );
    const body = await readJson(res);

    expect(res.status).toBe(401);
    expect(body.status).toBe("error");
    expect(generateOneArtifact).not.toHaveBeenCalled();
  });

  it("returns 400 on a malformed body: empty sources is fine, but no selected kind is not", async () => {
    mockUser();

    const res = await POST(
      makeReq({
        context: { text: "", sources: [] },
        selection: { outline: false, activities: false, deck: false, review: false },
        kind: "outline",
      })
    );
    const body = await readJson(res);

    expect(res.status).toBe(400);
    expect(body.status).toBe("error");
    expect(generateOneArtifact).not.toHaveBeenCalled();
  });

  it("returns 400 when context is missing entirely", async () => {
    mockUser();

    const res = await POST(makeReq({ selection: { outline: true, activities: false, deck: false, review: false }, kind: "outline" }));
    const body = await readJson(res);

    expect(res.status).toBe(400);
    expect(body.status).toBe("error");
    expect(generateOneArtifact).not.toHaveBeenCalled();
  });

  it("happy path: generates then reviews the requested kind, returning the assembled ProducedArtifact", async () => {
    mockUser();
    vi.mocked(generateOneArtifact).mockResolvedValue(OUTLINE_ARTIFACT);
    vi.mocked(reviewArtifact).mockResolvedValue({ text: "solid outline, add an intro slide" });

    const res = await POST(
      makeReq({
        context: CONTEXT,
        selection: { outline: true, activities: false, deck: false, review: true },
        kind: "outline",
      })
    );
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      artifact: { kind: "outline", content: { markdown: "# Outline\n- one\n- two" }, critique: { text: "solid outline, add an intro slide" } },
    });
    expect(generateOneArtifact).toHaveBeenCalledWith("outline", CONTEXT);
    expect(reviewArtifact).toHaveBeenCalledWith(OUTLINE_ARTIFACT, CONTEXT);
  });

  // SABOTAGE-CHECKED: with the null-check removed (i.e. the route did
  // `NextResponse.json({ status: "ok", artifact: produced })` unconditionally
  // where `produced` is null), this assertion fails - `body.status` would be
  // "ok" and `body.artifact` would be null, not the named 502 failure shape.
  // That is exactly the "null content presents as silent success" defect the
  // Wave 1 verify pass flagged, so this test is the guard against it.
  it("generateOneArtifact returning null yields an explicit failed response, never a 200 that looks like success", async () => {
    mockUser();
    vi.mocked(generateOneArtifact).mockResolvedValue(null);

    const res = await POST(
      makeReq({
        context: CONTEXT,
        selection: { outline: true, activities: false, deck: false, review: false },
        kind: "outline",
      })
    );
    const body = await readJson(res);

    expect(res.status).toBe(502);
    expect(body.status).toBe("error");
    expect(body.kind).toBe("outline");
    expect(reviewArtifact).not.toHaveBeenCalled();
  });

  it("reviewArtifact returning null degrades to critique: null at 200, not an error", async () => {
    mockUser();
    vi.mocked(generateOneArtifact).mockResolvedValue(OUTLINE_ARTIFACT);
    vi.mocked(reviewArtifact).mockResolvedValue(null);

    const res = await POST(
      makeReq({
        context: CONTEXT,
        selection: { outline: true, activities: false, deck: false, review: true },
        kind: "outline",
      })
    );
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok", artifact: OUTLINE_ARTIFACT });
    expect(body.artifact.critique).toBeNull();
  });

  it("the regenerate path calls regenerateArtifact and returns the new ProducedArtifact", async () => {
    mockUser();
    const regenerated: ProducedArtifact = {
      kind: "outline",
      content: { markdown: "# Improved Outline" },
      critique: null,
    };
    vi.mocked(regenerateArtifact).mockResolvedValue(regenerated);

    const res = await POST(
      makeReq({
        mode: "regenerate",
        kind: "outline",
        priorContext: CONTEXT,
        priorCritique: { text: "add more detail" },
        priorContent: OUTLINE_ARTIFACT.content,
        withReview: false,
      })
    );
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok", artifact: regenerated });
    expect(regenerateArtifact).toHaveBeenCalledWith({
      kind: "outline",
      priorContext: CONTEXT,
      priorCritique: { text: "add more detail" },
      priorContent: OUTLINE_ARTIFACT.content,
      withReview: false,
    });
    expect(generateOneArtifact).not.toHaveBeenCalled();
  });

  it("regenerateArtifact returning null yields the explicit failed response shape", async () => {
    mockUser();
    vi.mocked(regenerateArtifact).mockResolvedValue(null);

    const res = await POST(
      makeReq({
        mode: "regenerate",
        kind: "deck",
        priorContext: CONTEXT,
        priorCritique: null,
        priorContent: null,
        withReview: false,
      })
    );
    const body = await readJson(res);

    expect(res.status).toBe(502);
    expect(body.status).toBe("error");
    expect(body.kind).toBe("deck");
  });

  // B1/I3: the SOFT_DEADLINE_MS check that existed before this fix only
  // gated whether a call STARTED - it never bounded a call's DURATION, so a
  // slow/retrying library call could run past the platform's own 60s kill
  // with no response at all. Each library call is now raced against the
  // remaining budget via withDeadline; these two tests prove the same
  // request succeeds when the call finishes in time and degrades to a
  // worded 504 partial when withDeadline's own timeout fires - proving the
  // guard exists, not merely that a slow call is slow.
  describe("B1: each library call is bounded by the remaining request budget", () => {
    it("succeeds normally when the generation call finishes within the deadline (withDeadline is a passthrough)", async () => {
      mockUser();
      vi.mocked(generateOneArtifact).mockResolvedValue(OUTLINE_ARTIFACT);

      const res = await POST(
        makeReq({
          context: CONTEXT,
          selection: { outline: true, activities: false, deck: false, review: false },
          kind: "outline",
        })
      );
      const body = await readJson(res);

      expect(res.status).toBe(200);
      expect(body).toEqual({ status: "ok", artifact: OUTLINE_ARTIFACT });
    });

    // SABOTAGE-CHECKED: with the try/catch around the withDeadline race
    // removed from route.ts (i.e. the B1 fix reverted to calling
    // generateOneArtifact directly, unwrapped), this rejection propagates out
    // of handleGenerate uncaught, and the route returns an unstyled 500 (or
    // the promise rejection escapes the handler entirely) instead of this
    // test's expected 504 partial shape. Verified by hand against the
    // pre-fix route: the assertion on res.status/body.partial fails (it
    // throws before reaching a NextResponse at all). That transition is the
    // proof this guard is load-bearing, not merely well-intentioned.
    it("returns a 504 partial when withDeadline's own timeout fires during generation", async () => {
      mockUser();
      vi.mocked(generateOneArtifact).mockResolvedValue(OUTLINE_ARTIFACT);
      vi.mocked(withDeadline).mockImplementationOnce(() =>
        Promise.reject(new Error("Generation did not finish within 5 seconds"))
      );

      const res = await POST(
        makeReq({
          context: CONTEXT,
          selection: { outline: true, activities: false, deck: false, review: false },
          kind: "outline",
        })
      );
      const body = await readJson(res);

      expect(res.status).toBe(504);
      expect(body.status).toBe("error");
      expect(body.partial).toBe(true);
    });

    it("returns a generic styled 502 (never an unstyled throw) when a library call rejects for a reason other than the deadline", async () => {
      mockUser();
      vi.mocked(generateOneArtifact).mockResolvedValue(OUTLINE_ARTIFACT);
      vi.mocked(withDeadline).mockImplementationOnce(() => Promise.reject(new Error("ECONNRESET: socket hang up")));

      const res = await POST(
        makeReq({
          context: CONTEXT,
          selection: { outline: true, activities: false, deck: false, review: false },
          kind: "outline",
        })
      );
      const body = await readJson(res);

      expect(res.status).toBe(502);
      expect(body.status).toBe("error");
      expect(body.error).toBe("The AI did not return usable content for this artifact.");
      expect(body.error).not.toMatch(/ECONNRESET/);
    });
  });

  // I2: a review skipped because the budget ran out must not be
  // byte-identical to "review ran and returned a null critique" - Wave 3
  // needs to branch on the difference.
  describe("I2: review-skip is distinguishable from a legitimate null critique", () => {
    it("marks reviewSkipped:true when the budget is exhausted before the review call is attempted", async () => {
      mockUser();
      vi.mocked(generateOneArtifact).mockResolvedValue(OUTLINE_ARTIFACT);

      const dateSpy = vi
        .spyOn(Date, "now")
        .mockReturnValueOnce(0) // startedAtMs
        .mockReturnValueOnce(0) // remainingBudgetMs before the generate call: full budget
        .mockReturnValueOnce(48_000); // remainingBudgetMs before the review call: only 2s left (< MIN_CALL_BUDGET_MS)

      try {
        const res = await POST(
          makeReq({
            context: CONTEXT,
            selection: { outline: true, activities: false, deck: false, review: true },
            kind: "outline",
          })
        );
        const body = await readJson(res);

        expect(res.status).toBe(200);
        expect(body.status).toBe("ok");
        expect(body.reviewSkipped).toBe(true);
        expect(body.artifact.critique).toBeNull();
        expect(reviewArtifact).not.toHaveBeenCalled();
      } finally {
        dateSpy.mockRestore();
      }
    });

    it("does not carry reviewSkipped when review actually ran and returned a null critique", async () => {
      mockUser();
      vi.mocked(generateOneArtifact).mockResolvedValue(OUTLINE_ARTIFACT);
      vi.mocked(reviewArtifact).mockResolvedValue(null);

      const res = await POST(
        makeReq({
          context: CONTEXT,
          selection: { outline: true, activities: false, deck: false, review: true },
          kind: "outline",
        })
      );
      const body = await readJson(res);

      expect(res.status).toBe(200);
      expect(body).toEqual({ status: "ok", artifact: OUTLINE_ARTIFACT });
      expect(body.reviewSkipped).toBeUndefined();
    });
  });

  // I4: an absent mode is back-compat fresh-generate, but a present,
  // unrecognized mode must be rejected explicitly rather than silently
  // falling through to handleGenerate's own (misleading) validation errors.
  it("returns 400 for an unrecognized mode instead of silently falling through to handleGenerate", async () => {
    mockUser();

    const res = await POST(
      makeReq({
        mode: "bogus",
        context: CONTEXT,
        selection: { outline: true, activities: false, deck: false, review: false },
        kind: "outline",
      })
    );
    const body = await readJson(res);

    expect(res.status).toBe(400);
    expect(body.status).toBe("error");
    expect(body.error).toMatch(/unknown mode/i);
    expect(generateOneArtifact).not.toHaveBeenCalled();
    expect(regenerateArtifact).not.toHaveBeenCalled();
  });
});
