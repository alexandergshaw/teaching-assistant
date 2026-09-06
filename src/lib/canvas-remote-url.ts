import { parseIpv4, isSpecialPurposeIpv4, isSpecialPurposeIpv6 } from "./lms-address-rules";

/**
 * Refuses to let this app dial a URL that a remote Canvas host chose, unless
 * that URL is on the exact same origin as the Canvas base URL this request's
 * credentials were already resolved for. This is the guard named E-CRIT1 in
 * docs/lms-credentials-acceptance-criteria.md - read that section before
 * changing anything below.
 *
 * THE PRIMITIVE THIS CLOSES. `parseNextLink` (src/lib/canvas-core.ts) returns
 * whatever URL sits in a response's `Link: rel="next"` header, verbatim, with
 * no host check of any kind. Every one of its 26 call sites then dials that
 * URL with `Authorization: Bearer <token>` attached. A hostile or compromised
 * Canvas host - or, after this feature ships, anything a signed-in user
 * registers as their own institution's base URL - can hand back a `next` link
 * pointing anywhere, and the app will carry the caller's bearer token there.
 * The same shape applies to the seven attachment/progress URLs named in SEC3
 * of the acceptance doc (Canvas JSON fields such as `attachment.url` or
 * `progress_url`, fetched with the token on retry). Both classes go through
 * this one module rather than each growing its own copy of the check.
 *
 * WHY THIS IS NOT COVERED BY THE OTHER TWO FIXES ALREADY IN THIS CODEBASE.
 * SEC2's `redirect: "manual"` policy only governs a `Location:` header on the
 * response to a request THIS app already made to a URL it already trusted;
 * here the app is constructing a brand-new request, from scratch, to a URL
 * that arrived inside a response body or header. There is no redirect for a
 * `redirect` policy to intercept. And this is not one of SEC3's seven
 * attachment sites either - `parseNextLink` is the primary read path of the
 * entire app, which is exactly why the finding that created this module
 * treats it as the more severe of the two.
 *
 * THE EXISTING PRECEDENT, GENERALIZED. `assertProgressUrlIsSameOrigin`
 * (src/lib/canvas-modules/migrations.ts) is the one place in the codebase
 * that already does this correctly: parse both URLs, compare `.origin`, throw
 * if they differ. This module lifts that exact reasoning into a shared,
 * total, defensively-typed function so the other 25 call sites can adopt it
 * without re-deriving it - and, per that file's own SSRF note, without ever
 * inventing a second, slightly different version of the same check.
 *
 * ORIGINS ARE COMPARED AS PARSED VALUES, NEVER AS STRING PREFIXES.
 * `https://canvas.example.edu.evil.com` starts with the base's hostname as a
 * plain string, and a `candidate.startsWith(baseUrl)` check (or any regex
 * standing in for one) passes it - `.evil.com` is a suffix of the attacker's
 * OWN label, not a subdomain relationship, and a substring test cannot tell
 * the difference. This module never does a string comparison of any kind on
 * the raw candidate; both the candidate and the base are parsed with the
 * platform's own `URL` constructor - the same parser Node's `fetch` uses
 * internally, for the identical "checker and fetcher must agree" reason
 * ./lms-credential-rules.ts gives for making the same choice - and only the
 * parsed `.origin` values are ever compared.
 *
 * "SAME ORIGIN" MEANS SCHEME, HOST, AND PORT - A PORT MISMATCH IS A REFUSAL.
 * This is `URL.origin` equality, i.e. exactly the browser's own same-origin
 * definition, and deliberately not some looser "same hostname" comparison.
 * ./lms-credential-rules.ts's `normalizeLmsBaseUrl` already documents why
 * port is part of a Canvas institution's identity: one school can legitimately
 * run Canvas behind a non-default port (a self-hosted install fronted by a
 * reverse proxy on 8443, say), and a same-host request to a DIFFERENT port is
 * not guaranteed to reach the same service at all - it is precisely the
 * distinction browsers encode by including port in same-origin policy in the
 * first place. There is no institution-specific reason to be looser here than
 * the platform already is, so this module is not.
 *
 * A RELATIVE URL IS ACCEPTED, RESOLVED AGAINST THE BASE, AND RE-CHECKED - NOT
 * REFUSED OUTRIGHT. Canvas's own API documentation says pagination links are
 * always absolute, but RFC 5988 does not require that of a Link header in
 * general, and a JSON body field is under no such constraint at all. Refusing
 * every relative reference outright would be safe but would also break a
 * theoretically legitimate relative `next` link for no security benefit,
 * because resolving a relative reference against the base and THEN comparing
 * origins is exactly as safe as refusing it outright: a same-path relative
 * reference (`/api/v1/courses?page=2`) resolves to the base's own origin and
 * passes, while a PROTOCOL-RELATIVE reference (`//evil.com/x`) - the one
 * shape that looks relative but is not authority-relative - resolves to a
 * completely different origin and is caught by the identical check applied to
 * every other candidate. Verified directly against Node's `URL`: resolving
 * `"//evil.com/x"` against `"https://canvas.example.edu"` yields origin
 * `https://evil.com`, which this function refuses like any other cross-origin
 * candidate. So accepting relative references costs nothing and buys
 * robustness against a technically-legal Link header shape this module has no
 * reason to special-case away.
 *
 * TOTAL: EVERY CALL EITHER RETURNS A SAFE STRING OR THROWS THIS MODULE'S OWN
 * `Error`, NEVER A RAW PARSER EXCEPTION. `candidate` is typed `unknown`
 * because its real-world source is a header value or an untyped JSON field -
 * whatever a remote server chose to send. A non-string, an empty or
 * whitespace-only string, and a string the `URL` constructor cannot parse
 * even against a base (a malformed authority such as an unterminated IPv6
 * bracket, verified to throw) are all refused through the same guarded path
 * as a well-formed but cross-origin URL, never left to bubble a native
 * `TypeError` out of `new URL(...)`. An empty or whitespace-only string gets
 * its own check BEFORE parsing specifically because `new URL("", base)`
 * resolves successfully to the base itself (verified) - silently treating "no
 * URL at all" as "the base URL" would both mask a caller bug and, in a
 * pagination loop, produce a request back to page one dressed up as a
 * refusal-free success.
 *
 * A `javascript:` OR OTHER OPAQUE-ORIGIN URL IS REFUSED WITHOUT A SPECIAL
 * CASE. `new URL("javascript:alert(1)", base).origin` is the literal string
 * `"null"` (verified), which never equals a real Canvas base's origin, so the
 * general origin-inequality branch already refuses it. The one place this
 * module does add an explicit check is on the BASE URL's own origin: if the
 * caller ever passes a base that itself resolves to an opaque origin, EVERY
 * candidate's opaque origin would read back as the same string `"null"` and
 * appear to match by pure coincidence of `URL`'s string representation for
 * "no origin" - so a `baseUrl` with an opaque origin is treated as an internal
 * misconfiguration and refused up front, before any candidate is even looked
 * at, rather than silently letting that coincidence through.
 *
 * THE THROWN MESSAGE NAMES BOTH HOSTS AND NEVER THE TOKEN. This function never
 * receives a token - it runs strictly before any `Authorization` header would
 * be attached - so there is nothing token-shaped to leak. The message states
 * the expected origin and, for a candidate that did parse, the origin it
 * actually resolved to, which is what an operator needs to tell "this Canvas
 * host is misbehaving" apart from "this Canvas host is compromised" apart
 * from "our own code passed a bad base URL." The raw candidate is echoed back
 * truncated, never as an unbounded string, since it is remote-supplied and a
 * hostile host paying for nothing but a long `Link` header should not get an
 * unbounded log line for it.
 *
 * WHAT THIS MODULE DOES NOT DEFEND AGAINST, ON PURPOSE - see
 * ./lms-credential-rules.ts's own such section for the fuller version of this
 * argument. Confirming that a candidate names the SAME ORIGIN AS AN
 * ALREADY-TRUSTED BASE is not the same work as confirming that base is itself
 * safe to dial: DNS rebinding and open redirects are both handled (or not) one
 * layer down, in the fetch wrapper, and this module has no opinion about
 * either. It also does not know or care whether the resolved path exists, is
 * a sensible pagination link, or is idempotent - only whether it is safe, by
 * origin, for this app to attach the caller's bearer token to it.
 */

