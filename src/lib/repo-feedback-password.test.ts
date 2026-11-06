import { randomUUID } from "node:crypto";
import { AuthClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRepoFeedbackPasswordChallenge } from "./repo-feedback-password";
import { readyResponse } from "./supabase/repo-feedback-readiness.test-fixture";

const PROJECT = "https://isolated.example";
const BASELINE = {
  accountId: "11111111-1111-1111-1111-111111111111",
  sessionId: "22222222-2222-2222-2222-222222222222",
};
const PRIVATE = { ...BASELINE, sessionId: "33333333-3333-3333-3333-333333333333" };
const OTHER_ACCOUNT = "44444444-4444-4444-4444-444444444444";
const CREDENTIALS = { email: "owner@example.test", password: "test-only-password" };
const REFRESH = "test-only-refresh-token";
const TOTP_ONE = "55555555-5555-5555-5555-555555555555";
const TOTP_TWO = "66666666-6666-6666-6666-666666666666";
const UNVERIFIED = "77777777-7777-7777-7777-777777777777";
const UNSUPPORTED = "88888888-8888-8888-8888-888888888888";
const CHALLENGE_ID = "99999999-9999-9999-9999-999999999999";
const TOTP_CODE = "012345";
const VERIFIED_TOTP = { id: TOTP_ONE, factor_type: "totp", status: "verified" };

