// Attachments for institution_pages: any file type, uploaded to a page in the
// per-institution knowledge base. See
// supabase/migrations/20260915000000_institution_page_attachments.sql for the
// table this reads and writes (and its header comment for why attachments are
// a child table rather than a jsonb column on institution_pages), and
// src/lib/recording-files.ts for the list/get/delete shape this mirrors:
// insert a row recording storage_path, delete the storage object BEFORE the
// row, and best-effort-clean the object if the row insert fails so a failed
// upload leaves no orphan blob.
//
// Upload is a direct-to-Storage transport, not a server action: the browser
// uploads the object with its own authenticated Supabase client, then calls
// uploadInstitutionPageAttachmentAction with metadata only (see
// AttachmentsPanel.tsx). uploadInstitutionPageAttachment below is the
// upload/rollback orchestration that used to live entirely server-side in a
// function of the same shape - it now runs in the BROWSER (given the real
// storage client and a recordRow callback that calls the action), because
// once the object write itself happens client-side, the browser is the only
// party that ever observes both the Storage outcome and the row-insert
// outcome. insertInstitutionPageAttachmentRow is the DB-only half the action
// calls, mirroring createTaskAttachmentRow
// (src/lib/supabase/course-task-attachments.ts). See MAX_ATTACHMENT_SIZE_BYTES
// below for why 25 MB is workable over this transport at all.
//
// Data layer only (wave 1 of 2 of the attach/embed feature) for
// list/get/delete; upload converted to direct-to-Storage in a later pass
// (docs/upload-body-limit-acceptance-criteria.md AC1).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { listInstitutionPages, deleteInstitutionPage, collectSubtreePageIds, type InstitutionPage } from "./knowledge-base";

export interface InstitutionPageAttachment {
  id: string;
  pageId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  createdAt: string;
}

export const INSTITUTION_ATTACHMENTS_BUCKET = "institution-attachments";

/**
 * Per-file size cap. Matches MAX_TASK_ATTACHMENT_BYTES in
 * src/lib/course-task-attachments.ts - see that constant's own doc comment
 * for the Vercel Functions request-body PLATFORM limit this cap would
 * otherwise collide with, and for why 25 MB is workable at all despite it.
 * That comment is the citation; this one does not re-derive it a third time.
 * Uploads never go through a server action at all - the browser uploads
 * straight to the "institution-attachments" Storage bucket with its own
 * authenticated client (uploadInstitutionPageAttachment below, called from
 * AttachmentsPanel.tsx), which is what makes a cap this size workable. The
 * bucket's own `file_size_limit` is raised to the same byte value at the
 * Storage layer (see the migration) as the second, independent gate this
 * file's checks were always paired with - now the more important one, since
 * a server action never sees these bytes to check them itself.
 */
export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * Per-page attachment count cap. A knowledge-base page is one policy/topic;
 * a page needing more exhibits than this should be split via the existing
 * page tree (parent_id nesting - see buildPageTree) instead of becoming a
 * flat file dump. This also bounds the size of the single batched
 * storage.remove() call issued when a page (or its whole subtree - see
 * collectSubtreePageIds) is deleted, so that cleanup stays one manageable
 * request even for a large subtree rather than growing unbounded.
 */
export const MAX_ATTACHMENTS_PER_PAGE = 30;

