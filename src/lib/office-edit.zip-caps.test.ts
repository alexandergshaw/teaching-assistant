// PRESENTATIONS-TEMPLATE W0: the template-fill engine (office-edit.ts) must run
// the BW0 container pre-flight BEFORE decompressing any slide XML. Real in-memory
// jszip fixtures; a lying central directory stands in for a decompression bomb.
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { readFileSync } from "node:fs";
import {
  appendDocxParagraph,
  applyOfficeSections,
  extractDocxTitle,
  extractOfficeImageData,
  extractOfficeImages,
  parseOfficeParagraphs,
  setDocxTitle,
  setOfficeImageAlt,
} from "./office-edit";
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

// DECOMPRESS-CAP-HARDENING W1: the lie-low residual. A member that declares
// SMALL but inflates LARGE passes openOfficeZip's declared-size pre-flight, so
// every raw member read must go through the bounded reader. Each case patches
// the member a function reads to declare 5 bytes (real content is far larger)
// and expects the stream-overrun refusal.
const DOC_XML =
  '<w:document xmlns:w="w" xmlns:wp="wp" xmlns:a="a" xmlns:r="r"><w:body><w:p><w:r><w:t>Hi</w:t></w:r></w:p>' +
  '<w:drawing><wp:docPr id="1" name="Pic" descr=""/><a:blip r:embed="rId9"/></w:drawing></w:body></w:document>';
const DOC_RELS = '<Relationships><Relationship Id="rId9" Target="media/a.png"/></Relationships>';
const CORE_XML = '<cp:coreProperties xmlns:cp="cp" xmlns:dc="dc"><dc:title>Old</dc:title></cp:coreProperties>';
const PAD = " ".repeat(200);

async function makeDocx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("word/document.xml", DOC_XML + PAD, { createFolders: false });
  zip.file("word/_rels/document.xml.rels", DOC_RELS + PAD, { createFolders: false });
  zip.file("word/media/a.png", "x".repeat(300), { createFolders: false });
  zip.file("docProps/core.xml", CORE_XML + PAD, { createFolders: false });
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

const PPTX_SLIDE =
  '<p:sld xmlns:p="p" xmlns:a="a" xmlns:r="r"><p:pic><p:cNvPr id="4" name="P" descr=""/><a:blip r:embed="rId2"/></p:pic></p:sld>';

async function makePicPptx(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("ppt/slides/slide1.xml", PPTX_SLIDE + PAD, { createFolders: false });
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    '<Relationships><Relationship Id="rId2" Target="../media/a.png"/></Relationships>' + PAD,
    { createFolders: false }
  );
  zip.file("ppt/media/a.png", "x".repeat(300), { createFolders: false });
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

async function lieLow(make: () => Promise<Uint8Array>, member: string): Promise<Buffer> {
  const archive = await make();
  patchDeclaredSize(archive, member, 5);
  return Buffer.from(archive);
}

