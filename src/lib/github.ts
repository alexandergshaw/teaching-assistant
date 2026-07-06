// Server-only GitHub REST client. Authenticates with a Personal Access Token in
// the GITHUB_TOKEN env var (mirrors the Canvas layer's env-var token pattern) and
// uses plain fetch — no SDK dependency. Covers the operations the app needs:
// listing repos, reading a repo's files (for course/rubric generation and
// grading), creating repos, writing files (instruction sync), and reading CI runs.

const API = "https://api.github.com";

/** The configured GitHub token, or throw a clear setup error. */
export function githubToken(): string {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error("GitHub is not configured. Set the GITHUB_TOKEN environment variable to a personal access token.");
  return token;
}

/** Whether a GitHub token is configured (so the UI can hide GitHub features). */
export function githubConfigured(): boolean {
  return !!process.env.GITHUB_TOKEN?.trim();
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

async function ghFetch(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${githubToken()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(ghError(res.status, await res.text().catch(() => "")));
  }
  return res;
}

const ghJson = async <T>(path: string, init?: RequestInit): Promise<T> => (await ghFetch(path, init)).json() as Promise<T>;

const encodePath = (path: string): string => path.split("/").map(encodeURIComponent).join("/");
const fileExt = (path: string): string => path.split(".").pop()?.toLowerCase() ?? "";

// ── Repos ─────────────────────────────────────────────────────────────────────

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
  };
}

/** Parse "owner/repo" or a github.com URL into its parts. */
export function parseRepoRef(ref: string): { owner: string; repo: string } | null {
  const trimmed = ref.trim().replace(/\.git$/, "");
  const url = trimmed.match(/github\.com[/:]([^/]+)\/([^/]+)/);
  if (url) return { owner: url[1], repo: url[2] };
  const slug = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (slug) return { owner: slug[1], repo: slug[2] };
  return null;
}

/** List repos the token can see (owner + collaborator + org member), newest first. */
export async function listRepos(): Promise<GithubRepo[]> {
  const out: GithubRepo[] = [];
  for (let page = 1; page <= 3; page += 1) {
    const repos = await ghJson<RawRepo[]>(
      `/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member&page=${page}`
    );
    for (const r of repos) if (r.name && r.owner?.login) out.push(mapRepo(r));
    if (repos.length < 100) break;
  }
  return out;
}

export async function getRepo(owner: string, repo: string): Promise<GithubRepo> {
  return mapRepo(await ghJson<RawRepo>(`/repos/${owner}/${repo}`));
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
  const needle = prefix?.trim().toLowerCase();
  const out: GithubRepo[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const repos = await ghJson<RawRepo[]>(`/orgs/${org}/repos?per_page=100&sort=full_name&page=${page}`);
    for (const r of repos) {
      if (!r.name || !r.owner?.login) continue;
      if (needle && !r.name.toLowerCase().startsWith(needle)) continue;
      out.push(mapRepo(r));
    }
    if (repos.length < 100) break;
  }
  return out;
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

// ── Files ─────────────────────────────────────────────────────────────────────

export interface RepoTreeEntry {
  path: string;
  type: "blob" | "tree";
  size: number;
  sha: string;
}

/** The full recursive file tree of a repo at `ref` (default branch when omitted). */
export async function getRepoTree(owner: string, repo: string, ref?: string): Promise<RepoTreeEntry[]> {
  const branch = ref || (await getRepo(owner, repo)).defaultBranch;
  const data = await ghJson<{ tree?: Array<{ path?: string; type?: string; size?: number; sha?: string }> }>(
    `/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`
  );
  return (data.tree ?? [])
    .filter((t): t is { path: string; type: "blob" | "tree"; size?: number; sha?: string } => !!t.path && (t.type === "blob" || t.type === "tree"))
    .map((t) => ({ path: t.path, type: t.type, size: t.size ?? 0, sha: t.sha ?? "" }));
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

// ── Codebase digest (for course / rubric generation and grading) ───────────────

// Text/code file extensions worth feeding to a model.
const TEXT_EXT = new Set([
  "md", "mdx", "txt", "rst", "js", "ts", "tsx", "jsx", "mjs", "cjs", "py", "java", "c", "cc", "cpp", "h", "hpp",
  "cs", "go", "rb", "php", "rs", "swift", "kt", "scala", "html", "css", "scss", "sass", "vue", "svelte", "json",
  "yml", "yaml", "toml", "sql", "sh", "bash", "r", "ipynb", "dockerfile",
]);
const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|out|\.next|\.nuxt|vendor|venv|\.venv|__pycache__|coverage|\.idea|\.vscode|target)(\/|$)/;
const SKIP_FILE = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|\.min\.(js|css)$|\.map$)/;

