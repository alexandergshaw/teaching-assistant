import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("node:dns", () => ({ promises: { lookup: vi.fn() } }));
vi.mock("node:https", () => ({ request: vi.fn() }));

import {
  CANVAS_FAILURE_CAUSES,
  CanvasTransportError,
  classifyNetworkFailure,
  describeFailureCause,
  factsFromError,
  sanitizeFailureCode,
  type CanvasFailureCause,
  type CanvasNetworkFacts,
  type CanvasNetworkFailure,
} from "./canvas-network-failure";
import { canvasFetchResultToResponse } from "./canvas-fetch-response";
import { classifyChatSeamFailure } from "../app/components/grading-chat/chatSeamDiagnostic";

const ABORT = { name: "AbortError", code: "ABORT_ERR" };

interface Row {
  label: string;
  facts: CanvasNetworkFacts;
  cause: CanvasFailureCause;
}

/** Frozen oracle: literal expectations, not derived from the implementation. */
const TABLE: readonly Row[] = [
  { label: "ENOTFOUND", facts: { phase: "dns", code: "ENOTFOUND" }, cause: "dns-unresolved" },
  { label: "ENODATA", facts: { phase: "dns", code: "ENODATA" }, cause: "dns-unresolved" },
  { label: "EAI_AGAIN", facts: { phase: "dns", code: "EAI_AGAIN" }, cause: "dns-timeout" },
  { label: "own deadline race", facts: { phase: "dns", name: "DeadlineExceeded" }, cause: "dns-timeout" },
  { label: "ECONNREFUSED", facts: { phase: "connect", code: "ECONNREFUSED" }, cause: "connect-refused" },
  { label: "EHOSTUNREACH", facts: { phase: "connect", code: "EHOSTUNREACH" }, cause: "connect-unreachable" },
  { label: "abort at connect", facts: { phase: "connect", ...ABORT }, cause: "connect-timeout" },
  { label: "abort at tls", facts: { phase: "tls", ...ABORT }, cause: "tls-handshake-timeout" },
  { label: "abort at request", facts: { phase: "request", ...ABORT }, cause: "response-timeout" },
  { label: "abort at body", facts: { phase: "body", ...ABORT }, cause: "response-timeout" },
  { label: "self-signed", facts: { phase: "tls", code: "DEPTH_ZERO_SELF_SIGNED_CERT" }, cause: "tls-certificate" },
  { label: "altname", facts: { phase: "tls", code: "ERR_TLS_CERT_ALTNAME_INVALID" }, cause: "tls-certificate" },
  { label: "issuer", facts: { phase: "tls", code: "UNABLE_TO_GET_ISSUER_CERT_LOCALLY" }, cause: "tls-certificate" },
  { label: "EPROTO", facts: { phase: "tls", code: "EPROTO" }, cause: "tls-protocol" },
  { label: "ECONNRESET", facts: { phase: "request", code: "ECONNRESET" }, cause: "connection-reset" },
  { label: "ETIMEDOUT at connect", facts: { phase: "connect", code: "ETIMEDOUT" }, cause: "connect-timeout" },
  { label: "ETIMEDOUT after connect", facts: { phase: "request", code: "ETIMEDOUT" }, cause: "connection-reset" },
  { label: "byte cap", facts: { phase: "body", code: "BYTE_CAP" }, cause: "response-oversize" },
  {
    label: "invalid ip (the lookup defect)",
    facts: { phase: "connect", name: "TypeError", code: "ERR_INVALID_IP_ADDRESS" },
    cause: "local-error",
  },
  { label: "unmapped code", facts: { phase: "request", code: "EWEIRDTHING" }, cause: "unknown-network" },
];

describe("classifyNetworkFailure - frozen oracle (AC-5)", () => {
  for (const row of TABLE) {
    it(`${row.label} -> ${row.cause}`, () => {
      expect(classifyNetworkFailure(row.facts)).toBe(row.cause);
    });
  }

  it("the five causes the owner named are pairwise distinct", () => {
    const named = ["ENOTFOUND", "ECONNREFUSED", "abort at connect", "abort at request", "self-signed"];
    const causes = named.map((l) => classifyNetworkFailure(TABLE.find((r) => r.label === l)!.facts));
    expect(new Set(causes).size).toBe(5);
  });

  it("every cause the table produces is a member of the closed list", () => {
    for (const row of TABLE) expect(CANVAS_FAILURE_CAUSES).toContain(classifyNetworkFailure(row.facts));
  });
});

