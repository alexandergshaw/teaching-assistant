import { createHash } from "node:crypto";
import { Writable } from "node:stream";
import { Sandbox } from "@vercel/sandbox";

/** Inspects one exact pinned artifact in a fresh network-isolated VM.
 * Observations are not proof of source equivalence, correctness, or test coverage. */
export async function inspectModule12Binary(input: {
  path: string; bytes: Uint8Array; repoCommit: string; signal: AbortSignal;
  beforeDispatch: (signal: AbortSignal) => Promise<void>;
}) {
  const formats: Record<string, { kind: "java-class" | "elf" | "pe" | "python-bytecode"; name: string } | undefined> = {
    "assignments/module_12/TestUtils.class": { kind: "java-class", name: "TestUtils.class" },
    "assignments/module_12/test_utils": { kind: "elf", name: "test_utils" },
    "assignments/module_12/test_utils.exe": { kind: "pe", name: "test_utils.exe" },
  };
  const entry = formats[input.path] ?? (/^assignments\/module_12\/__pycache__\/test_utils\.cpython-\d{2,3}\.pyc$/.test(input.path)
    ? { kind: "python-bytecode" as const, name: "test_utils.pyc" } : null);
  if (!entry || !/^[a-f0-9]{40}$/.test(input.repoCommit) || input.bytes.length === 0 || input.bytes.length > 10_000_000) throw new Error("Invalid artifact input");
  const b = input.bytes;
  const peOffset = b.length >= 64 ? (b[60] | b[61] << 8 | b[62] << 16 | b[63] << 24) : -1;
  const recognized = entry.kind === "java-class" ? b.length >= 8 && b[0] === 0xca && b[1] === 0xfe && b[2] === 0xba && b[3] === 0xbe
    : entry.kind === "elf" ? b.length >= 16 && b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46
    : entry.kind === "pe" ? b.length >= 64 && b[0] === 0x4d && b[1] === 0x5a && peOffset >= 64 && peOffset + 4 <= b.length && b[peOffset] === 0x50 && b[peOffset + 1] === 0x45 && b[peOffset + 2] === 0 && b[peOffset + 3] === 0
    : b.length >= 16 && b[2] === 13 && b[3] === 10 && [0, 1, 3].includes(b[4]) && b[5] === 0 && b[6] === 0 && b[7] === 0;
  if (!recognized) throw new Error("Artifact format does not match its name");
  input.signal.throwIfAborted();
  await input.beforeDispatch(input.signal);
  const sandbox = await Sandbox.create({ image: "vercel/sandbox/universal@sha256:9b2669397f26336812ec6835c2f67db6a546074cbabb05db93bf5e669f71ec5d", persistent: false, resources: { vcpus: 1 }, timeout: 180_000, signal: input.signal });
  const stop = () => { void sandbox.stop().catch(() => {}); };
  input.signal.addEventListener("abort", stop, { once: true });
  try {
    // Install only platform tools before the untrusted artifact enters the VM.
    const install = await sandbox.runCommand({ cmd: "bash", args: ["-c", "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq file default-jre-headless >/dev/null 2>&1"], sudo: true, timeoutMs: 100_000, signal: input.signal });
    if (install.exitCode !== 0) throw new Error("Artifact inspection toolchain unavailable");
    await sandbox.update({ networkPolicy: "deny-all" }, { signal: input.signal });
    input.signal.throwIfAborted();
    await sandbox.writeFiles([{ path: entry.name, content: Buffer.from(input.bytes) }], { signal: input.signal });
    const run = async (cmd: string, args: string[]) => {
      let stdout = "", stderr = "", stdoutTruncated = false, stderrTruncated = false;
      const capture = (stream: "stdout" | "stderr") => new Writable({ write(chunk: Buffer, _enc, done) {
        const text = chunk.toString("utf8");
        if (stream === "stdout") { stdoutTruncated ||= stdout.length + text.length > 10_000; stdout = (stdout + text).slice(0, 10_000); }
        else { stderrTruncated ||= stderr.length + text.length > 10_000; stderr = (stderr + text).slice(0, 10_000); }
        done();
      } });
      await input.beforeDispatch(input.signal);
      input.signal.throwIfAborted();
      const result = await sandbox.runCommand({ cmd, args, timeoutMs: 15_000, signal: input.signal, stdout: capture("stdout"), stderr: capture("stderr") });
      return { command: [cmd, ...args].join(" "), exitCode: result.exitCode, termination: result.exitCode >= 128 ? "unknown" as const : null, stdout, stderr, stdoutTruncated, stderrTruncated };
    };
    const toolVersion = await run("file", ["--version"]);
    if (toolVersion.exitCode !== 0 || toolVersion.termination) throw new Error("Artifact tool version unavailable");
    const runtimeVersion = entry.kind === "java-class" ? await run("java", ["--version"])
      : entry.kind === "python-bytecode" ? await run("python3", ["--version"])
        : await run("uname", ["-sm"]);
    if (runtimeVersion.exitCode !== 0 || runtimeVersion.termination) throw new Error("Artifact runtime version unavailable");
    const metadata = await run("file", ["-b", "--", entry.name]);
    if (metadata.exitCode !== 0 || metadata.termination) throw new Error("Artifact metadata unavailable");
    let execution: Awaited<ReturnType<typeof run>> | null = null;
    let executionStatus: "observed" | "unsupported-platform" | "runtime-unavailable" = "observed";
    if (entry.kind === "pe") executionStatus = "unsupported-platform";
    else if (entry.kind === "java-class") execution = await run("java", ["-ea", "-cp", ".", "TestUtils"]);
    else if (entry.kind === "python-bytecode") execution = await run("python3", [entry.name]);
    else {
      const permission = await run("chmod", ["u+x", "--", entry.name]);
      if (permission.exitCode !== 0 || permission.termination) executionStatus = "runtime-unavailable";
      else execution = await run("./test_utils", []);
    }
    return { path: input.path, repoCommit: input.repoCommit, sha256: createHash("sha256").update(input.bytes).digest("hex"), kind: entry.kind, image: "vercel/sandbox/universal@sha256:9b2669397f26336812ec6835c2f67db6a546074cbabb05db93bf5e669f71ec5d", networkPolicy: "deny-all" as const, toolVersion, runtimeVersion, metadata, executionStatus, execution, sourceEquivalence: "unverified" as const, testCoverage: "unverified" as const };
  } finally {
    input.signal.removeEventListener("abort", stop);
    await sandbox.stop().catch(() => {});
  }
}




export type Module12ArtifactReceipt = Awaited<ReturnType<typeof inspectModule12Binary>>;
