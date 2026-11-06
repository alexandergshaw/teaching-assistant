"use client";

import { AuthClient } from "@supabase/supabase-js";
import {
  feedbackProjectOrigin,
  REPO_FEEDBACK_MAX_OBSERVATION_AGE_MS,
  REPO_FEEDBACK_READINESS_PATH,
  REPO_FEEDBACK_READINESS_POLICY,
} from "./repo-feedback-readiness-contract";

const TIMEOUT_MS = 18_000;
const MFA_ENTRY_TIMEOUT_MS = 120_000;
const SESSION_RESPONSE_MAX_BYTES = 64 * 1024;
const CHALLENGE_RESPONSE_MAX_BYTES = 4 * 1024;
const MAX_TIMER_DELAY = 2_147_483_647;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const JWT = /^[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+$/;
const TOTP = /^[0-9]{6}$/;

type Identity = Readonly<{ accountId: string; sessionId: string }>;
type Candidate = Readonly<{ token: string; sessionId: string; expiresAt: number }>;
type PendingMfa = Readonly<{
  session: Candidate;
  authUrl: string;
  factorIds: readonly string[];
  deadline: number;
  isReady(): boolean;
}>;
type Verified = { status: "verified"; identity: Identity; expiresAt: number };
type Result = Verified | { status: "rejected" | "unavailable" };
type PasswordResult = Result | { status: "mfa_required"; factorIds: readonly string[]; expiresAt: number };
type Dependencies = {
  supabaseUrl: string;
  publicKey: string;
  baseline: Identity;
  signal: AbortSignal;
  isCurrent?(): boolean;
  verifySession(accessToken: string, signal: AbortSignal): Promise<Identity | null>;
};

const unavailable = () => ({ status: "unavailable" as const });

function isId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value) && value !== NIL_UUID;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

// These claims are only compared with the server's verification of the exact token.
function readClaims(token: string) {
  const encoded = token.length <= 8_185 && JWT.exec(token)?.[1];
  if (!encoded) return null;
  return record(JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/"))));
}

function futureTimestamp(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return null;
  const timestamp = value * 1000;
  return Number.isSafeInteger(timestamp) && timestamp > Date.now() ? timestamp : null;
}

function totpChoices(value: unknown) {
  const ids: string[] = [];
  if (value === undefined) return { required: false, ids };
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  let required = false;
  for (const entry of value) {
    const factor = record(entry);
    if (!factor || !isId(factor.id) || seen.has(factor.id) ||
      (factor.status !== "verified" && factor.status !== "unverified") ||
      (factor.factor_type !== "totp" && factor.factor_type !== "phone" && factor.factor_type !== "webauthn")) return null;
    seen.add(factor.id);
    if (factor.status === "verified") {
      required = true;
      if (factor.factor_type === "totp") ids.push(factor.id);
    }
  }
  return { required, ids };
}

class PasswordClient extends AuthClient {
  constructor(options: ConstructorParameters<typeof AuthClient>[0]) {
    super(options);
    // Auth JS stores successful sign-ins even with persistSession disabled. This
    // one-shot client uses the returned session and discards the SDK's storage writes.
    this.storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }
}

async function bounded<Outcome>(
  owner: AbortSignal,
  operation: (signal: AbortSignal) => Promise<Outcome>,
  expiresAt = Infinity,
) {
  const deadline = new AbortController();
  const signal = AbortSignal.any([owner, deadline.signal]);
  const remaining = expiresAt - Date.now();
  if (signal.aborted || remaining <= 0) return null;
  const timer = setTimeout(() => deadline.abort(), Math.min(TIMEOUT_MS, remaining));
  let onAbort: (() => void) | undefined;
  try {
    const aborted = new Promise<null>((resolve) => {
      onAbort = () => resolve(null);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    const result = await Promise.race([aborted, operation(signal)]);
    return signal.aborted || Date.now() >= expiresAt ? null : result;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener("abort", onAbort);
    deadline.abort();
  }
}

function discardBody(response: Response | null) {
  void response?.body?.cancel().catch(() => {});
}

async function readBoundedJson(response: Response, maxBytes: number, signal: AbortSignal) {
  if (response.body?.locked) return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  // Cancelling releases a pending read even if the source's cancel promise hangs.
  const cancel = () => { void reader.cancel().catch(() => {}); };
  let complete = false;
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) return null;
    const bytes = new Uint8Array(maxBytes);
    let offset = 0;
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (signal.aborted) return null;
      if (done) {
        complete = true;
        const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, offset));
        const value = record(JSON.parse(text));
        return value ? { text, value } : null;
      }
      if (value.byteLength === 0 || value.byteLength > maxBytes - offset) return null;
      bytes.set(value, offset);
      offset += value.byteLength;
    }
    return null;
  } catch {
    return null;
  } finally {
    signal.removeEventListener("abort", cancel);
    if (!complete) cancel();
    reader.releaseLock();
  }
}

