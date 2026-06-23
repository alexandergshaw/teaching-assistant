// Persistence for the owner's Google OAuth tokens. Tokens are encrypted before
// they touch the database and decrypted on read. Writes use the Supabase
// service-role client (bypassing RLS) since this runs in trusted server code
// behind requireOwner(); reads are additionally protected by RLS.

import { createServiceClient } from "./supabase/server";
import type { Database } from "./supabase/types";
import { encryptSecret, decryptSecret } from "./crypto";
import { refreshAccessToken } from "./google-oauth";

type CredentialsTable = Database["public"]["Tables"]["google_credentials"];

export interface StoredGoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiry: Date | null;
  scope: string | null;
}

// The compiled Supabase client's generics resolve table relations to `never`,
// so (matching src/lib/supabase/chat-logs.ts) we reach `.from()` through an
// `any` cast and apply the row types ourselves.
function table() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (createServiceClient() as any).from("google_credentials");
}

/** Read and decrypt the stored tokens for a user, or null if not connected. */
export async function getCredentials(userId: string): Promise<StoredGoogleTokens | null> {
  const { data, error } = await table()
    .select("access_token, refresh_token, expiry, scope")
    .eq("user_id", userId)
    .maybeSingle();
  // A read error (e.g. the table does not exist because the migration has not
  // been run) is logged rather than swallowed, then treated as "not connected".
  if (error) {
    console.error("[google-credentials] Could not read credentials:", error.message);
    return null;
  }
  if (!data) return null;
  const row = data as CredentialsTable["Row"];
  return {
    accessToken: row.access_token ? decryptSecret(row.access_token) : "",
    refreshToken: row.refresh_token ? decryptSecret(row.refresh_token) : null,
    expiry: row.expiry ? new Date(row.expiry) : null,
    scope: row.scope,
  };
}

/** Upsert the full token set from an initial authorization-code exchange. */
export async function saveCredentials(
  userId: string,
  tokens: { accessToken: string; refreshToken: string | null; expiry: Date; scope: string | null }
): Promise<void> {
  // Only overwrite the refresh token when Google actually returned one, so a
  // re-auth that omits it can never wipe a working token.
  const row: CredentialsTable["Insert"] = {
    user_id: userId,
    access_token: encryptSecret(tokens.accessToken),
    expiry: tokens.expiry.toISOString(),
    scope: tokens.scope,
    updated_at: new Date().toISOString(),
    ...(tokens.refreshToken ? { refresh_token: encryptSecret(tokens.refreshToken) } : {}),
  };
  // Surface a failed write (e.g. missing table / RLS) instead of letting the
  // connect flow report success when nothing was actually stored.
  const { error } = await table().upsert(row, { onConflict: "user_id" });
  if (error) {
    throw new Error(`Could not save Google credentials: ${error.message}`);
  }
}

/** Update just the access token + expiry after a refresh (keeps refresh token). */
async function updateAccessToken(
  userId: string,
  accessToken: string,
  expiry: Date,
  scope: string | null
): Promise<void> {
  const row: CredentialsTable["Update"] = {
    access_token: encryptSecret(accessToken),
    expiry: expiry.toISOString(),
    scope,
    updated_at: new Date().toISOString(),
  };
  await table().update(row).eq("user_id", userId);
}

/** Forget a user's Google connection entirely. */
export async function deleteCredentials(userId: string): Promise<void> {
  await table().delete().eq("user_id", userId);
}

/**
 * Return a usable access token for the user, refreshing (and persisting the new
 * token) when the current one is missing or within a minute of expiring. Returns
 * null when the user has not connected Google or the connection can't be
 * refreshed (e.g. the refresh token was revoked).
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const creds = await getCredentials(userId);
  if (!creds) return null;

  const skewMs = 60_000;
  const stillValid = creds.accessToken && creds.expiry && creds.expiry.getTime() - skewMs > Date.now();
  if (stillValid) return creds.accessToken;

  if (!creds.refreshToken) return creds.accessToken || null;

  const refreshed = await refreshAccessToken(creds.refreshToken);
  const expiry = new Date(Date.now() + refreshed.expiresIn * 1000);
  await updateAccessToken(userId, refreshed.accessToken, expiry, refreshed.scope ?? creds.scope);
  return refreshed.accessToken;
}
