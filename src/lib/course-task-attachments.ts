// Pure and injectable logic for "attach files as notes for each cell" of the
// Tasks grid (docs/task-cell-attachments-acceptance-criteria.md). See
// supabase/migrations/20261002000000_course_task_attachments.sql for the
// table this ultimately reads and writes, and
// src/lib/supabase/course-task-attachments.ts for the Supabase-backed
// persistence this module deliberately does NOT import.
//
// This module takes no dependency on "@supabase/supabase-js" and no
// dependency on any lib/supabase file, so it stays importable from a client
// component (the browser is what uploads the bytes - AC2 item 7) and from a
// node-env vitest test with no mocking required. The two functions that talk
// to Storage (uploadTaskAttachment, deleteTaskAttachment) take their storage
// client and their row-recorder as ARGUMENTS instead: that is what makes the
// upload/delete ORDERING and the rollback on a failed insert (AC2 item 12)
// provable by a fed-fakes test rather than merely readable in review - see
// course-task-attachments.test.ts and
// src/lib/institution-page-attachments.ts's createInstitutionPageAttachment /
// deleteInstitutionPageAndAttachments for the same shape applied to a
// different table.

/** One row of course_task_attachments, in camelCase - the shape every caller
 * in this feature works with. No userId field, matching
 * InstitutionPageAttachment: ownership is a query-time concern (every
 * persistence function is already scoped to one user_id), never a value a
 * caller needs to read back off an attachment it already knows it owns. */
export interface TaskAttachment {
  id: string;
  courseId: string;
  taskId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  storagePath: string;
  createdAt: string;
}

/**
 * Per-file size cap (AC2 item 11): 25 MB. Checked before any byte is
 * uploaded - a rejected file must cost no upload - by uploadTaskAttachment
 * below. Vercel Functions cap a server-action request body at 4.5 MB, which
 * is exactly why this feature never routes bytes through one (AC2 item 10);
 * uploading straight to Storage from the browser is what makes a cap this
 * large workable at all.
 */
export const MAX_TASK_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * Per-cell attachment count cap (AC2 item 11): 20 files. Deliberately NOT
 * enforced inside uploadTaskAttachment below - this pure function has no way
 * to know how many attachments a cell already has, only the caller that
 * loaded the grid's attachment index does, so the dialog component (a later
 * wave) enforces this cap itself before ever calling uploadTaskAttachment.
 */
export const MAX_ATTACHMENTS_PER_CELL = 20;

/** True once sizeBytes is strictly over the cap - a file exactly at the cap
 * is allowed, matching how MAX_ATTACHMENT_SIZE_BYTES is checked elsewhere in
 * this repo (exceedsAttachmentSizeCap in institution-page-attachments.ts). */
export function exceedsTaskAttachmentSize(sizeBytes: number): boolean {
  return sizeBytes > MAX_TASK_ATTACHMENT_BYTES;
}

/** AC5 item 29's exact wording - the message states the actual cap, so it
 * never reads as a bare "too large". */
export function taskAttachmentSizeCapMessage(): string {
  return "The selected file must be smaller than 25MB";
}

/** AC5 item 29's exact wording for the per-cell count cap. */
export function taskAttachmentCountCapMessage(): string {
  return "You can only attach up to 20 files to one task";
}

/** AC5 item 29: an empty file gets its OWN message rather than the size
 * message - "smaller than 25MB" would be a confusing thing to tell someone
 * who picked a genuinely empty file. */
export function emptyTaskAttachmentMessage(): string {
  return "The selected file is empty";
}

/** AC5 item 29: a failed upload names the file, because the dialog uploads
 * several files at once and an unnamed failure would not say which one. */
export function taskAttachmentUploadFailedMessage(fileName: string): string {
  return `Could not upload "${fileName}" - try again`;
}

/** The lowercased extension of a file name, without the dot: taken from the
 * LAST dot in a multi-dotted name (archive.tar.gz -> gz), stripped to
 * [a-z0-9] so it can never smuggle a path separator or anything else into a
 * Storage object name, capped at 12 characters against a pathological input,
 * and falling back to "bin" for a name with no real extension - including a
 * leading-dot dotfile like .gitignore, which is NOT an extension of
 * "gitignore" (AC2 item 9). */
export function taskAttachmentExtension(fileName: string): string {
  const trimmed = fileName.trim();
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === trimmed.length - 1) return "bin";

  const raw = trimmed.slice(lastDot + 1).toLowerCase();
  const cleaned = raw.replace(/[^a-z0-9]/g, "").slice(0, 12);
  return cleaned || "bin";
}

