/**
 * Rules for a user-registered LMS (Canvas) credential: the host a saved
 * credential may point at, the one canonical form it is stored under, and
 * the two helpers that keep the secret token itself out of anything a human
 * or a log line ever sees. Contract: docs/lms-credentials-acceptance-
 * criteria.md (E3, SEC1-SEC13); tests: ./lms-credential-rules.test.ts.
 *
 * WHY THIS IS A SECURITY BOUNDARY, NOT INPUT HYGIENE. Saving a credential
 * means the SERVER will later fetch a URL the USER chose, carrying a bearer
 * token. `validateLmsBaseUrl` is what stands between a signed-in user and a
 * server-side request forgery primitive - it decides which hosts this app
 * will ever agree to fetch on the user's behalf. `maskToken` and
 * `describeTokenSecret` exist because that token, once saved, must never be
 * readable again through any surface: not a UI, not an error, not a log.
 *
 * ONE PARSER, NOT A REGEX. Every historical bypass of a hand-rolled URL
 * checker comes from the checker and the eventual fetcher disagreeing about
 * what a string means - a regex that means "no dot" is not the same
 * decision `fetch()` makes when it hands the same string to the platform's
 * own URL parser. `validateLmsBaseUrl` parses with the WHATWG `URL`
 * constructor - the exact parser Node's `fetch`, and the browser's, use
 * internally - and every decision below reads fields off the object that
 * parser produced. This is also why decimal, octal and hex IPv4 encodings
 * (`2130706433`, `0x7f000001`, `0177.0.0.1`) need no special-case code at
 * all: `URL` itself canonicalizes them to dotted-decimal before this module
 * ever sees `hostname`, so the same string a hand-rolled regex would have to
 * be taught about is already gone by the time it matters.
 *
 * ALLOW-LIST WHERE THE SHAPE PERMITS IT. The scheme check is an allow-list
 * of exactly one value ("https:"). The credentials-in-authority and
 * path/query/fragment checks are allow-lists of exactly one shape (no
 * userinfo; root path, no search, no hash). Only the HOST is checked with a
 * deny-list, because there is no way to allow-list "every public host" -
 * and even there, an address or name this module cannot positively classify
 * is refused rather than passed: see `ipv6MustBeRefused`'s `null` branch and
 * `hostNameCannotBePublic`'s single-label rule. Failing closed on the shape
 * nobody enumerated yet is the entire point of choosing a deny-list here at
 * all; a version of this file that instead grew a longer and longer list of
 * banned hosts over time would be the one that eventually misses something.
 *
 * WHAT THIS MODULE DOES NOT DEFEND AGAINST, ON PURPOSE. Two attacks live
 * entirely outside what a string check can ever close, and both are named
 * here so nobody mistakes this module for having closed them:
 *
 *   - DNS rebinding. `canvas.attacker.edu` can resolve to a public address
 *     the moment this check runs and to `127.0.0.1` the moment the real
 *     request is dialled - two independent `getaddrinfo` calls, and the
 *     attacker controls the DNS TTL between them. Nothing in this module
 *     ever resolves a name (see SEC1 in the acceptance doc). Closing this
 *     requires the FETCH layer to resolve the address itself, re-run the
 *     same private/reserved check this module runs on the resolved address,
 *     and then connect to the address it just checked - not the name -
 *     which for `fetch`/`undici` means a custom `dispatcher.lookup`, not
 *     anything this module can express.
 *   - Redirects. A host that passed this check can answer with a
 *     `Location:` header pointing anywhere, including a loopback or private
 *     address, and a bare `fetch` follows it by default. This module has no
 *     opinion about an HTTP response, because it never makes one - it runs
 *     once, at save time (and, per SEC1, again at the top of each use), on a
 *     STRING. Closing this is the fetch wrapper's job (SEC2): `redirect:
 *     "manual"`, a hop limit, and this exact validator re-run against every
 *     `Location` before it is followed.
 *
 * Re-running `validateLmsBaseUrl` again right before every use (not only at
 * save time) is still worth doing even though it does not touch DNS: it is
 * what keeps a stored row honest if the STRING itself could ever be edited
 * by something other than this module's own save path, and it costs nothing
 * pure and synchronous like this function is cheap to call.
 *
 * THE ADDRESS-CLASSIFICATION RULES LIVE IN `./lms-address-rules.ts` (E-ARCH5).
 * This module still owns every NAME-shape decision (scheme, userinfo, path,
 * the single-label/reserved-suffix rules for a DNS name), but the IPv4/IPv6
 * special-purpose-address rules used to live here as private functions and
 * are now imported from that leaf module, because `canvas-fetch.ts` needs
 * the EXACT SAME rules to judge a `dns.lookup`-resolved address (closing
 * E-SSRF1/SEC1, DNS rebinding) as this module uses to judge an IP literal a
 * user typed. Two copies of "is this address reserved" that could drift
 * apart is precisely the failure this file's own "ONE PARSER, NOT A REGEX"
 * section above warns about, one paragraph up. Do not re-inline these rules
 * here even for a "quick" fix - change `lms-address-rules.ts` instead, so
 * both callers see the update.
 *
 * NO ENVIRONMENT ACCESS, NO `server-only`. This module reads nothing from
 * `process.env` and has no side effects, so there is no silent-fallback
 * hazard for a `server-only` guard to convert into a build error (contrast
 * ./signup-rules.ts, which reads bare env vars and would misbehave
 * silently if a client bundle ever pulled it in). It is deliberately left
 * callable from a Client Component: a signed-in user's Settings form should
 * be able to tell them "that does not look like an https URL" or "that
 * looks like a private address" immediately, before a round trip - the same
 * reasoning ./display-name.ts gives for staying import-anywhere. That
 * client-side call is a courtesy, never the boundary: the save action must
 * call `validateLmsBaseUrl` again on the server, because a Client Component
 * check is something the user's own browser evaluated and can always be
 * skipped by whoever is attacking their own account.
 */

