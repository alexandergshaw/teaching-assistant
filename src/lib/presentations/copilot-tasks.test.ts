import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { digest } from "./repository-snapshot";
import { GithubHttpError, EMPTY_GITHUB_HEADERS } from "@/lib/github-http-error";
import { copilotTaskState } from "@/app/components/presentations/pipeline/copilot-task-state";
import { getPresentationCopilotTaskStatus, startPresentationCopilotTask, verifySnapshotCommit, type CopilotTaskPort, type CopilotTaskRequest } from "./copilot-tasks";

const ORIGINAL_ENABLED = process.env.PRESENTATION_COPILOT_TASKS_ENABLED;
const ORIGINAL_TOKEN = process.env.GITHUB_TOKEN;
afterEach(() => {
  if (ORIGINAL_ENABLED === undefined) delete process.env.PRESENTATION_COPILOT_TASKS_ENABLED; else process.env.PRESENTATION_COPILOT_TASKS_ENABLED = ORIGINAL_ENABLED;
  if (ORIGINAL_TOKEN === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = ORIGINAL_TOKEN;
});

function fixture(options: {
  followup?: boolean;
  diverged?: boolean;
  conflict?: boolean;
  treeSizes?: Record<string, number | undefined>;
  lineEnding?: string;
  emptyDeck?: boolean;
  deckContent?: (encoded: string) => string | undefined;
  sourceMissing?: boolean;
  sourceSha?: string;
  sourceCreateStatus?: number;
  documentedUrl?: boolean;
  taskResponse?: Record<string, unknown>;
} = {}) {
  const secret = "test-secret";
  const userId = "user-1";
  const owner = "teacher";
  const repo = "deck-project";
  const snapshotId = "a".repeat(64);
  const snapshotCommit = "b".repeat(40);
  const defaultHead = options.followup ? "f".repeat(40) : snapshotCommit;
  const generatedHead = "c".repeat(40);
  const sourceBranch = `presentation-snapshot-${snapshotCommit}`;
  const previousTaskId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const generatedBranch = "copilot/create-course-companion";
  const task = { id: previousTaskId, html_url: `https://github.com/${owner}/${repo}/tasks/${previousTaskId}`, state: "completed", sessions: [{ base_ref: sourceBranch, head_ref: generatedBranch }] };
  let sourceSha = options.sourceMissing ? undefined : options.sourceSha ?? snapshotCommit;
  const packageFiles = new Map([
    ["deck.pptx", options.emptyDeck ? Buffer.alloc(0) : Buffer.from([0, 1, 2, 255, 4])],
    ["renderer/pptx.mjs", Buffer.from("export const renderer = true;\n")],
  ]);
  const files = [...packageFiles].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: digest(bytes) }));
  const manifestBytes = Buffer.from(JSON.stringify({ version: 1, snapshot: snapshotId, files }));
  const marker = `Deck snapshot ${createHmac("sha256", secret).update(JSON.stringify([userId, owner, repo, snapshotId])).digest("hex")}`;
  const seal = Buffer.from(createHmac("sha256", secret).update(marker).update(manifestBytes).digest("hex"));
  const packageOids = new Map([...packageFiles.keys()].map((path, index) => [path, String(index + 6).repeat(40)]));
  const blobs = new Map([["d".repeat(40), manifestBytes], ["e".repeat(40), seal], ...[...packageFiles].map(([path, bytes]) => [packageOids.get(path)!, bytes] as const)]);
  const postBodies: unknown[] = [];
  const refBodies: unknown[] = [];
  const paths: string[] = [];
  const port: CopilotTaskPort = {
    secret,
    async json<T>(path: string, init?: RequestInit): Promise<T> {
      paths.push(path);
      if (path === `/repos/${owner}/${repo}/git/refs` && init?.method === "POST") {
        refBodies.push(JSON.parse(String(init.body)));
        sourceSha = options.sourceSha ?? snapshotCommit;
        if (options.sourceCreateStatus) throw new GithubHttpError("create refused", options.sourceCreateStatus, EMPTY_GITHUB_HEADERS);
        return {} as T;
      }
      if (init?.method === "POST") {
        postBodies.push(JSON.parse(String(init.body)));
        return { id: "12345678-1234-1234-1234-123456789abc", html_url: `https://github.com/${owner}/${repo}/${options.documentedUrl ? "copilot/tasks" : "tasks"}/12345678-1234-1234-1234-123456789abc`, state: "queued", ...options.taskResponse } as T;
      }
      if (path === `/repos/${owner}/${repo}`) return { private: true, description: options.conflict ? "other" : marker, default_branch: "main" } as T;
      if (path === `/repos/${owner}/${repo}/git/commits/${snapshotCommit}`) return { sha: snapshotCommit, tree: { sha: "1".repeat(40) } } as T;
      if (path === `/repos/${owner}/${repo}/git/trees/${"1".repeat(40)}?recursive=1`) return { truncated: false, tree: [
        { path: "deck.pptx", type: "blob", mode: "100644", sha: packageOids.get("deck.pptx"), size: packageFiles.get("deck.pptx")!.length },
        { path: "renderer", type: "tree", mode: "040000", sha: "9".repeat(40) },
        { path: "renderer/pptx.mjs", type: "blob", mode: "100644", sha: packageOids.get("renderer/pptx.mjs"), size: packageFiles.get("renderer/pptx.mjs")!.length },
        { path: "manifest.json", type: "blob", mode: "100644", sha: "d".repeat(40), size: manifestBytes.length },
        { path: "publication-seal.txt", type: "blob", mode: "100644", sha: "e".repeat(40), size: seal.length },
      ].map(row => Object.hasOwn(options.treeSizes ?? {}, row.path) ? { ...row, size: options.treeSizes![row.path] } : row) } as T;
      if (path.startsWith(`/repos/${owner}/${repo}/git/blobs/`)) {
        const bytes = blobs.get(path.split("/").at(-1)!);
        if (!bytes) throw new Error("unknown blob");
        const encoded = bytes.toString("base64");
        const lineEnding = options.lineEnding ?? "\n";
        const wrapped = encoded ? encoded.match(/.{1,60}/g)!.join(lineEnding) + lineEnding : "";
        return { encoding: "base64", content: path.endsWith(packageOids.get("deck.pptx")!) && options.deckContent ? options.deckContent(encoded) : wrapped } as T;
      }
      if (path === `/repos/${owner}/${repo}/git/ref/heads/main`) return { object: { sha: defaultHead } } as T;
      if (path === `/repos/${owner}/${repo}/git/ref/heads/${sourceBranch}`) {
        if (!sourceSha) throw new GithubHttpError("not found", 404, EMPTY_GITHUB_HEADERS);
        return { ref: `refs/heads/${sourceBranch}`, object: { sha: sourceSha } } as T;
      }
      if (path === `/repos/${owner}/${repo}/git/ref/heads/${generatedBranch}`) return { object: { sha: generatedHead } } as T;
      if (path === `/agents/repos/${owner}/${repo}/tasks/${previousTaskId}`) return task as T;
      if (path === `/repos/${owner}/${repo}/compare/${snapshotCommit}...${generatedHead}`) return options.diverged ? { status: "diverged", ahead_by: 2, behind_by: 1 } as T : { status: "ahead", ahead_by: 2, behind_by: 0 } as T;
      throw new Error(`Unexpected request: ${path}`);
    },
  };
  const value: CopilotTaskRequest = { owner, repo, snapshotId, snapshotCommit, prompt: "Create a course companion with a quiz.", kind: options.followup ? "followup" : "initial", ...(options.followup ? { previousTaskId } : {}) };
  return { userId, owner, repo, snapshotId, snapshotCommit, sourceBranch, previousTaskId, generatedBranch, generatedHead, task, defaultHead, value, port, postBodies, refBodies, paths, blobs, manifestBytes, seal, packageFiles };
}

