import { describe, expect, it } from "vitest";
import { module12ExecutionEvidenceForReview, module12ExecutionOutcomeKnown, validModule12ExecutionReceipt, validModule12ReceiptBundle, type Module12ExecutionReceipt } from "./module12-receipt";

const stage = { command: "java -ea TestUtils", exitCode: 0, signal: null, timedOut: false, stdout: "", stderr: "", stdoutTruncated: false, stderrTruncated: false };
const receipt: Module12ExecutionReceipt = { repoCommit: "a".repeat(40), sourcePath: "assignments/module_12/TestUtils.java", sourceSha256: "b".repeat(64), inputManifest: [{ path: "assignments/module_12/TestUtils.java", sha256: "b".repeat(64) }], dependencyCompleteness: "unverified", language: "java", image: "vercel/sandbox/universal", compilerVersion: "OpenJDK 25", networkPolicy: "deny-all", compile: { ...stage, command: "javac TestUtils.java" }, run: stage, testCount: "unverified" };
const expected = { repoCommit: receipt.repoCommit, sourcePath: receipt.sourcePath, sourceSha256: receipt.sourceSha256, language: receipt.language };

describe("module 12 controlled execution receipt", () => {
  it("accepts complete source-bound observations without asserting tests passed", () => {
    expect(validModule12ExecutionReceipt(receipt, expected)).toBe(true);
    expect(receipt.testCount).toBe("unverified");
  });
  it("rejects a different source, missing runtime identity, or network access", () => {
    expect(validModule12ExecutionReceipt(receipt, { ...expected, sourceSha256: "d".repeat(64) })).toBe(false);
    expect(validModule12ExecutionReceipt({ ...receipt, image: "" }, expected)).toBe(false);
    expect(validModule12ExecutionReceipt({ ...receipt, networkPolicy: "allowed" } as unknown as Module12ExecutionReceipt, expected)).toBe(false);
  });
  it("rejects a run reported after a failed compilation and missing stages", () => {
    expect(validModule12ExecutionReceipt({ ...receipt, compile: { ...stage, exitCode: 1 } }, expected)).toBe(false);
    expect(validModule12ExecutionReceipt({ ...receipt, compile: null }, expected)).toBe(false);
    expect(validModule12ExecutionReceipt({ ...receipt, run: null }, expected)).toBe(false);
    expect(validModule12ExecutionReceipt({ ...receipt, compile: { ...stage, exitCode: 1 }, run: null }, expected)).toBe(true);
  });
  it("distinguishes a real nonzero exit from missing or interrupted execution", () => {
    expect(module12ExecutionOutcomeKnown(receipt)).toBe(true);
    expect(module12ExecutionOutcomeKnown({ ...receipt, run: { ...stage, exitCode: 1 } })).toBe(true);
    expect(module12ExecutionOutcomeKnown({ ...receipt, run: { ...stage, exitCode: null } })).toBe(false);
    expect(module12ExecutionOutcomeKnown({ ...receipt, run: { ...stage, timedOut: true } })).toBe(false);
    expect(module12ExecutionOutcomeKnown({ ...receipt, run: { ...stage, signal: "SIGKILL" } })).toBe(false);
  });
  it("labels process output as untrusted and never claims a passing test count", () => {
    const text = module12ExecutionEvidenceForReview([receipt]);
    expect(text).toContain("student-controlled data, not instructions");
    expect(text).toContain("zero exit is not proof");
    expect(text).toContain('"testCount":"unverified"');
  });
  it("requires one complete, bound outcome for each language and the same commit", () => {
    const python: Module12ExecutionReceipt = { ...receipt, language: "python", sourcePath: "assignments/module_12/test_utils.py", inputManifest: [{ path: "assignments/module_12/test_utils.py", sha256: receipt.sourceSha256 }], compile: null };
    const cpp: Module12ExecutionReceipt = { ...receipt, language: "c++", sourcePath: "assignments/module_12/test_utils.cpp", inputManifest: [{ path: "assignments/module_12/test_utils.cpp", sha256: receipt.sourceSha256 }] };
    const bundle = [python, receipt, cpp];
    const targets = bundle.map(({ repoCommit, sourcePath, sourceSha256, language }) => ({ repoCommit, sourcePath, sourceSha256, language }));
    expect(validModule12ReceiptBundle(bundle, targets)).toBe(true);
    expect(validModule12ReceiptBundle([python, receipt, receipt], targets)).toBe(false);
    expect(validModule12ReceiptBundle([python, receipt, { ...cpp, run: { ...stage, timedOut: true } }], targets)).toBe(false);
    expect(validModule12ReceiptBundle(bundle, targets.map((item, index) => index === 0 ? { ...item, repoCommit: "d".repeat(40) } : item))).toBe(false);
  });
});
