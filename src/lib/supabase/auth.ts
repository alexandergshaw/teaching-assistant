import { createClient as createServerSupabaseClient } from "./server";
import { isOwnerEmail } from "../owner";

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
 * not signed in as an allowlisted owner (see OWNER_EMAILS). Call this at the top
 * of any action that uses privileged credentials (e.g. the Canvas API token).
 */
export async function requireOwner() {
  const user = await getCurrentUser();
  if (!isOwnerEmail(user?.email)) {
    throw new Error("Not authorized. Sign in with an approved account.");
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
