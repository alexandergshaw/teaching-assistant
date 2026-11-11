import { inspectLargeZipDirectory, type LargeZipMember } from "./recoverable-zip-directory";
import { ZIP_MAX_ARCHIVE_RATIO, ZIP_MAX_CUMULATIVE_DECLARED_BYTES, ZIP_MAX_CUMULATIVE_ENTRIES, ZIP_MAX_MEMBER_DECLARED_BYTES, ZIP_MAX_MEMBER_RATIO, ZIP_MAX_VIDEO_MEMBERS, ZIP_RATIO_FLOOR_BYTES } from "@/lib/zip-caps";
import { GRADING_ZIP_MAX_BYTES } from "./grading-zip-transport";
import { inferStudentPrefix } from "./utils";

type Reason = "nested archive" | "member size" | "unsupported type" | "compression ratio" | "group size" | "unassigned index";
export interface RecoverableGroup { readonly label: string; readonly sourceIdentifier: string; readonly members: readonly LargeZipMember[]; readonly reason?: Reason }
export type RecoverablePlan = { readonly ok: true; readonly groups: readonly RecoverableGroup[] } | { readonly ok: false; readonly reason: string };
const supported = new Set(["txt", "md", "py", "ipynb", "csv", "pdf", "docx", "html", "mp4", "m4v", "mov", "webm", "c", "cc", "cpp", "cxx", "h", "hpp", "user", "recipe", "log", "command"]);
const videos = new Set(["mp4", "m4v", "mov", "webm"]);
const ext = (path: string) => path.split(".").pop()?.toLowerCase() ?? "";

/** Predict the existing subset builder's limits without reading or materializing members. */
export function checkRecoverableBatch(groups: readonly RecoverableGroup[], allGroups: readonly RecoverableGroup[], extra: readonly { nameBytes: number; bytes: number }[] = [], deferAggregateRatio = false, inAppHandoff = false): string | null {
  const members = groups.flatMap((group) => group.members);
  if (members.length + extra.length > ZIP_MAX_CUMULATIVE_ENTRIES || members.reduce((n, m) => n + m.declaredBytes, 0) + extra.reduce((n, entry) => n + entry.bytes, 0) > ZIP_MAX_CUMULATIVE_DECLARED_BYTES || extra.some((entry) => entry.bytes > ZIP_MAX_MEMBER_DECLARED_BYTES || entry.nameBytes > 4096) || members.filter((m) => videos.has(ext(m.path))).length > ZIP_MAX_VIDEO_MEMBERS) return "batch exceeds grading limits";
  let declared = 0, compressed = 0;
  for (const member of members) { declared += member.declaredBytes; compressed += member.compressedBytes; if (!deferAggregateRatio && declared >= ZIP_RATIO_FLOOR_BYTES && Math.round(declared / Math.max(compressed, 1)) > ZIP_MAX_ARCHIVE_RATIO) return "batch exceeds compression ratio limit"; }
  const estimated = members.reduce((n, m) => n + 30 + m.rawName.length + m.compressedBytes + m.centralEntry.length, 22);
  const selected = new Set(groups.map((group) => group.label));
  const describe = (group: RecoverableGroup) => ({ label: group.label, sourceField: group.sourceIdentifier, files: group.members.map((member) => member.path), reason: group.reason ?? null });
  const sentinel = new TextEncoder().encode(JSON.stringify({ ownershipVerified: false, selected: groups.map(describe), omitted: allGroups.filter((group) => !selected.has(group.label)).map(describe) }));
  const sentinelName = new TextEncoder().encode("PARTIAL_ARCHIVE_REQUIRES_REVIEW.json");
  return estimated + (inAppHandoff ? 0 : 76 + sentinelName.length * 2 + sentinel.length) + extra.reduce((n, entry) => n + 76 + entry.nameBytes * 2 + entry.bytes, 0) > GRADING_ZIP_MAX_BYTES ? "batch exceeds transport limit" : null;
}

