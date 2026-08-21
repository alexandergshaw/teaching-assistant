"use server";

import { createCartridgeMigration, type FileUploadTicket } from "@/lib/canvas-modules";
import { requireOwner } from "@/lib/supabase/auth";

// ── Cartridge upload to a live Canvas course ─────────────────────────────────
// Starts a common_cartridge_importer content migration and hands the caller a
// pre-signed upload ticket. The cartridge bytes themselves never pass through
// this action - the browser POSTs them straight to ticket.uploadUrl (AC13) -
// so this file only ever carries the small JSON exchange with Canvas.

/** Start a cartridge-import content migration and get the file's upload ticket. */
export async function createCartridgeMigrationAction(
  courseUrl: string,
  file: { name: string; size: number },
  opts: { selective: boolean; overwriteQuizzes: boolean },
  acronym?: string
): Promise<
  | { migrationId: number; courseId: string; state: string; ticket: FileUploadTicket }
  | { error: string }
> {
  try {
    await requireOwner();
    return await createCartridgeMigration(courseUrl, file, opts, acronym);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not start the cartridge import." };
  }
}
