// Pure types + DB accessors for Avatar Studio: Tavus-trained likenesses
// (avatar_likenesses) and the videos generated from them (avatar_videos).
//
// No "use server" here - this is a plain data-access module, mirroring
// src/lib/presentation-drafts.ts and src/lib/recording-files.ts: functions
// take an explicit SupabaseClient + userId so the same code works from a
// browser session or the cron's service-role client, and every query is
// scoped with .eq("user_id", userId). The owner-gated server actions in
// src/app/actions/media-likeness.ts are a thin wrapper around these.
//
// CRITICAL: typed Supabase selects against tables this generic client
// doesn't fully model collapse to `never` at the call site (a repo-wide
// gotcha, not specific to this feature). Every read below goes through an
// explicit row -> domain mapper, exactly like mapRecordingFile at the bottom
// of src/lib/recording-files.ts, and writes go through a cast-through-any
// table() helper like presentation-drafts.ts's.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

export type AvatarLikenessStatus = "pending" | "training" | "ready" | "failed" | "superseded";

/** Statuses a training attempt has not yet finished in - used for the
 * "one training at a time per user" rule (AC7.3) and for deciding whether a
 * sample is still in use by a live training attempt (AC7.2). */
const NON_TERMINAL_LIKENESS_STATUSES: AvatarLikenessStatus[] = ["pending", "training"];

