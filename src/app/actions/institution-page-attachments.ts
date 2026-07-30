"use server";

// Server actions for institution_page_attachments. Thin owner-scoped
// wrappers over src/lib/institution-page-attachments.ts - all persistence,
// cap enforcement, and storage cleanup live there so they stay unit-testable
// without a live Supabase session; this file only adds the auth gate and the
// page/attachment existence checks that turn a missing or foreign id into a
// clean {error} instead of touching another owner's data. Mirrors
// src/app/actions/knowledge-base.ts's own shape.
//
// Data layer only (wave 1 of 2) - nothing in the app calls these yet. A
// later wave wires the Knowledge tab's UI to them.

import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getInstitutionPage } from "@/lib/knowledge-base";
import {
  listInstitutionPageAttachments,
  getInstitutionPageAttachment,
  createInstitutionPageAttachment,
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
  name: string;
  /** Base64-encoded file bytes - matches uploadSyllabusAction's `{ name,
   * base64, mimeType }` shape, so the same size-from-base64 computation
   * (Buffer.byteLength(base64, "base64")) applies here too. */
  base64: string;
  mimeType: string;
}

/** Upload a new attachment to a page. Enforces the size cap on the real
 * decoded byte length (not the inflated base64 string length) and the
 * per-page count cap - see MAX_ATTACHMENT_SIZE_BYTES / MAX_ATTACHMENTS_PER_PAGE
 * in src/lib/institution-page-attachments.ts for both numbers and their
 * justification. */
export async function uploadInstitutionPageAttachmentAction(
  pageId: string,
  file: UploadInstitutionPageAttachmentFile
): Promise<{ attachment: InstitutionPageAttachment } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();

    const page = await getInstitutionPage(supabase, user.id, pageId);
    if (!page) return { error: "Page not found." };

    const sizeBytes = Buffer.byteLength(file.base64, "base64");
    const buffer = Buffer.from(file.base64, "base64");

    const attachment = await createInstitutionPageAttachment(supabase, user.id, pageId, buffer, {
      fileName: file.name,
      mimeType: file.mimeType,
      sizeBytes,
    });
    return { attachment };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not upload the attachment." };
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
