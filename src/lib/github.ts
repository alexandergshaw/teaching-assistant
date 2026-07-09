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

// ── Copilot coding agent ──────────────────────────────────────────────────────
//
// Kick off GitHub's Copilot coding agent to build a repo: open an issue with the
// build prompt and assign it to Copilot, which then works and opens a PR. Copilot
// appears in a repo's suggestedActors (capability CAN_BE_ASSIGNED) as the
// "copilot-swe-agent" Bot when the account/org has the coding agent enabled.

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

/**
 * The Copilot coding agent's assignable actor id for a repo, or null when it is
 * not available there (coding agent not enabled for the account/org).
 */
async function getCopilotActorId(owner: string, repo: string): Promise<string | null> {
  const data = await ghGraphql<{
    repository?: { suggestedActors?: { nodes?: Array<{ login?: string; id?: string }> } };
  }>(
    `query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        suggestedActors(capabilities: [CAN_BE_ASSIGNED], first: 100) {
          nodes { login __typename ... on Bot { id } ... on User { id } }
        }
      }
    }`,
    { owner, repo }
  );
  const nodes = data.repository?.suggestedActors?.nodes ?? [];
  const copilot = nodes.find(
    (n) => n?.login === "copilot-swe-agent" || n?.login?.toLowerCase() === "copilot"
  );
  return copilot?.id ?? null;
}

/** Create an issue and return its number, GraphQL node id, and URL. */
async function createIssue(
  owner: string,
  repo: string,
  title: string,
  body: string
): Promise<{ number: number; nodeId: string; htmlUrl: string }> {
  const raw = await ghJson<{ number?: number; node_id?: string; html_url?: string }>(
    `/repos/${owner}/${repo}/issues`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, body }) }
  );
  return { number: raw.number ?? 0, nodeId: raw.node_id ?? "", htmlUrl: raw.html_url ?? "" };
}

/** Assign a set of actors (e.g. the Copilot coding agent) to an issue by node id. */
async function replaceAssignees(assignableId: string, actorIds: string[]): Promise<void> {
  await ghGraphql(
    `mutation($assignableId: ID!, $actorIds: [ID!]!) {
      replaceActorsForAssignable(input: { assignableId: $assignableId, actorIds: $actorIds }) {
        assignable { __typename }
      }
    }`,
    { assignableId, actorIds }
  );
}

/**
 * Create an issue with the given title/body and assign it to the Copilot coding
 * agent, which works on it and opens a PR. Returns the issue URL/number. Throws a
 * clear error when the Copilot coding agent is not available for the repo.
 */
export async function createCopilotAgentTask(
  owner: string,
  repo: string,
  title: string,
  body: string
): Promise<{ issueUrl: string; issueNumber: number }> {
  const copilotId = await getCopilotActorId(owner, repo);
  if (!copilotId) {
    throw new Error(
      "Copilot coding agent is not available for this repository. Enable Copilot coding agent for the account or organization, then assign the created issue to Copilot."
    );
  }
  const issue = await createIssue(owner, repo, title, body);
  if (!issue.nodeId) {
    throw new Error("Could not read the created issue id from GitHub, so Copilot was not assigned.");
  }
  await replaceAssignees(issue.nodeId, [copilotId]);
  return { issueUrl: issue.htmlUrl, issueNumber: issue.number };
}

/**
 * Open a build issue from the prompt and assign it to Copilot, which builds the
 * repo and opens a PR. Thin wrapper over createCopilotAgentTask for the
 * repo-creation flow.
 */
export async function startCopilotBuild(
  owner: string,
  repo: string,
  prompt: string
): Promise<{ issueUrl: string; issueNumber: number }> {
  return createCopilotAgentTask(
    owner,
    repo,
    "Build this project with Copilot",
    `${prompt}\n\n---\n\nAssigned to the GitHub Copilot coding agent to scaffold this repository.`
  );
}

