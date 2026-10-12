import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// G4 Wave 3a route test. The action is mocked (never fetch - tests are network
// blocked). Fake timers drive raceWithTimeout's setTimeout.
//
// SABOTAGE NOTE: an unbounded mutant (awaiting the action directly, no race)
// makes the "exceeds budget" test never resolve, and fails on its timeout.

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("@/app/actions/lms-generation", () => ({
  generateFromSelectionAction: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { generateFromSelectionAction } from "@/app/actions/lms-generation";
import { POST } from "./route";

const OWNER = { id: "owner-1", email: "owner@example.com" };

function request(): NextRequest {
  const args = [{ courseUrl: "https://canvas.example/courses/1", kind: "resources", items: [] }];
  return new NextRequest("http://localhost/api/lms-generation/generate", {
    method: "POST",
    body: JSON.stringify({ args }),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(OWNER as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/lms-generation/generate", () => {
  it("(a) returns the action's own value when it resolves inside the budget", async () => {
    vi.mocked(generateFromSelectionAction).mockResolvedValueOnce({ artifact: { id: "a1" }, notes: [] } as never);

    const res = await POST(request());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ artifact: { id: "a1" }, notes: [] });
    expect(generateFromSelectionAction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(generateFromSelectionAction).mock.calls[0][0]).toMatchObject({ kind: "resources" });
  });

  it("(b) an action that exceeds the budget yields a worded 504 the seam classifier reads as timed out", async () => {
    vi.mocked(generateFromSelectionAction).mockReturnValue(new Promise(() => {}) as never);

    const pending = POST(request());
    await vi.advanceTimersByTimeAsync(48_001);
    const res = await pending;

    expect(res.status).toBe(504);
    const json = await res.json();
    expect(json.error).toMatch(/timed out/i);
    expect(json.error).toMatch(/time(d)?[ -]?out|deadline|aborted/i);
    expect(generateFromSelectionAction).toHaveBeenCalledTimes(1);
  });

  it("(c) an already-over-budget invocation returns the worded error and NEVER calls the action (OR-1)", async () => {
    vi.mocked(requireOwner).mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 49_000);
      return OWNER as never;
    });

    const res = await POST(request());

    expect(res.status).toBe(504);
    const json = await res.json();
    expect(json.error).toMatch(/time(d)?[ -]?out|deadline|aborted/i);
    expect(generateFromSelectionAction).toHaveBeenCalledTimes(0);
  });

  it("a rejecting action yields 502 with its message", async () => {
    vi.mocked(generateFromSelectionAction).mockRejectedValueOnce(new Error("boom"));
    const res = await POST(request());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("boom");
  });

  it("rejects an unauthenticated caller with 401 and starts no work", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized."));
    const res = await POST(request());
    expect(res.status).toBe(401);
    expect(generateFromSelectionAction).toHaveBeenCalledTimes(0);
  });

  it("rejects a malformed body with 400", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/lms-generation/generate", { method: "POST", body: JSON.stringify({ nope: 1 }) })
    );
    expect(res.status).toBe(400);
  });
});
