import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { extractTextFromBuffer } from "./office-extract";
import { ZipCapError } from "./zip-caps";

async function build(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(files)) zip.file(name, body);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** Rewrite the central-directory uncompressed size (record offset +24) of every entry. */
function lieAboutSize(buf: Buffer, declared: number): Buffer {
  const out = Buffer.from(buf);
  for (let i = 0; i + 28 <= out.length; i += 1) {
    if (out[i] === 0x50 && out[i + 1] === 0x4b && out[i + 2] === 0x01 && out[i + 3] === 0x02) {
      out.writeUInt32LE(declared, i + 24);
    }
  }
  return out;
}

const DOCX = { "word/document.xml": "<w:p><w:r><w:t>Hello docx</w:t></w:r></w:p>" };
const PPTX = { "ppt/slides/slide1.xml": "<a:t>Slide one</a:t>" };
const XLSX = { "xl/sharedStrings.xml": "<si><t>Cell value</t></si>" };

describe("extractTextFromBuffer Office caps (I6)", () => {
  it("still extracts legitimate docx, pptx and xlsx", async () => {
    expect(await extractTextFromBuffer("a.docx", await build(DOCX))).toBe("Hello docx");
    expect(await extractTextFromBuffer("a.pptx", await build(PPTX))).toBe("Slide one");
    expect(await extractTextFromBuffer("a.xlsx", await build(XLSX))).toBe("Cell value");
  });

  it("refuses a docx whose declared size is over the cap, without decompressing", async () => {
    const buf = lieAboutSize(await build(DOCX), 200 * 1024 * 1024);
    await expect(extractTextFromBuffer("a.docx", buf)).rejects.toBeInstanceOf(ZipCapError);
    await expect(extractTextFromBuffer("a.docx", buf)).rejects.toThrow(/^Refused: /);
  });

  it("refuses a docx whose UNREAD inner media member lies large (pre-flight covers every member)", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", DOCX["word/document.xml"]);
    zip.file("word/media/bomb.bin", "x".repeat(64));
    const raw = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    // Patch only the media entry's central record (found by name).
    const out = Buffer.from(raw);
    for (let i = 0; i + 46 <= out.length; i += 1) {
      if (out[i] === 0x50 && out[i + 1] === 0x4b && out[i + 2] === 0x01 && out[i + 3] === 0x02) {
        const nameLen = out.readUInt16LE(i + 28);
        const recordName = out.toString("utf-8", i + 46, i + 46 + nameLen);
        if (recordName === "word/media/bomb.bin") out.writeUInt32LE(200 * 1024 * 1024, i + 24);
      }
    }
    await expect(extractTextFromBuffer("a.docx", out)).rejects.toBeInstanceOf(ZipCapError);
  });

  it("refuses pptx and xlsx whose declared size is over the cap", async () => {
    await expect(
      extractTextFromBuffer("a.pptx", lieAboutSize(await build(PPTX), 200 * 1024 * 1024))
    ).rejects.toBeInstanceOf(ZipCapError);
    await expect(
      extractTextFromBuffer("a.xlsx", lieAboutSize(await build(XLSX), 200 * 1024 * 1024))
    ).rejects.toBeInstanceOf(ZipCapError);
  });

  it("refuses an honest member over an injected tiny cap", async () => {
    await expect(
      extractTextFromBuffer("a.docx", await build(DOCX), { limits: { maxMemberDeclaredBytes: 8 } })
    ).rejects.toBeInstanceOf(ZipCapError);
  });

  it("stops a member that lies small once it outgrows its declared size", async () => {
    const buf = lieAboutSize(await build({ "word/document.xml": "x".repeat(5000) }), 100);
    await expect(extractTextFromBuffer("a.docx", buf)).rejects.toBeInstanceOf(ZipCapError);
  });

  it("charges the shared budget across calls", async () => {
    const { createZipBudget } = await import("./zip-caps");
    const budget = createZipBudget({ cumulativeBytes: 60 });
    const buf = await build(DOCX);
    await extractTextFromBuffer("a.docx", buf, { budget });
    await expect(extractTextFromBuffer("b.docx", buf, { budget })).rejects.toBeInstanceOf(ZipCapError);
  });

  it("a missing inner declared size is refused", async () => {
    const original = JSZip.loadAsync.bind(JSZip);
    const spy = vi.spyOn(JSZip, "loadAsync").mockImplementation(async (data, opts) => {
      const zip = await original(data, opts);
      (zip.files["word/document.xml"] as unknown as { _data?: unknown })._data = undefined;
      return zip;
    });
    try {
      await expect(extractTextFromBuffer("a.docx", await build(DOCX))).rejects.toBeInstanceOf(ZipCapError);
    } finally {
      spy.mockRestore();
    }
  });

  it("a non-cap failure (not a real docx) is not turned into a cap error", async () => {
    const error = await extractTextFromBuffer("a.docx", Buffer.from("this is not a real docx")).catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ZipCapError);
  });
});
