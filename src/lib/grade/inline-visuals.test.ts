import JSZip from "jszip";
import { describe, it, expect } from "vitest";
import { collectInlineVisualParts, type InlineVisualPart } from "./inline-visuals";
import type { SubmittedFileInfo } from "./types";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function file(overrides: Partial<SubmittedFileInfo>): SubmittedFileInfo {
  return {
    name: "f",
    extension: "",
    previewContent: "",
    previewTruncated: false,
    ...overrides,
  };
}

const IMG_BYTES = Buffer.from([1, 2, 3, 4, 5]);

async function docxWithImage(ext: string): Promise<string> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<w:document><w:body><w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Pic" descr="shot"/>` +
      `<a:graphic><a:blip r:embed="rId5"/></a:graphic></wp:inline></w:drawing></w:r></w:p></w:body></w:document>`
  );
  zip.file(
    "word/_rels/document.xml.rels",
    `<Relationships><Relationship Id="rId5" Type="image" Target="media/image1.${ext}"/></Relationships>`
  );
  zip.file(`word/media/image1.${ext}`, IMG_BYTES);
  return Buffer.from(await zip.generateAsync({ type: "uint8array" })).toString("base64");
}

async function pptxWithJpeg(): Promise<string> {
  const zip = new JSZip();
  zip.file(
    "ppt/slides/slide1.xml",
    `<p:sld><p:cSld><p:spTree><p:pic><p:nvPicPr><p:cNvPr id="4" name="Shot" descr="x"/></p:nvPicPr>` +
      `<p:blipFill><a:blip r:embed="rId2"/></p:blipFill></p:pic></p:spTree></p:cSld></p:sld>`
  );
  zip.file(
    "ppt/slides/_rels/slide1.xml.rels",
    `<Relationships><Relationship Id="rId2" Type="image" Target="../media/image1.jpeg"/></Relationships>`
  );
  zip.file("ppt/media/image1.jpeg", IMG_BYTES);
  zip.file("ppt/presentation.xml", `<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<Relationships><Relationship Id="rId1" Type="slide" Target="slides/slide1.xml"/></Relationships>`
  );
  return Buffer.from(await zip.generateAsync({ type: "uint8array" })).toString("base64");
}

describe("collectInlineVisualParts (wave 1a)", () => {
  it("includes a pdf and an image that carry bytes", async () => {
    const parts = await collectInlineVisualParts([
      file({ name: "a.pdf", mimeType: "application/pdf", rawBase64: "PDFB64" }),
      file({ name: "b.png", mimeType: "image/png", rawBase64: "PNGB64" }),
    ]);
    expect(parts).toEqual([
      { name: "a.pdf", base64: "PDFB64", mimeType: "application/pdf" },
      { name: "b.png", base64: "PNGB64", mimeType: "image/png" },
    ]);
  });

  it("omits non-visual files (txt)", async () => {
    const parts = await collectInlineVisualParts([file({ name: "n.txt", mimeType: "text/plain", rawBase64: "X" })]);
    expect(parts).toEqual([]);
  });

  it("omits a file with no rawBase64 or no mime type", async () => {
    const parts = await collectInlineVisualParts([
      file({ name: "a.pdf", mimeType: "application/pdf" }),
      file({ name: "b.png", rawBase64: "PNGB64" }),
    ]);
    expect(parts).toEqual([]);
  });
});

describe("collectInlineVisualParts (wave 1b office images)", () => {
  it("emits an image part for a docx carrying a PNG", async () => {
    const parts: InlineVisualPart[] = await collectInlineVisualParts([
      file({ name: "r.docx", mimeType: DOCX_MIME, rawBase64: await docxWithImage("png") }),
    ]);
    expect(parts).toHaveLength(1);
    expect(parts[0].mimeType).toBe("image/png");
    expect(parts[0].base64).toBe(IMG_BYTES.toString("base64"));
    expect(parts[0].name).toContain("r.docx");
  });

  it("emits an image part for a pptx carrying a JPEG", async () => {
    const parts = await collectInlineVisualParts([
      file({ name: "s.pptx", mimeType: PPTX_MIME, rawBase64: await pptxWithJpeg() }),
    ]);
    expect(parts).toHaveLength(1);
    expect(parts[0].mimeType).toBe("image/jpeg");
    expect(parts[0].base64).toBe(IMG_BYTES.toString("base64"));
  });

  it("a corrupt docx never throws, yields no parts, and leaves other files unaffected", async () => {
    const parts = await collectInlineVisualParts([
      file({ name: "bad.docx", mimeType: DOCX_MIME, rawBase64: Buffer.from("not a zip at all").toString("base64") }),
      file({ name: "b.png", mimeType: "image/png", rawBase64: "PNGB64" }),
      file({ name: "good.docx", mimeType: DOCX_MIME, rawBase64: await docxWithImage("png") }),
    ]);
    expect(parts.map((p) => p.name)).toEqual([
      "b.png",
      expect.stringContaining("good.docx"),
    ]);
  });

  it("KNOWN GAP (RES-VIS-6): a docx whose only image is EMF yields no parts", async () => {
    const parts = await collectInlineVisualParts([
      file({ name: "emf.docx", mimeType: DOCX_MIME, rawBase64: await docxWithImage("emf") }),
    ]);
    expect(parts).toEqual([]);
  });
});
