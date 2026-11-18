import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn(), mkDir: vi.fn(), writeFiles: vi.fn(), runCommand: vi.fn(), stop: vi.fn(), getCommand: vi.fn() }));
vi.mock("@vercel/sandbox", () => ({ Sandbox: { create: m.create, get: m.get } }));
import { pollDetachedNotebook, startDetachedNotebook } from "./notebook-detached-runner";
const files = [{ path: "work.ipynb", content: Buffer.from("{}") }, { path: "data/test.npz", content: Buffer.from([0, 255]) }];
const name = `nb-${"d".repeat(40)}`;
beforeEach(() => {
  vi.clearAllMocks(); m.mkDir.mockResolvedValue(undefined); m.writeFiles.mockResolvedValue(undefined); m.stop.mockResolvedValue(undefined);
  const sandbox = { name, status: "running", currentSession: () => ({ sessionId: "sbx_A" }), mkDir: m.mkDir, writeFiles: m.writeFiles, runCommand: m.runCommand, getCommand: m.getCommand, stop: m.stop };
  m.create.mockResolvedValue(sandbox); m.get.mockResolvedValue(sandbox); m.runCommand.mockResolvedValueOnce({ exitCode: 0 }).mockResolvedValueOnce({ cmdId: "cmd_A" });
});
it("starts detached in a bounded deny-all sandbox with original bytes", async () => {
  expect(await startDetachedNotebook(files, "work.ipynb", "snap_A", name, new AbortController().signal)).toEqual({ sandboxId: "sbx_A", sandboxName: name, commandId: "cmd_A" });
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ persistent: false, networkPolicy: "deny-all", timeout: 900_000 }));
  expect(m.runCommand.mock.calls[1][0]).toMatchObject({ detached: true, timeoutMs: 840_000 });
  expect(m.writeFiles.mock.calls[0][0]).toContainEqual({ path: "/vercel/project/data/test.npz", content: Buffer.from([0, 255]) });
  expect(m.stop).not.toHaveBeenCalled();
});
it("returns running without consuming output or stopping the VM", async () => {
  const logs = vi.fn(); m.getCommand.mockResolvedValue({ wait: ({ signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })), logs });
  expect(await pollDetachedNotebook({ sandboxName: "job-A", sandboxId: "sbx_A", commandId: "cmd_A", expected: [0] }, new AbortController().signal)).toEqual({ status: "running" });
  expect(logs).not.toHaveBeenCalled(); expect(m.stop).not.toHaveBeenCalled();
});
it("refuses a different sandbox session", async () => {
  await expect(pollDetachedNotebook({ sandboxName: "job-A", sandboxId: "sbx_B", commandId: "cmd_A", expected: [0] }, new AbortController().signal)).rejects.toThrow(/session changed/);
  expect(m.getCommand).not.toHaveBeenCalled();
});
it("uses bounded wait to retrieve a completed command whose initial status is null", async () => {
  const completed = { exitCode: 0, logs: async function* () { yield { stream: "stdout", data: JSON.stringify({ ok: true, expected: [0], observed: [0], errors: [], outputs: [], images: [] }) }; } };
  m.getCommand.mockResolvedValue({ exitCode: null, wait: vi.fn(async () => completed) });
  expect(await pollDetachedNotebook({ sandboxName: "job-A", sandboxId: "sbx_A", commandId: "cmd_A", expected: [0] }, new AbortController().signal)).toMatchObject({ status: "succeeded" });
});
