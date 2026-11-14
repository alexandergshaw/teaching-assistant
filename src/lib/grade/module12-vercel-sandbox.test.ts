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
  const buildAndRun = api.runCommand.mock.calls.map(([params]) => params).filter((params) => params.cmd === "g++" && params.args?.includes("test_utils.cpp") || params.cmd === "./test_utils");
  expect(buildAndRun).toHaveLength(2);
  expect(buildAndRun.every((params) => params.cwd === undefined)).toBe(true);
  expect(receipt).toMatchObject({ language: "c++", networkPolicy: "deny-all", testCount: "unverified", compile: { exitCode: 0 }, run: { exitCode: 0 } });
  expect(api.stop).toHaveBeenCalled();
});

it("never writes source if network isolation fails", async () => {
  api.update.mockRejectedValue(new Error("denied"));
  await expect(runModule12SandboxSource({ path: "assignments/module_12/test_utils.py", bytes: new Uint8Array([1]), companions: [], repoCommit: "a".repeat(40), signal: new AbortController().signal, beforeDispatch: async () => {} })).rejects.toThrow("denied");
  expect(api.writeFiles).not.toHaveBeenCalled(); expect(api.stop).toHaveBeenCalled();
});

it("preserves split UTF-8 output and never truncates inside a character", async () => {
  const output = Buffer.from(`${"a".repeat(9999)}\u{20000}résumé`, "utf8");
  api.runCommand.mockImplementation(async (params: { cmd: string; args: string[]; stdout?: { write: (part: Buffer) => void } }) => {
    if (params.cmd === "python3" && params.args[0] === "test_utils.py") {
      params.stdout?.write(output.subarray(0, 10001));
      params.stdout?.write(output.subarray(10001));
    }
    return { exitCode: 0, stdout: async () => "version", stderr: async () => "" };
  });
  const receipt = await runModule12SandboxSource({ path: "assignments/module_12/test_utils.py", bytes: new Uint8Array([65]), companions: [], repoCommit: "a".repeat(40), signal: new AbortController().signal, beforeDispatch: async () => {} });
  expect(receipt.run?.stdout).toBe("a".repeat(9999));
  expect(receipt.run?.stdout.isWellFormed()).toBe(true);
  expect(receipt.run?.stdoutTruncated).toBe(true);
});

it("preserves multibyte characters split between chunks on both streams", async () => {
  const output = Buffer.from("résumé", "utf8");
  const error = Buffer.from("façade", "utf8");
  api.runCommand.mockImplementation(async (params: { cmd: string; args: string[]; stdout?: { write: (part: Buffer) => void }; stderr?: { write: (part: Buffer) => void } }) => {
    if (params.cmd === "python3" && params.args[0] === "test_utils.py") {
      params.stdout?.write(output.subarray(0, 2));
      params.stdout?.write(output.subarray(2));
      params.stderr?.write(error.subarray(0, 3));
      params.stderr?.write(error.subarray(3));
    }
    return { exitCode: 0, stdout: async () => "version", stderr: async () => "" };
  });
  const receipt = await runModule12SandboxSource({ path: "assignments/module_12/test_utils.py", bytes: new Uint8Array([65]), companions: [], repoCommit: "a".repeat(40), signal: new AbortController().signal, beforeDispatch: async () => {} });
  expect(receipt.run?.stdout).toBe("résumé");
  expect(receipt.run?.stderr).toBe("façade");
  expect(receipt.run?.stdoutTruncated).toBe(false);
});

it("flushes incomplete trailing UTF-8 on both streams after the command resolves", async () => {
  api.runCommand.mockImplementation(async (params: { cmd: string; args: string[]; stdout?: { write: (part: Buffer) => void }; stderr?: { write: (part: Buffer) => void } }) => {
    if (params.cmd === "python3" && params.args[0] === "test_utils.py") {
      params.stdout?.write(Buffer.from([0x61, 0xc3]));
      params.stderr?.write(Buffer.from([0x62, 0xe2, 0x82]));
    }
    return { exitCode: 0, stdout: async () => "version", stderr: async () => "" };
  });
  const receipt = await runModule12SandboxSource({ path: "assignments/module_12/test_utils.py", bytes: new Uint8Array([65]), companions: [], repoCommit: "a".repeat(40), signal: new AbortController().signal, beforeDispatch: async () => {} });
  expect(receipt.run?.stdout).toBe("a\ufffd");
  expect(receipt.run?.stderr).toBe("b\ufffd");
});

it("stops the sandbox and rejects if the command fails after emitting output", async () => {
  api.runCommand.mockImplementation(async (params: { cmd: string; args: string[]; stdout?: { write: (part: Buffer) => void } }) => {
    if (params.cmd === "python3" && params.args[0] === "test_utils.py") {
      params.stdout?.write(Buffer.from([0xc3]));
      throw new Error("command failed");
    }
    return { exitCode: 0, stdout: async () => "version", stderr: async () => "" };
  });
  await expect(runModule12SandboxSource({ path: "assignments/module_12/test_utils.py", bytes: new Uint8Array([65]), companions: [], repoCommit: "a".repeat(40), signal: new AbortController().signal, beforeDispatch: async () => {} })).rejects.toThrow("command failed");
  expect(api.stop).toHaveBeenCalled();
});

it("holds opaque or colliding companion files before creating a VM", async () => {
  await expect(runModule12SandboxSource({ path: "assignments/module_12/test_utils.py", bytes: new Uint8Array([1]), companions: [{ path: "assignments/module_12/TestUtils.class", bytes: new Uint8Array([0]) }], repoCommit: "a".repeat(40), signal: new AbortController().signal, beforeDispatch: async () => {} })).rejects.toThrow("review required");
  expect(api.create).not.toHaveBeenCalled();
});

it("reports a failing command phase without logging provider or student content", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  api.runCommand.mockImplementation(async (params: { cmd: string; args: string[] }) => {
    if (params.args?.includes("test_utils.cpp")) throw new Error("private student content");
    return { exitCode: 0, stdout: async () => "version", stderr: async () => "" };
  });
  try {
    await expect(runModule12SandboxSource({ path: "assignments/module_12/test_utils.cpp", bytes: new Uint8Array([65]), companions: [], repoCommit: "a".repeat(40), signal: new AbortController().signal, beforeDispatch: async () => {} })).rejects.toThrow("private student content");
    expect(log).toHaveBeenCalledWith("Repository sandbox execution failed", { phase: "source-command", cancelled: false });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private student content");
  } finally { log.mockRestore(); }
});