describe("presentation Copilot tasks", () => {
  it("keeps dispatch disabled by default without making a GitHub request", async () => {
    delete process.env.PRESENTATION_COPILOT_TASKS_ENABLED;
    delete process.env.GITHUB_TOKEN;
    const f = fixture();
    await expect(startPresentationCopilotTask(f.userId, f.owner, f.value)).rejects.toThrow("COPILOT_TASKS_DISABLED");
    expect(f.paths).toEqual([]);
  });

  it("verifies the signed private snapshot and starts a task from its immutable commit", async () => {
    process.env.PRESENTATION_COPILOT_TASKS_ENABLED = "true";
    process.env.GITHUB_TOKEN = "configured-user-token";
    const f = fixture();
    const receipt = await startPresentationCopilotTask(f.userId, f.owner, f.value, f.port);
    expect(receipt).toEqual({ id: "12345678-1234-1234-1234-123456789abc", url: `https://github.com/${f.owner}/${f.repo}/tasks/12345678-1234-1234-1234-123456789abc`, state: "queued", baseCommit: f.snapshotCommit });
    expect(f.postBodies).toHaveLength(1);
    expect(f.postBodies[0]).toMatchObject({ base_ref: f.sourceBranch, create_pull_request: true });
    expect((f.postBodies[0] as { prompt: string }).prompt).toContain(f.value.prompt);
  });

  it.each(["\n", "\r\n", "\r"])("verifies every signed blob with GitHub line wrapping %j", async lineEnding => {
    const f = fixture({ lineEnding });
    await expect(verifySnapshotCommit(f.userId, f.owner, f.value, f.port)).resolves.toEqual({ baseCommit: f.snapshotCommit, defaultBranch: "main", defaultHead: f.defaultHead });
    expect(f.paths.filter(path => path.includes("/git/blobs/"))).toHaveLength(f.blobs.size);
  });

  it.each([
    undefined, "", "AAEC/wQ", "AAEC/wQ==", "AAEC/wQ=garbage", "AAEC_wQ=",
    "AAEC/ Q=", "AAEC/\tQ=", "AAEC/!Q=", "AAEC/wR=", "AAEC/wR=\r\n",
  ])("refuses malformed or noncanonical blob content %j before dispatch", async content => {
    process.env.PRESENTATION_COPILOT_TASKS_ENABLED = "true";
    process.env.GITHUB_TOKEN = "configured-user-token";
    const f = fixture({ deckContent: () => content });
    await expect(startPresentationCopilotTask(f.userId, f.owner, f.value, f.port)).rejects.toThrow("SNAPSHOT_INTEGRITY_FAILED");
    expect(f.postBodies).toEqual([]);
  });

  it("accepts an empty blob only when its zero byte size and digest are signed in the manifest", async () => {
    const f = fixture({ emptyDeck: true });
    await expect(verifySnapshotCommit(f.userId, f.owner, f.value, f.port)).resolves.toMatchObject({ baseCommit: f.snapshotCommit });
  });

  it("refuses nonempty bytes for a signed empty blob", async () => {
    const f = fixture({ emptyDeck: true, deckContent: () => "AA==\n" });
    await expect(verifySnapshotCommit(f.userId, f.owner, f.value, f.port)).rejects.toThrow("SNAPSHOT_INTEGRITY_FAILED");
    expect(f.postBodies).toEqual([]);
  });

  it.each(["manifest.json", "publication-seal.txt", "deck.pptx", "renderer/pptx.mjs"])("refuses oversized %s before fetching any blob", async path => {
    const f = fixture({ treeSizes: { [path]: 8 * 1024 * 1024 + 1 } });
    await expect(verifySnapshotCommit(f.userId, f.owner, f.value, f.port)).rejects.toThrow("SNAPSHOT_INTEGRITY_FAILED");
    expect(f.paths.filter(request => request.includes("/git/blobs/"))).toEqual([]);
    expect(f.postBodies).toEqual([]);
  });

  it("counts manifest and seal bytes in the aggregate before fetching any blob", async () => {
    const reference = fixture();
    const otherBytes = reference.manifestBytes.length + reference.seal.length + reference.packageFiles.get("renderer/pptx.mjs")!.length;
    const f = fixture({ treeSizes: { "deck.pptx": 8 * 1024 * 1024 - otherBytes + 1 } });
    await expect(verifySnapshotCommit(f.userId, f.owner, f.value, f.port)).rejects.toThrow("SNAPSHOT_INTEGRITY_FAILED");
    expect(f.paths.filter(request => request.includes("/git/blobs/"))).toEqual([]);
    expect(f.postBodies).toEqual([]);
  });

  it.each([undefined, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("refuses invalid declared blob size %s before fetching any blob", async size => {
    const f = fixture({ treeSizes: { "publication-seal.txt": size } });
    await expect(verifySnapshotCommit(f.userId, f.owner, f.value, f.port)).rejects.toThrow("SNAPSHOT_TREE_UNPROVABLE");
    expect(f.paths.filter(request => request.includes("/git/blobs/"))).toEqual([]);
  });

  it.each(["manifest.json", "publication-seal.txt"])("refuses %s when decoded bytes differ from its declared tree size", async path => {
    const reference = fixture();
    const actualSize = path === "manifest.json" ? reference.manifestBytes.length : reference.seal.length;
    const f = fixture({ treeSizes: { [path]: actualSize + 1 } });
    await expect(verifySnapshotCommit(f.userId, f.owner, f.value, f.port)).rejects.toThrow("SNAPSHOT_INTEGRITY_FAILED");
    expect(f.paths.some(request => request.endsWith(`/git/blobs/${(path === "manifest.json" ? "d" : "e").repeat(40)}`))).toBe(true);
    expect(f.postBodies).toEqual([]);
  });

  it("refuses decoded package bytes that differ from the signed manifest and tree size", async () => {
    const f = fixture();
    f.blobs.set("6".repeat(40), Buffer.from([0, 1]));
    await expect(verifySnapshotCommit(f.userId, f.owner, f.value, f.port)).rejects.toThrow("SNAPSHOT_INTEGRITY_FAILED");
    expect(f.paths.some(request => request.endsWith(`/git/blobs/${"6".repeat(40)}`))).toBe(true);
    expect(f.postBodies).toEqual([]);
  });

  it.each(["payload", "seal"])("refuses same-size tampering of the wrapped %s", async target => {
    const f = fixture();
    const oid = (target === "payload" ? "6" : "e").repeat(40);
    const original = f.blobs.get(oid)!;
    const altered = Buffer.from(original);
    altered[0] ^= 1;
    f.blobs.set(oid, altered);
    await expect(verifySnapshotCommit(f.userId, f.owner, f.value, f.port)).rejects.toThrow("SNAPSHOT_INTEGRITY_FAILED");
    expect(f.postBodies).toEqual([]);
  });

  it("refuses a public or unsigned repository before task submission", async () => {
    process.env.PRESENTATION_COPILOT_TASKS_ENABLED = "true";
    process.env.GITHUB_TOKEN = "configured-user-token";
    const f = fixture({ conflict: true });
    await expect(verifySnapshotCommit(f.userId, f.owner, f.value, f.port)).rejects.toThrow("SNAPSHOT_REPOSITORY_CONFLICT");
    expect(f.postBodies).toHaveLength(0);
  });

  it("refuses a generated branch that diverged from the signed snapshot", async () => {
    process.env.PRESENTATION_COPILOT_TASKS_ENABLED = "true";
    process.env.GITHUB_TOKEN = "configured-user-token";
    const f = fixture({ followup: true, diverged: true });
    await expect(startPresentationCopilotTask(f.userId, f.owner, f.value, f.port)).rejects.toThrow("COPILOT_TASK_SOURCE_UNPROVABLE");
    expect(f.postBodies).toHaveLength(0);
  });

  it("continues the actual generated branch from the same pinned source without merging default", async () => {
    process.env.PRESENTATION_COPILOT_TASKS_ENABLED = "true";
    process.env.GITHUB_TOKEN = "configured-user-token";
    const f = fixture({ followup: true });
    const receipt = await startPresentationCopilotTask(f.userId, f.owner, f.value, f.port);
    expect(receipt.baseCommit).toBe(f.snapshotCommit);
    expect(f.postBodies[0]).toMatchObject({ base_ref: f.sourceBranch, head_ref: f.generatedBranch, create_pull_request: true });
    expect(f.paths).toContain(`/repos/${f.owner}/${f.repo}/compare/${f.snapshotCommit}...${"c".repeat(40)}`);
    expect(f.paths).not.toContain(`/repos/${f.owner}/${f.repo}/compare/${f.snapshotCommit}...${f.defaultHead}`);
    const prompt = (f.postBodies[0] as { prompt: string }).prompt;
    for (const context of [f.previousTaskId, f.generatedBranch, f.generatedHead, f.sourceBranch, f.snapshotId, f.snapshotCommit, f.value.prompt]) expect(prompt).toContain(context);
    expect(prompt).not.toContain(f.defaultHead);
    expect(prompt).toContain("even if there are no pull request review comments");
    expect(prompt).toContain("Use repository tools to inspect, implement and validate");
    expect(prompt).toContain("Commit needed changes to this branch and update its existing pull request");
    expect(prompt).toContain("do not create another project, branch or pull request");
    expect(prompt).toContain("preserve the snapshot inputs");
    expect(prompt).toContain("If a retry finds the requested change already present, validate it and report that evidence without duplicating content or creating an empty commit");
    expect(prompt).not.toContain("Create a reviewable pull request");
  });

  it("creates and reads back only a missing pinned ref before dispatch", async () => {
    process.env.PRESENTATION_COPILOT_TASKS_ENABLED = "true";
    process.env.GITHUB_TOKEN = "configured-user-token";
    const f = fixture({ sourceMissing: true });
    await startPresentationCopilotTask(f.userId, f.owner, f.value, f.port);
    expect(f.refBodies).toEqual([{ ref: `refs/heads/${f.sourceBranch}`, sha: f.snapshotCommit }]);
    expect(f.postBodies[0]).toMatchObject({ base_ref: f.sourceBranch });
  });

  it("refuses an existing source ref at another commit without moving or dispatching", async () => {
    process.env.PRESENTATION_COPILOT_TASKS_ENABLED = "true";
    process.env.GITHUB_TOKEN = "configured-user-token";
    const f = fixture({ sourceSha: "f".repeat(40) });
    await expect(startPresentationCopilotTask(f.userId, f.owner, f.value, f.port)).rejects.toThrow("SNAPSHOT_SOURCE_REF_CONFLICT");
    expect(f.refBodies).toEqual([]);
    expect(f.postBodies).toEqual([]);
  });

  it("reconciles a concurrent source create only when the read-back commit matches", async () => {
    process.env.PRESENTATION_COPILOT_TASKS_ENABLED = "true";
    process.env.GITHUB_TOKEN = "configured-user-token";
    const matching = fixture({ sourceMissing: true, sourceCreateStatus: 422 });
    await expect(startPresentationCopilotTask(matching.userId, matching.owner, matching.value, matching.port)).resolves.toMatchObject({ baseCommit: matching.snapshotCommit });
    const conflicting = fixture({ sourceMissing: true, sourceCreateStatus: 422, sourceSha: "f".repeat(40) });
    await expect(startPresentationCopilotTask(conflicting.userId, conflicting.owner, conflicting.value, conflicting.port)).rejects.toThrow("SNAPSHOT_SOURCE_REF_CONFLICT");
    expect(conflicting.postBodies).toEqual([]);
  });

  it("does not treat a source creation permission failure as successful reconciliation", async () => {
    process.env.PRESENTATION_COPILOT_TASKS_ENABLED = "true";
    process.env.GITHUB_TOKEN = "configured-user-token";
    const f = fixture({ sourceMissing: true, sourceCreateStatus: 403 });
    await expect(startPresentationCopilotTask(f.userId, f.owner, f.value, f.port)).rejects.toThrow("create refused");
    expect(f.postBodies).toEqual([]);
  });

  it("accepts the documented exact same-repository task URL", async () => {
    process.env.PRESENTATION_COPILOT_TASKS_ENABLED = "true";
    process.env.GITHUB_TOKEN = "configured-user-token";
    const f = fixture({ documentedUrl: true });
    await expect(startPresentationCopilotTask(f.userId, f.owner, f.value, f.port)).resolves.toMatchObject({ url: expect.stringContaining("/copilot/tasks/") });
  });

  it.each([
    "https://github.com/foreign/deck-project/tasks/12345678-1234-1234-1234-123456789abc",
    "https://github.com/teacher/other/tasks/12345678-1234-1234-1234-123456789abc",
    "https://github.com/teacher/deck-project/tasks/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    "https://github.com/teacher/deck-project/tasks/12345678-1234-1234-1234-123456789abc/extra",
    "https://github.com/teacher/deck-project/tasks/12345678-1234-1234-1234-123456789abc?next=elsewhere",
  ])("refuses an unbound task response URL %s", async html_url => {
    process.env.PRESENTATION_COPILOT_TASKS_ENABLED = "true";
    process.env.GITHUB_TOKEN = "configured-user-token";
    const f = fixture({ taskResponse: { html_url } });
    await expect(startPresentationCopilotTask(f.userId, f.owner, f.value, f.port)).rejects.toThrow("COPILOT_TASK_RESPONSE_UNPROVABLE");
  });

  it.each(["../main", "main?ref=other", "copilot//branch", "copilot/.hidden", "copilot/branch.lock", "main"])("refuses unsafe or non-generated prior head %s", async head_ref => {
    process.env.PRESENTATION_COPILOT_TASKS_ENABLED = "true";
    process.env.GITHUB_TOKEN = "configured-user-token";
    const f = fixture({ followup: true });
    f.task.sessions[0].head_ref = head_ref;
    await expect(startPresentationCopilotTask(f.userId, f.owner, f.value, f.port)).rejects.toThrow("COPILOT_TASK_SOURCE_UNPROVABLE");
    expect(f.postBodies).toEqual([]);
  });

  it.each(["in_progress", "queued", "failed", "waiting_for_user"])("refuses continuation while prior task state is %s", async state => {
    process.env.PRESENTATION_COPILOT_TASKS_ENABLED = "true";
    process.env.GITHUB_TOKEN = "configured-user-token";
    const f = fixture({ followup: true });
    f.task.state = state;
    await expect(startPresentationCopilotTask(f.userId, f.owner, f.value, f.port)).rejects.toThrow("FOLLOWUP_TASK_NOT_READY");
    expect(f.postBodies).toEqual([]);
  });

  it("refuses a foreign source session before following its head", async () => {
    process.env.PRESENTATION_COPILOT_TASKS_ENABLED = "true";
    process.env.GITHUB_TOKEN = "configured-user-token";
    const f = fixture({ followup: true });
    f.task.sessions[0].base_ref = "main";
    await expect(startPresentationCopilotTask(f.userId, f.owner, f.value, f.port)).rejects.toThrow("COPILOT_TASK_SOURCE_UNPROVABLE");
    expect(f.postBodies).toEqual([]);
  });

  it.each([undefined, "../other", "not-a-task-id"])("refuses absent or invalid continuation ID %s before any GitHub request", async previousTaskId => {
    process.env.PRESENTATION_COPILOT_TASKS_ENABLED = "true";
    process.env.GITHUB_TOKEN = "configured-user-token";
    const f = fixture({ followup: true });
    await expect(startPresentationCopilotTask(f.userId, f.owner, { ...f.value, previousTaskId }, f.port)).rejects.toThrow("INVALID_PREVIOUS_TASK");
    expect(f.paths).toEqual([]);
  });

  it("refreshes only a snapshot-bound task with no writes while dispatch is disabled", async () => {
    delete process.env.PRESENTATION_COPILOT_TASKS_ENABLED;
    const f = fixture();
    f.task.state = "in_progress";
    await expect(getPresentationCopilotTaskStatus(f.userId, f.owner, { ...f.value, taskId: f.previousTaskId }, f.port)).resolves.toMatchObject({ id: f.previousTaskId, state: "in_progress", baseCommit: f.snapshotCommit });
    expect(f.postBodies).toEqual([]);
    expect(f.refBodies).toEqual([]);
  });

  it("does not create a source ref during status refresh", async () => {
    const f = fixture({ sourceMissing: true });
    await expect(getPresentationCopilotTaskStatus(f.userId, f.owner, { ...f.value, taskId: f.previousTaskId }, f.port)).rejects.toThrow("not found");
    expect(f.refBodies).toEqual([]);
    expect(f.postBodies).toEqual([]);
  });

  it.each(["failed", "cancelled", "timed_out"])("refreshes queued to sessionless %s, enables initial retry and refuses continuation", async state => {
    process.env.PRESENTATION_COPILOT_TASKS_ENABLED = "true";
    process.env.GITHUB_TOKEN = "configured-user-token";
    const f = fixture();
    const persisted = { id: f.previousTaskId, state: "queued" };
    expect(copilotTaskState(persisted.state)).toEqual({ running: true, canFollowup: false });
    f.task.state = state;
    f.task.sessions = [];
    const refreshed = await getPresentationCopilotTaskStatus(f.userId, f.owner, { ...f.value, taskId: persisted.id }, f.port);
    expect(refreshed).toMatchObject({ id: persisted.id, state });
    expect(copilotTaskState(refreshed.state)).toEqual({ running: false, canFollowup: false });
    expect(f.postBodies).toEqual([]);
    expect(f.refBodies).toEqual([]);
    await expect(startPresentationCopilotTask(f.userId, f.owner, { ...f.value, kind: "followup", previousTaskId: persisted.id }, f.port)).rejects.toThrow("COPILOT_TASK_SOURCE_UNPROVABLE");
    expect(f.postBodies).toEqual([]);
    await expect(startPresentationCopilotTask(f.userId, f.owner, f.value, f.port)).resolves.toMatchObject({ state: "queued" });
    expect(f.postBodies).toHaveLength(1);
  });

  it.each(["foreign-id", "foreign-url"])("still refuses sessionless terminal status with %s", async fault => {
    const f = fixture();
    f.task.state = "failed";
    f.task.sessions = [];
    if (fault === "foreign-id") f.task.id = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    else f.task.html_url = `https://github.com/foreign/repo/tasks/${f.previousTaskId}`;
    await expect(getPresentationCopilotTaskStatus(f.userId, f.owner, { ...f.value, taskId: f.previousTaskId }, f.port)).rejects.toThrow("COPILOT_TASK_RESPONSE_UNPROVABLE");
    expect(f.postBodies).toEqual([]);
  });

  it.each(["foreign-id", "foreign-url", "foreign-source", "no-session"])("refuses unbound status %s", async fault => {
    const f = fixture();
    if (fault === "foreign-id") f.task.id = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    if (fault === "foreign-url") f.task.html_url = `https://github.com/foreign/repo/tasks/${f.previousTaskId}`;
    if (fault === "foreign-source") f.task.sessions[0].base_ref = "main";
    if (fault === "no-session") f.task.sessions = [];
    await expect(getPresentationCopilotTaskStatus(f.userId, f.owner, { ...f.value, taskId: f.previousTaskId }, f.port)).rejects.toThrow();
    expect(f.postBodies).toEqual([]);
  });
});
