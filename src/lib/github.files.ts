// File operations: read, write, bulk delete/move via Git Data API.

import { getRepo } from "./github.repos";
import { ghFetch, ghJson } from "./github.repos";

const encodePath = (path: string): string => path.split("/").map(encodeURIComponent).join("/");

export interface RepoTreeEntry {
  path: string;
  type: "blob" | "tree";
  size: number;
  sha: string;
  mode?: string;
}

/** The full recursive file tree of a repo at `ref` (default branch when omitted). */
export async function getRepoTree(owner: string, repo: string, ref?: string): Promise<RepoTreeEntry[]> {
  const branch = ref || (await getRepo(owner, repo)).defaultBranch;
  const data = await ghJson<{ tree?: Array<{ path?: string; type?: string; size?: number; sha?: string; mode?: string }> }>(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
  );
  return (data.tree ?? [])
    .filter((t): t is { path: string; type: "blob" | "tree"; size?: number; sha?: string; mode?: string } => !!t.path && (t.type === "blob" || t.type === "tree"))
    .map((t) => ({ path: t.path, type: t.type, size: t.size ?? 0, sha: t.sha ?? "", mode: t.mode }));
}

/** Read one file's text content (raw). */
export async function getFileText(owner: string, repo: string, path: string, ref?: string): Promise<string> {
  const res = await ghFetch(
    `/repos/${owner}/${repo}/contents/${encodePath(path)}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`,
    { headers: { Accept: "application/vnd.github.raw" } }
  );
  return res.text();
}

/** Create or update a file (committed on `branch`, or the default branch). */
export async function putFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch?: string
): Promise<void> {
  let sha: string | undefined;
  try {
    const existing = await ghJson<{ sha?: string }>(
      `/repos/${owner}/${repo}/contents/${encodePath(path)}${branch ? `?ref=${encodeURIComponent(branch)}` : ""}`
    );
    sha = existing.sha;
  } catch {
    /* 404 — the file doesn't exist yet, so create it */
  }
  await ghFetch(`/repos/${owner}/${repo}/contents/${encodePath(path)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      ...(sha ? { sha } : {}),
      ...(branch ? { branch } : {}),
    }),
  });
}

// ── Bulk file operations (delete / move via the Git Data API) ─────────────────
//
// Deleting or moving many files one-by-one via the contents API would be one
// commit per file. Instead build a single tree off the branch head and commit it
// once, so a bulk delete or move is atomic and shows as one commit. Moves reuse
// the existing blob sha (no content re-upload).

interface TreeChange {
  path: string;
  mode: "100644";
  type: "blob";
  sha: string | null;
}

/** Commit a set of tree changes (move/add via blob sha, delete via sha null) in one commit on `branch`. */
async function commitTreeChanges(
  owner: string,
  repo: string,
  branch: string,
  changes: TreeChange[],
  message: string
): Promise<void> {
  const ref = await ghJson<{ object?: { sha?: string } }>(
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`
  );
  const baseSha = ref.object?.sha;
  if (!baseSha) throw new Error(`Could not read the head of branch "${branch}".`);
  const baseCommit = await ghJson<{ tree?: { sha?: string } }>(
    `/repos/${owner}/${repo}/git/commits/${baseSha}`
  );
  const baseTree = baseCommit.tree?.sha;
  if (!baseTree) throw new Error("Could not read the base tree for the commit.");
  const newTree = await ghJson<{ sha?: string }>(`/repos/${owner}/${repo}/git/trees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base_tree: baseTree, tree: changes }),
  });
  if (!newTree.sha) throw new Error("GitHub did not return a new tree.");
  const newCommit = await ghJson<{ sha?: string }>(`/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, tree: newTree.sha, parents: [baseSha] }),
  });
  if (!newCommit.sha) throw new Error("GitHub did not return a new commit.");
  await ghFetch(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha: newCommit.sha }),
  });
}

/** Trim surrounding slashes and whitespace from a repo path. */
function cleanRepoPath(p: string): string {
  return p.trim().replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Delete files and folders in one commit. A path that names a folder deletes every
 * blob beneath it. Returns how many blobs were removed.
 */
export async function deletePaths(
  owner: string,
  repo: string,
  branch: string,
  paths: string[],
  message: string
): Promise<{ deleted: number }> {
  const tree = await getRepoTree(owner, repo, branch);
  const blobs = tree.filter((e) => e.type === "blob");
  const targets = new Set<string>();
  for (const raw of paths) {
    const p = cleanRepoPath(raw);
    if (!p) continue;
    for (const b of blobs) {
      if (b.path === p || b.path.startsWith(`${p}/`)) targets.add(b.path);
    }
  }
  if (targets.size === 0) return { deleted: 0 };
  const changes: TreeChange[] = [...targets].map((path) => ({ path, mode: "100644", type: "blob", sha: null }));
  await commitTreeChanges(owner, repo, branch, changes, message);
  return { deleted: targets.size };
}

/**
 * Move/rename files and folders in one commit. Each move rewrites a blob (or every
 * blob under a folder prefix) from `from` to `to`, reusing the existing blob sha.
 * Returns how many blobs were moved.
 */
export async function movePaths(
  owner: string,
  repo: string,
  branch: string,
  moves: Array<{ from: string; to: string }>,
  message: string
): Promise<{ moved: number }> {
  const tree = await getRepoTree(owner, repo, branch);
  const blobs = tree.filter((e) => e.type === "blob");
  const changes: TreeChange[] = [];
  const moved = new Set<string>();
  for (const move of moves) {
    const from = cleanRepoPath(move.from);
    const to = cleanRepoPath(move.to);
    if (!from || !to || from === to) continue;
    for (const b of blobs) {
      if (moved.has(b.path)) continue;
      let newPath: string | null = null;
      if (b.path === from) newPath = to;
      else if (b.path.startsWith(`${from}/`)) newPath = `${to}${b.path.slice(from.length)}`;
      if (newPath && b.sha) {
        moved.add(b.path);
        changes.push({ path: newPath, mode: "100644", type: "blob", sha: b.sha });
        changes.push({ path: b.path, mode: "100644", type: "blob", sha: null });
      }
    }
  }
  if (changes.length === 0) return { moved: 0 };
  await commitTreeChanges(owner, repo, branch, changes, message);
  return { moved: moved.size };
}