/** Human-readable byte size for cap-refusal messages ("6 MB", "512 KB"). */
export function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb >= 10 ? Math.round(kb) : Math.round(kb * 10) / 10} KB`;
  const mb = kb / 1024;
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

export function exceedsAttachmentSizeCap(sizeBytes: number): boolean {
  return sizeBytes > MAX_ATTACHMENT_SIZE_BYTES;
}

/** Refusal message naming the limit - a file over the cap must be refused
 * with an explicit reason, never silently truncated or dropped. */
export function attachmentSizeCapMessage(fileName: string, sizeBytes: number): string {
  return `"${fileName}" is ${formatByteSize(sizeBytes)}, over the ${formatByteSize(MAX_ATTACHMENT_SIZE_BYTES)} per-file limit.`;
}

export function attachmentCountCapMessage(): string {
  return `This page already has ${MAX_ATTACHMENTS_PER_PAGE} attachments, the maximum allowed per page.`;
}

/** An empty file gets its own message rather than the size-cap message -
 * "over the 25 MB limit" would be a confusing thing to tell someone who
 * picked a genuinely empty file. Mirrors emptyTaskAttachmentMessage
 * (src/lib/course-task-attachments.ts). */
export function emptyAttachmentMessage(): string {
  return "The selected file is empty.";
}

/** Coarse kind classification for a later UI to render images inline versus
 * link everything else. Pure and exported so the boundary is unit-testable
 * without touching a real file. */
export type AttachmentKind = "image" | "file";

export function classifyAttachmentKind(mimeType: string): AttachmentKind {
  return mimeType.trim().toLowerCase().startsWith("image/") ? "image" : "file";
}

/** The lowercased extension of a file name, without the dot; "" when there
 * is none (no dot, a leading-dot dotfile, or a trailing dot). */
export function attachmentFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === fileName.length - 1) return "";
  return fileName.slice(lastDot + 1).toLowerCase();
}

/** Which renderer the preview window (AttachmentPreviewModal.tsx) should use
 * for an attachment. See attachmentPreviewMode below for how this is
 * decided. */
export type AttachmentPreviewMode = "image" | "pdf" | "text" | "unsupported";

/** A mime type this codebase treats as carrying no real signal: either
 * genuinely absent, or the browser's generic fallback for "I don't
 * recognise this file" (see AttachmentsPanel's `file.type ||
 * "application/octet-stream"` on upload - this is not a hypothetical, it is
 * the literal value a lot of real uploads will carry). Only these two values
 * trigger the extension fallback in attachmentPreviewMode; every other mime
 * type is trusted outright, even when it resolves to "unsupported" - a
 * renamed-but-still-specific mime type (e.g. a .docx's real OOXML mime) is a
 * stronger signal than the file name and must never be second-guessed by the
 * extension. */
const GENERIC_PREVIEW_MIME_TYPES = new Set(["", "application/octet-stream"]);

/** Explicit non-`text/*` mime types that are still plain text under the
 * hood. Kept deliberately short (just the one case the feature actually
 * needs) rather than guessing at every text-adjacent `application/*` mime
 * (xml, javascript, ...) that nothing here has a concrete need for yet -
 * easy to extend later against a real request instead of a guess. */
const TEXT_LIKE_MIME_TYPES = new Set(["application/json"]);

/** File extensions previewable as an image when the mime type is generic.
 * Mirrors the raster/vector formats browsers render natively in an <img>. */
const IMAGE_PREVIEW_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"]);

/** File extensions previewable as text when the mime type is generic - plain
 * prose/data formats plus the source-code extensions an instructor is
 * plausibly attaching (a script, a config file) rather than every extension
 * that happens to be ASCII. */
const TEXT_PREVIEW_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "json",
  "log",
  "yaml",
  "yml",
  "xml",
  "html",
  "htm",
  "css",
  "ini",
  "py",
  "js",
  "jsx",
  "ts",
  "tsx",
  "java",
  "c",
  "cpp",
  "h",
  "sql",
  "sh",
]);

function previewModeFromMime(mime: string): AttachmentPreviewMode {
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("text/") || TEXT_LIKE_MIME_TYPES.has(mime)) return "text";
  return "unsupported";
}

function previewModeFromExtension(extension: string): AttachmentPreviewMode {
  if (IMAGE_PREVIEW_EXTENSIONS.has(extension)) return "image";
  if (extension === "pdf") return "pdf";
  if (TEXT_PREVIEW_EXTENSIONS.has(extension)) return "text";
  return "unsupported";
}

