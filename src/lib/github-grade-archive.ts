import "server-only";

import { createHash } from "node:crypto";
import { SCOPED_BUDGET } from "./github.digest";
import { validateGithubOwnerRepo } from "./github-ref-name";
import { githubRestHeaders, isGithubCommitSha } from "./github.repos";
import { GradeArchiveLimitError, indexGradeArchive, isGradeBlob, verifyGradeArchiveFiles, verifyGradeBlob, type GradeArchive } from "./github-grade-archive-zip";
import type { RepoTreeEntry } from "./github.files";

const MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024;
const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 8;
const ARCHIVE_CACHE_TTL_MS = 60 * 60_000;
const OVERSIZED_ARCHIVE_CACHE_TTL_MS = 60_000;
const ARCHIVE_TIMEOUT_MS = 15_000;
const SOURCE_READ_TIMEOUT_MS = 40_000;
const DIRECT_BLOB_COUNT = 2;
const MAX_FALLBACK_BYTES = 8 * 1024 * 1024;
const cache = new Map<string, { archive: GradeArchive | null; expires: number }>();
const retryAfterByCredential = new Map<string, number>();
let cacheBytes = 0;

function unavailable(): never {
  throw new Error("The pinned GitHub repository archive could not be read.");
}

function cancel(body: { cancel(): Promise<unknown> } | null) {
  void body?.cancel().catch(() => undefined);
}

function checkCooldown(credential: string) {
  const retryAt = retryAfterByCredential.get(credential);
  if (retryAt === undefined) return;
  if (retryAt > Date.now()) return unavailable();
  retryAfterByCredential.delete(credential);
}

function observeQuota(response: Response, credential: string) {
  const remaining = response.headers.get("x-ratelimit-remaining");
  const retryAfter = response.headers.get("retry-after");
  // Secondary GitHub limits may be a bare 403 even with primary quota left.
  // Treat that response conservatively as a short local cooldown, without
  // classifying it as a confirmed throttle or retrying the denied operation.
  if (remaining !== "0" && response.status !== 403 && response.status !== 429
    && !(response.status === 503 && retryAfter !== null)) return;
  const now = Date.now();
  const reset = Number(response.headers.get("x-ratelimit-reset")) * 1_000;
  const retryAt = retryAfter && /^\d+$/.test(retryAfter) ? now + Number(retryAfter) * 1_000
    : Date.parse(retryAfter ?? "");
  const supplied = Math.max(remaining === "0" && Number.isFinite(reset) ? reset : 0, Number.isFinite(retryAt) ? retryAt : 0);
  retryAfterByCredential.set(credential, Math.max(retryAfterByCredential.get(credential) ?? 0, supplied > now ? supplied : now + 60_000));
  if (retryAfterByCredential.size > MAX_CACHE_ENTRIES * 2) {
    const oldest = retryAfterByCredential.keys().next().value;
    if (oldest !== undefined) retryAfterByCredential.delete(oldest);
  }
}

