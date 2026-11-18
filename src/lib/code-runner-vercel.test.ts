import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), writeFiles: vi.fn(), runCommand: vi.fn(), stop: vi.fn() }));
vi.mock("@vercel/sandbox", () => ({ Sandbox: { create: mocks.create } }));
import { runVercelCode } from "./code-runner-vercel";
import { selectCodeRunFiles } from "./code-run-selection";

describe("isolated code execution", () => {
  it("reports an oversized data file instead of silently dropping it", () => {
    const result = selectCodeRunFiles([{ name: "main.cpp", extension: "cpp", previewContent: "int main() {}" }, { name: "data.csv", extension: "csv", previewContent: "x".repeat(200_001) }]);
    expect(result.skipped).toContainEqual({ name: "data.csv", reason: "data-too-large" });
  });
  it("retains multi-megabyte data in the isolated runner's explicit budget", () => {
    const text = "x".repeat(2_039_946);
    const result = selectCodeRunFiles([{ name: "main.cpp", extension: "cpp", previewContent: "int main() {}" }, { name: "data.csv", extension: "csv", previewContent: text }], undefined, 3_000_000);
    expect(result.runFiles).toContainEqual({ name: "data.csv", content: text }); expect(result.skipped).toHaveLength(0);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CODE_RUNNER_SANDBOX_IMAGE", `registry.example/runner@sha256:${"a".repeat(64)}`);
    mocks.stop.mockResolvedValue(undefined); mocks.writeFiles.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({ writeFiles: mocks.writeFiles, runCommand: mocks.runCommand, stop: mocks.stop });
    mocks.runCommand.mockImplementation(async ({ cmd, stdout }: { cmd: string; stdout: { write: (value: string) => void } }) => { if (cmd === "./__grade_program") stdout.write("synthetic output"); return { exitCode: 0 }; });
  });
  afterEach(() => vi.unstubAllEnvs());
  it("starts with egress denied, links all source files and stops the VM", async () => {
    const files = [{ name: "main.cpp", content: "int main(){}" }, { name: "helper.cpp", content: "int helper(){return 0;}" }, { name: "data.csv", content: "x,y" }];
    const result = await runVercelCode("c++", files, new AbortController().signal);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ image: `registry.example/runner@sha256:${"a".repeat(64)}`, networkPolicy: "deny-all", persistent: false, resources: { vcpus: 1 } }));
    expect(mocks.runCommand.mock.calls[0][0]).toMatchObject({ cmd: "g++", args: ["--version"] });
    expect(mocks.runCommand.mock.calls[1][0]).toMatchObject({ cmd: "g++", args: ["./main.cpp", "./helper.cpp", "-o", "__grade_program"] });
    expect(mocks.runCommand.mock.invocationCallOrder[0]).toBeLessThan(mocks.writeFiles.mock.invocationCallOrder[0]);
    expect(result).toMatchObject({ ran: true, exitCode: 0, stdout: "synthetic output" }); expect(mocks.stop).toHaveBeenCalled();
  });
  it("rejects unsafe names before creating a VM", async () => {
    await expect(runVercelCode("python", [{ name: "../main.py", content: "print(1)" }], new AbortController().signal)).rejects.toThrow(/filename/i);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("requires a digest-pinned image before creating a VM", async () => {
    vi.stubEnv("CODE_RUNNER_SANDBOX_IMAGE", "registry.example/runner:latest");
    await expect(runVercelCode("c++", [{ name: "main.cpp", content: "int main() {}" }], new AbortController().signal)).rejects.toThrow(/digest-pinned/i);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("uses the managed script image for JavaScript and Python", async () => {
    for (const [language, name] of [["javascript", "main.js"], ["python", "main.py"]]) {
      await runVercelCode(language, [{ name, content: "1" }], new AbortController().signal);
      expect(mocks.create).toHaveBeenLastCalledWith(expect.objectContaining({ image: "vercel/sandbox/universal@sha256:9b2669397f26336812ec6835c2f67db6a546074cbabb05db93bf5e669f71ec5d" }));
    }
  });
  it("preflights a configured scientific Python snapshot before uploading student files", async () => {
    const snapshotId = "snap_Abc123";
    vi.stubEnv("CODE_RUNNER_PYTHON_SNAPSHOT", snapshotId);
    await runVercelCode("python", [{ name: "main.py", content: "import numpy" }], new AbortController().signal);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ source: { type: "snapshot", snapshotId }, networkPolicy: "deny-all", persistent: false }));
    expect(mocks.runCommand.mock.calls[1][0]).toMatchObject({ cmd: "python3", args: ["-I", "-c", "import numpy, pandas, matplotlib, scipy, sklearn"] });
    expect(mocks.runCommand.mock.invocationCallOrder[1]).toBeLessThan(mocks.writeFiles.mock.invocationCallOrder[0]);
  });
  it("holds files back when scientific libraries are missing or the snapshot ID is invalid", async () => {
    vi.stubEnv("CODE_RUNNER_PYTHON_SNAPSHOT", "snap_Abc123");
    mocks.runCommand.mockResolvedValueOnce({ exitCode: 0 }).mockResolvedValueOnce({ exitCode: 1 });
    await expect(runVercelCode("python", [{ name: "main.py", content: "import numpy" }], new AbortController().signal)).rejects.toThrow(/scientific libraries/);
    expect(mocks.writeFiles).not.toHaveBeenCalled();
    vi.stubEnv("CODE_RUNNER_PYTHON_SNAPSHOT", "snapshot:latest"); mocks.create.mockClear();
    await expect(runVercelCode("python", [{ name: "main.py", content: "1" }], new AbortController().signal)).rejects.toThrow(/snapshot ID/);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("holds source bytes back if the configured image lacks its toolchain", async () => {
    mocks.runCommand.mockResolvedValue({ exitCode: 1 });
    await expect(runVercelCode("c++", [{ name: "main.cpp", content: "int main() {}" }], new AbortController().signal)).rejects.toThrow(/toolchain/i);
    expect(mocks.writeFiles).not.toHaveBeenCalled(); expect(mocks.stop).toHaveBeenCalled();
  });
  it("does not run after compilation fails and preserves the compiler output", async () => {
    mocks.runCommand.mockImplementation(async ({ args, stderr }: { args: string[]; stderr: { write: (value: string) => void } }) => { if (args.includes("--version")) return { exitCode: 0 }; stderr.write("synthetic compiler error"); return { exitCode: 1 }; });
    const result = await runVercelCode("c++", [{ name: "main.cpp", content: "invalid" }], new AbortController().signal);
    expect(result).toMatchObject({ ran: false, exitCode: null, compileOutput: "synthetic compiler error" }); expect(mocks.runCommand).toHaveBeenCalledTimes(2);
  });
});