describe("office-edit lie-low members (DECOMPRESS-CAP-HARDENING W1)", () => {
  it("legit docx fixture still works through the routed reads", async () => {
    const buffer = Buffer.from(await makeDocx());
    expect(await extractDocxTitle(buffer)).toBe("Old");
    expect((await extractOfficeImages("docx", buffer))[0].id).toBe("d1");
    expect((await extractOfficeImageData("docx", buffer, "d1"))?.mimeType).toBe("image/png");
  });

  const cases: Array<[string, () => Promise<Uint8Array>, string, (b: Buffer) => Promise<unknown>]> = [
    ["appendDocxParagraph", makeDocx, "word/document.xml", (b) => appendDocxParagraph(b, [{ text: "x" }], "")],
    ["extractOfficeImages docx", makeDocx, "word/document.xml", (b) => extractOfficeImages("docx", b)],
    ["extractOfficeImages pptx", makePicPptx, "ppt/slides/slide1.xml", (b) => extractOfficeImages("pptx", b)],
    ["extractOfficeImageData docx document", makeDocx, "word/document.xml", (b) => extractOfficeImageData("docx", b, "d1")],
    ["extractOfficeImageData docx rels", makeDocx, "word/_rels/document.xml.rels", (b) => extractOfficeImageData("docx", b, "d1")],
    ["extractOfficeImageData docx image (base64)", makeDocx, "word/media/a.png", (b) => extractOfficeImageData("docx", b, "d1")],
    ["extractOfficeImageData pptx slide", makePicPptx, "ppt/slides/slide1.xml", (b) => extractOfficeImageData("pptx", b, "s0_4")],
    ["extractOfficeImageData pptx rels", makePicPptx, "ppt/slides/_rels/slide1.xml.rels", (b) => extractOfficeImageData("pptx", b, "s0_4")],
    ["setOfficeImageAlt docx", makeDocx, "word/document.xml", (b) => setOfficeImageAlt("docx", b, { d1: "alt" })],
    ["setOfficeImageAlt pptx", makePicPptx, "ppt/slides/slide1.xml", (b) => setOfficeImageAlt("pptx", b, { s0_4: "alt" })],
    ["extractDocxTitle", makeDocx, "docProps/core.xml", (b) => extractDocxTitle(b)],
    ["setDocxTitle", makeDocx, "docProps/core.xml", (b) => setDocxTitle(b, "New")],
  ];

  for (const [name, make, member, run] of cases) {
    it(`refuses a lie-low member in ${name}`, async () => {
      const buffer = await lieLow(make, member);
      await expect(run(buffer)).rejects.toBeInstanceOf(ZipCapError);
      await expect(run(buffer)).rejects.toThrow(ZIP_REFUSAL_PREFIX);
    });
  }

  it("refuses a lie-low [Content_Types].xml and _rels/.rels in setDocxTitle (missing core part branch)", async () => {
    for (const member of ["[Content_Types].xml", "_rels/.rels"]) {
      const zip = new JSZip();
      zip.file("word/document.xml", DOC_XML, { createFolders: false });
      zip.file("[Content_Types].xml", "<Types></Types>" + PAD, { createFolders: false });
      zip.file("_rels/.rels", "<Relationships></Relationships>" + PAD, { createFolders: false });
      const archive = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
      patchDeclaredSize(archive, member, 5);
      await expect(setDocxTitle(Buffer.from(archive), "T")).rejects.toBeInstanceOf(ZipCapError);
    }
  });

  // Happy-path preservation: the routed reads return the same bytes/behavior as
  // before the bounded reader, so the outputs below must reflect real content.
  async function entryText(out: Buffer, name: string): Promise<string> {
    const file = (await JSZip.loadAsync(out)).file(name);
    if (!file) throw new Error(`missing ${name}`);
    return file.async("string");
  }

  async function makeBareDocx(): Promise<Uint8Array> {
    const zip = new JSZip();
    zip.file("word/document.xml", DOC_XML, { createFolders: false });
    zip.file("[Content_Types].xml", "<Types></Types>", { createFolders: false });
    zip.file("_rels/.rels", "<Relationships></Relationships>", { createFolders: false });
    return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  }

  it("appendDocxParagraph appends the new run to the document body", async () => {
    const out = await appendDocxParagraph(Buffer.from(await makeDocx()), [{ text: "NewPara" }], "");
    const xml = await entryText(out, "word/document.xml");
    expect(xml).toContain('<w:t xml:space="preserve">NewPara</w:t>');
    expect(xml).toContain("Hi");
  });

  it("setOfficeImageAlt writes descr on a docx image", async () => {
    const out = await setOfficeImageAlt("docx", Buffer.from(await makeDocx()), { d1: "alt" });
    const xml = await entryText(out, "word/document.xml");
    expect(xml).toContain('descr="alt"');
    expect(xml).not.toContain('descr=""');
  });

  it("setOfficeImageAlt writes descr on a pptx image", async () => {
    const out = await setOfficeImageAlt("pptx", Buffer.from(await makePicPptx()), { s0_4: "alt" });
    const xml = await entryText(out, "ppt/slides/slide1.xml");
    expect(xml).toContain('descr="alt"');
    expect(xml).not.toContain('descr=""');
  });

  it("setDocxTitle replaces the title in an existing core.xml", async () => {
    const out = await setDocxTitle(Buffer.from(await makeDocx()), "Fresh");
    const core = await entryText(out, "docProps/core.xml");
    expect(core).toContain("<dc:title>Fresh</dc:title>");
    expect(core).not.toContain("Old");
  });

  it("setDocxTitle creates core.xml and registers it when the part is missing", async () => {
    const out = await setDocxTitle(Buffer.from(await makeBareDocx()), "Made");
    expect(await entryText(out, "docProps/core.xml")).toContain("<dc:title>Made</dc:title>");
    expect(await entryText(out, "[Content_Types].xml")).toContain('<Override PartName="/docProps/core.xml"');
    const rels = await entryText(out, "_rels/.rels");
    expect(rels).toContain('Id="rIdCoreProps"');
    expect(rels).toContain('Target="docProps/core.xml"');
  });

  it("extractDocxTitle returns an empty string when core.xml is absent", async () => {
    expect(await extractDocxTitle(Buffer.from(await makeBareDocx()))).toBe("");
  });

  it("extractOfficeImageData returns null when the docx has no rels member", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", DOC_XML, { createFolders: false });
    zip.file("word/media/a.png", "x".repeat(300), { createFolders: false });
    const buffer = Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
    expect(await extractOfficeImageData("docx", buffer, "d1")).toBeNull();
  });

  // Census guard: no raw member decompress remains in the file, and in each
  // routed function the bounded read comes after openOfficeZip + the budget and
  // BEFORE any parse of the content (a call placed after the parse, or only in
  // a dead branch, fails the order check).
  it("census: no raw decompress remains, and each routed function reads bounded before parsing", () => {
    const src = readFileSync(new URL("./office-edit.ts", import.meta.url), "utf-8");
    expect(src.match(/\.async\(/g) ?? []).toEqual([]);
    const fns: Array<[string, RegExp]> = [
      ["appendDocxParagraph", /let xml = await readXmlMember\(file, budget\)/],
      ["extractOfficeImages", /await readXmlMember\(file, budget\)/],
      ["extractOfficeImageData", /readBase64Member\(file, budget\)/],
      ["setOfficeImageAlt", /await readXmlMember\(file, budget\)/],
      ["extractDocxTitle", /await readXmlAt\(zip, "docProps\/core\.xml", budget\)/],
      ["setDocxTitle", /await readXmlAt\(zip, CORE_PROPS, budget\)/],
    ];
    for (const [fn, bounded] of fns) {
      const start = src.indexOf(`export async function ${fn}(`);
      expect(start, fn).toBeGreaterThan(-1);
      const next = src.indexOf("\nexport ", start + 10);
      const body = src.slice(start, next < 0 ? undefined : next);
      const open = body.indexOf("await openOfficeZip(buffer)");
      const budgetAt = body.indexOf("createZipBudget()");
      const read = body.search(bounded);
      const parse = body.search(/\.matchAll\(|\.replace\(|\.match\(/);
      expect(open, `${fn} opens`).toBeGreaterThan(-1);
      expect(budgetAt, `${fn} budget after open`).toBeGreaterThan(open);
      expect(read, `${fn} bounded read after budget`).toBeGreaterThan(budgetAt);
      expect(parse === -1 || read < parse, `${fn} reads before parsing`).toBe(true);
    }
  });
});
