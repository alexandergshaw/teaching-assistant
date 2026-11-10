/** Metadata-only ZIP inventory. No decompression, upload, or grading occurs. */
export interface LargeZipMember { readonly path: string; readonly compressedBytes: number; readonly declaredBytes: number; readonly nestedArchive: boolean; readonly dataOffset: number; readonly flags: number; readonly method: number; readonly crc: number; readonly crc32: number; readonly rawName: Uint8Array; readonly centralEntry: Uint8Array }
export type LargeZipInventory = { readonly ok: true; readonly members: readonly LargeZipMember[]; readonly archiveBytes: number } | { readonly ok: false; readonly reason: "invalid" | "unsupported" | "too-many-entries" | "directory-too-large" | "read-failed" };
const MAX_DIRECTORY_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 20_000;
const MAX_TAIL_BYTES = 22 + 65_535;
const MAX_LOCAL_METADATA_BYTES = 16 * 1024 * 1024;
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
    const locals: { offset: number; flags: number; method: number; compressed: number; declared: number; crc: number; rawName: Uint8Array; path: string; directory: boolean; centralEntry: Uint8Array }[] = [];
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
      // ZIP64 and Unicode-path overrides can make a downstream ZIP reader
      // see different sizes or names from this inventory.
      for (let extra = cursor + 46 + nameLength; extra < cursor + 46 + nameLength + extraLength;) {
        if (extra + 4 > cursor + 46 + nameLength + extraLength) return fail("invalid");
        const kind = view.getUint16(extra, true), length = view.getUint16(extra + 2, true);
        if (extra + 4 + length > cursor + 46 + nameLength + extraLength) return fail("invalid");
        if (kind === 0x0001 || kind === 0x7075) return fail("unsupported");
        extra += 4 + length;
      }
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
      locals.push({ offset: localOffset, flags, method, compressed, declared, crc: view.getUint32(cursor + 16, true), rawName: rawName.slice(), path, directory: name.endsWith("/"), centralEntry: bytes.slice(cursor, next) });
      cursor = next;
    }
    if (cursor !== size) return fail("invalid");
    // A central directory is untrusted. Bound all local-header reads and
    // cross-check names, flags, methods, ranges and available size metadata.
    // This still does not decompress data or prove CRC/integrity.
    let metadataBytes = 0;
    const ranges: { start: number; end: number }[] = [];
    for (const member of locals) {
      if (member.offset + 30 > offset) return fail("invalid");
      const head = new Uint8Array(await file.slice(member.offset, member.offset + 30).arrayBuffer());
      if (head.length !== 30) return fail("read-failed");
      const hv = new DataView(head.buffer, head.byteOffset, head.byteLength);
      if (hv.getUint32(0, true) !== 0x04034b50 || hv.getUint16(6, true) !== member.flags || hv.getUint16(8, true) !== member.method) return fail("invalid");
      const nameBytes = hv.getUint16(26, true), extraBytes = hv.getUint16(28, true);
      metadataBytes += 30 + nameBytes + extraBytes;
      if (metadataBytes > MAX_LOCAL_METADATA_BYTES) return fail("unsupported");
      if (nameBytes !== member.rawName.length || member.offset + 30 + nameBytes + extraBytes + member.compressed > offset) return fail("invalid");
      const localName = new Uint8Array(await file.slice(member.offset + 30, member.offset + 30 + nameBytes).arrayBuffer());
      if (localName.length !== nameBytes) return fail("read-failed");
      if (localName.some((byte, index) => byte !== member.rawName[index])) return fail("invalid");
      if (!(member.flags & 8) && (hv.getUint32(14, true) !== member.crc || hv.getUint32(18, true) !== member.compressed || hv.getUint32(22, true) !== member.declared)) return fail("invalid");
      if (!member.directory) members.push({ path: member.path, compressedBytes: member.compressed, declaredBytes: member.declared, nestedArchive: /\.zip$/i.test(member.path), dataOffset: member.offset + 30 + nameBytes + extraBytes, flags: member.flags, method: member.method, crc: member.crc, crc32: member.crc, rawName: member.rawName, centralEntry: member.centralEntry });
      ranges.push({ start: member.offset, end: member.offset + 30 + nameBytes + extraBytes + member.compressed });
    }
    ranges.sort((a, b) => a.start - b.start);
    for (let i = 1; i < ranges.length; i++) if (ranges[i].start < ranges[i - 1].end) return fail("invalid");
    return { ok: true, members, archiveBytes: file.size };
  } catch { return fail("read-failed"); }
}
