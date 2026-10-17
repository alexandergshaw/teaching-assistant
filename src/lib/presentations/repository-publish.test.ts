import { describe, expect, it, vi } from "vitest";
import { publishSnapshot, type PublishPort } from "./repository-publish";
import { buildDeckSnapshot } from "./repository-snapshot";
import { GithubHttpError, EMPTY_GITHUB_HEADERS } from "@/lib/github-http-error";

describe("private publisher", () => {
  it("uses exact base64 blob bytes, private creation, verified commit and idempotent reconciliation", async () => {
    const snapshot = await buildDeckSnapshot({ deck: { presentationTitle: "Deck", slides: [{ title: "A", bullets: ["B"] }] }, context: { text: "", sources: [], objectives: [] }, includeContext: false, templateSelected: false });
    const blobs = new Map<string, string>(); const files = new Map<string, string>();
    let repository: { private: boolean; description: string; default_branch: string } | null = null;
    let head = "initial"; let tree: { path: string; sha: string }[] = [];
    const create = vi.fn(async (_name, opts) => { repository = { private: opts?.private ?? false, description: opts?.description ?? "", default_branch: "main" }; return {} as Awaited<ReturnType<PublishPort["create"]>>; });
    const json = vi.fn(async (path: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (path === "/user") return { login: "owner" };
      if (path === "/repos/owner/deck") { if (!repository) throw new GithubHttpError("missing", 404, EMPTY_GITHUB_HEADERS); return repository; }
      if (path.endsWith("/git/ref/heads/main")) return { object: { sha: head } };
      if (path.endsWith("/git/commits/initial")) return { tree: { sha: "base" } };
      if (path.includes("/contents/")) { const name = path.split("/contents/")[1].split("?")[0]; const content = files.get(name); if (!content) throw new GithubHttpError("missing", 404, EMPTY_GITHUB_HEADERS); return { content, encoding: "base64" }; }
      if (path.endsWith("/git/blobs")) { const sha = "blob" + blobs.size; blobs.set(sha, body.content); expect(body.encoding).toBe("base64"); return { sha }; }
      if (path.endsWith("/git/trees")) { tree = body.tree; return { sha: "tree" }; }
      if (path.endsWith("/git/commits")) return { sha: "commit" };
      if (path.endsWith("/git/refs/heads/main")) { expect(body.force).toBe(false); for (const row of tree) files.set(row.path, blobs.get(row.sha)!); head = body.sha; return {}; }
      throw new Error("Unexpected path");
    });
    const port = { json: json as PublishPort["json"], create, secret: "server-secret" };
    const receipt = await publishSnapshot(snapshot, "deck", "user", "owner", port);
    expect(receipt).toMatchObject({ status: "ready", commit: "commit" });
    expect(Buffer.from(files.get("deck.pptx")!, "base64")).toEqual(snapshot.files.find(f => f.path === "deck.pptx")!.bytes);
    expect(create).toHaveBeenCalledWith("deck", expect.objectContaining({ private: true }));
    const count = blobs.size;
    expect((await publishSnapshot(snapshot, "deck", "user", "owner", port)).status).toBe("ready");
    expect(create).toHaveBeenCalledTimes(1); expect(blobs.size).toBe(count);
    files.set("deck.json", Buffer.from("corrupt").toString("base64"));
    expect((await publishSnapshot(snapshot, "deck", "user", "owner", port)).status).toBe("uncertain");
  });
  it("refuses unrelated/public targets and changed accounts without create or upload", async () => {
    const create = vi.fn();
    const json = vi.fn(async (path: string) => path === "/user" ? { login: "owner" } : { private: false, description: "unrelated" });
    const snapshot = { id: "snapshot", files: [], bytes: 0, slides: 1 };
    const port = { json: json as PublishPort["json"], create, secret: "secret" };
    await expect(publishSnapshot(snapshot, "deck", "user", "other", port)).rejects.toThrow("ACCOUNT_CHANGED");
    await expect(publishSnapshot(snapshot, "deck", "user", "owner", port)).rejects.toThrow("REPOSITORY_CONFLICT");
    expect(create).not.toHaveBeenCalled();
  });
});
