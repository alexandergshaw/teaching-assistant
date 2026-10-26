import { expect, it } from "vitest";
import { freezeRepositorySnapshot, assembleRepositoryEvidenceEntry, repositoryEntryCanonicalText } from "./repository-evidence-entry";
it("deeply freezes a structured server snapshot without freezing or sharing the caller object", () => {
  const input = { child: { text: "original" } }; const frozen = freezeRepositorySnapshot(input);
  input.child.text = "changed"; expect(frozen.child.text).toBe("original"); expect(Object.isFrozen(frozen)).toBe(true); expect(Object.isFrozen(frozen.child)).toBe(true); expect(Object.isFrozen(input)).toBe(false);
});
it("the client-safe assembler preserves original material and canonical fields with no server imports needed", () => {
  const original = { student: "Student", content: "ORIGINAL_SENTINEL", mergedFileCount: 1, submittedFiles: [{ name: "main.py", extension: "py", previewContent: "ORIGINAL_FILE_SENTINEL", previewTruncated: false }] };
  const first = assembleRepositoryEvidenceEntry(original, []), second = assembleRepositoryEvidenceEntry(original, []);
  expect(first.content).toContain("ORIGINAL_SENTINEL"); expect(first.content).toContain("ORIGINAL_FILE_SENTINEL"); expect(first.submittedFiles[0].name).toBe("original:0:main.py"); expect(repositoryEntryCanonicalText(first)).toBe(repositoryEntryCanonicalText(second)); expect(original.submittedFiles[0].name).toBe("main.py");
});
it("strict namespaced citations retain original path identities and omissions independently of source text", () => {
  const manifest: import("./repository-evidence-types").RepositoryEvidenceManifest = { originalUrl: "https://github.com/o/r/tree/main/src", scope: { owner: "o", repo: "r", kind: "tree", requestedRef: "main", requestedPath: "src" }, commitSha: "a".repeat(40), collectedAt: "fixed", pin: "immutable", digest: "b".repeat(64), timing: { kind: "unknown", reason: "no-trusted-submission-time" }, files: [{ id: "repo:opaque:src/Main.py", path: "src/Main.py", bytes: 4, truncated: false }], coverage: { complete: false, treeTruncated: false, unenumerated: false, omitted: [{ path: "src/REQUIRED", reason: "unsupported" }, { path: "src/proof.png", reason: "unsupported" }] } };
  const composed = assembleRepositoryEvidenceEntry({ student: "Student", content: "", mergedFileCount: 1, submittedFiles: [{ name: "Main.py", extension: "py", previewContent: "original", previewTruncated: false }] }, [{ manifest, files: [{ id: "repo:opaque:src/Main.py", path: "src/Main.py", text: "code", truncated: false }] }]);
  expect(composed.repositoryInventories?.[0].files).toEqual([{ path: "Main.py", content: "read" }]);
  expect(composed.repositoryInventories?.[1]).toMatchObject({ scope: { kind: "tree", path: "src" }, enumerationComplete: true, files: [{ path: "src/Main.py", content: "read" }, { path: "src/REQUIRED", content: "unsupported" }, { path: "src/proof.png", content: "unsupported" }] });
  const changed = structuredClone(composed); changed.repositoryInventories![1].enumerationComplete = false;
  expect(repositoryEntryCanonicalText(changed)).not.toBe(repositoryEntryCanonicalText(composed));
  expect(composed.submittedFiles[1].name).toBe("repo:opaque:src/Main.py");
});