// Read order: README first, then docs, then source — so the digest leads with intent.
function pathRank(path: string): number {
  const lower = path.toLowerCase();
  if (/(^|\/)readme\./.test(lower)) return 0;
  if (/(^|\/)(docs?|documentation)\//.test(lower)) return 1;
  if (/(^|\/)(src|app|lib|server|client)\//.test(lower)) return 2;
  return 3;
}

/** One file included in a repo digest (its content is the post-truncation slice). */
export interface RepoFile {
  path: string;
  content: string;
}

export interface RepoDigest {
  fullName: string;
  description: string;
  fileCount: number;
  /** Concatenated, bounded source text for the model. */
  text: string;
  truncated: boolean;
  /**
   * The individual files that make up {@link text}. Lets the deterministic grader
   * check file types / counts and preview per-file content without re-parsing the
   * concatenated digest.
   */
  files: RepoFile[];
}

/**
 * Build a bounded text digest of a repo (README + selected source files) for the
 * LLM. Skips binaries, dependencies, and lockfiles, and caps file count + bytes
 * so a large repo never blows the token budget.
 */
export async function ingestRepo(
  owner: string,
  repo: string,
  opts: { maxFiles?: number; maxBytes?: number; perFileBytes?: number } = {},
  ref?: string
): Promise<RepoDigest> {
  const maxFiles = opts.maxFiles ?? 40;
  const maxBytes = opts.maxBytes ?? 220_000;
  const perFileBytes = opts.perFileBytes ?? 8_000;

  const info = await getRepo(owner, repo);
  const branch = ref || info.defaultBranch;
  const tree = await getRepoTree(owner, repo, branch);
  const candidates = tree
    .filter(
      (t) =>
        t.type === "blob" &&
        t.size > 0 &&
        t.size < 60_000 &&
        !SKIP_DIR.test(t.path) &&
        !SKIP_FILE.test(t.path) &&
        (TEXT_EXT.has(fileExt(t.path)) || /(^|\/)(readme|dockerfile|makefile)$/i.test(t.path.toLowerCase()))
    )
    .sort((a, b) => pathRank(a.path) - pathRank(b.path) || a.path.localeCompare(b.path));

  const parts: string[] = [`# Repository: ${info.fullName}${info.description ? `\n\n${info.description}` : ""}`];
  const files: RepoFile[] = [];
  let used = 0;
  let count = 0;
  let truncated = false;
  for (const f of candidates) {
    if (count >= maxFiles || used >= maxBytes) {
      truncated = true;
      break;
    }
    let body: string;
    try {
      body = await getFileText(owner, repo, f.path, branch);
    } catch {
      continue;
    }
    const budget = Math.min(perFileBytes, maxBytes - used);
    const slice = body.slice(0, budget);
    if (slice.length < body.length) truncated = true;
    parts.push(`\n\n--- FILE: ${f.path} ---\n${slice}`);
    files.push({ path: f.path, content: slice });
    used += slice.length;
    count += 1;
  }
  return { fullName: info.fullName, description: info.description, fileCount: count, text: parts.join(""), truncated, files };
}

/** Download a repo as a zip archive (GitHub's zipball) at `ref` / default branch. */
export async function downloadRepoZipball(owner: string, repo: string, ref?: string): Promise<Buffer> {
  const branch = ref || (await getRepo(owner, repo)).defaultBranch;
  const res = await ghFetch(`/repos/${owner}/${repo}/zipball/${encodeURIComponent(branch)}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── CI / GitHub Actions ────────────────────────────────────────────────────────

export interface WorkflowRunInfo {
  id: number;
  name: string;
  /** queued | in_progress | completed | … */
  status: string;
  /** success | failure | cancelled | … (null until completed). */
  conclusion: string | null;
  headBranch: string;
  htmlUrl: string;
  createdAt: string;
}

interface RawRun {
  id?: number;
  name?: string;
  status?: string;
  conclusion?: string | null;
  head_branch?: string;
  html_url?: string;
  created_at?: string;
}

function mapRun(r: RawRun): WorkflowRunInfo {
  return {
    id: r.id ?? 0,
    name: r.name ?? "workflow",
    status: r.status ?? "unknown",
    conclusion: r.conclusion ?? null,
    headBranch: r.head_branch ?? "",
    htmlUrl: r.html_url ?? "",
    createdAt: r.created_at ?? "",
  };
}

/** The most recent GitHub Actions run for a repo (optionally on one branch). */
export async function getLatestWorkflowRun(owner: string, repo: string, branch?: string): Promise<WorkflowRunInfo | null> {
  const data = await ghJson<{ workflow_runs?: RawRun[] }>(
    `/repos/${owner}/${repo}/actions/runs?per_page=1${branch ? `&branch=${encodeURIComponent(branch)}` : ""}`
  );
  const run = data.workflow_runs?.[0];
  return run ? mapRun(run) : null;
}

export interface WorkflowInfo {
  id: number;
  name: string;
  /** The workflow file path, e.g. ".github/workflows/tests.yml". */
  path: string;
  state: string;
}

/** List a repo's Actions workflows (for choosing which one to run). */
export async function listWorkflows(owner: string, repo: string): Promise<WorkflowInfo[]> {
  const data = await ghJson<{ workflows?: Array<{ id?: number; name?: string; path?: string; state?: string }> }>(
    `/repos/${owner}/${repo}/actions/workflows?per_page=100`
  );
  return (data.workflows ?? [])
    .filter((w): w is { id: number; name?: string; path?: string; state?: string } => typeof w.id === "number")
    .map((w) => ({ id: w.id, name: w.name ?? "", path: w.path ?? "", state: w.state ?? "" }));
}

/**
 * Trigger a workflow_dispatch run. `workflowRef` is the workflow file name (e.g.
 * "tests.yml") or its numeric id; the workflow must declare `on: workflow_dispatch`.
 * Returns 204 with no body, so the caller correlates the resulting run via
 * {@link findWorkflowRunSince}.
 */
export async function dispatchWorkflow(owner: string, repo: string, workflowRef: string, ref: string): Promise<void> {
  await ghFetch(`/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowRef)}/dispatches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref }),
  });
}

