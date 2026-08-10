"use server";

// Server actions for institution_page_attachments. Thin owner-scoped
// wrappers over src/lib/institution-page-attachments.ts - all persistence,
// cap enforcement, and storage cleanup live there so they stay unit-testable
// without a live Supabase session; this file only adds the auth gate and the
// page/attachment existence checks that turn a missing or foreign id into a
// clean {error} instead of touching another owner's data. Mirrors
// src/app/actions/knowledge-base.ts's own shape.
//
// uploadInstitutionPageAttachmentAction's input is METADATA ONLY - no file
// bytes, in any encoding. The browser uploads the object straight to the
// "institution-attachments" Storage bucket with its own authenticated
// client (AttachmentsPanel.tsx, via uploadInstitutionPageAttachment in
// src/lib/institution-page-attachments.ts) BEFORE calling this action,
// because a server action's body is capped at 4.5 MB at the Vercel
// Functions PLATFORM layer - a limit next.config.ts's
// serverActions.bodySizeLimit cannot raise - and base64 encoding would
// inflate an already-too-small budget further. This action is the "row
// recorder" dependency uploadInstitutionPageAttachment takes as an
// argument, called from the browser side of AttachmentsPanel.tsx.

import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getInstitutionPage } from "@/lib/knowledge-base";
import {
  listInstitutionPageAttachments,
  getInstitutionPageAttachment,
  insertInstitutionPageAttachmentRow,
  deleteInstitutionPageAttachment,
  getInstitutionPageAttachmentUrl,
  type InstitutionPageAttachment,
} from "@/lib/institution-page-attachments";

/** List every attachment on one page, owner-scoped. */
export async function listInstitutionPageAttachmentsAction(
  pageId: string
): Promise<{ attachments: InstitutionPageAttachment[] } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const page = await getInstitutionPage(supabase, user.id, pageId);
    if (!page) return { error: "Page not found." };

    const attachments = await listInstitutionPageAttachments(supabase, user.id, pageId);
    return { attachments };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list attachments." };
  }
}

export interface UploadInstitutionPageAttachmentFile {
  /** Generated in the BROWSER before the upload - the storage path embeds
   * it and the object is already written under this id by the time this
   * action runs. */
  id: string;
  name: string;
  mimeType: string;
  /** The size the browser itself observed on the File object - never
   * recomputed here, since this action never receives the bytes. */
  sizeBytes: number;
  /** The Storage object path the browser already wrote the file to (see
   * buildAttachmentStoragePath). */
  storagePath: string;
}

/** Record a new attachment's metadata row for an object the browser has
 * already uploaded to Storage. Enforces the per-page count cap - see
 * MAX_ATTACHMENTS_PER_PAGE in src/lib/institution-page-attachments.ts - the
 * size cap was already enforced in the browser before the upload happened
 * (AttachmentsPanel.tsx), and this action never sees the file's bytes to
 * re-check it independently. */
export async function uploadInstitutionPageAttachmentAction(
  pageId: string,
  file: UploadInstitutionPageAttachmentFile
): Promise<{ attachment: InstitutionPageAttachment } | { error: string }> {
  try {
    if (!file.id || !file.id.trim()) {
      return { error: "An attachment id is required." };
    }
    if (!file.storagePath || !file.storagePath.trim()) {
      return { error: "A storage path is required." };
    }

    const user = await requireOwner();
    const supabase = createServiceClient();

    const page = await getInstitutionPage(supabase, user.id, pageId);
    if (!page) return { error: "Page not found." };

    const attachment = await insertInstitutionPageAttachmentRow(supabase, user.id, pageId, {
      id: file.id,
      fileName: file.name,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      storagePath: file.storagePath,
    });
    return { attachment };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not record the attachment." };
  }
}

/** Delete a single attachment: its storage object first (best-effort), then
 * its row. Never touches another owner's attachment - a missing or foreign
 * id returns an error before any storage or row access. */
export async function deleteInstitutionPageAttachmentAction(
  id: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const attachment = await getInstitutionPageAttachment(supabase, user.id, id);
    if (!attachment) return { error: "Attachment not found." };

    await deleteInstitutionPageAttachment(supabase, user.id, attachment);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the attachment." };
  }
}

/** A short-lived signed URL for one attachment (AC5) - see
 * getInstitutionPageAttachmentUrl's docstring for why this is a signed URL
 * rather than a public one, and the caveat against baking it into saved
 * markdown. */
export async function getInstitutionPageAttachmentUrlAction(
  id: string
): Promise<{ url: string; expiresInSeconds: number } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const attachment = await getInstitutionPageAttachment(supabase, user.id, id);
    if (!attachment) return { error: "Attachment not found." };

    const expiresInSeconds = 3600;
    const url = await getInstitutionPageAttachmentUrl(supabase, attachment, expiresInSeconds);
    return { url, expiresInSeconds };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not create a link for this attachment." };
  }
}
