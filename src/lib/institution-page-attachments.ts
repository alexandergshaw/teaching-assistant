// Attachments for institution_pages: any file type, uploaded to a page in the
// per-institution knowledge base. See
// supabase/migrations/20260915000000_institution_page_attachments.sql for the
// table this reads and writes (and its header comment for why attachments are
// a child table rather than a jsonb column on institution_pages), and
// src/lib/recording-files.ts for the upload/delete shape this mirrors:
// upload to a bucket, insert a row recording storage_path, delete the storage
// object BEFORE the row, and best-effort-clean the object if the row insert
// fails so a failed upload leaves no orphan blob.
//
// Data layer only (wave 1 of 2) - no UI reads these yet. A later wave wires
// the Knowledge tab to list/upload/delete/embed these.

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
 * Per-file size cap. Uploads reach the server as a base64 string (matching
 * src/app/actions/syllabus-upload.ts's `{ name, base64, mimeType }` shape -
 * see uploadInstitutionPageAttachmentAction), which inflates the wire size
 * by ~4/3 over the real file size. 6 MB decoded -> ~8 MB encoded, which
 * stays comfortably under next.config.ts's
 * `experimental.serverActions.bodySizeLimit` of 10mb with headroom left for
 * the rest of the JSON payload (page id, file name, mime type) - the exact
 * same reasoning (and the same 6 MB number) as MAX_FILE_SIZE in
 * src/lib/syllabus-upload-validation.ts, reused here for consistency rather
 * than picked fresh. The bucket's own `file_size_limit` is set to the same
 * byte value at the Storage layer (see the migration) as a second,
 * independent gate.
 */
export const MAX_ATTACHMENT_SIZE_BYTES = 6 * 1024 * 1024;

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

export interface CreateInstitutionPageAttachmentMeta {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Upload a file to a page's attachments. AC2's two caps are enforced here,
 * before any I/O: the size cap against the given `sizeBytes` (computed by
 * the caller from the real decoded payload - see
 * uploadInstitutionPageAttachmentAction), and the count cap via a `head:
 * true` count query (cheaper than fetching every row just to check its
 * length). Either refusal throws a message naming the exact limit, per AC2 -
 * never a silent truncation or drop.
 *
 * Follows recording-files.ts's saveRecordingFile shape: upload to Storage
 * first, then insert the row; if the insert fails, best-effort remove the
 * just-uploaded object so a failed upload never leaves an orphan blob.
 */
export async function createInstitutionPageAttachment(
  supabase: SupabaseClient<Database>,
  userId: string,
  pageId: string,
  fileBody: Blob | Buffer | ArrayBuffer,
  meta: CreateInstitutionPageAttachmentMeta
): Promise<InstitutionPageAttachment> {
  if (exceedsAttachmentSizeCap(meta.sizeBytes)) {
    throw new Error(attachmentSizeCapMessage(meta.fileName, meta.sizeBytes));
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

  const id = crypto.randomUUID();
  const storagePath = buildAttachmentStoragePath(userId, pageId, id, meta.fileName);

  const { error: uploadError } = await supabase.storage
    .from(INSTITUTION_ATTACHMENTS_BUCKET)
    .upload(storagePath, fileBody, { contentType: meta.mimeType, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { data: row, error: insertError } = await supabase
    .from("institution_page_attachments")
    .insert({
      id,
      page_id: pageId,
      user_id: userId,
      file_name: meta.fileName,
      mime_type: meta.mimeType,
      size_bytes: meta.sizeBytes,
      storage_path: storagePath,
    })
    .select()
    .single();

  if (insertError) {
    await supabase.storage
      .from(INSTITUTION_ATTACHMENTS_BUCKET)
      .remove([storagePath])
      .catch(() => {});
    throw new Error(insertError.message);
  }

  return mapInstitutionPageAttachment(row);
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
