import { inspectLargeZipDirectory } from "./recoverable-zip-directory";
import { verifyMember } from "./large-zip-subset";
import { GRADING_ZIP_MAX_BYTES } from "./grading-zip-transport";
import { ZIP_MAX_ARCHIVE_RATIO, ZIP_MAX_CUMULATIVE_DECLARED_BYTES, ZIP_MAX_CUMULATIVE_ENTRIES, ZIP_MAX_MEMBER_DECLARED_BYTES, ZIP_MAX_VIDEO_MEMBERS, ZIP_RATIO_FLOOR_BYTES } from "@/lib/zip-caps";

const table = Uint32Array.from({ length: 256 }, (_, index) => { let value = index; for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value >>> 0; });
function crc32(bytes: Uint8Array): number { let crc = 0xffffffff; for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }

/** Append small, explicitly mapped text evidence without materializing the existing ZIP. */
export async function appendZipEvidence(source: Blob, entries: readonly { path: string; text: string }[], deferAggregateRatio = false): Promise<{ ok: true; archive: Blob } | { ok: false; reason: string }> {
  const inventory = await inspectLargeZipDirectory(source); if (!inventory.ok) return { ok: false, reason: "The prepared ZIP could not be inspected." };
  const encoder = new TextEncoder(), names = new Set(inventory.members.map((member) => member.path.normalize("NFKC").toLowerCase()));
  const generated: { name: Uint8Array; bytes: Uint8Array; crc: number }[] = [];
  for (const entry of entries) {
    const key = entry.path.normalize("NFKC").toLowerCase();
    if (!entry.path || !/^[^/\\\x00-\x1f\x7f]+\.txt$/i.test(entry.path) || names.has(key)) return { ok: false, reason: "Evidence filename is invalid or conflicts with a submission." };
    const name = encoder.encode(entry.path), bytes = encoder.encode(entry.text); names.add(key);
    if (name.length > 4096 || bytes.length > ZIP_MAX_MEMBER_DECLARED_BYTES) return { ok: false, reason: "Evidence exceeds the safe member limit." };
    generated.push({ name, bytes, crc: crc32(bytes) });
  }
  const members = inventory.members, declared = members.reduce((n, member) => n + member.declaredBytes, 0) + generated.reduce((n, item) => n + item.bytes.length, 0);
  if (members.length + generated.length > ZIP_MAX_CUMULATIVE_ENTRIES || declared > ZIP_MAX_CUMULATIVE_DECLARED_BYTES || members.filter((member) => /\.(?:mp4|m4v|mov|webm)$/i.test(member.path)).length > ZIP_MAX_VIDEO_MEMBERS) return { ok: false, reason: "batch exceeds grading limits" };
  let uncompressed = 0, compressed = 0;
  for (const member of members) { uncompressed += member.declaredBytes; compressed += member.compressedBytes; if (!deferAggregateRatio && uncompressed >= ZIP_RATIO_FLOOR_BYTES && Math.round(uncompressed / Math.max(compressed, 1)) > ZIP_MAX_ARCHIVE_RATIO) return { ok: false, reason: "batch exceeds compression ratio limit" }; }
  const estimated = 22 + members.reduce((n, member) => n + 30 + member.rawName.length + member.compressedBytes + member.centralEntry.length, 0) + generated.reduce((n, item) => n + 76 + item.name.length * 2 + item.bytes.length, 0);
  if (estimated > GRADING_ZIP_MAX_BYTES) return { ok: false, reason: "batch exceeds transport limit" };
  for (const member of members) if (!await verifyMember(source, member)) return { ok: false, reason: "The prepared ZIP failed integrity verification." };
  const chunks: BlobPart[] = [], directory: ArrayBuffer[] = []; let offset = 0;
  for (const member of members) {
    const header = new Uint8Array(30 + member.rawName.length), view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, member.flags & ~8, true); view.setUint16(8, member.method, true); view.setUint32(14, member.crc, true); view.setUint32(18, member.compressedBytes, true); view.setUint32(22, member.declaredBytes, true); view.setUint16(26, member.rawName.length, true); header.set(member.rawName, 30);
    const central = member.centralEntry.slice(), cv = new DataView(central.buffer, central.byteOffset, central.byteLength); cv.setUint16(8, member.flags & ~8, true); cv.setUint32(42, offset, true);
    chunks.push(header.buffer, source.slice(member.dataOffset, member.dataOffset + member.compressedBytes)); directory.push(central.buffer as ArrayBuffer); offset += header.length + member.compressedBytes;
  }
  for (const item of generated) {
    const header = new Uint8Array(30 + item.name.length), hv = new DataView(header.buffer);
    hv.setUint32(0, 0x04034b50, true); hv.setUint16(4, 20, true); hv.setUint16(6, 0x800, true); hv.setUint32(14, item.crc, true); hv.setUint32(18, item.bytes.length, true); hv.setUint32(22, item.bytes.length, true); hv.setUint16(26, item.name.length, true); header.set(item.name, 30);
    const central = new Uint8Array(46 + item.name.length), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true); cv.setUint32(16, item.crc, true); cv.setUint32(20, item.bytes.length, true); cv.setUint32(24, item.bytes.length, true); cv.setUint16(28, item.name.length, true); cv.setUint32(42, offset, true); central.set(item.name, 46);
    chunks.push(header.buffer, item.bytes.buffer as ArrayBuffer); directory.push(central.buffer); offset += header.length + item.bytes.length;
  }
  const directorySize = directory.reduce((n, entry) => n + entry.byteLength, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, members.length + generated.length, true); ev.setUint16(10, members.length + generated.length, true); ev.setUint32(12, directorySize, true); ev.setUint32(16, offset, true);
  return { ok: true, archive: new Blob([...chunks, ...directory, end.buffer], { type: "application/zip" }) };
}
