import { inspectLargeZipDirectory, type LargeZipMember } from "./recoverable-zip-directory";
import { streamLargeZipMember } from "./stream-large-zip-member";
import JSZip from "jszip";
import { GUARDED_TEXT_EXTENSIONS } from "@/lib/guarded-text-formats";
import { validateGuardedZipText } from "./validate-guarded-zip-text";

const MAX_PROJECT_ARCHIVE_BYTES = 80 * 1024 * 1024;
const MAX_PROJECT_FILES = 1000;
const artifactExtensions = new Set(["obj", "pdb", "ilk", "idb", "ipch", "tlog", "vsidx", "suo", "wsuo", "lastbuildstate"]);
const sourceExtensions = new Set(["c", "cc", "cpp", "cxx", "h", "hpp", "txt", "md", "markdown", "csv", "tsv", "json", "xml", "vcxproj", "sln", "slnx", "filters", "props", "targets", "docx", "doc", "pdf", "ppt", "pptx", "xls", "xlsx", "odt", "odp", "ods", "rtf", "ipynb", "py", "js", "jsx", "ts", "tsx", "java", "cs", "css", "html", "htm", "yml", "yaml", "sql", "png", "jpg", "jpeg", "webp", "heic", "heif"]);
export function isBrightspaceProjectSource(path: string): boolean { const ext = path.split(".").pop()?.toLowerCase() ?? ""; return sourceExtensions.has(ext) || GUARDED_TEXT_EXTENSIONS.has(ext); }

export type ProjectFileDisposition = "retain" | "candidate-build-artifact" | "course-fixture" | "needs-review";
export interface ProjectInventoryFile { readonly path: string; readonly declaredBytes: number; readonly disposition: ProjectFileDisposition }
export type ProjectInventory = { readonly ok: true; readonly files: readonly ProjectInventoryFile[] } | { readonly ok: false; readonly reason: string };

async function readProject(source: Blob, outer: LargeZipMember): Promise<{ ok: true; blob: Blob } | { ok: false; reason: string }> {
  if (!outer.nestedArchive || outer.declaredBytes > MAX_PROJECT_ARCHIVE_BYTES) return { ok: false, reason: "nested archive exceeds the project inspection limit" };
  const chunks: ArrayBuffer[] = []; let total = 0;
  const staged = await streamLargeZipMember(source, outer, {
    async write(chunk) { total += chunk.length; if (total > MAX_PROJECT_ARCHIVE_BYTES) throw new Error("nested archive exceeds the project inspection limit"); chunks.push(chunk.slice().buffer as ArrayBuffer); },
    async commit() {}, async abort() { chunks.length = 0; },
  });
  if (!staged.ok) return { ok: false, reason: staged.reason };
  return { ok: true, blob: new Blob(chunks) };
}

/** Inventory only. No project file is executed, extracted for grading, or silently excluded. */
export async function inspectBrightspaceProject(source: Blob, outer: LargeZipMember): Promise<ProjectInventory> {
  const project = await readProject(source, outer); if (!project.ok) return project;
  return inspectProjectBlob(project.blob);
}

async function inspectProjectBlob(blob: Blob): Promise<ProjectInventory> {
  const nested = await inspectLargeZipDirectory(blob);
  if (!nested.ok) return { ok: false, reason: `nested archive could not be inventoried: ${nested.reason}` };
  if (nested.members.length > MAX_PROJECT_FILES) return { ok: false, reason: "nested project has too many files" };
  const files: ProjectInventoryFile[] = [];
  for (const member of nested.members) {
    const extension = member.path.split(".").pop()?.toLowerCase() ?? "";
    let disposition: ProjectFileDisposition = member.nestedArchive ? "needs-review" : sourceExtensions.has(extension) ? "retain" : artifactExtensions.has(extension) ? "candidate-build-artifact" : "needs-review";
    // These extensions are admitted as text only after a full CRC check and
    // strict UTF-8 validation; retain the student's original filename.
    if (GUARDED_TEXT_EXTENSIONS.has(extension) && await validateGuardedZipText(blob, member)) disposition = "retain";
    // Only the exact published course dataset may be represented by provenance.
    if (extension === "csv" && member.declaredBytes === 2_039_946 && crypto.subtle) {
      const parts: Uint8Array[] = [];
      const read = await streamLargeZipMember(blob, member, { async write(chunk) { parts.push(chunk.slice()); }, async commit() {}, async abort() { parts.length = 0; } });
      if (!read.ok) return { ok: false, reason: "course dataset could not be verified" };
      const digest = await crypto.subtle.digest("SHA-256", await new Blob(parts as BlobPart[]).arrayBuffer());
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (hash === "8a4203bb40c1f023676f79060da104ff316509faf2db226db3915ee5a096e90d") disposition = "course-fixture";
    }
    files.push({ path: member.path, declaredBytes: member.declaredBytes, disposition });
  }
  return { ok: true, files };
}

/** Rebuild one reviewed project while retaining every source file. Exclusions must match the entire displayed non-source inventory. */
export async function buildReviewedBrightspaceProject(source: Blob, outer: LargeZipMember, excludedPaths: readonly string[]): Promise<{ ok: true; archive: Blob; retainedPaths: readonly string[]; excludedPaths: readonly string[] } | { ok: false; reason: string }> {
  const project = await readProject(source, outer); if (!project.ok) return project;
  const inventory = await inspectProjectBlob(project.blob); if (!inventory.ok) return inventory;
  if (inventory.files.some((file) => file.disposition === "needs-review")) return { ok: false, reason: "project contains unclassified files that cannot be safely excluded" };
  const excluded = new Set(excludedPaths), expected = inventory.files.filter((file) => file.disposition === "candidate-build-artifact" || file.disposition === "course-fixture");
  if (excluded.size !== excludedPaths.length || excluded.size !== expected.length || expected.some((file) => !excluded.has(file.path))) return { ok: false, reason: "project exclusions must be explicitly reviewed" };
  const retained = inventory.files.filter((file) => file.disposition === "retain");
  if (!retained.some((file) => /\.(?:c|cc|cpp|cxx|h|hpp|py|js|ts)$/i.test(file.path))) return { ok: false, reason: "no supported source code was found in this project" };
  if (retained.reduce((total, file) => total + file.declaredBytes, 0) > 40 * 1024 * 1024 || retained.some((file) => file.declaredBytes > 40 * 1024 * 1024)) return { ok: false, reason: "retained project files exceed the safe extraction limit" };
  const nested = await inspectLargeZipDirectory(project.blob); if (!nested.ok) return { ok: false, reason: "nested project could not be rechecked" };
  const zip = new JSZip();
  for (const file of retained) {
    const member = nested.members.find((item) => item.path === file.path); if (!member) return { ok: false, reason: "project inventory changed" };
    if (member.declaredBytes === 0 && member.compressedBytes === 0 && member.crc === 0 && member.method === 0) { zip.file(file.path, new Uint8Array()); continue; }
    const parts: ArrayBuffer[] = [];
    const result = await streamLargeZipMember(project.blob, member, { async write(chunk) { parts.push(chunk.slice().buffer as ArrayBuffer); }, async commit() {}, async abort() { parts.length = 0; } });
    if (!result.ok) return result;
    zip.file(file.path, await new Blob(parts).arrayBuffer());
  }
  return { ok: true, archive: new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "STORE" })).buffer]), retainedPaths: retained.map((file) => file.path), excludedPaths: expected.map((file) => file.path) };
}