import { isSpecialPurposeIpv4, isSpecialPurposeIpv6, parseIpv4 } from "./lms-address-rules";

// ============================================================================
// validateLmsBaseUrl - the SSRF boundary
// ============================================================================

/**
 * The outcome of checking a candidate LMS base URL. `hostname` on the
 * accepted branch is the parsed, punycode-encoded, trailing-dot-stripped
 * host - not the raw input - so a caller building a confirmation message
 * (E4) or a settings list (E5) shows what this module actually decided
 * about, including surfacing a homograph registration as its `xn--` form
 * rather than the glyphs the user typed (SEC12).
 */
export type ValidateLmsBaseUrlResult =
  | { ok: true; hostname: string }
  | { ok: false; reason: string };

const REASON = {
  notAString: "Enter the Canvas base URL as text, for example https://canvas.example.edu.",
  notAUrl: "That is not a valid URL. Enter the Canvas base URL, for example https://canvas.example.edu.",
  wrongScheme:
    "Only an https URL is accepted - anything else would send the access token unencrypted or does not name a host at all.",
  hasCredentials:
    "Remove the username or password from the URL. Only the host itself is stored as the credential.",
  hasPathOrMore:
    "Enter the LMS host only, with no path, query string or fragment - for example https://canvas.example.edu, not a page inside it.",
  hostNotAllowed:
    "That host is not an allowed public LMS instance. Loopback, private-network, link-local and other reserved addresses are never accepted.",
} as const;

/**
 * Reserved DNS suffixes with no possible public registration: `.local`
 * (RFC 6762, mDNS), `.internal` (no RFC, but the de facto convention this
 * exact feature's threat model names - `metadata.google.internal` is
 * refused by this rule, not by a special case naming that host), and the
 * four RFC 2606 suffixes reserved for documentation and testing. A bare
 * single-label name (`intranet`, `canvas`, `localhost`) is refused by a
 * separate, more general rule below: every real public hostname sits under
 * some ICANN-delegated top-level domain, which requires at least one dot.
 */
const RESERVED_HOST_SUFFIXES = [".local", ".internal", ".localhost", ".test", ".example", ".invalid"];

/**
 * True when `hostname` (already lower-cased by `URL`) cannot be a public
 * DNS name. Strips exactly one trailing dot before every comparison
 * (SEC11): `new URL("https://metadata.google.internal.").hostname` is
 * `"metadata.google.internal."`, unchanged by `URL` itself, so an
 * `endsWith(".internal")` check that skipped this step would resolve
 * normally in production while sailing past this guard on the trailing-dot
 * spelling of the exact same host.
 */
