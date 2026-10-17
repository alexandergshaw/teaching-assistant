import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { digest } from "./repository-snapshot";
import { startPresentationCopilotTask, verifySnapshotCommit, type CopilotTaskPort, type CopilotTaskRequest } from "./copilot-tasks";

const ORIGINAL_ENABLED = process.env.PRESENTATION_COPILOT_TASKS_ENABLED;
const ORIGINAL_TOKEN = process.env.GITHUB_TOKEN;
afterEach(() => {
  if (ORIGINAL_ENABLED === undefined) delete process.env.PRESENTATION_COPILOT_TASKS_ENABLED; else process.env.PRESENTATION_COPILOT_TASKS_ENABLED = ORIGINAL_ENABLED;
  if (ORIGINAL_TOKEN === undefined) delete process.env.GITHUB_TOKEN; else process.env.GITHUB_TOKEN = ORIGINAL_TOKEN;
});

function fixture(options: { followup?: boolean; diverged?: boolean; conflict?: boolean; treeSizes?: Record<string, number | undefined> } = {}) {
  const secret = "test-secret";
  const userId = "user-1";
  const owner = "teacher";
  const repo = "deck-project";
  const snapshotId = "a".repeat(64);
  const snapshotCommit = "b".repeat(40);
  const defaultHead = options.followup ? "c".repeat(40) : snapshotCommit;
  const packageFiles = new Map([
    ["deck.pptx", Buffer.from([0, 1, 2, 255, 4])],
    ["renderer/pptx.mjs", Buffer.from("export const renderer = true;\n")],
  ]);
  const files = [...packageFiles].map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: digest(bytes) }));
  const manifestBytes = Buffer.from(JSON.stringify({ version: 1, snapshot: snapshotId, files }));
  const marker = `Deck snapshot ${createHmac("sha256", secret).update(JSON.stringify([userId, owner, repo, snapshotId])).digest("hex")}`;
  const seal = Buffer.from(createHmac("sha256", secret).update(marker).update(manifestBytes).digest("hex"));
  const packageOids = new Map([...packageFiles.keys()].map((path, index) => [path, String(index + 6).repeat(40)]));
  const blobs = new Map([["d".repeat(40), manifestBytes], ["e".repeat(40), seal], ...[...packageFiles].map(([path, bytes]) => [packageOids.get(path)!, bytes] as const)]);
  const postBodies: unknown[] = [];
  const paths: string[] = [];
  const port: CopilotTaskPort = {
    secret,
    async json<T>(path: string, init?: RequestInit): Promise<T> {
      paths.push(path);
      if (init?.method === "POST") {
        postBodies.push(JSON.parse(String(init.body)));
        return { id: "12345678-1234-1234-1234-123456789abc", html_url: `https://github.com/${owner}/${repo}/copilot/tasks/12345678-1234-1234-1234-123456789abc`, state: "queued" } as T;
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
        return { encoding: "base64", content: bytes.toString("base64") } as T;
      }
      if (path === `/repos/${owner}/${repo}/git/ref/heads/main`) return { object: { sha: defaultHead } } as T;
      if (path === `/repos/${owner}/${repo}/compare/${snapshotCommit}...${defaultHead}`) return options.diverged ? { status: "diverged", ahead_by: 2, behind_by: 1 } as T : { status: "ahead", ahead_by: 2, behind_by: 0 } as T;
      throw new Error(`Unexpected request: ${path}`);
    },
  };
  const value: CopilotTaskRequest = { owner, repo, snapshotId, snapshotCommit, prompt: "Create a course companion with a quiz.", kind: options.followup ? "followup" : "initial" };
  return { userId, owner, repo, snapshotId, snapshotCommit, defaultHead, value, port, postBodies, paths, blobs, manifestBytes, seal, packageFiles };
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
    expect(receipt).toEqual({ id: "12345678-1234-1234-1234-123456789abc", url: `https://github.com/${f.owner}/${f.repo}/copilot/tasks/12345678-1234-1234-1234-123456789abc`, state: "queued", baseCommit: f.snapshotCommit });
    expect(f.postBodies).toHaveLength(1);
    expect(f.postBodies[0]).toMatchObject({ base_ref: f.snapshotCommit, create_pull_request: true });
    expect((f.postBodies[0] as { prompt: string }).prompt).toContain(f.value.prompt);
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

  it("refuses a public or unsigned repository before task submission", async () => {
    process.env.PRESENTATION_COPILOT_TASKS_ENABLED = "true";
    process.env.GITHUB_TOKEN = "configured-user-token";
    const f = fixture({ conflict: true });
    await expect(verifySnapshotCommit(f.userId, f.owner, f.value, f.port)).rejects.toThrow("SNAPSHOT_REPOSITORY_CONFLICT");
    expect(f.postBodies).toHaveLength(0);
  });

  it("refuses follow-up until the original snapshot is ahead of default main", async () => {
    process.env.PRESENTATION_COPILOT_TASKS_ENABLED = "true";
    process.env.GITHUB_TOKEN = "configured-user-token";
    const f = fixture({ followup: true, diverged: true });
    await expect(startPresentationCopilotTask(f.userId, f.owner, f.value, f.port)).rejects.toThrow("FOLLOWUP_REQUIRES_MERGED_COPILOT_OUTPUT");
    expect(f.postBodies).toHaveLength(0);
  });

  it("bases follow-up on the exact current default commit after verified prior output is merged", async () => {
    process.env.PRESENTATION_COPILOT_TASKS_ENABLED = "true";
    process.env.GITHUB_TOKEN = "configured-user-token";
    const f = fixture({ followup: true });
    const receipt = await startPresentationCopilotTask(f.userId, f.owner, f.value, f.port);
    expect(receipt.baseCommit).toBe(f.defaultHead);
    expect(f.postBodies[0]).toMatchObject({ base_ref: f.defaultHead, create_pull_request: true });
  });
});
