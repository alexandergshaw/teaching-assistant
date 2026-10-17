import { createHmac } from "node:crypto";
import { ghJson, githubToken } from "@/lib/github.repos";
import { GithubHttpError } from "@/lib/github-http-error";
import { digest } from "./repository-snapshot";

export interface CopilotTaskPort {
  json: <T>(path: string, init?: RequestInit) => Promise<T>;
  secret: string;
}
export interface CopilotTaskReceipt { id: string; url: string; state: string; baseCommit: string }
export interface CopilotSnapshotReference {
  owner: string;
  repo: string;
  snapshotId: string;
  snapshotCommit: string;
}
export interface CopilotTaskRequest extends CopilotSnapshotReference {
  prompt: string;
  kind: "initial" | "followup";
  previousTaskId?: string;
}
export interface CopilotTaskStatusRequest extends CopilotSnapshotReference { taskId: string }
const MAX_PROMPT = 20_000;
const MAX_PACKAGE = 8 * 1024 * 1024;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const REPO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const TASK_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TASK_STATES = new Set(["queued", "in_progress", "completed", "failed", "idle", "waiting_for_user", "timed_out", "cancelled"]);

export function copilotTasksEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PRESENTATION_COPILOT_TASKS_ENABLED === "true" && !!env.GITHUB_TOKEN?.trim();
}

function validateSnapshotReference(value: CopilotSnapshotReference): void {
  if (!REPO.test(value.owner) || !REPO.test(value.repo) || !OID.test(value.snapshotId) || !OID.test(value.snapshotCommit)) throw new Error("INVALID_SNAPSHOT_REFERENCE");
}
export function validateCopilotTaskRequest(value: CopilotTaskRequest): void {
  validateSnapshotReference(value);
  if (typeof value.prompt !== "string" || !value.prompt.trim() || value.prompt.length > MAX_PROMPT) throw new Error("INVALID_PROMPT");
  if (value.kind !== "initial" && value.kind !== "followup") throw new Error("INVALID_TASK_KIND");
  if (value.previousTaskId !== undefined && !TASK_ID.test(value.previousTaskId) || value.kind === "followup" && !value.previousTaskId) throw new Error("INVALID_PREVIOUS_TASK");
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
  if (typeof value !== "string") throw new Error("SNAPSHOT_INTEGRITY_FAILED");
  // GitHub wraps Git blob content with line breaks; other whitespace is invalid.
  const encoded = value.replace(/[\r\n]/g, "");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error("SNAPSHOT_INTEGRITY_FAILED");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.toString("base64") !== encoded) throw new Error("SNAPSHOT_INTEGRITY_FAILED");
  return bytes;
}
function post<T>(port: CopilotTaskPort, path: string, body: unknown): Promise<T> {
  return port.json<T>(path, request("POST", body));
}

/** Verify the authenticated, signed package commit before any Copilot task egress. */
export async function verifySnapshotCommit(userId: string, expectedLogin: string, value: CopilotSnapshotReference, port: CopilotTaskPort): Promise<{ baseCommit: string; defaultBranch: string; defaultHead: string }> {
  validateSnapshotReference(value);
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
  return { baseCommit: snapshotCommit, defaultBranch, defaultHead };
}

function sourceBranch(commit: string): string { return `presentation-snapshot-${commit}`; }
function safeBranch(value: unknown): value is string {
  return typeof value === "string" && value.length <= 255 && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) && !value.includes("..") && !value.includes("//") && value.split("/").every(part => !!part && !part.startsWith(".") && !part.endsWith(".") && !part.endsWith(".lock"));
}
async function pinnedSource(value: CopilotSnapshotReference, port: CopilotTaskPort, create: boolean): Promise<string> {
  const branch = sourceBranch(value.snapshotCommit);
  const prefix = `/repos/${value.owner}/${value.repo}`;
  const read = () => port.json<{ ref?: string; object?: { sha?: string } }>(`${prefix}/git/ref/heads/${branch}`);
  let ref;
  try { ref = await read(); }
  catch (error) {
    if (!create || !(error instanceof GithubHttpError) || error.status !== 404) throw error;
    try { await post(port, `${prefix}/git/refs`, { ref: `refs/heads/${branch}`, sha: value.snapshotCommit }); }
    catch (error) { if (!(error instanceof GithubHttpError) || error.status !== 422) throw error; }
    ref = await read();
  }
  if (ref.ref !== `refs/heads/${branch}` || ref.object?.sha !== value.snapshotCommit) throw new Error("SNAPSHOT_SOURCE_REF_CONFLICT");
  return branch;
}
function receipt(result: { id?: unknown; html_url?: unknown; state?: unknown }, value: CopilotSnapshotReference, taskId?: string): CopilotTaskReceipt {
  if (typeof result.id !== "string" || !TASK_ID.test(result.id) || taskId !== undefined && result.id !== taskId || typeof result.state !== "string" || !TASK_STATES.has(result.state)) throw new Error("COPILOT_TASK_RESPONSE_UNPROVABLE");
  const prefix = `https://github.com/${value.owner}/${value.repo}`;
  if (result.html_url !== `${prefix}/tasks/${result.id}` && result.html_url !== `${prefix}/copilot/tasks/${result.id}`) throw new Error("COPILOT_TASK_RESPONSE_UNPROVABLE");
  return { id: result.id, url: result.html_url as string, state: result.state, baseCommit: value.snapshotCommit };
}
async function readTask(value: CopilotSnapshotReference, taskId: string, port: CopilotTaskPort, lifecycleOnly = false): Promise<{ task: CopilotTaskReceipt; head?: string }> {
  if (!TASK_ID.test(taskId)) throw new Error("INVALID_PREVIOUS_TASK");
  const result = await port.json<{ id?: unknown; html_url?: unknown; state?: unknown; sessions?: Array<{ base_ref?: unknown; head_ref?: unknown }> }>(`/agents/repos/${value.owner}/${value.repo}/tasks/${taskId}`, request("GET"));
  const task = receipt(result, value, taskId);
  // A bootstrap failure can terminate before GitHub creates a worker session.
  // Its lifecycle is readable, but it provides no source/head proof for continuation.
  if (lifecycleOnly && ["failed", "cancelled", "timed_out"].includes(task.state) && Array.isArray(result.sessions) && result.sessions.length === 0) return { task };
  if (!Array.isArray(result.sessions) || result.sessions.length === 0 || result.sessions.some(session => !session || session.base_ref !== sourceBranch(value.snapshotCommit) || !safeBranch(session.head_ref))) throw new Error("COPILOT_TASK_SOURCE_UNPROVABLE");
  const head = result.sessions.at(-1)!.head_ref as string;
  if (result.sessions.some(session => session.head_ref !== head) || head === sourceBranch(value.snapshotCommit)) throw new Error("COPILOT_TASK_SOURCE_UNPROVABLE");
  return { task, head };
}

