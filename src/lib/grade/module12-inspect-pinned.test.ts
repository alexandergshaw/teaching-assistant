import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
vi.mock("./module12-binary-sandbox", () => ({ inspectModule12Binary: vi.fn() }));
import { inspectModule12Binary } from "./module12-binary-sandbox";
import { inspectModule12PinnedArtifacts } from "./module12-inspect-pinned";
const file = { path: "assignments/module_12/TestUtils.class", bytes: new Uint8Array([1, 2]) };
const input = { files: [file], repoCommit: "a".repeat(40), signal: new AbortController().signal, beforeDispatch: async () => {} };
it("binds every observation to its exact pinned bytes and revision", async () => {
  vi.mocked(inspectModule12Binary).mockResolvedValueOnce({ path: file.path, repoCommit: input.repoCommit, sha256: "0".repeat(64) } as never);
  await expect(inspectModule12PinnedArtifacts(input)).rejects.toThrow("does not match pinned bytes");
  vi.mocked(inspectModule12Binary).mockResolvedValueOnce({ path: file.path, repoCommit: input.repoCommit, sha256: createHash("sha256").update(file.bytes).digest("hex") } as never);
  expect(await inspectModule12PinnedArtifacts(input)).toHaveLength(1);
});
it("rejects duplicate paths and excessive parallel artifact dispatch", async () => {
  await expect(inspectModule12PinnedArtifacts({ ...input, files: [file, file] })).rejects.toThrow("capacity");
  await expect(inspectModule12PinnedArtifacts({ ...input, files: [0, 1, 2, 3].map(i => ({ ...file, path: `${file.path}${i}` })) })).rejects.toThrow("capacity");
});