export interface AvatarLikeness {
  id: string;
  provider: string;
  externalId: string | null;
  name: string;
  status: AvatarLikenessStatus;
  errorMessage: string | null;
  sampleFileId: string | null;
  isDefault: boolean;
  acknowledgement: string | null;
  acknowledgedAt: string | null;
  /** Tavus's raw training_progress string (e.g. "42/100"), carried through
   * verbatim for DISPLAY ONLY during the 3-4 hour training wait. Never use
   * this to infer a stall - the Tavus FAQ says it legitimately sits at one
   * value while a step processes, so a poll loop that has not moved it in a
   * while is not evidence of anything. Null before the first poll and for
   * any likeness trained before this column existed. */
  trainingProgress: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AvatarVideo {
  id: string;
  likenessId: string | null;
  externalId: string | null;
  status: string;
  script: string;
  recordingFileId: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

type LikenessRow = Database["public"]["Tables"]["avatar_likenesses"]["Row"];
type VideoRow = Database["public"]["Tables"]["avatar_videos"]["Row"];

function mapAvatarLikeness(row: LikenessRow): AvatarLikeness {
  return {
    id: row.id,
    provider: row.provider,
    externalId: row.external_id,
    name: row.name,
    status: row.status as AvatarLikenessStatus,
    errorMessage: row.error_message,
    sampleFileId: row.sample_file_id,
    isDefault: row.is_default,
    acknowledgement: row.acknowledgement,
    acknowledgedAt: row.acknowledged_at,
    trainingProgress: row.training_progress,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAvatarVideo(row: VideoRow): AvatarVideo {
  return {
    id: row.id,
    likenessId: row.likeness_id,
    externalId: row.external_id,
    status: row.status,
    script: row.script,
    recordingFileId: row.recording_file_id,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function likenessTable(supabase: SupabaseClient<Database>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("avatar_likenesses");
}

function videoTable(supabase: SupabaseClient<Database>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (supabase as any).from("avatar_videos");
}

// ── avatar_likenesses reads ─────────────────────────────────────────────────

/** All likenesses for the owner, newest first. */
export async function listAvatarLikenesses(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<AvatarLikeness[]> {
  const { data, error } = await likenessTable(supabase)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as LikenessRow[]).map(mapAvatarLikeness);
}

/** One likeness by id, scoped to its owner; null if missing or not owned. */
export async function getAvatarLikenessById(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<AvatarLikeness | null> {
  const { data, error } = await likenessTable(supabase)
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapAvatarLikeness(data as LikenessRow);
}

/** The owner's non-terminal (pending/training) likeness, if any - AC7.3's
 * "one training at a time" gate reads through this. */
export async function findNonTerminalAvatarLikeness(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<AvatarLikeness | null> {
  const { data, error } = await likenessTable(supabase)
    .select("*")
    .eq("user_id", userId)
    .in("status", NON_TERMINAL_LIKENESS_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapAvatarLikeness(data as LikenessRow);
}

/** The owner's default likeness, only when it is actually ready to generate
 * from (AC7.5: a likeness that is still training is not ready). */
export async function findDefaultReadyAvatarLikeness(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<AvatarLikeness | null> {
  const { data, error } = await likenessTable(supabase)
    .select("*")
    .eq("user_id", userId)
    .eq("is_default", true)
    .eq("status", "ready")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapAvatarLikeness(data as LikenessRow);
}

/** Every likeness for the owner not already superseded - the set AC7.1
 * retires (marks superseded + provider-deletes) once a NEW likeness reaches
 * "ready" (see retireSupersededAvatarLikenesses in
 * src/app/actions/media-likeness.ts - never at training start, since taking
 * down a working likeness the moment a retrain begins would leave the user
 * with nothing usable for the 3-4 hours training runs, permanently if it
 * then fails).
 *
 * `excludeId`, when given, is applied at the query itself so the
 * just-readied likeness can never appear in its own retirement set. */
export async function listSupersedableAvatarLikenesses(
  supabase: SupabaseClient<Database>,
  userId: string,
  excludeId?: string
): Promise<AvatarLikeness[]> {
  let query = likenessTable(supabase)
    .select("*")
    .eq("user_id", userId)
    .neq("status", "superseded");
  if (excludeId) {
    query = query.neq("id", excludeId);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as LikenessRow[]).map(mapAvatarLikeness);
}

/** True when a sample recording is referenced by a likeness that is still
 * training from it (AC7.2) - the Files tab uses this to refuse a delete that
 * would 404 the signed URL mid-training. */
export async function isSampleFileInUseByLikeness(
  supabase: SupabaseClient<Database>,
  userId: string,
  sampleFileId: string
): Promise<boolean> {
  const { data, error } = await likenessTable(supabase)
    .select("id")
    .eq("user_id", userId)
    .eq("sample_file_id", sampleFileId)
    .in("status", NON_TERMINAL_LIKENESS_STATUSES)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** The next-newest ready likeness for the owner, excluding one id - used to
 * promote a replacement default after the current default is deleted
 * (AC7.4). Null when none remain. */
export async function findNextReadyAvatarLikeness(
  supabase: SupabaseClient<Database>,
  userId: string,
  excludeId: string
): Promise<AvatarLikeness | null> {
  const { data, error } = await likenessTable(supabase)
    .select("*")
    .eq("user_id", userId)
    .eq("status", "ready")
    .neq("id", excludeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapAvatarLikeness(data as LikenessRow);
}

// ── avatar_likenesses writes ────────────────────────────────────────────────

export async function createAvatarLikeness(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { name: string; sampleFileId: string; acknowledgement: string; acknowledgedAt: string }
): Promise<AvatarLikeness> {
  const { data, error } = await likenessTable(supabase)
    .insert({
      user_id: userId,
      provider: "tavus",
      name: input.name,
      status: "pending",
      sample_file_id: input.sampleFileId,
      acknowledgement: input.acknowledgement,
      acknowledged_at: input.acknowledgedAt,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapAvatarLikeness(data as LikenessRow);
}

/** Generic status/detail update, scoped to id only (callers already resolve
 * ownership via getAvatarLikenessById before mutating). */
export async function updateAvatarLikeness(
  supabase: SupabaseClient<Database>,
  id: string,
  patch: {
    externalId?: string | null;
    status?: AvatarLikenessStatus;
    errorMessage?: string | null;
    /** DISPLAY ONLY - see AvatarLikeness.trainingProgress's own comment.
     * Never derive stall detection or a timeout from this field. */
    trainingProgress?: string | null;
  }
): Promise<AvatarLikeness> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.externalId !== undefined) update.external_id = patch.externalId;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.errorMessage !== undefined) update.error_message = patch.errorMessage;
  if (patch.trainingProgress !== undefined) update.training_progress = patch.trainingProgress;

  const { data, error } = await likenessTable(supabase).update(update).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return mapAvatarLikeness(data as LikenessRow);
}

export async function markAvatarLikenessSuperseded(supabase: SupabaseClient<Database>, id: string): Promise<void> {
  const { error } = await likenessTable(supabase)
    .update({ status: "superseded", is_default: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Mark `id` the owner's default likeness, clearing any previous default
 * first. Two sequential updates rather than one: the DB-level partial unique
 * index (avatar_likenesses_one_default, see the migration) is what actually
 * guarantees at most one default exists at rest - this ordering just avoids
 * tripping that constraint mid-swap. This app is attended-only and
 * owner-gated (a single actor), so the brief window between the two updates
 * is not a real race in practice.
 */
export async function setDefaultAvatarLikeness(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<void> {
  const { error: clearError } = await likenessTable(supabase)
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("is_default", true);
  if (clearError) throw new Error(clearError.message);

  const { error: setError } = await likenessTable(supabase)
    .update({ is_default: true, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (setError) throw new Error(setError.message);
}

export async function deleteAvatarLikenessRow(supabase: SupabaseClient<Database>, id: string): Promise<void> {
  const { error } = await likenessTable(supabase).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── avatar_videos ────────────────────────────────────────────────────────────

export async function createAvatarVideo(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: { likenessId: string; externalId: string; status: string; script: string }
): Promise<AvatarVideo> {
  const { data, error } = await videoTable(supabase)
    .insert({
      user_id: userId,
      likeness_id: input.likenessId,
      external_id: input.externalId,
      status: input.status,
      script: input.script,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapAvatarVideo(data as VideoRow);
}

/** One video job by id, scoped to its owner; null if missing or not owned. */
export async function getAvatarVideoById(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<AvatarVideo | null> {
  const { data, error } = await videoTable(supabase)
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapAvatarVideo(data as VideoRow);
}

export async function updateAvatarVideo(
  supabase: SupabaseClient<Database>,
  id: string,
  patch: { status?: string; errorMessage?: string | null; recordingFileId?: string | null }
): Promise<AvatarVideo> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.errorMessage !== undefined) update.error_message = patch.errorMessage;
  if (patch.recordingFileId !== undefined) update.recording_file_id = patch.recordingFileId;

  const { data, error } = await videoTable(supabase).update(update).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return mapAvatarVideo(data as VideoRow);
}
