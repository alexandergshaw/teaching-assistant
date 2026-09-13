import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerSupabaseClient } from "./server";
import type { Database } from "./types";

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

// ---------------------------------------------------------------------------
// Service-role variants, used by the orphan-upload sweep
// (src/lib/orphan-upload-sweep.ts). Every export above this line uses the
// anon+cookie client (createServerSupabaseClient) and is untouched by this
// addition. These two take an already-constructed client as an argument
// instead - the sweep's own createServiceClient() call - matching
// withUploadedSyllabusFile's client-as-argument shape
// (src/lib/syllabus-upload-source.ts).

/** The two fields this module reads off Supabase Storage's real list()
 * response objects, named to match the SDK's own field names exactly
 * (`FileObject.updated_at: string | null`,
 * node_modules/@supabase/storage-js/src/lib/types.ts:83) - snake_case,
 * nullable, NOT `updatedAt`. Declared as this repo's own narrow local shape
 * rather than importing `FileObject` from `@supabase/storage-js` directly:
 * that package is only a transitive dependency here (package.json lists
 * `@supabase/supabase-js` and `@supabase/ssr`, not `@supabase/storage-js`
 * itself), and `@supabase/supabase-js`'s own index does not re-export
 * `FileObject`. TypeScript accepts the SDK's actual (wider) response objects
 * against this narrower shape structurally, with no cast needed either way. */
interface RawStorageListEntry {
  name: string;
  updated_at: string | null;
}

/** One object entry as THIS module hands it to callers. `updatedAt` follows
 * the same rule the sweep enforces on it: a null updatedAt is never treated
 * as "old enough to delete." */
export interface StorageListEntry {
  name: string; // leaf name only, e.g. "abc123.docx" - NOT a full path
  updatedAt: string | null; // ISO timestamp, or null if Storage did not report one
}

export interface StorageListPage {
  data: StorageListEntry[] | null;
  error: { message: string } | null;
}

/** Map every field BY NAME, individually. NO object-spread (`{ ...entry }`)
 * and NO cast (`entry as StorageListEntry`) anywhere in listFilesAs: `tsc`
 * catches a bare typo against `RawStorageListEntry`'s field names, but it
 * does NOT catch a spread or a cast through `StorageListEntry` - either
 * would compile cleanly while making every `updatedAt` read `undefined` at
 * runtime, silently recreating (or inverting) the "everything looks
 * unknown-age" failure mode this mapping exists to prevent. This exact
 * mapping is what storage.test.ts exists to pin down. */
function mapStorageListEntry(entry: RawStorageListEntry): StorageListEntry {
  return { name: entry.name, updatedAt: entry.updated_at };
}

/** Lists ONE PAGE of one folder level of `bucket` at `path`, using a
 * caller-supplied (service-role, for the sweep) client - distinct from every
 * other export in this file, which uses the anon+cookie client.
 * `limit`/`offset` are REQUIRED, not optional-and-defaulted here, so every
 * call site states its own page size rather than silently inheriting the
 * underlying SDK's DEFAULT_SEARCH_OPTIONS (limit: 100, offset: 0). */
export async function listFilesAs(
  supabase: SupabaseClient<Database>,
  bucket: string,
  path: string,
  page: { limit: number; offset: number }
): Promise<StorageListPage> {
  const { data, error } = await supabase.storage.from(bucket).list(path, {
    limit: page.limit,
    offset: page.offset,
  });
  if (error) {
    return { data: null, error: { message: error.message } };
  }
  const entries: RawStorageListEntry[] = data ?? [];
  return { data: entries.map(mapStorageListEntry), error: null };
}

/** Removes objects using a caller-supplied (service-role, for the sweep)
 * client. Named distinctly from removeFiles (anon+cookie, unchanged - and
 * that export already returns the SDK's raw result, `data` included; this
 * function must not narrow that away). Forwards the SDK's own `data` field
 * verbatim, narrowed to `{ name }` - `data` is the list of objects ACTUALLY
 * removed (a filtered DELETE that matches nothing resolves
 * `{ data: [], error: null }`, not an error). Callers MUST reconcile `data`
 * against the paths they requested; `error: null` is NOT proof every
 * requested path was removed. */
export async function removeFilesAs(
  supabase: SupabaseClient<Database>,
  bucket: string,
  paths: string[]
): Promise<{ data: { name: string }[] | null; error: { message: string } | null }> {
  const { data, error } = await supabase.storage.from(bucket).remove(paths);
  if (error) {
    return { data: null, error: { message: error.message } };
  }
  const removed: { name: string }[] = data ?? [];
  return { data: removed.map((entry) => ({ name: entry.name })), error: null };
}