async function privateFetch(url: string, init: RequestInit, signal: AbortSignal): Promise<Response | null> {
  if (!signal.aborted) {
    try {
      const response = await fetch(url, {
        ...init,
        signal,
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
      });
      if (!signal.aborted && !response.redirected && (response.status < 300 || response.status >= 400)) return response;
      discardBody(response);
    } catch {
      // Auth JS logs thrown fetch errors. Give it a fixed failure response.
    }
  }
  return null;
}

async function checkReadiness(browser: Window, project: string, signal: AbortSignal) {
  const startedAt = performance.now();
  const response = await browser.fetch(new URL(REPO_FEEDBACK_READINESS_PATH, browser.location.origin).href, {
    method: "POST",
    credentials: "omit",
    mode: "same-origin",
    redirect: "error",
    cache: "no-store",
    referrer: "",
    referrerPolicy: "same-origin",
    signal,
  });
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  const date = response.headers.get("date");
  const serverNow = date ? Date.parse(date) : NaN;
  if (signal.aborted || response.status !== 200 || response.redirected || mediaType !== "application/json" ||
    response.headers.get("cache-control") !== "no-store" || !Number.isFinite(serverNow) ||
    new Date(serverNow).toUTCString() !== date) {
    discardBody(response);
    return null;
  }

  const payload = await readBoundedJson(response, 1_024, signal);
  if (!payload) return null;
  const { origin, policy, expiresAt } = payload.value;
  if (origin !== project || policy !== REPO_FEEDBACK_READINESS_POLICY || typeof expiresAt !== "number" ||
    !Number.isSafeInteger(expiresAt) || expiresAt - serverNow > REPO_FEEDBACK_MAX_OBSERVATION_AGE_MS + 1_000 ||
    payload.text !== JSON.stringify({ origin, policy, expiresAt })) return null;
  // Start the monotonic budget before the request and deduct the Date header's
  // rounding interval so a slow response or local clock rollback cannot extend it.
  const monotonicDeadline = startedAt + (expiresAt - serverNow) - 1_000;
  return { origin, expiresAt, isFresh: () => Date.now() < expiresAt && performance.now() < monotonicDeadline };
}

/** A single password and optional explicit TOTP submission against the
 * attested project. Provider-side MFA verification can interrupt another session.
 * The caller supplies its observed shared identity and aborts if that identity or
 * its owning lifecycle changes. The verifier must check the submitted bearer and
 * current assurance requirements.
 */