/**
 * The storage object path for one attachment: always
 * `${userId}/${courseId}/task-attachments/${attachmentId}.${ext}`, and
 * NEVER derived from anything else about the original file name than its
 * sanitised extension (AC2 items 8-9).
 *
 * The user id comes first because every "course-files" bucket policy checks
 * only `(storage.foldername(name))[1] = auth.uid()::text`
 * (20260722000000_course_materials.sql) - a path that does not start with
 * the user id is refused by RLS, not by this code, so getting this wrong is
 * a 403 in production rather than a visible bug.
 *
 * The object name is the attachment id, not the original file name, so two
 * files called "rubric.pdf" are two different objects and neither can ever
 * silently replace the other (AC2 item 13).
 */
export function taskAttachmentStoragePath(
  userId: string,
  courseId: string,
  attachmentId: string,
  fileName: string
): string {
  const ext = taskAttachmentExtension(fileName);
  return `${userId}/${courseId}/task-attachments/${attachmentId}.${ext}`;
}

/** The key indexTaskAttachments groups by, and taskAttachmentsAt reads by -
 * the same `${courseId}:${taskId}` shape this codebase's cellErrors map
 * already uses (AC4 item 20). */
export function taskAttachmentKey(courseId: string, taskId: string): string {
  return `${courseId}:${taskId}`;
}

/** A null-prototype map from taskAttachmentKey(courseId, taskId) to that
 * cell's attachments, oldest first. */
export type TaskAttachmentIndex = Record<string, TaskAttachment[]>;

/**
 * Groups a flat list of attachments (as loaded once per Tasks tab mount, in
 * the same Promise.all as courses/cells/defs/instructions - AC4 item 18)
 * into a null-prototype map keyed per cell, the same defensive posture
 * coerceTaskCellMap documents for its own returned object.
 *
 * Each cell's own list is ordered oldest first, tie-broken by id when two
 * rows share a createdAt, so the order is total: a newly added file always
 * appends to the end rather than jumping the list, and a re-render can never
 * reshuffle two files that were uploaded in the same instant.
 *
 * Never mutates or aliases the input array.
 */
export function indexTaskAttachments(attachments: TaskAttachment[]): TaskAttachmentIndex {
  const sorted = [...attachments].sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    if (a.id === b.id) return 0;
    return a.id < b.id ? -1 : 1;
  });

  const map: TaskAttachmentIndex = Object.create(null) as TaskAttachmentIndex;
  for (const attachment of sorted) {
    const key = taskAttachmentKey(attachment.courseId, attachment.taskId);
    const existing = map[key];
    if (existing) {
      existing.push(attachment);
    } else {
      map[key] = [attachment];
    }
  }
  return map;
}

/** One cell's attachments out of the index - never undefined, matching
 * taskCellAt's own "absence reads as empty" convention in course-tasks.ts. */
export function taskAttachmentsAt(map: TaskAttachmentIndex, courseId: string, taskId: string): TaskAttachment[] {
  return map[taskAttachmentKey(courseId, taskId)] ?? [];
}

/** The count as prose, for the cell popover's "Attachments" control (AC5
 * item 24) and the accessible-name sentence (AC3 item 16) - "No files"
 * rather than a bare zero, singular "1 file", plural "N files". */
export function taskAttachmentCountLabel(count: number): string {
  if (count <= 0) return "No files";
  if (count === 1) return "1 file";
  return `${count} files`;
}

// ---------------------------------------------------------------------------
// Upload / delete: object first, row second, with rollback on a failed
// insert (AC2 item 12). Both functions take their storage client and their
// row-recorder as arguments rather than importing a Supabase client of their
// own - see this file's header comment for why.

/** The minimal shape of a browser File this module needs: something that can
 * be handed straight to the injected storage client's upload(). A plain
 * `{ name }` object is accepted too, purely so this file's own test can feed
 * a fake without constructing a real Blob/File in a node environment - this
 * module never reads any property off the value itself. */
export type TaskAttachmentFileBody = Blob | { name: string };

/** The three storage calls this feature ever makes, abstracted to an
 * interface this module can be fed a fake of. Deliberately NOT
 * `SupabaseClient["storage"]["from"](...)`'s real return type - only the two
 * methods this feature actually calls are named, so a test fake needs no
 * more than what course-task-attachments.test.ts's fakeStorage already
 * provides. */
export interface TaskAttachmentStorageClient {
  upload(
    path: string,
    file: TaskAttachmentFileBody,
    options?: { contentType?: string | null; upsert?: boolean }
  ): Promise<{ error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ error: { message: string } | null }>;
}