/** Find the newest workflow_dispatch run on `ref` created at or after `sinceIso`. */
export async function findWorkflowRunSince(
  owner: string,
  repo: string,
  ref: string,
  sinceIso: string
): Promise<WorkflowRunInfo | null> {
  const data = await ghJson<{ workflow_runs?: RawRun[] }>(
    `/repos/${owner}/${repo}/actions/runs?branch=${encodeURIComponent(ref)}&event=workflow_dispatch&per_page=10`
  );
  const since = Date.parse(sinceIso) - 15_000; // small buffer for clock skew
  const run = (data.workflow_runs ?? []).find((r) => r.created_at && Date.parse(r.created_at) >= since);
  return run ? mapRun(run) : null;
}

/** List a completed run's uploaded artifacts (e.g. a JUnit test report). */
export async function listRunArtifacts(owner: string, repo: string, runId: number): Promise<Array<{ id: number; name: string }>> {
  const data = await ghJson<{ artifacts?: Array<{ id?: number; name?: string }> }>(
    `/repos/${owner}/${repo}/actions/runs/${runId}/artifacts?per_page=100`
  );
  return (data.artifacts ?? [])
    .filter((a): a is { id: number; name?: string } => typeof a.id === "number")
    .map((a) => ({ id: a.id, name: a.name ?? "" }));
}

/** Download an artifact's zip bytes (the API 302-redirects to signed storage). */
export async function downloadArtifactZip(owner: string, repo: string, artifactId: number): Promise<Buffer> {
  const res = await ghFetch(`/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Org members ─────────────────────────────────────────────────────────────
export interface OrgMember {
  login: string;
  role: "admin" | "member";
}

/** List an org's members with their org role (admin = owner). */
export async function listOrgMembers(org: string): Promise<OrgMember[]> {
  const collect = async (role: "admin" | "member"): Promise<OrgMember[]> => {
    const out: OrgMember[] = [];
    for (let page = 1; page <= 5; page += 1) {
      const users = await ghJson<Array<{ login?: string }>>(
        `/orgs/${org}/members?role=${role}&per_page=100&page=${page}`
      );
      for (const u of users) if (u.login) out.push({ login: u.login, role });
      if (users.length < 100) break;
    }
    return out;
  };
  const [admins, members] = await Promise.all([collect("admin"), collect("member")]);
  return [...admins, ...members].sort((a, b) => a.login.localeCompare(b.login));
}

/** Invite a user to the org by username or email. `role`: "admin" (owner) or "member". */
export async function inviteOrgMember(org: string, invitee: string, role: "admin" | "member"): Promise<void> {
  const invitationRole = role === "admin" ? "admin" : "direct_member";
  const value = invitee.trim();
  if (!value) throw new Error("Enter a GitHub username or email to invite.");
  let body: Record<string, unknown>;
  if (value.includes("@")) {
    body = { email: value, role: invitationRole };
  } else {
    const user = await ghJson<{ id?: number }>(`/users/${encodeURIComponent(value)}`);
    if (typeof user.id !== "number") throw new Error(`GitHub user "${value}" was not found.`);
    body = { invitee_id: user.id, role: invitationRole };
  }
  await ghFetch(`/orgs/${org}/invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Set an existing member's org role. */
export async function setOrgMemberRole(org: string, username: string, role: "admin" | "member"): Promise<void> {
  await ghFetch(`/orgs/${org}/memberships/${encodeURIComponent(username)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

// ── Per-repo collaborator access ────────────────────────────────────────────
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

// ── Pull requests ───────────────────────────────────────────────────────────
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

// ── Branch protection ───────────────────────────────────────────────────────
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

// ── Personal repos + settings ───────────────────────────────────────────────
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
  private?: boolean;
  isTemplate?: boolean;
  description?: string;
  archived?: boolean;
}

/** Update a repo's settings (visibility, template flag, description, archived). */
export async function updateRepo(owner: string, repo: string, patch: UpdateRepoPatch): Promise<GithubRepo> {
  const body: Record<string, unknown> = {};
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
