import { beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), mkDir: vi.fn(), writeFiles: vi.fn(), runCommand: vi.fn(), stop: vi.fn() }));
vi.mock("@vercel/sandbox", () => ({ Sandbox: { create: api.create } }));
import { runModule12SandboxSource } from "./module12-vercel-sandbox";

beforeEach(() => {
  vi.clearAllMocks();
  api.create.mockResolvedValue(api); api.update.mockResolvedValue(undefined); api.mkDir.mockResolvedValue(undefined); api.writeFiles.mockResolvedValue(undefined); api.stop.mockResolvedValue(undefined);
  api.runCommand.mockResolvedValue({ exitCode: 0, stdout: async () => "version", stderr: async () => "" });
});

it("denies network before writing exact pinned bytes and compiles then runs in a disposable VM", async () => {
  const bytes = new TextEncoder().encode("int main(){}"), beforeDispatch = vi.fn().mockResolvedValue(undefined);
  const receipt = await runModule12SandboxSource({ path: "assignments/module_12/test_utils.cpp", bytes, companions: [{ path: "assignments/module_12/lib/helper.h", bytes: new Uint8Array([65]) }], repoCommit: "a".repeat(40), signal: new AbortController().signal, beforeDispatch });
  expect(api.update).toHaveBeenCalledWith({ networkPolicy: "deny-all" }, expect.anything());
  expect(api.update.mock.invocationCallOrder[0]).toBeLessThan(api.writeFiles.mock.invocationCallOrder[0]);
  expect(api.mkDir).toHaveBeenCalledWith("lib", expect.anything());
  expect(api.writeFiles).toHaveBeenCalledWith([{ path: "test_utils.cpp", content: Buffer.from(bytes) }, { path: "lib/helper.h", content: Buffer.from([65]) }], expect.anything());
  expect(receipt).toMatchObject({ language: "c++", networkPolicy: "deny-all", testCount: "unverified", compile: { exitCode: 0 }, run: { exitCode: 0 } });
  expect(api.stop).toHaveBeenCalled();
});

it("never writes source if network isolation fails", async () => {
  api.update.mockRejectedValue(new Error("denied"));
  await expect(runModule12SandboxSource({ path: "assignments/module_12/test_utils.py", bytes: new Uint8Array([1]), companions: [], repoCommit: "a".repeat(40), signal: new AbortController().signal, beforeDispatch: async () => {} })).rejects.toThrow("denied");
  expect(api.writeFiles).not.toHaveBeenCalled(); expect(api.stop).toHaveBeenCalled();
});

it("holds opaque or colliding companion files before creating a VM", async () => {
  await expect(runModule12SandboxSource({ path: "assignments/module_12/test_utils.py", bytes: new Uint8Array([1]), companions: [{ path: "assignments/module_12/TestUtils.class", bytes: new Uint8Array([0]) }], repoCommit: "a".repeat(40), signal: new AbortController().signal, beforeDispatch: async () => {} })).rejects.toThrow("review required");
  expect(api.create).not.toHaveBeenCalled();
});
