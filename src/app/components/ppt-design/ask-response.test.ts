import { describe, expect, it } from "vitest";
import type { PptxSlide } from "@/lib/pptx";
import { buildAskRequestBody, reduceAskResponse } from "./ask-response";

function slide(title: string): PptxSlide {
  return { title, bullets: ["a", "b"] };
}

describe("buildAskRequestBody", () => {
  it("carries the instruction and slides verbatim, matching parseAskBody's field names", () => {
    const slides = [slide("One"), slide("Two")];
    const body = buildAskRequestBody("make it punchier", slides);
    expect(body).toEqual({ instruction: "make it punchier", slides });
  });
});

describe("reduceAskResponse", () => {
  it("returns ok with the applied slides on 200 status ok", () => {
    const slides = [slide("Reworded")];
    const outcome = reduceAskResponse(200, { status: "ok", slides });
    expect(outcome).toEqual({ phase: "ok", slides });
  });

  it("returns refused with the reason on 200 status refused, never as an ok", () => {
    const outcome = reduceAskResponse(200, { status: "refused", reason: "Adding slides isn't supported yet." });
    expect(outcome).toEqual({ phase: "refused", reason: "Adding slides isn't supported yet." });
    expect(outcome.phase).not.toBe("ok");
  });

  it("treats an unrecognized 200 body as an error rather than a silent success", () => {
    const outcome = reduceAskResponse(200, { status: "ok", slides: "not-an-array" });
    expect(outcome.phase).toBe("error");
  });

  it("surfaces a retryable timeout message on 504", () => {
    const outcome = reduceAskResponse(504, { status: "error", error: "timed out", partial: true });
    expect(outcome).toEqual({ phase: "error", message: "timed out", retryable: true });
  });

  it("falls back to a generic timeout message on 504 with no body", () => {
    const outcome = reduceAskResponse(504, undefined);
    expect(outcome.phase).toBe("error");
    if (outcome.phase === "error") {
      expect(outcome.retryable).toBe(true);
      expect(outcome.message.length).toBeGreaterThan(0);
    }
  });

  it("surfaces a retryable error on 502 (model call failed)", () => {
    const outcome = reduceAskResponse(502, { status: "error", error: "model failed" });
    expect(outcome).toEqual({ phase: "error", message: "model failed", retryable: true });
  });

  it("surfaces a non-retryable error on 400 (bad body)", () => {
    const outcome = reduceAskResponse(400, { status: "error", error: "bad request" });
    expect(outcome).toEqual({ phase: "error", message: "bad request", retryable: false });
  });

  it("surfaces a retryable signed-out error on 401", () => {
    const outcome = reduceAskResponse(401, { status: "error", error: "not signed in" });
    expect(outcome).toEqual({ phase: "error", message: "not signed in", retryable: true });
  });

  it("never returns ok or refused for a non-200 status even if the body is shaped like one", () => {
    const outcome = reduceAskResponse(502, { status: "ok", slides: [] });
    expect(outcome.phase).toBe("error");
  });
});