/**
 * Which renderer the preview window should use for an attachment - "image"
 * (plain <img>), "pdf" (iframe), "text" (capped <pre>), or "unsupported"
 * (an honest "can't preview this, here's Download" message rather than a
 * broken render).
 *
 * Precedence: a mime type is trusted over the file name whenever it carries
 * real information, because it comes from the browser/OS sniffing the
 * actual bytes rather than from a user-controlled string - a file renamed
 * "report.pdf" that is really a PNG must preview as the PNG it is, not the
 * PDF its name claims. The file name's extension is consulted ONLY when the
 * mime type is itself uninformative (empty, or the generic
 * application/octet-stream browsers hand out for anything they don't
 * recognise - see GENERIC_PREVIEW_MIME_TYPES above). In that fallback case
 * the extension is the only signal left, so it decides alone.
 *
 * A mime type's `; charset=...`-style parameters are stripped before
 * comparison (matching how the browser itself and `<meta>` tags treat mime
 * types) and both the mime type and extension are compared
 * case-insensitively.
 */
export function attachmentPreviewMode(mimeType: string, fileName: string): AttachmentPreviewMode {
  const normalizedMime = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";

  if (!GENERIC_PREVIEW_MIME_TYPES.has(normalizedMime)) {
    return previewModeFromMime(normalizedMime);
  }

  return previewModeFromExtension(attachmentFileExtension(fileName));
}

/**
 * Storage object path for an attachment: `${userId}/${pageId}/${attachmentId}`,
 * plus the original extension when the file name has one. The leading
 * `userId` segment matches the migration's storage.objects RLS policies
 * (`(storage.foldername(name))[1] = auth.uid()::text`, the same pattern
 * recording_files' bucket policies use), and grouping by `pageId` under that
 * keeps a page's objects adjacent for anyone browsing the bucket directly -
 * this codebase does not otherwise need to list-by-prefix, since every
 * lookup goes through the storage_path recorded on a row.
 */
export function buildAttachmentStoragePath(
  userId: string,
  pageId: string,
  attachmentId: string,
  fileName: string
): string {
  const ext = attachmentFileExtension(fileName);
  return ext ? `${userId}/${pageId}/${attachmentId}.${ext}` : `${userId}/${pageId}/${attachmentId}`;
}

/**
 * Whether `storagePath` looks like a path buildAttachmentStoragePath could
 * have produced for this (userId, pageId) pair: `${userId}/${pageId}/...`.
 * `storagePath` reaches insertInstitutionPageAttachmentRow as browser-
 * supplied metadata (the browser already wrote the object before this row is
 * recorded - see uploadInstitutionPageAttachmentAction), and once recorded it
 * is read back by getInstitutionPageAttachmentUrlAction and
 * deleteInstitutionPageAttachmentAction, both against createServiceClient()
 * (src/lib/supabase/server.ts), which bypasses RLS entirely - so an
 * unvalidated path recorded here would let a later signed-URL or delete call
 * reach any object in the "institution-attachments" bucket, not just this
 * page's own. Checked inside insertInstitutionPageAttachmentRow itself,
 * rather than in uploadInstitutionPageAttachmentAction (its only caller),
 * because that is the one place no bad path can ever be written to a row in
 * the first place - the two read-back actions never see a client-supplied
 * path at all, only whatever was validated on the way in. Mirrors putting
 * the delete-on-blank rule inside upsertTaskInstruction
 * (src/lib/supabase/task-institution-instructions.ts) rather than its
 * callers.
 */
export function isInstitutionAttachmentStoragePath(userId: string, pageId: string, storagePath: string): boolean {
  const prefix = `${userId}/${pageId}/`;
  return storagePath.startsWith(prefix) && storagePath.length > prefix.length;
}

// Exported so the row -> attachment mapping is unit-testable without a live
// Supabase client (mirrors mapInstitutionPage / mapRecordingFile).
export function mapInstitutionPageAttachment(
  row: Database["public"]["Tables"]["institution_page_attachments"]["Row"]
): InstitutionPageAttachment {
  return {
    id: row.id,
    pageId: row.page_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    storagePath: row.storage_path,
    createdAt: row.created_at,
  };
}