async function readBody(response: Response, signal: AbortSignal, cap: number, overLimit: () => never): Promise<Buffer> {
  const contentLength = response.headers.get("content-length");
  if (response.status !== 200 || response.redirected || signal.aborted
    || (contentLength !== null && !/^\d+$/.test(contentLength))) {
    cancel(response.body);
    return unavailable();
  }
  if (!response.headers.has("content-encoding") && contentLength !== null && Number(contentLength) > cap) {
    cancel(response.body);
    return overLimit();
  }
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const onAbort = () => cancel(reader);
  signal.addEventListener("abort", onAbort, { once: true });
  let bytes = Buffer.alloc(Math.min(4_096, cap));
  let length = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) return bytes.subarray(0, length);
      const next = length + value.length;
      if (next > cap) return overLimit();
      if (next > bytes.length) {
        const grown = Buffer.alloc(Math.min(cap, Math.max(next, bytes.length * 2)));
        bytes.copy(grown, 0, 0, length);
        bytes = grown;
      }
      bytes.set(value, length);
      length = next;
    }
  } catch (error) {
    cancel(reader);
    throw error;
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

async function downloadArchive(owner: string, repo: string, sha: string, headers: HeadersInit, credential: string, signal: AbortSignal) {
  checkCooldown(credential);
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/zipball/${sha}`, {
    headers, signal, redirect: "manual", cache: "no-store",
  });
  observeQuota(response, credential);
  cancel(response.body);
  const location = response.headers.get("location");
  if (response.status !== 302 || response.redirected || !location) return unavailable();
  // Private archive URLs contain temporary credentials. Never forward our
  // REST token, follow another redirect, or disclose the download URL.
  const target = new URL(location);
  if (target.origin !== "https://codeload.github.com" || target.username || target.password || target.hash) return unavailable();
  signal.throwIfAborted();
  const payload = await fetch(target.href, { signal, redirect: "manual", cache: "no-store" });
  observeQuota(payload, credential);
  return indexGradeArchive(await readBody(payload, signal, MAX_DOWNLOAD_BYTES, () => {
    throw new GradeArchiveLimitError("Repository archive exceeds the download limit.");
  }));
}

async function readBlobs(
  owner: string, repo: string, files: readonly RepoTreeEntry[], headers: HeadersInit, credential: string, signal: AbortSignal,
): Promise<ReadonlyMap<string, string>> {
  if (files.length > SCOPED_BUDGET.maxFiles || files.some((file) => !isGradeBlob(file) || file.size >= SCOPED_BUDGET.maxBlobBytes)
    || files.reduce((total, file) => total + file.size, 0) > MAX_FALLBACK_BYTES) return unavailable();
  const contents = new Map<string, string>();
  const blobs = new Map<string, { size: number; text: string }>();
  const rawHeaders = new Headers(headers);
  rawHeaders.set("Accept", "application/vnd.github.raw+json");
  for (const file of files) {
    signal.throwIfAborted();
    if (contents.has(file.path)) return unavailable();
    const prior = blobs.get(file.sha);
    if (prior) {
      if (prior.size !== file.size) return unavailable();
      contents.set(file.path, prior.text);
      continue;
    }
    checkCooldown(credential);
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs/${file.sha}`, {
      headers: rawHeaders, signal, redirect: "manual", cache: "no-store",
    });
    observeQuota(response, credential);
    const text = verifyGradeBlob(await readBody(response, signal, file.size, unavailable), file);
    blobs.set(file.sha, { size: file.size, text });
    contents.set(file.path, text);
  }
  return contents;
}

function forget(key: string) {
  cacheBytes -= cache.get(key)?.archive?.retainedBytes ?? 0;
  cache.delete(key);
}

function remember(key: string, archive: GradeArchive | null) {
  const bytes = archive?.retainedBytes ?? 0;
  if (bytes > MAX_CACHE_BYTES) return;
  forget(key);
  const ttl = archive ? ARCHIVE_CACHE_TTL_MS : OVERSIZED_ARCHIVE_CACHE_TTL_MS;
  cache.set(key, { archive, expires: Date.now() + ttl });
  cacheBytes += bytes;
  while (cache.size > MAX_CACHE_ENTRIES || cacheBytes > MAX_CACHE_BYTES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    forget(oldest);
  }
}

/** Called only after the admitted grader has made a live, authorized read of
 * this repository's pinned tree. Every requested member is reverified even
 * when the compressed archive can be reused across folders. */
export function makePinnedArchiveReader(scope: { accountId: string; owner: string; repo: string; sha: string }) {
  return async (files: readonly RepoTreeEntry[], callerSignal?: AbortSignal): Promise<ReadonlyMap<string, string>> => {
    const { accountId, owner, repo, sha } = scope;
    if (!accountId || !validateGithubOwnerRepo(owner, repo) || !isGithubCommitSha(sha)) return unavailable();
    const timeout = AbortSignal.timeout(SOURCE_READ_TIMEOUT_MS);
    const signal = callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout;
    signal.throwIfAborted();
    const headers = githubRestHeaders();
    const credential = createHash("sha256").update(headers.Authorization).digest("hex");
    const key = JSON.stringify([accountId, credential, owner, repo, sha]);
    const now = Date.now();
    for (const [id, item] of cache) if (item.expires <= now) forget(id);
    const cached = cache.get(key);
    if (cached?.archive) return verifyGradeArchiveFiles(cached.archive, files, signal);
    if (cached || files.length <= DIRECT_BLOB_COUNT) return readBlobs(owner, repo, files, headers, credential, signal);
    let archive: GradeArchive;
    try {
      archive = await downloadArchive(owner, repo, sha, headers, credential, AbortSignal.any([signal, AbortSignal.timeout(ARCHIVE_TIMEOUT_MS)]));
    } catch (error) {
      // A small folder in a large repo can still fit the grading budget.
      // Only explicit archive-size refusals permit the bounded raw-blob route.
      // Never fan out after auth, integrity, timeout, or throttle failures.
      if (!(error instanceof GradeArchiveLimitError)) throw error;
      remember(key, null);
      return readBlobs(owner, repo, files, headers, credential, signal);
    }
    const verified = await verifyGradeArchiveFiles(archive, files, signal);
    remember(key, archive);
    return verified;
  };
}
