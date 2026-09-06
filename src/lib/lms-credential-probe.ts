/**
 * E4's mandatory Canvas verification probe - the one place this feature ever
 * calls Canvas to prove a token before anything is stored, and the one place
 * a stored credential's ongoing health is re-checked without asking the user
 * to paste anything again ("check connection", src/app/account/integrations/
 * lms-actions.ts). Contract: docs/lms-credentials-acceptance-criteria.md E4,
 * E-REL2, SEC9; tests: ./lms-credential-probe.test.ts.
 *
 * WHY THIS IS A SEPARATE, TINY MODULE. `canvas-fetch.ts` already closes the
 * two SSRF holes (DNS rebinding, redirects) and applies the SEC9/E-UX4 timing
 * floor to its own network-layer outcome; `lms-credential-probe-outcome.ts`
 * already classifies a completed (or refused, or network-failed) exchange
 * into the six-outcome vocabulary the copy sheet renders. Nothing about
 * calling `/api/v1/users/self` needed a third copy of either job - this
 * module's only work is the seam between them: build the one URL this
 * feature ever asks `canvasFetch` to dial, decode its `Buffer` body into the
 * `bodyText` string `classifyCanvasProbeOutcome` expects, and pick the ONE
 * timeout number E4's probe uses everywhere it runs.
 *
 * THE BOUND: 10 SECONDS, NO RETRY (E-REL2). E-REL2 argues this exact number
 * for "the validation probe" as the repo's only external-host precedent, and
 * `canvasFetch` itself never retries a hop by construction (see that
 * module's own "NO RETRIES" section) - there is no retry flag to disable
 * here, only a timeout to choose. Ten seconds is short on purpose: a user
 * sitting on this form waiting to find out whether their token worked is a
 * fundamentally different situation from an unattended background sync, and
 * retrying either failure mode (a hung host, or a token Canvas already
 * rejected) only ever produces the SAME outcome a second time, slower - see
 * `canvas-fetch.ts`'s own "NO RETRIES" section for why retrying a
 * network-layer failure against a user-supplied host is refused everywhere in
 * this feature, not only here.
 *
 * THIS MODULE NEVER VALIDATES THE BASE URL ITSELF. `validateLmsBaseUrl`
 * (./lms-credential-rules.ts) is the caller's job, before this is ever
 * invoked - re-running it here would be the exact "two copies that must
 * agree" duplication that module's own header warns against. `canvasFetch`
 * re-validates the origin defensively on every hop regardless (SEC12), so a
 * caller that skipped validation is still refused, just later and with a less
 * specific failure than if it had checked first.
 */

import { canvasFetch, type CanvasFetchResult } from "./canvas-fetch";
import {
  classifyCanvasProbeOutcome,
  type CanvasProbeExchange,
  type LmsCredentialProbeOutcome,
} from "./lms-credential-probe-outcome";

/**
 * E-REL2's argued bound for E4's validation probe: 10 seconds, applied
 * identically whether this is a first-time save, a Replace, or a "check
 * connection" re-probe of an already-stored token - the AC draws no
 * distinction between those three call shapes for this one number.
 */
export const LMS_CREDENTIAL_PROBE_TIMEOUT_MS = 10_000;

/** What this module needs to probe a Canvas credential - the caller's own
 * already-validated, already-normalized base URL (./lms-credential-rules.ts)
 * and the plaintext token to test it with. Deliberately not the resolver's
 * `{ source, institution, baseUrl, token }` shape (canvas-credentials.ts,
 * E-ARCH3, owned by a different module) - only these two fields are ever
 * read here, so only these two are declared, and any object shaped like this
 * satisfies it structurally. */
export interface LmsCredentialProbeCredential {
  readonly baseUrl: string;
  readonly token: string;
}

/**
 * Turns one `canvasFetch` result into the `CanvasProbeExchange` shape
 * `classifyCanvasProbeOutcome` expects - decoding the raw response `Buffer`
 * to UTF-8 text is the only real work here; the two failure shapes already
 * line up field-for-field with `CanvasProbeExchange`'s own two `ok: false`
 * branches (see that type's own doc comment for why it was designed to mirror
 * `CanvasFetchResult` exactly).
 */
function toProbeExchange(result: CanvasFetchResult): CanvasProbeExchange {
  if (!result.ok) {
    return result.kind === "host-not-allowed"
      ? { ok: false, kind: "host-not-allowed", reason: result.reason }
      : { ok: false, kind: "unreachable" };
  }
  return { ok: true, status: result.status, bodyText: result.body.toString("utf8") };
}

/**
 * E4's probe itself: a real, read-only call against `/api/v1/users/self` on
 * `credential.baseUrl`, through `canvasFetch` (never a bare `fetch` - see that
 * module's own header for why), bound to `LMS_CREDENTIAL_PROBE_TIMEOUT_MS`
 * with no retry, classified into the six-outcome vocabulary a page renders
 * verbatim. Never returns `"rate-limited"` or `"save-failed"` itself -
 * `classifyCanvasProbeOutcome` only ever produces the other five from a real
 * exchange; those two are decided by the caller, before and after this
 * function runs respectively (see that module's own doc comment).
 */
export async function probeLmsCredential(
  credential: LmsCredentialProbeCredential
): Promise<LmsCredentialProbeOutcome> {
  const url = `${credential.baseUrl}/api/v1/users/self`;
  const result = await canvasFetch(
    url,
    { timeoutMs: LMS_CREDENTIAL_PROBE_TIMEOUT_MS },
    { token: credential.token }
  );
  return classifyCanvasProbeOutcome(toProbeExchange(result));
}
