import { inspectLargeZipDirectory, type LargeZipMember } from "./recoverable-zip-directory";
import { verifyMember } from "./large-zip-subset";
import { GRADING_ZIP_MAX_BYTES } from "./grading-zip-transport";
import { ZIP_MAX_CUMULATIVE_DECLARED_BYTES, ZIP_MAX_CUMULATIVE_ENTRIES } from "@/lib/zip-caps";

/** Merge already prepared archives without loading their contents into JS memory.
 * This checks the outer container only; the caller must separately prove all
 * recursive extraction budgets before submitting the resulting archive.
 */
export async function mergePreparedZips(sources: readonly Blob[]): Promise<{ ok: true; archive: Blob } | { ok: false; reason: string }> {
  if (!sources.length) return { ok: false, reason: "no prepared archives" };
  const members: { source: Blob; member: LargeZipMember }[] = [], names = new Set<string>();
  let declared = 0, estimated = 22;
  for (const source of sources) {
    const inventory = await inspectLargeZipDirectory(source);
    if (!inventory.ok) return { ok: false, reason: "prepared archive could not be inspected" };
    for (const member of inventory.members) {
      const key = member.path.normalize("NFKC").toLowerCase();
      if (names.has(key)) return { ok: false, reason: "prepared archives contain conflicting paths" };
      names.add(key); declared += member.declaredBytes;
      estimated += 30 + member.rawName.length + member.compressedBytes + member.centralEntry.length;
      members.push({ source, member });
    }
  }
  if (members.length > ZIP_MAX_CUMULATIVE_ENTRIES || declared > ZIP_MAX_CUMULATIVE_DECLARED_BYTES || estimated > GRADING_ZIP_MAX_BYTES) return { ok: false, reason: "batch exceeds grading limits" };
  for (const { source, member } of members) if (!await verifyMember(source, member)) return { ok: false, reason: "prepared archive failed integrity verification" };
  const chunks: BlobPart[] = [], directory: ArrayBuffer[] = []; let offset = 0;
  for (const { source, member } of members) {
    const header = new Uint8Array(30 + member.rawName.length), view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, member.flags & ~8, true); view.setUint16(8, member.method, true); view.setUint32(14, member.crc, true); view.setUint32(18, member.compressedBytes, true); view.setUint32(22, member.declaredBytes, true); view.setUint16(26, member.rawName.length, true); header.set(member.rawName, 30);
    const central = member.centralEntry.slice(), cv = new DataView(central.buffer, central.byteOffset, central.byteLength); cv.setUint16(8, member.flags & ~8, true); cv.setUint32(42, offset, true);
    chunks.push(header.buffer, source.slice(member.dataOffset, member.dataOffset + member.compressedBytes)); directory.push(central.buffer as ArrayBuffer); offset += header.length + member.compressedBytes;
  }
  const end = new Uint8Array(22), view = new DataView(end.buffer), directorySize = directory.reduce((sum, entry) => sum + entry.byteLength, 0);
  view.setUint32(0, 0x06054b50, true); view.setUint16(8, members.length, true); view.setUint16(10, members.length, true); view.setUint32(12, directorySize, true); view.setUint32(16, offset, true);
  return { ok: true, archive: new Blob([...chunks, ...directory, end.buffer], { type: "application/zip" }) };
}
