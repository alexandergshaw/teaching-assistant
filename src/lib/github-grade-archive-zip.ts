import "server-only";

import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { inflateRaw } from "node:zlib";
import type { RepoTreeEntry } from "./github.files";

const inflate = promisify(inflateRaw);
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const textUtf8 = new TextDecoder("utf-8", { fatal: true });
const MAX_ENTRIES = 8_000;
const MAX_PATH_BYTES = 4_096;
const MAX_EXPANDED_BYTES = 8 * 1024 * 1024;

type Member = { offset: number; compressedSize: number; size: number; method: number; regular: boolean };
export type GradeArchive = { bytes: Buffer; members: ReadonlyMap<string, Member>; retainedBytes: number };
export class GradeArchiveLimitError extends Error {}

function invalid(): never {
  throw new Error("Invalid GitHub repository archive.");
}

function endOfDirectory(bytes: Buffer): number {
  for (let pos = bytes.length - 22; pos >= Math.max(0, bytes.length - 22 - 0xffff); pos -= 1) {
    if (bytes.readUInt32LE(pos) === 0x06054b50 && pos + 22 + bytes.readUInt16LE(pos + 20) === bytes.length) return pos;
  }
  return invalid();
}

/** Index the original ZIP names (before any library can normalize or collapse
 * them). Source archives are single disk ZIP32; no filesystem extraction. */
export function indexGradeArchive(bytes: Buffer): GradeArchive {
  const end = endOfDirectory(bytes);
  const count = bytes.readUInt16LE(end + 10);
  const central = bytes.readUInt32LE(end + 16);
  if (bytes.readUInt32LE(end + 4) !== 0 || bytes.readUInt16LE(end + 8) !== count
    || count < 1 || count * 46 > end - central || central + bytes.readUInt32LE(end + 12) !== end) invalid();
  if (count > MAX_ENTRIES) throw new GradeArchiveLimitError("Repository archive exceeds the entry limit.");

  const members = new Map<string, Member>();
  const seen = new Set<string>();
  const ranges: { start: number; end: number }[] = [];
  let root: string | undefined;
  let retainedBytes = bytes.buffer.byteLength;
  let cursor = central;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > end || bytes.readUInt32LE(cursor) !== 0x02014b50) invalid();
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const size = bytes.readUInt32LE(cursor + 24);
    const nameSize = bytes.readUInt16LE(cursor + 28);
    const attributes = bytes.readUInt32LE(cursor + 38);
    const mode = bytes[cursor + 5] === 3 ? (attributes >>> 16) & 0o170000 : 0;
    const local = bytes.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameSize + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
    if (next > end || !nameSize || nameSize > MAX_PATH_BYTES || bytes.readUInt16LE(cursor + 34) !== 0
      || size === 0xffffffff || (flags & ~0x080e) !== 0 || (method !== 0 && method !== 8)
      || local + 30 > central || bytes.readUInt32LE(local) !== 0x04034b50
      || flags !== bytes.readUInt16LE(local + 6) || method !== bytes.readUInt16LE(local + 8)
      || nameSize !== bytes.readUInt16LE(local + 26)) invalid();
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameSize);
    const offset = local + 30 + nameSize + bytes.readUInt16LE(local + 28);
    if (offset + compressedSize > central || !rawName.equals(bytes.subarray(local + 30, local + 30 + nameSize))) invalid();
    if (!(flags & 8) && (compressedSize !== bytes.readUInt32LE(local + 18) || size !== bytes.readUInt32LE(local + 22))) invalid();
    ranges.push({ start: local, end: offset + compressedSize });
    cursor = next;

    const name = utf8.decode(rawName);
    const directory = name.endsWith("/");
    const parts = (directory ? name.slice(0, -1) : name).split("/");
    if (/[\\:\u0000-\u001f\u007f]/.test(name)
      || parts.some((part) => !part.trim() || part === "." || part === ".." || part.toLowerCase() === ".git")) invalid();
    const [prefix, ...relative] = parts;
    root ??= prefix;
    const path = relative.join("/");
    if (root !== prefix || (!path && !directory) || seen.has(path)) invalid();
    seen.add(path);
    retainedBytes += 2 * path.length + 256;
    if (!directory) {
      const regular = (attributes & 0x10) === 0 && (mode === 0 || mode === 0o100000);
      members.set(path, { offset, compressedSize, size, method, regular });
    }
  }
  if (cursor !== end) invalid();
  ranges.sort((a, b) => a.start - b.start);
  if (ranges.some((range, i) => i !== 0 && range.start < ranges[i - 1].end)) invalid();
  return { bytes, members, retainedBytes };
}

/** Archives may omit or substitute Git-tracked content. The pinned tree, not
 * the ZIP, declares which files and byte hashes are eligible for grading. */
export function isGradeBlob(file: RepoTreeEntry): boolean {
  return file.type === "blob" && (file.mode === "100644" || file.mode === "100755")
    && /^[a-f0-9]{40}$/.test(file.sha) && Number.isSafeInteger(file.size) && file.size >= 0;
}

export function verifyGradeBlob(bytes: Buffer, file: RepoTreeEntry): string {
  if (!isGradeBlob(file) || bytes.length !== file.size) return invalid();
  const blobSha = createHash("sha1").update(`blob ${file.size}\0`).update(bytes).digest("hex");
  if (blobSha !== file.sha) return invalid();
  const text = textUtf8.decode(bytes);
  if (text.includes("\0") || /^version https:\/\/git-lfs\.github\.com\/spec\/v1\r?\n/.test(text)) return invalid();
  return text;
}

export async function verifyGradeArchiveFiles(
  archive: GradeArchive, files: readonly RepoTreeEntry[], signal: AbortSignal,
): Promise<ReadonlyMap<string, string>> {
  const verified = new Map<string, string>();
  let expanded = 0;
  for (const file of files) {
    signal.throwIfAborted();
    const member = archive.members.get(file.path);
    if (!member?.regular || !isGradeBlob(file) || member.size !== file.size
      || verified.has(file.path) || (expanded += file.size) > MAX_EXPANDED_BYTES) invalid();
    const compressed = archive.bytes.subarray(member.offset, member.offset + member.compressedSize);
    // Bound native inflation even when the ZIP header deliberately lies low.
    const bytes = member.method === 0 ? compressed : await inflate(compressed, { maxOutputLength: Math.max(1, file.size) });
    signal.throwIfAborted();
    verified.set(file.path, verifyGradeBlob(bytes, file));
  }
  return verified;
}
