import { createClient as createServerSupabaseClient } from "./server";

/**
 * Server-side Supabase Storage helpers.
 */

export async function uploadFile(
  bucket: string,
  path: string,
  file: File | Blob | ArrayBuffer,
  options?: { contentType?: string; upsert?: boolean }
) {
  const supabase = await createServerSupabaseClient();
  return supabase.storage.from(bucket).upload(path, file, {
    contentType: options?.contentType,
    upsert: options?.upsert ?? false,
  });
}

export async function downloadFile(bucket: string, path: string) {
  const supabase = await createServerSupabaseClient();
  return supabase.storage.from(bucket).download(path);
}

export async function getPublicUrl(bucket: string, path: string) {
  const supabase = await createServerSupabaseClient();
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export async function createSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds: number
) {
  const supabase = await createServerSupabaseClient();
  return supabase.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
}

export async function removeFiles(bucket: string, paths: string[]) {
  const supabase = await createServerSupabaseClient();
  return supabase.storage.from(bucket).remove(paths);
}
