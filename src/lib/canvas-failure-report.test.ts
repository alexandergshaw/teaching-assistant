import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveInstitutionByCode = vi.fn();
vi.mock("@/lib/canvas-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/canvas-core")>();
  return { ...actual, resolveInstitutionByCode: (code: string) => resolveInstitutionByCode(code) };
});

import { canvasError, type CanvasInstitution } from "@/lib/canvas-core";
import {
  CANVAS_FAILURE_CAUSES,
  CanvasTransportError,
  describeFailureCause,
  type CanvasNetworkFailure,
} from "@/lib/canvas-network-failure";
import { classifyChatSeamFailure } from "@/app/components/grading-chat/chatSeamDiagnostic";
import { classifyHttpCause, reportCanvasFailure } from "./canvas-failure-report";

beforeEach(() => {
  resolveInstitutionByCode.mockReset();
});

const FAILURE: CanvasNetworkFailure = {
  phase: "connect",
  code: "ABORT_ERR",
  name: "AbortError",
  failedAfterMs: 15000,
  host: "rize.instructure.com",
};

function transport(failure: CanvasNetworkFailure = FAILURE): CanvasTransportError {
  return new CanvasTransportError("Canvas did not respond.", failure);
}

const INST: CanvasInstitution = { code: "RIZE", name: "Rize", host: "rize.instructure.com" };

describe("classifyHttpCause drift pin against the real canvasError text (AC-13)", () => {
  it("maps each status to its cause", () => {
    const cases: Array<[number, string]> = [
      [401, "http-rejected"],
      [403, "http-rejected"],
      [404, "http-404"],
      [429, "http-429"],
      [500, "http-500"],
      [503, "http-503"],
    ];
    for (const [status, cause] of cases) {
      expect(classifyHttpCause(canvasError(status, INST).message)).toBe(cause);
    }
    expect(classifyHttpCause("Canvas did not respond.")).toBeUndefined();
  });
});

describe("copy cannot be mis-classified (AC-11)", () => {
  it("every cause sentence keeps the chat seam class at no response", () => {
    for (const cause of CANVAS_FAILURE_CAUSES) {
      const sentence = describeFailureCause(cause);
      expect(classifyChatSeamFailure(`Canvas did not respond. ${sentence}`)).toBe("no response");
      expect(sentence).not.toMatch(/[?/=]|\d{4,}/);
    }
  });

  it("the augmented owner error still classifies as no response", async () => {
    const r = await reportCanvasFailure({
      err: transport(),
      acronym: "RIZE",
      isOwner: true,
      startedAtMs: Date.now(),
      fallbackMessage: "x",
    });
    expect(r.error.length).toBeGreaterThan("Canvas did not respond. (dialed rize.instructure.com)".length);
    expect(classifyChatSeamFailure(r.error)).toBe("no response");
  });
});

describe("reportCanvasFailure", () => {
  it("owner: cause, code, phase and timing; host carried so nothing is re-resolved", async () => {
    const r = await reportCanvasFailure({
      err: transport(),
      acronym: "RIZE",
      isOwner: true,
      startedAtMs: Date.now() - 50,
      fallbackMessage: "x",
    });
    expect(r.networkFailure).toStrictEqual({
      cause: "connect-timeout",
      code: "ABORT_ERR",
      phase: "connect",
      failedAfterMs: 15000,
    });
    expect(r.attemptedHost).toBe("rize.instructure.com");
    expect(r.error.endsWith("(dialed rize.instructure.com)")).toBe(true);
    expect(r.serverMs).toBeGreaterThanOrEqual(0);
    expect(resolveInstitutionByCode).not.toHaveBeenCalled();
  });

  it("non-owner: flat message plus host, no fine cause anywhere in the output", async () => {
    const r = await reportCanvasFailure({
      err: transport(),
      acronym: "RIZE",
      isOwner: false,
      startedAtMs: Date.now(),
      fallbackMessage: "x",
    });
    expect(r).toStrictEqual({
      error: "Canvas did not respond. (dialed rize.instructure.com)",
      attemptedHost: "rize.instructure.com",
      serverMs: expect.any(Number),
    });
    expect(JSON.stringify(r)).not.toMatch(/connect-timeout|ABORT_ERR/);
  });

  it("falls back to one resolution when no host is carried, and to the bare message when that fails", async () => {
    resolveInstitutionByCode.mockResolvedValueOnce({ baseUrl: "https://a.example.edu/p?access_token=zzz" });
    const withHost = await reportCanvasFailure({
      err: new Error("Canvas did not respond."),
      acronym: " a ",
      isOwner: true,
      startedAtMs: Date.now(),
      fallbackMessage: "x",
    });
    expect(resolveInstitutionByCode).toHaveBeenCalledTimes(1);
    expect(resolveInstitutionByCode).toHaveBeenCalledWith("A");
    expect(withHost.error).toBe("Canvas did not respond. (dialed a.example.edu)");
    expect(JSON.stringify(withHost)).not.toMatch(/zzz|access_token/);

    resolveInstitutionByCode.mockRejectedValueOnce(new Error("no credential"));
    const bare = await reportCanvasFailure({
      err: new Error("Canvas did not respond."),
      acronym: "A",
      isOwner: true,
      startedAtMs: Date.now(),
      fallbackMessage: "x",
    });
    expect(bare.error).toBe("Canvas did not respond.");
    expect(bare.attemptedHost).toBeUndefined();
  });

  it("uses the fallback message for a non-Error throw", async () => {
    resolveInstitutionByCode.mockRejectedValue(new Error("none"));
    const r = await reportCanvasFailure({
      err: "boom",
      acronym: "A",
      isOwner: false,
      startedAtMs: Date.now(),
      fallbackMessage: "Could not load courses.",
    });
    expect(r.error).toBe("Could not load courses.");
  });
});

describe("secret and PII canary", () => {
  it("a hostile failure never leaks a token, URL or free text into the output", async () => {
    const hostile = {
      phase: "connect",
      code: "ECONNREFUSED token=1234~abcdefghij",
      name: "AbortError",
      failedAfterMs: 5,
      host: "https://evil.example/path?access_token=secret",
    } as unknown as CanvasNetworkFailure;
    resolveInstitutionByCode.mockResolvedValue({ baseUrl: "https://rize.instructure.com/x?access_token=secret" });
    const r = await reportCanvasFailure({
      err: new CanvasTransportError("Canvas did not respond.", hostile),
      acronym: "RIZE",
      isOwner: true,
      startedAtMs: Date.now(),
      fallbackMessage: "x",
    });
    const out = JSON.stringify(r);
    expect(out).not.toMatch(/1234~|secret|access_token|https:\/\/|evil|token=/);
    expect(r.attemptedHost).toBe("rize.instructure.com");
    expect(r.networkFailure).not.toHaveProperty("code");
  });
});
