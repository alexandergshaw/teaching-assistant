import "server-only";

import { createHash } from "node:crypto";

const MAX_BLOB_BYTES = 128_000;
const MAX_CACHE_BYTES = 8 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 256;
const TTL_MS = 30 * 60_000;
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
type Scope = Readonly<{ accountId: string; credential: string }>;
type Blob = Readonly<{ sha: string; size: number }>;
type Entry = { text: string; bytes: number; expires: number };
const cache = new Map<string, Entry>();
let retainedBytes = 0;

function forget(key: string) {
  retainedBytes -= cache.get(key)?.bytes ?? 0;
  cache.delete(key);
}

/** Internal only: call after fresh authorization of the target commit and
 * verified tree membership of the selected regular README file. Only immutable
 * text is shared; each caller must construct its own target/path evidence. */
export async function readVerifiedReadmeBlob(
  scope: Scope | undefined, blob: Blob, load: () => Promise<Buffer>, signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  const { sha: expectedSha, size: expectedSize } = blob;
  if (!/^[a-f0-9]{40}$/.test(expectedSha) || !Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > MAX_BLOB_BYTES) {
    throw new Error("Invalid README blob");
  }
  const key = scope?.accountId && scope.credential
    ? JSON.stringify([scope.accountId, scope.credential, expectedSha, expectedSize]) : undefined;
  const cached = key ? cache.get(key) : undefined;
  if (cached && cached.expires > Date.now()) {
    cache.delete(key!);
    cache.set(key!, cached);
    return cached.text;
  }
  if (cached && key) forget(key);
  // Do not retain pending loads or errors: one caller's abort cannot poison a
  // peer, and a failed or malformed response must be read again on retry.
  const bytes = await load();
  signal.throwIfAborted();
  const sha = createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
  if (bytes.byteLength !== expectedSize || sha !== expectedSha) throw new Error("README blob hash or size mismatch");
  const text = utf8.decode(bytes);
  if (text.includes("\0")) throw new Error("Invalid README text");
  if (key) {
    const retained = 2 * (key.length + text.length) + 128;
    for (const [oldKey, entry] of cache) if (entry.expires <= Date.now()) forget(oldKey);
    if (retained <= MAX_CACHE_BYTES) {
      forget(key);
      cache.set(key, { text, bytes: retained, expires: Date.now() + TTL_MS });
      retainedBytes += retained;
      while (cache.size > MAX_CACHE_ENTRIES || retainedBytes > MAX_CACHE_BYTES) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined) break;
        forget(oldest);
      }
    }
  }
  return text;
}
