import "server-only";
import { requireAppOwner } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export interface ArchiveReviewPrincipal { readonly ownerId: string; readonly authSessionId: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL = "00000000-0000-0000-0000-000000000000";
export const validReviewId = (value: unknown): value is string => typeof value === "string" && UUID.test(value) && value.toLowerCase() !== NIL;

/** Resolves owner and verified auth-session claims from the server request. */
export async function requireArchiveReviewPrincipal(): Promise<ArchiveReviewPrincipal> {
  const owner = await requireAppOwner();
  const client = await createClient();
  const { data, error } = await client.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims || !validReviewId(owner.id) || claims.sub !== owner.id || !validReviewId(claims.session_id) || claims.role !== "authenticated" || claims.aud !== "authenticated" || claims.is_anonymous !== false || typeof claims.exp !== "number" || !Number.isSafeInteger(claims.exp) || claims.exp <= Date.now() / 1000) {
    throw new Error("The archive review session is unavailable.");
  }
  return { ownerId: owner.id, authSessionId: claims.session_id };
}
