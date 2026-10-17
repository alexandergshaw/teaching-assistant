import { createHmac } from "node:crypto";
import { ghJson, githubToken, createRepo } from "@/lib/github.repos";
import { GithubHttpError } from "@/lib/github-http-error";
import { digest, type DeckSnapshot } from "./repository-snapshot";

export interface RepositoryReceipt {
  status: "ready" | "uncertain";
  snapshot: string;
  repoUrl: string;
  commit?: string;
  phase: "create" | "upload" | "verify" | "ready";
}
export interface PublishPort {
  json: <T>(path: string, init?: RequestInit) => Promise<T>;
  create: typeof createRepo;
  secret: string;
}
export function defaultPublishPort(): PublishPort {
  const deadline = Date.now() + 45_000;
  return { json: (path, init) => ghJson(path, { ...init, signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) }), create: createRepo, secret: githubToken() };
}
export async function publisherLogin(port = defaultPublishPort()): Promise<string> {
  const user = await port.json<{ login?: string }>("/user");
  if (!user.login || !/^[A-Za-z0-9-]+$/.test(user.login)) throw new Error("INVALID_GITHUB_ACCOUNT");
  return user.login;
}
function post(body: unknown): RequestInit { return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }; }
function absent(error: unknown): boolean { return error instanceof GithubHttpError && error.status === 404; }

/** Only repositories bearing this owner's signed snapshot marker may be resumed. */
export async function publishSnapshot(snapshot: DeckSnapshot, name: string, userId: string, expectedLogin: string, port = defaultPublishPort()): Promise<RepositoryReceipt> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(name)) throw new Error("INVALID_REPO_NAME");
  const owner = await publisherLogin(port);
  if (owner !== expectedLogin) throw new Error("ACCOUNT_CHANGED");
  const marker = "Deck snapshot " + createHmac("sha256", port.secret).update(JSON.stringify([userId, owner, name, snapshot.id])).digest("hex");
  const path = `/repos/${owner}/${name}`;
  const repoUrl = `https://github.com/${owner}/${name}`;
  let phase: RepositoryReceipt["phase"] = "create";
  try {
    let repository: { private?: boolean; description?: string; default_branch?: string };
    try { repository = await port.json(path); }
    catch (error) {
      if (!absent(error)) throw error;
      await port.create(name, { private: true, autoInit: true, description: marker });
      repository = await port.json(path);
    }
    if (!repository.private || repository.description !== marker) throw new Error("REPOSITORY_CONFLICT");
    const branch = repository.default_branch;
    if (!branch || !/^[A-Za-z0-9._/-]+$/.test(branch) || branch.includes("..")) throw new Error("INVALID_BRANCH");
    const refPath = `${path}/git/ref/heads/${branch}`;
    let head = await port.json<{ object: { sha: string } }>(refPath);
    async function verify(commit: string): Promise<boolean> {
      phase = "verify";
      let manifestFile: { content?: string };
      try { manifestFile = await port.json(`${path}/contents/manifest.json?ref=${encodeURIComponent(commit)}`); }
      catch (error) { if (absent(error)) return false; throw error; }
      const manifest = JSON.parse(Buffer.from(manifestFile.content ?? "", "base64").toString("utf8"));
      const seal = await port.json<{ content?: string }>(`${path}/contents/publication-seal.txt?ref=${encodeURIComponent(commit)}`);
      const expectedSeal = createHmac("sha256", port.secret).update(marker).update(Buffer.from(manifestFile.content ?? "", "base64")).digest("hex");
      if (Buffer.from(seal.content ?? "", "base64").toString("utf8") !== expectedSeal) throw new Error("MANIFEST_CONFLICT");
      if (manifest.snapshot !== snapshot.id || !Array.isArray(manifest.files) || manifest.files.length !== snapshot.files.length - 1) throw new Error("MANIFEST_CONFLICT");
      for (const expected of snapshot.files.filter(f => f.path !== "manifest.json")) {
        const row = manifest.files.find((f: { path: string }) => f.path === expected.path);
        if (!row || typeof row.sha256 !== "string" || row.bytes > 8 * 1024 * 1024) throw new Error("MANIFEST_CONFLICT");
        let remote = await port.json<{ content?: string; encoding?: string; sha?: string }>(`${path}/contents/${expected.path}?ref=${encodeURIComponent(commit)}`);
        // Contents may omit base64 for larger files; Git blobs preserve binary bytes.
        if (remote.encoding !== "base64" && remote.sha && /^[a-f0-9]{40,64}$/.test(remote.sha)) remote = await port.json(`${path}/git/blobs/${remote.sha}`);
        const bytes = Buffer.from(remote.content ?? "", "base64");
        if (remote.encoding !== "base64" || digest(bytes) !== row.sha256 || bytes.length !== row.bytes) throw new Error("VERIFY_FAILED");
        // PPTX ZIP timestamps may differ across retries; other package bytes must match.
        if (expected.path !== "deck.pptx" && digest(expected.bytes) !== row.sha256) throw new Error("SNAPSHOT_CONFLICT");
      }
      return true;
    }
    if (await verify(head.object.sha)) return { status: "ready", snapshot: snapshot.id, repoUrl, commit: head.object.sha, phase: "ready" };
    phase = "upload";
    const base = await port.json<{ tree: { sha: string } }>(`${path}/git/commits/${head.object.sha}`);
    const tree: { path: string; mode: "100644"; type: "blob"; sha: string }[] = [];
    const manifest = snapshot.files.find(f => f.path === "manifest.json");
    if (!manifest) throw new Error("MANIFEST_CONFLICT");
    const seal = Buffer.from(createHmac("sha256", port.secret).update(marker).update(manifest.bytes).digest("hex"));
    for (const file of [...snapshot.files, { path: "publication-seal.txt", bytes: seal }]) {
      const blob = await port.json<{ sha: string }>(`${path}/git/blobs`, post({ content: file.bytes.toString("base64"), encoding: "base64" }));
      tree.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    const nextTree = await port.json<{ sha: string }>(`${path}/git/trees`, post({ base_tree: base.tree.sha, tree }));
    const commit = await port.json<{ sha: string }>(`${path}/git/commits`, post({ message: "Publish frozen deck snapshot", tree: nextTree.sha, parents: [head.object.sha] }));
    await port.json(`${path}/git/refs/heads/${branch}`, { ...post({ sha: commit.sha, force: false }), method: "PATCH" });
    head = await port.json(refPath);
    if (head.object.sha !== commit.sha || !await verify(commit.sha)) throw new Error("VERIFY_FAILED");
    return { status: "ready", snapshot: snapshot.id, repoUrl, commit: commit.sha, phase: "ready" };
  } catch (error) {
    if (error instanceof Error && ["REPOSITORY_CONFLICT", "INVALID_BRANCH", "MANIFEST_CONFLICT", "SNAPSHOT_CONFLICT"].includes(error.message)) throw error;
    return { status: "uncertain", snapshot: snapshot.id, repoUrl, phase };
  }
}
