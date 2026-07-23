// Branch and commit history operations.

import { ghFetch, ghJson } from "./github.repos";

export async function createBranch(owner: string, repo: string, newBranch: string, fromBranch: string): Promise<void> {
  const ref = await ghJson<{ object?: { sha?: string } }>(
    `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(fromBranch)}`
  );
  const sha = ref.object?.sha;
  if (!sha) throw new Error(`Could not resolve branch "${fromBranch}".`);
  await ghFetch(`/repos/${owner}/${repo}/git/refs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: `refs/heads/${newBranch}`, sha }),
  });
}

/** Delete a branch. */
export async function deleteBranch(owner: string, repo: string, branch: string): Promise<void> {
  await ghFetch(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { method: "DELETE" });
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
  htmlUrl: string;
}

/** Recent commits on `ref` (default branch when omitted). */
export async function listCommits(owner: string, repo: string, ref?: string, perPage = 30): Promise<CommitInfo[]> {
  const data = await ghJson<
    Array<{ sha?: string; html_url?: string; commit?: { message?: string; author?: { name?: string; date?: string } } }>
  >(`/repos/${owner}/${repo}/commits?per_page=${perPage}${ref ? `&sha=${encodeURIComponent(ref)}` : ""}`);
  return data
    .filter((c) => c.sha)
    .map((c) => ({
      sha: c.sha as string,
      message: (c.commit?.message ?? "").split("\n")[0],
      author: c.commit?.author?.name ?? "",
      date: c.commit?.author?.date ?? "",
      htmlUrl: c.html_url ?? "",
    }));
}
