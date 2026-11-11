import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ExpectedOwnerSession } from "./owner-session-binding";
import type { GradingZipStorage } from "./grading-zip-transport";

/** Capture one matching token; the storage client never consults a later session. */
export async function boundZipStorage(supabase: SupabaseClient, expected: ExpectedOwnerSession, current: () => boolean): Promise<GradingZipStorage | null> {
  if (!current()) return null;
  const { data, error } = await supabase.auth.getSession(); const token = data.session?.access_token;
  if (error || typeof token !== "string" || token.length > 8185 || !current()) return null;
  try {
    const parts = token.split("."); if (parts.length !== 3) return null;
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/"), bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const claims = payload as Record<string, unknown>;
    if (claims.sub !== expected.accountId || claims.session_id !== expected.sessionId || typeof claims.exp !== "number" || claims.exp <= Date.now() / 1000 || !current()) return null;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key, { accessToken: async () => current() ? token : null }).storage;
  } catch { return null; }
}
