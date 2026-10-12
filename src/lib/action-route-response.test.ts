import { describe, it, expect } from "vitest";

import { readActionRouteResponse, type RouteResponseLike } from "./action-route-response";
import { classifyChatSeamFailure } from "@/app/components/grading-chat/chatSeamDiagnostic";

function jsonResponse(status: number, body: unknown): RouteResponseLike {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

// What a real Response does when the body is HTML or empty.
function nonJsonResponse(status: number): RouteResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON");
    },
  };
}

describe("readActionRouteResponse", () => {
  it("returns an ok JSON object body unchanged (success path)", async () => {
    const body = { replies: [{ id: "a", reply: "Thanks." }], elapsedMs: 12 };
    expect(await readActionRouteResponse(jsonResponse(200, body))).toBe(body);
  });

  it("passes the worded 504 { error } from the route through unchanged", async () => {
    const error = "Drafting replies timed out - the AI took too long to respond. Try again.";
    expect(await readActionRouteResponse(jsonResponse(504, { error }))).toEqual({ error });
  });

  it("passes a 502 { error } through unchanged", async () => {
    expect(await readActionRouteResponse(jsonResponse(502, { error: "model refused" }))).toEqual({
      error: "model refused",
    });
  });

  it("a platform HTML 504 becomes a worded timeout, not a JSON parse error", async () => {
    const out = (await readActionRouteResponse(nonJsonResponse(504))) as { error: string };
    expect(out.error).not.toMatch(/JSON|Unexpected token/i);
    expect(out.error).toMatch(/timed out/i);
    expect(classifyChatSeamFailure(out.error)).toBe("timed out");
  });

  it("a non-JSON non-timeout failure names the status and is not classified as a timeout", async () => {
    const out = (await readActionRouteResponse(nonJsonResponse(500))) as { error: string };
    expect(out.error).toContain("500");
    expect(out.error).not.toMatch(/JSON|Unexpected token/i);
    expect(classifyChatSeamFailure(out.error)).not.toBe("timed out");
  });

  it("a non-ok JSON body without an error string falls back to the status wording", async () => {
    expect(await readActionRouteResponse(jsonResponse(504, { nope: 1 }))).toEqual({
      error: "The request timed out before the server answered. Try again.",
    });
    expect(await readActionRouteResponse(jsonResponse(401, { error: "" }))).toEqual({
      error: "The server could not complete the request (HTTP 401). Try again.",
    });
  });

  it("an ok response with an unreadable or non-object body is a worded failure", async () => {
    for (const res of [nonJsonResponse(200), jsonResponse(200, null), jsonResponse(200, [1, 2]), jsonResponse(200, "x")]) {
      const out = (await readActionRouteResponse(res)) as { error: string };
      expect(typeof out.error).toBe("string");
      expect(out.error).not.toMatch(/Unexpected token/i);
    }
  });
});