function jwt(claims: Record<string, unknown> = {}): string {
  const payload = {
    sub: PRIVATE.accountId,
    session_id: PRIVATE.sessionId,
    aal: "aal1",
    exp: Math.floor(Date.now() / 1000) + 60,
    ...claims,
  };
  return `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

function passwordResponse(accessToken: string, user: Record<string, unknown> = {}): Response {
  return Response.json({
    access_token: accessToken,
    refresh_token: REFRESH,
    expires_in: 60,
    token_type: "bearer",
    user: { id: PRIVATE.accountId, is_anonymous: false, ...user },
  });
}

function totpResponse(fields: Record<string, unknown> = {}): Response {
  return Response.json({ id: CHALLENGE_ID, type: "totp", expires_at: Math.floor(Date.now() / 1000) + 60, ...fields });
}

function streamedResponse(bytes: Uint8Array, contentLength?: string): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 1024) {
        controller.enqueue(bytes.subarray(offset, offset + 1024));
      }
      controller.close();
    },
  }), { headers: contentLength === undefined ? undefined : { "content-length": contentLength } });
}

const fetchMock = vi.fn<typeof fetch>();
const readinessFetch = vi.fn<typeof fetch>();
const verifySession = vi.fn<Parameters<typeof createRepoFeedbackPasswordChallenge>[0]["verifySession"]>();
const addEventListener = vi.fn();
const localStorage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() };
const cookies = vi.fn(() => "shared-auth-cookie");
const broadcast = vi.fn(function () {});

function challenge(overrides: Partial<Parameters<typeof createRepoFeedbackPasswordChallenge>[0]> = {}) {
  return createRepoFeedbackPasswordChallenge({
    supabaseUrl: PROJECT,
    publicKey: "sb_publishable_test_key",
    baseline: BASELINE,
    signal: new AbortController().signal,
    verifySession,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  readinessFetch.mockReset().mockImplementation(async () => readyResponse(PROJECT));
  verifySession.mockReset().mockResolvedValue(PRIVATE);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", {
    crypto: { randomUUID },
    fetch: readinessFetch,
    addEventListener,
    location: { origin: "https://app.example", href: "https://app.example/#access_token=shared-callback&refresh_token=shared-refresh" },
  });
  vi.stubGlobal("document", Object.defineProperty({ visibilityState: "visible" }, "cookie", { get: cookies }));
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("BroadcastChannel", broadcast);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("isolated feedback password challenge with the installed Auth SDK", () => {
  it.each([
    ["unavailable", () => new Response(null, { status: 503 })],
    ["untrusted browser project", () => readyResponse("https://other.example")],
    ["expired readiness", () => readyResponse(PROJECT, Date.now() - 1)],
    ["malformed readiness", () => Response.json({ origin: PROJECT })],
  ])("checks the fixed bodyless route and skips password dispatch on %s", async (_reason, response) => {
    readinessFetch.mockResolvedValueOnce(response());
    expect(await challenge().signInWithPassword(CREDENTIALS)).toEqual({ status: "unavailable" });
    expect(readinessFetch).toHaveBeenCalledExactlyOnceWith("https://app.example/auth/repo-feedback-readiness", {
      method: "POST", credentials: "omit", mode: "same-origin", redirect: "error", cache: "no-store",
      referrer: "", referrerPolicy: "same-origin", signal: expect.any(AbortSignal),
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("does not dispatch a pending TOTP challenge after the readiness deadline", async () => {
    vi.useFakeTimers();
    const expiresAt = Date.now() + 5_000;
    readinessFetch.mockResolvedValueOnce(readyResponse(PROJECT, expiresAt));
    fetchMock.mockResolvedValueOnce(passwordResponse(jwt(), { factors: [VERIFIED_TOTP] }));
    const port = challenge();
    expect(await port.signInWithPassword(CREDENTIALS)).toEqual({
      status: "mfa_required", factorIds: [TOTP_ONE], expiresAt,
    });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await port.verifyTotp({ factorId: TOTP_ONE, code: TOTP_CODE })).toEqual({ status: "unavailable" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("sends an explicit password grant and verifies only the returned bearer, without shared auth side effects", async () => {
    const token = jwt();
    fetchMock.mockResolvedValueOnce(passwordResponse(token));
    const setSession = vi.spyOn(AuthClient.prototype, "setSession");
    const signOut = vi.spyOn(AuthClient.prototype, "signOut");
    const initialize = vi.spyOn(AuthClient.prototype, "initialize");
    const stopAutoRefresh = vi.spyOn(AuthClient.prototype, "stopAutoRefresh");
    const auth = challenge();
    expect(fetchMock).not.toHaveBeenCalled();

    expect(await auth.signInWithPassword(CREDENTIALS)).toEqual({ status: "verified", identity: PRIVATE, expiresAt: expect.any(Number) });
    expect(await auth.signInWithPassword(CREDENTIALS)).toEqual({ status: "unavailable" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [input, init] = fetchMock.mock.calls[0];
    expect(input).toBe(`${PROJECT}/auth/v1/token?grant_type=password`);
    expect(init).toMatchObject({ method: "POST", redirect: "error", credentials: "omit", cache: "no-store" });
    expect(JSON.parse(String(init?.body))).toMatchObject(CREDENTIALS);
    expect(verifySession).toHaveBeenCalledExactlyOnceWith(token, init?.signal);
    expect(init?.signal?.aborted).toBe(true);
    expect(stopAutoRefresh).toHaveBeenCalledOnce();
    expect(initialize).not.toHaveBeenCalled();
    expect(setSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(addEventListener).not.toHaveBeenCalled();
    expect(cookies).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
    expect(localStorage.getItem).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
  });

  it("keeps the same bearer behind token-free revalidation until expiry or owner revocation", async () => {
    vi.useFakeTimers();
    const exp = Math.floor(Date.now() / 1000) + 60;
    const token = jwt({ exp });
    const owner = new AbortController();
    const caller = new AbortController();
    fetchMock.mockImplementation(async () => passwordResponse(token));
    const auth = challenge({ signal: owner.signal });
    const expected = { status: "verified", identity: PRIVATE, expiresAt: exp * 1000 };
    expect(await auth.revalidate(caller.signal)).toEqual({ status: "unavailable" });
    expect(await auth.signInWithPassword(CREDENTIALS)).toEqual(expected);
    expect(await auth.revalidate(caller.signal)).toEqual(expected);
    expect(verifySession.mock.calls.map(([bearer]) => bearer)).toEqual([token, token]);
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(exp * 1000 - Date.now());
    expect(await auth.revalidate(caller.signal)).toEqual({ status: "unavailable" });
    expect(verifySession).toHaveBeenCalledTimes(2);

    const fresh = jwt();
    fetchMock.mockResolvedValueOnce(passwordResponse(fresh));
    const revoked = challenge({ signal: owner.signal });
    expect(await revoked.signInWithPassword(CREDENTIALS)).toMatchObject({ status: "verified" });
    owner.abort();
    expect(await revoked.revalidate(caller.signal)).toEqual({ status: "unavailable" });
    expect(verifySession).toHaveBeenCalledTimes(3);
  });

  it("drops a bearer when revalidation disagrees and abandons a late result after disposal", async () => {
    const signal = new AbortController().signal;
    fetchMock.mockImplementation(async () => passwordResponse(jwt()));
    const denied = challenge();
    expect(await denied.signInWithPassword(CREDENTIALS)).toMatchObject({ status: "verified" });
    verifySession.mockResolvedValueOnce(BASELINE);
    expect(await denied.revalidate(signal)).toEqual({ status: "unavailable" });
    expect(await denied.revalidate(signal)).toEqual({ status: "unavailable" });
    expect(verifySession).toHaveBeenCalledTimes(2);

    const auth = challenge();
    expect(await auth.signInWithPassword(CREDENTIALS)).toMatchObject({ status: "verified" });
    let resolve!: (value: typeof PRIVATE) => void;
    verifySession.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const pending = auth.revalidate(signal);
    auth.dispose();
    resolve(PRIVATE);
    expect(await pending).toEqual({ status: "unavailable" });
    expect(verifySession.mock.lastCall?.[1].aborted).toBe(true);
    expect(await auth.revalidate(signal)).toEqual({ status: "unavailable" });
    expect(verifySession).toHaveBeenCalledTimes(4);
  });

  it.each([
    { name: "wrong account", claims: {}, user: { id: OTHER_ACCOUNT }, status: "rejected" },
    { name: "wrong token subject", claims: { sub: OTHER_ACCOUNT }, user: {}, status: "unavailable" },
    { name: "shared session ID", claims: { session_id: BASELINE.sessionId }, user: {}, status: "unavailable" },
    { name: "expired token", claims: { exp: 1 }, user: {}, status: "unavailable" },
    { name: "malformed factor", claims: {}, user: { factors: [{ status: "verified" }] }, status: "unavailable" },
    { name: "unsupported verified factor", claims: {}, user: { factors: [{ id: UNSUPPORTED, factor_type: "phone", status: "verified" }] }, status: "unavailable" },
    { name: "unexpected MFA session", claims: { aal: "aal2" }, user: {}, status: "unavailable" },
  ])("fails closed before verification for $name", async ({ claims, user, status }) => {
    fetchMock.mockResolvedValueOnce(passwordResponse(jwt(claims), user));
    expect(await challenge().signInWithPassword(CREDENTIALS)).toEqual({ status });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("requires the verifier to return the identity of the exact submitted session", async () => {
    fetchMock.mockResolvedValueOnce(passwordResponse(jwt()));
    verifySession.mockResolvedValueOnce(BASELINE);
    expect(await challenge().signInWithPassword(CREDENTIALS)).toEqual({ status: "unavailable" });
    expect(verifySession).toHaveBeenCalledOnce();
  });

  it("refuses an attempted real SDK refresh grant before it reaches the transport", async () => {
    const signIn = AuthClient.prototype.signInWithPassword;
    const inspect = vi.fn();
    vi.spyOn(AuthClient.prototype, "signInWithPassword").mockImplementation(async function (this: InstanceType<typeof AuthClient>, input) {
      const response = await signIn.call(this, input);
      const stored = await this.getSession();
      const refresh = await this.refreshSession({ refresh_token: REFRESH });
      inspect(stored.data.session, refresh.error?.code);
      return response;
    });
    fetchMock.mockResolvedValueOnce(passwordResponse(jwt()));
    expect(await challenge().signInWithPassword(CREDENTIALS)).toEqual({ status: "unavailable" });
    expect(inspect).toHaveBeenCalledExactlyOnceWith(null, "request_denied");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("sends no request without a valid baseline, safe project URL and public key, or after cancellation", async () => {
    const canceled = new AbortController();
    canceled.abort();
    await expect(challenge({ signal: canceled.signal }).signInWithPassword(CREDENTIALS)).resolves.toEqual({ status: "unavailable" });
    await expect(challenge({ baseline: { ...BASELINE, sessionId: "" } }).signInWithPassword(CREDENTIALS)).resolves.toEqual({ status: "unavailable" });
    await expect(challenge({ supabaseUrl: "http://isolated.example" }).signInWithPassword(CREDENTIALS)).resolves.toEqual({ status: "unavailable" });
    await expect(challenge({ publicKey: "sb_secret_test_key" }).signInWithPassword(CREDENTIALS)).resolves.toEqual({ status: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cannot start in a server context", async () => {
    vi.stubGlobal("window", undefined);
    await expect(challenge().signInWithPassword(CREDENTIALS)).resolves.toEqual({ status: "unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancels the actual request and ignores a delayed response after the attempt ends", async () => {
    const cancel = new AbortController();
    const network = Promise.withResolvers<Response>();
    fetchMock.mockReturnValueOnce(network.promise);
    const pending = challenge({ signal: cancel.signal }).signInWithPassword(CREDENTIALS);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const signal = fetchMock.mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(false);
    cancel.abort();
    expect(signal?.aborted).toBe(true);
    await expect(pending).resolves.toEqual({ status: "unavailable" });
    network.resolve(passwordResponse(jwt()));
    await new Promise((resolve) => setImmediate(resolve));
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("ignores a password result when cancellation arrives at the SDK's signed-in event", async () => {
    const cancel = new AbortController();
    const events = AuthClient.prototype as unknown as {
      _notifyAllSubscribers(event: string, session: unknown): Promise<void>;
    };
    const notify = events._notifyAllSubscribers;
    const signedIn = vi.spyOn(events, "_notifyAllSubscribers").mockImplementation(async function (this: InstanceType<typeof AuthClient>, event, session) {
      if (event === "SIGNED_IN") cancel.abort();
      await notify.call(this, event, session);
    });
    fetchMock.mockResolvedValueOnce(passwordResponse(jwt()));
    await expect(challenge({ signal: cancel.signal }).signInWithPassword(CREDENTIALS)).resolves.toEqual({ status: "unavailable" });
    expect(signedIn).toHaveBeenCalledOnce();
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("rejects a stale verification that completes after cancellation", async () => {
    const cancel = new AbortController();
    const started = Promise.withResolvers<void>();
    const verification = Promise.withResolvers<typeof PRIVATE>();
    fetchMock.mockResolvedValueOnce(passwordResponse(jwt()));
    verifySession.mockImplementationOnce(() => {
      started.resolve();
      return verification.promise;
    });
    const pending = challenge({ signal: cancel.signal }).signInWithPassword(CREDENTIALS);
    await started.promise;
    cancel.abort();
    await expect(pending).resolves.toEqual({ status: "unavailable" });
    expect(verifySession.mock.calls[0][1].aborted).toBe(true);
    verification.resolve(PRIVATE);
  });

  it("bounds a response with headers but a stalled body and aborts its fetch signal", async () => {
    vi.useFakeTimers();
    const body = new ReadableStream<Uint8Array>();
    fetchMock.mockResolvedValueOnce(new Response(body));
    const pending = challenge().signInWithPassword(CREDENTIALS);
    await vi.advanceTimersByTimeAsync(18_000);
    await expect(pending).resolves.toEqual({ status: "unavailable" });
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("caps a valid password JSON body even when Content-Length is missing", async () => {
    const json = await passwordResponse(jwt()).text();
    fetchMock.mockResolvedValueOnce(streamedResponse(new TextEncoder().encode(json + " ".repeat(64 * 1024))));
    expect(await challenge().signInWithPassword(CREDENTIALS)).toEqual({ status: "unavailable" });
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("reports fixed statuses for credential errors, redirects, and thrown transport errors", async () => {
    const log = vi.spyOn(console, "error");
    fetchMock.mockResolvedValueOnce(Response.json({ error_code: "invalid_credentials", message: CREDENTIALS.password }, { status: 400 }));
    fetchMock.mockResolvedValueOnce(Response.redirect("https://other.example/redirect"));
    fetchMock.mockRejectedValueOnce(new Error(CREDENTIALS.password));
    expect(await challenge().signInWithPassword(CREDENTIALS)).toEqual({ status: "rejected" });
    expect(await challenge().signInWithPassword(CREDENTIALS)).toEqual({ status: "unavailable" });
    expect(await challenge().signInWithPassword(CREDENTIALS)).toEqual({ status: "unavailable" });
    expect(log).not.toHaveBeenCalled();
    expect(verifySession).not.toHaveBeenCalled();
  });
});

describe("optional TOTP for the private password session", () => {
  async function passwordWithTotp(signal = new AbortController().signal) {
    const token = jwt();
    fetchMock.mockResolvedValueOnce(passwordResponse(token, { factors: [VERIFIED_TOTP] }));
    const auth = challenge({ signal });
    expect(await auth.signInWithPassword(CREDENTIALS)).toEqual({ status: "mfa_required", factorIds: [TOTP_ONE], expiresAt: expect.any(Number) });
    expect(verifySession).not.toHaveBeenCalled();
    return { auth, token };
  }

  it("selects a verified TOTP from the password response and binds exact requests and verifier bearer", async () => {
    const passwordToken = jwt();
    const mfaToken = jwt({ aal: "aal2" });
    const auth = challenge();
    const refresh = vi.spyOn(AuthClient.prototype, "refreshSession");
    const setSession = vi.spyOn(AuthClient.prototype, "setSession");
    const signOut = vi.spyOn(AuthClient.prototype, "signOut");
    fetchMock.mockResolvedValueOnce(passwordResponse(passwordToken, {
      factors: [
        VERIFIED_TOTP,
        { ...VERIFIED_TOTP, id: TOTP_TWO },
        { ...VERIFIED_TOTP, id: UNVERIFIED, status: "unverified" },
        { ...VERIFIED_TOTP, id: UNSUPPORTED, factor_type: "webauthn" },
      ],
    }));
    expect(await auth.verifyTotp({ factorId: TOTP_ONE, code: TOTP_CODE })).toEqual({ status: "unavailable" });
    expect(await auth.signInWithPassword(CREDENTIALS)).toEqual({ status: "mfa_required", factorIds: [TOTP_ONE, TOTP_TWO], expiresAt: expect.any(Number) });
    for (const factorId of [UNVERIFIED, UNSUPPORTED, OTHER_ACCOUNT, "../user"]) {
      expect(await auth.verifyTotp({ factorId, code: TOTP_CODE })).toEqual({ status: "rejected" });
    }
    expect(await auth.verifyTotp({ factorId: TOTP_TWO, code: "12345" })).toEqual({ status: "rejected" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(verifySession).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(totpResponse()).mockResolvedValueOnce(passwordResponse(mfaToken));
    expect(await auth.verifyTotp({ factorId: TOTP_TWO, code: TOTP_CODE })).toEqual({ status: "verified", identity: PRIVATE, expiresAt: expect.any(Number) });
    const [, [challengeUrl, challengeInit], [verifyUrl, verifyInit]] = fetchMock.mock.calls;
    expect(challengeUrl).toBe(`${PROJECT}/auth/v1/factors/${TOTP_TWO}/challenge`);
    expect(verifyUrl).toBe(`${PROJECT}/auth/v1/factors/${TOTP_TWO}/verify`);
    for (const init of [challengeInit, verifyInit]) {
      expect(init).toMatchObject({
        method: "POST", redirect: "error", credentials: "omit", cache: "no-store",
        headers: { Authorization: `Bearer ${passwordToken}`, apikey: "sb_publishable_test_key" },
      });
    }
    expect(challengeInit?.body).toBe("{}");
    expect(JSON.parse(String(verifyInit?.body))).toEqual({ challenge_id: CHALLENGE_ID, code: "012345" });
    expect(verifySession).toHaveBeenCalledExactlyOnceWith(mfaToken, verifyInit?.signal);
    expect(await auth.revalidate(new AbortController().signal)).toEqual({ status: "verified", identity: PRIVATE, expiresAt: expect.any(Number) });
    expect(verifySession.mock.calls.map(([bearer]) => bearer)).toEqual([mfaToken, mfaToken]);
    expect(await auth.verifyTotp({ factorId: TOTP_TWO, code: TOTP_CODE })).toEqual({ status: "unavailable" });
    expect(fetchMock.mock.calls.map(([input]) => input)).toEqual([`${PROJECT}/auth/v1/token?grant_type=password`, challengeUrl, verifyUrl]);
    expect(refresh).not.toHaveBeenCalled();
    expect(setSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(cookies).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it.each([
    { id: "../verify" },
    { type: "phone" },
    { expires_at: 1 },
    { expires_at: "9999999999" },
  ])("denies malformed or expired challenge data %j without sending the code", async (fields) => {
    const { auth } = await passwordWithTotp();
    fetchMock.mockResolvedValueOnce(totpResponse(fields));
    expect(await auth.verifyTotp({ factorId: TOTP_ONE, code: TOTP_CODE })).toEqual({ status: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(verifySession).not.toHaveBeenCalled();
  });

  it.each([
    { claims: { sub: OTHER_ACCOUNT }, user: {} },
    { claims: { session_id: BASELINE.sessionId }, user: {} },
    { claims: { session_id: OTHER_ACCOUNT }, user: {} },
    { claims: { aal: "aal1" }, user: {} },
    { claims: { exp: 1 }, user: {} },
    { claims: {}, user: { id: OTHER_ACCOUNT } },
  ])("requires the upgraded token and user to match the private account and session %j", async ({ claims, user }) => {
    const { auth } = await passwordWithTotp();
    fetchMock.mockResolvedValueOnce(totpResponse()).mockResolvedValueOnce(passwordResponse(jwt({ aal: "aal2", ...claims }), user));
    expect(await auth.verifyTotp({ factorId: TOTP_ONE, code: TOTP_CODE })).toEqual({ status: "unavailable" });
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("denies a verifier result for a different session after successful MFA", async () => {
    const { auth } = await passwordWithTotp();
    const upgraded = jwt({ aal: "aal2" });
    fetchMock.mockResolvedValueOnce(totpResponse()).mockResolvedValueOnce(passwordResponse(upgraded));
    verifySession.mockResolvedValueOnce(BASELINE);
    expect(await auth.verifyTotp({ factorId: TOTP_ONE, code: TOTP_CODE })).toEqual({ status: "unavailable" });
    expect(verifySession).toHaveBeenCalledExactlyOnceWith(upgraded, fetchMock.mock.calls[2][1]?.signal);
  });

  it("cannot use pending factors after the password token expires", async () => {
    vi.useFakeTimers();
    const { auth } = await passwordWithTotp();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await auth.verifyTotp({ factorId: TOTP_ONE, code: TOTP_CODE })).toEqual({ status: "unavailable" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("clears pending factors when the shared session is canceled or the private port is disposed", async () => {
    const cancel = new AbortController();
    const { auth } = await passwordWithTotp(cancel.signal);
    const { auth: disposed } = await passwordWithTotp();
    cancel.abort();
    disposed.dispose();
    expect(await auth.verifyTotp({ factorId: TOTP_ONE, code: TOTP_CODE })).toEqual({ status: "unavailable" });
    expect(await disposed.verifyTotp({ factorId: TOTP_ONE, code: TOTP_CODE })).toEqual({ status: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("aborts the actual challenge request and ignores a late challenge body", async () => {
    const cancel = new AbortController();
    const { auth } = await passwordWithTotp(cancel.signal);
    const response = Promise.withResolvers<Response>();
    fetchMock.mockReturnValueOnce(response.promise);
    const result = auth.verifyTotp({ factorId: TOTP_ONE, code: TOTP_CODE });
    cancel.abort();
    expect(fetchMock.mock.calls[1][1]?.signal?.aborted).toBe(true);
    await expect(result).resolves.toEqual({ status: "unavailable" });
    response.resolve(totpResponse());
    await new Promise((resolve) => setImmediate(resolve));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("aborts a lost verify response and forbids retry and refresh after that uncertain result", async () => {
    vi.useFakeTimers();
    const { auth } = await passwordWithTotp();
    const response = Promise.withResolvers<Response>();
    fetchMock.mockResolvedValueOnce(totpResponse()).mockReturnValueOnce(response.promise);
    const submit = { factorId: TOTP_ONE, code: TOTP_CODE };
    const result = auth.verifyTotp(submit);
    await vi.advanceTimersByTimeAsync(18_000);
    expect(fetchMock.mock.calls[2][1]?.signal?.aborted).toBe(true);
    await expect(result).resolves.toEqual({ status: "unavailable" });
    response.resolve(passwordResponse(jwt({ aal: "aal2" })));
    await vi.advanceTimersByTimeAsync(0);
    expect(await auth.verifyTotp(submit)).toEqual({ status: "unavailable" });
    expect(await auth.signInWithPassword(CREDENTIALS)).toEqual({ status: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("aborts verification when its challenge expires, even before the transport timeout", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
    const { auth } = await passwordWithTotp();
    const response = Promise.withResolvers<Response>();
    fetchMock.mockResolvedValueOnce(totpResponse({ expires_at: Date.now() / 1000 + 1 })).mockReturnValueOnce(response.promise);
    const pending = auth.verifyTotp({ factorId: TOTP_ONE, code: TOTP_CODE });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock.mock.calls[2][1]?.signal?.aborted).toBe(true);
    await expect(pending).resolves.toEqual({ status: "unavailable" });
    response.resolve(passwordResponse(jwt({ aal: "aal2" })));
    await vi.advanceTimersByTimeAsync(0);
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("caps streamed challenge JSON despite a lower declared Content-Length", async () => {
    const { auth } = await passwordWithTotp();
    const json = await totpResponse().text();
    fetchMock.mockResolvedValueOnce(streamedResponse(new TextEncoder().encode(json + " ".repeat(4 * 1024)), "12"));
    expect(await auth.verifyTotp({ factorId: TOTP_ONE, code: TOTP_CODE })).toEqual({ status: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared challenge body without waiting on its source", async () => {
    const { auth } = await passwordWithTotp();
    const pull = vi.fn(() => new Promise<void>(() => {}));
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const body = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
    fetchMock.mockResolvedValueOnce(new Response(body, { headers: { "content-length": "4097" } }));
    expect(await auth.verifyTotp({ factorId: TOTP_ONE, code: TOTP_CODE })).toEqual({ status: "unavailable" });
    expect(pull).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(verifySession).not.toHaveBeenCalled();
  });

  it.each(["oversized", "invalid JSON", "invalid UTF-8"])(
    "rejects an otherwise valid upgraded session with %s response data",
    async (failure) => {
      const { auth } = await passwordWithTotp();
      const json = await passwordResponse(jwt({ aal: "aal2" }), { padding: "bad-byte-placeholder" }).text();
      const bytes = new TextEncoder().encode(failure === "oversized" ? json + " ".repeat(64 * 1024) : json);
      if (failure === "invalid JSON") bytes[bytes.length - 1] = 0x5d;
      if (failure === "invalid UTF-8") bytes[json.indexOf("bad-byte-placeholder")] = 0xff;
      const log = vi.spyOn(console, "error");
      fetchMock.mockResolvedValueOnce(totpResponse()).mockResolvedValueOnce(streamedResponse(bytes));
      expect(await auth.verifyTotp({ factorId: TOTP_ONE, code: TOTP_CODE })).toEqual({ status: "unavailable" });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(verifySession).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    },
  );

  it.each(["cancel", "deadline"])("abandons a stalled verify body on %s without waiting for stream cancellation", async (exit) => {
    vi.useFakeTimers();
    const owner = new AbortController();
    const { auth } = await passwordWithTotp(owner.signal);
    const reading = Promise.withResolvers<void>();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const body = new ReadableStream<Uint8Array>({
      pull() {
        reading.resolve();
        return new Promise<void>(() => {});
      },
      cancel,
    }, { highWaterMark: 0 });
    fetchMock.mockResolvedValueOnce(totpResponse()).mockResolvedValueOnce(new Response(body));
    const submit = { factorId: TOTP_ONE, code: TOTP_CODE };
    const pending = auth.verifyTotp(submit);
    await reading.promise;
    if (exit === "cancel") owner.abort();
    else await vi.advanceTimersByTimeAsync(18_000);
    await expect(pending).resolves.toEqual({ status: "unavailable" });
    expect(fetchMock.mock.calls[2][1]?.signal?.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(await auth.verifyTotp(submit)).toEqual({ status: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(verifySession).not.toHaveBeenCalled();
  });
});