/** The pull request the Copilot coding agent opened for a task, with live status. */
export interface CopilotTaskPr {
  number: number;
  url: string;
  /** OPEN | CLOSED | MERGED. */
  state: string;
  /** True while Copilot is still working (a draft PR). */
  isDraft: boolean;
  /** CI rollup: SUCCESS | FAILURE | PENDING | ERROR | EXPECTED | null. */
  checks: string | null;
  /** APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED | null. */
  reviewDecision: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  updatedAt: string;
}

/** One Copilot coding-agent task (a repo issue assigned to Copilot), with details. */
export interface CopilotTask {
  number: number;
  title: string;
  /** Issue state: OPEN | CLOSED. */
  state: string;
  htmlUrl: string;
  /** Kept for back-compat; task items are issues, so this is false. */
  isPullRequest: boolean;
  createdAt: string;
  updatedAt: string;
  labels: string[];
  /** The pull request Copilot opened for this task, if any. */
  pr: CopilotTaskPr | null;
}

/**
 * List a repo's issues assigned to the Copilot coding agent (its tasks), newest
 * first, each enriched with its linked pull request and that PR's live status
 * (draft/open/merged, CI rollup, review decision, diff size). One GraphQL query.
 */
export async function listCopilotTasks(owner: string, repo: string): Promise<CopilotTask[]> {
  const data = await ghGraphql<{
    repository?: {
      issues?: {
        nodes?: Array<{
          number?: number;
          title?: string;
          url?: string;
          state?: string;
          createdAt?: string;
          updatedAt?: string;
          assignees?: { nodes?: Array<{ login?: string }> };
          labels?: { nodes?: Array<{ name?: string }> };
          timelineItems?: {
            nodes?: Array<{
              source?: {
                __typename?: string;
                number?: number;
                url?: string;
                state?: string;
                isDraft?: boolean;
                reviewDecision?: string | null;
                additions?: number;
                deletions?: number;
                changedFiles?: number;
                updatedAt?: string;
                commits?: { nodes?: Array<{ commit?: { statusCheckRollup?: { state?: string } | null } }> };
              };
            }>;
          };
        }>;
      };
    };
  }>(
    `query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        issues(first: 50, orderBy: { field: UPDATED_AT, direction: DESC }, states: [OPEN, CLOSED]) {
          nodes {
            number
            title
            url
            state
            createdAt
            updatedAt
            assignees(first: 5) { nodes { login } }
            labels(first: 10) { nodes { name } }
            timelineItems(itemTypes: [CROSS_REFERENCED_EVENT], first: 30) {
              nodes {
                ... on CrossReferencedEvent {
                  source {
                    __typename
                    ... on PullRequest {
                      number
                      url
                      state
                      isDraft
                      reviewDecision
                      additions
                      deletions
                      changedFiles
                      updatedAt
                      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { owner, repo }
  );

  const nodes = data.repository?.issues?.nodes ?? [];
  return nodes
    .filter((n) => (n.assignees?.nodes ?? []).some((a) => /copilot/i.test(a?.login ?? "")))
    .map((n) => {
      const prs = (n.timelineItems?.nodes ?? [])
        .map((t) => t?.source)
        .filter((s): s is NonNullable<typeof s> => !!s && s.__typename === "PullRequest" && typeof s.number === "number")
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
      const p = prs[0];
      const pr: CopilotTaskPr | null = p
        ? {
            number: p.number ?? 0,
            url: p.url ?? "",
            state: p.state ?? "",
            isDraft: !!p.isDraft,
            checks: p.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null,
            reviewDecision: p.reviewDecision ?? null,
            additions: p.additions ?? 0,
            deletions: p.deletions ?? 0,
            changedFiles: p.changedFiles ?? 0,
            updatedAt: p.updatedAt ?? "",
          }
        : null;
      return {
        number: n.number ?? 0,
        title: n.title ?? `#${n.number ?? 0}`,
        state: n.state ?? "",
        htmlUrl: n.url ?? "",
        isPullRequest: false,
        createdAt: n.createdAt ?? "",
        updatedAt: n.updatedAt ?? "",
        labels: (n.labels?.nodes ?? []).map((l) => l?.name ?? "").filter(Boolean),
        pr,
      };
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
  event: string;
  actor: string;
  runNumber: number;
  runAttempt: number;
  runStartedAt: string | null;
  updatedAt: string | null;
  headSha: string;
  displayTitle: string;
}

