import type { User } from "@supabase/supabase-js";
import { createClient as createServerSupabaseClient } from "./server";
import { isOwnerEmail } from "../owner";
import { getImpersonatedOwner, type OwnerIdentity } from "./owner-context";

/**
 * Server-side auth helpers. For client-side auth, use the browser client
 * directly via `createClient()` from "./client".
 */

export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

/**
 * Authorize a server action for the app owner only. Throws when the caller is
 * not signed in as an allowlisted owner (see OWNER_EMAILS), or when they have MFA
 * enrolled but haven't completed it this session (AAL2). Call this at the top of
 * any action that uses privileged credentials (e.g. the Canvas API token).
 *
 * Returns an object with at least `id`/`email` - every caller in this
 * codebase reads only those two fields off the result (verified by grep), so
 * the impersonation branch below can return a minimal object instead of a
 * full Supabase `User`.
 */
export async function requireOwner(): Promise<User | OwnerIdentity> {
  // SECURITY: this is the ONLY bypass of the cookie+MFA check below, and it
  // can only fire when src/lib/supabase/owner-context.ts's ALS store has been
  // populated. The ONLY code allowed to populate it is the cron route
  // (src/app/api/cron/run-schedules/route.ts), which does so after verifying
  // CRON_SECRET and isOwnerEmail itself - see owner-context.ts for the full
  // writeup. No browser-reachable code path can set this context, so normal
  // (non-cron) requests always fall through to the cookie+MFA path unchanged.
  const impersonated = getImpersonatedOwner();
  if (impersonated) {
    return impersonated;
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user || !isOwnerEmail(user.email)) {
    throw new Error("Not authorized. Sign in with an approved account.");
  }

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    throw new Error("Multi-factor authentication required. Finish the second step at sign-in.");
  }

  return user;
}

export async function getCurrentSession() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function signOut() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
}

export async function signInWithPassword(email: string, password: string) {
  const supabase = await createServerSupabaseClient();
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithPassword(email: string, password: string) {
  const supabase = await createServerSupabaseClient();
  return supabase.auth.signUp({ email, password });
}
