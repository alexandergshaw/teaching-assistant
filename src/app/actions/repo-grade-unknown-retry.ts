"use server";
import { requireAppOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

/** Authorizes one targeted retry; the previous attempt remains unknown. */
export async function authorizeUnknownRepoRetryAction(generation: number, expectedAccountId: string) {
  const owner = await requireAppOwner();
  if (owner.id !== expectedAccountId || !Number.isSafeInteger(generation) || generation <= 0) return false;
  const { data, error } = await createServiceClient().rpc("repo_grade_authorize_unknown_retry", { p_user_id: owner.id, p_generation: generation }).retry(false);
  if (error) throw new Error("Authorization outcome could not be confirmed. Reload before retrying.");
  return data === true;
}