/** Result of attempting to record (or delete) a metadata row - the shape
 * both the row-recorder and row-deleter callbacks resolve to, and the shape
 * uploadTaskAttachment/deleteTaskAttachment themselves resolve to on
 * failure. Named generically because the SAME shape serves both directions. */
export type TaskAttachmentRowResult = { ok: true } | { ok: false; error: string };

/** Records one attachment's metadata row - called AFTER the object has been
 * uploaded, never before (AC2 item 12). Receives the full TaskAttachment the
 * row should be written as, including the storage path
 * uploadTaskAttachment already built, so the recorder never has to
 * re-derive it. */
export type RecordTaskAttachmentRow = (attachment: TaskAttachment) => Promise<TaskAttachmentRowResult>;

/** Deletes one attachment's metadata row - called AFTER the object has been
 * removed from Storage, never before (AC2 item 12's reverse ordering). Takes
 * no arguments because the caller already has everything it needs (the
 * attachment's own id) in its own closure - see
 * src/app/actions/course-task-attachments.ts for how a real caller binds
 * that closure. */
export type DeleteTaskAttachmentRow = () => Promise<TaskAttachmentRowResult>;

export interface UploadTaskAttachmentParams {
  userId: string;
  courseId: string;
  taskId: string;
  /** Generated in the BROWSER before the upload (AC1 item 6), because the
   * storage path embeds it and the object is written before the row
   * exists. */
  attachmentId: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string | null;
  createdAt: string;
  file: TaskAttachmentFileBody;
}

export type UploadTaskAttachmentResult = { ok: true; attachment: TaskAttachment } | { ok: false; error: string };

/**
 * Upload one file to Storage and record its row - object first, row second,
 * and if the row insert fails, REMOVE the object that was just uploaded
 * (AC2 item 12), so a failure never leaves an invisible, billable orphan
 * behind. Mirrors createInstitutionPageAttachment
 * (institution-page-attachments.ts:323-375) for the same ordering applied to
 * a different table.
 *
 * The size cap (AC2 item 11) is checked BEFORE any I/O at all: an oversized
 * or empty file never reaches `storage.upload`, and never reaches
 * `recordRow` either - a file this function refused must never produce a
 * row.
 *
 * The count cap (MAX_ATTACHMENTS_PER_CELL) is deliberately NOT checked
 * here - see that constant's own doc comment.
 */
export async function uploadTaskAttachment(
  storage: TaskAttachmentStorageClient,
  recordRow: RecordTaskAttachmentRow,
  params: UploadTaskAttachmentParams
): Promise<UploadTaskAttachmentResult> {
  if (exceedsTaskAttachmentSize(params.sizeBytes)) {
    return { ok: false, error: taskAttachmentSizeCapMessage() };
  }
  if (params.sizeBytes <= 0) {
    return { ok: false, error: emptyTaskAttachmentMessage() };
  }

  const storagePath = taskAttachmentStoragePath(params.userId, params.courseId, params.attachmentId, params.fileName);

  const { error: uploadError } = await storage.upload(storagePath, params.file, {
    contentType: params.mimeType ?? undefined,
    upsert: false,
  });
  if (uploadError) {
    return { ok: false, error: taskAttachmentUploadFailedMessage(params.fileName) };
  }

  const attachment: TaskAttachment = {
    id: params.attachmentId,
    courseId: params.courseId,
    taskId: params.taskId,
    fileName: params.fileName,
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
    storagePath,
    createdAt: params.createdAt,
  };

  const recorded = await recordRow(attachment);
  if (!recorded.ok) {
    // Best effort: the recording failure is reported either way (AC2 item
    // 12) - a rollback that itself fails must never mask the real error.
    await storage.remove([storagePath]).catch(() => {});
    return recorded;
  }

  return { ok: true, attachment };
}

/**
 * Delete one attachment: remove the Storage object FIRST, then the row - the
 * reverse of upload's ordering, so a failure leaves a visible row rather
 * than an invisible orphan (AC2 item 12). If the object cannot be removed,
 * the row is left alone and this returns a failure - deleteRow is never
 * called.
 */
export async function deleteTaskAttachment(
  storage: TaskAttachmentStorageClient,
  deleteRow: DeleteTaskAttachmentRow,
  attachment: TaskAttachment
): Promise<TaskAttachmentRowResult> {
  const { error: removeError } = await storage.remove([attachment.storagePath]);
  if (removeError) {
    return { ok: false, error: removeError.message };
  }

  return deleteRow();
}
