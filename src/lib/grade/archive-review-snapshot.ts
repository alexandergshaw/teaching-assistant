import "server-only";
import { createHash } from "node:crypto";
import { ZIP_MAX_CUMULATIVE_DECLARED_BYTES, ZIP_MAX_CUMULATIVE_ENTRIES } from "@/lib/zip-caps";

/** A deliberately narrow snapshot; unsupported archive forms remain refused. */
export interface ArchiveReviewSnapshot {
  readonly sourceSha256: string;
  readonly members: readonly { readonly id: string; readonly path: string }[];
}

const MAX_ARCHIVE_BYTES = ZIP_MAX_CUMULATIVE_DECLARED_BYTES + 5 * 1024 * 1024;
const MAX_COMMENT = 65535;
const fail = (): never => { throw new Error("This archive cannot be safely inventoried for review."); };

/**
 * Inventories central-directory records directly, before a name-keyed ZIP
 * library can collapse duplicates. ASCII, single-disk, non-ZIP64, non-nested
 * archives only. This does not extract bytes or establish readability.
 */
export function snapshotReviewArchive(bytes: Uint8Array): ArchiveReviewSnapshot {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 22 || bytes.byteLength > MAX_ARCHIVE_BYTES) return fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, true);
  const u32 = (offset: number) => view.getUint32(offset, true);
  let end = -1;
  for (let cursor = bytes.length - 22; cursor >= Math.max(0, bytes.length - 22 - MAX_COMMENT); cursor--) {
    if (u32(cursor) === 0x06054b50 && cursor + 22 + u16(cursor + 20) === bytes.length) { end = cursor; break; }
  }
  if (end < 0 || u16(end + 4) !== 0 || u16(end + 6) !== 0) return fail();
  const diskEntries = u16(end + 8), totalEntries = u16(end + 10), centralSize = u32(end + 12), centralOffset = u32(end + 16);
  if (diskEntries !== totalEntries || totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff || totalEntries > ZIP_MAX_CUMULATIVE_ENTRIES || centralOffset + centralSize !== end) return fail();
  const seenPaths = new Set<string>(), regularPaths = new Set<string>(), localOffsets = new Set<number>();
  const ranges: { start: number; end: number }[] = [];
  const members: { id: string; path: string }[] = [];
  let cursor = centralOffset;
  for (let index = 0; index < totalEntries; index++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) return fail();
    const flags = u16(cursor + 8), method = u16(cursor + 10), compressedSize = u32(cursor + 20);
    const nameLength = u16(cursor + 28), extraLength = u16(cursor + 30), commentLength = u16(cursor + 32);
    const diskStart = u16(cursor + 34), local = u32(cursor + 42), next = cursor + 46 + nameLength + extraLength + commentLength;
    if (!nameLength || nameLength > 4096 || extraLength || next > end || (flags & ~0x800) !== 0 || ![0, 8].includes(method) || diskStart !== 0 || compressedSize === 0xffffffff || u32(cursor + 24) === 0xffffffff || local === 0xffffffff || localOffsets.has(local)) return fail();
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    if (nameBytes.some((value) => value < 32 || value > 126)) return fail();
    const name = String.fromCharCode(...nameBytes);
    const path = name.endsWith("/") ? name.slice(0, -1) : name;
    const parts = path.split("/");
    if (!path || name.includes("\\") || parts.some((part) => !part || part === "." || part === "..") || /^[A-Za-z]:/.test(path)) return fail();
    const attrs = u32(cursor + 38), unixKind = (attrs >>> 16) & 0xf000;
    if (((attrs & 0x10) !== 0 && !name.endsWith("/")) || (unixKind !== 0 && ![0x4000, 0x8000].includes(unixKind)) || (unixKind === 0x4000 && !name.endsWith("/")) || (unixKind === 0x8000 && name.endsWith("/"))) return fail();
    const folded = path.normalize("NFKC").toLowerCase();
    if (seenPaths.has(folded)) return fail();
    seenPaths.add(folded);
    if (!name.endsWith("/")) regularPaths.add(folded);
    if (local + 30 > centralOffset || u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== method || u32(local + 14) !== u32(cursor + 16) || u32(local + 18) !== compressedSize || u32(local + 22) !== u32(cursor + 24)) return fail();
    const localNameLength = u16(local + 26), localExtraLength = u16(local + 28), dataStart = local + 30 + localNameLength + localExtraLength;
    if (localNameLength !== nameLength || localExtraLength || dataStart + compressedSize > centralOffset) return fail();
    for (let i = 0; i < nameLength; i++) if (bytes[local + 30 + i] !== nameBytes[i]) return fail();
    localOffsets.add(local);
    ranges.push({ start: local, end: dataStart + compressedSize });
    if (!name.endsWith("/")) {
      if (path.toLowerCase().endsWith(".zip")) return fail();
      members.push({ id: String(index), path });
    }
    cursor = next;
  }
  if (cursor !== end) return fail();
  for (const path of seenPaths) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) if (regularPaths.has(parts.slice(0, i).join("/"))) return fail();
  }
  ranges.sort((a, b) => a.start - b.start);
  if (ranges.length && ranges[0].start !== 0) return fail();
  for (let i = 1; i < ranges.length; i++) if (ranges[i].start !== ranges[i - 1].end) return fail();
  if ((ranges.at(-1)?.end ?? 0) !== centralOffset) return fail();
  return { sourceSha256: createHash("sha256").update(bytes).digest("hex"), members };
}

/** Recompute from retained source bytes, never from client-supplied metadata. */
export function matchesReviewArchive(bytes: Uint8Array, expected: ArchiveReviewSnapshot): boolean {
  try {
    const actual = snapshotReviewArchive(bytes);
    return actual.sourceSha256 === expected.sourceSha256 && actual.members.length === expected.members.length && actual.members.every((member, i) => member.id === expected.members[i]?.id && member.path === expected.members[i]?.path);
  } catch { return false; }
}
