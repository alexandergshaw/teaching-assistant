/**
 * E4's verification result, classified. Contract: docs/lms-credentials-
 * acceptance-criteria.md E4, E-UX3, E-UX4, SEC9; tests: ./lms-credential-
 * probe-outcome.test.ts.
 *
 * WHY THIS IS A SEPARATE MODULE FROM THE FETCH LAYER. `canvas-fetch.ts`'s own
 * doc comment states plainly that it can only ever decide TWO of the four
 * outcomes a signed-in user can hit while registering a credential -
 * `"host-not-allowed"` (the SSRF boundary refused the host or a redirect
 * target) and `"unreachable"` (the network layer never produced an HTTP
 * response at all) - because it has no idea what a genuine Canvas response
 * looks like, and it must not pretend to. Its `ok: true` branch hands back
 * the RAW status and body for ANY completed exchange, 200 through 500,
 * Canvas or an impostor. Deciding what THAT means - proven Canvas identity,
 * a rejected token, or a host that answered but is not Canvas at all - is a
 * judgment about the Canvas API's own response shape, which belongs here,
 * not in the transport layer. This is also why this module reads no
 * environment and no ambient state and makes no network call itself: it is
 * pure classification over data someone else already collected, which is
 * what makes it something this repo's node-environment vitest suite can
 * actually exercise (this repo's tests never render a component, so a
 * judgment that lived only in JSX would be a judgment nothing tests).
 *
 * THE FOUR OUTCOMES (E-UX3), AND WHY THE FOURTH MATTERS MOST. The AC's
 * original E4 named three: "that host did not answer", "that token was
 * rejected", and "that host is not allowed" - three different fixes for a
 * user staring at a failed save. E-UX3 corrected that to four, because the
 * single most common real failure does not fit any of the three: a user
 * pastes their school's MARKETING site instead of its Canvas host. It is a
 * valid public https host, so `validateLmsBaseUrl` accepts it. It answers,
 * so it is not `"unreachable"`. It returns HTML, or a 404, or some JSON blob
 * that is not a Canvas user record - not a 401 - so folding it into
 * `"rejected"` would send that user off to generate a SECOND token and fail
 * identically, because the token was never the problem. `"not-canvas"` is
 * that fourth outcome: the host answered, but nothing about the exchange
 * looks like Canvas.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT TRY TO TELL APART, AND WHY. Any
 * completed exchange whose status is not 401/403 (rejected) and not a
 * parseable Canvas self-record on 200 (verified) collapses to `"not-canvas"`
 * REGARDLESS of the actual status code - a 404, a 500, a 502, a 429, an
 * empty body, or a 200 with the wrong JSON shape all land here identically.
 * A more eager version of this module might try to guess "this looks like a
 * real Canvas instance having a bad moment" from a 429 or 5xx and word the
 * message more hopefully. That guess has no reliable signal behind it - an
 * attacker-controlled host can return any status code it likes - and getting
 * it wrong in the OPTIMISTIC direction (telling a user "that looks like
 * Canvas, try again shortly" about a host that is not Canvas at all) is a
 * worse failure than the reverse. So this module always fails toward the
 * less specific, more conservative label rather than inventing a signal it
 * does not actually have.
 *
 * SEC9 - THE RATE LIMIT AND THE SAVE FAILURE ARE NOT PROBE RESULTS, AND
 * BELONG ON THIS SAME UNION ANYWAY. `LmsCredentialProbeOutcome` also carries
 * `"rate-limited"` and `"save-failed"`, neither of which this module's own
 * classifier ever produces:
 *   - `"rate-limited"` is decided BEFORE a probe is ever attempted, by
 *     `./lms-credential-save-limit.ts`'s pure decision over attempt history -
 *     there is nothing here to classify FROM, because no network call
 *     happened at all.
 *   - `"save-failed"` is decided AFTER a probe already returned `"verified"`,
 *     when the caller's own attempt to persist the now-proven credential
 *     (`saveLmsCredential` in ./lms-credentials.ts) itself throws - a
 *     database error, not a Canvas error. This is "our fault," and it must
 *     never be worded like one of the four Canvas-facing outcomes above, or
 *     a user would go looking for a problem with their host or token that
 *     does not exist.
 * Both are on this union anyway, rather than split into a separate type,
 * because every real caller (the save action a sibling module builds) needs
 * exactly one result type to render regardless of which stage produced it -
 * a page switching on two different union types depending on which layer
 * failed is exactly the kind of seam a future edit forgets to keep in sync.
 * Small factory functions below construct these two so every call site
 * spells the literal the same way.
 *
 * WHY THE FOUR-OUTCOME PRECISION IS CONDITIONAL ON THE RATE LIMIT EXISTING.
 * SEC9, read literally: a signed-in user who can distinguish "that host did
 * not answer" from "that host answered but is not Canvas" from "that host
 * refused the token" - each worded differently, each reachable by pasting an
 * ARBITRARY public https host into this form - has been handed a reachability
 * and content probe against the public internet. `./lms-credential-save-
 * limit.ts` is what keeps that probe from running at unbounded throughput; if
 * it is ever removed, keeping these four outcomes distinct stops being a
 * usability improvement and becomes a scanning primitive with no cost to
 * operate. See that module's own doc comment for the other half of this
 * coupling. Do not delete the rate limit without first collapsing this
 * module's outcomes back down.
 *
 * SEC9/E-UX4 - THIS MODULE PLAYS NO PART IN TIMING, BY CONSTRUCTION. Every
 * function below is synchronous and touches no clock, no timer, and no I/O -
 * it cannot introduce or remove a timing side-channel because it has no
 * concept of time at all. The requirement that only the network-layer
 * outcome ("unreachable") be padded to a fixed deadline is entirely
 * `canvas-fetch.ts`'s responsibility (see `unreachableAtDeadline` there);
 * by the time a result reaches this module, whatever time was going to pass
 * already has.
 */

