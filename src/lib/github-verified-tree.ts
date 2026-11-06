import "server-only";
import { createHash } from "node:crypto";
const MAX_TREE_ENTRIES = 100_000;
const MAX_PATH_BYTES = 4_096;
const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 256;
const TTL_MS = 30 * 60_000;
export type TreeEntry = Readonly<{ path: string; mode: "040000" | "160000"; sha: string }>
  | Readonly<{ path: string; mode: "100644" | "100755" | "120000"; sha: string; size: number }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSha(value: unknown): value is string {
  return typeof value === "string" && value.length === 40 && /^[0-9a-f]{40}$/.test(value);
}

function isExactPath(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_PATH_BYTES && value.isWellFormed()
    && Buffer.byteLength(value, "utf8") <= MAX_PATH_BYTES && !/[\\\u0000-\u001f\u007f]/.test(value)
    && value.split("/").every((part) => part.trim() !== "" && part !== "." && part !== ".." && part.toLowerCase() !== ".git");
}

function gitObjectSha(type: "tree" | "blob", bytes: Buffer): string {
  return createHash("sha1").update(`${type} ${bytes.byteLength}\0`).update(bytes).digest("hex");
}

function treeEntry(raw: unknown): TreeEntry {
  if (!isRecord(raw) || !isExactPath(raw.path) || !isSha(raw.sha)) throw new Error("Invalid tree entry");
  const { path, mode, sha, size, type } = raw;
  if ((type === "tree" && mode === "040000") || (type === "commit" && mode === "160000")) {
    if (size === undefined) return { path, mode, sha };
  } else if (type === "blob" && (mode === "100644" || mode === "100755" || mode === "120000")
    && typeof size === "number" && Number.isSafeInteger(size) && size >= 0) {
    return { path, mode, sha, size };
  }
  throw new Error("Invalid tree entry mode or size");
}

export function verifyGithubTree(raw: unknown, rootSha: string): Map<string, TreeEntry> {
  if (!isRecord(raw) || raw.sha !== rootSha || raw.truncated !== false
    || !Array.isArray(raw.tree) || raw.tree.length > MAX_TREE_ENTRIES) throw new Error("Incomplete tree response");

  const entries = new Map<string, TreeEntry>();
  const children = new Map<string, { order: Buffer; bytes: Buffer }[]>([["", []]]);
  for (const row of raw.tree) {
    const entry = treeEntry(row);
    if (entries.has(entry.path)) throw new Error("Duplicate tree path");
    entries.set(entry.path, entry);
    if (entry.mode === "040000") children.set(entry.path, []);
  }
  for (const { path, mode, sha } of entries.values()) {
    const slash = path.lastIndexOf("/");
    const parent = children.get(slash === -1 ? "" : path.slice(0, slash));
    if (!parent) throw new Error("Missing parent tree");
    const name = path.slice(slash + 1);
    // Git sorts tree names as if they ended in a slash and serializes mode 040000 as 40000.
    const directory = mode === "040000";
    parent.push({
      order: Buffer.from(directory ? `${name}/` : name),
      bytes: Buffer.concat([Buffer.from(`${directory ? "40000" : mode} ${name}\0`), Buffer.from(sha, "hex")]),
    });
  }
  for (const [path, rows] of children) {
    const bytes = Buffer.concat(rows.sort((left, right) => left.order.compare(right.order)).map((row) => row.bytes));
    if (gitObjectSha("tree", bytes) !== (path === "" ? rootSha : entries.get(path)?.sha)) {
      throw new Error("Tree object hash mismatch");
    }
  }
  return entries;
}

export type VerifiedTreeScope = Readonly<{ accountId: string; credential: string; owner: string; repo: string; rootSha: string }>;
type Entry = { rows: readonly TreeEntry[]; bytes: number; expires: number };
const cache = new Map<string, Entry>();
let retainedBytes = 0;
function key(scope: VerifiedTreeScope): string {
  return JSON.stringify([scope.accountId, scope.credential, scope.owner, scope.repo, scope.rootSha]);
}
function forget(id: string) {
  retainedBytes -= cache.get(id)?.bytes ?? 0;
  cache.delete(id);
}
/** Internal only: first authorize a live repository commit with this exact
 * credential and verify its root pointer. Never accept browser pins. */
export function reuseVerifiedGithubTree(scope: VerifiedTreeScope): Map<string, TreeEntry> | undefined {
  const id = key(scope);
  const hit = cache.get(id);
  if (!hit) return;
  if (hit.expires <= Date.now()) { forget(id); return; }
  cache.delete(id);
  cache.set(id, hit);
  return new Map(hit.rows.map((row) => [row.path, { ...row }]));
}
/** Verify before retaining; failures cannot poison prior entries. Copies detach
 * parser strings and prevent callers from mutating cached evidence. */
export function rememberVerifiedGithubTree(scope: VerifiedTreeScope, raw: unknown): Map<string, TreeEntry> {
  const entries = verifyGithubTree(raw, scope.rootSha);
  const id = key(scope);
  const rows = [...entries.values()].map((row) => ({
    ...row, path: Buffer.from(row.path).toString(), sha: Buffer.from(row.sha).toString(),
  }));
  const bytes = 2 * id.length + rows.reduce((sum, row) => sum + 2 * (row.path.length + row.sha.length) + 256, 0);
  if (!scope.accountId || !scope.credential || bytes > MAX_CACHE_BYTES) return entries;
  for (const [oldId, entry] of cache) if (entry.expires <= Date.now()) forget(oldId);
  forget(id);
  cache.set(id, { rows, bytes, expires: Date.now() + TTL_MS });
  retainedBytes += bytes;
  while (cache.size > MAX_CACHE_ENTRIES || retainedBytes > MAX_CACHE_BYTES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    forget(oldest);
  }
  return entries;
}
