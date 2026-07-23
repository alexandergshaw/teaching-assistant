"use server";

// Server-safe boundary around office-extract's text extraction, for the
// "materials-zip" source gatherer (source-policy resolver). office-extract
// pulls in jszip + officeparser and must never be imported by a client
// component - this action is the same client/server boundary the slide-text
// extraction in generateLectureQaAction (course-planning.ts) already uses,
// just generalized to a whole zip's members instead of one uploaded file.
//
// Called two ways: as a real server action (RPC over the network) from
// attended (browser) workflow steps, and as a plain function call from the
// headless server-runner - both paths are server-safe since the browser
// never imports this module directly.

import { requireOwner } from "@/lib/supabase/auth";
import { extractTextFromBuffer } from "@/lib/office-extract";

export interface MaterialsZipTextEntry {
  name: string;
  size: number;
  /** Best-effort extracted text; "" when extraction failed or was skipped
   * (e.g. the member is too large, or its type is not extractable). */
  text: string;
}

const DEFAULT_MAX_MEMBERS = 20;
const DEFAULT_MAX_MEMBER_BYTES = 2 * 1024 * 1024;

/**
 * Extract best-effort text from a zip's member files. Skips directories,
 * caps the number of members inspected and each member's size (oversized
 * members still get listed - by name/size - just with empty text) so a large
 * archive can never blow the request or the extraction budget. A member that
 * fails to extract (unsupported type, corrupt content) is listed with empty
 * text rather than failing the whole call.
 */
export async function extractZipMaterialsTextAction(
  zipBase64: string,
  maxMembers: number = DEFAULT_MAX_MEMBERS,
  maxMemberBytes: number = DEFAULT_MAX_MEMBER_BYTES
): Promise<{ entries: MaterialsZipTextEntry[] } | { error: string }> {
  try {
    await requireOwner();
    const JSZipMod = (await import("jszip")).default;
    const zip = await JSZipMod.loadAsync(Buffer.from(zipBase64, "base64"));
    const members = Object.values(zip.files).filter((f) => !f.dir);
    const entries: MaterialsZipTextEntry[] = [];

    for (const member of members.slice(0, maxMembers)) {
      try {
        const buffer = await member.async("nodebuffer");
        if (buffer.byteLength > maxMemberBytes) {
          entries.push({ name: member.name, size: buffer.byteLength, text: "" });
          continue;
        }
        const text = await extractTextFromBuffer(member.name, buffer);
        entries.push({ name: member.name, size: buffer.byteLength, text: text?.trim() ?? "" });
      } catch {
        entries.push({ name: member.name, size: 0, text: "" });
      }
    }

    return { entries };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not read the materials zip." };
  }
}
