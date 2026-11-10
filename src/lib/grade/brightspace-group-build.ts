import JSZip from "jszip";
import type { RecoverableGroup } from "./large-zip-subset";
import { buildReviewedBrightspaceProject } from "./brightspace-project-inventory";
import { streamLargeZipMember } from "./stream-large-zip-member";
import { ZIP_MAX_CUMULATIVE_DECLARED_BYTES, ZIP_MAX_MEMBER_DECLARED_BYTES } from "@/lib/zip-caps";
import { GRADING_ZIP_MAX_BYTES } from "./grading-zip-transport";

/** Rebuild one whole Brightspace group after explicit nested-project exclusion review. */
export async function buildBrightspaceGroup(source: Blob, group: RecoverableGroup, exclusions: Readonly<Record<string, readonly string[]>>): Promise<{ ok: true; archive: Blob; mappedPaths: readonly string[]; excludedPaths: readonly string[] } | { ok: false; reason: string }> {
  if (group.reason !== "nested archive" || !/^\d+-\d+$/.test(group.label)) return { ok: false, reason: "group is not an eligible Brightspace project" };
  const nestedPaths = group.members.filter((member) => member.nestedArchive).map((member) => member.path);
  if (Object.keys(exclusions).length !== nestedPaths.length || nestedPaths.some((path) => !Object.hasOwn(exclusions, path))) return { ok: false, reason: "review every nested project before grading" };
  const zip = new JSZip(), mappedPaths: string[] = [], excludedPaths: string[] = []; let total = 0;
  for (const member of group.members) {
    if (member.nestedArchive) {
      const project = await buildReviewedBrightspaceProject(source, member, exclusions[member.path]); if (!project.ok) return project;
      if (project.archive.size > ZIP_MAX_MEMBER_DECLARED_BYTES) return { ok: false, reason: "reviewed project exceeds the safe archive limit" };
      total += project.archive.size; zip.file(member.path, await project.archive.arrayBuffer());
      mappedPaths.push(...project.retainedPaths.map((path) => `${member.path}/${path}`)); excludedPaths.push(...project.excludedPaths.map((path) => `${member.path}/${path}`));
    } else {
      if (member.declaredBytes > ZIP_MAX_MEMBER_DECLARED_BYTES) return { ok: false, reason: "a companion file exceeds the safe extraction limit" };
      total += member.declaredBytes; const parts: ArrayBuffer[] = [];
      if (!(member.declaredBytes === 0 && member.compressedBytes === 0 && member.crc === 0 && member.method === 0)) {
        const read = await streamLargeZipMember(source, member, { async write(chunk) { parts.push(chunk.slice().buffer as ArrayBuffer); }, async commit() {}, async abort() { parts.length = 0; } });
        if (!read.ok) return read;
      }
      zip.file(member.path, await new Blob(parts).arrayBuffer()); mappedPaths.push(member.path);
    }
    if (total > ZIP_MAX_CUMULATIVE_DECLARED_BYTES) return { ok: false, reason: "whole group exceeds the safe extraction limit" };
  }
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
  if (bytes.length > GRADING_ZIP_MAX_BYTES) return { ok: false, reason: "whole group exceeds the upload limit" };
  return { ok: true, archive: new Blob([new Uint8Array(bytes).buffer]), mappedPaths, excludedPaths };
}
