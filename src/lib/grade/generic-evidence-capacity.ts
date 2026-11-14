import type { GenericExecutionPlan } from "./generic-repo-execution-plan";
import { jsonbTextSizeUpperBound } from "./jsonb-text-size";

/** Preflight the largest possible stored envelope before any external dispatch.
 * PostgreSQL jsonb text inserts whitespace after structural separators; the
 * synthetic envelope includes the maximum bounded stage and version fields. */
export function assertGenericEvidenceCapacity(input: {
  manifest: readonly { path: string; sha256: string }[];
  plan: GenericExecutionPlan;
  artifacts: readonly { path: string; sha256: string; kind: string; status: string }[];
}): void {
  if (input.manifest.some(file => file.path.length > 600)) throw new Error("Execution path exceeds supported bounds");
  const wide = "界";
  const stage = { command: wide.repeat(1000), exitCode: -9007199254740991, signal: wide.repeat(128), timedOut: false,
    stdout: ":".repeat(3998), stderr: ":".repeat(3998), stdoutTruncated: false, stderrTruncated: false };
  const envelope = {
    repoCommit: "a".repeat(40), policy: "source-only", inputManifest: input.manifest,
    runs: input.plan.runs.map(run => ({ ...run, image: wide.repeat(512), toolVersion: wide.repeat(512),
      networkPolicy: "deny-all", compile: stage, run: stage, status: "observed" })),
    held: input.plan.held, coverage: { status: "unverified" },
    artifacts: input.artifacts.map(artifact => ({ ...artifact, status: "observed", repoCommit: "a".repeat(40),
      architecture: "x86_64", image: wide.repeat(512), runtime: "python", runtimeVersion: wide.repeat(512),
      networkPolicy: "deny-all", execution: stage, sourceEquivalence: "unverified", coverage: "unverified" })),
    continuation: { manifestSha256: "a".repeat(64), paths: input.artifacts.map(item => item.path),
      sources: input.plan.runs.map(run => ({ entryPoint: run.entryPoint, language: run.language, planSha256: "a".repeat(64) })) },
  };
  if (jsonbTextSizeUpperBound(envelope) > 480_000) throw new Error("Execution evidence exceeds supported bounds");
}