describe("factsFromError - scrub (AC-6)", () => {
  it("never copies the message and drops a hostile code (not truncates)", () => {
    const err = Object.assign(new Error("fail 1234~abcdefghij ?access_token=secret"), {
      code: "ECONNREFUSED 10.0.0.1 token=abc",
    });
    const facts = factsFromError(err, "connect");
    const json = JSON.stringify(facts);
    expect(json).not.toContain("1234~abcdefghij");
    expect(json).not.toContain("access_token");
    expect(json).not.toContain("ECONNREFUSED");
    expect(facts.code).toBeUndefined();
    expect(facts.phase).toBe("connect");
  });

  it("keeps a plain code token and the error name", () => {
    expect(factsFromError(Object.assign(new Error("x"), { code: "ECONNRESET" }), "body")).toEqual({
      phase: "body",
      code: "ECONNRESET",
      name: "Error",
    });
  });

  it("tolerates non-error throws", () => {
    expect(factsFromError(undefined, "dns")).toEqual({ phase: "dns" });
    expect(factsFromError("boom", "dns")).toEqual({ phase: "dns" });
  });

  it("sanitizeFailureCode accepts tokens only", () => {
    expect(sanitizeFailureCode("ENOTFOUND")).toBe("ENOTFOUND");
    expect(sanitizeFailureCode("enotfound")).toBeUndefined();
    expect(sanitizeFailureCode("A")).toBeUndefined();
    expect(sanitizeFailureCode(42)).toBeUndefined();
  });
});

describe("describeFailureCause - copy cannot be mis-classified (AC-11)", () => {
  for (const cause of CANVAS_FAILURE_CAUSES) {
    it(`${cause} keeps the chat-seam class "no response"`, () => {
      const sentence = describeFailureCause(cause);
      expect(classifyChatSeamFailure("Canvas did not respond. " + sentence)).toBe("no response");
      expect(sentence).not.toMatch(/[?/=]|\d{4,}/);
    });
  }
});

describe("CanvasTransportError and the carrier (AC-7)", () => {
  const failure: CanvasNetworkFailure = {
    phase: "connect",
    code: "ECONNREFUSED",
    host: "canvas.example.edu",
    failedAfterMs: 12,
  };

  it("throws the byte-identical message with the typed failure attached", () => {
    let thrown: unknown;
    try {
      canvasFetchResultToResponse({ ok: false, kind: "unreachable", failure });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).toBeInstanceOf(CanvasTransportError);
    expect((thrown as Error).message).toBe("Canvas did not respond.");
    expect((thrown as CanvasTransportError).failure).toEqual(failure);
  });

  it("a failure-less result throws the SAME message", () => {
    expect(() => canvasFetchResultToResponse({ ok: false, kind: "unreachable" })).toThrow(
      new Error("Canvas did not respond.")
    );
  });

  it("the refusal text is unchanged", () => {
    expect(() => canvasFetchResultToResponse({ ok: false, kind: "host-not-allowed", reason: "nope" })).toThrow(
      "Canvas request refused: nope"
    );
  });
});

describe("structure pins", () => {
  it("the leaf has no import lines (client-safe)", () => {
    const src = readFileSync("src/lib/canvas-network-failure.ts", "utf8");
    expect(src).not.toMatch(/^\s*import\s/m);
  });

  it("factsFromError reads only name and code, never message", () => {
    const src = readFileSync("src/lib/canvas-network-failure.ts", "utf8");
    const body = src.slice(src.indexOf("export function factsFromError"), src.indexOf("const CERT_CODES"));
    expect(body).not.toMatch(/\.message/);
  });

  it("the carrier keeps both fixed literals", () => {
    const src = readFileSync("src/lib/canvas-fetch-response.ts", "utf8");
    expect(src).toContain('"Canvas did not respond."');
    expect(src).toContain("Canvas request refused: ");
  });
});
