"use server";

// Server actions for "attach files as notes for each cell" of the Tasks grid
// (docs/task-cell-attachments-acceptance-criteria.md). Thin owner-scoped
// wrappers over src/lib/supabase/course-task-attachments.ts - all
// persistence lives there so it stays unit-testable without a live Supabase
// session; this file only adds the auth gate and friendly-error input
// validation. Mirrors src/app/actions/task-institution-instructions.ts.
//
// AC2 item 10: the file's BYTES never pass through a server action at all -
// the browser uploads straight to the "course-files" Storage bucket with its
// own authenticated client (useSupabase()), because a server action's body
// is capped at 4.5 MB at the Vercel Functions platform layer (a limit
// next.config.ts's serverActions.bodySizeLimit cannot raise), and base64
// encoding would inflate an already-too-small budget further. What these
// actions carry is the small JSON metadata describing a file the browser
// already wrote (a name, a mime type, a byte count, the storage path it used) -
// never a base64 payload. They are the "row recorder" / "row deleter"
// dependency that src/lib/course-task-attachments.ts's uploadTaskAttachment
// and deleteTaskAttachment take as arguments, called from the browser side
// of a later wave's dialog component.

import { requireOwner } from "@/lib/supabase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import {
  listTaskAttachments,
  createTaskAttachmentRow,
  deleteTaskAttachmentRow,
  type CreateTaskAttachmentRowInput,
} from "@/lib/supabase/course-task-attachments";
import type { TaskAttachment } from "@/lib/course-task-attachments";

/**
 * List every attachment the signed-in owner has recorded, across every
 * course and task - loaded once per Tasks tab mount, in the same
 * Promise.all as courses/cells/defs/instructions (AC4 item 18), then indexed
 * client-side via indexTaskAttachments.
 */
export async function listTaskAttachmentsAction(): Promise<{ attachments: TaskAttachment[] } | { error: string }> {
  try {
    const user = await requireOwner();
    const supabase = createServiceClient();
    const attachments = await listTaskAttachments(supabase, user.id);
    return { attachments };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not list task attachments." };
  }
}

export interface CreateTaskAttachmentActionInput {
  id: string;
  courseId: string;
  taskId: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  storagePath: string;
}

/**
 * Record one attachment's metadata row AFTER the browser has already
 * uploaded the object to Storage (AC2 item 12's ordering: object first, row
 * second) - this action's input is a plain metadata object, and it never
 * touches Storage itself.
 */
export async function createTaskAttachmentAction(
  input: CreateTaskAttachmentActionInput
): Promise<{ attachment: TaskAttachment } | { error: string }> {
  try {
    if (!input.id || !input.id.trim()) {
      return { error: "An attachment id is required." };
    }
    if (!input.courseId || !input.courseId.trim()) {
      return { error: "A course is required." };
    }
    if (!input.taskId || !input.taskId.trim()) {
      return { error: "A task id is required." };
    }
    if (!input.storagePath || !input.storagePath.trim()) {
      return { error: "A storage path is required." };
    }

    const user = await requireOwner();
    const supabase = createServiceClient();
    const row: CreateTaskAttachmentRowInput = {
      id: input.id,
      courseId: input.courseId,
      taskId: input.taskId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storagePath: input.storagePath,
    };
    const attachment = await createTaskAttachmentRow(supabase, user.id, row);
    return { attachment };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not record the attachment." };
  }
}

/**
 * Delete one attachment's metadata row AFTER the browser has already removed
 * the object from Storage (AC2 item 12's reverse ordering: object first,
 * row second) - this action never touches Storage itself.
 */
export async function deleteTaskAttachmentAction(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    if (!id || !id.trim()) {
      return { error: "An attachment id is required." };
    }

    const user = await requireOwner();
    const supabase = createServiceClient();
    await deleteTaskAttachmentRow(supabase, user.id, id);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not delete the attachment." };
  }
}
