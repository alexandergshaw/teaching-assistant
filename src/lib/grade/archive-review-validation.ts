import "server-only";
import JSZip from "jszip";
import { chargeArchiveLevel, createZipBudget, readMemberBounded } from "@/lib/zip-caps";
import { getFileExtension } from "@/lib/office-extract";
import { isArchiveBookkeeping } from "./unsupported-archive";
import { ARCHIVE_REVIEW_MAX_BYTES, matchesReviewArchive, snapshotReviewArchive, type ArchiveReviewSnapshot } from "./archive-review-snapshot";
import { planReviewedArchive, type ReviewArchiveAssignment, type ArchiveReviewPlan } from "./archive-omission-review";

/** This seam checks plain text bytes only; it never declares grading evidence complete. */
const REVIEWABLE_TEXT = new Set(["txt", "md", "markdown", "py", "js", "ts", "tsx", "jsx", "java", "c", "cpp", "cs", "css", "rb", "go", "rs", "sql", "sh", "bash", "zsh", "php", "swift", "kt", "kts", "scala", "r", "m", "tex", "yml", "yaml", "csv", "tsv"]);

export type ArchiveMemberCheck = "bookkeeping" | "text-verified" | "unsupported" | "unreadable" | "checksum-failed";
export interface ValidatedArchiveMember { readonly id: string; readonly path: string; readonly check: ArchiveMemberCheck }

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit++) current = (current >>> 1) ^ ((current & 1) ? 0xedb88320 : 0);
  return current >>> 0;
});

/** ZIP CRC-32 is only corruption detection; the snapshot's SHA-256 binds the source. */
export function archiveCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Clone and bind the source before any await. Uses the existing archive caps
 * and bounded decompressor; no client-provided readability result is trusted.
 */
export async function validateArchiveForReview(bytes: Uint8Array, snapshot: ArchiveReviewSnapshot): Promise<readonly ValidatedArchiveMember[]> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > ARCHIVE_REVIEW_MAX_BYTES) throw new Error("The archive is unavailable for review.");
  const source = new Uint8Array(bytes);
  if (!matchesReviewArchive(source, snapshot)) throw new Error("The archive changed since it was selected for review.");
  const bound = snapshotReviewArchive(source);
  const zip = await JSZip.loadAsync(source, { createFolders: false });
  const files = Object.entries(zip.files).filter(([, file]) => !file.dir);
  const expectedPaths = new Set(bound.members.map((member) => member.path));
  if (files.length !== bound.members.length || files.some(([path]) => !expectedPaths.has(path))) throw new Error("The archive inventory could not be verified.");
  const budget = createZipBudget();
  const planned = chargeArchiveLevel(zip, budget, { parentPath: "", chain: [], classify: (name) => !isArchiveBookkeeping(name) && REVIEWABLE_TEXT.has(getFileExtension(name)) ? "leaf" : "skip" });
  const byPath = new Map(planned.map((item) => [item.fullName, item]));
  const checked: ValidatedArchiveMember[] = [];
  for (const member of bound.members) {
    if (isArchiveBookkeeping(member.path)) { checked.push({ id: member.id, path: member.path, check: "bookkeeping" }); continue; }
    const item = byPath.get(member.path);
    if (!item) { checked.push({ id: member.id, path: member.path, check: "unsupported" }); continue; }
    if (item.declared !== member.uncompressedSize) throw new Error("The archive inventory could not be verified.");
    let raw: Buffer;
    try { raw = await readMemberBounded(item.entry, item.declared, item.fullName, [], budget.limits); }
    catch { checked.push({ id: member.id, path: member.path, check: "unreadable" }); continue; }
    if (archiveCrc32(raw) !== member.crc32) { checked.push({ id: member.id, path: member.path, check: "checksum-failed" }); continue; }
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
      checked.push({ id: member.id, path: member.path, check: text.trim() && !text.includes("\0") ? "text-verified" : "unreadable" });
    } catch { checked.push({ id: member.id, path: member.path, check: "unreadable" }); }
  }
  return checked;
}

/**
 * Produces candidates only, never permission to grade. The caller must retain
 * the snapshot and source server-side, bind explicit approval to that source,
 * and re-run all grading-evidence, ownership and idempotency checks at dispatch.
 */
export async function planValidatedArchive(bytes: Uint8Array, snapshot: ArchiveReviewSnapshot, assignments: readonly ReviewArchiveAssignment[]): Promise<ArchiveReviewPlan> {
  if (!Array.isArray(assignments)) return { ok: false, reason: "Review every archive member before continuing." };
  const captured = assignments.map((item) => ({ memberId: item?.memberId, studentKey: item?.studentKey, studentLabel: item?.studentLabel }));
  const checked = await validateArchiveForReview(bytes, snapshot);
  const members = checked.filter((member) => member.check !== "bookkeeping").map((member) => ({ id: member.id, path: member.path, readable: member.check === "text-verified" }));
  return planReviewedArchive(members, captured);
}
