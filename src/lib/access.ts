/**
 * The single access decision. Pure and edge-safe: this module is imported by
 * `src/proxy.ts` (the Next.js request gate, which runs at the edge) as well
 * as by the server-action guard, so it must never import `next/*`, `node:*`,
 * `server-only`, a database client, or anything with side effects at module
 * load. Every function below reads `process.env` fresh on each call (via
 * `isOwnerEmail`, the only place this module touches the environment at
 * all) rather than caching a value at module scope - the same bundle can be
 * deployed with a different `OWNER_EMAILS` per environment, and a
 * module-scope read would freeze whichever value happened to be present the
 * first time this file was evaluated.
 *
 * This module owns the RULE. Anything that decides whether a request or
 * action may proceed calls `resolveAccess` (directly or through a thin IO
 * wrapper that supplies the profile); nothing re-implements the ordering
 * below.
 */

import { isOwnerEmail } from "./owner";

/** The two roles a stored account row can carry. */
export type AccessRole = "owner" | "instructor";

/** The three lifecycle states a stored account row can carry. */
export type AccessStatus = "pending" | "active" | "suspended";

/**
 * The complete set of answers to "can this request proceed, and if not,
 * why". `unavailable` is deliberately distinct from `suspended`: one is a
 * system failure ("try again"), the other is a decision about the account
 * ("contact the administrator"), and conflating them would make the UI lie
 * to whichever one is actually true.
 */
export type AccessDecision =
  | "anonymous"
  | "pending"
  | "suspended"
  | "unavailable"
  | "active"
  | "owner";

/** The shape of a stored account row, as far as the access decision cares. */
export interface AccessProfile {
  role: AccessRole;
  status: AccessStatus;
}

export interface ResolveAccessInput {
  email?: string | null;
  profile?: AccessProfile | null;
  /**
   * True when the caller attempted to look up the profile and the lookup
   * itself failed (a thrown error, a timeout) - distinct from the lookup
   * succeeding and returning no row. A caller that both errored AND passed a
   * `profile` (e.g. a stale cached value) must not have that value trusted;
   * `unavailable` is the only honest answer.
   */
  lookupFailed?: boolean;
  /**
   * True when the identity itself could not be determined - the auth
   * provider's transport failed rather than simply returning "no session".
   * `supabase.auth.getUser()` returns `{ data: { user: null }, error }` for
   * BOTH an ordinary signed-out visitor and an unreachable auth service, so
   * the caller must disambiguate the two before calling in; this flag is how
   * it tells `resolveAccess` which one happened. Checked before everything
   * else, including the no-email branch and the owner break-glass: with no
   * verified email there is nothing to match an allowlist against, so
   * break-glass cannot apply.
   */
  authFailed?: boolean;
}

/**
 * Resolves the single access decision for a request or action.
 *
 * The order below is deliberate and load-bearing:
 *
 * 1. `authFailed` -> `unavailable`, BEFORE even the no-email branch and
 *    before the owner break-glass. A Supabase transport failure produces the
 *    exact same "no email" shape as an ordinary signed-out visitor, so if
 *    this were checked any later it could never fire: the no-email branch
 *    would already have returned `anonymous`. With no verified identity
 *    there is also no email to match an allowlist against, so break-glass
 *    cannot apply either - an outage must not be a backdoor.
 * 2. No email (absent, or trims to empty) -> `anonymous`. Nothing else can
 *    be true without an identity.
 * 3. `isOwnerEmail(email)` -> `owner`, BEFORE the profile is consulted at
 *    all. This is the break-glass path: if the database is unreachable, or
 *    the owner's own row is missing or corrupted, the person who pays for
 *    the deployment can still get in and fix it. A stale `suspended` row for
 *    an allowlisted address must not lock its owner out - see the admin
 *    surface's own rule that suspend/demote must refuse rather than silently
 *    no-op on such an account.
 * 4. `lookupFailed` -> `unavailable`. Checked only after the break-glass
 *    path, and before anything about the profile is trusted, so a database
 *    outage fails closed for everyone except the owner rather than being
 *    read as "no row" (`pending`) or, worse, whatever stale value happened
 *    to be attached to the error.
 * 5. No profile row -> `pending`. A session with no row is not inferred to
 *    be anything more trusted; the row itself is created elsewhere.
 * 6. `status === "suspended"` -> `suspended`; `status === "pending"` ->
 *    `pending`.
 * 7. `status === "active"` -> `owner` when `role === "owner"`, else
 *    `active`.
 * 8. Anything else (a role or status this code does not recognise - a
 *    migration in flight, a hand-edited row, a future value) falls into the
 *    `default` branch of the status switch and comes out `pending`, the same
 *    as no row at all. This is the "fail closed on the unrecognised" rule:
 *    an implementation that returned `profile.status` directly would emit a
 *    decision outside the union and leave every caller with no matching
 *    branch. An unrecognised STATUS is treated conservatively; an
 *    unrecognised ROLE simply cannot satisfy the `=== "owner"` check in step
 *    7 and falls through to `active`, which is correct because role only
 *    ever matters for the owner elevation, never for gating access itself.
 */
export function resolveAccess(input: ResolveAccessInput): AccessDecision {
  if (input.authFailed) {
    return "unavailable";
  }

  const email = typeof input.email === "string" ? input.email : "";
  if (email.trim() === "") {
    return "anonymous";
  }

  // Break-glass: consult the allowlist before the profile even exists as a
  // variable in this function's control flow. Pass the email through exactly
  // as received (not further normalised here) so this stays in agreement
  // with `isOwnerEmail`, which is the only place that rule is allowed to
  // live.
  if (isOwnerEmail(email)) {
    return "owner";
  }

  if (input.lookupFailed) {
    return "unavailable";
  }

  const profile = input.profile ?? null;
  if (!profile) {
    return "pending";
  }

  switch (profile.status) {
    case "suspended":
      return "suspended";
    case "pending":
      return "pending";
    case "active":
      return profile.role === "owner" ? "owner" : "active";
    default:
      return "pending";
  }
}

