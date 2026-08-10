// Contract for the temporary-object lifecycle the syllabus upload gains now
// that it uploads straight to Supabase Storage instead of sending base64
// through a server action (docs/upload-body-limit-acceptance-criteria.md
// AC2). The syllabus upload PARSES the uploaded file and throws the bytes
// away - nothing else in the app ever reads the original again - so once the
// browser writes a real object to a real bucket first, "parsed and
// discarded" requires someone to actually delete it, on every path: the
// happy path, a parse failure, and a download failure. Missing any one of
// those leaves an invisible, billable object in a bucket nothing else
// enumerates.
//
// withUploadedSyllabusFile takes its storage client AS AN ARGUMENT (rather
// than importing a Supabase client of its own) so this lifecycle is provable
// with fakes in a node-env test (see syllabus-upload-source.test.ts) instead
// of merely readable in review - the same shape uploadTaskAttachment
// (src/lib/course-task-attachments.ts) uses for the same class of problem.
// This module takes no dependency on "@supabase/supabase-js" or any
// lib/supabase file, so it stays importable from a server action (fed the
// real Storage client), a client component, and a plain node-env vitest
// test with no mocking required.

/**
 * The two Storage calls this lifecycle makes, generic over the "bytes" shape
 * `download` resolves to - a real Supabase client resolves it to a `Blob`,
 * while this file's own test feeds a fake that resolves it to a
 * `Uint8Array`. Either way this module never inspects the value itself, only
 * forwards it to the caller's `consume` callback untouched.
 */
export interface SyllabusUploadStorageClient<T> {
  download(path: string): Promise<{ data: T | null; error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ error: { message: string } | null }>;
}

/** Result of the whole download-use-cleanup lifecycle below. */
export type SyllabusUploadResult<V> = { ok: true; value: V } | { ok: false; error: string };

/**
 * Whether `storagePath` looks like a path THIS feature could have written -
 * `${userId}/syllabus-uploads/...` (see syllabusUploadStoragePath below).
 * `storagePath` arrives here as browser-supplied metadata (the object was
 * already uploaded client-side before the action ever runs), and
 * withUploadedSyllabusFile both DOWNLOADS and DELETES whatever path it is
 * handed against the service-role client the server action uses - so an
 * unvalidated path would let a malformed or hostile call point this
 * download-and-delete lifecycle at any other object in the "course-files"
 * bucket under the same user prefix, e.g. a course's materials zip
 * (`${userId}/${courseId}/...`, src/lib/course-files.ts) or a Tasks-cell
 * attachment (`${userId}/${courseId}/task-attachments/...`,
 * src/lib/course-task-attachments.ts). Checked here, inside the one function
 * both uploadSyllabusAction and extractSyllabusTextAction call, rather than
 * in each caller separately, so a future caller of this lifecycle inherits
 * the guard automatically instead of having to remember to add it - the same
 * reasoning that puts the delete-on-blank rule inside upsertTaskInstruction
 * (src/lib/supabase/task-institution-instructions.ts) rather than in its
 * callers.
 */
export function isSyllabusUploadPath(userId: string, storagePath: string): boolean {
  const prefix = `${userId}/syllabus-uploads/`;
  return storagePath.startsWith(prefix) && storagePath.length > prefix.length;
}

/**
 * Downloads the object at `storagePath`, hands its bytes to `consume`, and
 * ALWAYS removes the object afterwards - on the happy path, when `consume`
 * throws, and even when the download itself fails. A failed download does
 * not prove the object is absent - it may be a transient error against an
 * object that really is there - so leaving it would orphan it exactly as
 * surely as skipping cleanup after a parse failure; `consume` is never called in
 * that case.
 *
 * A failed removal is swallowed rather than surfaced: the object is a
 * temporary, so failing to delete it is a storage-hygiene problem, never a
 * reason to tell the caller their upload failed after `consume` already
 * succeeded.
 *
 * `storagePath` is validated against `userId` BEFORE any Storage call at
 * all (see isSyllabusUploadPath above) - a mismatched path is refused
 * outright, with no download and no remove, rather than trusted just
 * because a caller supplied it.
 */
export async function withUploadedSyllabusFile<T, V>(
  storage: SyllabusUploadStorageClient<T>,
  userId: string,
  storagePath: string,
  consume: (bytes: T) => Promise<V>
): Promise<SyllabusUploadResult<V>> {
  if (!isSyllabusUploadPath(userId, storagePath)) {
    return { ok: false, error: "That upload could not be found. Please try uploading the file again." };
  }

  const { data, error } = await storage.download(storagePath);

  if (error || data === null) {
    await storage.remove([storagePath]).catch(() => {});
    const message = error?.message?.trim();
    return { ok: false, error: message || "Could not download the uploaded syllabus file." };
  }

  try {
    const value = await consume(data);
    return { ok: true, value };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not process the uploaded syllabus file.",
    };
  } finally {
    await storage.remove([storagePath]).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Storage location: shared by SyllabusUploadControl.tsx (the course-syllabus
// form's browser upload) and steps.course-schedule-from-source.ts's
// "syllabus-document" schedule source (the same temporary-upload lifecycle,
// reached from a workflow step instead of the course-syllabus form).

/** The existing private bucket every course-file upload already uses
 * (src/lib/course-files.ts, src/lib/course-task-attachments.ts) - no new
 * bucket, no storage migration. */
export const SYLLABUS_UPLOAD_BUCKET = "course-files";

/**
 * The storage object path for one temporary syllabus upload:
 * `${userId}/syllabus-uploads/${uploadId}${extension}`.
 *
 * The user id comes first because the "course-files" bucket's RLS policies
 * (supabase/migrations/20260722000000_course_materials.sql) all check only
 * `(storage.foldername(name))[1] = auth.uid()::text` - a path that does not
 * start with the user id is refused by RLS, not by this code.
 *
 * "syllabus-uploads" is this feature's own path segment, so these temporary
 * objects are never confused with a course's materials zip (stored directly
 * under `${userId}/${courseId}/`, src/lib/course-files.ts's uploadCourseFile)
 * or a Tasks-cell attachment (`${userId}/${courseId}/task-attachments/`,
 * src/lib/course-task-attachments.ts's taskAttachmentStoragePath). No
 * `courseId` segment, unlike those two: a syllabus upload is not always
 * reached with a course already selected (the course-schedule-from-source
 * workflow step's "syllabus document" source has no course-tile requirement
 * of its own), and the object never outlives the request that parses it
 * anyway - see withUploadedSyllabusFile above.
 */
export function syllabusUploadStoragePath(userId: string, uploadId: string, extension: string): string {
  const ext = extension.startsWith(".") ? extension : `.${extension}`;
  return `${userId}/syllabus-uploads/${uploadId}${ext}`;
}
