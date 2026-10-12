import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// G4 Wave 2 route test. callLlm is mocked (never fetch - tests are network
// blocked). Fake timers drive raceWithTimeout's setTimeout; that is why the
// route uses raceWithTimeout rather than withDeadline (AbortSignal.timeout is
// not patched by vi.useFakeTimers).
//
// SABOTAGE NOTE: an unbounded mutant (awaiting the action directly, no race)
// makes the "model exceeds budget" test below never resolve - the awaited
// response promise stays pending after the clock is advanced, and the test
// fails on its timeout instead of seeing a 504.

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn(),
}));

vi.mock("@/app/actions/shared", () => ({
  getWritingStyleBlock: vi.fn(),
}));

vi.mock("@/app/actions/learning-resource-links", () => ({
  findResourceLinksForConceptsAction: vi.fn(),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { requireOwner } from "@/lib/supabase/auth";
import { getWritingStyleBlock } from "@/app/actions/shared";
import { findResourceLinksForConceptsAction } from "@/app/actions/learning-resource-links";
import { callLlm } from "@/lib/llm";
import { DEFAULT_REPLY_COMPOSITION } from "@/lib/discussion-reply-prompt";
import { POST } from "./route";

const OWNER = { id: "owner-1", email: "owner@example.com" };

function draftRequest(): NextRequest {
  const args = [
    [{ id: "row-a", author: "Priya", text: "Post one." }],
    "students",
    "",
    DEFAULT_REPLY_COMPOSITION,
    "gemini",
  ];
  return new NextRequest("http://localhost/api/discussion-replies", {
    method: "POST",
    body: JSON.stringify({ op: "draft", args }),
  });
}

function gatherRequest(): NextRequest {
  const args = [[{ id: "row-a", text: "Post one about recursion." }], "CS101", "gemini"];
  return new NextRequest("http://localhost/api/discussion-replies", {
    method: "POST",
    body: JSON.stringify({ op: "gather", args }),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue(OWNER as never);
  vi.mocked(getWritingStyleBlock).mockResolvedValue("");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/discussion-replies", () => {
  it("(a) returns the action result when the model answers inside the budget", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: JSON.stringify([{ post: 1, reply: "Thanks for sharing." }]),
    } as never);

    const res = await POST(draftRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.replies).toEqual([{ id: "row-a", reply: "Thanks for sharing." }]);
    expect(callLlm).toHaveBeenCalledTimes(1);
  });

  it("(b) a model that exceeds the budget yields a worded 504 { error } the seam classifier reads as timed out", async () => {
    vi.mocked(callLlm).mockReturnValue(new Promise(() => {}) as never);

    const pending = POST(draftRequest());
    await vi.advanceTimersByTimeAsync(24_001);
    const res = await pending;

    expect(res.status).toBe(504);
    const json = await res.json();
    expect(json.error).toMatch(/timed out/i);
    // The client classifier's timed-out pattern, restated so this server test
    // does not import the browser-only module.
    expect(json.error).toMatch(/time(d)?[ -]?out|deadline|aborted/i);
    expect(callLlm).toHaveBeenCalledTimes(1);
  });

  it("(c) an already-over-budget invocation returns the worded error and NEVER calls callLlm (OR-1)", async () => {
    // Elapsed time passes between the handler's start and its budget check.
    vi.mocked(requireOwner).mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 49_000);
      return OWNER as never;
    });

    const res = await POST(draftRequest());

    expect(res.status).toBe(504);
    const json = await res.json();
    expect(json.error).toMatch(/timed out/i);
    expect(json.error).toMatch(/time(d)?[ -]?out|deadline|aborted/i);
    expect(callLlm).toHaveBeenCalledTimes(0);
  });

  it("a gather that runs past the whole-invocation budget yields a worded 504", async () => {
    vi.mocked(findResourceLinksForConceptsAction).mockReturnValue(new Promise(() => {}) as never);

    const pending = POST(gatherRequest());
    await vi.advanceTimersByTimeAsync(48_001);
    const res = await pending;

    expect(res.status).toBe(504);
    const json = await res.json();
    expect(json.error).toMatch(/timed out/i);
  });

  it("a gather already over budget never starts the search", async () => {
    vi.mocked(requireOwner).mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 49_000);
      return OWNER as never;
    });

    const res = await POST(gatherRequest());

    expect(res.status).toBe(504);
    expect(findResourceLinksForConceptsAction).toHaveBeenCalledTimes(0);
  });

  it("rejects an unauthenticated caller with 401 and starts no work", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized."));
    const res = await POST(draftRequest());
    expect(res.status).toBe(401);
    expect(callLlm).toHaveBeenCalledTimes(0);
  });

  it("rejects a malformed body with 400", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/discussion-replies", { method: "POST", body: JSON.stringify({ op: "nope" }) })
    );
    expect(res.status).toBe(400);
  });
});
