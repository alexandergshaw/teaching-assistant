import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocked at the EXACT specifiers route.ts imports them from (mirrors
// api/presentations/generate/route.test.ts's own approach) so an inert mock
// fails loudly rather than silently falling through to a real implementation
// - here that would mean a real network call, and vitest.setup.ts throws on
// any real fetch (docs/loop/this-repo.md, "tests are network blocked").
vi.mock("@/lib/supabase/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/llm", () => ({ callLlm: vi.fn() }));
// Default behaviour is a plain passthrough (await the work, ignore the
// budget/label), exactly as api/presentations/generate/route.test.ts does -
// individual tests override with mockImplementationOnce/mockRejectedValueOnce
// to force the timeout branch without waiting out a real 50s budget.
vi.mock("@/lib/course-intel/fetch", () => ({
  withDeadline: vi.fn((work: Promise<unknown>) => work),
}));

import type { NextRequest } from "next/server";
import { requireUser } from "@/lib/supabase/auth";
import { callLlm } from "@/lib/llm";
import { withDeadline } from "@/lib/course-intel/fetch";
import type { PptxSlide } from "@/lib/pptx";
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

const SLIDES: PptxSlide[] = [
  { title: "Intro", bullets: ["welcome"] },
  { title: "Recursion", bullets: ["base case"] },
];

function llmText(text: string) {
  return { ok: true as const, text };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/decks/ask", () => {
  it("returns 401 when requireUser yields no signed-in user", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error("Not authorized. Sign in with an approved account."));

    const res = await POST(makeReq({ instruction: "reword slide 0", slides: SLIDES }));
    const body = await readJson(res);

    expect(res.status).toBe(401);
    expect(body.status).toBe("error");
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("returns 400 when the instruction is missing", async () => {
    mockUser();
    const res = await POST(makeReq({ slides: SLIDES }));
    const body = await readJson(res);
    expect(res.status).toBe(400);
    expect(body.status).toBe("error");
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("returns 400 when slides are missing or malformed", async () => {
    mockUser();
    const res = await POST(makeReq({ instruction: "reword slide 0", slides: [{ title: "no bullets" }] }));
    const body = await readJson(res);
    expect(res.status).toBe(400);
    expect(body.status).toBe("error");
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("returns 400 when the body cannot be read as JSON", async () => {
    mockUser();
    const req = { json: async () => { throw new Error("bad json"); } } as unknown as NextRequest;
    const res = await POST(req);
    const body = await readJson(res);
    expect(res.status).toBe(400);
    expect(body.status).toBe("error");
  });

  it("happy path: a valid op from the model is applied and the new slides are returned, count preserved", async () => {
    mockUser();
    vi.mocked(callLlm).mockResolvedValue(
      llmText(JSON.stringify({ op: "retitle", slideIndex: 0, title: "Getting started" }))
    );

    const res = await POST(makeReq({ instruction: "rename the first slide", slides: SLIDES }));
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.slides).toHaveLength(SLIDES.length);
    expect(body.slides[0].title).toBe("Getting started");
    expect(body.slides[1]).toEqual(SLIDES[1]);
  });

  it("refusal shape (op coerces to null): returns an explicit refused status, not a 200 that looks like success in data terms", async () => {
    mockUser();
    vi.mocked(callLlm).mockResolvedValue(llmText("not json at all, sorry"));

    const res = await POST(makeReq({ instruction: "do something weird", slides: SLIDES }));
    const body = await readJson(res);

    // SABOTAGE-PROVEN: a defective route that returns `{ status: "ok",
    // slides: parsed.slides }` on a coercion failure would ALSO be a 200,
    // so the assertion must be on the response SHAPE (status: "refused" with
    // a reason), never merely on the HTTP status code.
    expect(res.status).toBe(200);
    expect(body.status).toBe("refused");
    expect(typeof body.reason).toBe("string");
    expect(body.reason.length).toBeGreaterThan(0);
    expect(body.slides).toBeUndefined();
  });

  it("refusal shape (applyDeckOperation refuses, e.g. add-slide): returns refused with a reason naming what happened", async () => {
    mockUser();
    vi.mocked(callLlm).mockResolvedValue(llmText(JSON.stringify({ op: "refuse", category: "add-slide" })));

    const res = await POST(makeReq({ instruction: "add a slide about recursion", slides: SLIDES }));
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body.status).toBe("refused");
    expect(body.reason).toMatch(/cannot add a slide/i);
    expect(body.slides).toBeUndefined();
  });

  it("refusal shape (a non-permutation reorder): refuses rather than silently returning an unchanged/garbled deck", async () => {
    mockUser();
    vi.mocked(callLlm).mockResolvedValue(llmText(JSON.stringify({ op: "reorder", order: [0, 0] })));

    const res = await POST(makeReq({ instruction: "reorder oddly", slides: SLIDES }));
    const body = await readJson(res);

    expect(res.status).toBe(200);
    expect(body.status).toBe("refused");
    expect(typeof body.reason).toBe("string");
  });

  it("returns 502 when callLlm fails", async () => {
    mockUser();
    vi.mocked(callLlm).mockResolvedValue({ ok: false, status: 500, body: "server error" });

    const res = await POST(makeReq({ instruction: "reword slide 0", slides: SLIDES }));
    const body = await readJson(res);

    expect(res.status).toBe(502);
    expect(body.status).toBe("error");
  });

  it("returns a 504 styled partial when withDeadline times out", async () => {
    mockUser();
    vi.mocked(withDeadline).mockImplementationOnce(() =>
      Promise.reject(new Error("Deck ask did not finish within 50 seconds"))
    );

    const res = await POST(makeReq({ instruction: "reword slide 0", slides: SLIDES }));
    const body = await readJson(res);

    expect(res.status).toBe(504);
    expect(body.status).toBe("error");
    expect(body.partial).toBe(true);
  });

  it("never sends the template or a file handle to the model - only instruction and slides reach buildAskPrompt via callLlm's request", async () => {
    mockUser();
    vi.mocked(callLlm).mockResolvedValue(llmText(JSON.stringify({ op: "retitle", slideIndex: 0, title: "New" })));

    await POST(makeReq({ instruction: "rename slide 0", slides: SLIDES, templateFileId: "should-be-ignored" } as never));

    const call = vi.mocked(callLlm).mock.calls[0][0];
    const promptText = call.contents[0].parts[0] as { text: string };
    expect(promptText.text).not.toMatch(/templateFileId|base64|should-be-ignored/i);
  });
});
