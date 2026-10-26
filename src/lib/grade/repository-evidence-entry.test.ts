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