/** Every attachment on one page, owner-scoped, oldest first - attachments
 * read like a page's supporting exhibits, so the order they were added is
 * the order they should be reviewed (unlike a media library, where newest
 * is usually most relevant). */
export async function listInstitutionPageAttachments(
  supabase: SupabaseClient<Database>,
  userId: string,
  pageId: string
): Promise<InstitutionPageAttachment[]> {
  const { data: rows, error } = await supabase
    .from("institution_page_attachments")
    .select("*")
    .eq("user_id", userId)
    .eq("page_id", pageId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (rows || []).map(mapInstitutionPageAttachment);
}

/**
 * Every attachment across a set of pages (e.g. a page and its whole
 * subtree), owner-scoped - powers the AC3 cascade storage cleanup in
 * deleteInstitutionPageAndAttachments below. An empty `pageIds` short-circuits
 * to [] without a query, mirroring listRecordingFilesForRuns's same guard: an
 * empty `.in()` filter is either a PostgREST error or a vacuous no-match
 * depending on client version - never worth relying on.
 */
export async function listInstitutionPageAttachmentsForPages(
  supabase: SupabaseClient<Database>,
  userId: string,
  pageIds: string[]
): Promise<InstitutionPageAttachment[]> {
  if (pageIds.length === 0) return [];

  const { data: rows, error } = await supabase
    .from("institution_page_attachments")
    .select("*")
    .eq("user_id", userId)
    .in("page_id", pageIds)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (rows || []).map(mapInstitutionPageAttachment);
}

/** Fetch one attachment by id, scoped to its owner; null if missing or not
 * owned - a missing/foreign id must look identical to the caller, never leak
 * whether the id belongs to someone else (mirrors getInstitutionPage /
 * getRecordingFileById). */
export async function getInstitutionPageAttachment(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string
): Promise<InstitutionPageAttachment | null> {
  const { data: row, error } = await supabase
    .from("institution_page_attachments")
    .select("*")
    .eq("user_id", userId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) return null;
  return mapInstitutionPageAttachment(row);
}

export interface InsertInstitutionPageAttachmentRowInput {
  /** Generated in the BROWSER before the upload (the storage path embeds it
   * and the object is written before this row exists) - this is an insert
   * of a row whose id is already fixed, never a fresh `gen_random_uuid()`
   * default. Mirrors CreateTaskAttachmentRowInput.id. */
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
}

/**
 * Record one attachment's metadata row - called by
 * uploadInstitutionPageAttachmentAction AFTER the browser has already
 * uploaded the object to Storage. Enforces the per-page count cap
 * (MAX_ATTACHMENTS_PER_PAGE) via a `head: true` count query before
 * inserting, refusing with a message naming the exact limit - never a
 * silent truncation or drop. Does NOT re-check the size cap: that is
 * enforced once, in the browser, before any byte is uploaded (see
 * uploadInstitutionPageAttachment below), and this function never sees the
 * bytes to check independently - the bucket's own `file_size_limit` (see
 * the migration) is the authoritative backstop against a caller that lies
 * about `sizeBytes`. Mirrors createTaskAttachmentRow
 * (src/lib/supabase/course-task-attachments.ts): no Storage I/O of its own.
 *
 * `input.storagePath` is validated against `userId`/`pageId` BEFORE any
 * database call at all (see isInstitutionAttachmentStoragePath above) - a
 * mismatched path is refused outright, with no count query and no insert,
 * rather than trusted just because a caller supplied it. This is the only
 * place that check needs to live: both getInstitutionPageAttachmentUrlAction
 * and deleteInstitutionPageAttachmentAction only ever read a storage_path
 * back off an already-recorded row, so a path refused here can never reach
 * either of those service-role-backed calls.
 */
export async function insertInstitutionPageAttachmentRow(
  supabase: SupabaseClient<Database>,
  userId: string,
  pageId: string,
  input: InsertInstitutionPageAttachmentRowInput
): Promise<InstitutionPageAttachment> {
  if (!isInstitutionAttachmentStoragePath(userId, pageId, input.storagePath)) {
    throw new Error("That attachment's storage path is invalid.");
  }

  const { count, error: countError } = await supabase
    .from("institution_page_attachments")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("page_id", pageId);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) >= MAX_ATTACHMENTS_PER_PAGE) {
    throw new Error(attachmentCountCapMessage());
  }

  const { data: row, error: insertError } = await supabase
    .from("institution_page_attachments")
    .insert({
      id: input.id,
      page_id: pageId,
      user_id: userId,
      file_name: input.fileName,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      storage_path: input.storagePath,
    })
    .select()
    .single();

  if (insertError) throw new Error(insertError.message);
  return mapInstitutionPageAttachment(row);
}

