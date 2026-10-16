import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { inventorySlides, decodeSource } from "./inventory";
import { UPLOAD_WIRE_BUDGET_BYTES } from "@/lib/upload-budget";
export async function pptFixture(texts = ["Title", "Divider", "Body", ""]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' + texts.map((_, i) => '<Override PartName="/ppt/slides/slide' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>').join("") + '</Types>');
  zip.file("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="root" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>');
  const order = texts.map((_, i) => texts.length - i);
  zip.file("ppt/presentation.xml", '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>' + order.map(i => '<p:sldId id="' + (255 + i) + '" r:id="r' + i + '"/>').join("") + '</p:sldIdLst></p:presentation>');
  zip.file("ppt/_rels/presentation.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + texts.map((_, i) => '<Relationship Id="r' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide' + (i + 1) + '.xml"/>').join("") + '</Relationships>');
  texts.forEach((text, i) => zip.file('ppt/slides/slide' + (i + 1) + '.xml', '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>' + (text ? '<p:sp><p:txBody><a:p><a:r><a:t>' + text + '</a:t></a:r></a:p></p:txBody></p:sp>' : "") + '</p:spTree></p:cSld></p:sld>'));
  return zip.generateAsync({ type: "nodebuffer" });
}
describe("PowerPoint original inventory", () => {
  it("uses actual presentation order and retains textless slides", async () => {
    const bytes = await pptFixture();
    const original = Buffer.from(bytes);
    const inventory = await inventorySlides(bytes);
    expect(inventory.map(s => [s.id, s.ordinal, s.text])).toEqual([
      ["ppt/slides/slide4.xml", 1, ""], ["ppt/slides/slide3.xml", 2, "Body"],
      ["ppt/slides/slide2.xml", 3, "Divider"], ["ppt/slides/slide1.xml", 4, "Title"],
    ]);
    expect(bytes.equals(original)).toBe(true);
  });
  it("decodes source entities without interpreting HTML", async () => {
    expect((await inventorySlides(await pptFixture(["&lt;script&gt;&#x1F600;&amp;"])))[0].text).toBe("<script>" + String.fromCodePoint(0x1f600) + "&");
  });
  it("refuses missing, duplicate and external relationships", async () => {
    for (const mutate of [
      (s: string) => s.replace('r:id="r1"', 'r:id="foreign"'),
      (s: string) => s.replace('r:id="r1"', 'r:id="r2"'),
    ]) {
      const zip = await JSZip.loadAsync(await pptFixture());
      zip.file("ppt/presentation.xml", mutate(await zip.file("ppt/presentation.xml")!.async("string")));
      await expect(inventorySlides(await zip.generateAsync({ type: "nodebuffer" }))).rejects.toMatchObject({ code: "PPT_INVALID" });
    }
    const zip = await JSZip.loadAsync(await pptFixture());
    zip.file("ppt/_rels/presentation.xml.rels", (await zip.file("ppt/_rels/presentation.xml.rels")!.async("string")).replace('Id="r1"', 'TargetMode="External" Id="r1"'));
    await expect(inventorySlides(await zip.generateAsync({ type: "nodebuffer" }))).rejects.toMatchObject({ code: "PPT_INVALID" });
  });
  it("rejects excess slides/text rather than truncating", async () => {
    await expect(inventorySlides(await pptFixture(Array(81).fill("x")))).rejects.toMatchObject({ code: "PPT_LIMIT" });
    await expect(inventorySlides(await pptFixture(["x".repeat(24001)]))).rejects.toMatchObject({ code: "PPT_LIMIT" });
    expect((await inventorySlides(await pptFixture(["x".repeat(24000)])))[0].text).toHaveLength(24000);
  });
  it("rejects corrupt, wrong-signature, macro and DTD packages", async () => {
    await expect(inventorySlides(Buffer.from("not pptx"))).rejects.toMatchObject({ code: "PPT_INVALID" });
    const bytes = await pptFixture();
    for (const value of [
      '<Types><Override PartName="/word/document.xml" ContentType="wordprocessingml"/></Types>',
      '<Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml"/></Types>',
    ]) {
      const zip = await JSZip.loadAsync(bytes); zip.file("[Content_Types].xml", value);
      await expect(inventorySlides(await zip.generateAsync({ type: "nodebuffer" }))).rejects.toMatchObject({ code: "PPT_INVALID" });
    }
    const zip = await JSZip.loadAsync(bytes);
    zip.file("ppt/presentation.xml", '<!DOCTYPE evil>' + await zip.file("ppt/presentation.xml")!.async("string"));
    await expect(inventorySlides(await zip.generateAsync({ type: "nodebuffer" }))).rejects.toMatchObject({ code: "PPT_INVALID" });
  });
  it("strictly validates canonical base64 and wire budgets before decoding", () => {
    for (const invalid of ["", "a===", "abcd\n", "!!!!", "YR==", null]) expect(() => decodeSource(invalid)).toThrow();
    expect(decodeSource("YQ==").toString()).toBe("a");
    expect(() => decodeSource("AAAA".repeat(Math.ceil(UPLOAD_WIRE_BUDGET_BYTES / 4) + 1))).toThrow("PPT_LIMIT");
  });
});

it("refuses containers over existing ZIP caps before slide member reads", async () => {
  const zip = await JSZip.loadAsync(await pptFixture());
  for (let i = 0; i < 2001; i++) zip.file("extra/" + i + ".xml", "");
  await expect(inventorySlides(await zip.generateAsync({ type: "nodebuffer" }))).rejects.toMatchObject({ code: "PPT_LIMIT" });
});
describe("well-formed consumed OOXML boundary", () => {
  it("keeps the valid package control, including comments and XML declarations", async () => {
    const zip = await JSZip.loadAsync(await pptFixture());
    const member = "ppt/presentation.xml";
    zip.file(member, '<?xml version="1.0" encoding="UTF-8"?><!-- valid metadata -->' + await zip.file(member)!.async("string"));
    expect((await inventorySlides(await zip.generateAsync({ type: "nodebuffer" }))).map(slide => slide.text)).toEqual(["", "Body", "Divider", "Title"]);
  });
  it.each([
    ["ppt/presentation.xml", "</p:presentation>", ""],
    ["ppt/slides/slide1.xml", "</p:cSld>", ""],
    ["ppt/slides/slide1.xml", "</a:r>", "</a:broken>"],
    ["ppt/_rels/presentation.xml.rels", "</Relationships>", ""],
    ["[Content_Types].xml", "</Types>", ""],
    ["ppt/slides/slide1.xml", "Title", "Title &undefined;"],
    ["ppt/presentation.xml", 'id="256"', 'id="256" id="257"'],
  ])("refuses malformed %s before accepting inventory (%s)", async (member, before, after) => {
    const zip = await JSZip.loadAsync(await pptFixture());
    const xml = await zip.file(member)!.async("string");
    expect(xml).toContain(before);
    zip.file(member, xml.replace(before, after));
    await expect(inventorySlides(await zip.generateAsync({ type: "nodebuffer" }))).rejects.toMatchObject({ code: "PPT_INVALID" });
  });
});
