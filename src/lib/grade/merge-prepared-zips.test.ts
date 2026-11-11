import { expect, it } from "vitest";
import JSZip from "jszip";
import { mergePreparedZips } from "./merge-prepared-zips";
import { ingestZipEntries } from "./extraction";

async function archive(path: string, content: string): Promise<Blob> {
  const zip = new JSZip(); zip.file(path, content);
  return new Blob([new Uint8Array(await zip.generateAsync({ type: "uint8array", compression: "STORE" })).buffer]);
}

it("merges independently prepared student archives without changing their content", async () => {
  const first = await archive("100-200 - first.txt", "first student's work"), second = await archive("101-201 - second.txt", "second student's work");
  const result = await mergePreparedZips([first, second]); expect(result.ok).toBe(true); if (!result.ok) return;
  const zip = await JSZip.loadAsync(await result.archive.arrayBuffer());
  expect(await zip.file("100-200 - first.txt")?.async("string")).toBe("first student's work");
  expect(await zip.file("101-201 - second.txt")?.async("string")).toBe("second student's work");
});

it("refuses paths that collide across prepared archives", async () => {
  const result = await mergePreparedZips([await archive("SAME.txt", "one"), await archive("same.txt", "two")]);
  expect(result).toEqual({ ok: false, reason: "prepared archives contain conflicting paths" });
});

it("preserves nested project bytes and companion evidence", async () => {
  const inner = await archive("project/main.cpp", "int main() {}"), outer = new JSZip();
  outer.file("100-200 - project.zip", await inner.arrayBuffer()); outer.file("100-200 - comments.txt", "student comment");
  const prepared = new Blob([new Uint8Array(await outer.generateAsync({ type: "uint8array", compression: "STORE" })).buffer]);
  const result = await mergePreparedZips([prepared, await archive("101-201 - submission.txt", "other student")]);
  expect(result.ok).toBe(true); if (!result.ok) return;
  const combined = await JSZip.loadAsync(await result.archive.arrayBuffer());
  const nested = await JSZip.loadAsync(await combined.file("100-200 - project.zip")!.async("uint8array"));
  expect(await nested.file("project/main.cpp")!.async("string")).toBe("int main() {}");
  expect(await combined.file("100-200 - comments.txt")!.async("string")).toBe("student comment");
  expect(await combined.file("101-201 - submission.txt")!.async("string")).toBe("other student");
});

it("keeps nested and flat submissions attributed to their own students through extraction", async () => {
  const inner = await archive("main.cpp", "int main() { return 7; }"), project = new JSZip();
  project.file("100-200 - project.zip", await inner.arrayBuffer()); project.file("100-200 - index.txt", "Ada comment");
  const first = new Blob([new Uint8Array(await project.generateAsync({ type: "uint8array", compression: "STORE" })).buffer]);
  const second = await archive("101-201 - essay.txt", "Lin essay");
  const result = await mergePreparedZips([first, second]); expect(result.ok).toBe(true); if (!result.ok) return;
  const extracted = await ingestZipEntries(await result.archive.arrayBuffer(), { requireSupportedFiles: true, reviewedMapping: { "100-200 - project.zip/main.cpp": "Ada", "100-200 - index.txt": "Ada", "101-201 - essay.txt": "Lin" } });
  expect(extracted.entries).toHaveLength(2);
  expect(extracted.entries.find((entry) => entry.student === "Ada")?.content).toContain("return 7");
  expect(extracted.entries.find((entry) => entry.student === "Ada")?.content).toContain("Ada comment");
  expect(extracted.entries.find((entry) => entry.student === "Lin")?.content).toContain("Lin essay");
  expect(extracted.entries.find((entry) => entry.student === "Lin")?.content).not.toContain("Ada comment");
});

it("refuses a corrupt prepared member", async () => {
  const source = new Uint8Array(await (await archive("a.txt", "hello")).arrayBuffer());
  const nameLength = new DataView(source.buffer).getUint16(26, true); source[30 + nameLength] ^= 1;
  expect(await mergePreparedZips([new Blob([source.buffer])])).toEqual({ ok: false, reason: "prepared archive failed integrity verification" });
});
