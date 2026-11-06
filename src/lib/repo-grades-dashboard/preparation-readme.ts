import "server-only";

import { createHash } from "node:crypto";
import { normalizeTargetBranch, validateGithubOwnerRepo } from "@/lib/github-ref-name";
import { pickReadmeInstructions } from "@/lib/repo-readme-instructions";
import { rememberVerifiedGithubTree, reuseVerifiedGithubTree, verifyGithubTree } from "@/lib/github-verified-tree";
import { readVerifiedReadmeBlob } from "@/lib/github-verified-readme-blob";

const MAX_COMMIT_BYTES = 1_000_000;
const MAX_TREE_BYTES = 8_000_000;
const MAX_README_BYTES = 128_000;
const MAX_PATH_BYTES = 4_096;
const DEADLINE_MS = 10_000;
const README_CACHE_VERSION = "verified-readme-v1";
const MAX_CACHED_READMES = 256;
const MAX_CACHED_README_BYTES = 8 * 1024 * 1024;
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

type PinnedTarget = Readonly<{ owner: string; repo: string; sourceRef: string; sourceCommit: string }>;

type VerifiedReadme =
  | Readonly<{ status: "present" | "blank"; path: string; blobSha: string; text: string }>
  | Readonly<{ status: "absent" }>;

export type PinnedReadmeEvidence =
  | (VerifiedReadme & Readonly<{ target: PinnedTarget }>)
  | Readonly<{ status: "failure" }>;

const verifiedReadmes = new Map<string, { readme: VerifiedReadme; bytes: number }>();
let cachedReadmeBytes = 0;

function reuseVerifiedReadme(key: string) {
  const hit = verifiedReadmes.get(key);
  if (!hit) return undefined;
  verifiedReadmes.delete(key);
  verifiedReadmes.set(key, hit);
  return hit.readme;
}

function rememberVerifiedReadme(key: string, readme: VerifiedReadme) {
  const textUnits = readme.status === "absent" ? 0 : readme.path.length + readme.blobSha.length + readme.text.length;
  const bytes = 2 * (key.length + textUnits);
  // Retain only the selected path and SHA, even if the JSON parser shares
  // their string storage with the original tree payload.
  const stored = readme.status === "absent" ? readme : {
    ...readme, path: Buffer.from(readme.path).toString(), blobSha: Buffer.from(readme.blobSha).toString(),
  };
  cachedReadmeBytes -= verifiedReadmes.get(key)?.bytes ?? 0;
  verifiedReadmes.delete(key);
  verifiedReadmes.set(key, { readme: stored, bytes });
  cachedReadmeBytes += bytes;
  while (verifiedReadmes.size > MAX_CACHED_READMES || cachedReadmeBytes > MAX_CACHED_README_BYTES) {
    const oldest = verifiedReadmes.entries().next().value;
    if (!oldest) break;
    const [oldestKey, entry] = oldest;
    verifiedReadmes.delete(oldestKey);
    cachedReadmeBytes -= entry.bytes;
  }
}

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

function isPinnedTarget({ owner, repo, sourceRef, sourceCommit }: PinnedTarget): boolean {
  if (typeof owner !== "string" || typeof repo !== "string" || owner.length > 100 || repo.length > 100
    || owner.trim() !== owner || repo.trim() !== repo || !validateGithubOwnerRepo(owner, repo)
    || typeof sourceRef !== "string" || sourceRef.length > 1_024 || !sourceRef.isWellFormed()
    || Buffer.byteLength(sourceRef, "utf8") > 1_024 || sourceRef === "" || !isSha(sourceCommit)) return false;
  const ref = normalizeTargetBranch(sourceRef);
  return ref.ok && ref.branch === sourceRef;
}

async function readBody(response: Response, limit: number, signal: AbortSignal): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  let bytes = Buffer.allocUnsafe(Math.min(4_096, limit));
  let length = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) return bytes.subarray(0, length);
      const nextLength = length + value.byteLength;
      if (nextLength > limit) throw new Error("Response exceeds byte limit");
      if (nextLength > bytes.length) {
        const larger = Buffer.allocUnsafe(Math.min(limit, Math.max(nextLength, bytes.length * 2)));
        bytes.copy(larger, 0, 0, length);
        bytes = larger;
      }
      bytes.set(value, length);
      length = nextLength;
    }
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

