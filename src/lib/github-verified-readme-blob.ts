import "server-only";

import { createHash } from "node:crypto";

const MAX_BLOB_BYTES = 128_000;
const MAX_CACHE_BYTES = 8 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 256;
const TTL_MS = 30 * 60_000;
const MAX_PENDING_READS = 32;
const MAX_WAITERS_PER_READ = 128;
const READ_TIMEOUT_MS = 10_000;
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
type Scope = Readonly<{ accountId: string; credential: string }>;
type Blob = Readonly<{ sha: string; size: number }>;
type Entry = { text: string; bytes: number; expires: number };
const cache = new Map<string, Entry>();
type Pending = { promise: Promise<string>; controller: AbortController; waiters: number; settled: boolean };
const pending = new Map<string, Pending>();
let retainedBytes = 0;

function forget(key: string) {
  retainedBytes -= cache.get(key)?.bytes ?? 0;
  cache.delete(key);
}

async function untilAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  const aborted = Promise.withResolvers<never>();
  const onAbort = () => aborted.reject(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  if (signal.aborted) onAbort();
  try {
    const value = await Promise.race([promise, aborted.promise]);
    signal.throwIfAborted();
    return value;
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

async function join(key: string, work: Pending, signal: AbortSignal): Promise<string> {
  if (work.waiters >= MAX_WAITERS_PER_READ) throw new Error("README read capacity exhausted");
  work.waiters += 1;
  let released = false;
  function release() {
    if (released) return;
    released = true;
    work.waiters -= 1;
    if (!work.waiters && !work.settled) {
      if (pending.get(key) === work) pending.delete(key);
      work.controller.abort();
    }
  }
  signal.addEventListener("abort", release, { once: true });
  if (signal.aborted) release();
  try {
    return await untilAbort(work.promise, signal);
  } finally {
    signal.removeEventListener("abort", release);
    release();
  }
}

/** Internal only: call after fresh authorization of the target commit and
 * verified tree membership of the selected regular README file. Only immutable
 * text is shared; each caller must construct its own target/path evidence. */
export async function readVerifiedReadmeBlob(
  scope: Scope | undefined, blob: Blob, load: (readSignal: AbortSignal) => Promise<Buffer>, signal: AbortSignal,
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
  async function read(readSignal: AbortSignal) {
    readSignal.throwIfAborted();
    const bytes = await untilAbort(load(readSignal), readSignal);
    readSignal.throwIfAborted();
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
  if (!key) return read(signal);
  const existing = pending.get(key);
  if (existing) return join(key, existing, signal);
  if (pending.size >= MAX_PENDING_READS) throw new Error("README read capacity exhausted");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  const work: Pending = { controller, waiters: 0, settled: false, promise: Promise.resolve("") };
  // Delay dispatch until the initiating waiter is registered. The shared load
  // has its own lifetime; cancelling one waiter never cancels another's read.
  work.promise = Promise.resolve().then(() => read(controller.signal)).finally(() => {
    work.settled = true;
    clearTimeout(timeout);
    if (pending.get(key) === work) pending.delete(key);
  });
  pending.set(key, work);
  return join(key, work, signal);
}
