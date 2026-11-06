// Repository CRUD, listing, and discovery operations.

import { checkGithubReadDeadline, readBoundedResponse, GithubReadLimitError, type GithubBoundedReadContext } from "./github-bounded-read";
import { GithubHttpError } from "./github-http-error";
import { encodeRefSegment, validateGithubOwnerRepo } from "./github-ref-name";
import type { RepoTreeResult } from "./github.files";

const API = "https://api.github.com";

/** The configured GitHub token, or throw a clear setup error. */
function githubToken(): string {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error("GitHub is not configured. Set the GITHUB_TOKEN environment variable to a personal access token.");
  return token;
}

function ghError(status: number, detail: string): string {
  let message = "";
  try {
    message = (JSON.parse(detail) as { message?: string }).message ?? "";
  } catch {
    /* non-JSON body */
  }
  if (status === 401) return "GitHub rejected the token (401). Check that GITHUB_TOKEN is valid.";
  if (status === 403) return `GitHub forbidden (403)${message ? `: ${message}` : " — rate limit hit or the token lacks the needed scope."}`;
  if (status === 404) return "GitHub resource not found (404). Check the owner/repo and the token's access.";
  if (status === 422) return `GitHub rejected the request (422)${message ? `: ${message}` : ""}.`;
  return `GitHub request failed (HTTP ${status})${message ? `: ${message}` : ""}.`;
}

export type GithubRepoRequestOptions = Pick<RequestInit, "signal"> & {
  beforeRequest?: () => void;
  observeResponse?: (response: Response) => void;
};

type GithubRequestInit = RequestInit & GithubRepoRequestOptions;

