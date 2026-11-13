import { beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ tree: vi.fn(), bytes: vi.fn() }));
vi.mock("@/lib/github.repos", () => ({ getRepoCommitTree: api.tree }));
vi.mock("@/lib/github-grade-archive", () => ({ makePinnedArchiveBytesReader: () => api.bytes }));
import { readModule12PinnedFiles } from "./module12-pinned-files";

const folder = "assignments/module_12";
const paths = ["test_utils.py", "TestUtils.java", "test_utils.cpp", "helper.txt", "TestUtils.class"].map((name) => `${folder}/${name}`);
const entries = paths.map((path) => ({ path, type: "blob" as const, mode: "100644", size: 1, sha: "a".repeat(40) }));
const input = { owner: "org", repo: "repo", accountId: "owner", sourceCommit: "b".repeat(40), signal: new AbortController().signal,
  excludedArtifacts: [paths[4]], inventory: { source: "pinned", scope: { kind: "tree" as const, path: folder }, enumerationComplete: true,
    files: paths.map((path) => ({ path, content: "read" as const })) } };
beforeEach(() => {
  vi.clearAllMocks();
  api.tree.mockResolvedValue({ entries, truncated: false });
  api.bytes.mockImplementation(async (selected: typeof entries) => new Map(selected.map((entry) => [entry.path, Buffer.from("x")])));
});
it("reads the exact pinned raw bytes for every reviewed member while retaining exclusions", async () => {
  const files = await readModule12PinnedFiles(input);
  expect(files.map((file) => file.path)).toEqual(paths.slice(0, 4));
  expect(api.bytes).toHaveBeenCalledWith(entries.slice(0, 4), input.signal);
});
it("rejects incomplete tree or an inventory mismatch before fetching bytes", async () => {
  api.tree.mockResolvedValueOnce({ entries, truncated: true });
  await expect(readModule12PinnedFiles(input)).rejects.toThrow("Incomplete pinned repository tree");
  await expect(readModule12PinnedFiles({ ...input, inventory: { ...input.inventory, files: input.inventory.files.slice(0, 3) } })).rejects.toThrow("inventory does not match");
  expect(api.bytes).not.toHaveBeenCalled();
});
it("holds unreadable files and missing raw bytes rather than executing a subset", async () => {
  await expect(readModule12PinnedFiles({ ...input, inventory: { ...input.inventory, files: input.inventory.files.map((file, i) => i === 3 ? { ...file, content: "unsupported" as const } : file) } })).rejects.toThrow("unreadable");
  api.bytes.mockResolvedValueOnce(new Map());
  await expect(readModule12PinnedFiles(input)).rejects.toThrow("bytes are incomplete");
});
