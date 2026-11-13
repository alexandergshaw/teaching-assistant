import { createHash } from "node:crypto";
import { Writable } from "node:stream";
import { Sandbox } from "@vercel/sandbox";

/** One fresh VM per source. This returns process evidence, never a grade. */
export async function runModule12SandboxSource(input: {
  path: string; bytes: Uint8Array; companions: readonly { path: string; bytes: Uint8Array }[]; repoCommit: string; signal: AbortSignal;
  beforeDispatch: (signal: AbortSignal) => Promise<void>;
}) {
  const choices = {
    "test_utils.py": { language: "python", tool: "python3", compile: null, run: ["python3", ["test_utils.py"]] },
    "TestUtils.java": { language: "java", tool: "java", compile: ["javac", ["TestUtils.java"]], run: ["java", ["-ea", "TestUtils"]] },
    "test_utils.cpp": { language: "c++", tool: "g++", compile: ["g++", ["-Wall", "test_utils.cpp", "-o", "test_utils"]], run: ["./test_utils", []] },
  } as const;
  const basename = input.path.split("/").at(-1) as keyof typeof choices;
  const choice = choices[basename];
  if (!choice || input.path !== `assignments/module_12/${basename}` || !/^[a-f0-9]{40}$/.test(input.repoCommit)
    || input.bytes.byteLength === 0 || input.bytes.byteLength > 100_000) throw new Error("Invalid pinned source");
  const all = [{ path: input.path, bytes: input.bytes }, ...input.companions];
  const paths = new Set<string>();
  let total = 0;
  for (const file of all) {
    const relative = file.path.startsWith("assignments/module_12/") ? file.path.slice("assignments/module_12/".length) : "";
    if (!relative || relative.length > 512 || relative.split("/").some((part) => !part || part === "." || part === ".." || !/^[a-zA-Z0-9_. -]+$/.test(part))
      || paths.has(relative.toLowerCase()) || file.bytes.byteLength > 1_000_000 || file.bytes.includes(0)
      || /(?:^|\/)(?:test_utils|.*\.(?:class|exe|o|so|dll))$/i.test(relative)) throw new Error("Invalid or opaque pinned inventory; review required");
    paths.add(relative.toLowerCase()); total += file.bytes.byteLength;
  }
  if (all.length > 100 || total > 5_000_000) throw new Error("Pinned inventory exceeds execution limits");
  input.signal.throwIfAborted();
  await input.beforeDispatch(input.signal);
  const sandbox = await Sandbox.create({ image: "vercel/sandbox/universal@sha256:9b2669397f26336812ec6835c2f67db6a546074cbabb05db93bf5e669f71ec5d", persistent: false, resources: { vcpus: 1 }, timeout: 180_000, signal: input.signal }).catch((error: unknown) => {
    console.error("Repository sandbox execution failed", { phase: "sandbox-create", cancelled: input.signal.aborted });
    throw error;
  });
  const stop = () => { void sandbox.stop().catch(() => {}); };
  input.signal.addEventListener("abort", stop, { once: true });
  let phase = "toolchain";
  try {
    const install = await sandbox.runCommand({ cmd: "bash", args: ["-c", "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq g++ default-jdk-headless >/dev/null 2>&1"], sudo: true, timeoutMs: 100_000, signal: input.signal });
    if (install.exitCode !== 0) throw new Error("Sandbox toolchain setup failed");
    const version = await sandbox.runCommand({ cmd: choice.tool, args: ["--version"], signal: input.signal, timeoutMs: 5000 });
    const compilerVersion = ((await version.stdout({ signal: input.signal })) || (await version.stderr({ signal: input.signal }))).split("\n")[0].slice(0, 512);
    if (version.exitCode !== 0 || !compilerVersion) throw new Error("Sandbox toolchain version unavailable");
    phase = "network-isolation";
    await sandbox.update({ networkPolicy: "deny-all" }, { signal: input.signal });
    input.signal.throwIfAborted();
    const sourceFiles = all.map((file) => ({ path: file.path.slice("assignments/module_12/".length), content: Buffer.from(file.bytes) }));
    const dirs = new Set<string>();
    for (const file of sourceFiles) {
      const parts = file.path.split("/"); parts.pop();
      for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
    }
    phase = "source-upload";
    for (const dir of [...dirs].sort((a, b) => a.length - b.length)) await sandbox.mkDir(dir, { signal: input.signal });
    await sandbox.writeFiles(sourceFiles, { signal: input.signal });
    const stage = async (command: readonly [string, readonly string[]]) => {
      let out = "", err = "", outCut = false, errCut = false;
      const capture = (which: "out" | "err") => new Writable({ write(chunk: Buffer, _enc, done) {
        const text = chunk.toString("utf8");
        if (which === "out") { outCut ||= out.length + text.length > 10_000; out = (out + text).slice(0, 10_000); }
        else { errCut ||= err.length + text.length > 10_000; err = (err + text).slice(0, 10_000); }
        done();
      } });
      phase = "dispatch-authorization";
      await input.beforeDispatch(input.signal);
      input.signal.throwIfAborted();
      // writeFiles resolves relative paths against the session's own cwd.
      // Leave cwd unspecified here so commands use that same directory.
      phase = "source-command";
      const result = await sandbox.runCommand({ cmd: command[0], args: [...command[1]], timeoutMs: 15_000, signal: input.signal, stdout: capture("out"), stderr: capture("err") });
      // Exit codes in the signal range are ambiguous (including timeout kills).
      // Keep them unverified rather than presenting them as ordinary failures.
      const signal = result.exitCode >= 128 ? "unknown termination" : null;
      return { command: [command[0], ...command[1]].join(" "), exitCode: result.exitCode, signal, timedOut: false, stdout: out, stderr: err, stdoutTruncated: outCut, stderrTruncated: errCut };
    };
    const compile = choice.compile ? await stage(choice.compile) : null;
    const run = compile && (compile.exitCode !== 0 || compile.signal) ? null : await stage(choice.run);
    return { repoCommit: input.repoCommit, sourcePath: input.path, sourceSha256: createHash("sha256").update(input.bytes).digest("hex"), inputManifest: all.map((file) => ({ path: file.path, sha256: createHash("sha256").update(file.bytes).digest("hex") })), dependencyCompleteness: "unverified" as const, language: choice.language, image: "vercel/sandbox/universal@sha256:9b2669397f26336812ec6835c2f67db6a546074cbabb05db93bf5e669f71ec5d", compilerVersion, networkPolicy: "deny-all" as const, compile, run, testCount: "unverified" as const };
  } catch (error) {
    // Do not log student paths, code, provider messages or credentials.
    console.error("Repository sandbox execution failed", { phase, cancelled: input.signal.aborted });
    throw error;
  } finally {
    input.signal.removeEventListener("abort", stop);
    await sandbox.stop().catch(() => {});
  }
}