function hostNameCannotBePublic(hostname: string): boolean {
  const name = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;

  if (name === "" || !name.includes(".")) {
    return true;
  }

  return RESERVED_HOST_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/**
 * The single host-classification entry point `validateLmsBaseUrl` calls.
 * Dispatches on the SHAPE `URL` already decided (bracketed IPv6 literal,
 * dotted-decimal IPv4 literal, or a DNS name) rather than re-deriving that
 * shape independently - there is exactly one place in this module that
 * knows how to tell these apart, and it is `URL.hostname`'s own format.
 * The actual address-reservation rules live in `./lms-address-rules.ts`
 * (see the module doc comment above); this function's own job is only to
 * strip the `[...]` brackets `URL.hostname` puts around an IPv6 literal -
 * `dns.lookup`'s returned addresses never carry them, so that stripping
 * happens here, once, rather than being duplicated inside the leaf module.
 */
function hostIsNotAllowed(hostname: string): boolean {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return isSpecialPurposeIpv6(hostname.slice(1, -1));
  }
  const ipv4 = parseIpv4(hostname);
  if (ipv4) {
    return isSpecialPurposeIpv4(ipv4);
  }
  return hostNameCannotBePublic(hostname);
}

/**
 * Decides whether `input` may be saved as an LMS base URL. See the module
 * doc comment for the overall design; in one line, the ordering below is:
 * parse with the platform's own `URL` constructor, require exactly the
 * shape a base URL (not a page, not a link) should have, then refuse any
 * host this module cannot positively classify as public.
 *
 * `input` is typed `unknown`, not `string`: this is the boundary a raw form
 * submission or server-action argument reaches first, and a boundary
 * function that only compiled against well-typed input would still crash
 * on the first malformed request that reaches it at runtime.
 */
export function validateLmsBaseUrl(input: unknown): ValidateLmsBaseUrlResult {
  if (typeof input !== "string") {
    return { ok: false, reason: REASON.notAString };
  }

  let url: URL;
  try {
    // No manual trimming beforehand: the WHATWG URL parser already strips
    // leading/trailing ASCII whitespace and control characters as the
    // first step of its own algorithm, and doing that work a second time,
    // slightly differently, ahead of the parser that actually matters is
    // exactly the "checker and fetcher disagree" failure mode this module
    // exists to avoid.
    url = new URL(input);
  } catch {
    return { ok: false, reason: REASON.notAUrl };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: REASON.wrongScheme };
  }

  if (url.username !== "" || url.password !== "") {
    // Catches both `https://user:pass@host` (a literal userinfo pair) and
    // `https://canvas.example.edu@evil.example.com` (a human-readable host
    // name smuggled into the userinfo slot ahead of the REAL, attacker-
    // controlled host) - `URL` parses the latter into a non-empty
    // `username` and a `hostname` of `evil.example.com`, so this one check
    // refuses it regardless of what the actual host turns out to be.
    return { ok: false, reason: REASON.hasCredentials };
  }

  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    // A stray extra slash (`.../edu//`) is refused here too, not only a
    // real path - this is a base URL, not a link, and there is no
    // legitimate reason a base URL needs more than an empty path.
    return { ok: false, reason: REASON.hasPathOrMore };
  }

  if (hostIsNotAllowed(url.hostname)) {
    return { ok: false, reason: REASON.hostNotAllowed };
  }

  const hostname = url.hostname.endsWith(".") ? url.hostname.slice(0, -1) : url.hostname;
  return { ok: true, hostname };
}

// ============================================================================
// normalizeLmsBaseUrl - one canonical form per host
// ============================================================================

/**
 * Reduces an already-accepted base URL to one canonical string, so that
 * `https://Canvas.MCCNEB.edu`, `https://canvas.mccneb.edu/` and
 * `  https://canvas.mccneb.edu  ` are stored as the same credential rather
 * than three. This is NOT a second validation pass - per SEC12, validation
 * must run on the RAW input before any normalization touches it, because
 * normalizing first and validating second would silently launder
 * `https://canvas.example.edu@evil.example.com` into a clean-looking
 * `https://evil.example.com` before the credentials check ever saw the
 * userinfo it exists to catch. Callers are expected to have already called
 * `validateLmsBaseUrl(raw)` and checked `ok: true`; this function trusts
 * that ordering rather than re-deriving it.
 *
 * PORT IS PART OF THE IDENTITY, KEPT WHEN NON-DEFAULT. Two institutions
 * cannot legitimately share one hostname, but one institution can
 * legitimately run its Canvas instance behind a non-standard port (a
 * self-hosted install fronted by a reverse proxy on 8443, say); collapsing
 * `https://canvas.example.edu:8443` and `https://canvas.example.edu` to the
 * same stored credential would silently point a saved token at a
 * different, unrelated service if port 443 on that host ever answered with
 * something else entirely. `URL.origin` already drops a port that is the
 * scheme's default (443 for https) and keeps any other port - exactly the
 * distinction wanted here - which is also why this function does not need
 * its own port-comparison logic at all.
 *
 * The path, query and fragment are dropped unconditionally (this function
 * only ever emits `protocol//hostname[:port]`) because `validateLmsBaseUrl`
 * has already refused any input that had one; there is nothing here for
 * this function to preserve or reject on that front.
 */
