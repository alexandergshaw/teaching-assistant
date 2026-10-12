import { beforeEach, describe, expect, it, vi } from "vitest";
import net from "node:net";

// canvasFetch is mocked: this suite never opens a socket (tests are network-blocked).
const canvasFetch = vi.fn();
vi.mock("./canvas-fetch", () => ({
  canvasFetch: (...args: unknown[]) => canvasFetch(...args),
}));

import {
  CONNECTIVITY_PROBE_TIMEOUT_MS,
  probeCanvasConnectivity,
  readConnectivityRuntime,
  stagesForPhase,
  type ConnectivityProbeCredential,
  type ConnectivityProbeResult,
} from "./canvas-connectivity-probe";
import type { CanvasNetworkFailure } from "./canvas-network-failure";

const TOKEN = "1234~abcdefghij";
const CREDENTIAL: ConnectivityProbeCredential = {
  institution: "RIZE",
  baseUrl: "https://rize.example.edu/some/path?x=1",
  token: TOKEN,
  source: "env",
};

interface FakeOk {
  ok: true;
  status: number;
  headers: Record<string, never>;
  body: Buffer;
}

function okResponse(status: number, body: string): FakeOk {
  return { ok: true, status, headers: {}, body: Buffer.from(body, "utf8") };
}

function unreachable(
  phase: CanvasNetworkFailure["phase"],
  extra: Partial<CanvasNetworkFailure> = {}
): { ok: false; kind: "unreachable"; failure: CanvasNetworkFailure } {
  const failure: CanvasNetworkFailure = {
    phase,
    name: "AbortError",
    code: "ABORT_ERR",
    failedAfterMs: 9990,
    host: "rize.example.edu",
    ...extra,
  };
  return { ok: false, kind: "unreachable", failure };
}

beforeEach(() => {
  canvasFetch.mockReset();
});

