import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocked at the EXACT specifiers route.ts imports from (mirrors
// generate/route.test.ts's own approach) so an inert mock fails loudly
// rather than silently falling through to a real implementation, which here
// would mean a real network call - vitest.setup.ts throws on any real fetch
// (docs/loop/this-repo.md, "tests are network blocked").
vi.mock("@/lib/supabase/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/llm", () => ({ callLlm: vi.fn() }));
// Default behaviour is a plain passthrough (await the work, ignore the
// budget/label) so every test that does not care about the deadline race
// behaves as if withDeadline were the real implementation; individual tests
// override with mockRejectedValueOnce to force the timeout branch.
vi.mock("@/lib/course-intel/fetch", () => ({
  withDeadline: vi.fn((work: Promise<unknown>) => work),
}));

import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { callLlm } from "@/lib/llm";
import { withDeadline } from "@/lib/course-intel/fetch";
import type { PresentationContext } from "@/lib/presentations/types";
import type { PinnedFrame } from "@/lib/deck-standard/frame";
import type { SlidePlan } from "@/lib/deck-standard/slide-plan";
import type { DeckContent } from "@/lib/presentations/types";
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

function mockLlmText(text: string) {
  vi.mocked(callLlm).mockResolvedValue({ ok: true, text } as never);
}

const CONTEXT: PresentationContext = {
  text: "some pasted lecture notes",
  sources: [{ name: "syllabus.txt", text: "syllabus body" }],
};

const FRAME: PinnedFrame = {
  mentalModel: { name: "The Pipeline", steps: ["intake", "process", "output"] },
  runningExample: { name: "Coffee shop", description: "orders flowing through a queue" },
};

const PLAN: SlidePlan = {
  entries: [
    { role: "content", dominantClaim: "Claim one" },
    { role: "content", dominantClaim: "Claim two" },
  ],
};

const DECK: DeckContent = {
  presentationTitle: "My Deck",
  slides: [
    { title: "Slide 1", bullets: ["a", "b"] },
    { title: "Slide 2", bullets: ["c", "d"] },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(withDeadline).mockImplementation((work: Promise<unknown>) => work as never);
});

describe("POST /api/presentations/pipeline", () => {
  it("returns 401 when requireUser yields no signed-in user, before any callLlm call", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error("Not authorized. Sign in with an approved account."));

    const res = await POST(makeReq({ op: "outline", context: CONTEXT }));
    const body = await readJson(res);

    expect(res.status).toBe(401);
    expect(body.status).toBe("error");
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("returns 400 on an unknown op", async () => {
    mockUser();

    const res = await POST(makeReq({ op: "not-a-real-op", context: CONTEXT }));
    const body = await readJson(res);

    expect(res.status).toBe(400);
    expect(body.status).toBe("error");
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("returns 400 on a known op missing a required payload field", async () => {
    mockUser();

    // "deck" requires plan; posting without it must 400, not crash.
    const res = await POST(makeReq({ op: "deck", context: CONTEXT, frame: null }));
    const body = await readJson(res);

    expect(res.status).toBe(400);
    expect(body.status).toBe("error");
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("returns 400 when the body cannot be parsed as JSON", async () => {
    mockUser();
    const req = { json: async () => { throw new Error("bad json"); } } as unknown as NextRequest;

    const res = await POST(req);
    const body = await readJson(res);

    expect(res.status).toBe(400);
    expect(body.status).toBe("error");
  });

  it("happy path: op outline returns the parsed outline under status ok", async () => {
    mockUser();
    mockLlmText("Some outline markdown text.");

    const res = await POST(makeReq({ op: "outline", context: CONTEXT }));
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body).toEqual({ op: "outline", status: "ok", outline: { markdown: "Some outline markdown text." } });
  });

  it("happy path: op deck returns the parsed deck under status ok", async () => {
    mockUser();
    mockLlmText(
      JSON.stringify({
        presentationTitle: "Generated Deck",
        slides: [{ title: "Intro", bullets: ["point one", "point two"] }],
      })
    );

    const res = await POST(makeReq({ op: "deck", context: CONTEXT, frame: FRAME, plan: PLAN }));
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body.op).toBe("deck");
    expect(body.status).toBe("ok");
    expect(body.deck.presentationTitle).toBe("Generated Deck");
    expect(body.deck.slides).toHaveLength(1);
  });

  it("happy path: op regen-slide returns the regenerated slide under status ok", async () => {
    mockUser();
    mockLlmText(
      JSON.stringify({
        presentationTitle: "ignored",
        slides: [{ title: "Regenerated Slide", bullets: ["new point"] }],
      })
    );

    const res = await POST(
      makeReq({
        op: "regen-slide",
        context: CONTEXT,
        frame: FRAME,
        plan: PLAN,
        deck: DECK,
        slideIndex: 0,
        instruction: "Make it punchier.",
      })
    );
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body.op).toBe("regen-slide");
    expect(body.status).toBe("ok");
    expect(body.slides).toEqual([{ title: "Regenerated Slide", bullets: ["new point"] }]);
  });

  it("op plan accepts a null frame (frame is optional at this stage)", async () => {
    mockUser();
    mockLlmText(JSON.stringify({ entries: [{ role: "content", dominantClaim: "one claim" }] }));

    const res = await POST(makeReq({ op: "plan", context: CONTEXT, outline: { markdown: "outline text" }, frame: null }));
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.plan.entries).toHaveLength(1);
  });

  it("returns an explicit error (not 200) when the parser produces nothing usable - outline", async () => {
    mockUser();
    mockLlmText("   "); // blank -> parseOutlineResponse returns null

    const res = await POST(makeReq({ op: "outline", context: CONTEXT }));
    const body = await readJson(res);

    expect(res.status).not.toBe(200);
    expect(body.status).toBe("error");
  });

  it("returns an explicit error (not 200) when regen-slide's parser yields an empty slide array", async () => {
    mockUser();
    mockLlmText("not valid json at all");

    const res = await POST(
      makeReq({
        op: "regen-slide",
        context: CONTEXT,
        frame: FRAME,
        plan: PLAN,
        deck: DECK,
        slideIndex: 0,
        instruction: "Make it punchier.",
      })
    );
    const body = await readJson(res);

    expect(res.status).not.toBe(200);
    expect(body.status).toBe("error");
  });

  it("sabotage-proves the null-parser path: a valid outline reply flips it back to 200", async () => {
    mockUser();
    // RED: blank reply -> error, established above. GREEN: same op, real text -> 200.
    mockLlmText("A perfectly good outline.");

    const res = await POST(makeReq({ op: "outline", context: CONTEXT }));
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
  });

  it("returns 504 with a partial marker when withDeadline times out", async () => {
    mockUser();
    vi.mocked(withDeadline).mockRejectedValueOnce(new Error("Pipeline outline did not finish within 50000ms"));

    const res = await POST(makeReq({ op: "outline", context: CONTEXT }));
    const body = await readJson(res);

    expect(res.status).toBe(504);
    expect(body.status).toBe("error");
  });

  it("sabotage-proves the deadline path: the same op without a timeout returns 200", async () => {
    mockUser();
    mockLlmText("A perfectly good outline.");
    // withDeadline behaves as passthrough (beforeEach default) - no timeout.

    const res = await POST(makeReq({ op: "outline", context: CONTEXT }));
    const body = await readJson(res);

    expect(res.status).toBe(200);
  });

  it("returns 502 when callLlm fails (ok: false)", async () => {
    mockUser();
    vi.mocked(callLlm).mockResolvedValue({ ok: false } as never);

    const res = await POST(makeReq({ op: "outline", context: CONTEXT }));
    const body = await readJson(res);

    expect(res.status).toBe(502);
    expect(body.status).toBe("error");
  });

  it("returns 502 when callLlm throws (a non-deadline error)", async () => {
    mockUser();
    vi.mocked(withDeadline).mockRejectedValueOnce(new Error("network exploded"));

    const res = await POST(makeReq({ op: "outline", context: CONTEXT }));
    const body = await readJson(res);

    expect(res.status).toBe(502);
    expect(body.status).toBe("error");
  });
});
