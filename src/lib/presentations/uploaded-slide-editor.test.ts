import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { applyUploadedSlideReplacements, decodeUploadedPptx, inspectUploadedPptx, UploadedSlideEditorError } from "./uploaded-slide-editor";

function paragraph(text: string): string {
  return `<a:p><a:r><a:rPr/><a:t>${text}</a:t></a:r></a:p>`;
}

function slideMarkup(markup: string): string {
  return `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>${markup}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
}

function slide(text: string): string {
  return slideMarkup(paragraph(text));
}

async function fixture(slideXmls = [slide("First slide"), slide("Second slide")], order = [1, 2]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`);
  zip.file("ppt/presentation.xml", `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${order.map((number, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join("")}</p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${order.map((number, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${number}.xml"/>`).join("")}</Relationships>`);
  slideXmls.forEach((xml, index) => zip.file(`ppt/slides/slide${index + 1}.xml`, xml));
  zip.file("ppt/slides/_rels/slide2.xml.rels", "<Relationships><Relationship Id=\"rId1\" Target=\"../media/image2.png\"/></Relationships>");
  zip.file("ppt/notesSlides/notesSlide2.xml", "<notes>speaker notes</notes>");
  zip.file("ppt/media/image2.png", Buffer.from([0, 1, 2, 3]));
  zip.file("ppt/slideMasters/slideMaster1.xml", "<master>master data</master>");
  zip.file("ppt/slideLayouts/slideLayout1.xml", "<layout>layout data</layout>");
  zip.file("ppt/theme/theme1.xml", "<theme>theme data</theme>");
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

describe("uploaded slide editor", () => {
  it("maps presentation order and applies successive edits to one slide at a time", async () => {
    const original = await fixture();
    const slides = await inspectUploadedPptx(original);
    expect(slides.map((item) => item.title)).toEqual(["First slide", "Second slide"]);

    await expect(applyUploadedSlideReplacements(original, 1, [{ id: "s1_p0", text: "Wrong slide" }]))
      .rejects.toBeInstanceOf(UploadedSlideEditorError);
    const firstEdit = await applyUploadedSlideReplacements(original, 1, [{ id: "s0_p0", text: "First revised" }]);
    expect(firstEdit.slides.map((item) => item.paragraphs[0]?.text)).toEqual(["First revised", "Second slide"]);
    const firstZip = await JSZip.loadAsync(firstEdit.bytes);
    const originalZip = await JSZip.loadAsync(original);
    expect(await firstZip.file("ppt/slides/slide2.xml")?.async("string"))
      .toBe(await originalZip.file("ppt/slides/slide2.xml")?.async("string"));
    const originalMembers = Object.keys(originalZip.files).filter((name) => !originalZip.files[name].dir).sort();
    expect(Object.keys(firstZip.files).filter((name) => !firstZip.files[name].dir).sort()).toEqual(originalMembers);
    for (const name of originalMembers.filter((member) => member !== "ppt/slides/slide1.xml")) {
      expect(await firstZip.file(name)?.async("nodebuffer")).toEqual(await originalZip.file(name)?.async("nodebuffer"));
    }
    const secondEdit = await applyUploadedSlideReplacements(firstEdit.bytes, 2, [{ id: "s1_p0", text: "Second revised" }]);
    expect(secondEdit.slides.map((item) => item.paragraphs[0]?.text)).toEqual(["First revised", "Second revised"]);

    const after = await JSZip.loadAsync(secondEdit.bytes);
    expect(await after.file("ppt/slides/slide1.xml")?.async("string"))
      .toBe(await firstZip.file("ppt/slides/slide1.xml")?.async("string"));
    expect(await after.file("ppt/slides/slide2.xml")?.async("string"))
      .not.toBe(await firstZip.file("ppt/slides/slide2.xml")?.async("string"));
    for (const name of originalMembers.filter((member) => member !== "ppt/slides/slide2.xml")) {
      expect(await after.file(name)?.async("nodebuffer")).toEqual(await firstZip.file(name)?.async("nodebuffer"));
    }
  });

  it("rejects an invalid base64 payload instead of interpreting it as an empty presentation", () => {
    expect(() => decodeUploadedPptx("not-a-pptx")).toThrow(UploadedSlideEditorError);
  });

  it("fails closed when relationship order does not match the paragraph editor's member order", async () => {
    await expect(inspectUploadedPptx(await fixture(undefined, [2, 1])))
      .rejects.toMatchObject({ code: "slide_order" });
  });

  it.each([
    ["slide count", Array.from({ length: 81 }, (_, index) => slide(`Slide ${index + 1}`)), Array.from({ length: 81 }, (_, index) => index + 1)],
    ["text count", [slide("x".repeat(24_001))], [1]],
  ])("reports an explicit limit error for an over-budget %s", async (_label, slides, order) => {
    await expect(inspectUploadedPptx(await fixture(slides, order))).rejects.toMatchObject({ code: "slide_limit" });
  });

  it("keeps field paragraphs visible but read-only and refuses to rewrite them", async () => {
    const field = `<a:p><a:fld id="field-1" type="slidenum"><a:rPr/><a:t>7</a:t></a:fld></a:p>`;
    const bytes = await fixture([slideMarkup(field)], [1]);
    const slides = await inspectUploadedPptx(bytes);
    expect(slides[0].paragraphs[0]).toMatchObject({ text: "7", editable: false });
    await expect(applyUploadedSlideReplacements(bytes, 1, [{ id: "s0_p0", text: "8" }]))
      .rejects.toMatchObject({ code: "slide_text" });
  });

  it.each([
    ["break", `<a:p><a:r><a:rPr/><a:t>before</a:t></a:r><a:br/><a:r><a:rPr/><a:t>after</a:t></a:r></a:p>`],
    ["tab", `<a:p><a:r><a:rPr/><a:t>before</a:t></a:r><a:tab/><a:r><a:rPr/><a:t>after</a:t></a:r></a:p>`],
    ["text outside run", `<a:p><a:r><a:rPr/><a:t>inside</a:t></a:r><a:t>outside</a:t></a:p>`],
  ])("marks paragraphs containing a %s unsupported structure as read-only", async (_kind, unsupported) => {
    const slides = await inspectUploadedPptx(await fixture([slideMarkup(unsupported)], [1]));
    expect(slides[0].paragraphs[0]?.editable).toBe(false);
  });

  it("refuses an empty replacement because the parser would otherwise remove that paragraph from the editor", async () => {
    await expect(applyUploadedSlideReplacements(await fixture(), 1, [{ id: "s0_p0", text: " " }]))
      .rejects.toMatchObject({ code: "slide_text" });
  });
});