interface RawRun {
  id?: number;
  name?: string;
  status?: string;
  conclusion?: string | null;
  head_branch?: string;
  html_url?: string;
  created_at?: string;
  event?: string;
  actor?: { login?: string };
  run_number?: number;
  run_attempt?: number;
  run_started_at?: string | null;
  updated_at?: string | null;
  head_sha?: string;
  display_title?: string;
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
    event: r.event ?? "",
    actor: r.actor?.login ?? "",
    runNumber: r.run_number ?? 0,
    runAttempt: r.run_attempt ?? 1,
    runStartedAt: r.run_started_at ?? null,
    updatedAt: r.updated_at ?? null,
    headSha: r.head_sha ?? "",
    displayTitle: r.display_title ?? r.name ?? "",
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
export async function dispatchWorkflow(
  owner: string,
  repo: string,
  workflowRef: string,
  ref: string,
  inputs?: Record<string, string>
): Promise<void> {
  await ghFetch(`/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowRef)}/dispatches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(inputs && Object.keys(inputs).length > 0 ? { ref, inputs } : { ref }),
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

/** Permanently delete a repository. Requires a token with the delete_repo scope. */
export async function deleteRepo(owner: string, repo: string): Promise<void> {
  await ghFetch(`/repos/${owner}/${repo}`, { method: "DELETE" });
}

// ── Forking ─────────────────────────────────────────────────────────────────
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

// ── Branch create / delete ──────────────────────────────────────────────────
/** Create `newBranch` pointing at the tip of `fromBranch`. */
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

// ── Commit history ──────────────────────────────────────────────────────────
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

// ── Pull requests: list + merge (create already exists) ─────────────────────
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

// ── Pull request reviews + files (view & approve) ───────────────────────────
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

// ── Actions: runs, jobs, re-run, cancel (workflows/dispatch/artifacts exist) ─
export async function listWorkflowRuns(
  owner: string,
  repo: string,
  opts: { branch?: string; perPage?: number; status?: string; workflowId?: number } = {}
): Promise<WorkflowRunInfo[]> {
  const params = new URLSearchParams({ per_page: String(opts.perPage ?? 30) });
  if (opts.branch) params.set("branch", opts.branch);
  if (opts.status) params.set("status", opts.status);
  const base = opts.workflowId
    ? `/repos/${owner}/${repo}/actions/workflows/${opts.workflowId}/runs`
    : `/repos/${owner}/${repo}/actions/runs`;
  const data = await ghJson<{ workflow_runs?: RawRun[] }>(`${base}?${params.toString()}`);
  return (data.workflow_runs ?? []).map(mapRun);
}
export interface WorkflowStepInfo {
  name: string;
  status: string;
  conclusion: string | null;
  number: number;
}
export interface WorkflowJobInfo {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  startedAt: string | null;
  completedAt: string | null;
  steps: WorkflowStepInfo[];
}
export async function listRunJobs(owner: string, repo: string, runId: number): Promise<WorkflowJobInfo[]> {
  const data = await ghJson<{
    jobs?: Array<{
      id?: number;
      name?: string;
      status?: string;
      conclusion?: string | null;
      html_url?: string;
      started_at?: string | null;
      completed_at?: string | null;
      steps?: Array<{ name?: string; status?: string; conclusion?: string | null; number?: number }>;
    }>;
  }>(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`);
  return (data.jobs ?? [])
    .filter((j) => typeof j.id === "number")
    .map((j) => ({
      id: j.id as number,
      name: j.name ?? "",
      status: j.status ?? "",
      conclusion: j.conclusion ?? null,
      htmlUrl: j.html_url ?? "",
      startedAt: j.started_at ?? null,
      completedAt: j.completed_at ?? null,
      steps: (j.steps ?? []).map((s) => ({ name: s.name ?? "", status: s.status ?? "", conclusion: s.conclusion ?? null, number: s.number ?? 0 })),
    }));
}
export async function rerunWorkflowRun(owner: string, repo: string, runId: number): Promise<void> {
  await ghFetch(`/repos/${owner}/${repo}/actions/runs/${runId}/rerun`, { method: "POST" });
}
export async function cancelWorkflowRun(owner: string, repo: string, runId: number): Promise<void> {
  await ghFetch(`/repos/${owner}/${repo}/actions/runs/${runId}/cancel`, { method: "POST" });
}

/** Download an artifact's zip bytes (the API 302-redirects to signed storage). */
export async function downloadArtifactZip(owner: string, repo: string, artifactId: number): Promise<Buffer> {
  const res = await ghFetch(`/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`);
  return Buffer.from(await res.arrayBuffer());
}

export async function rerunFailedJobs(owner: string, repo: string, runId: number): Promise<void> {
  await ghFetch(`/repos/${owner}/${repo}/actions/runs/${runId}/rerun-failed-jobs`, { method: "POST" });
}

export async function setWorkflowEnabled(owner: string, repo: string, workflowId: number, enabled: boolean): Promise<void> {
  await ghFetch(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/${enabled ? "enable" : "disable"}`, { method: "PUT" });
}

export interface ArtifactInfo {
  id: number;
  name: string;
  sizeInBytes: number;
  expired: boolean;
  expiresAt: string | null;
  createdAt: string | null;
}

/** List a run's build artifacts. */
export async function listRunArtifacts(owner: string, repo: string, runId: number): Promise<ArtifactInfo[]> {
  const data = await ghJson<{
    artifacts?: Array<{ id?: number; name?: string; size_in_bytes?: number; expired?: boolean; expires_at?: string | null; created_at?: string | null }>;
  }>(`/repos/${owner}/${repo}/actions/runs/${runId}/artifacts?per_page=100`);
  return (data.artifacts ?? [])
    .filter((a) => typeof a.id === "number")
    .map((a) => ({
      id: a.id as number,
      name: a.name ?? "artifact",
      sizeInBytes: a.size_in_bytes ?? 0,
      expired: !!a.expired,
      expiresAt: a.expires_at ?? null,
      createdAt: a.created_at ?? null,
    }));
}

// GitHub returns a 302 to a short-lived signed URL for artifact / log zip downloads.
// Read the Location without following it (undici exposes it on a manual redirect).
async function ghRedirectLocation(path: string): Promise<string> {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${githubToken()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    redirect: "manual",
  });
  const loc = res.headers.get("location");
  if (loc) return loc;
  throw new Error(ghError(res.status, await res.text().catch(() => "")));
}

/** Resolve a short-lived download URL for one artifact's zip. */
export async function getArtifactDownloadUrl(owner: string, repo: string, artifactId: number): Promise<string> {
  return ghRedirectLocation(`/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`);
}

/** Resolve a short-lived download URL for a run's full log zip. */
export async function getRunLogsDownloadUrl(owner: string, repo: string, runId: number): Promise<string> {
  return ghRedirectLocation(`/repos/${owner}/${repo}/actions/runs/${runId}/logs`);
}

export interface PendingDeployment {
  environmentId: number;
  environmentName: string;
  currentUserCanApprove: boolean;
}

/** List a run's pending deployment approvals (protected environments). */
export async function listPendingDeployments(owner: string, repo: string, runId: number): Promise<PendingDeployment[]> {
  const data = await ghJson<Array<{ environment?: { id?: number; name?: string }; current_user_can_approve?: boolean }>>(
    `/repos/${owner}/${repo}/actions/runs/${runId}/pending_deployments`
  );
  return (data ?? [])
    .filter((d) => typeof d.environment?.id === "number")
    .map((d) => ({
      environmentId: d.environment!.id as number,
      environmentName: d.environment?.name ?? "",
      currentUserCanApprove: !!d.current_user_can_approve,
    }));
}

/** Approve or reject pending deployments for the given environment ids. */
export async function reviewPendingDeployments(
  owner: string,
  repo: string,
  runId: number,
  environmentIds: number[],
  state: "approved" | "rejected",
  comment: string
): Promise<void> {
  await ghFetch(`/repos/${owner}/${repo}/actions/runs/${runId}/pending_deployments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ environment_ids: environmentIds, state, comment }),
  });
}
