import { expect, it } from "vitest";
import JSZip from "jszip";
import { appendZipEvidence } from "./append-zip-evidence";
import { ingestZipEntries } from "./extraction";

it("preserves the original file and delivers mapped index comments with the student's work", async () => {
  const zip = new JSZip(); zip.file("10-20 - work.cpp", "int main() {}");
  const source = new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" })).buffer]);
  const result = await appendZipEvidence(source, [{ path: "10-20 - index-comment.txt", text: "Submission comment: preserve this" }]);
  expect(result.ok).toBe(true); if (!result.ok) return;
  const files = await JSZip.loadAsync(await result.archive.arrayBuffer(), { checkCRC32: true });
  expect(await files.file("10-20 - work.cpp")!.async("string")).toBe("int main() {}");
  expect(await files.file("10-20 - index-comment.txt")!.async("string")).toBe("Submission comment: preserve this");
  const ingested = await ingestZipEntries(await result.archive.arrayBuffer(), { requireSupportedFiles: true, reviewedMapping: { "10-20 - work.cpp": "Student", "10-20 - index-comment.txt": "Student" } });
  expect(ingested.entries).toHaveLength(1); expect(ingested.entries[0].content).toContain("preserve this");
});

it("refuses collisions and path traversal", async () => {
  const zip = new JSZip(); zip.file("10-20 - work.txt", "work");
  const source = new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array" })).buffer]);
  expect((await appendZipEvidence(source, [{ path: "10-20 - work.txt", text: "other" }])).ok).toBe(false);
  expect((await appendZipEvidence(source, [{ path: "../other.txt", text: "other" }])).ok).toBe(false);
});