export function normalizeLmsBaseUrl(raw: string): string {
  if (typeof raw !== "string") {
    // Defensive only - the exported type is `string`, but this still must
    // not throw for a caller that ignores it (an untyped JS call site, a
    // value that was `any` somewhere upstream).
    return "";
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Not this function's job to explain why - `validateLmsBaseUrl` owns
    // that message. Returning the input verbatim keeps this function total
    // without inventing a canonical form for a string that is not a URL at
    // all.
    return raw;
  }

  // Strip one trailing dot from the hostname before building the canonical
  // form, for the same reason `validateLmsBaseUrl` strips it before
  // comparing names (SEC11): "canvas.example.edu." and "canvas.example.edu"
  // are one DNS name and must be one stored credential. Never applied to a
  // bracketed IPv6 literal, which cannot carry a trailing dot in the first
  // place.
  const hostname =
    !url.hostname.startsWith("[") && url.hostname.endsWith(".")
      ? url.hostname.slice(0, -1)
      : url.hostname;

  const port = url.port ? `:${url.port}` : "";
  return `${url.protocol}//${hostname}${port}`;
}

// ============================================================================
// maskToken / describeTokenSecret - the token never comes back
// ============================================================================

/** Fixed-width filler shown regardless of the real secret's length. */
const MASK_FILLER = "********";

/** How many trailing characters of a long-enough secret are ever shown. */
const REVEALED_SUFFIX_LENGTH = 4;

/**
 * A secret shorter than this reveals NO characters at all, only the fixed
 * filler. This is what keeps a short-or-empty secret from leaking its
 * length: without a floor, `maskToken("abc")` would have to either reveal
 * more of a 3-character secret than a 32-character one, or produce a
 * shorter masked string for it - both leak exactly the fact this function
 * exists to hide. The floor is set comfortably above
 * `REVEALED_SUFFIX_LENGTH` so a secret that does clear it always has
 * unrevealed characters ahead of the suffix, never just the suffix itself.
 */
const MIN_LENGTH_TO_REVEAL_SUFFIX = 8;

/**
 * Produces the ONLY form of a Canvas access token this app ever shows a
 * human: fixed-width filler, plus the last four characters IF AND ONLY IF
 * the secret is long enough that doing so does not itself disclose the
 * secret's length. Never reveals a LEADING character at any length - a
 * Canvas personal access token begins with the numeric Canvas user id
 * followed by a tilde, which is exactly the part that identifies whose
 * account the token belongs to, so this function only ever looks at the
 * END of the string, regardless of how long it is.
 *
 * Total for non-string input (`null`, `undefined`, a number, an object):
 * returns the same fixed filler a too-short real secret would get, rather
 * than throwing or calling `.length` on something that might not have one.
 */
export function maskToken(secret: unknown): string {
  if (typeof secret !== "string" || secret.length < MIN_LENGTH_TO_REVEAL_SUFFIX) {
    return MASK_FILLER;
  }
  return MASK_FILLER + secret.slice(-REVEALED_SUFFIX_LENGTH);
}

/**
 * Reports presence, not content, for a value that must reach a log line,
 * an error message or a diagnostic surface (E9/SEC4): "a token is on file"
 * versus "no token is on file", nothing else. Deliberately does not report
 * length, a hash, a prefix or any other derived signal - once a caller
 * wants to log "which token" rather than "whether a token", the honest
 * answer is that this function is the wrong tool, not that it should grow
 * a parameter for it. Total for any input, including non-strings, because
 * a logging helper that can itself throw defeats the point of using it in
 * a catch block or an error path.
 */
export function describeTokenSecret(secret: unknown): string {
  const isPresent = typeof secret === "string" && secret.trim().length > 0;
  return isPresent ? "token: on file" : "token: not on file";
}
