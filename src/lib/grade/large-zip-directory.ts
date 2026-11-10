/** Metadata-only ZIP inventory. No decompression, upload, or grading occurs. */
export interface LargeZipMember { readonly path: string; readonly compressedBytes: number; readonly declaredBytes: number; readonly crc32: number; readonly nestedArchive: boolean }
export type LargeZipInventory = { readonly ok: true; readonly members: readonly LargeZipMember[]; readonly archiveBytes: number } | { readonly ok: false; readonly reason: "invalid" | "unsupported" | "too-many-entries" | "directory-too-large" | "read-failed" };
const MAX_DIRECTORY_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 20_000;
const MAX_TAIL_BYTES = 22 + 65_535;
const fail = (reason: Extract<LargeZipInventory, { ok: false }>["reason"]): LargeZipInventory => ({ ok: false, reason });

/** Reads only a bounded tail and central directory, even for very large files.
 * Metadata alone cannot prove a member is safe, complete, or readable. */
export async function inspectLargeZipDirectory(file: Pick<Blob, "size" | "slice">): Promise<LargeZipInventory> {
  if (!Number.isSafeInteger(file.size) || file.size < 22) return fail("invalid");
  try {
    const tailStart = Math.max(0, file.size - MAX_TAIL_BYTES);
    const tail = new Uint8Array(await file.slice(tailStart, file.size).arrayBuffer());
    if (tail.byteLength !== file.size - tailStart) return fail("read-failed");
    const tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
    let end = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tv.getUint32(i, true) === 0x06054b50 && i + 22 + tv.getUint16(i + 20, true) === tail.length) { end = i; break; }
    }
    if (end < 0) return fail("invalid");
    const disk = tv.getUint16(end + 4, true), directoryDisk = tv.getUint16(end + 6, true);
    const diskEntries = tv.getUint16(end + 8, true), entries = tv.getUint16(end + 10, true);
    const size = tv.getUint32(end + 12, true), offset = tv.getUint32(end + 16, true);
    if (disk || directoryDisk || diskEntries !== entries || entries === 0xffff || size === 0xffffffff || offset === 0xffffffff) return fail("unsupported");
    if (entries > MAX_ENTRIES) return fail("too-many-entries");
    if (size > MAX_DIRECTORY_BYTES) return fail("directory-too-large");
    if (offset + size !== tailStart + end) return fail("invalid");
    const bytes = new Uint8Array(await file.slice(offset, offset + size).arrayBuffer());
    if (bytes.length !== size) return fail("read-failed");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const members: LargeZipMember[] = [], seen = new Set<string>();
    let cursor = 0;
    for (let n = 0; n < entries; n++) {
      if (cursor + 46 > size || view.getUint32(cursor, true) !== 0x02014b50) return fail("invalid");
      const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true);
      const compressed = view.getUint32(cursor + 20, true), declared = view.getUint32(cursor + 24, true);
      const nameLength = view.getUint16(cursor + 28, true), extraLength = view.getUint16(cursor + 30, true), commentLength = view.getUint16(cursor + 32, true);
      const diskStart = view.getUint16(cursor + 34, true), localOffset = view.getUint32(cursor + 42, true);
      const attrs = view.getUint32(cursor + 38, true), unixKind = (attrs >>> 16) & 0xf000;
      const next = cursor + 46 + nameLength + extraLength + commentLength;
      if (!nameLength || nameLength > 4096 || next > size) return fail("invalid");
      if ((flags & 0x2041) || ![0, 8].includes(method) || diskStart || [compressed, declared, localOffset].includes(0xffffffff) || (unixKind !== 0 && unixKind !== 0x4000 && unixKind !== 0x8000)) return fail("unsupported");
      if (localOffset >= offset) return fail("invalid");
      const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
      if (!(flags & 0x800) && rawName.some((c) => c > 127)) return fail("unsupported");
      let name: string;
      try { name = decoder.decode(rawName); } catch { return fail("invalid"); }
      const path = name.endsWith("/") ? name.slice(0, -1) : name;
      if (!path || /[\x00-\x1f\x7f\\]/.test(path) || path.startsWith("/") || /^[A-Za-z]:/.test(path) || path.split("/").some((part) => !part || part === "." || part === "..")) return fail("invalid");
      const key = path.normalize("NFKC").toLowerCase();
      if (seen.has(key)) return fail("invalid");
      seen.add(key);
      if (!name.endsWith("/")) members.push({ path, compressedBytes: compressed, declaredBytes: declared, crc32: view.getUint32(cursor + 16, true), nestedArchive: /\.zip$/i.test(path) });
      cursor = next;
    }
    if (cursor !== size) return fail("invalid");
    return { ok: true, members, archiveBytes: file.size };
  } catch { return fail("read-failed"); }
}
