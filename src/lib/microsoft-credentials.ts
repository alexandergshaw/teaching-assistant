// Persistence for the owner's Microsoft (Outlook) OAuth tokens, one row per school
// (institution). Tokens are encrypted before they touch the database and decrypted
// on read. Writes use the Supabase service-role client (bypassing RLS) since this
// runs in trusted server code behind requireOwner(); reads are additionally
// protected by RLS. Mirrors src/lib/google-credentials.ts.

import { createServiceClient } from "./supabase/server";
import type { Database } from "./supabase/types";
import { encryptSecret, decryptSecret } from "./crypto";
import { refreshAccessToken } from "./microsoft-oauth";

type CredentialsTable = Database["public"]["Tables"]["microsoft_credentials"];

export interface StoredMicrosoftTokens {
  accessToken: string;
  refreshToken: string | null;
  expiry: Date | null;
  scope: string | null;
}

function normalizeInstitution(code: string): string {
  return code.trim().toUpperCase();
}

function table() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (createServiceClient() as any).from("microsoft_credentials");
}

/** Read and decrypt the stored tokens for a user + school, or null if not connected. */
export async function getCredentials(userId: string, institution: string): Promise<StoredMicrosoftTokens | null> {
  const { data, error } = await table()
    .select("access_token, refresh_token, expiry, scope")
    .eq("user_id", userId)
    .eq("institution", normalizeInstitution(institution))
    .maybeSingle();
  if (error) {
    console.error("[microsoft-credentials] Could not read credentials:", error.message);
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
  institution: string,
  tokens: { accessToken: string; refreshToken: string | null; expiry: Date; scope: string | null }
): Promise<void> {
  const row: CredentialsTable["Insert"] = {
    user_id: userId,
    institution: normalizeInstitution(institution),
    access_token: encryptSecret(tokens.accessToken),
    expiry: tokens.expiry.toISOString(),
    scope: tokens.scope,
    updated_at: new Date().toISOString(),
    ...(tokens.refreshToken ? { refresh_token: encryptSecret(tokens.refreshToken) } : {}),
  };
  const { error } = await table().upsert(row, { onConflict: "user_id,institution" });
  if (error) {
    throw new Error(`Could not save Microsoft credentials: ${error.message}`);
  }
}

async function updateAccessToken(
  userId: string,
  institution: string,
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
  await table().update(row).eq("user_id", userId).eq("institution", normalizeInstitution(institution));
}

/** Forget a user's Outlook connection for one school. */
export async function deleteCredentials(userId: string, institution: string): Promise<void> {
  await table().delete().eq("user_id", userId).eq("institution", normalizeInstitution(institution));
}

/** The institution codes the user has a usable (refresh-token) Outlook connection for. */
export async function listConnectedInstitutions(userId: string): Promise<string[]> {
  const { data, error } = await table().select("institution, refresh_token").eq("user_id", userId);
  if (error) {
    console.error("[microsoft-credentials] Could not list connections:", error.message);
    return [];
  }
  const rows = (data ?? []) as Array<{ institution: string; refresh_token: string | null }>;
  return rows.filter((r) => !!r.refresh_token).map((r) => r.institution);
}

/** The institution codes and their granted scopes for usable (refresh-token) Outlook connections. */
export async function listConnectedInstitutionsWithScope(
  userId: string
): Promise<Array<{ institution: string; scope: string | null }>> {
  const { data, error } = await table().select("institution, refresh_token, scope").eq("user_id", userId);
  if (error) {
    console.error("[microsoft-credentials] Could not list connections with scope:", error.message);
    return [];
  }
  const rows = (data ?? []) as Array<{
    institution: string;
    refresh_token: string | null;
    scope: string | null;
  }>;
  return rows.filter((r) => !!r.refresh_token).map((r) => ({ institution: r.institution, scope: r.scope }));
}

/**
 * Return a usable access token for the user + school, refreshing (and persisting
 * the rotated token) when the current one is missing or near expiry. Returns null
 * when not connected or the connection can't be refreshed.
 */
export async function getValidAccessToken(userId: string, institution: string): Promise<string | null> {
  const creds = await getCredentials(userId, institution);
  if (!creds) return null;

  const skewMs = 60_000;
  const stillValid = creds.accessToken && creds.expiry && creds.expiry.getTime() - skewMs > Date.now();
  if (stillValid) return creds.accessToken;

  if (!creds.refreshToken) return creds.accessToken || null;

  const refreshed = await refreshAccessToken(creds.refreshToken);
  const expiry = new Date(Date.now() + refreshed.expiresIn * 1000);
  await updateAccessToken(userId, institution, refreshed.accessToken, expiry, refreshed.scope ?? creds.scope);
  return refreshed.accessToken;
}
