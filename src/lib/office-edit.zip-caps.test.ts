// PRESENTATIONS-TEMPLATE W0: the template-fill engine (office-edit.ts) must run
// the BW0 container pre-flight BEFORE decompressing any slide XML. Real in-memory
// jszip fixtures; a lying central directory stands in for a decompression bomb.
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { applyOfficeSections, parseOfficeParagraphs } from "./office-edit";
import { ZIP_REFUSAL_PREFIX, ZipCapError } from "./zip-caps";

const SLIDE_XML =
  '<p:sld><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Hello title</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>';

async function makePptx(extra: Record<string, string> = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("ppt/slides/slide1.xml", SLIDE_XML, { createFolders: false });
  for (const [name, data] of Object.entries(extra)) zip.file(name, data, { createFolders: false });
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

/** Overwrite the declared uncompressed size of one CENTRAL-directory record. */
function patchDeclaredSize(archive: Uint8Array, entryName: string, uncompressed: number): void {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  let eocd = -1;
  for (let i = archive.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("no end-of-central-directory record");
  let cursor = view.getUint32(eocd + 16, true);
  const count = view.getUint16(eocd + 10, true);
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n += 1) {
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const name = decoder.decode(archive.subarray(cursor + 46, cursor + 46 + nameLength));
    if (name === entryName) {
      view.setUint32(cursor + 24, uncompressed, true);
      return;
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`entry ${entryName} not found`);
}

describe("office-edit zip caps (PRESENTATIONS-TEMPLATE W0)", () => {
  it("still parses a legitimate pptx template", async () => {
    const buffer = Buffer.from(await makePptx());
    const paragraphs = await parseOfficeParagraphs("pptx", buffer);
    expect(paragraphs.map((p) => p.text)).toEqual(["Hello title"]);
  });

  it("still fills a legitimate pptx template", async () => {
    const buffer = Buffer.from(await makePptx());
    const [para] = await parseOfficeParagraphs("pptx", buffer);
    const out = await applyOfficeSections("pptx", buffer, [
      { sourceId: para.id, spans: [{ text: "Replaced" }] },
    ]);
    const xml = await (await JSZip.loadAsync(out)).file("ppt/slides/slide1.xml")!.async("string");
    expect(xml).toContain("Replaced");
    expect(xml).not.toContain("Hello title");
  });

  it("refuses a slide member whose declared size lies large, before decompressing", async () => {
    const archive = await makePptx();
    patchDeclaredSize(archive, "ppt/slides/slide1.xml", 0x7fffffff);
    const buffer = Buffer.from(archive);
    await expect(parseOfficeParagraphs("pptx", buffer)).rejects.toBeInstanceOf(ZipCapError);
    await expect(parseOfficeParagraphs("pptx", buffer)).rejects.toThrow(ZIP_REFUSAL_PREFIX);
    await expect(
      applyOfficeSections("pptx", buffer, [{ sourceId: "s0_p0", spans: [{ text: "x" }] }])
    ).rejects.toBeInstanceOf(ZipCapError);
  });

  it("refuses a docx whose document.xml declared size lies large", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>Hi</w:t></w:r></w:p></w:body></w:document>");
    const archive = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    patchDeclaredSize(archive, "word/document.xml", 0x7fffffff);
    await expect(parseOfficeParagraphs("docx", Buffer.from(archive))).rejects.toBeInstanceOf(ZipCapError);
  });

  it("refuses a bomb hidden in a non-slide member (pre-flight covers every member)", async () => {
    const archive = await makePptx({ "ppt/media/big.bin": "x" });
    patchDeclaredSize(archive, "ppt/media/big.bin", 0x7fffffff);
    await expect(parseOfficeParagraphs("pptx", Buffer.from(archive))).rejects.toBeInstanceOf(ZipCapError);
  });
});
