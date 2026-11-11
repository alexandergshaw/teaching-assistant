import { inspectLargeZipDirectory, type LargeZipMember } from "./recoverable-zip-directory";
import { isBrightspaceProjectSource } from "./brightspace-project-inventory";
import { streamLargeZipMember } from "./stream-large-zip-member";
import { VIDEO_EXTENSIONS, VIDEO_GRADING_ENABLED } from "./constants";
import { GUARDED_TEXT_EXTENSIONS } from "@/lib/guarded-text-formats";
import { validateGuardedZipText } from "./validate-guarded-zip-text";
import { OFFICE_MAX_ARCHIVE_DECLARED_BYTES, OFFICE_MAX_ENTRIES, ZIP_MAX_ARCHIVE_RATIO, ZIP_MAX_CUMULATIVE_DECLARED_BYTES, ZIP_MAX_CUMULATIVE_ENTRIES, ZIP_MAX_MEMBER_DECLARED_BYTES, ZIP_MAX_MEMBER_RATIO, ZIP_MAX_VIDEO_MEMBERS, ZIP_RATIO_FLOOR_BYTES } from "@/lib/zip-caps";

type Charge = { readonly declared: number; readonly compressed: number };
type NestedBudget = { readonly charges: readonly Charge[]; readonly officeBytes: number };
export type PreparedZipBudget = { readonly outer: readonly Charge[]; readonly outerOfficeBytes: number; readonly nested: readonly NestedBudget[]; readonly nestedEntries: number; readonly wireBytes: number; readonly paths: readonly string[]; readonly videos: number };
const isVideo = (path: string) => VIDEO_GRADING_ENABLED && VIDEO_EXTENSIONS.has(path.split(".").pop()?.toLowerCase() ?? "");
const supportedLeaf = (path: string) => isBrightspaceProjectSource(path) || isVideo(path);

/** Office XML reads consume the shared cumulative budget after ZIP planning. */
async function officeCharge(source: Blob, member: LargeZipMember): Promise<number | null> {
  const ext = member.path.split(".").pop()?.toLowerCase() ?? "";
  if (!["docx", "pptx", "xlsx", "odt", "odp", "ods"].includes(ext)) return 0;
  const chunks: Uint8Array[] = [];
  const read = await streamLargeZipMember(source, member, { async write(chunk) { chunks.push(chunk.slice()); }, async commit() {}, async abort() { chunks.length = 0; } });
  if (!read.ok) return null;
  const office = await inspectLargeZipDirectory(new Blob(chunks as BlobPart[])); if (!office.ok || office.entryCount > OFFICE_MAX_ENTRIES) return null;
  if (office.members.reduce((sum, item) => sum + item.declaredBytes, 0) > OFFICE_MAX_ARCHIVE_DECLARED_BYTES || office.members.some((item) => item.declaredBytes > ZIP_MAX_MEMBER_DECLARED_BYTES || (item.declaredBytes >= ZIP_RATIO_FLOOR_BYTES && Math.round(item.declaredBytes / Math.max(item.compressedBytes, 1)) > ZIP_MAX_MEMBER_RATIO))) return null;
  return office.members.filter((item) => ext === "docx" ? item.path === "word/document.xml" : ext === "xlsx" ? item.path === "xl/sharedStrings.xml" : ext === "pptx" ? /^ppt\/slides\/slide\d+\.xml$/i.test(item.path) : false).reduce((sum, item) => sum + item.declaredBytes, 0);
}

/** Summarize a single prepared group, without inflating its retained project.
 * Only STORE nested projects and supported leaves are accepted here; callers
 * must also independently verify the prepared archive's CRCs before dispatch.
 */
export async function inspectPreparedZipBudget(source: Blob): Promise<PreparedZipBudget | null> {
  const outer = await inspectLargeZipDirectory(source); if (!outer.ok) return null;
  const nested: NestedBudget[] = []; let nestedEntries = 0, outerOfficeBytes = 0, videos = 0;
  const charge = (member: LargeZipMember): Charge => ({ declared: member.declaredBytes, compressed: member.compressedBytes });
  for (const member of outer.members) {
    if (!member.nestedArchive) { if (!supportedLeaf(member.path) || (GUARDED_TEXT_EXTENSIONS.has(member.path.split(".").pop()?.toLowerCase() ?? "") && !await validateGuardedZipText(source, member))) return null; if (isVideo(member.path)) videos++; const office = await officeCharge(source, member); if (office === null) return null; outerOfficeBytes += office; continue; }
    if (member.method !== 0) return null;
    const projectBlob = source.slice(member.dataOffset, member.dataOffset + member.compressedBytes), project = await inspectLargeZipDirectory(projectBlob);
    if (!project.ok || project.members.some((item) => item.nestedArchive || !supportedLeaf(item.path))) return null;
    let officeBytes = 0; for (const item of project.members) { if (GUARDED_TEXT_EXTENSIONS.has(item.path.split(".").pop()?.toLowerCase() ?? "") && !await validateGuardedZipText(projectBlob, item)) return null; if (isVideo(item.path)) videos++; const office = await officeCharge(projectBlob, item); if (office === null) return null; officeBytes += office; }
    nestedEntries += project.entryCount; nested.push({ charges: project.members.map(charge), officeBytes });
  }
  // Merging reconstructs the outer ZIP from file members, omitting directory records.
  const wireBytes = outer.members.reduce((sum, member) => sum + 30 + member.rawName.length + member.compressedBytes + member.centralEntry.length, 0);
  return { outer: outer.members.map(charge), outerOfficeBytes, nested, nestedEntries, wireBytes, paths: outer.members.map((member) => member.path.normalize("NFKC").toLowerCase()), videos };
}

/** Model the extractor's outer-first, then nested traversal for a merged ZIP. */
export function preparedZipBudgetFits(groups: readonly PreparedZipBudget[], transportLimit: number): boolean {
  if (!groups.length || 22 + groups.reduce((sum, group) => sum + group.wireBytes, 0) > transportLimit) return false;
  if (groups.reduce((sum, group) => sum + group.videos, 0) > ZIP_MAX_VIDEO_MEMBERS) return false;
  const paths = groups.flatMap((group) => group.paths); if (new Set(paths).size !== paths.length) return false;
  if (groups.reduce((sum, group) => sum + group.outer.length + group.nestedEntries, 0) > ZIP_MAX_CUMULATIVE_ENTRIES) return false;
  let declared = 0, compressed = 0;
  const charge = (item: Charge) => {
    if (item.declared > ZIP_MAX_MEMBER_DECLARED_BYTES || (item.declared >= ZIP_RATIO_FLOOR_BYTES && Math.round(item.declared / Math.max(item.compressed, 1)) > ZIP_MAX_MEMBER_RATIO)) return false;
    declared += item.declared; compressed += item.compressed;
    if (declared > ZIP_MAX_CUMULATIVE_DECLARED_BYTES || (declared >= ZIP_RATIO_FLOOR_BYTES && Math.round(declared / Math.max(compressed, 1)) > ZIP_MAX_ARCHIVE_RATIO)) return false;
    return true;
  };
  for (const item of groups.flatMap((group) => group.outer)) if (!charge(item)) return false;
  declared += groups.reduce((sum, group) => sum + group.outerOfficeBytes, 0); if (declared > ZIP_MAX_CUMULATIVE_DECLARED_BYTES) return false;
  for (const project of groups.flatMap((group) => group.nested)) { for (const item of project.charges) if (!charge(item)) return false; declared += project.officeBytes; if (declared > ZIP_MAX_CUMULATIVE_DECLARED_BYTES) return false; }
  return true;
}
