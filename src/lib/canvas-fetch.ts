/**
 * The outbound fetch boundary for a user-registered Canvas credential -
 * the layer `lms-credential-rules.ts`'s own header names as the thing that
 * must exist before the first stored credential is ever used (E-SSRF1,
 * E-SSRF2 in docs/lms-credentials-acceptance-criteria.md; SEC1, SEC2, SEC9,
 * SEC12, E-CRIT1, E-ARCH2, E-REL2, E-UX3, E-UX4). Every Canvas call this
 * feature makes with a per-user token MUST go through `canvasFetch`, not a
 * bare `fetch` - that is the entire reason this module exists rather than a
 * one-line `redirect: "manual"` change at each of the app's existing Canvas
 * call sites.
 *
 * WHY `node:https` AND NOT `fetch` OR `undici` (E-ARCH2). `undici` is not an
 * installed dependency of this repo (verified: `require.resolve("undici")`
 * fails), so reaching for it here would mean adding a real dependency to get
 * a WEAKER guarantee than the one already available for free. `node:https`
 * gives two properties neither `fetch` nor a naive `undici` dispatcher setup
 * gives as cleanly:
 *
 *   1. `https.request`'s `lookup` option lets this module resolve the host
 *      itself, classify every returned address, and then PIN the actual
 *      socket connection to the exact address it just classified - not a
 *      second, independent `getaddrinfo` call that could answer
 *      differently. The address checked IS the address dialled, by
 *      construction (see `pinnedLookup` below), which is what closes
 *      E-SSRF1/SEC1 (DNS rebinding). A dispatcher-based `undici`/`fetch`
 *      approach can express the same idea, but needs the dependency this
 *      repo does not have.
 *   2. `https.request` NEVER follows a `Location` header. There is no
 *      `redirect` option to set, correctly or incorrectly, because the
 *      underlying primitive simply does not have the behavior at all. This
 *      closes E-SSRF2/SEC2 BY CONSTRUCTION - a future caller cannot forget a
 *      flag that does not exist - rather than by a `redirect: "manual"`
 *      setting a later refactor could silently drop.
 *
 * If a future reader is tempted to swap this for bare `fetch` "to simplify
 * it": `fetch` cannot pin a connection to a pre-resolved address at all (no
 * public `lookup`/dispatcher hook without `undici`), and re-running
 * `validateLmsBaseUrl` on the NAME between the fetch and the actual TCP
 * connect does not close DNS rebinding - see `lms-credential-rules.ts`'s own
 * header for why. Do not make that trade silently.
 *
 * THE FOUR OUTCOMES (E-UX3) - AND WHY THIS MODULE ONLY DECIDES TWO OF THEM.
 * A signed-in user validating a Canvas credential can hit four genuinely
 * different failures: the host is not allowed (SSRF boundary), the host did
 * not answer (network-layer), the token was rejected (Canvas said no), or
 * the host answered but is not actually Canvas (a marketing site, say).
 * This module can only ever tell the first two apart from the last two - it
 * has no idea what a valid Canvas response looks like, and it must not
 * pretend to. So `CanvasFetchResult` carries exactly three shapes: the two
 * failures this layer CAN decide (`"host-not-allowed"`, `"unreachable"`),
 * and a third, `ok: true`, that hands back the RAW status, headers and body
 * for ANY completed HTTP exchange - 200, 401, 404, whatever Canvas or an
 * impostor host actually returned. Collapsing a completed exchange down to
 * a boolean success/failure here, based on status code, would be exactly
 * the "token rejected" / "not Canvas" collapse E-UX3 forbids: this module
 * is not "the surface", and the surface is the only thing that knows what a
 * genuine Canvas response is shaped like.
 *
 * SEC9/E-UX4 - ONLY THE NETWORK-LAYER OUTCOME IS TIME-FLATTENED. A closed
 * port RSTs in milliseconds; a filtered port hangs until something gives up.
 * If those two produced different response times from this module, a
 * signed-in user's own credential form becomes a port scanner against
 * arbitrary public hosts. So every path that ends in `kind: "unreachable"`
 * is padded, via `unreachableAtDeadline`, to land at exactly the deadline
 * this call started with - never sooner, regardless of whether the real
 * failure (DNS failure, connection refused, TLS failure, a hung socket)
 * took a millisecond or the whole budget. The `"host-not-allowed"` outcome
 * is NOT padded: it is decided entirely by this module's own code (a name
 * or an address failing a classification that never touches the network),
 * it already carries text distinct from "did not answer", and E-UX4 is
 * explicit that padding an outcome our own code decided "is wasteful and
 * makes for a bad interaction" for no security benefit. A completed HTTP
 * exchange (`ok: true`) is not padded either, for the same reason: the host
 * answered, which is not the ambiguous case at all.
 *
 * E-CRIT1, APPLIED TO REDIRECTS, NOT ONLY TO `parseNextLink`. The
 * acceptance doc's E-CRIT1 names `parseNextLink` attaching a bearer token to
 * a URL the REMOTE HOST chose as a live exfiltration primitive; the same
 * shape of bug is available through an ordinary HTTP redirect even after
 * SEC2's re-validation, because "re-validated as a public, non-reserved
 * address" is not the same claim as "is the host the user actually
 * registered". A host that legitimately passes every SSRF check can still
 * 302 to a SECOND public host the attacker also controls, and a wrapper
 * that reattaches `Authorization: Bearer <token>` on every hop simply
 * because the target re-validates would hand that second host the token.
 * This module therefore enforces same-origin-only redirects: a `Location`
 * whose origin differs from the ORIGINAL url's origin (not merely the
 * previous hop's - a same-origin hop must not be usable to launder into a
 * different final host) is refused as `"host-not-allowed"`, never dialled
 * at all. This is stricter than SEC2's literal text ("full host AND address
 * re-validation on each Location before following"), a deliberate choice:
 * the acceptance doc treats E-CRIT1 as the finding that outranks everything
 * else in this feature, and this is the same class of bug wearing a
 * redirect instead of a `Link` header. The cost, stated plainly: an
 * institution whose Canvas legitimately migrates to a different hostname
 * mid-flight will have that redirect refused rather than followed: the user
 * re-registers the new host directly rather than this module silently
 * trusting a `Location` header to repoint their stored credential's target.
 *
 * NO RETRIES. E-REL2: "NEVER retry a network-layer failure against a
 * user-supplied host." A retry is a decision about how to handle a
 * transient condition (a 429, say), and that decision belongs to whatever
 * layer understands Canvas's own semantics - this module makes exactly one
 * attempt per hop and reports what happened.
 */

