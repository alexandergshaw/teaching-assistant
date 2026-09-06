"use server";

// Server actions behind the per-user Canvas credential surface at the top of
// /account/integrations. Contract: docs/lms-credentials-acceptance-
// criteria.md (E1-E10, SEC1-SEC13, DAT1-DAT6) and docs/lms-credentials-
// copy.md for every user-facing string these actions produce.
//
// Every export below is an UNAUTHENTICATED POST ENDPOINT the moment Next.js
// ships its id in a client bundle (see src/app/actions/action-guard-
// coverage.test.ts's own module comment) - each calls requireUser() directly,
// in its own body, before doing anything else, matching
// src/app/account/people/actions.ts's own convention of keeping the guard
// call textually present in every export rather than only inside a shared
// helper (the guard-coverage ratchet scans each EXPORTED function's own
// source text for a literal `requireUser(`/`requireOwner(`/`requireAppOwner(`
// call).
//
// requireUser() (any active account), not requireAppOwner(): a Canvas
// credential is per-user, per-institution data the caller owns outright (E1),
// not an owner-private shared secret - the opposite shape from
// src/app/account/people/actions.ts's five exports, which is why those call
// requireAppOwner() and these call requireUser().
//
// NEVER STORE AN UNVERIFIED TOKEN (E4). saveLmsCredentialAction only ever
// calls saveLmsCredential (src/lib/lms-credentials.ts) after
// classifyCanvasProbeOutcome has already returned "verified" for the fresh
// token. Every other branch returns before that call, so the row this
// user already had (if any) for this institution is never touched - see
// docs/lms-credentials-copy.md's E-UX7: "the token you are replacing keeps
// working until the new one is confirmed... if the new one fails to verify,
// nothing changes."
//
// SEC9's rate limit is enforced HERE against a REAL, DATABASE-BACKED attempt
// log (src/lib/lms-credential-save-attempts.ts, public.lms_credential_save_
// attempts) - durable and shared across every server instance answering a
// request, which is what makes it an actual limit on this deployment
// (Vercel, serverless) rather than a per-process counter a cold start or a
// second concurrent instance would bypass. mayAttemptLmsCredentialSave
// (src/lib/lms-credential-save-limit.ts) is a pure decision over a caller-
// supplied attempt history; it has no opinion about where that history lives
// or what happens on a storage failure - both of those are this file's job,
// in checkAndRecordAttempt below.
//
// FAILS CLOSED. If the attempt history cannot be read, or a permitted
// attempt cannot be durably recorded, checkAndRecordAttempt refuses the
// attempt rather than allowing it - see its own doc comment for why a rate
// limiter that quietly disables itself under a degraded database is worse
// than having none, precisely because it is trusted to be doing something.
//
// checkLmsCredentialConnectionAction ALSO draws from this same limiter. SEC9
// itself is written about the SAVE flow, but the same reasoning applies
// unchanged to any user-triggered Canvas probe this surface performs: both
// spend one of the user's own network round trips against a host this
// process will dial with a bearer token attached, so both are throttled from
// one shared budget rather than the check-connection path getting an
// unbounded second lane. Flagged in this change's report as an extension
// beyond the AC's literal text, not a literal requirement.

import { revalidatePath } from "next/cache";
import { requireUser, type AuthorizedUser } from "@/lib/supabase/auth";
import {
  listLmsCredentials,
  saveLmsCredential,
  deleteLmsCredential,
  getLmsCredentialSecret,
  touchLmsCredentialUsed,
  recordLmsCredentialFailure,
} from "@/lib/lms-credentials";
import { buildLmsCredentialRows, type LmsCredentialRow } from "@/lib/lms-credential-view";
import { validateLmsBaseUrl, normalizeLmsBaseUrl } from "@/lib/lms-credential-rules";
import { probeLmsCredential } from "@/lib/lms-credential-probe";
import {
  mayAttemptLmsCredentialSave,
  LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS,
} from "@/lib/lms-credential-save-limit";
import {
  getRecentLmsCredentialSaveAttempts,
  recordLmsCredentialSaveAttempt,
} from "@/lib/lms-credential-save-attempts";
import type { LmsCredentialProbeOutcome } from "@/lib/lms-credential-probe-outcome";

const INTEGRATIONS_PATH = "/account/integrations";

/**
 * Every distinguishable outcome the page needs to render for a save, a
 * Replace, or a "check connection" attempt - one discriminated union rather
 * than a boolean plus a free-text message, matching every other action
 * result shape in this codebase (see src/app/account/people/actions.ts's own
 * AccountActionResult for the precedent). The first seven kinds are
 * `LmsCredentialProbeOutcome`'s own six-outcome vocabulary
 * (docs/lms-credentials-copy.md renders each verbatim) redeclared here rather
 * than imported as a value union, because a `"use server"` file may export
 * only async functions and erased types (src/lib/use-server-exports.test.ts) -
 * `LmsCredentialProbeOutcome` itself is still imported and used internally,
 * just not re-exported.
 *
 * `"not-authorized"`, `"invalid-input"` and `"not-found"` are additions this
 * file's own plumbing needs and the copy sheet does not specify verbatim text
 * for - see this change's report for the exact strings used and why they are
 * flagged rather than invented silently.
 */
