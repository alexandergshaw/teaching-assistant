import { createHmac } from "node:crypto";
import { ghJson, githubToken } from "@/lib/github.repos";
import { GithubHttpError } from "@/lib/github-http-error";
import { digest } from "./repository-snapshot";

export interface CopilotTaskPort {
  json: <T>(path: string, init?: RequestInit) => Promise<T>;
  secret: string;
}
export interface CopilotTaskReceipt { id: string; url: string; state: string; baseCommit: string }
export interface CopilotTaskRequest {
  owner: string;
  repo: string;
  snapshotId: string;
  snapshotCommit: string;
  prompt: string;
  kind: "initial" | "followup";
}
const MAX_PROMPT = 20_000;
const MAX_PACKAGE = 8 * 1024 * 1024;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const REPO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export function copilotTasksEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PRESENTATION_COPILOT_TASKS_ENABLED === "true" && !!env.GITHUB_TOKEN?.trim();
}

export function validateCopilotTaskRequest(value: CopilotTaskRequest): void {
  if (!REPO.test(value.owner) || !REPO.test(value.repo) || !OID.test(value.snapshotId) || !OID.test(value.snapshotCommit)) throw new Error("INVALID_SNAPSHOT_REFERENCE");
  if (typeof value.prompt !== "string" || !value.prompt.trim() || value.prompt.length > MAX_PROMPT) throw new Error("INVALID_PROMPT");
  if (value.kind !== "initial" && value.kind !== "followup") throw new Error("INVALID_TASK_KIND");
}

