"use client";

import type { SupabaseAuthObserver } from "../context/supabase-auth-observer";
import { createRepoFeedbackPrivateAuth } from "./repo-feedback-private-auth";
import { REPO_FEEDBACK_SESSION_PATH } from "./supabase/repo-feedback-readiness-contract";

const CHANNEL = "repo-feedback-revocation-v1";
const REVOKE = "revoke";
const SESSION_TIMEOUT_MS = 10_000;
const MAX_SESSION_BYTES = 1_024;
const MAX_TOKEN_LENGTH = 8_185;
const JWT = /^[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

type Ports = Parameters<typeof createRepoFeedbackPrivateAuth>[0];

function jwtParts(token: string) {
  const match = token.length <= MAX_TOKEN_LENGTH && JWT.exec(token);
  return match && match[0] === token ? match : null;
}

function isPublicKey(key: string) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.exec(key)?.[0] === key) return true;
  const payload = jwtParts(key)?.[1];
  return Boolean(payload && JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")))?.role === "anon");
}

function isId(value: string) {
  return value.length === 36 && UUID.test(value) && value !== NIL_UUID;
}

// Accept the route's two literal fields only. Matching the serialized form
// prevents duplicate keys from being silently collapsed by JSON.parse.
function parseIdentity(text: string) {
  const match = /^[\t\n\r ]*\{[\t\n\r ]*"(accountId|sessionId)"[\t\n\r ]*:[\t\n\r ]*"([0-9a-fA-F-]+)"[\t\n\r ]*,[\t\n\r ]*"(accountId|sessionId)"[\t\n\r ]*:[\t\n\r ]*"([0-9a-fA-F-]+)"[\t\n\r ]*\}[\t\n\r ]*$/.exec(text);
  if (!match || match[0] !== text || match[1] === match[3] || !isId(match[2]) || !isId(match[4])) return null;
  return match[1] === "accountId"
    ? { accountId: match[2], sessionId: match[4] }
    : { accountId: match[4], sessionId: match[2] };
}

async function readIdentity(response: Response, signal: AbortSignal) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  let complete = false;
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_SESSION_BYTES)) return null;
    const bytes = new Uint8Array(MAX_SESSION_BYTES);
    let offset = 0;
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (signal.aborted) return null;
      if (done) {
        complete = true;
        const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
        return parseIdentity(decoder.decode(bytes.subarray(0, offset)));
      }
      if (value.byteLength === 0 || value.byteLength > bytes.length - offset) return null;
      bytes.set(value, offset);
      offset += value.byteLength;
    }
    return null;
  } finally {
    signal.removeEventListener("abort", cancel);
    if (!complete) cancel();
    reader.releaseLock();
  }
}

function sessionVerifier(browser: Window, url: string): Ports["verifySession"] {
  async function request(token: string, signal: AbortSignal) {
    const response = await browser.fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      credentials: "omit",
      mode: "same-origin",
      redirect: "error",
      cache: "no-store",
      // Omit Referer while preserving the Origin header required by the route.
      referrer: "",
      referrerPolicy: "same-origin",
      signal,
    });
    const mediaType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
    if (signal.aborted || response.redirected || response.status !== 200 || mediaType !== "application/json") {
      void response.body?.cancel().catch(() => {});
      return null;
    }
    return readIdentity(response, signal);
  }

  return async (token, owner) => {
    if (owner.aborted || !jwtParts(token)) return null;
    const deadline = new AbortController();
    const signal = AbortSignal.any([owner, deadline.signal]);
    const expiresAt = Date.now() + SESSION_TIMEOUT_MS;
    const timer = setTimeout(() => deadline.abort(), SESSION_TIMEOUT_MS);
    let onAbort: (() => void) | undefined;
    try {
      const aborted = new Promise<null>((resolve) => {
        onAbort = () => resolve(null);
        signal.addEventListener("abort", onAbort, { once: true });
      });
      const identity = await Promise.race([aborted, request(token, signal)]);
      return signal.aborted || Date.now() >= expiresAt ? null : identity;
    } catch {
      // Network and decoding failures use the same fixed result.
      return null;
    } finally {
      clearTimeout(timer);
      if (onAbort) signal.removeEventListener("abort", onAbort);
      deadline.abort();
    }
  };
}

function release(...actions: (() => void)[]) {
  for (const action of actions) {
    try {
      action();
    } catch {
      // Continue releasing the remaining resources.
    }
  }
}

function revocationChannel(browser: Window & typeof globalThis): Ports["channel"] {
  let publish = () => {};
  return {
    subscribe(listener) {
      const channel = new browser.BroadcastChannel(CHANNEL);
      let active = true;
      function close() {
        if (!active) return;
        active = false;
        publish = () => {};
        release(
          () => channel.removeEventListener("message", message),
          () => channel.removeEventListener("messageerror", fail),
          () => channel.close(),
        );
      }
      function fail() {
        if (!active) return;
        close();
        listener("unavailable");
      }
      function message(event: MessageEvent<unknown>) {
        if (!active) return;
        if (event.data === REVOKE) listener("revoke");
        else fail();
      }
      try {
        channel.addEventListener("message", message);
        channel.addEventListener("messageerror", fail);
      } catch {
        close();
        throw new Error("Feedback revocation is unavailable.");
      }
      publish = () => {
        try {
          channel.postMessage(REVOKE);
        } catch {
          fail();
        }
      };
      return close;
    },
    publishRevocation: () => publish(),
  };
}

function pageLifecycle(browser: Window): Ports["lifecycle"] {
  return {
    subscribe(listener) {
      let active = true;
      const hide = () => { if (active) listener("pagehide"); };
      const show = () => { if (active) listener("pageshow"); };
      function close() {
        if (!active) return;
        active = false;
        release(
          () => browser.removeEventListener("pagehide", hide),
          () => browser.removeEventListener("pageshow", show),
        );
      }
      try {
        browser.addEventListener("pagehide", hide);
        browser.addEventListener("pageshow", show);
      } catch {
        close();
        throw new Error("Feedback page lifecycle is unavailable.");
      }
      return close;
    },
  };
}

/** Dark binding. The password challenge checks deployment readiness. Activation
 * still requires operational approval and live auth checks. Supply the passive
 * observer from SupabaseProvider.
 */
export function createRepoFeedbackBrowser(authObserver: SupabaseAuthObserver) {
  if (typeof window === "undefined" || window.isSecureContext !== true) return null;
  const browser = window;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !publicKey) return null;
  try {
    const project = new URL(supabaseUrl);
    if (project.protocol !== "https:" || project.href !== `${project.origin}/` || !isPublicKey(publicKey)) return null;
    const endpoint = new URL(REPO_FEEDBACK_SESSION_PATH, browser.location.origin);
    return createRepoFeedbackPrivateAuth({
      supabaseUrl,
      publicKey,
      shared: authObserver,
      verifySession: sessionVerifier(browser, endpoint.href),
      channel: revocationChannel(browser),
      lifecycle: pageLifecycle(browser),
    });
  } catch {
    return null;
  }
}