/**
 * Hard ceiling on how many pages a single paginated Canvas read may follow,
 * independent of anything the remote host's `Link: rel="next"` header claims.
 *
 * This closes the reliability half of E-CRIT1: the loop's continuation
 * condition is controlled entirely by the remote host, and all but one
 * existing pagination loop has no cap at all today, so a host that returns a
 * `rel="next"` pointing at itself (or simply keeps paginating forever) runs
 * unbounded. On this platform that ends as a silent kill at the 60-second
 * function budget, with no thrown error and no logged row - inside an
 * unattended run, a `workflow_runs` row with no `finishedAt`, indistinguishable
 * from a slow LLM step.
 *
 * The value is not invented here: it is the number the acceptance doc's own
 * reliability pass (E-REL2) already derived and pinned - "a 25s budget plus a
 * 20-page hard cap on any paginated operation, because per-request bounds do
 * not bound a loop." Twenty pages at Canvas's typical `per_page=100` covers
 * every realistic course roster, module list, or submission set this app
 * reads today; a resource that legitimately needs more than 2,000 rows in one
 * synchronous read is not the case this app's paginated call sites are built
 * for. Exported as one named constant so every call site that adds a page cap
 * as part of the later wave uses this exact number rather than each inventing
 * (and inevitably disagreeing on) its own.
 */
