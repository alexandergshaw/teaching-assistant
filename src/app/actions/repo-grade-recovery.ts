"use server";

import { requireAppOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";

const SNAPSHOT_LIMIT = 100;
const LEASE_MS = 15 * 60_000; // Mirrors the database's dispatch lease for display only.
const unavailable = { status: "unavailable" } as const;

type Reservation = {
  generation: number;
  repo: string | null;
  folder: string | null;
  state: "active" | "waiting-for-expiry" | "expired-unstarted" | "evidence-required" | "attempt-unavailable";
};

/** The two reads are observational. Only the recovery RPC decides which
 * reservations can be released, under the same lock as begin-dispatch. */
async function readReservations(accountId: string) {
  try {
    const client = createServiceClient();
    const { data, error, count } = await client.from("repo_grade_reservations")
      .select("generation, user_id", { count: "exact" }).eq("user_id", accountId)
      .order("generation").limit(SNAPSHOT_LIMIT).retry(false);
    if (error || !Array.isArray(data) || data.length !== count || data.length > SNAPSHOT_LIMIT
      || data.some(({ generation, user_id }) => user_id !== accountId || !Number.isSafeInteger(generation) || generation < 1)) {
      return unavailable;
    }
    const ids = new Set(data.map(({ generation }) => generation));
    if (ids.size !== data.length) return unavailable;
    if (ids.size === 0) return { status: "loaded", reservations: [] as Reservation[] } as const;

    const attempts = await client.from("repo_grade_attempts")
      .select("generation, user_id, repo, folder, status, claimed_at, dispatch_state", { count: "exact" })
      .eq("user_id", accountId).in("generation", [...ids]).retry(false);
    if (attempts.error || !Array.isArray(attempts.data) || attempts.data.length !== attempts.count
      || attempts.data.some(({ generation, user_id, repo, folder, claimed_at, dispatch_state }) =>
        !ids.has(generation) || user_id !== accountId || typeof repo !== "string"
        || (folder !== null && typeof folder !== "string") || !Number.isFinite(Date.parse(claimed_at))
        || (dispatch_state !== null && dispatch_state !== "prepared" && dispatch_state !== "started"))) {
      return unavailable;
    }
    const byId = new Map(attempts.data.map((attempt) => [attempt.generation, attempt]));
    if (byId.size !== attempts.data.length) return unavailable;

    const staleBefore = Date.now() - LEASE_MS;
    const reservations: Reservation[] = [];
    for (const generation of ids) {
      const attempt = byId.get(generation);
      if (!attempt || (attempt.status !== "unknown" && attempt.status !== "claimed")) {
        reservations.push({ generation, repo: null, folder: null, state: "attempt-unavailable" });
        continue;
      }
      const expired = Date.parse(attempt.claimed_at) <= staleBefore;
      let state: Reservation["state"] = "active";
      if (attempt.dispatch_state === "prepared") {
        if (expired) state = "expired-unstarted";
        else if (attempt.status === "unknown") state = "waiting-for-expiry";
      } else if (expired || attempt.status === "unknown") {
        state = "evidence-required";
      }
      reservations.push({ generation, repo: attempt.repo, folder: attempt.folder, state });
    }
    return { status: "loaded", reservations } as const;
  } catch {
    return unavailable;
  }
}

export async function readRepoGradeReservationsAction(expectedAccountId: unknown) {
  const owner = await requireAppOwner();
  if (owner.id !== expectedAccountId) return unavailable;
  return readReservations(owner.id);
}

export async function recoverUnstartedRepoGradeReservationsAction(expectedAccountId: unknown) {
  const owner = await requireAppOwner();
  if (owner.id !== expectedAccountId) return unavailable;
  try {
    const { error } = await createServiceClient().rpc("repo_grade_expire_prepared_attempts", {
      p_user_id: owner.id,
    }).retry(false);
    if (error) return { status: "outcome-unconfirmed" } as const;
  } catch {
    return { status: "outcome-unconfirmed" } as const;
  }
  return { status: "checked", snapshot: await readReservations(owner.id) } as const;
}
