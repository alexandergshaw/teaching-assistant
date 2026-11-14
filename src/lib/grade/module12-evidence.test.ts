import { describe, expect, it } from "vitest";
import { validModule12Evidence } from "./module12-evidence";

const sha = "a".repeat(40);
const stage = { command: "run", exitCode: 0, signal: null, timedOut: false, stdout: "", stderr: "", stdoutTruncated: false, stderrTruncated: false };
const names = ["test_utils.py", "TestUtils.java", "test_utils.cpp"];
const manifest = names.map(name => ({ path: `assignments/module_12/${name}`, sha256: "b".repeat(64) }));
const receipts = (["python", "java", "c++"] as const).map((language, i) => ({ repoCommit: sha, sourcePath: manifest[i].path, sourceSha256: manifest[i].sha256, inputManifest: manifest, dependencyCompleteness: "unverified" as const, language, image: "image", compilerVersion: "version", networkPolicy: "deny-all" as const, compile: i === 0 ? null : stage, run: stage, testCount: "unverified" as const }));

describe("partial execution evidence", () => {
  it("accepts bound source observations without implying verified coverage", () => {
    expect(validModule12Evidence({ sourceReceipts: receipts, artifactReceipts: [], coverage: { status: "unverified" } }, sha)).toBe(true);
  });
  it("rejects forged coverage, a mismatched pin, and inconsistent manifests", () => {
    expect(validModule12Evidence({ sourceReceipts: receipts, artifactReceipts: [], coverage: { status: "verified" } }, sha)).toBe(false);
    expect(validModule12Evidence({ sourceReceipts: receipts, artifactReceipts: [], coverage: { status: "unverified" } }, "c".repeat(40))).toBe(false);
    expect(validModule12Evidence({ sourceReceipts: [{ ...receipts[0], inputManifest: [manifest[0]] }, ...receipts.slice(1)], artifactReceipts: [], coverage: { status: "unverified" } }, sha)).toBe(false);
  });
  it("rejects mismatched or duplicate artifact identities", () => {
    const artifactStage = { command: "file", exitCode: 0, termination: null, stdout: "", stderr: "", stdoutTruncated: false, stderrTruncated: false };
    const artifact = { path: "assignments/module_12/TestUtils.class", repoCommit: sha, sha256: "c".repeat(64), kind: "java-class", networkPolicy: "deny-all", image: "image", toolVersion: artifactStage, runtimeVersion: artifactStage, metadata: artifactStage, executionStatus: "observed", execution: artifactStage, sourceEquivalence: "unverified", testCoverage: "unverified" };
    const envelope = { sourceReceipts: receipts, artifactReceipts: [artifact], coverage: { status: "unverified" } };
    expect(validModule12Evidence(envelope, sha)).toBe(true);
    expect(validModule12Evidence({ ...envelope, artifactReceipts: [{ ...artifact, kind: "pe" }] }, sha)).toBe(false);
    expect(validModule12Evidence({ ...envelope, artifactReceipts: [artifact, artifact] }, sha)).toBe(false);
  });
});