export function githubRestHeaders() {
  return {
    Authorization: `Bearer ${githubToken()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ghFetch(path: string, { beforeRequest, observeResponse, ...init }: GithubRequestInit = {}, bounded?: GithubBoundedReadContext, responseCap = 1_000_000): Promise<Response> {
  if (bounded) { checkGithubReadDeadline(bounded); if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid GitHub API path"); }
  beforeRequest?.();
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    ...(bounded ? { redirect: "manual" as const, signal: bounded.controller.signal } : {}),
    headers: {
      ...githubRestHeaders(),
      ...init.headers,
    },
  });
  if (bounded && res.status >= 300 && res.status < 400) { await res.body?.cancel(); throw new GithubReadLimitError("redirect"); }
  observeResponse?.(res);
  if (!res.ok) {
    // GithubHttpError, not Error: the MESSAGE is unchanged (still whatever
    // ghError produces), so every existing caller that reads err.message or
    // tests `instanceof Error` behaves exactly as before. What is new is that
    // the status and the response headers survive the throw, so a caller that
    // wants them - src/lib/repo-grade-tree-scan.ts, to tell a genuine
    // rate limit apart from a genuine permissions failure via
    // x-ratelimit-remaining - no longer has to recover the status by parsing
    // this message's own prose. Reading res.headers after res.text() is fine:
    // consuming the body does not detach the headers.
    throw new GithubHttpError(ghError(res.status, bounded ? await readBoundedResponse(res, bounded, responseCap) : await res.text().catch(() => "")), res.status, res.headers);
  }
  return res;
}

const ghJson = async <T>(path: string, init?: GithubRequestInit, bounded?: GithubBoundedReadContext): Promise<T> => {
  const res = await ghFetch(path, init, bounded);
  return bounded ? JSON.parse(await readBoundedResponse(res, bounded, 1_000_000)) as T : res.json() as Promise<T>;
};

export interface GithubRepo {
  /** "owner/name". */
  fullName: string;
  owner: string;
  name: string;
  description: string;
  private: boolean;
  defaultBranch: string;
  updatedAt: string;
  htmlUrl: string;
  /** Whether this repo is a template (can seed new repos via generate). */
  isTemplate: boolean;
  archived: boolean;
}

interface RawRepo {
  full_name?: string;
  name?: string;
  owner?: { login?: string };
  description?: string | null;
  private?: boolean;
  default_branch?: string;
  updated_at?: string | null;
  html_url?: string;
  is_template?: boolean;
  archived?: boolean;
}

function mapRepo(r: RawRepo): GithubRepo {
  return {
    fullName: r.full_name ?? `${r.owner?.login ?? ""}/${r.name ?? ""}`,
    owner: r.owner?.login ?? r.full_name?.split("/")[0] ?? "",
    name: r.name ?? r.full_name?.split("/")[1] ?? "",
    description: r.description ?? "",
    private: !!r.private,
    defaultBranch: r.default_branch ?? "main",
    updatedAt: r.updated_at ?? "",
    htmlUrl: r.html_url ?? "",
    isTemplate: !!r.is_template,
    archived: !!r.archived,
  };
}

/** Parse "owner/repo" or a github.com URL into its parts. */
export function parseRepoRef(ref: string): { owner: string; repo: string } | null {
  const trimmed = ref.trim().replace(/\.git$/, "");
  const url = trimmed.match(/github\.com[/:]([^/]+)\/([^/]+)/);
  // Both branches reject (null) an owner/repo that is not path-safe: callers
  // interpolate these unencoded into /repos/<owner>/<repo>/... and every caller
  // already maps null to its "enter owner/name" error.
  if (url) return validateGithubOwnerRepo(url[1], url[2]) ? { owner: url[1], repo: url[2] } : null;
  const slug = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (slug) return validateGithubOwnerRepo(slug[1], slug[2]) ? { owner: slug[1], repo: slug[2] } : null;
  return null;
}

/** List repos the token can see (owner + collaborator + org member), newest first (up to 1000). */
export async function listRepos(): Promise<GithubRepo[]> {
  const out: GithubRepo[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const repos = await ghJson<RawRepo[]>(
      `/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member&page=${page}`
    );
    for (const r of repos) if (r.name && r.owner?.login) out.push(mapRepo(r));
    if (repos.length < 100) break;
  }
  return out;
}

export async function getRepo(owner: string, repo: string, bounded?: GithubBoundedReadContext): Promise<GithubRepo> {
  const raw = await ghJson<RawRepo>(`/repos/${owner}/${repo}`, undefined, bounded);
  if (bounded && (typeof raw.default_branch !== "string" || !raw.default_branch.trim())) throw new Error("Repository default ref is unavailable.");
  return mapRepo(raw);
}

/** Logins of the orgs the authenticated user owns (admin role), sorted. */
export async function listOwnedOrgs(): Promise<string[]> {
  const out: string[] = [];
  for (let page = 1; page <= 3; page += 1) {
    const data = await ghJson<Array<{ role?: string; organization?: { login?: string } }>>(
      `/user/memberships/orgs?state=active&per_page=100&page=${page}`
    );
    for (const m of data) if (m.role === "admin" && m.organization?.login) out.push(m.organization.login);
    if (data.length < 100) break;
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Repos in an org (optionally filtered to names starting with `prefix`). */
export async function listOrgRepos(org: string, prefix?: string): Promise<GithubRepo[]> {
  return (await listOrgRepoPageWindow(org, prefix, false)).repos;
}

/** Report when the listing reaches the request cap, even if filtering hid it. */
export async function listOrgReposWithCoverage(org: string, prefix?: string, options?: GithubRepoRequestOptions) {
  if (!validateGithubOwnerRepo(org, "repo")) throw new Error("Invalid GitHub organization.");
  return listOrgRepoPageWindow(org, prefix, true, options);
}

async function listOrgRepoPageWindow(
  org: string, prefix: string | undefined, strict: boolean, options?: GithubRepoRequestOptions,
) {
  const needle = prefix?.trim().toLowerCase();
  const out: GithubRepo[] = [];
  const seen = new Set<string>();
  let malformed = false;
  for (let page = 1; page <= 10; page += 1) {
    const repos = await ghJson<RawRepo[]>(`/orgs/${org}/repos?per_page=100&sort=full_name&page=${page}`,
      strict ? { ...options, cache: "no-store" } : undefined);
    for (const r of repos) {
      if (!r?.name || !r.owner?.login) {
        malformed = true;
        continue;
      }
      if (needle && !r.name.toLowerCase().startsWith(needle)) continue;
      const repo = mapRepo(r);
      if (strict) {
        repo.defaultBranch = r.default_branch ?? "";
        const key = repo.fullName.toLowerCase();
        if (seen.has(key)) {
          malformed = true;
          continue;
        }
        seen.add(key);
      }
      out.push(repo);
    }
    if (repos.length < 100) return { repos: out, complete: !malformed };
  }
  return { repos: out, complete: false };
}

export function isGithubCommitSha(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{40}$/i.test(value);
}

/** Capture a mutable source ref once, before making any grading input reads. */
export async function resolveRepoSourceCommit(
  owner: string, repo: string, sourceRef: string, options?: GithubRepoRequestOptions,
): Promise<string> {
  const commit = await ghJson<{ sha?: string }>(
    `/repos/${owner}/${repo}/commits/${encodeRefSegment(sourceRef)}`, { ...options, cache: "no-store" });
  if (!isGithubCommitSha(commit.sha)) throw new Error("GitHub did not return a source commit.");
  return commit.sha;
}

/** Read the Git tree object named by this exact commit's Git object. */
export async function getRepoCommitTree(
  owner: string, repo: string, sourceCommit: string, options?: GithubRepoRequestOptions,
): Promise<RepoTreeResult> {
  if (!isGithubCommitSha(sourceCommit)) throw new Error("A full GitHub commit SHA is required.");
  const base = `/repos/${owner}/${repo}/git`;
  const sha = sourceCommit.toLowerCase();
  const commit = await ghJson<{ sha?: string; tree?: { sha?: string } }>(`${base}/commits/${sha}`, options);
  const treeSha = commit.tree?.sha;
  if (commit.sha !== sha || !isGithubCommitSha(treeSha)) throw new Error("GitHub did not return the pinned commit tree.");

  const data = await ghJson<{ sha?: string; tree?: RepoTreeResult["entries"]; truncated?: boolean }>(
    `${base}/trees/${treeSha}?recursive=1`, options);
  if (data.sha !== treeSha || !Array.isArray(data.tree) || typeof data.truncated !== "boolean") {
    throw new Error("GitHub did not return a complete tree response.");
  }
  const entries = data.tree.filter((entry) => typeof entry?.path === "string" && entry.path !== "" &&
    (entry.type === "tree" || (entry.type === "blob" && Number.isSafeInteger(entry.size) && entry.size >= 0)));
  return { entries, truncated: data.truncated || entries.length !== data.tree.length };
}

/** A repo's branch names (default branch first) plus which one is the default. */
export async function listBranches(owner: string, repo: string): Promise<{ branches: string[]; defaultBranch: string }> {
  const info = await getRepo(owner, repo);
  const names: string[] = [];
  for (let page = 1; page <= 2; page += 1) {
    const data = await ghJson<Array<{ name?: string }>>(`/repos/${owner}/${repo}/branches?per_page=100&page=${page}`);
    for (const b of data) if (b.name) names.push(b.name);
    if (data.length < 100) break;
  }
  const branches = [info.defaultBranch, ...names.filter((b) => b !== info.defaultBranch)];
  return { branches, defaultBranch: info.defaultBranch };
}

/**
 * Create a new repo from a template repo (the template must have is_template=true).
 * `owner` is the target user or org login. Returns the created repo.
 */
export async function generateFromTemplate(
  templateOwner: string,
  templateRepo: string,
  owner: string,
  name: string,
  isPrivate: boolean,
  description = ""
): Promise<GithubRepo> {
  return mapRepo(
    await ghJson<RawRepo>(`/repos/${templateOwner}/${templateRepo}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, name, private: isPrivate, description, include_all_branches: false }),
    })
  );
}