function makeMarker(secret: string, userId: string, owner: string, repo: string, snapshotId: string): string {
  const signature = createHmac("sha256", secret).update(JSON.stringify([userId, owner, repo, snapshotId])).digest("hex");
  return `Deck snapshot ${signature}`;
}
function request(method: string, body?: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json", "X-GitHub-Api-Version": "2026-03-10" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) };
}
function safePath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !value.startsWith("/") && !value.includes("\\") && !value.includes(":") && value.split("/").every(part => !!part && part !== "." && part !== "..");
}
function base64(value: string | undefined): Buffer {
  if (!value || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error("SNAPSHOT_INTEGRITY_FAILED");
  return Buffer.from(value, "base64");
}
function post<T>(port: CopilotTaskPort, path: string, body: unknown): Promise<T> {
  return port.json<T>(path, request("POST", body));
}

/** Verify the authenticated, signed package commit before any Copilot task egress. */
export async function verifySnapshotCommit(userId: string, expectedLogin: string, value: CopilotTaskRequest, port: CopilotTaskPort): Promise<{ baseCommit: string; defaultBranch: string; defaultHead: string }> {
  validateCopilotTaskRequest(value);
  const { owner, repo, snapshotId, snapshotCommit } = value;
  if (owner.toLowerCase() !== expectedLogin.toLowerCase()) throw new Error("ACCOUNT_CHANGED");
  const prefix = `/repos/${owner}/${repo}`;
  const repository = await port.json<{ private?: boolean; description?: string; default_branch?: string }>(prefix);
  if (!repository.private || repository.description !== makeMarker(port.secret, userId, owner, repo, snapshotId)) throw new Error("SNAPSHOT_REPOSITORY_CONFLICT");
  const defaultBranch = repository.default_branch;
  if (!defaultBranch || !/^[A-Za-z0-9._/-]+$/.test(defaultBranch) || defaultBranch.includes("..")) throw new Error("INVALID_DEFAULT_BRANCH");

  const commit = await port.json<{ sha?: string; tree?: { sha?: string } }>(`${prefix}/git/commits/${snapshotCommit}`);
  if (commit.sha !== snapshotCommit || !OID.test(commit.sha) || !commit.tree?.sha || !OID.test(commit.tree.sha)) throw new Error("SNAPSHOT_COMMIT_NOT_FOUND");
  const tree = await port.json<{ truncated?: boolean; tree?: Array<{ path?: string; type?: string; mode?: string; sha?: string; size?: number }> }>(`${prefix}/git/trees/${commit.tree.sha}?recursive=1`);
  if (tree.truncated || !Array.isArray(tree.tree)) throw new Error("SNAPSHOT_TREE_UNPROVABLE");
  const entries = new Map<string, { sha: string; size: number }>();
  const seenPaths = new Set<string>();
  let declaredTotal = 0;
  for (const row of tree.tree) {
    if (!safePath(row.path) || !row.sha || !OID.test(row.sha) || seenPaths.has(row.path)) throw new Error("SNAPSHOT_TREE_UNPROVABLE");
    seenPaths.add(row.path);
    if (row.type === "tree" && row.mode === "040000") continue;
    if (row.type !== "blob" || row.mode !== "100644" || !Number.isSafeInteger(row.size) || row.size! < 0) throw new Error("SNAPSHOT_TREE_UNPROVABLE");
    declaredTotal += row.size!;
    if (row.size! > MAX_PACKAGE || declaredTotal > MAX_PACKAGE) throw new Error("SNAPSHOT_INTEGRITY_FAILED");
    entries.set(row.path, { sha: row.sha, size: row.size! });
  }
  const blob = async (entry: { sha: string; size: number } | undefined): Promise<Buffer> => {
    if (!entry) throw new Error("SNAPSHOT_INTEGRITY_FAILED");
    const result = await port.json<{ encoding?: string; content?: string }>(`${prefix}/git/blobs/${entry.sha}`);
    if (result.encoding !== "base64") throw new Error("SNAPSHOT_INTEGRITY_FAILED");
    const bytes = base64(result.content);
    if (bytes.length !== entry.size) throw new Error("SNAPSHOT_INTEGRITY_FAILED");
    return bytes;
  };
  const manifestBytes = await blob(entries.get("manifest.json"));
  let manifest: unknown;
  try { manifest = JSON.parse(manifestBytes.toString("utf8")); } catch { throw new Error("SNAPSHOT_INTEGRITY_FAILED"); }
  if (!manifest || typeof manifest !== "object" || (manifest as { version?: unknown }).version !== 1 || (manifest as { snapshot?: unknown }).snapshot !== snapshotId || !Array.isArray((manifest as { files?: unknown }).files)) throw new Error("SNAPSHOT_INTEGRITY_FAILED");
  const rows = (manifest as { files: Array<{ path?: unknown; bytes?: unknown; sha256?: unknown }> }).files;
  const expectedPaths = new Set<string>(["manifest.json", "publication-seal.txt"]);
  let total = manifestBytes.length;
  for (const row of rows) {
    if (!safePath(row.path) || row.path === "manifest.json" || row.path === "publication-seal.txt" || !Number.isInteger(row.bytes) || (row.bytes as number) < 0 || !/^[a-f0-9]{64}$/.test(String(row.sha256)) || expectedPaths.has(row.path)) throw new Error("SNAPSHOT_INTEGRITY_FAILED");
    const entry = entries.get(row.path);
    if (!entry || entry.size !== row.bytes || entry.size > MAX_PACKAGE) throw new Error("SNAPSHOT_INTEGRITY_FAILED");
    const bytes = await blob(entry);
    if (bytes.length !== row.bytes || digest(bytes) !== row.sha256) throw new Error("SNAPSHOT_INTEGRITY_FAILED");
    total += bytes.length;
    if (total > MAX_PACKAGE) throw new Error("SNAPSHOT_INTEGRITY_FAILED");
    expectedPaths.add(row.path);
  }
  const sealEntry = entries.get("publication-seal.txt");
  if (!sealEntry || expectedPaths.size !== entries.size) throw new Error("SNAPSHOT_INTEGRITY_FAILED");
  const seal = (await blob(sealEntry)).toString("utf8");
  const expectedSeal = createHmac("sha256", port.secret).update(makeMarker(port.secret, userId, owner, repo, snapshotId)).update(manifestBytes).digest("hex");
  if (seal !== expectedSeal) throw new Error("SNAPSHOT_INTEGRITY_FAILED");

  const ref = await port.json<{ object?: { sha?: string } }>(`${prefix}/git/ref/heads/${defaultBranch}`);
  const defaultHead = ref.object?.sha ?? "";
  if (!OID.test(defaultHead)) throw new Error("DEFAULT_HEAD_UNPROVABLE");
  if (value.kind === "followup") {
    const compare = await port.json<{ status?: string; ahead_by?: number; behind_by?: number }>(`${prefix}/compare/${snapshotCommit}...${defaultHead}`);
    if (compare.status !== "ahead" || !Number.isInteger(compare.ahead_by) || (compare.ahead_by ?? 0) < 1 || compare.behind_by !== 0) throw new Error("FOLLOWUP_REQUIRES_MERGED_COPILOT_OUTPUT");
    return { baseCommit: defaultHead, defaultBranch, defaultHead };
  }
  return { baseCommit: snapshotCommit, defaultBranch, defaultHead };
}

export async function startPresentationCopilotTask(userId: string, expectedLogin: string, value: CopilotTaskRequest, suppliedPort?: CopilotTaskPort): Promise<CopilotTaskReceipt> {
  if (!copilotTasksEnabled()) throw new Error("COPILOT_TASKS_DISABLED");
  const port = suppliedPort ?? defaultCopilotTaskPort();
  validateCopilotTaskRequest(value);
  const verified = await verifySnapshotCommit(userId, expectedLogin, value, port);
  const kindText = value.kind === "initial" ? "Create a usable project based on the committed presentation snapshot." : "Regenerate or refine the existing project using the updated context below.";
  const prompt = `${kindText}\n\nThe exact verified presentation snapshot is ${value.snapshotId}, stored at base commit ${verified.baseCommit}. Use files in this repository as source of truth. Do not request or expose app credentials. Create a reviewable pull request; do not merge it.\n\nOwner instructions and context:\n${value.prompt.trim()}`;
  const result = await post<{ id?: string; html_url?: string; state?: string }>(port, `/agents/repos/${value.owner}/${value.repo}/tasks`, { prompt, base_ref: verified.baseCommit, create_pull_request: true });
  if (typeof result.id !== "string" || !/^[a-f0-9-]{16,64}$/i.test(result.id) || typeof result.html_url !== "string" || !result.html_url.startsWith(`https://github.com/${value.owner}/${value.repo}/copilot/tasks/`) || typeof result.state !== "string") throw new Error("COPILOT_TASK_RESPONSE_UNPROVABLE");
  return { id: result.id, url: result.html_url, state: result.state, baseCommit: verified.baseCommit };
}

export function defaultCopilotTaskPort(): CopilotTaskPort {
  return { json: (path, init) => ghJson(path, init), secret: githubToken() };
}

export function describeCopilotTaskError(error: unknown): string {
  if (error instanceof Error && error.message === "COPILOT_TASKS_DISABLED") return "Copilot task dispatch is disabled until the immutable-base integration verification has passed.";
  if (error instanceof GithubHttpError && error.status === 403) return "GitHub denied Copilot task access. The current user token must support Copilot cloud agent tasks and have Agent tasks read/write permission.";
  if (error instanceof GithubHttpError && error.status === 422) return "GitHub rejected the Copilot task. Check Copilot plan/repository availability and the supplied commit ref.";
  const code = error instanceof Error ? error.message : "";
  const known: Record<string, string> = {
    ACCOUNT_CHANGED: "The repository owner does not match the reviewed GitHub account.",
    SNAPSHOT_REPOSITORY_CONFLICT: "The selected repository is not the private repository signed for this presentation snapshot.",
    SNAPSHOT_INTEGRITY_FAILED: "The published snapshot failed its manifest or byte-integrity check.",
    FOLLOWUP_REQUIRES_MERGED_COPILOT_OUTPUT: "Merge or commit the prior Copilot output to the repository default branch before starting a follow-up task.",
  };
  return known[code] ?? "Copilot task could not be verified or started. No task status is claimed.";
}