export function createRepoFeedbackPasswordChallenge(deps: Dependencies) {
  const { baseline, signal: ownerSignal, supabaseUrl, publicKey, verifySession, isCurrent = () => true } = deps;
  const { accountId, sessionId: sharedSessionId } = baseline;
  const lifetime = new AbortController();
  const owner = AbortSignal.any([ownerSignal, lifetime.signal]);
  let started = false;
  let pending: PendingMfa | undefined;
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;
  let retained: Candidate | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;

  function current(signal: AbortSignal, expiresAt = Infinity) {
    return !signal.aborted && Date.now() < expiresAt && isCurrent() && !signal.aborted;
  }

  function clearPending() {
    pending = undefined;
    clearTimeout(pendingTimer);
    if (!retained) owner.removeEventListener("abort", clearSecrets);
  }

  function clearSecrets() {
    retained = undefined;
    clearTimeout(expiryTimer);
    clearPending();
  }

  function expireRetained() {
    if (!retained) return;
    const remaining = retained.expiresAt - Date.now();
    if (remaining <= 0) clearSecrets();
    else expiryTimer = setTimeout(expireRetained, Math.min(remaining, MAX_TIMER_DELAY));
  }

  function verifiedResult(candidate: Candidate): Verified {
    return { status: "verified", identity: { accountId, sessionId: candidate.sessionId }, expiresAt: candidate.expiresAt };
  }

  function retain(candidate: Candidate): Result {
    if (!current(owner, candidate.expiresAt)) return unavailable();
    retained = candidate;
    owner.addEventListener("abort", clearSecrets, { once: true });
    expireRetained();
    return verifiedResult(candidate);
  }

  function sessionCandidate(token: unknown, level: "aal1" | "aal2"): Candidate | null {
    if (typeof token !== "string") return null;
    const claims = readClaims(token);
    const sessionId = claims?.session_id;
    const expiresAt = futureTimestamp(claims?.exp);
    if (claims?.sub !== accountId || !isId(sessionId) || sessionId === sharedSessionId ||
      claims.aal !== level || expiresAt === null) return null;
    return { token, sessionId, expiresAt };
  }

  async function verifyCandidate(candidate: Candidate, signal: AbortSignal, deadline = candidate.expiresAt) {
    const expiresAt = Math.min(deadline, candidate.expiresAt);
    if (!current(signal, expiresAt)) return false;
    const verified = await verifySession(candidate.token, signal);
    return current(signal, expiresAt) && verified?.accountId === accountId && verified.sessionId === candidate.sessionId;
  }

  async function signInWithPassword({ email, password }: { email: string; password: string }): Promise<PasswordResult> {
    if (started) return unavailable();
    started = true;
    if (typeof window === "undefined" || !current(owner) || !email || !password ||
      !isId(accountId) || !isId(sharedSessionId)) return unavailable();

    let client: PasswordClient | undefined;
    const result = await bounded(owner, async (signal): Promise<Result | PendingMfa | Candidate> => {
      const project = feedbackProjectOrigin(supabaseUrl);
      if (!project ||
        !(publicKey.startsWith("sb_publishable_") || readClaims(publicKey)?.role === "anon")) return unavailable();

      const readiness = await checkReadiness(window, project, signal);
      if (!readiness || !current(signal) || !readiness.isFresh()) return unavailable();
      const authUrl = `${readiness.origin}/auth/v1`;
      const passwordUrl = `${readiness.origin}/auth/v1/token?grant_type=password`;
      let sent = false;
      let unexpectedRequest = false;
      client = new PasswordClient({
        url: authUrl,
        headers: { apikey: publicKey, Authorization: `Bearer ${publicKey}` },
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        skipAutoInitialize: true,
        storageKey: `repo-feedback-password-${window.crypto.randomUUID()}`,
        debug: false,
        async fetch(input, init) {
          if (!current(signal) || !readiness.isFresh()) return new Response(null, { status: 503 });
          if (input !== passwordUrl || init?.method !== "POST" || sent) {
            unexpectedRequest = true;
            return Response.json({ error_code: "request_denied" }, { status: 400 });
          }
          sent = true;
          const response = await privateFetch(input, init, signal);
          if (!current(signal)) {
            discardBody(response);
            return new Response(null, { status: 503 });
          }
          const json = response && await readBoundedJson(response, SESSION_RESPONSE_MAX_BYTES, signal);
          if (!current(signal) || !response || !json) return new Response(null, { status: 503 });
          if (response.ok) return new Response(json.text, { status: 200 });
          if (json.value.code === "invalid_credentials" || json.value.error_code === "invalid_credentials") {
            return Response.json({ error_code: "invalid_credentials" }, { status: 400 });
          }
          return new Response(null, { status: 503 });
        },
      });

      const { data, error } = await client.signInWithPassword({ email, password });
      if (!current(signal) || !readiness.isFresh() || !sent || unexpectedRequest) return unavailable();
      if (error) return error.code === "invalid_credentials" ? { status: "rejected" } : unavailable();
      if (data.user?.id !== accountId || data.user.is_anonymous !== false) return { status: "rejected" };

      const session = sessionCandidate(data.session?.access_token, "aal1");
      const choices = totpChoices(data.user.factors);
      if (!session || !choices) return unavailable();
      if (choices.required) {
        if (!choices.ids.length) return unavailable();
        const deadline = Math.min(session.expiresAt, Date.now() + MFA_ENTRY_TIMEOUT_MS, readiness.expiresAt);
        return { session, authUrl, factorIds: choices.ids, deadline, isReady: readiness.isFresh };
      }
      const verified = await verifyCandidate(session, signal);
      return verified && !unexpectedRequest ? session : unavailable();
    });

    try {
      await client?.stopAutoRefresh();
    } catch {
      return unavailable();
    }
    if (!current(owner) || !result) return unavailable();
    if ("status" in result) return result;
    if ("token" in result) return retain(result);
    if (!current(owner, result.deadline) || !result.isReady()) return unavailable();

    pending = result;
    pendingTimer = setTimeout(clearPending, result.deadline - Date.now());
    owner.addEventListener("abort", clearSecrets, { once: true });
    return { status: "mfa_required", factorIds: [...result.factorIds], expiresAt: result.deadline };
  }

  async function verifyTotp({ factorId, code }: { factorId: string; code: string }): Promise<Result> {
    const attempt = pending;
    if (!attempt) return unavailable();
    if (!current(owner, attempt.deadline) || !attempt.isReady()) {
      clearPending();
      return unavailable();
    }
    if (!attempt.factorIds.includes(factorId) || typeof code !== "string" || !TOTP.test(code)) return { status: "rejected" };
    clearPending();

    const result = await bounded(owner, async (signal): Promise<Candidate | null> => {
      const factorUrl = `${attempt.authUrl}/factors/${factorId}`;
      const headers = {
        apikey: publicKey,
        Authorization: `Bearer ${attempt.session.token}`,
        "Content-Type": "application/json",
        "X-Supabase-Api-Version": "2024-01-01",
      };
      if (!current(signal, attempt.deadline) || !attempt.isReady()) return null;
      const response = await privateFetch(`${factorUrl}/challenge`, { method: "POST", headers, body: "{}" }, signal);
      if (!response?.ok || !current(signal, attempt.deadline)) {
        discardBody(response);
        return null;
      }
      const challenge = (await readBoundedJson(response, CHALLENGE_RESPONSE_MAX_BYTES, signal))?.value;
      const expiresAt = futureTimestamp(challenge?.expires_at);
      if (!current(signal, attempt.deadline) || challenge?.type !== "totp" || !isId(challenge.id) || expiresAt === null) return null;

      const challengeId = challenge.id;
      return bounded(signal, async (verifySignal) => {
        if (!current(verifySignal, attempt.deadline) || !attempt.isReady()) return null;
        const verifiedResponse = await privateFetch(`${factorUrl}/verify`, {
          method: "POST",
          headers,
          body: JSON.stringify({ challenge_id: challengeId, code }),
        }, verifySignal);
        if (!verifiedResponse?.ok || !current(verifySignal, attempt.deadline)) {
          discardBody(verifiedResponse);
          return null;
        }
        const verifiedData = (await readBoundedJson(verifiedResponse, SESSION_RESPONSE_MAX_BYTES, verifySignal))?.value;
        const user = record(verifiedData?.user);
        const session = sessionCandidate(verifiedData?.access_token, "aal2");
        if (user?.id !== accountId || user.is_anonymous !== false || session?.sessionId !== attempt.session.sessionId) {
          return null;
        }
        const verified = await verifyCandidate(session, verifySignal, Math.min(attempt.deadline, expiresAt));
        return verified ? session : null;
      }, Math.min(attempt.deadline, expiresAt));
    }, attempt.deadline);
    return result && current(owner, attempt.deadline) ? retain(result) : unavailable();
  }

  async function revalidate(signal: AbortSignal): Promise<Verified | ReturnType<typeof unavailable>> {
    const candidate = retained;
    if (!candidate || signal.aborted) return unavailable();
    if (!current(owner, candidate.expiresAt)) {
      clearSecrets();
      return unavailable();
    }
    const verified = await bounded(AbortSignal.any([owner, signal]),
      (requestSignal) => verifyCandidate(candidate, requestSignal), candidate.expiresAt);
    if (retained !== candidate || signal.aborted) return unavailable();
    if (verified && current(owner, candidate.expiresAt)) return verifiedResult(candidate);
    clearSecrets();
    return unavailable();
  }

  return {
    signInWithPassword,
    verifyTotp,
    revalidate,
    dispose() {
      clearSecrets();
      lifetime.abort();
    },
  };
}
