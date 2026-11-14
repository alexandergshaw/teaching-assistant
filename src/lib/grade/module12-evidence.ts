import { validModule12ExecutionReceipt, type Module12ExecutionReceipt } from "./module12-receipt";

export type Module12ArtifactObservation = {
  path: string; repoCommit: string; sha256: string;
  kind: "java-class" | "elf" | "pe" | "python-bytecode";
  networkPolicy: "deny-all"; image: string;
  toolVersion: ArtifactStage; runtimeVersion: ArtifactStage | null; metadata: ArtifactStage; executionStatus: "observed" | "unsupported-platform" | "runtime-unavailable";
  execution: ArtifactStage | null; sourceEquivalence: "unverified"; testCoverage: "unverified";
};
type ArtifactStage = { command: string; exitCode: number; termination: "unknown" | null; stdout: string; stderr: string; stdoutTruncated: boolean; stderrTruncated: boolean };
export type Module12Evidence = { sourceReceipts: Module12ExecutionReceipt[]; artifactReceipts: Module12ArtifactObservation[]; coverage: { status: "unverified" } };
export type Module12EvidenceSummary = {
  sourceReceipts: Array<{ sourcePath: string; language: "python" | "java" | "c++"; compileExit: number | null; runExit: number | null; compileState: string; runState: string }>;
  artifactReceipts: Array<{ path: string; executionStatus: "observed" | "unsupported-platform" | "runtime-unavailable"; exit: number | null }>;
  coverage: { status: "unverified" };
};

export function validModule12EvidenceSummary(value: unknown): value is Module12EvidenceSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const e = value as Module12EvidenceSummary;
  const exit = (x: unknown) => x === null || Number.isSafeInteger(x);
  const names = { python: "test_utils.py", java: "TestUtils.java", "c++": "test_utils.cpp" } as const;
  return JSON.stringify(e.coverage) === '{"status":"unverified"}' && Array.isArray(e.sourceReceipts) && e.sourceReceipts.length === 3
    && new Set(e.sourceReceipts.map(r => r?.language)).size === 3
    && e.sourceReceipts.every(r => r && Object.hasOwn(names, r.language) && r.sourcePath === `assignments/module_12/${names[r.language]}` && exit(r.compileExit) && exit(r.runExit)
      && ["not-recorded","timed-out","signalled","unknown","completed"].includes(r.compileState) && ["not-recorded","timed-out","signalled","unknown","completed"].includes(r.runState))
    && Array.isArray(e.artifactReceipts) && e.artifactReceipts.length <= 40
    && e.artifactReceipts.every(r => r && typeof r.path === "string" && r.path.length <= 600 && /^assignments\/module_12\//.test(r.path)
      && ["observed","unsupported-platform","runtime-unavailable"].includes(r.executionStatus) && exit(r.exit));
}

/** Structural validation only. The caller must verify receipts against the independently read pinned bytes. */
export function validModule12Evidence(value: unknown, sha: string): value is Module12Evidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const e = value as Module12Evidence;
  if (Object.keys(e).sort().join() !== "artifactReceipts,coverage,sourceReceipts" || !Array.isArray(e.sourceReceipts) || e.sourceReceipts.length !== 3
    || !Array.isArray(e.artifactReceipts) || e.artifactReceipts.length > 40 || JSON.stringify(e.coverage) !== '{"status":"unverified"}'
    || new TextEncoder().encode(JSON.stringify(e)).byteLength > 500000) return false;
  const names = { python: "test_utils.py", java: "TestUtils.java", "c++": "test_utils.cpp" } as const;
  if (new Set(e.sourceReceipts.map(r => r?.language)).size !== 3 || !e.sourceReceipts.every(r => r && Object.hasOwn(names, r.language)
    && r.sourcePath === `assignments/module_12/${names[r.language]}` && r.repoCommit === sha
    && validModule12ExecutionReceipt(r, { repoCommit: sha, sourcePath: r.sourcePath, sourceSha256: r.sourceSha256, language: r.language }))) return false;
  const manifest = (r: Module12ExecutionReceipt) => JSON.stringify([...r.inputManifest].sort((a,b) => a.path.localeCompare(b.path)));
  if (!e.sourceReceipts.every(r => manifest(r) === manifest(e.sourceReceipts[0]))) return false;
  const stage = (s: ArtifactStage) => !!s && typeof s.command === "string" && s.command.length > 0 && s.command.length <= 1000
    && Number.isSafeInteger(s.exitCode) && (s.termination === null || s.termination === "unknown")
    && typeof s.stdout === "string" && s.stdout.length <= 10000 && typeof s.stderr === "string" && s.stderr.length <= 10000
    && typeof s.stdoutTruncated === "boolean" && typeof s.stderrTruncated === "boolean";
  const artifactPaths = new Set<string>();
  return e.artifactReceipts.every(r => {
    const expectedKind = r?.path === "assignments/module_12/TestUtils.class" ? "java-class"
      : r?.path === "assignments/module_12/test_utils" ? "elf"
        : r?.path === "assignments/module_12/test_utils.exe" ? "pe" : "python-bytecode";
    if (!r || typeof r.path !== "string" || artifactPaths.has(r.path) || !/^assignments\/module_12\/(?:TestUtils\.class|test_utils(?:\.exe)?|__pycache__\/test_utils\.cpython-\d{2,3}\.pyc)$/.test(r.path)
      || r.repoCommit !== sha || !/^[a-f0-9]{64}$/.test(r.sha256) || !["java-class","elf","pe","python-bytecode"].includes(r.kind)
      || r.kind !== expectedKind
      || r.networkPolicy !== "deny-all" || typeof r.image !== "string" || !r.image.trim() || r.image.length > 512
      || !stage(r.toolVersion) || (r.runtimeVersion !== null && !stage(r.runtimeVersion)) || r.sourceEquivalence !== "unverified" || r.testCoverage !== "unverified" || !stage(r.metadata)
      || !["observed","unsupported-platform","runtime-unavailable"].includes(r.executionStatus)
      || (r.executionStatus === "observed" ? !r.execution || !stage(r.execution) : r.execution !== null)) return false;
    artifactPaths.add(r.path); return true;
  });
}