// ---------------------------------------------------------------------------
// Browser-side upload orchestration. Mirrors uploadTaskAttachment
// (src/lib/course-task-attachments.ts) exactly: this module takes no
// dependency on a live SupabaseClient for the upload path (the two functions
// above still do, for the server-side list/get/insert/delete calls) so this
// stays importable from AttachmentsPanel.tsx ("use client") and callable
// there directly, with its storage client and its row-recorder supplied as
// arguments - that is what makes the upload/delete ORDERING and the
// rollback on a failed insert provable by a fed-fakes test rather than
// merely readable in review.
// ---------------------------------------------------------------------------

/** The minimal shape of a browser File this module needs: something that can
 * be handed straight to the injected storage client's upload(). A plain
 * `{ name }` object is accepted too, purely so this file's own test can feed
 * a fake without constructing a real Blob/File in a node environment - this
 * module never reads any property off the value itself. Mirrors
 * TaskAttachmentFileBody. */
export type AttachmentFileBody = Blob | { name: string };

/** The two storage calls this feature ever makes for upload, abstracted to
 * an interface this module can be fed a fake of. Mirrors
 * TaskAttachmentStorageClient - only the methods this feature actually
 * calls are named. */
export interface AttachmentStorageClient {
  upload(
    path: string,
    file: AttachmentFileBody,
    options?: { contentType?: string | null; upsert?: boolean }
  ): Promise<{ error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ error: { message: string } | null }>;
}

export type RecordInstitutionPageAttachmentRowResult =
  | { ok: true; attachment: InstitutionPageAttachment }
  | { ok: false; error: string };

/** Records one attachment's metadata row - called AFTER the object has been
 * uploaded, never before. Mirrors RecordTaskAttachmentRow; a real caller
 * (AttachmentsPanel.tsx) wraps uploadInstitutionPageAttachmentAction to
 * match this shape. */
export type RecordInstitutionPageAttachmentRow = (
  input: InsertInstitutionPageAttachmentRowInput
) => Promise<RecordInstitutionPageAttachmentRowResult>;

export interface UploadInstitutionPageAttachmentParams {
  userId: string;
  pageId: string;
  /** Generated in the BROWSER before the upload, because the storage path
   * embeds it and the object is written before the row exists. */
  attachmentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  file: AttachmentFileBody;
}

export type UploadInstitutionPageAttachmentResult =
  | { ok: true; attachment: InstitutionPageAttachment }
  | { ok: false; error: string };