interface CreateRepoOptions {
  description?: string;
  private?: boolean;
  autoInit?: boolean;
  isTemplate?: boolean;
}

const createRepoBody = (name: string, opts: CreateRepoOptions): string =>
  JSON.stringify({
    name,
    description: opts.description ?? "",
    private: opts.private ?? true,
    auto_init: opts.autoInit ?? true,
    is_template: opts.isTemplate ?? false,
  });

/** Create a new repo for the authenticated user. */
export async function createRepo(name: string, opts: CreateRepoOptions = {}): Promise<GithubRepo> {
  return mapRepo(
    await ghJson<RawRepo>(`/user/repos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: createRepoBody(name, opts),
    })
  );
}

/** Create a new repo inside an organization (the token must be able to create repos there). */
export async function createOrgRepo(org: string, name: string, opts: CreateRepoOptions = {}): Promise<GithubRepo> {
  return mapRepo(
    await ghJson<RawRepo>(`/orgs/${org}/repos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: createRepoBody(name, opts),
    })
  );
}

/** Repos owned by the authenticated user (personal, not org), newest first. */
export async function listPersonalRepos(): Promise<GithubRepo[]> {
  const out: GithubRepo[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const repos = await ghJson<RawRepo[]>(
      `/user/repos?per_page=100&sort=updated&affiliation=owner&page=${page}`
    );
    for (const r of repos) if (r.name && r.owner?.login) out.push(mapRepo(r));
    if (repos.length < 100) break;
  }
  return out;
}

export interface UpdateRepoPatch {
  /** New repository name; GitHub redirects the old URL after a rename. */
  name?: string;
  private?: boolean;
  isTemplate?: boolean;
  description?: string;
  archived?: boolean;
}

/** Update a repo's settings (name, visibility, template flag, description, archived). */
export async function updateRepo(owner: string, repo: string, patch: UpdateRepoPatch): Promise<GithubRepo> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.private !== undefined) body.private = patch.private;
  if (patch.isTemplate !== undefined) body.is_template = patch.isTemplate;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.archived !== undefined) body.archived = patch.archived;
  return mapRepo(
    await ghJson<RawRepo>(`/repos/${owner}/${repo}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

/** Permanently delete a repository. Requires a token with the delete_repo scope. */
export async function deleteRepo(owner: string, repo: string): Promise<void> {
  await ghFetch(`/repos/${owner}/${repo}`, { method: "DELETE" });
}

/** Fork a repo to the token's account, or into `org` when given. */
export async function forkRepo(owner: string, repo: string, org?: string): Promise<GithubRepo> {
  const body = org ? { organization: org } : {};
  return mapRepo(
    await ghJson<RawRepo>(`/repos/${owner}/${repo}/forks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

// Internal exports for re-export from main module
export { ghFetch, ghJson, ghError, githubToken };
export type { RawRepo };