export type LmsCredentialProbeActionResult =
  | { kind: "verified" }
  | { kind: "rejected" }
  | { kind: "not-canvas" }
  | { kind: "host-not-allowed"; reason: string }
  | { kind: "unreachable" }
  | { kind: "rate-limited" }
  | { kind: "save-failed" }
  | { kind: "not-authorized" }
  | { kind: "invalid-input"; reason: string }
  | { kind: "not-found" };

export type LmsCredentialListResult =
  | { kind: "ok"; rows: LmsCredentialRow[] }
  | { kind: "not-authorized" }
  | { kind: "failed" };

export type LmsCredentialDeleteResult = { kind: "ok" } | { kind: "not-authorized" } | { kind: "failed" };

// ============================================================================
// SEC9's rate limit - see this file's own module comment for the fail-closed
// contract this function implements.
// ============================================================================

/**
 * Checks SEC9's limit for `userId` against the durable attempt history in
 * src/lib/lms-credential-save-attempts.ts and, if allowed, records this
 * attempt so it counts toward the next check - mirroring
 * ./lms-credential-save-limit.ts's own doc comment: the limit is on
 * ATTEMPTS, not failures, so a call that is allowed to proceed is recorded
 * here regardless of what the network probe that follows eventually decides.
 * A refused attempt is never recorded - it never spent a network round trip -
 * which is also what keeps a user hammering this after being refused from
 * growing their own history entry without bound.
 *
 * FAILS CLOSED in both directions this function can go wrong, deliberately:
 *   - the history read fails (getRecentLmsCredentialSaveAttempts returns
 *     `null`, never confused with a legitimate empty history - see that
 *     function's own doc comment): refuse, because a rate limiter that
 *     cannot see its own history has no basis to allow anything through.
 *   - the attempt was allowed but could not be durably recorded
 *     (recordLmsCredentialSaveAttempt throws): refuse THIS attempt too,
 *     because letting it through unrecorded would make every future check
 *     undercount, progressively weakening the limit every time a write
 *     happens to fail.
 * Neither branch is reachable from a healthy database; both exist so a
 * degraded one narrows access instead of silently widening it.
 */
async function checkAndRecordAttempt(userId: string): Promise<boolean> {
  const now = Date.now();
  const recent = await getRecentLmsCredentialSaveAttempts(userId, now - LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS);
  if (recent === null) {
    return false;
  }

  const decision = mayAttemptLmsCredentialSave(recent, now);
  if (!decision.allowed) {
    return false;
  }

  try {
    await recordLmsCredentialSaveAttempt(userId, now, LMS_CREDENTIAL_SAVE_LIMIT_WINDOW_MS);
  } catch {
    return false;
  }
  return true;
}

// ============================================================================
// Shared helpers (non-exported - a "use server" file may freely define these,
// only its EXPORTS are restricted to async functions and erased types).
// ============================================================================

function normalizeInstitutionInput(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toUpperCase() : "";
}

/**
 * Maps a real `LmsCredentialProbeOutcome` (five possible kinds from a live
 * probe, plus the two this file constructs itself for the stages a probe is
 * never even attempted for) onto this file's own action-result union. An
 * exhaustive switch with no `default` - a future addition to
 * `LmsCredentialProbeOutcome`'s kinds fails this at compile time rather than
 * silently falling through.
 */
function actionResultFromProbeOutcome(outcome: LmsCredentialProbeOutcome): LmsCredentialProbeActionResult {
  switch (outcome.kind) {
    case "verified":
      return { kind: "verified" };
    case "rejected":
      return { kind: "rejected" };
    case "not-canvas":
      return { kind: "not-canvas" };
    case "host-not-allowed":
      return { kind: "host-not-allowed", reason: outcome.reason };
    case "unreachable":
      return { kind: "unreachable" };
    case "rate-limited":
      return { kind: "rate-limited" };
    case "save-failed":
      return { kind: "save-failed" };
  }
}

// ============================================================================
// Exported actions
// ============================================================================

/**
 * E5's settings list: every Canvas credential the CALLING USER has stored,
 * across every institution. Deliberately renders only `source: "stored"`
 * rows (src/lib/lms-credential-view.ts) - the owner's environment-backed
 * fallback (E10) is a different, already-existing surface
 * (listConfiguredInstitutionsAction, src/app/actions/course-hub-
 * integrations.ts) outside this file's scope, and mixing the two here would
 * risk exactly the enumeration hazard DAT2 already had to fix once for that
 * action.
 */
export async function listLmsCredentialRowsAction(): Promise<LmsCredentialListResult> {
  let actor: AuthorizedUser;
  try {
    actor = await requireUser();
  } catch {
    return { kind: "not-authorized" };
  }

  try {
    const summaries = await listLmsCredentials(actor.id);
    const rows = buildLmsCredentialRows(
      summaries.map((summary) => ({
        source: "stored" as const,
        institution: summary.institution,
        baseUrl: summary.baseUrl,
        tokenLastFour: summary.tokenLastFour,
        canvasUserId: summary.canvasUserId,
        canvasUserName: summary.canvasUserName,
        createdAt: summary.createdAt,
        lastUsedAt: summary.lastUsedAt,
        lastFailureKind: summary.lastFailureKind,
      }))
    );
    return { kind: "ok", rows };
  } catch {
    return { kind: "failed" };
  }
}