/** Reads one server-pinned target. The caller owns authorization and target inventory. */
export async function readPinnedRepoGradeReadme(
  pinned: PinnedTarget, folder: string, signal?: AbortSignal, accountId?: string,
): Promise<PinnedReadmeEvidence> {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), DEADLINE_MS);
  const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    const { owner, repo, sourceRef, sourceCommit } = pinned;
    const target = Object.freeze({ owner, repo, sourceRef, sourceCommit });
    const token = process.env.GITHUB_TOKEN?.trim();
    if (!isPinnedTarget(target) || !isExactPath(folder) || !token) return { status: "failure" };
    const base = `https://api.github.com/repos/${owner}/${repo}/git`;
    async function get(path: string, limit: number, accept = "application/vnd.github+json", readSignal = requestSignal) {
      readSignal.throwIfAborted();
      const response = await fetch(`${base}${path}`, {
        cache: "no-store", redirect: "error", signal: readSignal,
        headers: { Authorization: `Bearer ${token}`, Accept: accept, "X-GitHub-Api-Version": "2022-11-28" },
      });
      if (readSignal.aborted || response.status !== 200 || response.redirected) {
        void response.body?.cancel().catch(() => {});
        throw new Error("GitHub object unavailable");
      }
      return readBody(response, limit, readSignal);
    }

    const commit: unknown = JSON.parse(utf8.decode(await get(`/commits/${sourceCommit}`, MAX_COMMIT_BYTES)));
    if (!isRecord(commit) || commit.sha !== sourceCommit || !isRecord(commit.tree) || !isSha(commit.tree.sha)) {
      return { status: "failure" };
    }
    const rootSha = commit.tree.sha;
    // Keep the live Git commit authorization check on every read. Only the
    // verified immutable contents for that exact repository and tree can be reused.
    const cacheKey = accountId && JSON.stringify([
      README_CACHE_VERSION, accountId, createHash("sha256").update(token).digest("hex"),
      owner, repo, sourceCommit, rootSha, folder,
    ]);
    requestSignal.throwIfAborted();
    const cached = cacheKey ? reuseVerifiedReadme(cacheKey) : undefined;
    if (cached) return { ...cached, target };
    function verified(readme: VerifiedReadme): PinnedReadmeEvidence {
      requestSignal.throwIfAborted();
      if (cacheKey) rememberVerifiedReadme(cacheKey, readme);
      return { ...readme, target };
    }

    const treeScope = accountId ? { accountId, owner, repo, rootSha,
      credential: createHash("sha256").update(`Bearer ${token}`).digest("hex") } : undefined;
    let entries = treeScope && reuseVerifiedGithubTree(treeScope);
    if (!entries) {
      const tree: unknown = JSON.parse(utf8.decode(await get(`/trees/${rootSha}?recursive=1`, MAX_TREE_BYTES)));
      requestSignal.throwIfAborted();
      entries = treeScope ? rememberVerifiedGithubTree(treeScope, tree) : verifyGithubTree(tree, rootSha);
    }
    for (let scope = folder; scope !== ""; scope = scope.slice(0, Math.max(0, scope.lastIndexOf("/")))) {
      const scopedEntry = entries.get(scope);
      if (scopedEntry && scopedEntry.mode !== "040000") return { status: "failure" };
    }

    // Give the existing picker nonempty placeholders to determine precedence
    // independently of content, then read only the winning object.
    const candidates = [...entries.values()]
      .filter(({ path, mode }) => mode !== "040000" && path.startsWith(`${folder}/`))
      .map(({ path }) => ({ path, content: "candidate" }));
    const pick = pickReadmeInstructions(candidates, folder);
    if (!pick) return verified({ status: "absent" });
    const tied = candidates.filter(({ path }) => path.localeCompare(pick.path) === 0);
    if (tied.length > 1 && pickReadmeInstructions(tied.reverse(), folder)?.path !== pick.path) {
      return { status: "failure" };
    }

    const entry = entries.get(pick.path);
    if (!entry || (entry.mode !== "100644" && entry.mode !== "100755") || entry.size > MAX_README_BYTES) {
      return { status: "failure" };
    }
    const text = await readVerifiedReadmeBlob(treeScope, entry,
      (readSignal) => get(`/blobs/${entry.sha}`, entry.size, "application/vnd.github.raw+json", readSignal), requestSignal);
    return verified({ status: text.trim() === "" ? "blank" : "present", path: entry.path, blobSha: entry.sha, text });
  } catch {
    return { status: "failure" };
  } finally {
    clearTimeout(deadline);
  }
}
