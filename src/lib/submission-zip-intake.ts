// N5 - ZIP intake for the snapshot-grading panel's submission role. Pure
// decision logic ONLY: no React, no DOM, no JSZip import - vitest here is
// node-env and renders no component, so every DECISION that needs a unit
// test lives here, exactly the split snapshot-shot.ts's own top comment
// documents. The actual zip open/decompress lives in
// submission-archive-sniff.ts (the repo's one JSZip-for-submissions import),
// which calls into this module before it decompresses anything.

import { formatMB } from "@/lib/upload-budget";

export interface ArchiveEntryMeta {
  name: string;
  dir: boolean;
  /** The DECLARED size from the zip's central directory - readable from a
   *  loaded zip without expanding the entry. See checkArchiveCaps below for
   *  why this must never come from an already-decompressed byte count. */
  uncompressedSize: number;
}

export const MAX_ARCHIVE_ENTRIES = 500;
// WHY: bounds the work of even listing entries. A real LMS submission export
// (Canvas/Moodle/Brightspace/Blackboard, per sniffEntries in
// submission-archive-sniff.ts) is a handful to a few dozen files for one
// student, so 500 leaves generous headroom while still bounding a hostile
// archive with an enormous entry table.

export const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 250 * 1024 * 1024;
// WHY: 250MB uncompressed is far more than any realistic set of submission
// screenshots, but small enough that decompressing it client-side would
// still visibly hang the tab if this cap were ever checked too late. That is
// exactly the zip-bomb hazard this cap exists to bound, which is also why it
// is compared against the DECLARED total (see checkArchiveCaps), never a
// running tally paid for by decompressing first.

export type ArchiveCapCheck =
  | { ok: true }
  | { ok: false; reason: "too-many-entries"; entryCount: number; limit: number }
  | { ok: false; reason: "too-large"; uncompressedBytes: number; limit: number };

/**
 * The cap is checked BEFORE decompression: `uncompressedSize` is readable
 * from a loaded zip's central directory without expanding any entry (proven
 * in-process against JSZip, see n5-architect.md's probe). A cap enforced
 * while decompressing has already paid the cost it exists to avoid, so this
 * function must only ever be handed DECLARED sizes, never bytes already
 * read off disk.
 */
export function checkArchiveCaps(entries: readonly ArchiveEntryMeta[]): ArchiveCapCheck {
  if (entries.length > MAX_ARCHIVE_ENTRIES) {
    return { ok: false, reason: "too-many-entries", entryCount: entries.length, limit: MAX_ARCHIVE_ENTRIES };
  }
  const uncompressedBytes = entries.reduce((sum, e) => sum + e.uncompressedSize, 0);
  if (uncompressedBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
    return { ok: false, reason: "too-large", uncompressedBytes, limit: MAX_ARCHIVE_UNCOMPRESSED_BYTES };
  }
  return { ok: true };
}

// Everything the snapshot pipeline can turn into a shot without a new
// feature (a .docx or .pdf submission is a different feature with its own
// risks - out of scope here, and reported rather than half-supported).
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp"]);

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
}

export function isUsableImageEntry(entry: Pick<ArchiveEntryMeta, "name" | "dir">): boolean {
  return !entry.dir && IMAGE_EXTENSIONS.has(extensionOf(entry.name));
}

export interface ClassifiedEntries {
  images: ArchiveEntryMeta[];
  /** Names of entries the pipeline cannot use - never silently dropped, see
   *  decideZipIntake and describeZipIntakeDecision below, which both surface
   *  this list rather than discarding it. Directories are excluded: a folder
   *  is structure, not unread content. */
  ignoredNames: string[];
}

export function classifyEntries(entries: readonly ArchiveEntryMeta[]): ClassifiedEntries {
  const images: ArchiveEntryMeta[] = [];
  const ignoredNames: string[] = [];
  for (const entry of entries) {
    if (entry.dir) continue;
    if (isUsableImageEntry(entry)) images.push(entry);
    else ignoredNames.push(entry.name);
  }
  return { images, ignoredNames };
}

export type ZipIntakeDecision =
  | { status: "too-many-entries"; entryCount: number; limit: number }
  | { status: "too-large"; uncompressedBytes: number; limit: number }
  | { status: "empty"; ignoredNames: string[] }
  | { status: "refused-over-budget"; archiveImageCount: number; remainingSlots: number; ignoredNames: string[] }
  | { status: "ok"; images: ArchiveEntryMeta[]; ignoredNames: string[] };

/**
 * The single decision point: caps first (pre-decompression), then
 * classification, then refuse-vs-accept against the remaining shot budget.
 *
 * At the budget, this REFUSES rather than truncating: if the archive holds
 * more usable images than there are remaining slots, silently taking the
 * first N and grading them would score a PARTIAL submission as though it
 * were the whole one, and the instructor could not tell from the result.
 * snapshot-shot.ts's own MAX_SHOTS/canAddShot and snapshot-read.ts's
 * over-cap check already treat exceeding the shot budget as an error, not an
 * invitation to truncate - this matches that.
 */
export function decideZipIntake(
  entries: readonly ArchiveEntryMeta[],
  remainingSlots: number
): ZipIntakeDecision {
  const capCheck = checkArchiveCaps(entries);
  if (!capCheck.ok) {
    return capCheck.reason === "too-many-entries"
      ? { status: "too-many-entries", entryCount: capCheck.entryCount, limit: capCheck.limit }
      : { status: "too-large", uncompressedBytes: capCheck.uncompressedBytes, limit: capCheck.limit };
  }

  const { images, ignoredNames } = classifyEntries(entries);

  if (images.length === 0) {
    return { status: "empty", ignoredNames };
  }

  if (images.length > remainingSlots) {
    return { status: "refused-over-budget", archiveImageCount: images.length, remainingSlots, ignoredNames };
  }

  return { status: "ok", images, ignoredNames };
}

function describeIgnored(ignoredNames: readonly string[]): string {
  if (ignoredNames.length === 0) return "";
  const shown = ignoredNames.slice(0, 5).join(", ");
  const more = ignoredNames.length > 5 ? ", ..." : "";
  return ` ${ignoredNames.length} other file(s) in the archive were not images and were not added (${shown}${more}).`;
}

/** User-facing text for a decision - the instructor-visible half of AC-F2
 *  (unusable entries reported) and N5-B (refuse states both numbers). */
export function describeZipIntakeDecision(decision: ZipIntakeDecision, archiveName: string): string {
  switch (decision.status) {
    case "too-many-entries":
      return `"${archiveName}" has ${decision.entryCount} entries, over the ${decision.limit}-entry limit - it was not read.`;
    case "too-large":
      return `"${archiveName}" is too large to read (${formatMB(decision.uncompressedBytes)} uncompressed, limit ${formatMB(decision.limit)}) - it was not read.`;
    case "refused-over-budget":
      return `"${archiveName}" holds ${decision.archiveImageCount} image(s), but only ${decision.remainingSlots} submission slot(s) remain - delete some shots first, or split the archive.`;
    case "empty":
      return `"${archiveName}" has no images in it.${describeIgnored(decision.ignoredNames)}`;
    case "ok":
      return `Added ${decision.images.length} image(s) from "${archiveName}" as submission shots.${describeIgnored(decision.ignoredNames)}`;
  }
}