/** Conservative plan: root-level Canvas or numeric Brightspace-style names only. */
export async function planRecoverableZip(file: Blob): Promise<RecoverablePlan> {
  const inventory = await inspectLargeZipDirectory(file);
  if (!inventory.ok) return { ok: false, reason: inventory.reason };
  const groups = new Map<string, { label: string; sourceIdentifier: string; members: LargeZipMember[]; unassigned?: boolean }>();
  const identityByName = new Map<string, string>(), nameByIdentity = new Map<string, string>();
  const brightspace = inventory.members.some((member) => /^\d+-\d+ - [^/]+$/.test(member.path));
  for (const member of inventory.members) {
    if (brightspace && member.path.toLowerCase() === "index.html") { groups.set("unassigned:index", { label: "Unassigned index.html", sourceIdentifier: "unassigned", members: [member], unassigned: true }); continue; }
    const d2l = brightspace ? /^(\d+)-(\d+) - ([^/]+)$/.exec(member.path) : null;
    if (d2l) {
      const label = `${d2l[1]}-${d2l[2]}`, key = `d2l:${label}`, downstream = inferStudentPrefix(member.path);
      const previous = identityByName.get(downstream.key);
      if (previous && previous !== key) return { ok: false, reason: "ambiguous member identity" };
      identityByName.set(downstream.key, key);
      const group = groups.get(key) ?? { label, sourceIdentifier: label, members: [] };
      group.members.push(member); groups.set(key, group); continue;
    }
    if (brightspace) return { ok: false, reason: "unrecognized member identity" };
    const match = /^([^/]+?)_(\d+)_\d+_.+$/.exec(member.path);
    if (!match) return { ok: false, reason: "unrecognized member identity" };
    const key = match[1].normalize("NFKC").toLocaleLowerCase();
    const downstream = inferStudentPrefix(member.path);
    if (downstream.display.normalize("NFKC").toLocaleLowerCase() !== key) return { ok: false, reason: "archive grouping differs from grading intake" };
    const identity = match[2].replace(/^0+(?=\d)/, "");
    if ((identityByName.has(key) && identityByName.get(key) !== identity) || (nameByIdentity.has(identity) && nameByIdentity.get(identity) !== key)) return { ok: false, reason: "ambiguous member identity" };
    identityByName.set(key, identity); nameByIdentity.set(identity, key);
    const group = groups.get(key) ?? { label: match[1], sourceIdentifier: identity, members: [] };
    group.members.push(member); groups.set(key, group);
  }
  return { ok: true, groups: [...groups.values()].map((group) => {
    let reason: Reason | undefined;
    if (group.unassigned) reason = "unassigned index";
    else if (group.members.some((member) => member.nestedArchive)) reason = "nested archive";
    else if (group.members.some((member) => member.declaredBytes > ZIP_MAX_MEMBER_DECLARED_BYTES || member.compressedBytes > ZIP_MAX_MEMBER_DECLARED_BYTES)) reason = "member size";
    else if (group.members.some((member) => !supported.has(ext(member.path)))) reason = "unsupported type";
    else if (group.members.some((member) => member.declaredBytes >= ZIP_RATIO_FLOOR_BYTES && (!member.compressedBytes || member.declaredBytes / member.compressedBytes > ZIP_MAX_MEMBER_RATIO))) reason = "compression ratio";
    else if (group.members.reduce((sum, member) => sum + member.declaredBytes, 0) > ZIP_MAX_CUMULATIVE_DECLARED_BYTES || group.members.filter((member) => videos.has(ext(member.path))).length > ZIP_MAX_VIDEO_MEMBERS) reason = "group size";
    return { ...group, ...(reason ? { reason } : {}) };
  }) };
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index; for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value >>> 0;
});

/** Verify actual decompressed length and CRC while bounding resident data. */
export async function verifyMember(file: Blob, member: LargeZipMember): Promise<boolean> {
  try {
    let stream = file.slice(member.dataOffset, member.dataOffset + member.compressedBytes).stream();
    if (member.method === 8) stream = stream.pipeThrough(new DecompressionStream("deflate-raw"));
    const reader = stream.getReader(); let count = 0; let crc = 0xffffffff;
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        count += chunk.value.byteLength;
        if (count > member.declaredBytes || count > ZIP_MAX_MEMBER_DECLARED_BYTES) { await reader.cancel(); return false; }
        for (const byte of chunk.value) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
      }
    } finally { reader.releaseLock(); }
    return count === member.declaredBytes && ((crc ^ 0xffffffff) >>> 0) === member.crc;
  } catch { return false; }
}

/** Build one reviewed, whole-group batch without materializing the source ZIP.
 * Caller must disclose omitted groups and confirm ownership/grouping before use. */
