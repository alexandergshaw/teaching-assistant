import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
vi.mock("./module12-vercel-sandbox", () => ({ runModule12SandboxSource: vi.fn() }));
import { runModule12SandboxSource } from "./module12-vercel-sandbox";
import { executeModule12PinnedFiles } from "./module12-execute-pinned";

it("rejects a manifest that does not match the independently fetched bytes", async () => {
  const files = ["test_utils.py", "TestUtils.java", "test_utils.cpp"].map((name) => ({ path: `assignments/module_12/${name}`, bytes: new Uint8Array([1]) }));
  vi.mocked(runModule12SandboxSource).mockImplementation(async (input) => {
    const language = input.path.endsWith(".py") ? "python" : input.path.endsWith(".java") ? "java" : "c++";
    const stage = { command: "run", exitCode: 0, signal: null, timedOut: false, stdout: "", stderr: "", stdoutTruncated: false, stderrTruncated: false };
    return { repoCommit: input.repoCommit, sourcePath: input.path, sourceSha256: createHash("sha256").update(input.bytes).digest("hex"),
      inputManifest: [{ path: input.path, sha256: createHash("sha256").update(input.bytes).digest("hex") }, { path: "assignments/module_12/fake.py", sha256: "0".repeat(64) }], dependencyCompleteness: "unverified", language,
      image: "image", compilerVersion: "version", networkPolicy: "deny-all", compile: language === "python" ? null : stage, run: stage, testCount: "unverified" };
  });
  await expect(executeModule12PinnedFiles({ files, repoCommit: "a".repeat(40), signal: new AbortController().signal, beforeDispatch: async () => {} })).rejects.toThrow("inputs did not match");
});