/** The only two decisions that may reach a route handler or server action. */
export function canUseApp(decision: AccessDecision): boolean {
  return decision === "active" || decision === "owner";
}

/** True only for the `owner` decision itself - never `active`, never anything else. */
export function isOwnerDecision(decision: AccessDecision): boolean {
  return decision === "owner";
}

/**
 * A fixed, non-resolvable origin used only as the base for parsing a
 * relative candidate. Never sent anywhere; it exists so the WHATWG `URL`
 * parser has something to resolve against.
 */
const INTERNAL_ORIGIN = "https://access-decision.invalid";

const LOGIN_PATH = "/login";

/**
 * The open-redirect guard. Returns a same-origin absolute path (with its
 * query and fragment preserved) if, and only if, `raw` resolves to this
 * app's own origin; otherwise returns `"/"`.
 *
 * This is written as a PROPERTY check rather than a denylist of shapes. An
 * earlier draft tried to reject specific patterns (`//`, `\\`, `://`) by
 * string inspection and still let `https://evil.example.com` and
 * `//evil.example.com` through in some combination, because there is always
 * one more shape a browser's URL parser accepts that a hand-written
 * denylist does not anticipate. Resolving the candidate against a fixed
 * dummy origin with the real `URL` parser and then comparing the resulting
 * `origin` to that same dummy origin sidesteps the whole category: whatever
 * the parser decides the authority is, if it is not the base we supplied,
 * the candidate is refused.
 *
 * Two things a naive version of this check misses:
 *
 * - Tab, newline and carriage return are stripped from a URL by the parser
 *   BEFORE the rest of parsing happens, so `"/\t/evil.com"` is, by the time
 *   any browser or the `URL` constructor sees it, identical to
 *   `"//evil.com"` - a protocol-relative URL pointing at a different host.
 *   Rejecting any control character or space up front (rather than trying to
 *   enumerate which whitespace is "safe") closes this off without relying on
 *   the property check alone to catch it.
 * - The candidate must be total for non-string input: a repeated `?next=`
 *   query parameter arrives at a page component as `string[]`, and a
 *   malformed request can hand this function almost anything.
 */
export function safeNextPath(raw: unknown): string {
  const FALLBACK = "/";

  if (typeof raw !== "string") {
    return FALLBACK;
  }

  // Reject any ASCII control character or space outright, rather than
  // trying to predict which ones a URL parser will later strip or encode.
  // Written as an explicit code-point scan (not a regex literal) so no
  // control byte ever has to appear inside this source file.
  for (let i = 0; i < raw.length; i += 1) {
    if (raw.charCodeAt(i) <= 0x20) {
      return FALLBACK;
    }
  }

  // Anything that is not already an absolute path is refused here rather
  // than handed to the URL parser: a bare relative segment ("courses"), a
  // scheme ("javascript:", "https://...") and an empty string are all
  // rejected by this single check.
  if (!raw.startsWith("/")) {
    return FALLBACK;
  }

  let resolved: URL;
  try {
    resolved = new URL(raw, INTERNAL_ORIGIN);
  } catch {
    return FALLBACK;
  }

  if (resolved.origin !== INTERNAL_ORIGIN) {
    return FALLBACK;
  }

  // Refuse the login area itself. Otherwise a bounced sign-in can redirect
  // back into `/login?next=/login?next=...`, looping onto itself, or worse,
  // trust whatever `next` value already sits on the login URL it was handed.
  if (resolved.pathname === LOGIN_PATH || resolved.pathname.startsWith(`${LOGIN_PATH}/`)) {
    return FALLBACK;
  }

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

/**
 * What the request gate does with a decision: `null` when the request may
 * proceed, otherwise a `/login` URL carrying `state` (so the page can render
 * a real explanation instead of a silent bounce) and `next` (so a signed-in
 * user lands back where they meant to go, per R2). Both are set with
 * `URLSearchParams.set`, never string concatenation - concatenating
 * `?next=${raw}` lets a `raw` value containing its own `&state=owner` inject
 * a sibling parameter.
 */
export function loginRedirectFor(decision: AccessDecision, requestedPath: unknown): URL | null {
  if (canUseApp(decision)) {
    return null;
  }

  const target = new URL(LOGIN_PATH, INTERNAL_ORIGIN);
  target.searchParams.set("state", decision);
  target.searchParams.set("next", safeNextPath(requestedPath));
  return target;
}

/**
 * The public-path table (no session required). Matched on WHOLE path
 * segments, never bare prefixes: `/loginish` and `/api/cronjobs` share a
 * string prefix with `/login` and `/api/cron` but are ordinary gated routes,
 * not public ones. `/api/github/webhook` is a deliberate addition alongside
 * the pre-existing `/login`, `/auth`, `/api/cron` and `/api/triggers`
 * exemptions: it is authenticated by an HMAC signature over the raw request
 * body rather than a session, exactly like the cron and trigger callers, but
 * was missing from the table - so every push GitHub sends was 307-redirected
 * to `/login` before the signature verifier ever ran (see
 * docs/REGRESSION.md, entry 398, point B3).
 */
const PUBLIC_PATH_PREFIXES = ["/login", "/auth", "/api/cron", "/api/triggers", "/api/github/webhook"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
