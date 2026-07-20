// Persistence for the owner's voice clone settings and writing style sample.
// Voice ID and sample path are managed by saveUserStyle and clearVoiceClone.
// Writing sample is managed by saveUserStyle and clearWritingSample.
// Writes use the Supabase service-role client from trusted server code behind
// requireOwner(); reads are additionally protected by RLS.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

type UserStyleTable = Database["public"]["Tables"]["user_style"];

export interface UserStyle {
  voiceId: string | null;
  voiceSamplePath: string | null;
  voiceSampleName: string | null;
  writingSample: string | null;
}

/**
 * Fetch the user's voice and writing style settings.
 * Returns null if no row exists yet.
 */
export async function getUserStyle(supabase: SupabaseClient, userId: string): Promise<UserStyle | null> {
  const { data, error } = await supabase
    .from("user_style")
    .select("voice_id, voice_sample_path, voice_sample_name, writing_sample")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[user-style] Could not read user style:", error.message);
    return null;
  }

  if (!data) return null;

  const row = data as UserStyleTable["Row"];
  return {
    voiceId: row.voice_id,
    voiceSamplePath: row.voice_sample_path,
    voiceSampleName: row.voice_sample_name,
    writingSample: row.writing_sample,
  };
}

/**
 * Upsert user style settings with merge semantics:
 * only provided fields in the partial object are updated.
 * Fields not in the partial remain unchanged.
 */
export async function saveUserStyle(
  supabase: SupabaseClient,
  userId: string,
  partial: Partial<Omit<UserStyle, "voiceSamplePath">> & { voiceSamplePath?: string | null }
): Promise<void> {
  const row: UserStyleTable["Insert"] = {
    user_id: userId,
    updated_at: new Date().toISOString(),
  };

  // Only add fields that are provided in the partial
  if (partial.voiceId !== undefined) {
    row.voice_id = partial.voiceId;
  }
  if (partial.voiceSamplePath !== undefined) {
    row.voice_sample_path = partial.voiceSamplePath;
  }
  if (partial.voiceSampleName !== undefined) {
    row.voice_sample_name = partial.voiceSampleName;
  }
  if (partial.writingSample !== undefined) {
    row.writing_sample = partial.writingSample;
  }

  const { error } = await supabase.from("user_style").upsert(row, { onConflict: "user_id" });

  if (error) {
    throw new Error(`Could not save user style: ${error.message}`);
  }
}

/**
 * Clear the voice clone settings (voice_id, voice_sample_path, voice_sample_name).
 */
export async function clearVoiceClone(supabase: SupabaseClient, userId: string): Promise<void> {
  await saveUserStyle(supabase, userId, {
    voiceId: null,
    voiceSamplePath: null,
    voiceSampleName: null,
  });
}

/**
 * Clear the writing sample.
 */
export async function clearWritingSample(supabase: SupabaseClient, userId: string): Promise<void> {
  await saveUserStyle(supabase, userId, {
    writingSample: null,
  });
}
