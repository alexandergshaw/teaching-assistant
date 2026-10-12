import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// G4 Wave 3b route test. The action is mocked (never fetch - tests are network
// blocked). Fake timers drive raceWithTimeout's setTimeout.
//
// SABOTAGE NOTE: an unbounded mutant (awaiting the action directly, no race)
// makes the "exceeds budget" test never resolve, and fails on its timeout.

vi.mock("@/lib/supabase/auth", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/app/actions/walkthrough-announcement", () => ({
  gatherWalkthroughResourcesAction: vi.fn(),
}));

import { requireUser } from "@/lib/supabase/auth";
import { gatherWalkthroughResourcesAction } from "@/app/actions/walkthrough-announcement";
import { POST } from "./route";

const USER = { id: "user-1", email: "user@example.com" };

function request(): NextRequest {
  const args = ["Some materials.", "PSYC 101", "gemini"];
  return new NextRequest("http://localhost/api/walkthrough-resources", {
    method: "POST",
    body: JSON.stringify({ args }),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue(USER as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/walkthrough-resources", () => {
  it("(a) returns the action's own value when it resolves inside the budget", async () => {
    vi.mocked(gatherWalkthroughResourcesAction).mockResolvedValueOnce({
      kind: "found",
      links: [{ title: "T", url: "https://example.com" }],
    } as never);

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: "found", links: [{ title: "T", url: "https://example.com" }] });
    expect(gatherWalkthroughResourcesAction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(gatherWalkthroughResourcesAction).mock.calls[0]).toEqual(["Some materials.", "PSYC 101", "gemini"]);
  });

  it("(b) an action that exceeds the budget yields a worded 504 the seam classifier reads as timed out", async () => {
    vi.mocked(gatherWalkthroughResourcesAction).mockReturnValue(new Promise(() => {}) as never);

    const pending = POST(request());
    await vi.advanceTimersByTimeAsync(48_001);
    const res = await pending;

    expect(res.status).toBe(504);
    const json = await res.json();
    expect(json.error).toMatch(/time(d)?[ -]?out|deadline|aborted/i);
    expect(gatherWalkthroughResourcesAction).toHaveBeenCalledTimes(1);
  });

  it("(c) an already-over-budget invocation returns the worded error and NEVER calls the action (OR-1)", async () => {
    vi.mocked(requireUser).mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 49_000);
      return USER as never;
    });

    const res = await POST(request());

    expect(res.status).toBe(504);
    const json = await res.json();
    expect(json.error).toMatch(/time(d)?[ -]?out|deadline|aborted/i);
    expect(gatherWalkthroughResourcesAction).toHaveBeenCalledTimes(0);
  });

  it("a rejecting action yields 502 with its message", async () => {
    vi.mocked(gatherWalkthroughResourcesAction).mockRejectedValueOnce(new Error("boom"));
    const res = await POST(request());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("boom");
  });

  it("rejects an unauthenticated caller with 401 and starts no work", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error("Not authorized."));
    const res = await POST(request());
    expect(res.status).toBe(401);
    expect(gatherWalkthroughResourcesAction).toHaveBeenCalledTimes(0);
  });

  it("rejects a malformed body with 400", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/walkthrough-resources", { method: "POST", body: JSON.stringify({ nope: 1 }) })
    );
    expect(res.status).toBe(400);
    expect(gatherWalkthroughResourcesAction).toHaveBeenCalledTimes(0);
  });
});
