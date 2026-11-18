import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), mkDir: vi.fn(), writeFiles: vi.fn(), runCommand: vi.fn(), stop: vi.fn() }));
vi.mock("@vercel/sandbox", () => ({ Sandbox: { create: mocks.create } }));
import { runNotebookKernel } from "./notebook-kernel-runner";
const files = [{ path: "analysis/work.ipynb", content: Buffer.from(JSON.stringify({ nbformat: 4, cells: [{ cell_type: "code", source: "print(1)" }] })) }, { path: "data/input.csv", content: Buffer.from("x") }, { path: "data/image.png", content: Buffer.from([0, 255, 128]) }];
beforeEach(() => {
  vi.clearAllMocks(); mocks.mkDir.mockResolvedValue(undefined); mocks.writeFiles.mockResolvedValue(undefined); mocks.stop.mockResolvedValue(undefined);
  mocks.create.mockResolvedValue({ mkDir: mocks.mkDir, writeFiles: mocks.writeFiles, runCommand: mocks.runCommand, stop: mocks.stop });
  mocks.runCommand.mockImplementation(async ({ stdout }: { stdout?: { write: (s: string) => void } }) => { stdout?.write(JSON.stringify({ ok: true, expected: [0], observed: [0], errors: [], outputs: [{ cell: 0, kind: "stream", text: "1" }], images: [] })); return { exitCode: 0 }; });
});
it("stages the actual project and reports bounded kernel observations", async () => {
  const result = await runNotebookKernel(files, files[0].path, "snap_Abc123", new AbortController().signal);
  expect(result).toMatchObject({ ok: true, observations: { observed: [0] }, caveat: expect.stringContaining("untrusted") });
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ networkPolicy: "deny-all", persistent: false }));
  expect(mocks.writeFiles.mock.calls[0][0]).toEqual(expect.arrayContaining([expect.objectContaining({ path: "/vercel/project/analysis/work.ipynb" }), expect.objectContaining({ path: "/vercel/project/data/input.csv" })]));
  expect(mocks.writeFiles.mock.calls[0][0]).toContainEqual({ path: "/vercel/project/data/image.png", content: Buffer.from([0, 255, 128]) });
  expect(mocks.stop).toHaveBeenCalled();
});
it("holds timeout, kernel death and traversal", async () => {
  mocks.runCommand.mockRejectedValueOnce(new Error("timeout"));
  expect(await runNotebookKernel(files, files[0].path, "snap_Abc123", new AbortController().signal)).toMatchObject({ ok: false });
  mocks.runCommand.mockResolvedValueOnce({ exitCode: 0 }).mockResolvedValueOnce({ exitCode: 1 });
  expect(await runNotebookKernel(files, files[0].path, "snap_Abc123", new AbortController().signal)).toMatchObject({ ok: false });
  mocks.create.mockClear();
  expect(await runNotebookKernel([{ path: "../work.ipynb", content: Buffer.from("{}") }], "../work.ipynb", "snap_Abc123", new AbortController().signal)).toMatchObject({ ok: false });
  expect(mocks.create).not.toHaveBeenCalled();
});
