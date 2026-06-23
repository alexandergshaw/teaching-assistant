// Per-user grading notification preferences (assignments marked "seen" and
// courses the user stopped watching). Stored in Supabase so the state and the
// needs-grading badge stay consistent across devices. Accessed via the
// service-role client behind requireOwner(), mirroring src/lib/google-credentials.ts.

import { createServiceClient } from "./supabase/server";
import type { Database } from "./supabase/types";

type DismissalsTable = Database["public"]["Tables"]["grading_dismissals"];

export type DismissalScope = "assignment" | "course";

export interface GradingDismissal {
  scope: DismissalScope;
  institution: string;
  refId: string;
}

function table() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (createServiceClient() as any).from("grading_dismissals");
}

/** All of a user's dismissals (seen assignments + unwatched courses). */
export async function listDismissals(userId: string): Promise<GradingDismissal[]> {
  const { data, error } = await table()
    .select("scope, institution, ref_id")
    .eq("user_id", userId);
  if (error) {
    console.error("[grading-dismissals] Could not read preferences:", error.message);
    return [];
  }
  if (!data) return [];
  return (data as Pick<DismissalsTable["Row"], "scope" | "institution" | "ref_id">[]).map((r) => ({
    scope: r.scope,
    institution: r.institution,
    refId: r.ref_id,
  }));
}

/** Mark a single (scope, institution, ref) as dismissed. Idempotent. */
export async function addDismissal(
  userId: string,
  scope: DismissalScope,
  institution: string,
  refId: string
): Promise<void> {
  const row: DismissalsTable["Insert"] = {
    user_id: userId,
    scope,
    institution,
    ref_id: refId,
  };
  const { error } = await table().upsert(row, { onConflict: "user_id,scope,institution,ref_id" });
  if (error) throw new Error(`Could not save grading preference: ${error.message}`);
}

/** Undo a dismissal (un-see an assignment / resume watching a course). */
export async function removeDismissal(
  userId: string,
  scope: DismissalScope,
  institution: string,
  refId: string
): Promise<void> {
  const { error } = await table()
    .delete()
    .eq("user_id", userId)
    .eq("scope", scope)
    .eq("institution", institution)
    .eq("ref_id", refId);
  if (error) throw new Error(`Could not update grading preference: ${error.message}`);
}