/** Read status without creating refs or dispatching tasks, even while dispatch is disabled. */
export async function getPresentationCopilotTaskStatus(userId: string, expectedLogin: string, value: CopilotTaskStatusRequest, suppliedPort?: CopilotTaskPort): Promise<CopilotTaskReceipt> {
  if (!TASK_ID.test(value.taskId)) throw new Error("INVALID_PREVIOUS_TASK");
  const port = suppliedPort ?? defaultCopilotTaskPort();
  await verifySnapshotCommit(userId, expectedLogin, value, port);
  await pinnedSource(value, port, false);
  return (await readTask(value, value.taskId, port, true)).task;
}

export async function startPresentationCopilotTask(userId: string, expectedLogin: string, value: CopilotTaskRequest, suppliedPort?: CopilotTaskPort): Promise<CopilotTaskReceipt> {
  if (!copilotTasksEnabled()) throw new Error("COPILOT_TASKS_DISABLED");
  const port = suppliedPort ?? defaultCopilotTaskPort();
  validateCopilotTaskRequest(value);
  const verified = await verifySnapshotCommit(userId, expectedLogin, value, port);
  const branch = await pinnedSource(value, port, value.kind === "initial");
  let head: string | undefined;
  let continuation = "";
  if (value.kind === "followup") {
    const previous = await readTask(value, value.previousTaskId!, port);
    if (previous.task.state !== "completed" && previous.task.state !== "idle") throw new Error("FOLLOWUP_TASK_NOT_READY");
    if (!previous.head || previous.head === verified.defaultBranch) throw new Error("COPILOT_TASK_SOURCE_UNPROVABLE");
    const ref = await port.json<{ object?: { sha?: string } }>(`/repos/${value.owner}/${value.repo}/git/ref/heads/${previous.head}`);
    const sha = ref.object?.sha;
    if (!sha || !OID.test(sha)) throw new Error("COPILOT_TASK_SOURCE_UNPROVABLE");
    const compare = await port.json<{ status?: string; ahead_by?: number; behind_by?: number }>(`/repos/${value.owner}/${value.repo}/compare/${value.snapshotCommit}...${sha}`);
    if (compare.status !== "ahead" || !Number.isSafeInteger(compare.ahead_by) || (compare.ahead_by ?? 0) < 1 || compare.behind_by !== 0) throw new Error("COPILOT_TASK_SOURCE_UNPROVABLE");
    head = previous.head;
    continuation = `Continue prior task ${previous.task.id} on the existing generated branch ${head}, observed at commit ${sha}. Its ancestry was verified against the signed snapshot source ${branch}. Inspect the checked-out branch and current files before editing; retain existing generated work and preserve the snapshot inputs. Apply the owner instructions below as an actionable change request to this existing project, even if there are no pull request review comments. Use repository tools to inspect, implement and validate the requested change. Commit needed changes to this branch and update its existing pull request for review; do not create another project, branch or pull request, and do not merge. If a retry finds the requested change already present, validate it and report that evidence without duplicating content or creating an empty commit.`;
    await pinnedSource(value, port, false);
  }
  const kindText = value.kind === "initial" ? "Create a usable project based on the committed presentation snapshot." : continuation;
  const reviewText = value.kind === "initial" ? " Create a reviewable pull request; do not merge it." : "";
  const prompt = `${kindText}\n\nThe exact verified presentation snapshot is ${value.snapshotId}, stored at base commit ${verified.baseCommit}. Use files in this repository as source of truth. Do not request or expose app credentials.${reviewText}\n\nOwner instructions and context:\n${value.prompt.trim()}`;
  const result = await post<{ id?: string; html_url?: string; state?: string }>(port, `/agents/repos/${value.owner}/${value.repo}/tasks`, { prompt, base_ref: branch, ...(head ? { head_ref: head } : {}), create_pull_request: true });
  return receipt(result, value);
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
    SNAPSHOT_SOURCE_REF_CONFLICT: "The snapshot source branch changed. No task was started and the app will not move that branch.",
    COPILOT_TASK_SOURCE_UNPROVABLE: "The task's source or generated branch could not be bound to this verified snapshot.",
    FOLLOWUP_TASK_NOT_READY: "Refresh task status and wait for the prior task to complete or become idle before starting a follow-up.",
    INVALID_PREVIOUS_TASK: "Select the prior task for this repository snapshot before starting a follow-up.",
  };
  return known[code] ?? "Copilot task could not be verified or started. No task status is claimed.";
}