/**
 * Save (first connection) or Replace (an existing row for the same
 * institution - `saveLmsCredential`'s own upsert handles both identically) a
 * Canvas credential. Order of checks, and why: institution/token shape and
 * `validateLmsBaseUrl` first (our own code, no network spent, SEC9/E-UX4 says
 * these need no rate-limit slot and no timing floor), THEN the rate limit
 * (before the one network call this function ever makes), THEN the probe,
 * and finally the store - never the reverse order for that last step (E4:
 * "stores nothing unless it succeeds").
 */
export async function saveLmsCredentialAction(input: {
  institution: string;
  baseUrl: string;
  token: string;
}): Promise<LmsCredentialProbeActionResult> {
  let actor: AuthorizedUser;
  try {
    actor = await requireUser();
  } catch {
    return { kind: "not-authorized" };
  }

  const institution = normalizeInstitutionInput(input?.institution);
  if (institution === "") {
    return { kind: "invalid-input", reason: "Enter an institution code." };
  }
  const token = typeof input?.token === "string" ? input.token : "";
  if (token.trim() === "") {
    return { kind: "invalid-input", reason: "Paste the Canvas access token you copied." };
  }
  const validation = validateLmsBaseUrl(input?.baseUrl);
  if (!validation.ok) {
    return { kind: "host-not-allowed", reason: validation.reason };
  }

  if (!(await checkAndRecordAttempt(actor.id))) {
    return { kind: "rate-limited" };
  }

  const baseUrl = normalizeLmsBaseUrl(typeof input?.baseUrl === "string" ? input.baseUrl : "");
  const outcome = await probeLmsCredential({ baseUrl, token });

  if (outcome.kind !== "verified") {
    return actionResultFromProbeOutcome(outcome);
  }

  try {
    await saveLmsCredential({
      userId: actor.id,
      institution,
      baseUrl,
      token,
      canvasUserId: outcome.canvasUserId,
      canvasUserName: outcome.canvasUserName,
    });
  } catch {
    return { kind: "save-failed" };
  }

  revalidatePath(INTEGRATIONS_PATH);
  return { kind: "verified" };
}

/**
 * Re-runs E4's probe against an EXISTING stored credential, using the
 * ALREADY-STORED token - no new token needed from the user. On success,
 * stamps `last_used_at` exactly like a normal successful resolver use would
 * (touchLmsCredentialUsed, src/lib/lms-credentials.ts). On a Canvas-facing
 * failure that maps cleanly onto E-REL6's closed three-value diagnostic enum,
 * records it (recordLmsCredentialFailure); `"not-canvas"` and
 * `"host-not-allowed"` do not map onto any of the three values without
 * misreporting what actually happened, so neither is recorded - see this
 * file's report for that judgment call.
 */
export async function checkLmsCredentialConnectionAction(
  institutionInput: string
): Promise<LmsCredentialProbeActionResult> {
  let actor: AuthorizedUser;
  try {
    actor = await requireUser();
  } catch {
    return { kind: "not-authorized" };
  }

  const institution = normalizeInstitutionInput(institutionInput);
  if (institution === "") {
    return { kind: "invalid-input", reason: "Enter an institution code." };
  }

  if (!(await checkAndRecordAttempt(actor.id))) {
    return { kind: "rate-limited" };
  }

  const secret = await getLmsCredentialSecret(actor.id, institution);
  if (!secret) {
    return { kind: "not-found" };
  }

  const outcome = await probeLmsCredential(secret);

  if (outcome.kind === "verified") {
    await touchLmsCredentialUsed(actor.id, institution);
  } else if (outcome.kind === "rejected") {
    await recordLmsCredentialFailure(actor.id, institution, "rejected");
  } else if (outcome.kind === "unreachable") {
    await recordLmsCredentialFailure(actor.id, institution, "host_unreachable");
  }

  revalidatePath(INTEGRATIONS_PATH);
  return actionResultFromProbeOutcome(outcome);
}

/**
 * Delete removes the row immediately (E5) - no confirmation happens here; the
 * client is expected to have already confirmed with the user before calling
 * this (see LmsCredentialSection.tsx's use of `window.confirm`, matching this
 * exact page's existing Google/Outlook disconnect controls).
 */
export async function deleteLmsCredentialAction(institutionInput: string): Promise<LmsCredentialDeleteResult> {
  let actor: AuthorizedUser;
  try {
    actor = await requireUser();
  } catch {
    return { kind: "not-authorized" };
  }

  const institution = normalizeInstitutionInput(institutionInput);
  if (institution === "") {
    return { kind: "failed" };
  }

  try {
    await deleteLmsCredential(actor.id, institution);
  } catch {
    return { kind: "failed" };
  }

  revalidatePath(INTEGRATIONS_PATH);
  return { kind: "ok" };
}
