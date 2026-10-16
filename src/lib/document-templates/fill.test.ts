import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildDocumentTemplate, fillDocumentTemplate } from "./fill";
import { parseOfficeParagraphs } from "@/lib/office-edit";
const definition = { version: 1 as const, fields: [{ key: "course", label: "Course" }], replacements: [{ id: "p0", text: "Course: {{course}}" }] };
async function fixture() {
  const zip = new JSZip();
  zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Course: Alpha</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Keep policy exactly</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Keep table paragraph</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>');
  zip.file("word/_rels/document.xml.rels", '<Relationships><Relationship Id="rImage" Target="media/image.png"/></Relationships>');
  zip.file("word/media/image.png", new Uint8Array([1, 2, 3, 4]));
  zip.file("[Content_Types].xml", '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  return zip.generateAsync({ type: "nodebuffer" });
}
describe("preserving document reuse", () => {
  it("reparses unfilled and literal filled DOCX, retaining unrelated paragraphs, styles, table, media, relationships and source", async () => {
    const source = await fixture(); const original = Buffer.from(source); const template = await buildDocumentTemplate(source, definition);
    const unfilled = Buffer.from(template.templateBase64, "base64"); expect((await parseOfficeParagraphs("docx", unfilled)).map((p) => p.text)).toEqual(["Course: {{course}}", "Keep policy exactly", "Keep table paragraph"]);
    const filled = Buffer.from(await fillDocumentTemplate(source, definition, { course: "$& <script>literal</script>" }), "base64");
    expect((await parseOfficeParagraphs("docx", filled)).map((p) => p.text)).toEqual(["Course: $& <script>literal</script>", "Keep policy exactly", "Keep table paragraph"]);
    const a = await JSZip.loadAsync(source); const b = await JSZip.loadAsync(filled);
    for (const key of ["word/_rels/document.xml.rels", "word/media/image.png", "[Content_Types].xml"]) expect(await b.file(key)!.async("uint8array")).toEqual(await a.file(key)!.async("uint8array"));
    const xml = await b.file("word/document.xml")!.async("string"); expect(xml).toContain('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Keep policy exactly</w:t></w:r></w:p>'); expect(xml).toContain("<w:tbl>"); expect(source.equals(original)).toBe(true);
  });
  it("refuses missing/foreign/oversize values and foreign replacements", async () => {
    const source = await fixture();
    for (const values of [{}, { course: "" }, { course: "x", extra: "y" }, { course: "x".repeat(4001) }]) await expect(fillDocumentTemplate(source, definition, values)).rejects.toThrow();
    await expect(buildDocumentTemplate(source, { ...definition, replacements: [{ id: "foreign", text: "{{course}}" }] })).rejects.toThrow();
  });
});


describe("round-two literal XML-safe fill", () => {
  it.each(["\u0000", "\u0001", "\u000b", "\ufffe", "\uffff", "\ud800", "\udfff"])("refuses XML-incompatible field %j before output", async (character) => {
    await expect(fillDocumentTemplate(await fixture(), definition, { course: "Alpha" + character + "Beta" })).rejects.toMatchObject({ code: "invalid_values" });
  });
  it("preserves valid Unicode, dollar/markup and XML whitespace literally in reparsed output", async () => {
    const value = "café 漢字 \ud801\udc00 $& <b>literal</b>\tline\nnext";
    const output = await fillDocumentTemplate(await fixture(), definition, { course: value });
    expect((await parseOfficeParagraphs("docx", Buffer.from(output, "base64")))[0].text).toBe("Course: " + value);
  });
});

