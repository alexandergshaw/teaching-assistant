import "server-only";

import { createClient } from "@supabase/supabase-js";
import { resolveAccess } from "../access";
import { readRepoFeedbackReadiness } from "./repo-feedback-readiness";
import type { Database } from "./types";

const VERIFY_TIMEOUT_MS = 5_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

function isId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value) && value !== NIL_UUID;
}

/** Verifies the submitted session's identity and access. The browser's explicit
 * sign-in challenge owns freshness and must bind this result to its own attempt.
 */
export async function verifyRepoFeedbackSession(jwt: string, signal: AbortSignal) {
  try {
    const readiness = readRepoFeedbackReadiness();
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!readiness || !key || signal.aborted || Date.now() >= readiness.expiresAt) return null;

    const issuer = `${readiness.origin}/auth/v1`;
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(VERIFY_TIMEOUT_MS)]);
    const supabase = createClient<Database>(readiness.origin, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        debug: false,
      },
      global: {
        async fetch(input, init) {
          try {
            if (deadline.aborted || Date.now() >= readiness.expiresAt) return new Response(null, { status: 503 });
            return await fetch(input, { ...init, signal: deadline, cache: "no-store", redirect: "error" });
          } catch {
            // Auth JS logs thrown transport errors. Give it a fixed failure
            // response so a credential or upstream error cannot enter logs.
            return new Response(null, { status: 503 });
          }
        },
      },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    const user = userData?.user;
    if (userError || !user || user.is_anonymous === true) return null;

    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(jwt);
    const claims = claimsData?.claims;
    if (claimsError || !claims) return null;
    const audience = claims.aud;
    const authenticatedAudience = audience === "authenticated" ||
      (Array.isArray(audience) && audience.length === 1 && audience[0] === "authenticated");
    if (
      claims.iss !== issuer || !authenticatedAudience || claims.role !== "authenticated" ||
      claims.is_anonymous !== false || !Number.isSafeInteger(claims.exp) ||
      claims.exp <= Date.now() / 1000 || !isId(claims.sub) || claims.sub !== user.id ||
      !isId(claims.session_id) || (claims.aal !== "aal1" && claims.aal !== "aal2")
    ) return null;

    const { data: profile, error: profileError } = await supabase.from("app_users")
      .select("id, role, status")
      .eq("id", claims.sub)
      .setHeader("Authorization", `Bearer ${jwt}`)
      .retry(false)
      .maybeSingle();
    // Require the subject's live, active row even for a break-glass owner.
    if (profileError || profile?.id !== claims.sub || profile.status !== "active") return null;

    const decision = resolveAccess({
      email: user.email,
      emailVerified: Boolean(user.email_confirmed_at),
      profile,
    });
    if (decision !== "active" && decision !== "owner") return null;

    // The SDK's explicit-JWT overload looks up current verified factors via
    // getUser(jwt). Without the argument it would consult a different session.
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel(jwt);
    if (aalError || aal?.currentLevel !== claims.aal || aal.nextLevel !== claims.aal) return null;
    const current = readRepoFeedbackReadiness();
    const now = Date.now();
    if (deadline.aborted || claims.exp <= now / 1000 || now >= readiness.expiresAt ||
      !current || current.origin !== readiness.origin || current.policy !== readiness.policy ||
      current.expiresAt !== readiness.expiresAt) return null;

    return { accountId: claims.sub, sessionId: claims.session_id };
  } catch {
    return null;
  }
}
