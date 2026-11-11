import type { LargeZipMember } from "./recoverable-zip-directory";
import { streamLargeZipMember } from "./stream-large-zip-member";
import { ZIP_MAX_MEMBER_DECLARED_BYTES } from "@/lib/zip-caps";

/** Verify the complete member, CRC and strict text encoding before admission. */
export async function validateGuardedZipText(blob: Blob, member: LargeZipMember): Promise<boolean> {
  if (member.declaredBytes > ZIP_MAX_MEMBER_DECLARED_BYTES) return false;
  if (member.declaredBytes === 0) return false; // The existing extractor cannot emit empty text evidence.
  const decoder = new TextDecoder("utf-8", { fatal: true }); let valid = true, substantive = false;
  const observe = (text: string) => { if (text.includes("\0")) valid = false; if (text.trim()) substantive = true; };
  const result = await streamLargeZipMember(blob, member, { async write(chunk) { if (!valid) return; try { observe(decoder.decode(chunk, { stream: true })); } catch { valid = false; } }, async commit() {}, async abort() { valid = false; } });
  try { observe(decoder.decode()); } catch { valid = false; }
  return result.ok && valid && substantive;
}
