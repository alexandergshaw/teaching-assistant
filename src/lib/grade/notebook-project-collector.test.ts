import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ tree: vi.fn(), bytes: vi.fn() }));
vi.mock("../github.files", () => ({ getRepoTreeWithMeta: mocks.tree, getFileBytes: mocks.bytes }));
import { collectNotebookProject } from "./notebook-project-collector";
const commit = "a".repeat(40), content = Buffer.from([0, 255, 128]);
const sha = createHash("sha1").update(`blob ${content.length}\0`).update(content).digest("hex");
beforeEach(() => { vi.clearAllMocks(); mocks.tree.mockResolvedValue({ entries: [{ path: "data/model.npz", type: "blob", mode: "100644", size: content.length, sha }], truncated: false, unenumerated: false, excluded: [] }); mocks.bytes.mockResolvedValue(content); });
it("preserves pinned binary asset bytes", async () => {
  expect(await collectNotebookProject("owner", "repo", commit, Date.now() + 10_000)).toEqual([{ path: "data/model.npz", content }]);
  expect(mocks.bytes).toHaveBeenCalledWith("owner", "repo", "data/model.npz", commit, expect.anything(), content.length);
});
it("rejects wrong bytes instead of silently staging them", async () => {
  mocks.bytes.mockResolvedValue(Buffer.from([1, 2, 3]));
  await expect(collectNotebookProject("owner", "repo", commit, Date.now() + 10_000)).rejects.toThrow(/integrity/);
});
it("rejects incomplete trees and symlink entries", async () => {
  mocks.tree.mockResolvedValueOnce({ entries: [], truncated: true, unenumerated: false, excluded: [] });
  await expect(collectNotebookProject("owner", "repo", commit, Date.now() + 10_000)).rejects.toThrow(/incomplete/);
  mocks.tree.mockResolvedValueOnce({ entries: [{ path: "x", type: "blob", mode: "120000", size: 3, sha }], truncated: false, unenumerated: false, excluded: [] });
  await expect(collectNotebookProject("owner", "repo", commit, Date.now() + 10_000)).rejects.toThrow(/safely/);
});
it("does not widen a tree-scoped submission", async () => {
  mocks.tree.mockResolvedValueOnce({ entries: [{ path: "scope/model.npz", type: "blob", mode: "100644", size: content.length, sha }, { path: "outside/model.npz", type: "blob", mode: "100644", size: content.length, sha }], truncated: false, unenumerated: false, excluded: [] });
  expect(await collectNotebookProject("owner", "repo", commit, Date.now() + 10_000, { kind: "tree", path: "scope" })).toEqual([{ path: "scope/model.npz", content }]);
  expect(mocks.bytes).toHaveBeenCalledTimes(1);
});
