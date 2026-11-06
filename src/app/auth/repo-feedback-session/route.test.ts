import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { readRepoFeedbackReadiness } from "@/lib/supabase/repo-feedback-readiness";
import { REPO_FEEDBACK_READINESS_POLICY } from "@/lib/repo-feedback-readiness-contract";

vi.mock("@/lib/supabase/repo-feedback-readiness", () => ({ readRepoFeedbackReadiness: vi.fn() }));

const AUTH_URL = "https://feedback-test.supabase.co";
const APP_ORIGIN = "https://teaching.example";
const ROUTE = `${APP_ORIGIN}/auth/repo-feedback-session`;
const ACCOUNT_A = "ff74a243-4221-4688-a5a3-15e7cf814428";
const ACCOUNT_B = "9489275b-63e9-4b89-9228-9e0cb5780c34";
const SESSION_B = "c5c870c2-53f4-4e01-ae09-98634cf54d95";
const SAFE_ERROR = { error: "Unable to verify feedback session." };
const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const signingKey = { ...publicKey.export({ format: "jwk" }), kid: "feedback-key", alg: "ES256" };

function encoded(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function jwt(overrides: Record<string, unknown> = {}) {
  const unsigned = `${encoded({ alg: "ES256", kid: signingKey.kid })}.${encoded({
    iss: `${AUTH_URL}/auth/v1`,
    aud: "authenticated",
    sub: ACCOUNT_B,
    session_id: SESSION_B,
    role: "authenticated",
    is_anonymous: false,
    exp: Math.floor(Date.now() / 1000) + 600,
    aal: "aal1",
    ...overrides,
  })}`;
  const signature = sign("sha256", Buffer.from(unsigned), { key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${unsigned}.${signature.toString("base64url")}`;
}

function request(token: string | null, options: { headers?: HeadersInit; body?: BodyInit; query?: string } = {}) {
  const headers = new Headers({ Origin: APP_ORIGIN, "Sec-Fetch-Site": "same-origin" });
  if (token !== null) headers.set("Authorization", `Bearer ${token}`);
  new Headers(options.headers).forEach((value, key) => headers.set(key, value));
  return new Request(ROUTE + (options.query ?? ""), {
    method: "POST",
    headers,
    body: options.body,
  });
}

type Upstream = { url: URL; headers: Headers; init?: RequestInit };
let authUser: Record<string, unknown>;
let profile: Record<string, unknown>[];
let userStatus: number;
let mfaStatus: number;
let profileStatus: number;
let upstream: Upstream[];

beforeEach(() => {
  const expiresAt = Date.now() + 60_000;
  vi.mocked(readRepoFeedbackReadiness).mockReset().mockReturnValue({
    origin: AUTH_URL, policy: REPO_FEEDBACK_READINESS_POLICY, expiresAt,
  });
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", AUTH_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  vi.stubEnv("OWNER_EMAILS", "owner@example.test");
  authUser = { id: ACCOUNT_B, email: "account@example.test", is_anonymous: false };
  profile = [{ id: ACCOUNT_B, role: "instructor", status: "active" }];
  userStatus = 200;
  mfaStatus = 200;
  profileStatus = 200;
  upstream = [];
  let userCalls = 0;

  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input);
    upstream.push({ url, headers: new Headers(init?.headers), init });
    if (url.pathname === "/auth/v1/.well-known/jwks.json") {
      return Response.json({ keys: [signingKey] });
    }
    if (url.pathname === "/auth/v1/user") {
      const status = userCalls++ === 0 ? userStatus : mfaStatus;
      return Response.json(status === 200 ? authUser : { message: "Upstream auth detail" }, { status });
    }
    if (url.pathname === "/rest/v1/app_users") {
      return Response.json(profileStatus === 200 ? profile : { message: "Upstream profile detail" }, {
        status: profileStatus,
      });
    }
    throw new Error(`Unexpected test request to ${url.pathname}`);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function expectDenied(response: Response, status = 401) {
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(await response.json()).toEqual(SAFE_ERROR);
}

describe("POST /auth/repo-feedback-session", () => {
  it("independently denies unavailable readiness before any upstream call", async () => {
    vi.mocked(readRepoFeedbackReadiness).mockReturnValue(null);
    await expectDenied(await POST(request(jwt())));
    expect(upstream).toEqual([]);
  });

  it("checks readiness again after upstream verification and withholds the identity", async () => {
    vi.mocked(readRepoFeedbackReadiness).mockReturnValueOnce({
      origin: AUTH_URL, policy: REPO_FEEDBACK_READINESS_POLICY, expiresAt: Date.now() + 60_000,
    }).mockReturnValue(null);
    await expectDenied(await POST(request(jwt())));
    expect(upstream.some(({ url }) => url.pathname === "/rest/v1/app_users")).toBe(true);
    expect(readRepoFeedbackReadiness).toHaveBeenCalledTimes(2);
  });

  it("uses bearer B for user, current MFA and owned profile even with an unrelated cookie A", async () => {
    const token = jwt({ aal: "aal2" });
    authUser.factors = [{ status: "verified", factor_type: "totp" }];
    const response = await POST(request(token, {
      headers: { Cookie: `sb-feedback-test-auth-token=${jwt({ sub: ACCOUNT_A })}` },
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toEqual({ accountId: ACCOUNT_B, sessionId: SESSION_B });
    const identityRequests = upstream.filter(({ url }) => !url.pathname.endsWith("jwks.json"));
    expect(identityRequests.map(({ url }) => url.pathname)).toEqual([
      "/auth/v1/user", "/rest/v1/app_users", "/auth/v1/user",
    ]);
    expect(identityRequests[1].url.searchParams.get("id")).toBe(`eq.${ACCOUNT_B}`);
    for (const { headers, url, init } of identityRequests) {
      expect(headers.get("authorization")).toBe(`Bearer ${token}`);
      expect(headers.get("cookie")).toBeNull();
      expect(url.search).not.toContain(token);
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.cache).toBe("no-store");
      expect(init?.redirect).toBe("error");
    }
  });

  it("accepts AAL1 when no verified factor exists", async () => {
    authUser.factors = [{ status: "unverified", factor_type: "totp" }];
    expect((await POST(request(jwt()))).status).toBe(200);
  });

  it.each([
    ["issuer", { iss: "https://other.example/auth/v1" }],
    ["audience", { aud: "anon" }],
    ["ambiguous audience", { aud: ["authenticated", "anon"] }],
    ["role", { role: "service_role" }],
    ["anonymous", { is_anonymous: true }],
    ["missing anonymous claim", { is_anonymous: undefined }],
    ["expired", { exp: 1 }],
    ["invalid subject", { sub: "not-an-id" }],
    ["different subject", { sub: ACCOUNT_A }],
    ["missing session", { session_id: undefined }],
    ["invalid session", { session_id: "not-an-id" }],
    ["nil session", { session_id: "00000000-0000-0000-0000-000000000000" }],
    ["invalid AAL", { aal: "aal3" }],
  ])("denies an otherwise signed JWT with %s", async (_name, overrides) => {
    await expectDenied(await POST(request(jwt(overrides))));
    expect(upstream.some(({ url }) => url.pathname.includes("app_users"))).toBe(false);
  });

  it("requires a verified signature even if the upstream user response reports success", async () => {
    const [header, payload] = jwt().split(".");
    const signature = Buffer.alloc(64).toString("base64url");
    await expectDenied(await POST(request(`${header}.${payload}.${signature}`)));
  });

  it("denies a token rejected by upstream Auth and ignores a cookie and spoofed decision", async () => {
    userStatus = 401;
    await expectDenied(await POST(request(jwt(), {
      headers: { Cookie: `sb-feedback-test-auth-token=${jwt({ sub: ACCOUNT_A })}`, "x-ta-access-decision": "owner" },
    })));
    expect(upstream).toHaveLength(1);
  });

  it("denies an anonymous live user even if the JWT claim says otherwise", async () => {
    authUser.is_anonymous = true;
    await expectDenied(await POST(request(jwt())));
  });

  it.each([
    ["missing", []],
    ["wrong account", [{ id: ACCOUNT_A, role: "owner", status: "active" }]],
    ["pending", [{ id: ACCOUNT_B, role: "instructor", status: "pending" }]],
    ["suspended", [{ id: ACCOUNT_B, role: "owner", status: "suspended" }]],
  ])("denies a %s profile even for an allowlisted email", async (_name, rows) => {
    authUser.email = "owner@example.test";
    authUser.email_confirmed_at = "2026-01-01T00:00:00Z";
    profile = rows;
    await expectDenied(await POST(request(jwt())));
  });

  it("denies a live profile lookup error even for an allowlisted email", async () => {
    authUser.email = "owner@example.test";
    authUser.email_confirmed_at = "2026-01-01T00:00:00Z";
    profileStatus = 503;
    await expectDenied(await POST(request(jwt())));
  });

  it("denies AAL1 when a verified factor exists and when MFA lookup fails", async () => {
    authUser.factors = [{ status: "verified", factor_type: "totp" }];
    await expectDenied(await POST(request(jwt())));
    mfaStatus = 503;
    await expectDenied(await POST(request(jwt({ aal: "aal2" }))));
  });

  it("returns a fixed error without logging an upstream exception or bearer", async () => {
    const token = jwt();
    const logs = ["error", "warn", "log", "debug", "info"].map((level) =>
      vi.spyOn(console, level as "error" | "warn" | "log" | "debug" | "info").mockImplementation(() => {}),
    );
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`Private upstream data ${token}`)));
    await expectDenied(await POST(request(token)));
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });

  it("refuses cross-origin, missing origin, and cross-site browser requests before auth", async () => {
    const token = jwt();
    await expectDenied(await POST(request(token, {
      headers: { Origin: "https://attacker.example", "X-Forwarded-Host": "attacker.example" },
    })), 403);
    await expectDenied(await POST(new Request(ROUTE, { method: "POST", headers: { Authorization: `Bearer ${token}` } })), 403);
    await expectDenied(await POST(request(token, { headers: { "Sec-Fetch-Site": "cross-site" } })), 403);
    expect(upstream).toEqual([]);
  });

  it("rejects cookies, query tokens, duplicate/malformed headers and oversized authorization before auth", async () => {
    const token = jwt();
    await expectDenied(await POST(request(null, { headers: { Cookie: `sb-auth-token=${token}` } })));
    await expectDenied(await POST(request(null, { query: `?access_token=${token}` })), 400);
    await expectDenied(await POST(request(token, { headers: { Authorization: `Bearer ${token}, Bearer ${token}` } })));
    await expectDenied(await POST(request(token, { headers: { Authorization: `Basic ${token}` } })));
    await expectDenied(await POST(request(`${"a".repeat(8192)}.b.c`)));
    expect(upstream).toEqual([]);
  });

  it("rejects any payload, including identity injection and unknown-length bodies, before auth", async () => {
    const token = jwt();
    await expectDenied(await POST(request(token, { body: JSON.stringify({ accountId: ACCOUNT_A }) })), 400);
    await expectDenied(await POST(request(token, { headers: { "Content-Length": "1000000" } })), 400);
    await expectDenied(await POST(request(token, { headers: { "Transfer-Encoding": "chunked" } })), 400);
    expect(upstream).toEqual([]);
  });
});
