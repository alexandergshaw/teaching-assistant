// Client-side storage for per-course material zips; browser talks to Supabase
// Storage directly for direct uploads/downloads.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";

export async function uploadCourseZip(
  supabase: SupabaseClient<Database>,
  userId: string,
  courseId: string,
  blob: Blob,
  previousPath?: string | null
): Promise<{ path: string }> {
  // Best-effort remove of previous file if it exists
  if (previousPath) {
    await supabase.storage
      .from("course-files")
      .remove([previousPath])
      .catch(() => {});
  }

  const path = `${userId}/${courseId}/${crypto.randomUUID()}.zip`;

  const { error: uploadError } = await supabase.storage
    .from("course-files")
    .upload(path, blob, { contentType: "application/zip", upsert: false });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  return { path };
}

export async function getCourseZipUrl(
  supabase: SupabaseClient<Database>,
  path: string
): Promise<string> {
  const { data, error } = await supabase.storage
    .from("course-files")
    .createSignedUrl(path, 3600);

  if (error) {
    throw new Error(error.message);
  }

  return data.signedUrl;
}

export async function removeCourseZip(
  supabase: SupabaseClient<Database>,
  path: string
): Promise<void> {
  // Best-effort removal; ignore errors
  await supabase.storage
    .from("course-files")
    .remove([path])
    .catch(() => {});
}
