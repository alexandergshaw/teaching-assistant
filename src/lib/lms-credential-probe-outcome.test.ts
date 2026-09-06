import { describe, expect, it } from "vitest";
import {
  LMS_CREDENTIAL_PROBE_OUTCOME_KINDS,
  classifyCanvasProbeOutcome,
  lmsCredentialRateLimitedOutcome,
  lmsCredentialSaveFailedOutcome,
  type CanvasProbeExchange,
} from "./lms-credential-probe-outcome";

/**
 * Contract tests for E4's verification result (docs/lms-credentials-
 * acceptance-criteria.md E4, E-UX3, SEC9).
 *
 * WHY FOUR OUTCOMES, NOT THREE. E-UX3's whole point is that a valid public
 * https host that answers with something that is not Canvas (a marketing
 * site) must not be folded into "token rejected" - that user would generate
 * a second token and fail identically. The tests below exercise each of the
 * four Canvas-facing outcomes plus the two the classifier never produces
 * itself (rate-limited, save-failed), which exist on the union purely so a
 * caller has one result type regardless of which stage failed.
 */

function completed(status: number, bodyText: string): CanvasProbeExchange {
  return { ok: true, status, bodyText };
}

describe("classifyCanvasProbeOutcome - refused before or during the network call", () => {
  it("passes through a host-not-allowed refusal with its reason", () => {
    const outcome = classifyCanvasProbeOutcome({
      ok: false,
      kind: "host-not-allowed",
      reason: "That host is not an allowed public LMS instance.",
    });
    expect(outcome).toEqual({
      kind: "host-not-allowed",
      reason: "That host is not an allowed public LMS instance.",
    });
  });

  it("maps an unreachable network-layer failure with no extra detail", () => {
    const outcome = classifyCanvasProbeOutcome({ ok: false, kind: "unreachable" });
    expect(outcome).toEqual({ kind: "unreachable" });
  });
});

describe("classifyCanvasProbeOutcome - a completed exchange", () => {
  it("recognizes a genuine Canvas /api/v1/users/self response as verified", () => {
    const outcome = classifyCanvasProbeOutcome(
      completed(200, JSON.stringify({ id: 4210, name: "Dana Instructor" }))
    );
    expect(outcome).toEqual({ kind: "verified", canvasUserId: "4210", canvasUserName: "Dana Instructor" });
  });

  it("accepts a numeric-string id defensively", () => {
    const outcome = classifyCanvasProbeOutcome(completed(200, JSON.stringify({ id: "4210", name: "Dana" })));
    expect(outcome).toEqual({ kind: "verified", canvasUserId: "4210", canvasUserName: "Dana" });
  });

  it("reports canvasUserName as null when Canvas omits a name", () => {
    const outcome = classifyCanvasProbeOutcome(completed(200, JSON.stringify({ id: 7 })));
    expect(outcome).toEqual({ kind: "verified", canvasUserId: "7", canvasUserName: null });
  });

  it("treats a blank name the same as a missing one", () => {
    const outcome = classifyCanvasProbeOutcome(completed(200, JSON.stringify({ id: 7, name: "   " })));
    expect(outcome).toEqual({ kind: "verified", canvasUserId: "7", canvasUserName: null });
  });

  it("classifies 401 as rejected regardless of body content", () => {
    expect(classifyCanvasProbeOutcome(completed(401, "unauthorized"))).toEqual({ kind: "rejected" });
    expect(classifyCanvasProbeOutcome(completed(401, JSON.stringify({ id: 1, name: "x" })))).toEqual({
      kind: "rejected",
    });
  });

  it("classifies 403 as rejected", () => {
    expect(classifyCanvasProbeOutcome(completed(403, JSON.stringify({ errors: "forbidden" })))).toEqual({
      kind: "rejected",
    });
  });

  it("classifies the E-UX3 marketing-site case (200, HTML body) as not-canvas", () => {
    const outcome = classifyCanvasProbeOutcome(completed(200, "<!doctype html><html><body>Welcome</body></html>"));
    expect(outcome).toEqual({ kind: "not-canvas" });
  });

  it("classifies a 404 as not-canvas, not unreachable and not rejected", () => {
    expect(classifyCanvasProbeOutcome(completed(404, "Not Found"))).toEqual({ kind: "not-canvas" });
  });

  it("classifies a 200 with valid JSON but no usable id as not-canvas", () => {
    expect(classifyCanvasProbeOutcome(completed(200, JSON.stringify({ name: "no id here" })))).toEqual({
      kind: "not-canvas",
    });
  });

  it("classifies a 200 whose body is a JSON array as not-canvas", () => {
    expect(classifyCanvasProbeOutcome(completed(200, JSON.stringify([{ id: 1 }])))).toEqual({
      kind: "not-canvas",
    });
  });

  it("classifies a 200 whose body is JSON null as not-canvas", () => {
    expect(classifyCanvasProbeOutcome(completed(200, "null"))).toEqual({ kind: "not-canvas" });
  });

  it("collapses server-side trouble (500, 502, 429) to not-canvas rather than inventing a fifth label", () => {
    for (const status of [429, 500, 502, 503]) {
      expect(classifyCanvasProbeOutcome(completed(status, "")), `status ${status}`).toEqual({
        kind: "not-canvas",
      });
    }
  });
});

describe("the two outcomes no probe result ever produces", () => {
  it("lmsCredentialRateLimitedOutcome returns the rate-limited kind", () => {
    expect(lmsCredentialRateLimitedOutcome()).toEqual({ kind: "rate-limited" });
  });

  it("lmsCredentialSaveFailedOutcome returns the save-failed kind", () => {
    expect(lmsCredentialSaveFailedOutcome()).toEqual({ kind: "save-failed" });
  });

  it("returns a fresh object each call, not a shared mutable instance", () => {
    const a = lmsCredentialRateLimitedOutcome();
    const b = lmsCredentialRateLimitedOutcome();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe("LMS_CREDENTIAL_PROBE_OUTCOME_KINDS", () => {
  it("names exactly the seven kinds the union can produce", () => {
    expect(LMS_CREDENTIAL_PROBE_OUTCOME_KINDS).toEqual([
      "verified",
      "rejected",
      "not-canvas",
      "host-not-allowed",
      "unreachable",
      "rate-limited",
      "save-failed",
    ]);
  });
});

// ============================================================================
// Sabotage check (reported in the task's Definition of Done, not asserted by
// a test that ships): flipping the classifyCompletedExchange status-code
// order so the 200 branch runs BEFORE the 401/403 check would make a Canvas
// server that returns 401 with a body shaped like { id: ..., name: ... } for
// some unrelated reason misreport as "verified" instead of "rejected." That
// mutation is exercised directly by "classifies 401 as rejected regardless
// of body content" above, which passes a 401 with a valid-looking identity
// body specifically to catch it.
