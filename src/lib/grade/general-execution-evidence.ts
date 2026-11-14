import { isBoundedJsonString, jsonbTextSizeUpperBound } from "./jsonb-text-size";
import { MAX_GENERIC_EXECUTION_FILES, MAX_GENERIC_OUTPUT_JSON_BYTES } from "./generic-execution-limits";

export type GeneralStage = { command: string; exitCode: number | null; signal: string | null; timedOut: boolean; stdout: string; stderr: string; stdoutTruncated: boolean; stderrTruncated: boolean };
export type GeneralExecutionEvidence = {
  repoCommit: string;
  policy?: "source-only";
  inputManifest: Array<{ path: string; sha256: string }>;
  runs: Array<{ language: "python" | "javascript" | "java" | "c" | "c++"; entryPoint: string; selection: "heuristic"; image: string; toolVersion: string; networkPolicy: "deny-all"; compile: GeneralStage | null; run: GeneralStage | null; status: "observed" | "unsupported" | "ambiguous" | "unavailable" }>;
  held: Array<{ language: "python" | "javascript" | "java" | "c" | "c++"; reason: "ambiguous" | "no-entry-point" }>;
  coverage: { status: "unverified" };
  /** Supported artifacts not started because the current tick lacked time. */
  continuation?: { manifestSha256: string; paths: string[]; sources?: Array<{entryPoint:string;language:"python" | "javascript" | "java" | "c" | "c++";planSha256:string}> };
  artifacts: Array<{ path: string; sha256: string; kind: string; status: "unexamined" | "unsupported" } | { path: string; sha256: string; kind: "pe" | "elf" | "java-class" | "python-bytecode" | "wasm"; status: "observed"; repoCommit: string; architecture: "x86_64" | "unknown"; image: string; runtime: "wine" | "native" | "java" | "python" | "wasi"; runtimeVersion: string; networkPolicy: "deny-all"; execution: GeneralStage; sourceEquivalence: "unverified"; coverage: "unverified" }>;
};
export type GeneralExecutionSummary = { policy?: "source-only"; coverage: { status: "unverified" }; held: Array<{ language: string; reason: "ambiguous" | "no-entry-point" }>; runs: Array<{ language: string; entryPoint: string; status: string; compileExit: number | null; runExit: number | null; compileState: string; runState: string }>; artifacts: Array<{ path: string; kind: string; status: string; runtime: string | null; executionExit: number | null; executionState: string }> };
export type GeneralSourceReview = { overall: string; rubric: Array<{ area: string; comment: string }> };
export function validGeneralSourceReview(value: unknown): value is GeneralSourceReview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const r = value as GeneralSourceReview;
  const text = (v: unknown, max: number): v is string => typeof v === "string" && v.isWellFormed() && !v.includes("\u0000") && [...v].length <= max;
  return Object.keys(r).sort().join() === "overall,rubric" && text(r.overall,16000) && Array.isArray(r.rubric) && r.rubric.length <= 40
    && r.rubric.every(item => !!item && Object.keys(item).sort().join() === "area,comment" && text(item.area,256) && !!item.area.trim() && text(item.comment,4096))
    && (!!r.overall.trim() || r.rubric.some(item => !!item.comment.trim())) && jsonbTextSizeUpperBound(r) <= 199000;
}
const hex = (x: unknown, length: number): x is string => typeof x === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(x);
const path = (x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length <= 600 && !/[\x00-\x1f\x7f\\]/.test(x) && !x.split("/").some(p => !p || p === "." || p === "..");
const stage = (s: GeneralStage | null) => s === null || (!!s && typeof s === "object" && typeof s.command === "string" && s.command.length > 0 && s.command.length <= 1000
  && (s.exitCode === null || Number.isSafeInteger(s.exitCode)) && (s.signal === null || (typeof s.signal === "string" && s.signal.length <= 128))
  && typeof s.timedOut === "boolean" && isBoundedJsonString(s.stdout, MAX_GENERIC_OUTPUT_JSON_BYTES) && isBoundedJsonString(s.stderr, MAX_GENERIC_OUTPUT_JSON_BYTES)
  && typeof s.stdoutTruncated === "boolean" && typeof s.stderrTruncated === "boolean");
/** Structural only: trusted caller must verify every manifest hash against pinned bytes. */
export function validGeneralExecutionEvidence(value: unknown): value is GeneralExecutionEvidence {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const e = value as GeneralExecutionEvidence;
  if (!hex(e.repoCommit,40) || (e.policy !== undefined && e.policy !== "source-only") || JSON.stringify(e.coverage) !== '{"status":"unverified"}' || !Array.isArray(e.inputManifest) || e.inputManifest.length < 1 || e.inputManifest.length > MAX_GENERIC_EXECUTION_FILES
    || !e.inputManifest.every(f => f && path(f.path) && hex(f.sha256,64)) || new Set(e.inputManifest.map(f => f.path.toLowerCase())).size !== e.inputManifest.length
    || !Array.isArray(e.runs) || e.runs.length > 10 || !Array.isArray(e.held) || e.held.length > 5 || !Array.isArray(e.artifacts)
    || !e.held.every(h => h && ["python","javascript","java","c","c++"].includes(h.language) && ["ambiguous","no-entry-point"].includes(h.reason))
    || new Set(e.held.map(h => h.language)).size !== e.held.length || e.artifacts.length > 40
    || new TextEncoder().encode(JSON.stringify(e)).byteLength > 500000) return false;
  if (!e.runs.every(r => r && ["python","javascript","java","c","c++"].includes(r.language) && path(r.entryPoint)
    && e.inputManifest.some(f => f.path === r.entryPoint) && r.selection === "heuristic" && typeof r.image === "string" && r.image.length > 0 && r.image.length <= 512
    && typeof r.toolVersion === "string" && r.toolVersion.length > 0 && r.toolVersion.length <= 512 && r.networkPolicy === "deny-all"
    && ["observed","unsupported","ambiguous","unavailable"].includes(r.status) && stage(r.compile) && stage(r.run))) return false;
  if (e.continuation && (!hex(e.continuation.manifestSha256,64) || !Array.isArray(e.continuation.paths) || e.continuation.paths.length > 40
    || (e.continuation.sources !== undefined && (!Array.isArray(e.continuation.sources) || e.continuation.sources.length > 5 || !e.continuation.sources.every(v => v && path(v.entryPoint) && e.inputManifest.some(f => f.path === v.entryPoint) && ["python","javascript","java","c","c++"].includes(v.language) && hex(v.planSha256,64)) || new Set(e.continuation.sources.map(v => `${v.language}:${v.entryPoint}`)).size !== e.continuation.sources.length))
    || (!e.continuation.paths.length && !e.continuation.sources?.length)
    || !e.continuation.paths.every(p => typeof p === "string")
    || new Set(e.continuation.paths.map(p => p.toLowerCase())).size !== e.continuation.paths.length
    || !e.continuation.paths.every(p => path(p) && e.inputManifest.some(f => f.path === p) && e.artifacts.some(a => a.path === p && a.status === "unexamined")))) return false;
  if (e.policy === "source-only" && (e.runs.length || e.held.length || e.artifacts.length)) return false;
  if (new Set(e.runs.map(r => `${r.language}\u0000${r.entryPoint.toLowerCase()}`)).size !== e.runs.length || e.runs.some(r => e.held.some(h => h.language === r.language))) return false;
  return e.artifacts.every(a => a && path(a.path) && hex(a.sha256,64) && e.inputManifest.some(f => f.path === a.path && f.sha256 === a.sha256) && typeof a.kind === "string" && a.kind.length > 0 && a.kind.length <= 64
    && (a.status === "observed" ? ((a.kind === "pe" && a.runtime === "wine" && a.architecture === "x86_64") || (a.kind === "elf" && a.runtime === "native" && a.architecture === "unknown") || (a.kind === "java-class" && a.runtime === "java" && a.architecture === "unknown") || (a.kind === "python-bytecode" && a.runtime === "python" && a.architecture === "unknown") || (a.kind === "wasm" && a.runtime === "wasi" && a.architecture === "unknown")) && a.repoCommit === e.repoCommit && typeof a.image === "string" && a.image.length > 0 && a.image.length <= 512
      && typeof a.runtimeVersion === "string" && a.runtimeVersion.length > 0 && a.runtimeVersion.length <= 512 && a.networkPolicy === "deny-all"
      && a.sourceEquivalence === "unverified" && a.coverage === "unverified" && a.execution !== null && stage(a.execution)
      : ["unexamined","unsupported"].includes(a.status)))
    && new Set(e.artifacts.map(a => a.path.toLowerCase())).size === e.artifacts.length;
}
export function validGeneralExecutionSummary(value: unknown): value is GeneralExecutionSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const e = value as GeneralExecutionSummary; const exit = (v: unknown) => v === null || Number.isSafeInteger(v);
  return (e.policy === undefined || e.policy === "source-only") && JSON.stringify(e.coverage) === '{"status":"unverified"}' && Array.isArray(e.runs) && e.runs.length <= 10
    && Array.isArray(e.held) && e.held.length <= 5 && Array.isArray(e.artifacts) && e.held.every(h => h && ["python","javascript","java","c","c++"].includes(h.language) && ["ambiguous","no-entry-point"].includes(h.reason))
    && e.runs.every(r => r && ["python","javascript","java","c","c++"].includes(r.language) && path(r.entryPoint) && ["observed","unsupported","ambiguous","unavailable"].includes(r.status)
      && exit(r.compileExit) && exit(r.runExit) && ["not-recorded","timed-out","signalled","unknown","completed"].includes(r.compileState) && ["not-recorded","timed-out","signalled","unknown","completed"].includes(r.runState))
    && Array.isArray(e.artifacts) && e.artifacts.length <= 40 && e.artifacts.every(a => a && path(a.path) && typeof a.kind === "string" && a.kind.length <= 64
      && ["unexamined","unsupported","observed"].includes(a.status) && (a.runtime === null || ["wine","native","java","python","wasi"].includes(a.runtime)) && exit(a.executionExit)
      && ["not-recorded","timed-out","signalled","unknown","completed"].includes(a.executionState));
}

/** Transport/selection gate only; successful execution is not proof of coverage or correctness. */
export function generalEvidenceScorable(e: GeneralExecutionEvidence): boolean {
  const completed = (s: GeneralStage | null) => !!s && s.exitCode === 0 && s.signal === null && !s.timedOut;
  return !e.continuation && e.held.length === 0 && (e.runs.length > 0 || e.artifacts.length > 0 || e.policy === "source-only")
    && e.runs.every(r => r.status === "observed" && completed(r.run) && (r.compile === null || completed(r.compile)))
    && e.artifacts.every(a => a.status === "observed" && completed(a.execution));
}
