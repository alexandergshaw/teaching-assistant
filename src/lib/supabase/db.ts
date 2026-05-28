import { createClient as createServerSupabaseClient } from "./server";

/**
 * Thin server-side database helpers. Keep query logic in this file so
 * components stay free of raw Supabase calls.
 *
 * Example pattern — add typed wrappers as your schema grows:
 *
 *   export async function listSyllabi(userId: string) {
 *     const supabase = await createServerSupabaseClient();
 *     return supabase.from("syllabi").select("*").eq("user_id", userId);
 *   }
 */

export async function getDb() {
  return createServerSupabaseClient();
}
