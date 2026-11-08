import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { extractSubmissions, ingestZipEntries } from "./extraction";
import { unsupportedArchiveReason } from "./unsupported-archive";
import { linkedArchiveIssue } from "./link-evidence";

describe("ZIP intake omission safety", () => {
  it("reports unsupported members without treating common Mac metadata as submissions", async () => {
    const zip = new JSZip();
    zip.file("Ada/essay.txt", "A submission");
    zip.file("Ada/diagram.xyz", "unsupported");
    zip.file("__MACOSX/._essay.txt", "metadata");
    zip.file("Ada/.DS_Store", "metadata");
    zip.file("Ada/Thumbs.db", "metadata");
    zip.file("Ada/.git/config", "metadata");
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const extracted = await extractSubmissions(bytes);
    expect(extracted.unsupportedFiles).toEqual(["Ada/diagram.xyz"]);
    expect(extracted.submissions["Ada/essay.txt"]).toBe("A submission");
    expect(Object.keys(extracted.submissions)).toEqual(["Ada/essay.txt"]);
    await expect(ingestZipEntries(bytes, { requireSupportedFiles: true })).rejects.toThrow("Ada/diagram.xyz");
  });

  it("reports archives deeper than the supported nesting limit", async () => {
    let content = await new JSZip().file("answer.txt", "work").generateAsync({ type: "uint8array" });
    for (let depth = 0; depth < 4; depth++) content = await new JSZip().file(`level${depth}.zip`, content).generateAsync({ type: "uint8array" });
    const buffer = new Uint8Array(content).buffer;
    const extracted = await extractSubmissions(buffer);
    expect(extracted.unsupportedFiles).toHaveLength(1);
    expect(extracted.unsupportedFiles[0]).toContain(".zip");
    await expect(ingestZipEntries(buffer, { requireSupportedFiles: true })).rejects.toThrow("not supported");
  });

  it("admits a readable submission accompanied only by known bookkeeping", async () => {
    const zip = new JSZip();
    zip.file("Ada/essay.txt", "Work submitted by Ada");
    zip.file("Ada/.git/objects/something", "metadata");
    zip.file("Ada/Thumbs.db", "metadata");
    const result = await ingestZipEntries(await zip.generateAsync({ type: "arraybuffer" }), { requireSupportedFiles: true });
    expect(result.entries).toHaveLength(1);
    expect(result.unsupportedFiles).toEqual([]);
    expect(result.entries[0].content).toContain("Work submitted by Ada");
  });

  it("reports version-control configuration that could be required work", async () => {
    const zip = new JSZip();
    zip.file("Ada/essay.txt", "work");
    zip.file("Ada/.gitignore", "*.tmp");
    zip.file("Ada/.gitattributes", "*.txt text");
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const extracted = await extractSubmissions(bytes);
    expect(extracted.unsupportedFiles).toEqual(["Ada/.gitignore", "Ada/.gitattributes"]);
    await expect(ingestZipEntries(bytes, { requireSupportedFiles: true })).rejects.toThrow(".gitignore");
  });

  it("bounds and sanitizes refusal details", () => {
    const message = unsupportedArchiveReason(["A\n" + "x".repeat(300), "B", "C", "D"])!;
    expect(message).toContain("and 1 more");
    expect(message).not.toContain("\n");
    expect(message.length).toBeLessThan(350);
  });

  it("flags unsupported content in a linked archive without calling it unreadable", () => {
    const issue = linkedArchiveIssue(0, 0, [], 1);
    expect(issue?.status).toBe("flagged");
    expect(issue?.note).toContain("unsupported");
    expect(issue?.note).not.toContain("unreadable");
  });
});
