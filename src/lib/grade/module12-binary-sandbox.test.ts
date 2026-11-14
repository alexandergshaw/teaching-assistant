import { beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), writeFiles: vi.fn(), runCommand: vi.fn(), stop: vi.fn() }));
vi.mock("@vercel/sandbox", () => ({ Sandbox: { create: api.create } }));
import { inspectModule12Binary } from "./module12-binary-sandbox";
const input = { path: "assignments/module_12/test_utils", bytes: new Uint8Array([127,69,76,70,0,0,0,0,0,0,0,0,0,0,0,0]), repoCommit: "a".repeat(40), signal: new AbortController().signal, beforeDispatch: async () => {} };
beforeEach(() => { vi.clearAllMocks(); api.create.mockResolvedValue(api); api.update.mockResolvedValue(undefined); api.writeFiles.mockResolvedValue(undefined); api.stop.mockResolvedValue(undefined); api.runCommand.mockResolvedValue({ exitCode: 0 }); });
it("denies egress before upload and preserves separate metadata and process observations", async () => {
  const result = await inspectModule12Binary(input);
  expect(api.update).toHaveBeenCalledWith({ networkPolicy: "deny-all" }, expect.anything());
  expect(api.update.mock.invocationCallOrder[0]).toBeLessThan(api.writeFiles.mock.invocationCallOrder[0]);
  expect(api.runCommand.mock.calls.map(([p]) => p.cmd)).toEqual(["bash", "file", "uname", "file", "chmod", "./test_utils"]);
  expect(result).toMatchObject({ path: input.path, repoCommit: input.repoCommit, kind: "elf", executionStatus: "observed", sourceEquivalence: "unverified", testCoverage: "unverified" });
  expect(api.stop).toHaveBeenCalledOnce();
});
it("does not execute Windows artifacts on Linux and does not infer a failure", async () => {
  const bytes = new Uint8Array(68); bytes.set([0x4d, 0x5a]); bytes[60] = 64; bytes.set([0x50, 0x45, 0, 0], 64);
  const result = await inspectModule12Binary({ ...input, bytes, path: "assignments/module_12/test_utils.exe" });
  expect(result.executionStatus).toBe("unsupported-platform");
  expect(result.execution).toBeNull();
  expect(api.runCommand.mock.calls.map(([p]) => p.cmd)).toEqual(["bash", "file", "uname", "file"]);
});
it("never uploads artifact when isolation fails", async () => {
  api.update.mockRejectedValue(new Error("unavailable"));
  await expect(inspectModule12Binary(input)).rejects.toThrow("unavailable");
  expect(api.writeFiles).not.toHaveBeenCalled();
  expect(api.stop).toHaveBeenCalledOnce();
});
it("rejects unrecognized paths before creating a VM", async () => {
  await expect(inspectModule12Binary({ ...input, path: "assignments/module_12/../../payload" })).rejects.toThrow("Invalid artifact");
  expect(api.create).not.toHaveBeenCalled();
});
it("rejects a malformed artifact before creating a VM", async () => {
  await expect(inspectModule12Binary({ ...input, bytes: new Uint8Array([1, 2, 3]) })).rejects.toThrow("format does not match");
  expect(api.create).not.toHaveBeenCalled();
});

it("rejects cancellation before opening a sandbox", async () => {
  const controller = new AbortController(); controller.abort();
  await expect(inspectModule12Binary({ ...input, signal: controller.signal })).rejects.toThrow();
  expect(api.create).not.toHaveBeenCalled();
});
it("stops the VM after a command timeout and does not fabricate an observation", async () => {
  api.runCommand.mockImplementation(async (params: { cmd: string }) => {
    if (params.cmd === "./test_utils") throw new Error("command timed out");
    return { exitCode: 0 };
  });
  await expect(inspectModule12Binary(input)).rejects.toThrow("timed out");
  expect(api.stop).toHaveBeenCalledOnce();
});
