import "server-only";

import { createHash } from "node:crypto";
import { normalizeTargetBranch, validateGithubOwnerRepo } from "@/lib/github-ref-name";
import { pickReadmeInstructions } from "@/lib/repo-readme-instructions";

const MAX_COMMIT_BYTES = 1_000_000;
const MAX_TREE_BYTES = 8_000_000;
const MAX_TREE_ENTRIES = 100_000;
const MAX_README_BYTES = 128_000;
const MAX_PATH_BYTES = 4_096;
const DEADLINE_MS = 10_000;
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

type PinnedTarget = Readonly<{ owner: string; repo: string; sourceRef: string; sourceCommit: string }>;

export type PinnedReadmeEvidence =
  | (Readonly<{ status: "present" } | { status: "blank" }> &
    Readonly<{ target: PinnedTarget; path: string; blobSha: string; text: string }>)
  | Readonly<{ status: "absent"; target: PinnedTarget }>
  | Readonly<{ status: "failure" }>;

type TreeEntry = Readonly<{ path: string; mode: "040000" | "160000"; sha: string }>
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

function isPinnedTarget({ owner, repo, sourceRef, sourceCommit }: PinnedTarget): boolean {
  if (typeof owner !== "string" || typeof repo !== "string" || owner.length > 100 || repo.length > 100
    || owner.trim() !== owner || repo.trim() !== repo || !validateGithubOwnerRepo(owner, repo)
    || typeof sourceRef !== "string" || sourceRef.length > 1_024 || !sourceRef.isWellFormed()
    || Buffer.byteLength(sourceRef, "utf8") > 1_024 || sourceRef === "" || !isSha(sourceCommit)) return false;
  const ref = normalizeTargetBranch(sourceRef);
  return ref.ok && ref.branch === sourceRef;
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

function verifyTree(raw: unknown, rootSha: string): Map<string, TreeEntry> {
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
  pinned: PinnedTarget, folder: string, signal?: AbortSignal,
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
    async function get(path: string, limit: number, accept = "application/vnd.github+json") {
      requestSignal.throwIfAborted();
      const response = await fetch(`${base}${path}`, {
        cache: "no-store", redirect: "error", signal: requestSignal,
        headers: { Authorization: `Bearer ${token}`, Accept: accept, "X-GitHub-Api-Version": "2022-11-28" },
      });
      if (requestSignal.aborted || response.status !== 200 || response.redirected) {
        void response.body?.cancel().catch(() => {});
        throw new Error("GitHub object unavailable");
      }
      return readBody(response, limit, requestSignal);
    }

    const commit: unknown = JSON.parse(utf8.decode(await get(`/commits/${sourceCommit}`, MAX_COMMIT_BYTES)));
    if (!isRecord(commit) || commit.sha !== sourceCommit || !isRecord(commit.tree) || !isSha(commit.tree.sha)) {
      return { status: "failure" };
    }
    const rootSha = commit.tree.sha;
    const tree: unknown = JSON.parse(utf8.decode(await get(`/trees/${rootSha}?recursive=1`, MAX_TREE_BYTES)));
    const entries = verifyTree(tree, rootSha);
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
    if (!pick) return { status: "absent", target };
    const tied = candidates.filter(({ path }) => path.localeCompare(pick.path) === 0);
    if (tied.length > 1 && pickReadmeInstructions(tied.reverse(), folder)?.path !== pick.path) {
      return { status: "failure" };
    }

    const entry = entries.get(pick.path);
    if (!entry || (entry.mode !== "100644" && entry.mode !== "100755") || entry.size > MAX_README_BYTES) {
      return { status: "failure" };
    }
    const bytes = await get(`/blobs/${entry.sha}`, entry.size, "application/vnd.github.raw+json");
    if (bytes.byteLength !== entry.size || gitObjectSha("blob", bytes) !== entry.sha) return { status: "failure" };
    const text = utf8.decode(bytes);
    if (text.includes("\0")) return { status: "failure" };
    return { status: text.trim() === "" ? "blank" : "present", target, path: entry.path, blobSha: entry.sha, text };
  } catch {
    return { status: "failure" };
  } finally {
    clearTimeout(deadline);
  }
}