// ============================================================================
// The outcome union
// ============================================================================

/**
 * The result of attempting to register (or replace) an LMS credential, from
 * the very first gate through the Canvas probe itself. Exactly one of these
 * seven shapes at a time - never a boolean success flag plus a free-text
 * message, which is how two call sites end up wording the same failure
 * differently.
 */
export type LmsCredentialProbeOutcome =
  | {
      /** The probe succeeded: this token authenticates, and this is whose Canvas identity it belongs to. */
      readonly kind: "verified";
      readonly canvasUserId: string;
      readonly canvasUserName: string | null;
    }
  | {
      /** Canvas itself said this token is no good (401/403). Fix: paste a different token. */
      readonly kind: "rejected";
    }
  | {
      /** The host answered, but nothing about the exchange looks like Canvas (E-UX3). Fix: check the host, not the token. */
      readonly kind: "not-canvas";
    }
  | {
      /** Refused before any network call, or a redirect was refused mid-flight - our own rules, not Canvas's. Fix: use a different host. */
      readonly kind: "host-not-allowed";
      readonly reason: string;
    }
  | {
      /** The network layer never produced an HTTP response at all, within the fixed deadline (SEC9/E-UX4). Fix: try again later, or check the host is actually up. */
      readonly kind: "unreachable";
    }
  | {
      /** SEC9: too many recent save attempts for this account. Decided before any probe runs - see ./lms-credential-save-limit.ts. */
      readonly kind: "rate-limited";
    }
  | {
      /** The probe succeeded and proved the token good, but persisting the credential itself failed. Our fault, not the user's, and not a Canvas outcome at all. */
      readonly kind: "save-failed";
    };

/** Every `LmsCredentialProbeOutcome["kind"]` value, for exhaustiveness checks in callers (a switch with a `never` default) without hand-copying the seven literals. */
export const LMS_CREDENTIAL_PROBE_OUTCOME_KINDS = [
  "verified",
  "rejected",
  "not-canvas",
  "host-not-allowed",
  "unreachable",
  "rate-limited",
  "save-failed",
] as const;

// ============================================================================
// Classifying a completed (or refused, or network-failed) fetch attempt
// ============================================================================

/**
 * What this module needs from one hop of a Canvas probe attempt. Deliberately
 * NOT `canvas-fetch.ts`'s own `CanvasFetchResult` imported directly - this
 * module has zero import edges into the rest of the app on purpose (see the
 * module doc comment's "reads no environment and no ambient state"), and any
 * real `CanvasFetchResult` satisfies this shape structurally once its `body`
 * (a `Buffer`) has been decoded to text by the caller, which is a decision
 * about encoding this module should not have to make on someone else's
 * behalf. The two `ok: false` branches mirror `CanvasFetchResult`'s own two
 * decidable outcomes field-for-field, so a caller adapting one into the other
 * is a one-line, not a redesign.
 */
export type CanvasProbeExchange =
  | { readonly ok: true; readonly status: number; readonly bodyText: string }
  | { readonly ok: false; readonly kind: "host-not-allowed"; readonly reason: string }
  | { readonly ok: false; readonly kind: "unreachable" };

