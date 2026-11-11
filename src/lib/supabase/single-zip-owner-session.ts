import "server-only";
import { requireAppOwner } from "./auth";
import { createClient } from "./server";

/** Bind a model request to the verified cookie owner and exact signed session. */
export async function verifySingleZipOwnerSession(expected: { accountId: string; sessionId: string }): Promise<boolean> {
  try {
    if (!expected || typeof expected.accountId !== "string" || typeof expected.sessionId !== "string") return false;
    const owner = await requireAppOwner();
    if (owner.id !== expected.accountId) return false;
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims(); const claims = data?.claims;
    return !error && !!claims && claims.sub === owner.id && claims.session_id === expected.sessionId && typeof claims.exp === "number" && Number.isSafeInteger(claims.exp) && claims.exp > Date.now() / 1000;
  } catch { return false; }
}