export const CANVAS_PAGINATION_PAGE_CAP = 20;

/** How much of a remote-supplied candidate is ever echoed back in a thrown
 * message. The candidate is untrusted and its length is entirely the remote
 * host's choice - a refusal message is not the place to give a hostile host
 * an unbounded amount of this app's own log/error space. */
const MAX_DESCRIBED_CANDIDATE_LENGTH = 200;

/** Renders `candidate` for a human operator without assuming it is a string,
 * without evaluating it, and without producing an unbounded string. Never
 * throws - this exists specifically to build a safe error message, so it
 * cannot itself be the thing that turns a refusal into a crash. */
function describeCandidateForOperator(candidate: unknown): string {
  if (typeof candidate !== "string") {
    return `a non-string value (typeof ${typeof candidate})`;
  }
  const trimmed = candidate.trim();
  if (trimmed === "") {
    return "an empty or whitespace-only value";
  }
  const shown =
    trimmed.length > MAX_DESCRIBED_CANDIDATE_LENGTH
      ? `${trimmed.slice(0, MAX_DESCRIBED_CANDIDATE_LENGTH)}...`
      : trimmed;
  return `"${shown}"`;
}

/** Builds and throws the one refusal message every rejection path in this
 * module shares, so an operator sees a consistently-shaped error regardless
 * of which check actually fired. Typed to return `never` so callers can use
 * it in a position TypeScript recognizes as narrowing control flow (see the
 * try/catch below), the same way `canvasError` and the other codebase
 * "assert" helpers are used as an expression a caller does not need to
 * follow with a `return`. */
function refuse(candidate: unknown, expectedOrigin: string, reason: string): never {
  throw new Error(
    `Refusing to follow a Canvas-supplied URL: expected it to be on ${expectedOrigin}, but ${reason}. Received ${describeCandidateForOperator(
      candidate
    )}.`
  );
}

/**
 * Verifies that `candidate` - a URL taken from a remote Canvas response
 * (a `Link: rel="next"` header, an `attachment.url` field, a `progress_url`
 * field, or any other server-supplied field this app might one day follow) -
 * names the same origin as `baseUrl`, the Canvas host this request's
 * credentials were already resolved for. Returns the candidate resolved to an
 * absolute URL string when it is safe to dial; throws otherwise. See the
 * module doc comment above for the full reasoning behind every decision here
 * - this function's body is intentionally just the sequence of checks that
 * comment already justified, in the order it justified them.
 *
 * `baseUrl` is trusted internal state (the already-validated Canvas base URL
 * this request resolved credentials against, e.g. `ctx.baseUrl`), not
 * remote-supplied - it is still parsed defensively because a function this
 * security-critical should never let a caller's own bug surface as a raw
 * parser exception instead of a clear message.
 */