/** A Canvas `/api/v1/users/self` response, once it has been confirmed to actually look like one. */
interface CanvasSelfIdentity {
  readonly canvasUserId: string;
  readonly canvasUserName: string | null;
}

/** `JSON.parse`, total: `undefined` for anything that does not parse (HTML, empty body, truncated JSON) rather than throwing - a non-JSON body is exactly the shape E-UX3's marketing-site case takes. */
function tryParseJson(bodyText: string): unknown {
  try {
    return JSON.parse(bodyText);
  } catch {
    return undefined;
  }
}

/**
 * Recognizes a Canvas `/api/v1/users/self` response body: an object carrying
 * an `id` (Canvas ids are numeric, but this also accepts a non-empty numeric
 * STRING defensively, since this module must not assume every JSON parser or
 * intermediary preserves the wire type) and an optional `name`. Anything else
 * - not an object, no usable `id`, an array, `null` - is not a Canvas
 * identity this module will vouch for, no matter how close it looks.
 */
function extractCanvasSelfIdentity(parsed: unknown): CanvasSelfIdentity | null {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;

  const rawId = record.id;
  let canvasUserId: string;
  if (typeof rawId === "number" && Number.isFinite(rawId)) {
    canvasUserId = String(rawId);
  } else if (typeof rawId === "string" && rawId.trim() !== "") {
    canvasUserId = rawId.trim();
  } else {
    return null;
  }

  const rawName = record.name;
  const canvasUserName = typeof rawName === "string" && rawName.trim() !== "" ? rawName.trim() : null;

  return { canvasUserId, canvasUserName };
}

/**
 * Classifies a COMPLETED exchange (a real HTTP status and body came back) as
 * `"rejected"`, `"verified"`, or `"not-canvas"` - the three outcomes only a
 * completed exchange can produce. See the module doc comment for why every
 * status that is neither 401/403 nor a valid 200 self-record collapses to
 * `"not-canvas"` regardless of the actual code.
 *
 * 401/403 checked FIRST, ahead of the 200 branch: a token Canvas explicitly
 * rejects is the more actionable, more specific fact (E4's own wording,
 * "that token was rejected") and must not be shadowed by a coincidental
 * 200-with-unparseable-body check that never actually applies to a 401/403
 * response anyway - the ordering here matches E4's stated priority, not just
 * happening to be safe.
 */
function classifyCompletedExchange(status: number, bodyText: string): LmsCredentialProbeOutcome {
  if (status === 401 || status === 403) {
    return { kind: "rejected" };
  }
  if (status === 200) {
    const identity = extractCanvasSelfIdentity(tryParseJson(bodyText));
    if (identity !== null) {
      return { kind: "verified", canvasUserId: identity.canvasUserId, canvasUserName: identity.canvasUserName };
    }
  }
  return { kind: "not-canvas" };
}

/**
 * The single entry point: turns one `CanvasProbeExchange` into the outcome
 * E4's flow reports to the user. Callers still need `lmsCredentialRateLimited
 * Outcome` and `lmsCredentialSaveFailedOutcome` below for the two stages this
 * function is never even called for - see the module doc comment.
 */
export function classifyCanvasProbeOutcome(exchange: CanvasProbeExchange): LmsCredentialProbeOutcome {
  if (!exchange.ok) {
    return exchange.kind === "host-not-allowed"
      ? { kind: "host-not-allowed", reason: exchange.reason }
      : { kind: "unreachable" };
  }
  return classifyCompletedExchange(exchange.status, exchange.bodyText);
}

// ============================================================================
// The two outcomes no probe ever produces
// ============================================================================

/**
 * SEC9: the per-user save rate limit (./lms-credential-save-limit.ts) refused
 * this attempt before any network call happened. A factory rather than an
 * exported constant object so a caller cannot accidentally mutate a shared
 * instance - every real caller here is one-shot, but `Object.freeze` on a
 * module-level constant is one more thing to remember and this costs
 * nothing.
 */
export function lmsCredentialRateLimitedOutcome(): LmsCredentialProbeOutcome {
  return { kind: "rate-limited" };
}

/**
 * The probe already returned `"verified"` - the token is good, and this app
 * knows whose Canvas identity it belongs to - but persisting that proven
 * credential (`saveLmsCredential` in ./lms-credentials.ts) itself failed. A
 * database error, not a Canvas error: callers must not reuse any of the four
 * Canvas-facing outcomes' copy for this, because none of them are true here.
 */
export function lmsCredentialSaveFailedOutcome(): LmsCredentialProbeOutcome {
  return { kind: "save-failed" };
}
