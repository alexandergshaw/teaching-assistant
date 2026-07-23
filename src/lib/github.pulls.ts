// Pull request operations: list, merge, review, and file changes.

import { ghFetch, ghJson, ghError, githubToken } from "./github.repos";

const GITHUB_GRAPHQL = "https://api.github.com/graphql";

/** Minimal GitHub GraphQL POST using the same token as the REST client. */
async function ghGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(GITHUB_GRAPHQL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubToken()}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(ghError(res.status, await res.text().catch(() => "")));
  }
  const body = (await res.json()) as { data?: T; errors?: Array<{ message?: string }> };
  if (body.errors && body.errors.length > 0) {
    throw new Error(`GitHub GraphQL error: ${body.errors.map((e) => e.message).filter(Boolean).join("; ")}`);
  }
  if (!body.data) throw new Error("GitHub GraphQL returned no data.");
  return body.data;
}

export interface PullRequestInfo {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  head: string;
  base: string;
  draft: boolean;
  user: string;
}

export async function listPullRequests(
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "open"
): Promise<PullRequestInfo[]> {
  const data = await ghJson<
    Array<{
      number?: number; title?: string; state?: string; html_url?: string;
      head?: { ref?: string }; base?: { ref?: string }; draft?: boolean; user?: { login?: string };
    }>
  >(`/repos/${owner}/${repo}/pulls?state=${state}&per_page=50`);
  return data
    .filter((p) => typeof p.number === "number")
    .map((p) => ({
      number: p.number as number,
      title: p.title ?? "",
      state: p.state ?? "",
      htmlUrl: p.html_url ?? "",
      head: p.head?.ref ?? "",
      base: p.base?.ref ?? "",
      draft: !!p.draft,
      user: p.user?.login ?? "",
    }));
}

export async function mergePullRequest(
  owner: string,
  repo: string,
  prNumber: number,
  method: "merge" | "squash" | "rebase" = "merge"
): Promise<void> {
  await ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/merge`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merge_method: method }),
  });
}

/** Mark a draft pull request as ready for review. */
export async function markPullRequestReady(owner: string, repo: string, prNumber: number): Promise<void> {
  // Query to get the PR's id and check if it is a draft
  const queryData = await ghGraphql<{
    repository?: { pullRequest?: { id?: string; isDraft?: boolean } };
  }>(
    `query($owner: String!, $repo: String!, $number: Int!) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $number) {
          id
          isDraft
        }
      }
    }`,
    { owner, repo, number: prNumber }
  );

  const pr = queryData.repository?.pullRequest;
  if (!pr || !pr.id) {
    throw new Error("Pull request not found.");
  }

  if (!pr.isDraft) {
    return;
  }

  // Mutation to mark as ready for review
  await ghGraphql<{ markPullRequestReadyForReview?: { pullRequest?: { isDraft?: boolean } } }>(
    `mutation($id: ID!) {
      markPullRequestReadyForReview(input: { pullRequestId: $id }) {
        pullRequest {
          isDraft
        }
      }
    }`,
    { id: pr.id }
  );
}

export interface PullRequestReviewInfo {
  id: number;
  user: string;
  /** APPROVED | CHANGES_REQUESTED | COMMENTED | DISMISSED | PENDING */
  state: string;
  submittedAt: string | null;
}

/** Reviews submitted on a PR, in chronological order. */
export async function listPullRequestReviews(
  owner: string,
  repo: string,
  prNumber: number
): Promise<PullRequestReviewInfo[]> {
  const data = await ghJson<
    Array<{ id?: number; user?: { login?: string }; state?: string; submitted_at?: string | null }>
  >(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews?per_page=100`);
  return data
    .filter((r) => typeof r.id === "number")
    .map((r) => ({
      id: r.id as number,
      user: r.user?.login ?? "",
      state: r.state ?? "",
      submittedAt: r.submitted_at ?? null,
    }));
}

/** Submit a review on a PR (approve or request changes), optionally with a comment. */
export async function reviewPullRequest(
  owner: string,
  repo: string,
  prNumber: number,
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  body?: string
): Promise<void> {
  // REQUEST_CHANGES / COMMENT require a body; APPROVE does not.
  await ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, ...(body?.trim() ? { body: body.trim() } : {}) }),
  });
}

export interface PullRequestFileInfo {
  filename: string;
  /** added | modified | removed | renamed | … */
  status: string;
  additions: number;
  deletions: number;
  /** Unified diff hunk for the file; null for binary or very large files. */
  patch: string | null;
}

/** The files changed by a PR, with their unified-diff patches. */
export async function listPullRequestFiles(
  owner: string,
  repo: string,
  prNumber: number
): Promise<PullRequestFileInfo[]> {
  const data = await ghJson<
    Array<{ filename?: string; status?: string; additions?: number; deletions?: number; patch?: string }>
  >(`/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`);
  return data
    .filter((f) => typeof f.filename === "string")
    .map((f) => ({
      filename: f.filename as string,
      status: f.status ?? "",
      additions: f.additions ?? 0,
      deletions: f.deletions ?? 0,
      patch: f.patch ?? null,
    }));
}