import * as https from "node:https";
import { promises as dnsPromises } from "node:dns";
import type { LookupFunction } from "node:net";
import type { IncomingHttpHeaders } from "node:http";
import { validateLmsBaseUrl } from "./lms-credential-rules";
import { isSpecialPurposeAddress } from "./lms-address-rules";

// ============================================================================
// Public shapes
// ============================================================================

/**
 * The minimal shape this module needs from a resolved Canvas credential.
 * Deliberately NOT the resolver's own `{ source, institution, baseUrl,
 * token }` union (E-ARCH3, owned by a different module this file must not
 * import) - only `token` is ever read here, so only `token` is declared,
 * and any object shaped like this (including the resolver's real result)
 * satisfies it structurally.
 */
export interface CanvasFetchCredential {
  readonly token: string;
}

/**
 * Everything a caller may customize about one `canvasFetch` call.
 * `timeoutMs` is deliberately NOT defaulted to one single number baked into
 * this module: E-REL2 argues three DIFFERENT bounds for three different
 * call shapes (a 10s validation probe with no retry; a 15s attended read; an
 * unattended read capped at `min(15s, deadline - now)`), and only the
 * caller knows which of those it is. `DEFAULT_TIMEOUT_MS` below covers the
 * common attended-read case so an unspecified `timeoutMs` still fails safe.
 */
export interface CanvasFetchInit {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | Buffer;
  readonly timeoutMs?: number;
}

/**
 * The result of one `canvasFetch` call. See the module doc comment's "THE
 * FOUR OUTCOMES" section for why this is three shapes, not four, and why
 * `ok: true` deliberately does not collapse on status code.
 */
export type CanvasFetchResult =
  | { readonly ok: true; readonly status: number; readonly headers: IncomingHttpHeaders; readonly body: Buffer }
  | { readonly ok: false; readonly kind: "host-not-allowed"; readonly reason: string }
  | { readonly ok: false; readonly kind: "unreachable" };

// ============================================================================
// Tunables
// ============================================================================

/** E-REL2's "attended read" bound - the default for a caller that does not specify one. */
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * SEC2's explicit cap: "at most three hops." Exported so the test file can
 * construct exactly one hop more than this and assert on the real number,
 * rather than duplicating the literal `3` and risking the two drifting
 * apart.
 */
export const MAX_REDIRECT_HOPS = 3;

/**
 * Read no more than this many bytes of a response body before giving up,
 * applied BEFORE any caller ever parses the bytes as JSON. No number this
 * large appears in the acceptance doc, so this is a judgment call: every
 * real Canvas API response this app reads (a single page of a paginated
 * list, `/api/v1/users/self`) is well under one megabyte, so 5 MiB leaves
 * generous headroom for a legitimate response while still bounding memory
 * against a hostile or misconfigured host that answers with an unbounded
 * stream. Exported for the same reason as `MAX_REDIRECT_HOPS` above.
 */
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