/**
 * Upload one file to Storage and record its row - object first, row second,
 * and if the row insert fails, REMOVE the object that was just uploaded, so
 * a failed upload never leaves an invisible, billable orphan behind. This is
 * the exact ordering/rollback the old, fully-server-side
 * createInstitutionPageAttachment used to perform in one function; it moved
 * here, split across a Storage write the caller supplies and a row write the
 * caller's recordRow performs, rather than being reinvented. It now runs in
 * the BROWSER (AttachmentsPanel.tsx passes the real
 * supabase.storage.from(INSTITUTION_ATTACHMENTS_BUCKET) client and a
 * recordRow that calls uploadInstitutionPageAttachmentAction), because the
 * browser is the one party that observes BOTH outcomes: once the object
 * write itself happens client-side, no server action ever sees the upload,
 * so nothing server-side could roll it back on a later row-insert failure.
 * Mirrors uploadTaskAttachment (src/lib/course-task-attachments.ts) applied
 * to this table.
 *
 * The size cap is checked BEFORE any I/O at all: an oversized OR EMPTY file
 * never reaches `storage.upload`, and never reaches `recordRow` either
 * (mirrors uploadTaskAttachment's `sizeBytes <= 0` floor,
 * src/lib/course-task-attachments.ts). The per-page count cap is
 * deliberately NOT checked here - this function has no way to know how many
 * attachments a page already has, only insertInstitutionPageAttachmentRow
 * (reached via recordRow) has database access to answer that, and its
 * refusal is treated exactly like any other recordRow failure: the
 * just-uploaded object is rolled back.
 */
export async function uploadInstitutionPageAttachment(
  storage: AttachmentStorageClient,
  recordRow: RecordInstitutionPageAttachmentRow,
  params: UploadInstitutionPageAttachmentParams
): Promise<UploadInstitutionPageAttachmentResult> {
  if (exceedsAttachmentSizeCap(params.sizeBytes)) {
    return { ok: false, error: attachmentSizeCapMessage(params.fileName, params.sizeBytes) };
  }
  if (params.sizeBytes <= 0) {
    return { ok: false, error: emptyAttachmentMessage() };
  }

  const storagePath = buildAttachmentStoragePath(params.userId, params.pageId, params.attachmentId, params.fileName);

  const { error: uploadError } = await storage.upload(storagePath, params.file, {
    contentType: params.mimeType,
    upsert: false,
  });
  if (uploadError) {
    return { ok: false, error: uploadError.message };
  }

  const recorded = await recordRow({
    id: params.attachmentId,
    fileName: params.fileName,
    mimeType: params.mimeType,
    sizeBytes: params.sizeBytes,
    storagePath,
  });
  if (!recorded.ok) {
    // Best effort: the recording failure is reported either way - a
    // rollback that itself fails must never mask the real error.
    await storage.remove([storagePath]).catch(() => {});
    return recorded;
  }

  return { ok: true, attachment: recorded.attachment };
}

/**
 * Delete a single attachment: storage object first (best-effort - a
 * missing object is not an error, mirrors deleteRecordingFile), then the
 * row.
 */
export async function deleteInstitutionPageAttachment(
  supabase: SupabaseClient<Database>,
  userId: string,
  attachment: InstitutionPageAttachment
): Promise<void> {
  await supabase.storage
    .from(INSTITUTION_ATTACHMENTS_BUCKET)
    .remove([attachment.storagePath])
    .catch(() => {});

  const { error } = await supabase
    .from("institution_page_attachments")
    .delete()
    .eq("user_id", userId)
    .eq("id", attachment.id);

  if (error) throw new Error(error.message);
}

export interface RemoveAttachmentObjectsResult {
  removedCount: number;
  /** Set when the batch remove call itself errored. Never thrown - see
   * deleteInstitutionPageAndAttachments for why a Storage failure must not
   * block a page delete, and why it is still surfaced rather than
   * swallowed. */
  error?: string;
}

/** Best-effort batch removal of storage objects. Never throws. An empty
 * `storagePaths` short-circuits without a call. */
export async function removeAttachmentStorageObjects(
  supabase: SupabaseClient<Database>,
  storagePaths: string[]
): Promise<RemoveAttachmentObjectsResult> {
  if (storagePaths.length === 0) return { removedCount: 0 };

  const { data, error } = await supabase.storage.from(INSTITUTION_ATTACHMENTS_BUCKET).remove(storagePaths);
  if (error) return { removedCount: 0, error: error.message };
  return { removedCount: data?.length ?? storagePaths.length };
}

