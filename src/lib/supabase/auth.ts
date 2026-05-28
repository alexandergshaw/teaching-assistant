import { createClient as createServerSupabaseClient } from "./server";

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