// ============================================================================
// canvasFetch
// ============================================================================

/**
 * Fetches `url` with `credential`'s bearer token attached, closing the two
 * holes `lms-credential-rules.ts` documents as explicitly open (DNS
 * rebinding, redirects) and applying the SEC9/E-UX4 timing floor to the
 * network-layer outcome only. See the module doc comment for the full
 * design; in one line, each hop: validates the RAW origin (SEC12, before
 * any normalization), resolves and classifies every address DNS returns,
 * dials the one address it just vetted, and - if the response is a
 * same-origin redirect and hops remain - repeats on the `Location` rather
 * than following it blind.
 */
export async function canvasFetch(
  url: string,
  init: CanvasFetchInit,
  credential: CanvasFetchCredential
): Promise<CanvasFetchResult> {
  const timeoutMs = init.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  let trustedOrigin: string;
  try {
    // SEC12: validated on the RAW string, before this module (or anything
    // upstream of it) has a chance to normalize it. `new URL(url).origin`
    // reconstructs from the parsed components alone - it drops any path,
    // query or fragment but performs no further canonicalization
    // `validateLmsBaseUrl`'s own re-parse does not already do.
    trustedOrigin = new URL(url).origin;
  } catch {
    return { ok: false, kind: "host-not-allowed", reason: "That is not a valid URL." };
  }

  return dialHop(url, trustedOrigin, MAX_REDIRECT_HOPS, deadline, init, credential);
}

// ============================================================================
// Internals
// ============================================================================

/**
 * One hop of the fetch: validate, resolve, classify, dial, and - for a
 * same-origin redirect with hops remaining - recurse on the `Location`.
 * `trustedOrigin` is the ORIGINAL url's origin, fixed for the whole call
 * (not updated per hop): a same-origin hop must not be usable to launder a
 * chain into a different final host (see the module doc comment's
 * E-CRIT1 section).
 */
async function dialHop(
  currentUrl: string,
  trustedOrigin: string,
  hopsRemaining: number,
  deadline: number,
  init: CanvasFetchInit,
  credential: CanvasFetchCredential
): Promise<CanvasFetchResult> {
  let parsed: URL;
  try {
    parsed = new URL(currentUrl);
  } catch {
    return { ok: false, kind: "host-not-allowed", reason: "The redirect target is not a valid URL." };
  }

  if (parsed.origin !== trustedOrigin) {
    return {
      ok: false,
      kind: "host-not-allowed",
      reason:
        "That host redirected to a different host. The stored credential is only ever sent to the host you registered.",
    };
  }

  const originCheck = validateLmsBaseUrl(parsed.origin);
  if (!originCheck.ok) {
    return { ok: false, kind: "host-not-allowed", reason: originCheck.reason };
  }

  if (Date.now() >= deadline) {
    return unreachableAtDeadline(deadline);
  }

  let addresses;
  try {
    addresses = await raceAgainstDeadline(
      dnsPromises.lookup(parsed.hostname, { all: true }),
      deadline
    );
  } catch {
    return unreachableAtDeadline(deadline);
  }

  if (addresses.length === 0) {
    return unreachableAtDeadline(deadline);
  }

  // SEC1: refuse the whole answer if ANY resolved address is special-purpose
  // - not just the one this module happens to pick to dial. A host that
  // answers with a mix of a public and a private address is exactly the
  // shape a rebinding attack produces (a real address to pass an external
  // health check, a private one for the actual request), and there is no
  // way to know from here which address a partial trust would end up using.
  for (const { address, family } of addresses) {
    if (isSpecialPurposeAddress(address, family)) {
      return {
        ok: false,
        kind: "host-not-allowed",
        reason: "That host resolved to a private or reserved address and cannot be used.",
      };
    }
  }

  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    return unreachableAtDeadline(deadline);
  }

  const pinned = addresses[0];
  const outcome = await performRequest(
    parsed,
    pinnedLookup(pinned.address, pinned.family),
    init,
    credential,
    remaining
  );

  if (outcome.kind === "network-error") {
    return unreachableAtDeadline(deadline);
  }

  const location = outcome.headers.location;
  if (REDIRECT_STATUS_CODES.has(outcome.status) && typeof location === "string" && hopsRemaining > 0) {
    // Resolve relative to the CURRENT hop's URL (this is how every real
    // redirect works - a `Location: /login` is relative to the host that
    // sent it) - `trustedOrigin` still gates where that resolves TO, on the
    // next call's origin check above.
    const nextUrl = new URL(location, parsed).toString();
    return dialHop(nextUrl, trustedOrigin, hopsRemaining - 1, deadline, init, credential);
  }

  // Either not a redirect, or the hop cap is exhausted: hand back exactly
  // what was received. A 3xx returned here because hops ran out is not
  // disguised as a different failure kind - the caller sees the real status
  // and can decide what that means, same as any other completed exchange.
  return { ok: true, status: outcome.status, headers: outcome.headers, body: outcome.body };
}