export async function buildRecoverableZip(file: Blob, selectedLabels: readonly string[], inAppHandoff = false, verificationCache?: WeakMap<Blob, Set<string>>, deferAggregateRatio = false): Promise<{ ok: true; archive: Blob; selected: readonly RecoverableGroup[]; omitted: readonly RecoverableGroup[]; ownershipVerified: false } | { ok: false; reason: string }> {
  const plan = await planRecoverableZip(file); if (!plan.ok) return plan;
  const wanted = new Set(selectedLabels);
  const groups = plan.groups.filter((group) => wanted.has(group.label));
  if (!groups.length || groups.length !== wanted.size || groups.some((group) => group.reason)) return { ok: false, reason: "invalid or blocked group selection" };
  const members = groups.flatMap((group) => group.members);
  const refusal = checkRecoverableBatch(groups, plan.groups, [], deferAggregateRatio, inAppHandoff); if (refusal) return { ok: false, reason: refusal };
  const verifiedMembers = verificationCache?.get(file) ?? new Set<string>();
  verificationCache?.set(file, verifiedMembers);
  for (const member of members) {
    const key = `${member.dataOffset}:${member.compressedBytes}:${member.declaredBytes}:${member.crc}`;
    if (verifiedMembers.has(key)) continue;
    if (!(await verifyMember(file, member))) return { ok: false, reason: "member integrity could not be verified in this browser" };
    verifiedMembers.add(key);
  }
  const chunks: BlobPart[] = [], directory: ArrayBuffer[] = []; let offset = 0;
  for (const member of members) {
    const header = new Uint8Array(30 + member.rawName.length); const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, member.flags & ~8, true); view.setUint16(8, member.method, true);
    view.setUint32(14, member.crc, true); view.setUint32(18, member.compressedBytes, true); view.setUint32(22, member.declaredBytes, true); view.setUint16(26, member.rawName.length, true); header.set(member.rawName, 30);
    const central = member.centralEntry.slice(); const cv = new DataView(central.buffer, central.byteOffset, central.byteLength); cv.setUint16(8, member.flags & ~8, true); cv.setUint32(42, offset, true);
    chunks.push(header.buffer, file.slice(member.dataOffset, member.dataOffset + member.compressedBytes)); directory.push(central.buffer as ArrayBuffer); offset += header.length + member.compressedBytes;
  }
  // An unsupported sentinel keeps current intake fail-closed. The grader must
  // not accept this partial ZIP until it can present and preserve provenance.
  const sentinelName = new TextEncoder().encode("PARTIAL_ARCHIVE_REQUIRES_REVIEW.json");
  const describe = (group: RecoverableGroup) => ({ label: group.label, sourceField: group.sourceIdentifier, files: group.members.map((member) => member.path), reason: group.reason ?? null });
  const sentinel = new TextEncoder().encode(JSON.stringify({ ownershipVerified: false, selected: groups.map(describe), omitted: plan.groups.filter((group) => !wanted.has(group.label)).map(describe) }));
  let checksum = 0xffffffff; for (const byte of sentinel) checksum = crcTable[(checksum ^ byte) & 0xff] ^ (checksum >>> 8); checksum = (checksum ^ 0xffffffff) >>> 0;
  const header = new Uint8Array(30 + sentinelName.length), hv = new DataView(header.buffer);
  hv.setUint32(0, 0x04034b50, true); hv.setUint16(4, 20, true); hv.setUint32(14, checksum, true); hv.setUint32(18, sentinel.length, true); hv.setUint32(22, sentinel.length, true); hv.setUint16(26, sentinelName.length, true); header.set(sentinelName, 30);
  const central = new Uint8Array(46 + sentinelName.length), cv = new DataView(central.buffer);
  cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint32(16, checksum, true); cv.setUint32(20, sentinel.length, true); cv.setUint32(24, sentinel.length, true); cv.setUint16(28, sentinelName.length, true); cv.setUint32(42, offset, true); central.set(sentinelName, 46);
  if (!inAppHandoff) { chunks.push(header.buffer, sentinel.buffer as ArrayBuffer); directory.push(central.buffer); offset += header.length + sentinel.length; }
  const directorySize = directory.reduce((n, entry) => n + entry.byteLength, 0);
  const end = new Uint8Array(22); const ev = new DataView(end.buffer); ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, members.length + (inAppHandoff ? 0 : 1), true); ev.setUint16(10, members.length + (inAppHandoff ? 0 : 1), true); ev.setUint32(12, directorySize, true); ev.setUint32(16, offset, true);
  return { ok: true, archive: new Blob([...chunks, ...directory, end.buffer], { type: "application/zip" }), selected: groups, omitted: plan.groups.filter((group) => !wanted.has(group.label)), ownershipVerified: false };
}
