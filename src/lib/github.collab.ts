// Per-repo collaborator access control, branch protection, and PR creation.

import { ghFetch, ghJson } from "./github.repos";

export type RepoPermission = "pull" | "triage" | "push" | "maintain" | "admin";

export interface RepoCollaborator {
  login: string;
  permission: RepoPermission;
}

/** List a repo's direct collaborators with their effective permission. */
export async function listRepoCollaborators(owner: string, repo: string): Promise<RepoCollaborator[]> {
  const users = await ghJson<Array<{ login?: string; permissions?: Record<string, boolean> }>>(
    `/repos/${owner}/${repo}/collaborators?affiliation=direct&per_page=100`
  );
  const rank = (p?: Record<string, boolean>): RepoPermission => {
    if (!p) return "pull";
    if (p.admin) return "admin";
    if (p.maintain) return "maintain";
    if (p.push) return "push";
    if (p.triage) return "triage";
    return "pull";
  };
  return users
    .filter((u) => u.login)
    .map((u) => ({ login: u.login as string, permission: rank(u.permissions) }))
    .sort((a, b) => a.login.localeCompare(b.login));
}

/** Add or update a repo collaborator's permission. */
export async function setRepoCollaborator(
  owner: string,
  repo: string,
  username: string,
  permission: RepoPermission
): Promise<void> {
  await ghFetch(`/repos/${owner}/${repo}/collaborators/${encodeURIComponent(username)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permission }),
  });
}

export async function createPullRequest(
  owner: string,
  repo: string,
  opts: { title: string; head: string; base: string; body?: string }
): Promise<{ number: number; htmlUrl: string }> {
  const pr = await ghJson<{ number?: number; html_url?: string }>(`/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: opts.title, head: opts.head, base: opts.base, body: opts.body ?? "" }),
  });
  return { number: pr.number ?? 0, htmlUrl: pr.html_url ?? "" };
}

export interface BranchProtectionOptions {
  requirePullRequestReviews: boolean;
  requiredApprovingReviewCount: number;
  requireStatusChecks: boolean;
  statusCheckContexts: string[];
  strictStatusChecks: boolean;
  enforceAdmins: boolean;
  requireLinearHistory: boolean;
}

/** Create/replace a branch protection rule. */
export async function setBranchProtection(
  owner: string,
  repo: string,
  branch: string,
  opts: BranchProtectionOptions
): Promise<void> {
  const body = {
    required_status_checks: opts.requireStatusChecks
      ? { strict: opts.strictStatusChecks, contexts: opts.statusCheckContexts }
      : null,
    enforce_admins: opts.enforceAdmins,
    required_pull_request_reviews: opts.requirePullRequestReviews
      ? { required_approving_review_count: opts.requiredApprovingReviewCount }
      : null,
    restrictions: null,
    required_linear_history: opts.requireLinearHistory,
  };
  await ghFetch(`/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}/protection`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