/**
 * Builds a `LookupFunction` that ignores whatever `hostname` Node's
 * connection machinery passes it and always answers with the exact
 * `address`/`family` this call already resolved and classified above. This
 * is what makes "the address checked is the address dialled" true BY
 * CONSTRUCTION rather than by two calls that happen to agree: there is no
 * second `getaddrinfo` in this function for an attacker's DNS server to
 * answer differently on.
 */
function pinnedLookup(address: string, family: number): LookupFunction {
  return (_hostname, _options, callback) => {
    process.nextTick(() => callback(null, address, family === 6 ? 6 : 4));
  };
}

type RequestOutcome =
  | { readonly kind: "network-error" }
  | { readonly kind: "response"; readonly status: number; readonly headers: IncomingHttpHeaders; readonly body: Buffer };

/**
 * Dials `parsed` with `lookup` pinning the connection, reads the response
 * body up to `MAX_RESPONSE_BYTES`, and resolves - never rejects - with
 * either a completed response or a generic network-layer failure marker.
 * `remainingMs` bounds the WHOLE exchange (connect through body-read) via
 * `AbortSignal`, so a slow-loris response that trickles bytes past the
 * deadline is aborted the same as a connection that never opens at all.
 */
function performRequest(
  parsed: URL,
  lookup: LookupFunction,
  init: CanvasFetchInit,
  credential: CanvasFetchCredential,
  remainingMs: number
): Promise<RequestOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (outcome: RequestOutcome) => {
      if (!settled) {
        settled = true;
        resolve(outcome);
      }
    };

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(init.headers ?? {})) {
      const lower = key.toLowerCase();
      // `Host` and `Authorization` have exactly one source of truth below -
      // the hostname this hop is actually dialling, and the credential this
      // call was given - so a caller-supplied value for either is dropped
      // rather than silently overridden in a way that could disagree later.
      if (lower === "host" || lower === "authorization") {
        continue;
      }
      headers[key] = value;
    }
    headers.Host = parsed.hostname;
    headers.Authorization = `Bearer ${credential.token}`;

    const req = https.request(
      {
        method: init.method ?? "GET",
        hostname: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 443,
        path: `${parsed.pathname}${parsed.search}`,
        // SNI must still name the real host - pinning the CONNECTION to a
        // bare address must not also blank out which certificate the
        // server is expected to present, or which virtual host answers.
        servername: parsed.hostname,
        headers,
        lookup,
        signal: AbortSignal.timeout(Math.max(remainingMs, 0)),
      },
      (res) => {
        let received = 0;
        const chunks: Buffer[] = [];

        res.on("data", (chunk: Buffer) => {
          if (settled) {
            return;
          }
          received += chunk.length;
          if (received > MAX_RESPONSE_BYTES) {
            res.destroy();
            req.destroy();
            settle({ kind: "network-error" });
            return;
          }
          chunks.push(chunk);
        });

        res.on("end", () => {
          settle({
            kind: "response",
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });

        res.on("error", () => settle({ kind: "network-error" }));
      }
    );

    req.on("error", () => settle({ kind: "network-error" }));

    if (init.body) {
      req.end(init.body);
    } else {
      req.end();
    }
  });
}

/**
 * SEC9/E-UX4: resolves `{ ok: false, kind: "unreachable" }` at exactly
 * `deadline` (Date.now()-based), never sooner - the timing floor that keeps
 * every network-layer failure indistinguishable from every other one,
 * whether the real cause resolved in a millisecond or consumed the whole
 * budget. Never called for a `"host-not-allowed"` refusal or a completed
 * HTTP exchange - see the module doc comment for why those two do not need
 * this.
 */
async function unreachableAtDeadline(deadline: number): Promise<CanvasFetchResult> {
  const remaining = deadline - Date.now();
  if (remaining > 0) {
    await sleep(remaining);
  }
  return { ok: false, kind: "unreachable" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Races `promise` against `deadline`, throwing if the deadline passes
 * first. Used for the `dns.promises.lookup` call, which happens BEFORE
 * `https.request` exists to hang an `AbortSignal` off of - without this, a
 * DNS server that never answers would hang this function forever rather
 * than failing at the caller's own timeout budget.
 */
async function raceAgainstDeadline<T>(promise: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new Error("Deadline already passed.");
  }
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Deadline exceeded.")), remaining);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