export function assertCanvasSuppliedUrlIsSameOrigin(candidate: unknown, baseUrl: string): string {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new Error(
      "Internal error: the Canvas base URL for this request is not a parseable URL, so no remote-supplied URL can be checked against it."
    );
  }

  const expectedOrigin = base.origin;
  if (expectedOrigin === "null") {
    // See the module doc comment's "opaque-origin BASE" paragraph: every
    // opaque origin renders as the literal string "null", so a base with no
    // real origin would make every opaque-origin candidate look like a match
    // by string coincidence. A Canvas base URL is always https and always has
    // a real origin; reaching this branch means the caller passed something
    // that is not actually a Canvas base URL.
    throw new Error(
      "Internal error: the Canvas base URL for this request has no well-defined origin, so no remote-supplied URL can ever be verified against it."
    );
  }

  if (typeof candidate !== "string") {
    refuse(candidate, expectedOrigin, "the value was not a string at all");
  }

  const trimmed = candidate.trim();
  if (trimmed === "") {
    // Checked before parsing: new URL("", base) resolves successfully to the
    // base itself, which would otherwise silently pass an empty/missing value
    // off as "the base URL" rather than refusing it as the malformed input it
    // actually is.
    refuse(candidate, expectedOrigin, "the value was empty");
  }

  let resolved: URL;
  try {
    resolved = new URL(trimmed, base);
  } catch {
    refuse(candidate, expectedOrigin, "the value did not parse as a URL");
    return ""; // unreachable; keeps control-flow analysis simple across catch
  }

  if (resolved.origin === "null") {
    // javascript:, data:, and other opaque-origin schemes all render as the
    // literal string "null" - refused explicitly, with its own message,
    // rather than falling into the generic mismatch branch's origin-name
    // wording, which would otherwise print the confusing "expected X, got
    // null" for what is really "this scheme has no origin at all".
    refuse(candidate, expectedOrigin, "it resolved to a scheme with no origin at all (for example javascript: or data:)");
  }

  if (resolved.origin !== expectedOrigin) {
    refuse(candidate, expectedOrigin, `it resolved to a different origin (${resolved.origin})`);
  }

  return resolved.href;
}

/**
 * A weaker guard for a remote-supplied URL that will be dialled WITHOUT
 * credentials: it must be https and must not name a special-purpose address,
 * but it MAY point at a different host than the Canvas base URL.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT THE SAME-ORIGIN GUARD.
 *
 * The exfiltration risk this module was written for is the BEARER TOKEN
 * reaching a host that is not the one the credentials were resolved for.
 * Downloading a public file with no Authorization header is not that risk.
 *
 * And requiring same-origin for the unauthenticated download would BREAK REAL
 * CANVAS. A content-export attachment is routinely served from a separate
 * storage host rather than the Canvas application host, so a strict
 * same-origin check there turns a legitimate cartridge download into a hard
 * failure. The first version of this fix did exactly that; the group that
 * wrote it flagged the risk rather than shipping it silently.
 *
 * So the two fetches get two different rules, and the split IS the security
 * argument:
 *   - unauthenticated download -> this function (public host, any origin)
 *   - retry WITH the bearer     -> assertCanvasSuppliedUrlIsSameOrigin
 * A cross-host attachment that fails unauthenticated therefore fails the
 * whole operation rather than being retried with the token attached. That is
 * the correct outcome: there is no download worth leaking a credential for.
 *
 * WHAT THIS DELIBERATELY DOES NOT CLOSE. It checks the hostname as written.
 * It does NOT resolve DNS, so a name that is public now can point somewhere
 * private at connect time (rebinding), and it does not follow or re-check
 * redirects. Both belong to the fetch layer - `canvasFetch` in
 * ./canvas-fetch.ts resolves, classifies every returned address and pins the
 * connection to the vetted one. Routing these call sites through it is a
 * separate, deliberate chunk; until then this is a hostname-level check and
 * says so rather than implying more.
 */
export function assertCanvasSuppliedUrlIsPublic(candidate: unknown): string {
  if (typeof candidate !== "string" || candidate.trim() === "") {
    throw new Error(
      "Refusing to download a file from the LMS: the URL it supplied was missing or not a string."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate.trim());
  } catch {
    throw new Error(
      "Refusing to download a file from the LMS: the URL it supplied could not be parsed."
    );
  }

  if (parsed.protocol !== "https:") {
    throw new Error(
      `Refusing to download a file from the LMS over ${parsed.protocol.replace(":", "")}: only https is allowed.`
    );
  }

  // Credentials in the authority read as one host to a person and resolve to
  // another - the same trick the base-URL validator refuses.
  if (parsed.username !== "" || parsed.password !== "") {
    throw new Error(
      "Refusing to download a file from the LMS: its URL carries credentials in the authority."
    );
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  const octets = parseIpv4(host);
  if (octets && isSpecialPurposeIpv4(octets)) {
    throw new Error(
      `Refusing to download a file from the LMS: ${parsed.hostname} is a reserved or private address.`
    );
  }
  if (host.includes(":") && isSpecialPurposeIpv6(host)) {
    throw new Error(
      `Refusing to download a file from the LMS: ${parsed.hostname} is a reserved or private address.`
    );
  }

  return parsed.toString();
}