/**
 * A signed URL for one attachment, expiring after `expiresInSeconds`
 * (default 1 hour, matching getRecordingFileUrl's default). AC5: these are
 * institutional policy documents, so this defaults to the more private
 * option (a private bucket + short-lived signed URL) rather than a public
 * URL - see the migration's bucket definition. Owner scoping is the
 * caller's job (fetch the attachment via getInstitutionPageAttachment
 * first, which is itself owner-scoped) - this function does no ownership
 * check of its own, matching getRecordingFileUrl.
 *
 * Caveat for whichever wave wires this into the UI: a signed URL is only
 * valid until it expires. It must NEVER be baked directly into a page's
 * saved markdown body (e.g. as an embedded `![](signed-url)` image) - once
 * that URL expires, the embed breaks permanently and silently, and the only
 * fix is re-editing every page body that ever embedded it. Markdown should
 * instead store a stable reference (the attachment id, e.g. a custom
 * `attachment://<id>` scheme or a same-origin route keyed by id) and the
 * renderer should resolve that reference to a fresh signed URL each time
 * the page is displayed, the same way this function is called on demand
 * rather than once and cached forever.
 */
export async function getInstitutionPageAttachmentUrl(
  supabase: SupabaseClient<Database>,
  attachment: InstitutionPageAttachment,
  expiresInSeconds = 3600
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(INSTITUTION_ATTACHMENTS_BUCKET)
    .createSignedUrl(attachment.storagePath, expiresInSeconds);

  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export interface DeletePageAndAttachmentsResult {
  /** Set when removing one or more storage objects failed. The page (and
   * its subtree, and their attachment ROWS) were still deleted - see the
   * docstring below for why a storage failure must not block that. */
  storageCleanupError?: string;
}

/**
 * Delete a page along with the Storage objects the database cascade is
 * about to orphan (AC3). institution_pages.parent_id -> on delete cascade
 * removes the page's whole subtree's ROWS automatically (see that
 * migration), and this table's page_id -> on delete cascade removes their
 * attachment ROWS too - but a foreign key cascade only ever deletes rows,
 * never a Storage object, so without this function every attachment on the
 * deleted page and all its descendants would become an orphaned,
 * invisible-forever blob (still billed, never reachable by any row).
 *
 * Enumeration: collectSubtreePageIds(institutionPages, page.id) walks the
 * RAW parent_id relationship (not the tree-display "effective parent"
 * reinterpretation) to get every page id the cascade will remove, then
 * listInstitutionPageAttachmentsForPages fetches every attachment on any of
 * those pages in one query.
 *
 * Partial-failure handling: removeAttachmentStorageObjects never throws -
 * if the batch remove call itself errors (e.g. a transient Storage outage),
 * that error is captured onto the returned `storageCleanupError` and the
 * page delete PROCEEDS anyway. Blocking the delete on a Storage hiccup
 * would leave the user unable to delete a page for a reason that has
 * nothing to do with the page itself, and the alternative - silently
 * swallowing the failure - would leave orphaned objects with no trace they
 * exist. Surfacing it on the result (for the action layer to relay, e.g. as
 * a non-fatal warning) satisfies both: the delete completes, and the
 * failure is not silent.
 */
export async function deleteInstitutionPageAndAttachments(
  supabase: SupabaseClient<Database>,
  userId: string,
  page: InstitutionPage
): Promise<DeletePageAndAttachmentsResult> {
  const institutionPages = await listInstitutionPages(supabase, userId, page.institution);
  const subtreeIds = collectSubtreePageIds(institutionPages, page.id);
  const attachments = await listInstitutionPageAttachmentsForPages(supabase, userId, subtreeIds);

  let storageCleanupError: string | undefined;
  if (attachments.length > 0) {
    const result = await removeAttachmentStorageObjects(
      supabase,
      attachments.map((a) => a.storagePath)
    );
    if (result.error) storageCleanupError = result.error;
  }

  await deleteInstitutionPage(supabase, userId, page.id);

  return storageCleanupError ? { storageCleanupError } : {};
}