describe("probeCanvasConnectivity", () => {
  it("connected: 200 + Canvas self JSON reaches every stage", async () => {
    canvasFetch.mockResolvedValue(okResponse(200, JSON.stringify({ id: 7, name: "A Teacher" })));
    const r = await probeCanvasConnectivity(CREDENTIAL);
    expect(r.verdict).toBe("connected");
    expect(r.stagesReached).toEqual(["dns", "connect", "tls", "http"]);
    expect(r.httpStatus).toBe(200);
    expect(r.host).toBe("rize.example.edu");
    expect(r.source).toBe("env");
  });

  it("dials /api/v1/users/self with the 10 second bound and the token", async () => {
    canvasFetch.mockResolvedValue(okResponse(200, JSON.stringify({ id: 7 })));
    await probeCanvasConnectivity(CREDENTIAL);
    expect(CONNECTIVITY_PROBE_TIMEOUT_MS).toBe(10_000);
    expect(canvasFetch).toHaveBeenCalledTimes(1);
    const [url, options, auth] = canvasFetch.mock.calls[0];
    expect(String(url).endsWith("/api/v1/users/self")).toBe(true);
    expect(options).toEqual({ timeoutMs: 10_000 });
    expect(auth).toEqual({ token: TOKEN });
  });

  it("401 is token-rejected", async () => {
    canvasFetch.mockResolvedValue(okResponse(401, "{}"));
    const r = await probeCanvasConnectivity(CREDENTIAL);
    expect(r.verdict).toBe("token-rejected");
    expect(r.httpStatus).toBe(401);
  });

  it("200 HTML is not-canvas", async () => {
    canvasFetch.mockResolvedValue(okResponse(200, "<html>marketing</html>"));
    const r = await probeCanvasConnectivity(CREDENTIAL);
    expect(r.verdict).toBe("not-canvas");
  });

  it("503 is http-error with the status", async () => {
    canvasFetch.mockResolvedValue(okResponse(503, "down"));
    const r = await probeCanvasConnectivity(CREDENTIAL);
    expect(r.verdict).toBe("http-error");
    expect(r.httpStatus).toBe(503);
  });

  it("unreachable at connect is a network verdict with connect-timeout and stages [dns]", async () => {
    canvasFetch.mockResolvedValue(unreachable("connect"));
    const r = await probeCanvasConnectivity(CREDENTIAL);
    expect(r.verdict).toBe("network");
    expect(r.cause).toBe("connect-timeout");
    expect(r.code).toBe("ABORT_ERR");
    expect(r.stagesReached).toEqual(["dns"]);
    expect(r.failedAfterMs).toBe(9990);
  });

  it("maps every phase to its stage list", () => {
    expect(stagesForPhase("dns")).toEqual([]);
    expect(stagesForPhase("connect")).toEqual(["dns"]);
    expect(stagesForPhase("tls")).toEqual(["dns", "connect"]);
    expect(stagesForPhase("request")).toEqual(["dns", "connect", "tls"]);
    expect(stagesForPhase("body")).toEqual(["dns", "connect", "tls", "http"]);
  });

  it("unreachable without a failure record is unknown-network", async () => {
    canvasFetch.mockResolvedValue({ ok: false, kind: "unreachable" });
    const r = await probeCanvasConnectivity(CREDENTIAL);
    expect(r.verdict).toBe("network");
    expect(r.cause).toBe("unknown-network");
    expect(r.stagesReached).toEqual([]);
  });

  it("host-not-allowed is refused-by-host-rules carrying our own reason text", async () => {
    canvasFetch.mockResolvedValue({
      ok: false,
      kind: "host-not-allowed",
      reason: "That host resolved to a private or reserved address and cannot be used.",
    });
    const r = await probeCanvasConnectivity(CREDENTIAL);
    expect(r.verdict).toBe("refused-by-host-rules");
    expect(r.hint).toContain("private or reserved address");
    expect(r.stagesReached).toEqual([]);
  });

  it("a thrown canvasFetch becomes a local-error network verdict, not an exception", async () => {
    canvasFetch.mockRejectedValue(new Error(`boom ${TOKEN}`));
    const r = await probeCanvasConnectivity(CREDENTIAL);
    expect(r.verdict).toBe("network");
    expect(r.cause).toBe("local-error");
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });
});

describe("probe output scrub (AC-18)", () => {
  const FIXTURES: Array<[string, unknown]> = [
    ["connected", okResponse(200, JSON.stringify({ id: 7 }))],
    ["rejected", okResponse(401, "{}")],
    ["not-canvas", okResponse(200, "<html></html>")],
    ["http-error", okResponse(503, "x")],
    ["network", unreachable("connect")],
    [
      "refused",
      {
        ok: false,
        kind: "host-not-allowed",
        reason: `Refused https://rize.example.edu/some/path?x=1 with ${TOKEN}`,
      },
    ],
  ];

  it.each(FIXTURES)("%s leaks no token, path, query or scheme", async (_label, response) => {
    canvasFetch.mockResolvedValue(response);
    const r: ConnectivityProbeResult = await probeCanvasConnectivity(CREDENTIAL);
    const text = JSON.stringify(r);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("/some/path");
    expect(text).not.toContain("?x=1");
    expect(text).not.toContain("https://");
    expect(r.host).toBe("rize.example.edu");
    expect(r.runtime.node.startsWith("v")).toBe(true);
  });
});

describe("runtime facts", () => {
  it("reports process.version and the default autoSelectFamily", () => {
    const rt = readConnectivityRuntime();
    expect(rt.node).toBe(process.version);
    const expected = typeof net.getDefaultAutoSelectFamily === "function" ? net.getDefaultAutoSelectFamily() : null;
    expect(rt.autoSelectFamily).toBe(expected);
  });

  it("is present on every result", async () => {
    canvasFetch.mockResolvedValue(okResponse(200, JSON.stringify({ id: 1 })));
    const r = await probeCanvasConnectivity(CREDENTIAL);
    expect(r.runtime).toEqual(readConnectivityRuntime());
  });
});
